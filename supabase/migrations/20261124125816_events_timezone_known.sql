-- Eltern Flow AI: events.timezone muss dem Server bekannt sein
-- Spec: docs/superpowers/specs/2026-11-19-kalender-stille-fehler-design.md (F)
--
-- Der CHECK `events_timezone_iana` prüft nur die Form. Eine formal gültige, real
-- unbekannte Zone ("Mars/Olympus") kam bisher durch und fiel erst im Client auf
-- (`Intl.DateTimeFormat` wirft einen `RangeError`).
--
-- Warum ein Trigger statt eines CHECK: Ein CHECK darf keine Subquery auf
-- `pg_timezone_names` enthalten, und eine Funktion darüber wäre nicht `immutable`.
-- Warum die Offset-Form durchgelassen wird: `+00:00` steht nicht in
-- `pg_timezone_names`, `deviceTimeZone()` liefert sie aber unter TZ=GMT legitim
-- (siehe 20260909131554_events_timezone_iana_widen.sql).
--
-- Warum eine unveränderte Zone durchgelassen wird: Eine Altlast mit unbekannter Zone
-- bleibt sonst gesperrt, sobald ein UPDATE die Spalte nur mitschreibt. Der Trigger
-- feuert zwar nur bei `update of timezone`, `set timezone = timezone` zählt aber dazu.
create function public.events_timezone_known()
returns trigger
security invoker
set search_path = ''
language plpgsql
as $$
begin
  if new.timezone ~ '^[+-][0-9]{2}:[0-9]{2}$' then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.timezone is not distinct from old.timezone then
    return new;
  end if;

  if not exists (select 1 from pg_catalog.pg_timezone_names n where n.name = new.timezone) then
    raise exception 'unbekannte Zeitzone: %', new.timezone
      using errcode = '23514';
  end if;

  return new;
end;
$$;

-- Nur der Trigger ruft sie; Postgres prüft EXECUTE nur bei CREATE TRIGGER.
revoke execute on function public.events_timezone_known() from public, anon, authenticated;

create trigger events_timezone_known
  before insert or update of timezone on public.events
  for each row execute function public.events_timezone_known();
