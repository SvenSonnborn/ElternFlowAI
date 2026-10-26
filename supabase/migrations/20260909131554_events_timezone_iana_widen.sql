-- Eltern Flow AI: events.timezone-Constraint weiter fassen
-- Task-6-Review (Fix-Welle 1), Befund 1: Der Regex aus
-- 20260909115403_events_timezone.sql verlangt außer bei exakt "UTC" mindestens
-- einen Slash und verwirft damit gültige IANA-Zonen ohne Slash — u. a. GMT,
-- EST5EDT, PST8PDT, Japan, Poland, Singapore, Hongkong, Israel, Zulu, NZ, W-SU,
-- GB-Eire — sowie die Offset-Form ("+00:00"), die
-- `Intl.DateTimeFormat().resolvedOptions().timeZone` unter TZ=GMT liefert
-- (deviceTimeZone()s zweite Stufe, features/calendar/deviceTimeZone.ts).
-- `createEvent` scheitert dort hart an der Constraint-Verletzung — auf so
-- einem Gerät lässt sich kein Termin anlegen.
--
-- Gegenprobe (siehe .superpowers/sdd/2026-09-09-calendar-timezone/task-6-report.md):
-- alle 445 kanonischen Zonen aus Intl.supportedValuesOf("timeZone") (Bun 1.3.14
-- ∪ Node, dedupliziert) akzeptiert, dazu 21 IANA-Legacy-Aliasnamen und drei
-- Offset-Strings; 11 Negativfälle (leerer String, führender/abschließender
-- Slash, doppelter Slash, Leerzeichen, Semikolon, SQL-artiger Payload,
-- vierstufiger Pfad) weiterhin abgelehnt.

alter table public.events
  drop constraint if exists events_timezone_iana;
alter table public.events
  add constraint events_timezone_iana
  check (
    timezone ~ '^([A-Za-z_]+[A-Za-z0-9_+-]*(/[A-Za-z0-9_+-]+){0,2}|[+-][0-9]{2}:[0-9]{2})$'
  );
