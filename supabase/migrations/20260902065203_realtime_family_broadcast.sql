-- Eltern Flow AI: Live-Sync für den Kalender per Broadcast from Database
-- Spec: docs/superpowers/specs/2026-09-01-realtime-family-broadcast-design.md
-- Löst den `postgres_changes`-Ansatz aus 20260901083335_realtime_calendar.sql ab
-- (ADR-028 → ADR-030). Idempotent.

-- 1. Die Publikation zurücknehmen.
--
-- Das ist der eigentliche Verschluss des DELETE-Lecks und gehört deshalb in die
-- Datenbank, nicht in eine Client-Konvention: RLS greift bei `postgres_changes`
-- nicht auf DELETE — Postgres kann eine bereits gelöschte Zeile nicht mehr gegen
-- eine Policy prüfen. Solange die Tabellen in `supabase_realtime` liegen, kann
-- JEDER angemeldete Client sie abonnieren und Lösch-Ereignisse fremder Familien
-- mithören, unabhängig davon, was unser eigener Code tut.
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'events'
  ) then
    alter publication supabase_realtime drop table public.events;
  end if;

  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'event_exceptions'
  ) then
    alter publication supabase_realtime drop table public.event_exceptions;
  end if;
end $$;

-- 2. Realtime Authorization.
--
-- Ein privater Kanal wird über RLS auf `realtime.messages` autorisiert. Der
-- Vergleich läuft gegen `realtime.topic()` — den Topic-Namen, auf den der Client
-- gerade joinen will. `current_family_id()` liefert während des Onboardings
-- `null`; der Vergleich schlägt dann fehl und der Join wird abgelehnt, was genau
-- richtig ist.
--
-- Bewusst KEINE `insert`-Policy: Clients senden nicht auf diesen Kanal. Alle
-- Nachrichten kommen aus dem Trigger unten, der als `security definer` läuft und
-- RLS damit nicht unterliegt.
drop policy if exists "family members receive family broadcasts" on realtime.messages;

create policy "family members receive family broadcasts"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and (select realtime.topic()) = 'family:' || public.current_family_id()::text
);

-- 3. Trigger-Funktion für beide Tabellen.
create or replace function public.broadcast_family_change()
returns trigger
security definer
set search_path = ''
language plpgsql
as $$
declare
  fid uuid;
  eid uuid;
begin
  -- Bewusst KEIN `coalesce(NEW.x, OLD.x)`, obwohl die Supabase-Doku es so zeigt:
  -- In einem Row-Trigger auf DELETE ist `NEW` nicht zugewiesen, und ein
  -- Feldzugriff darauf kann mit `record "new" is not assigned yet` abbrechen —
  -- ausgerechnet im Fall, für den dieser ganze Entwurf gebaut ist.
  --
  -- Ebenso bewusst KEIN `case when TG_TABLE_NAME = 'events' then NEW.family_id end`
  -- in einer flachen Verzweigung nach TG_OP: PL/pgSQL löst Feldzugriffe auf
  -- NEW/OLD für die gesamte Expression gegen den tatsächlich gebundenen
  -- Record-Typ auf — unabhängig davon, welcher WHEN-Zweig zur Laufzeit
  -- genommen würde. `events` hat keine Spalte `event_id`, `event_exceptions`
  -- keine Spalte `family_id`; eine solche CASE-Expression wirft deshalb bei
  -- jedem Aufruf mit "record ... has no field ...", ganz gleich welcher Zweig
  -- inhaltlich gemeint war. Erst nach Tabelle, dann nach TG_OP verschachteln
  -- stellt sicher, dass kein Ausdruck je ein Feld berührt, das der gebundene
  -- Zeilentyp nicht hat.
  if TG_TABLE_NAME = 'events' then
    if TG_OP = 'DELETE' then
      fid := OLD.family_id;
      eid := OLD.id;
    else
      fid := NEW.family_id;
      eid := NEW.id;
    end if;
  else
    -- `event_exceptions` trägt keine `family_id`; sie hängt am Event.
    if TG_OP = 'DELETE' then
      eid := OLD.event_id;
    else
      eid := NEW.event_id;
    end if;
    select e.family_id into fid from public.events e where e.id = eid;
  end if;

  -- Kaskade: `on delete cascade` räumt die Exceptions NACH der Master-Zeile ab,
  -- der Lookup läuft dann ins Leere. Das DELETE-Broadcast des Events selbst
  -- deckt den Fall bereits ab; ohne diesen Ausstieg entstünde das Topic
  -- `family:` ohne Id, das niemand abonniert.
  if fid is null then
    return null;
  end if;

  perform realtime.broadcast_changes(
    'family:' || fid::text,  -- topic
    TG_OP,                   -- event
    TG_OP,                   -- operation
    TG_TABLE_NAME,           -- table
    TG_TABLE_SCHEMA,         -- schema
    NEW,                     -- new record
    OLD                      -- old record
  );
  return null;
end;
$$;

comment on function public.broadcast_family_change() is
  'AFTER-Trigger für Realtime: sendet Zeilenänderungen auf das private Topic family:<family_id>. Eine Funktion für alle familiengebundenen Tabellen — Aufgaben und Essen anzuschließen heißt, den TG_TABLE_NAME-Zweig zu erweitern und einen Trigger zu setzen. Kosten: jede Mutation schreibt zusätzlich eine Zeile in realtime.messages (Supabase partitioniert tagesweise und löscht > 3 Tage selbst).';

drop trigger if exists broadcast_events_changes on public.events;
create trigger broadcast_events_changes
after insert or update or delete on public.events
for each row execute function public.broadcast_family_change();

drop trigger if exists broadcast_event_exceptions_changes on public.event_exceptions;
create trigger broadcast_event_exceptions_changes
after insert or update or delete on public.event_exceptions
for each row execute function public.broadcast_family_change();

-- `replica identity full` bleibt aus und ist jetzt endgültig gegenstandslos:
-- `OLD` kommt aus dem Trigger, nicht aus dem WAL (korrigiert ADR-028 Decision 6).
