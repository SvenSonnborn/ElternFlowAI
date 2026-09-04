-- Eltern Flow AI: Conflict-Detection V1 — `updated_at` beleben
-- Spec: docs/superpowers/specs/2026-09-04-conflict-detection-design.md
-- Issue #52. Idempotent.

-- 1. Die Trigger-Funktion.
--
-- Bewusst KEIN `security definer`: Anders als `broadcast_family_change`
-- (20260902065203_realtime_family_broadcast.sql) fasst diese Funktion nur NEW
-- an und schreibt in keine fremde Tabelle. Erhöhte Rechte wären hier
-- ausschließlich Angriffsfläche.
--
-- `set search_path = ''` bleibt trotzdem gesetzt (Hausstandard); `now()` liegt
-- in pg_catalog und wird auch bei leerem Suchpfad implizit gefunden.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'BEFORE-UPDATE-Trigger: stempelt updated_at. Grundlage der Conflict-Detection (Issue #52) — die Spalte existierte seit dem ersten Kalender-Schema, wurde aber von keinem Trigger angefasst und war damit faktisch ein zweites created_at.';

-- 2. `event_exceptions` hatte die Spalte noch gar nicht.
--
-- Kein Backfill nötig: Die Basis-Version stammt immer aus der Zeile, die der
-- Client gerade gelesen hat — der erste Vergleich ist per Konstruktion
-- konsistent, egal welcher Wert dort steht.
alter table public.event_exceptions
  add column if not exists updated_at timestamptz not null default now();

-- 3. Die Trigger.
--
-- `before`, nicht `after`: Ein AFTER-Trigger sieht die Zeile, nachdem sie
-- geschrieben wurde, sein NEW zu ändern hat keine Wirkung mehr. Und Postgres
-- führt alle BEFORE-ROW-Trigger vor allen AFTER-ROW-Triggern aus — dieser läuft
-- also vor `broadcast_family_change`, und das Broadcast trägt das neue
-- updated_at bereits in `record`.
drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at
before update on public.events
for each row execute function public.set_updated_at();

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

drop trigger if exists event_exceptions_set_updated_at on public.event_exceptions;
create trigger event_exceptions_set_updated_at
before update on public.event_exceptions
for each row execute function public.set_updated_at();

-- `families`, `parents` und `children` tragen dasselbe tote `updated_at`.
-- Bewusst draußen: kein Schreibpfad dieser Iteration berührt sie. Vermerkt in
-- docs/TODO.md.
