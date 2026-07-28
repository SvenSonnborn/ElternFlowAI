-- Eltern Flow AI: one reminder per (event, offset)
--
-- The calendar detail sheet toggles reminders per offset (24 h / 1 h). Without a
-- unique key the client had to delete-then-insert to stay idempotent, which is
-- two non-transactional statements: a failed insert after a successful delete
-- silently drops a reminder the user had switched on. With this index the enable
-- path becomes a single upsert.
--
-- Deliberately NOT partial: `event_id` is NULL for task reminders, and Postgres
-- treats NULLs as distinct, so task rows never collide with each other here.
-- A partial index would also break PostgREST's `on_conflict` inference, which
-- emits no WHERE clause.

-- Collapse any duplicates an earlier delete-then-insert race may have left
-- behind, keeping the oldest row per (event_id, offset_minutes).
delete from public.reminders r
using public.reminders keep
where r.event_id is not null
  and r.event_id = keep.event_id
  and r.offset_minutes = keep.offset_minutes
  and (keep.created_at, keep.id) < (r.created_at, r.id);

create unique index if not exists reminders_event_offset_uniq
  on public.reminders(event_id, offset_minutes);

comment on index public.reminders_event_offset_uniq is
  'Makes the client-side reminder toggle a single idempotent upsert instead of delete-then-insert.';
