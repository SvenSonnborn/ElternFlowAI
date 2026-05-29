-- Eltern Flow AI: Tasks (deadline-based, no time slot, no recurrence)
-- Spec: docs/superpowers/specs/2026-05-29-supabase-schema-design.md (Section 4.4)

drop table if exists public.tasks cascade;

create table public.tasks (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references public.families(id) on delete cascade,
  type_id       uuid not null references public.task_types(id) on delete restrict,
  child_id      uuid references public.children(id) on delete set null,

  title         text not null,
  description   text,
  subject       text,
  due_date      date not null,
  due_time      time,

  is_done       boolean not null default false,
  completed_at  timestamptz,
  completed_by  uuid references public.parents(id) on delete set null,

  created_by    uuid references public.parents(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint tasks_completed_consistency check ((is_done = false) or (completed_at is not null))
);

comment on table public.tasks is 'Deadline-based work items (homework, errands, parent tasks). No time slot, no recurrence — recurring "tasks" belong as all-day events instead.';

comment on column public.tasks.subject is 'Homework-specific: school subject (e.g. "Mathe", "Deutsch"). NULL for non-homework task types.';
comment on column public.tasks.due_time is 'Optional finer deadline within the due_date. Most tasks only need the date ("bis morgen").';
comment on column public.tasks.completed_at is 'Timestamp when the task was marked done. Must be non-NULL whenever is_done = true (enforced by tasks_completed_consistency CHECK).';
comment on column public.tasks.completed_by is 'Parent who marked the task done. SET NULL on parent deletion — task stays marked done.';

create index tasks_family_due_idx on public.tasks(family_id, due_date) where is_done = false;
create index tasks_child_id_idx on public.tasks(child_id) where child_id is not null;

alter table public.tasks enable row level security;
alter table public.tasks force row level security;

drop policy if exists "tasks: select own family" on public.tasks;
create policy "tasks: select own family"
  on public.tasks for select
  to authenticated
  using ( family_id = public.current_family_id() );

drop policy if exists "tasks: insert own family" on public.tasks;
create policy "tasks: insert own family"
  on public.tasks for insert
  to authenticated
  with check ( family_id = public.current_family_id() );

drop policy if exists "tasks: update own family" on public.tasks;
create policy "tasks: update own family"
  on public.tasks for update
  to authenticated
  using ( family_id = public.current_family_id() )
  with check ( family_id = public.current_family_id() );

drop policy if exists "tasks: delete own family" on public.tasks;
create policy "tasks: delete own family"
  on public.tasks for delete
  to authenticated
  using ( family_id = public.current_family_id() );
