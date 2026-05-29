-- Eltern Flow AI: Reminders (n:1 to events/tasks, denormalized family_id for RLS perf)
-- Spec: docs/superpowers/specs/2026-05-29-supabase-schema-design.md (Section 4.5)
-- Plan: docs/superpowers/plans/2026-05-29-supabase-schema-implementation.md (Section F)

drop table if exists public.reminders cascade;

create table public.reminders (
  id                    uuid primary key default gen_random_uuid(),
  family_id             uuid not null references public.families(id) on delete cascade,
  event_id              uuid references public.events(id) on delete cascade,
  task_id               uuid references public.tasks(id) on delete cascade,
  offset_minutes        int not null,
  recipient_parent_id   uuid references public.parents(id) on delete cascade,
  sent_at               timestamptz,
  created_at            timestamptz not null default now(),

  constraint reminders_event_xor_task check ((event_id is not null) <> (task_id is not null))
);

comment on table public.reminders is 'Push-reminder records for events or tasks. Populated by the client; sent_at is stamped by the future pg_cron + Edge Function worker.';
comment on column public.reminders.offset_minutes is 'How many minutes before the event/task due time to fire. E.g. 1440 = 1 day, 120 = 2 hours.';
comment on column public.reminders.recipient_parent_id is 'If NULL, the reminder goes to all parents in the family. If set, only that parent receives it.';
comment on column public.reminders.sent_at is 'Populated by the cron worker after the push notification is delivered. NULL = pending. Used for idempotency.';

-- Partial index for the cron-worker pickup: only unsent reminders need scanning
create index reminders_pending_idx on public.reminders(family_id) where sent_at is null;

-- ---------------------------------------------------------------------------
-- Trigger: auto-populate family_id from the referenced event or task
-- SECURITY INVOKER: runs with caller's rights — caller already has SELECT on
-- events/tasks for their own family via RLS, so no privilege escalation needed.
-- search_path='': prevent search_path injection.
-- ---------------------------------------------------------------------------
drop function if exists public.set_reminder_family_id() cascade;

create function public.set_reminder_family_id()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.event_id is not null then
    select family_id into new.family_id from public.events where id = new.event_id;
  else
    select family_id into new.family_id from public.tasks where id = new.task_id;
  end if;
  return new;
end;
$$;

comment on function public.set_reminder_family_id() is 'BEFORE INSERT trigger on reminders: denormalizes family_id from the referenced event or task so RLS can use the direct column (fast) rather than a subquery join.';

drop trigger if exists reminders_set_family_id on public.reminders;
create trigger reminders_set_family_id
  before insert on public.reminders
  for each row execute function public.set_reminder_family_id();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.reminders enable row level security;
alter table public.reminders force row level security;

-- SELECT: direct family_id check (fast — column is denormalized for exactly this)
drop policy if exists "reminders: select own family" on public.reminders;
create policy "reminders: select own family"
  on public.reminders for select
  to authenticated
  using ( family_id = public.current_family_id() );

-- INSERT: defensive subquery check — trigger sets family_id BEFORE this WITH CHECK
-- runs, but we verify via event/task ownership so clients can omit family_id entirely.
drop policy if exists "reminders: insert own family" on public.reminders;
create policy "reminders: insert own family"
  on public.reminders for insert
  to authenticated
  with check (
    (event_id is not null and event_id in (
      select id from public.events where family_id = public.current_family_id()
    ))
    or
    (task_id is not null and task_id in (
      select id from public.tasks where family_id = public.current_family_id()
    ))
  );

-- UPDATE: use denormalized family_id directly (no subquery needed)
drop policy if exists "reminders: update own family" on public.reminders;
create policy "reminders: update own family"
  on public.reminders for update
  to authenticated
  using ( family_id = public.current_family_id() )
  with check ( family_id = public.current_family_id() );

-- DELETE: same direct check
drop policy if exists "reminders: delete own family" on public.reminders;
create policy "reminders: delete own family"
  on public.reminders for delete
  to authenticated
  using ( family_id = public.current_family_id() );
