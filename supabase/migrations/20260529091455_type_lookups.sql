-- Eltern Flow AI: Type lookups (event_types, task_types) + system defaults
-- Spec: docs/superpowers/specs/2026-05-29-supabase-schema-design.md (Section 4.2)

-- C1: event_types table + indexes + RLS

drop table if exists public.event_types cascade;

create table public.event_types (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null,
  label       jsonb not null,
  icon        text not null,
  color       text not null,
  family_id   uuid references public.families(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create unique index event_types_global_slug_idx on public.event_types(slug) where family_id is null;
create unique index event_types_family_slug_idx on public.event_types(slug, family_id) where family_id is not null;
create index event_types_family_id_idx on public.event_types(family_id);

alter table public.event_types enable row level security;
alter table public.event_types force row level security;

-- SELECT: system defaults (NULL) OR own custom types
drop policy if exists "event_types: select global or own" on public.event_types;
create policy "event_types: select global or own"
  on public.event_types for select
  to authenticated
  using ( family_id is null or family_id = public.current_family_id() );

-- INSERT/UPDATE/DELETE: only own custom
drop policy if exists "event_types: insert own" on public.event_types;
create policy "event_types: insert own"
  on public.event_types for insert
  to authenticated
  with check ( family_id = public.current_family_id() );

drop policy if exists "event_types: update own" on public.event_types;
create policy "event_types: update own"
  on public.event_types for update
  to authenticated
  using ( family_id = public.current_family_id() )
  with check ( family_id = public.current_family_id() );

drop policy if exists "event_types: delete own" on public.event_types;
create policy "event_types: delete own"
  on public.event_types for delete
  to authenticated
  using ( family_id = public.current_family_id() );

-- C2: task_types table (identical structure to event_types) + indexes + RLS

drop table if exists public.task_types cascade;

create table public.task_types (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null,
  label       jsonb not null,
  icon        text not null,
  color       text not null,
  family_id   uuid references public.families(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create unique index task_types_global_slug_idx on public.task_types(slug) where family_id is null;
create unique index task_types_family_slug_idx on public.task_types(slug, family_id) where family_id is not null;
create index task_types_family_id_idx on public.task_types(family_id);

alter table public.task_types enable row level security;
alter table public.task_types force row level security;

drop policy if exists "task_types: select global or own" on public.task_types;
create policy "task_types: select global or own"
  on public.task_types for select
  to authenticated
  using ( family_id is null or family_id = public.current_family_id() );

drop policy if exists "task_types: insert own" on public.task_types;
create policy "task_types: insert own"
  on public.task_types for insert
  to authenticated
  with check ( family_id = public.current_family_id() );

drop policy if exists "task_types: update own" on public.task_types;
create policy "task_types: update own"
  on public.task_types for update
  to authenticated
  using ( family_id = public.current_family_id() )
  with check ( family_id = public.current_family_id() );

drop policy if exists "task_types: delete own" on public.task_types;
create policy "task_types: delete own"
  on public.task_types for delete
  to authenticated
  using ( family_id = public.current_family_id() );

-- C3: System-defaults seed (idempotent via on conflict)

-- event_types: schule, training, arzt, family, meal
insert into public.event_types (slug, label, icon, color, family_id) values
  ('schule',   '{"de":"Schule"}'::jsonb,    'school',      'primary',     null),
  ('training', '{"de":"Training"}'::jsonb,  'activity',    'accent',      null),
  ('arzt',     '{"de":"Arzt"}'::jsonb,      'stethoscope', 'danger',      null),
  ('family',   '{"de":"Familie"}'::jsonb,   'users',       'primarySoft', null),
  ('meal',     '{"de":"Essen"}'::jsonb,     'utensils',    'success',     null)
on conflict (slug) where family_id is null do nothing;

-- task_types: hausaufgaben, besorgung, eltern-aufgabe
insert into public.task_types (slug, label, icon, color, family_id) values
  ('hausaufgaben',   '{"de":"Hausaufgaben"}'::jsonb,  'book-open',    'accent',      null),
  ('besorgung',      '{"de":"Besorgung"}'::jsonb,     'shopping-bag', 'primary',     null),
  ('eltern-aufgabe', '{"de":"Eltern-Aufgabe"}'::jsonb,'check-square', 'primarySoft', null)
on conflict (slug) where family_id is null do nothing;
