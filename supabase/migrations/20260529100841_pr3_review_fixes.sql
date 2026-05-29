-- Eltern Flow AI: PR #3 — CodeRabbit review fixes
-- Plan: ~/.claude/plans/will-jetzt-anfangen-supabase-gleaming-iverson.md
-- Spec base: docs/superpowers/specs/2026-05-29-supabase-schema-design.md
--
-- Addresses 7 SQL findings flagged by CodeRabbit on PR #3:
--   Fix 4  — parents: enforce family_id immutability on update self
--   Fix 5  — events/tasks: validate cross-family refs (child_id, type_id, created_by, completed_by)
--   Fix 6  — events: RRULE consistency (interval>0, components require freq)
--   Fix 7  — tasks: completed_at/completed_by symmetric with is_done
--   Fix 8  — reminders: validate recipient_parent_id family membership
--   Fix 9  — reminders: trigger fires on UPDATE OF event_id, task_id too
--   Fix 10 — recipes: insert must validate created_by_family_id
--   Fix 11 — meal_plan_entries: insert/update must validate recipe_id

-- ── Fix 4: parents update self — family_id immutability ─────────────────────
-- current_family_id() reads the EXISTING parents row, so NEW.family_id must
-- equal OLD.family_id; any attempt to switch families is rejected.

drop policy if exists "parents: update self" on public.parents;
create policy "parents: update self"
  on public.parents for update
  to authenticated
  using ( auth_user_id = (select auth.uid()) )
  with check (
    auth_user_id = (select auth.uid())
    and family_id = public.current_family_id()
  );

-- ── Fix 5a: events — validate child_id, type_id, created_by ─────────────────

drop policy if exists "events: insert own family" on public.events;
create policy "events: insert own family"
  on public.events for insert
  to authenticated
  with check (
    family_id = public.current_family_id()
    and (
      child_id is null
      or child_id in (select id from public.children where family_id = public.current_family_id())
    )
    and type_id in (
      select id from public.event_types
      where family_id is null or family_id = public.current_family_id()
    )
    and (
      created_by is null
      or created_by in (select id from public.parents where family_id = public.current_family_id())
    )
  );

drop policy if exists "events: update own family" on public.events;
create policy "events: update own family"
  on public.events for update
  to authenticated
  using ( family_id = public.current_family_id() )
  with check (
    family_id = public.current_family_id()
    and (
      child_id is null
      or child_id in (select id from public.children where family_id = public.current_family_id())
    )
    and type_id in (
      select id from public.event_types
      where family_id is null or family_id = public.current_family_id()
    )
    and (
      created_by is null
      or created_by in (select id from public.parents where family_id = public.current_family_id())
    )
  );

-- ── Fix 5b: tasks — validate child_id, type_id, created_by, completed_by ────

drop policy if exists "tasks: insert own family" on public.tasks;
create policy "tasks: insert own family"
  on public.tasks for insert
  to authenticated
  with check (
    family_id = public.current_family_id()
    and (
      child_id is null
      or child_id in (select id from public.children where family_id = public.current_family_id())
    )
    and type_id in (
      select id from public.task_types
      where family_id is null or family_id = public.current_family_id()
    )
    and (
      created_by is null
      or created_by in (select id from public.parents where family_id = public.current_family_id())
    )
    and (
      completed_by is null
      or completed_by in (select id from public.parents where family_id = public.current_family_id())
    )
  );

drop policy if exists "tasks: update own family" on public.tasks;
create policy "tasks: update own family"
  on public.tasks for update
  to authenticated
  using ( family_id = public.current_family_id() )
  with check (
    family_id = public.current_family_id()
    and (
      child_id is null
      or child_id in (select id from public.children where family_id = public.current_family_id())
    )
    and type_id in (
      select id from public.task_types
      where family_id is null or family_id = public.current_family_id()
    )
    and (
      created_by is null
      or created_by in (select id from public.parents where family_id = public.current_family_id())
    )
    and (
      completed_by is null
      or completed_by in (select id from public.parents where family_id = public.current_family_id())
    )
  );

