-- Eltern Flow AI: Calendar (events + recurring + exceptions)
-- Spec: docs/superpowers/specs/2026-05-29-supabase-schema-design.md (Section 4.3)

-- ── Enums ───────────────────────────────────────────────────────────────────

drop type if exists public.rrule_freq_enum cascade;
create type public.rrule_freq_enum as enum ('daily','weekly','monthly','yearly');

drop type if exists public.event_exception_action_enum cascade;
create type public.event_exception_action_enum as enum ('cancelled','modified');

-- ── events ──────────────────────────────────────────────────────────────────

drop table if exists public.events cascade;

create table public.events (
  id               uuid primary key default gen_random_uuid(),
  family_id        uuid not null references public.families(id) on delete cascade,
  type_id          uuid not null references public.event_types(id) on delete restrict,
  child_id         uuid references public.children(id) on delete set null,

  title            text not null,
  description      text,
  location         text,
  start_at         timestamptz not null,
  end_at           timestamptz not null,
  all_day          boolean not null default false,

  rrule_freq       public.rrule_freq_enum,
  rrule_interval   int not null default 1,
  rrule_byweekday  int[],
  rrule_until      timestamptz,
  rrule_count      int,

  created_by       uuid references public.parents(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint events_end_after_start check (end_at >= start_at),
  constraint events_rrule_count_xor_until check ((rrule_count is null) or (rrule_until is null))
);

comment on table public.events is 'Calendar events. Single-occurrence when all rrule_* cols are NULL; recurring when rrule_freq is set. Exceptions are stored in event_exceptions.';

-- Column-level documentation for the non-obvious RRULE-related columns
comment on column public.events.rrule_freq      is 'iCal RFC 5545 FREQ. NULL = single occurrence event.';
comment on column public.events.rrule_interval  is 'iCal INTERVAL. e.g. with freq=weekly and interval=2 → every 2 weeks.';
comment on column public.events.rrule_byweekday is 'iCal BYDAY as ISO weekday ints (1=Mon … 7=Sun). NULL = no day filter.';
comment on column public.events.rrule_until     is 'iCal UNTIL. End-bound for recurrence. Mutually exclusive with rrule_count.';
comment on column public.events.rrule_count     is 'iCal COUNT. Max number of occurrences. Mutually exclusive with rrule_until.';

create index events_family_start_idx on public.events(family_id, start_at);
create index events_child_id_idx on public.events(child_id) where child_id is not null;

alter table public.events enable row level security;
alter table public.events force row level security;

drop policy if exists "events: select own family" on public.events;
create policy "events: select own family"
  on public.events for select
  to authenticated
  using ( family_id = public.current_family_id() );

drop policy if exists "events: insert own family" on public.events;
create policy "events: insert own family"
  on public.events for insert
  to authenticated
  with check ( family_id = public.current_family_id() );

drop policy if exists "events: update own family" on public.events;
create policy "events: update own family"
  on public.events for update
  to authenticated
  using ( family_id = public.current_family_id() )
  with check ( family_id = public.current_family_id() );

drop policy if exists "events: delete own family" on public.events;
create policy "events: delete own family"
  on public.events for delete
  to authenticated
  using ( family_id = public.current_family_id() );

-- ── event_exceptions ────────────────────────────────────────────────────────

drop table if exists public.event_exceptions cascade;

create table public.event_exceptions (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references public.events(id) on delete cascade,
  occurrence_date  date not null,
  action           public.event_exception_action_enum not null,
  override         jsonb,
  created_at       timestamptz not null default now(),

  unique (event_id, occurrence_date)
);

comment on table public.event_exceptions is 'Per-occurrence overrides for recurring events. action=cancelled removes the occurrence; action=modified applies override jsonb (title, start_at, end_at, location).';

comment on column public.event_exceptions.override is
  'JSON patch applied when action=modified. Recognised keys: title, description, start_at, end_at, location.';

alter table public.event_exceptions enable row level security;
alter table public.event_exceptions force row level security;

drop policy if exists "event_exceptions: select via event" on public.event_exceptions;
create policy "event_exceptions: select via event"
  on public.event_exceptions for select
  to authenticated
  using (
    exists (
      select 1 from public.events
      where public.events.id = public.event_exceptions.event_id
        and public.events.family_id = public.current_family_id()
    )
  );

drop policy if exists "event_exceptions: insert via event" on public.event_exceptions;
create policy "event_exceptions: insert via event"
  on public.event_exceptions for insert
  to authenticated
  with check (
    exists (
      select 1 from public.events
      where public.events.id = public.event_exceptions.event_id
        and public.events.family_id = public.current_family_id()
    )
  );

drop policy if exists "event_exceptions: update via event" on public.event_exceptions;
create policy "event_exceptions: update via event"
  on public.event_exceptions for update
  to authenticated
  using (
    exists (
      select 1 from public.events
      where public.events.id = public.event_exceptions.event_id
        and public.events.family_id = public.current_family_id()
    )
  )
  with check (
    exists (
      select 1 from public.events
      where public.events.id = public.event_exceptions.event_id
        and public.events.family_id = public.current_family_id()
    )
  );

drop policy if exists "event_exceptions: delete via event" on public.event_exceptions;
create policy "event_exceptions: delete via event"
  on public.event_exceptions for delete
  to authenticated
  using (
    exists (
      select 1 from public.events
      where public.events.id = public.event_exceptions.event_id
        and public.events.family_id = public.current_family_id()
    )
  );
