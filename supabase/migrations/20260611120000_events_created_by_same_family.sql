-- Eltern Flow AI: Bind events.created_by to the SAME family as the event.
--
-- Completes the same-family hardening started for parent_id
-- (20260602100000_events_parent_id.sql) and child_id
-- (20260604120000_events_child_same_family.sql). The original plain FK
-- created_by -> parents(id) would let an event record an author from a
-- DIFFERENT family. RLS makes that unlikely, but there was no DB guard. A
-- composite FK on (family_id, created_by) closes the gap; it reuses the
-- parents_family_id_id_key unique index already created by the parent_id
-- migration, so no new unique index is needed here.

-- Replace the plain FK with the composite one. ON DELETE SET NULL (created_by)
-- nulls only created_by when the parent row is removed (matching the previous
-- behavior) — family_id stays intact (NOT NULL, owned by the events families FK).
alter table public.events
  drop constraint if exists events_created_by_fkey;

alter table public.events
  add constraint events_created_by_same_family_fk
    foreign key (family_id, created_by)
    references public.parents(family_id, id)
    on delete set null (created_by);

-- Unlike child_id (covered by events_child_id_idx) and parent_id (covered by
-- events_parent_id_idx), created_by had no supporting index. Add a partial one
-- so the ON DELETE lookup on the events side stays index-driven when a parent
-- row is removed, rather than falling back to a sequential scan.
create index events_created_by_idx on public.events(created_by) where created_by is not null;