-- ── Fix 6: events RRULE consistency ─────────────────────────────────────────
-- Existing events_rrule_count_xor_until stays (allows both NULL = single
-- occurrence, blocks both non-NULL = invalid). These two add:
--   * rrule_interval must be positive
--   * rrule_count/rrule_until/rrule_byweekday require rrule_freq IS NOT NULL
-- alter table ... add constraint is NOT idempotent → drop first.

alter table public.events drop constraint if exists events_rrule_interval_positive;
alter table public.events
  add constraint events_rrule_interval_positive
  check (rrule_interval > 0);

alter table public.events drop constraint if exists events_rrule_components_require_freq;
alter table public.events
  add constraint events_rrule_components_require_freq
  check (
    rrule_freq is not null
    or (rrule_count is null and rrule_until is null and rrule_byweekday is null)
  );

-- ── Fix 7: tasks completion symmetry ────────────────────────────────────────
-- Previous CHECK only enforced "done implies has timestamp" — allowed stale
-- completed_at/completed_by on rows with is_done=false. Now symmetric.

alter table public.tasks drop constraint if exists tasks_completed_consistency;
alter table public.tasks
  add constraint tasks_completed_consistency
  check (
    (is_done = true and completed_at is not null)
    or (is_done = false and completed_at is null and completed_by is null)
  );

-- ── Fix 8: reminders recipient_parent_id family validation ──────────────────

drop policy if exists "reminders: insert own family" on public.reminders;
create policy "reminders: insert own family"
  on public.reminders for insert
  to authenticated
  with check (
    (
      (event_id is not null and event_id in (
        select id from public.events where family_id = public.current_family_id()
      ))
      or
      (task_id is not null and task_id in (
        select id from public.tasks where family_id = public.current_family_id()
      ))
    )
    and (
      recipient_parent_id is null
      or recipient_parent_id in (
        select id from public.parents where family_id = public.current_family_id()
      )
    )
  );

drop policy if exists "reminders: update own family" on public.reminders;
create policy "reminders: update own family"
  on public.reminders for update
  to authenticated
  using ( family_id = public.current_family_id() )
  with check (
    family_id = public.current_family_id()
    and (
      recipient_parent_id is null
      or recipient_parent_id in (
        select id from public.parents where family_id = public.current_family_id()
      )
    )
  );

-- ── Fix 9: reminders trigger fires on UPDATE OF event_id, task_id ───────────
-- Previously only BEFORE INSERT — denormalized family_id could become stale
-- if a client UPDATEd event_id/task_id. Function body unchanged.

drop trigger if exists reminders_set_family_id on public.reminders;
create trigger reminders_set_family_id
  before insert or update of event_id, task_id on public.reminders
  for each row execute function public.set_reminder_family_id();

-- ── Fix 10: recipes INSERT — created_by_family_id validation ────────────────
-- Previously INSERT was open to any authenticated user with any value of
-- created_by_family_id. Now restricted to NULL (global pool) or own family.

drop policy if exists "recipes: insert authenticated" on public.recipes;
create policy "recipes: insert authenticated"
  on public.recipes for insert
  to authenticated
  with check (
    (select auth.uid()) is not null
    and (
      created_by_family_id is null
      or created_by_family_id = public.current_family_id()
    )
  );

-- ── Fix 11: meal_plan_entries — recipe_id family/global validation ──────────
-- Prevents tenants from referencing another family's private recipe (which
-- would also block that family from deleting it due to ON DELETE RESTRICT).

drop policy if exists "meal_plan: insert own family" on public.meal_plan_entries;
create policy "meal_plan: insert own family"
  on public.meal_plan_entries for insert
  to authenticated
  with check (
    family_id = public.current_family_id()
    and recipe_id in (
      select id from public.recipes
      where created_by_family_id is null
        or created_by_family_id = public.current_family_id()
    )
  );

drop policy if exists "meal_plan: update own family" on public.meal_plan_entries;
create policy "meal_plan: update own family"
  on public.meal_plan_entries for update
  to authenticated
  using ( family_id = public.current_family_id() )
  with check (
    family_id = public.current_family_id()
    and recipe_id in (
      select id from public.recipes
      where created_by_family_id is null
        or created_by_family_id = public.current_family_id()
    )
  );
