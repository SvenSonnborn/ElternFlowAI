-- Eltern Flow AI: Add optional parent_id to events so parents can be assigned
-- as the participating family member (not only children).
--
-- The two person columns (child_id, parent_id) are mutually exclusive: an event
-- can be associated with at most one person, or none (= family-wide event).

alter table public.events
  add column parent_id uuid;

-- A composite FK on (family_id, parent_id) guarantees an assigned parent always
-- belongs to the SAME family as the event. A plain parent_id -> parents(id) FK
-- would let an event reference a parent from a different family. The composite
-- reference needs a matching unique index on the parents side.
create unique index if not exists parents_family_id_id_key
  on public.parents(family_id, id);

-- ON DELETE SET NULL (parent_id) nulls only parent_id when the parent row is
-- removed (matching the previous parent_id behavior) — family_id stays intact
-- (it is NOT NULL and owned by the event's families FK).
alter table public.events
  add constraint events_parent_same_family_fk
    foreign key (family_id, parent_id)
    references public.parents(family_id, id)
    on delete set null (parent_id);

create index events_parent_id_idx on public.events(parent_id) where parent_id is not null;

alter table public.events
  add constraint events_one_person_only
    check (not (child_id is not null and parent_id is not null));

comment on column public.events.parent_id is
  'Optional parent participant. Mutually exclusive with child_id; null on both = family-wide event.';
