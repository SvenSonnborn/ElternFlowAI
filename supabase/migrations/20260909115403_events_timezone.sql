-- Eltern Flow AI: Zeitzone je Termin
-- Spec: docs/superpowers/specs/2026-09-09-calendar-silent-data-loss-design.md (§5)

alter table public.events
  add column if not exists timezone text not null default 'Europe/Berlin';

-- Eine Prüfung gegen `pg_timezone_names` wäre genauer, ist aber als Subquery
-- in einem CHECK nicht erlaubt und als Funktion nicht `immutable`. Der Regex
-- fängt leere Strings und Tippfehler; die eigentliche Gültigkeit garantiert der
-- Client, der die Zone aus dem Betriebssystem liest.
alter table public.events
  drop constraint if exists events_timezone_iana;
alter table public.events
  add constraint events_timezone_iana
  check (timezone ~ '^(UTC|[A-Za-z_]+(/[A-Za-z0-9_+-]+){1,2})$');

comment on column public.events.timezone is
  'IANA-Zone, in der die Wanduhrzeit dieses Termins und seiner RRULE gilt. Bestimmt die Auswertung über Zeitumstellungen hinweg; die Anzeige rechnet daraus in die Zone des Lesers um. Der Default backfillt die Bestandszeilen — für eine DE-primäre App die einzige Zone, die nicht geraten ist. Siehe ADR-033.';
