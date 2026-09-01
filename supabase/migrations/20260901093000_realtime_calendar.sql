-- Eltern Flow AI: Realtime für den Kalender
-- Spec: docs/superpowers/specs/2026-09-01-realtime-calendar-channel-design.md (§3)
--
-- Nimmt `events` und `event_exceptions` in die Publikation `supabase_realtime`
-- auf. Das ist derselbe Vorgang wie der Schalter unter Database → Replication
-- im Dashboard; Realtime selbst ist auf einem Supabase-Projekt bereits an.
--
-- Idempotent, weil Postgres kein `create publication if not exists` kennt und
-- `alter publication … add table` auf ein bereits aufgenommenes Ziel mit
-- 42710 (duplicate_object) fehlschlägt.

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'events'
  ) then
    alter publication supabase_realtime add table public.events;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'event_exceptions'
  ) then
    alter publication supabase_realtime add table public.event_exceptions;
  end if;
end $$;

-- Bewusst KEIN `replica identity full` auf beiden Tabellen.
--
-- Es würde `payload.old` mit den vorherigen Spaltenwerten füllen — aber nur bei
-- Tabellen ohne RLS. Beide Tabellen hier stehen auf `enable row level security`
-- UND `force row level security` (20260529091933_calendar.sql), `payload.old`
-- trägt deshalb so oder so ausschließlich den Primärschlüssel. Die Einstellung
-- erhöhte nur das WAL-Volumen.
--
-- Damit verbunden und ebenfalls nicht reparierbar: RLS greift bei
-- `postgres_changes` nicht auf DELETE — Postgres kann eine bereits gelöschte
-- Zeile nicht mehr gegen eine Policy prüfen. Lösch-Ereignisse erreichen also
-- jeden abonnierten Client, mit nichts als der Row-Id. Der Client bildet das in
-- `CalendarChange.eventId: string | null` ab (features/calendar/realtime.ts).
