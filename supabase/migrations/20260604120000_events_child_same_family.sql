-- Eltern Flow AI: Bind events.child_id to the SAME family as the event.
--
-- Mirrors the parent_id hardening in 20260602100000_events_parent_id.sql. The
-- original plain FK child_id -> children(id) would let an event reference a
-- child from a DIFFERENT family. RLS makes that unlikely, but there was no DB
-- guard. A composite FK on (family_id, child_id) closes the gap; it needs a
-- matching unique index on the children side.
create unique index if not exists children_family_id_id_key
  on public.children(family_id, id);

-- Replace the plain FK with the composite one. ON DELETE SET NULL (child_id)
-- nulls only child_id when the child row is removed (matching the previous
-- behavior) — family_id stays intact (NOT NULL, owned by the events families FK).
alter table public.events
  drop constraint if exists events_child_id_fkey;

alter table public.events
  add constraint events_child_same_family_fk
    foreign key (family_id, child_id)
    references public.children(family_id, id)
    on delete set null (child_id);

-- No new index needed for this FK: the existing partial index
-- events_child_id_idx on events(child_id) WHERE child_id IS NOT NULL (from
-- 20260529091933_calendar.sql) already covers the ON DELETE lookup — when a
-- child row is removed, child_id is the selective column, so no sequential scan
-- occurs. Mirrors the parent_id precedent (20260602100000), which likewise
-- relies on a single-column partial index rather than a composite one.
