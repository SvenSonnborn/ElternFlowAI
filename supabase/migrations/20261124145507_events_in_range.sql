-- Eltern Flow AI: Ein Kalenderfenster laden, samt weit verschobener Occurrences
-- Spec: docs/superpowers/specs/2026-11-19-kalender-stille-fehler-design.md (D)
--
-- Bisher filterte der Client nur über die Master-Zeile (`start_at` ≤ Fensterende,
-- `rrule_until` leer oder ≥ Fensteranfang). Verschiebt ein Override eine Occurrence hinter
-- `rrule_until` oder vor den Serienstart, lud die Serie im Zielmonat gar nicht, und die
-- Occurrence fehlte dort. `events_in_range` liefert zusätzlich jede Serie mit einer
-- `modified`-Exception, deren Override-Intervall das Fenster schneidet; den Rest erledigt
-- `expandEvents` im Client.
--
-- Warum eine Funktion statt einer zweiten Abfrage im Client: PostgREST vergleicht Werte aus
-- jsonb nur als Text. Ein Override mit Offset (`+02:00`) sortierte dann falsch.

-- ── 1. Override-Zeitpunkt lesen, ohne zu werfen ─────────────────────────────
--
-- Ein unbrauchbarer Wert (kein String, kein lesbarer Zeitpunkt, 30. Februar) macht die
-- Exception für das Prädikat nur unwirksam. Werfen darf er nicht: Ein einziger kaputter
-- Override ließe sonst das Laden des ganzen Familienkalenders scheitern.
--
-- `stable`, nicht `immutable`: Einen ISO-Wert ohne Offset liest der Cast in der Zone der
-- Sitzung. Liegt in `private`, damit PostgREST sie nicht als RPC anbietet; `authenticated`
-- braucht trotzdem execute, weil `events_in_range` sie mit seinen Rechten aufruft.

create or replace function private.override_instant(p_value jsonb)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
begin
  if jsonb_typeof(p_value) is distinct from 'string' then
    return null;
  end if;
  return (p_value #>> '{}')::timestamptz;
exception when others then
  return null;
end;
$$;

comment on function private.override_instant(jsonb) is
  'Liest einen Zeitpunkt aus event_exceptions.override (start_at/end_at). null statt eines Fehlers, wenn der Wert kein String oder kein lesbarer Zeitpunkt ist.';

revoke all on function private.override_instant(jsonb) from public, anon;
grant execute on function private.override_instant(jsonb) to authenticated;

-- ── 2. Das Lade-Prädikat ────────────────────────────────────────────────────
--
-- Der erste Zweig ist das bisherige Prädikat, unverändert. Dass es jeden vergangenen
-- Einzeltermin lädt, steht in docs/TODO.md.
--
-- Der Exception-Zweig rechnet mit einem Polster von einem Tag an beiden Fenstergrenzen. Es
-- deckt zweierlei ab: Fehlt das Ende des Overrides oder ist es unbrauchbar, gilt Start plus
-- Dauer des Masters; über eine Zeitumstellung ist diese absolute Dauer bis zu eine Stunde
-- kürzer als die Wandzeit-Dauer, die der Client erbt. Und einen ISO-Wert ohne Offset liest SQL
-- in der Zone der Sitzung (bei Supabase UTC), `overrideDate` im Client in der Gerätezone —
-- bis zu 14 Stunden auseinander. Lieber zu viel als zu wenig: `expandEvents` filtert danach
-- exakt nach dem Fenster.
--
-- security invoker: RLS auf `events` und `event_exceptions` gilt wie bei einer direkten
-- Abfrage. Kein eigener Index, die Datenmengen pro Familie sind klein.

create or replace function public.events_in_range(p_start timestamptz, p_end timestamptz)
returns setof public.events
language sql
stable
security invoker
set search_path = ''
as $$
  select e.* from public.events e
  where (e.start_at <= p_end and (e.rrule_until is null or e.rrule_until >= p_start))
     or exists (
       select 1
       from public.event_exceptions x
       cross join lateral (
         select private.override_instant(x.override -> 'start_at') as s,
                private.override_instant(x.override -> 'end_at') as en
       ) o
       where x.event_id = e.id
         and x.action = 'modified'
         and o.s is not null
         and o.s <= p_end + interval '1 day'
         and coalesce(o.en, o.s + (e.end_at - e.start_at)) >= p_start - interval '1 day'
     )
$$;

comment on function public.events_in_range(timestamptz, timestamptz) is
  'Termine für ein Kalenderfenster: wie bisher über start_at und rrule_until, dazu jede Serie mit einer modified-Exception, deren Override-Intervall das Fenster (um einen Tag gepolstert) schneidet. Liefert eher zu viel; expandEvents filtert im Client exakt. security invoker, RLS gilt.';

revoke all on function public.events_in_range(timestamptz, timestamptz) from public, anon;
grant execute on function public.events_in_range(timestamptz, timestamptz) to authenticated;
