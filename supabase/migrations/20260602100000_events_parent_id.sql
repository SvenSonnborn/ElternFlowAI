-- Eltern Flow AI: Add optional parent_id to events so parents can be assigned
-- as the participating family member (not only children).
--
-- The two person columns (child_id, parent_id) are mutually exclusive: an event
-- can be associated with at most one person, or none (= family-wide event).

alter table public.events
  add column parent_id uuid references public.parents(id) on delete set null;

create index events_parent_id_idx on public.events(parent_id) where parent_id is not null;

alter table public.events
  add constraint events_one_person_only
    check (not (child_id is not null and parent_id is not null));

comment on column public.events.parent_id is
  'Optional parent participant. Mutually exclusive with child_id; null on both = family-wide event.';
