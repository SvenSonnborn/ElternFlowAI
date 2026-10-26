-- pgTAP: public.apply_event_change und die Verbuchung in private.event_change_requests.
-- Spec: docs/superpowers/specs/2026-10-21-calendar-transaction-rpc-design.md (§5, §6, §8)
--
-- Läuft in einer Transaktion und rollt am Ende zurück; die Seed-Daten bleiben unberührt.
-- Jeder Fall arbeitet auf einer eigenen Kopie eines Seed-Termins (`pg_temp.clone_event`),
-- damit sich die Fälle nicht gegenseitig den Stand verschieben. Die Kopie übernimmt das
-- `updated_at` der Vorlage: Es liegt vor `now()`, und jede Änderung in dieser Transaktion
-- stempelt `now()` — `updated_at < now()` heißt hier also „unverändert".
--
-- Feste Kennungen (Seed-IDs siehe Kopf von supabase/seed.sql):
--   Kopien      <Vorlage>-0000-4000-8000-1000000000NN   NN = Fallnummer
--   Kennungen   0a000000-0000-4000-8000-0000000000NN    erwartet verbucht oder abgelehnt (Fall NN;
--                                                        ein zweiter Aufruf im Fall hängt eine Ziffer an,
--                                                        097–099 sind die abgewiesenen Aufrufe ohne Fall)
--               0b000000-0000-4000-8000-0000000000NN    ungültige Eingaben (22023)
--               0c000000-0000-4000-8000-0000000000NN    vorab angelegte Alt-Verbuchungen (Aufräumen)
--               0d000000-0000-4000-8000-0000000000NN    Familienverlust während des Aufrufs (Fälle 40–44)

begin;

create extension if not exists pgtap with schema extensions;

select plan(132);

-- ── Helfer ──────────────────────────────────────────────────────────────────

-- Kopiert einen Termin samt Exceptions unter neuer ID; `p_patch` überschreibt Spalten.
create function pg_temp.clone_event(p_src uuid, p_dst uuid, p_patch jsonb default '{}')
returns void
language sql
as $$
  insert into public.events
  select (jsonb_populate_record(e, jsonb_build_object('id', p_dst) || p_patch)).*
  from public.events e
  where e.id = p_src;

  insert into public.event_exceptions (event_id, occurrence_date, action, override, created_at, updated_at)
  select p_dst, x.occurrence_date, x.action, x.override, x.created_at, x.updated_at
  from public.event_exceptions x
  where x.event_id = p_src;
$$;

-- Der Stand, den ein Client gesehen hätte. Läuft mit den Rechten der aktuellen Rolle.
create function pg_temp.master_version(p_id uuid)
returns timestamptz
language sql
stable
as $$ select updated_at from public.events where id = p_id $$;

create function pg_temp.exception_version(p_id uuid, p_key date)
returns timestamptz
language sql
stable
as $$
  select updated_at from public.event_exceptions where event_id = p_id and occurrence_date = p_key
$$;

-- SQLSTATE plus Detail eines Aufrufs. `throws_ok` prüft das Detail nicht, und bei EF409
-- sagt erst das Detail, welche Version abwich. Der Block rollt die Wirkung zurück.
create function pg_temp.error_of(p_sql text)
returns text
language plpgsql
as $$
declare
  v_detail text;
begin
  execute p_sql;
  return 'kein Fehler';
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  return sqlstate || coalesce(' ' || nullif(v_detail, ''), '');
end;
$$;

-- ── Fixtures (als postgres, BYPASSRLS) ──────────────────────────────────────

do $$
begin
  -- Einzeltermin e1
  perform pg_temp.clone_event('e1e1e1e1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-100000000001',
    '{"description": "Alte Beschreibung"}');
  perform pg_temp.clone_event('e1e1e1e1-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-100000000020');

  -- Wochenserie e2 (Exception 2026-11-09)
  perform pg_temp.clone_event('e2e2e2e2-0000-4000-8000-000000000001', ('e2e2e2e2-0000-4000-8000-1000000000' || n)::uuid)
  from unnest(array['02','03','04','05','06','07','08','12','13','14','15','16','17','18','19']) as n;

  -- Serie mit rrule_count 10 (e3)
  perform pg_temp.clone_event('e3e3e3e3-0000-4000-8000-000000000001', ('e3e3e3e3-0000-4000-8000-1000000000' || n)::uuid)
  from unnest(array['09','10']) as n;

  -- Fall 37: jede übernommene Spalte weicht vom Wert ab, den ein Insert ohne sie bekäme
  -- (Default oder null). child_id muss null sein (events_one_person_only); dass das Kind
  -- mitwandert, zeigen die Fälle 10 und 11.
  perform pg_temp.clone_event('e2e2e2e2-0000-4000-8000-000000000001', 'e2e2e2e2-0000-4000-8000-100000000037',
    '{"parent_id": "bbbbbbbb-0000-4000-8000-000000000011", "child_id": null, "all_day": true,
      "timezone": "America/New_York", "rrule_interval": 2, "rrule_until": "2027-03-31T21:59:59.999Z"}');

  -- Fall 11: Serie mit UNTIL, damit insert_split_event es übernehmen kann.
  perform pg_temp.clone_event('e2e2e2e2-0000-4000-8000-000000000001', 'e2e2e2e2-0000-4000-8000-100000000011',
    '{"rrule_until": "2027-06-30T21:59:59.999Z"}');

  -- Fälle 06, 07, 17: weitere Exceptions neben der vom 09.11.
  insert into public.event_exceptions (event_id, occurrence_date, action, override, updated_at)
  select ('e2e2e2e2-0000-4000-8000-1000000000' || n)::uuid, d::date, 'cancelled', null, '2026-10-01T00:00:00Z'
  from unnest(array['06', '07', '17']) as n,
       unnest(array['2026-11-16', '2026-11-30']) as d;
end;
$$;

-- ── Struktur und Rechte ─────────────────────────────────────────────────────

select has_function(
  'public', 'apply_event_change',
  array['uuid', 'uuid', 'date', 'timestamp with time zone', 'timestamp with time zone', 'jsonb'],
  'public.apply_event_change existiert mit der Signatur aus §5.1'
);

select is(
  (select prosecdef from pg_proc
   where oid = to_regprocedure('public.apply_event_change(uuid,uuid,date,timestamptz,timestamptz,jsonb)')),
  false,
  'apply_event_change läuft als security invoker'
);

select is(
  (select proconfig from pg_proc
   where oid = to_regprocedure('public.apply_event_change(uuid,uuid,date,timestamptz,timestamptz,jsonb)')),
  array['search_path=""'],
  'apply_event_change setzt einen leeren search_path'
);

select ok(
  not has_function_privilege('anon',
    'public.apply_event_change(uuid,uuid,date,timestamptz,timestamptz,jsonb)', 'execute'),
  'anon hat kein execute auf apply_event_change'
);

select ok(
  has_function_privilege('authenticated',
    'public.apply_event_change(uuid,uuid,date,timestamptz,timestamptz,jsonb)', 'execute'),
  'authenticated hat execute auf apply_event_change'
);

select schema_privs_are('private', 'anon', array[]::text[], 'anon hat keine Rechte auf das Schema private');

select schema_privs_are('private', 'authenticated', array['USAGE'], 'authenticated hat nur usage auf private');

select ok(
  coalesce((select relrowsecurity and relforcerowsecurity from pg_class
            where oid = to_regclass('private.event_change_requests')), false),
  'private.event_change_requests: RLS an und erzwungen'
);

select table_privs_are(
  'private', 'event_change_requests', 'authenticated', array['SELECT', 'INSERT', 'DELETE'],
  'authenticated hat genau select, insert, delete auf event_change_requests'
);

select table_privs_are(
  'private', 'event_change_requests', 'anon', array[]::text[],
  'anon hat keine Rechte auf event_change_requests'
);

-- ── anon und ohne Nutzer ────────────────────────────────────────────────────

set local role anon;

select throws_ok(
  $$ select public.apply_event_change('0a000000-0000-4000-8000-000000000098',
       'e1e1e1e1-0000-4000-8000-000000000001', null, '2026-10-01T00:00:00Z', null,
       '[{"op":"delete_master"}]') $$,
  '42501', 'permission denied for function apply_event_change',
  'anon scheitert schon am fehlenden execute auf apply_event_change'
);

reset role;
set local role authenticated;
set local request.jwt.claims to '{"role":"authenticated"}';

select throws_ok(
  $$ select public.apply_event_change('0a000000-0000-4000-8000-000000000099',
       'e1e1e1e1-0000-4000-8000-000000000001', null, '2026-10-01T00:00:00Z', null,
       '[{"op":"delete_master"}]') $$,
  '42501', null,
  'ohne auth.uid() bricht apply_event_change ab (§5.2 Schritt 1)'
);

-- ── Jede op einzeln, als A ──────────────────────────────────────────────────

set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}';

-- 01 update_master auf einem Einzeltermin; gesehene Exception null (Review Focus 4)
select is(
  public.apply_event_change(
    '0a000000-0000-4000-8000-000000000001', 'e1e1e1e1-0000-4000-8000-100000000001', '2026-11-03',
    pg_temp.master_version('e1e1e1e1-0000-4000-8000-100000000001'), null,
    '[{"op":"update_master","changes":{"title":"Elternabend","start_at":"2026-11-03T17:00:00.000Z",
       "end_at":"2026-11-03T18:30:00.000Z","location":"Aula","description":null}}]'),
  'applied',
  '01 update_master: Einzeltermin mit gesehener Exception null → applied (Review Focus 4)'
);

select results_eq(
  $$ select title, start_at, end_at, location, description, rrule_freq::text, rrule_count, updated_at = now()
     from public.events where id = 'e1e1e1e1-0000-4000-8000-100000000001' $$,
  $$ values ('Elternabend'::text, '2026-11-03T17:00:00Z'::timestamptz, '2026-11-03T18:30:00Z'::timestamptz,
             'Aula'::text, null::text, null::text, null::integer, true) $$,
  '01 update_master schreibt die fünf Felder, auch null, und lässt die Regel stehen'
);

select is(
  (select count(*) from private.event_change_requests
   where request_id = '0a000000-0000-4000-8000-000000000001'),
  1::bigint,
  '01 die Kennung ist für A verbucht'
);

-- 02 update_master mit recurrence
select is(
  public.apply_event_change(
    '0a000000-0000-4000-8000-000000000002', 'e2e2e2e2-0000-4000-8000-100000000002', '2026-11-16',
    pg_temp.master_version('e2e2e2e2-0000-4000-8000-100000000002'), null,
    '[{"op":"update_master","changes":{"title":"Training","start_at":"2026-11-02T15:00:00.000Z",
       "end_at":"2026-11-02T16:30:00.000Z","location":null,"description":null},
       "recurrence":{"rrule_freq":"weekly","rrule_interval":2,"rrule_byweekday":[1,3],
       "rrule_count":null,"rrule_until":"2027-03-31T21:59:59.999Z"}}]'),
  'applied',
  '02 update_master mit recurrence → applied'
);

select results_eq(
  $$ select end_at, rrule_freq::text, rrule_interval, rrule_byweekday, rrule_count, rrule_until
     from public.events where id = 'e2e2e2e2-0000-4000-8000-100000000002' $$,
  $$ values ('2026-11-02T16:30:00Z'::timestamptz, 'weekly'::text, 2, array[1, 3], null::integer,
             '2027-03-31T21:59:59.999Z'::timestamptz) $$,
  '02 update_master schreibt die fünf rrule-Felder'
);

-- 03 modify_occurrence an einem Schlüssel ohne Exception; Override mit location null (Review Focus 3)
select is(
  public.apply_event_change(
    '0a000000-0000-4000-8000-000000000003', 'e2e2e2e2-0000-4000-8000-100000000003', '2026-11-16',
    pg_temp.master_version('e2e2e2e2-0000-4000-8000-100000000003'), null,
    '[{"op":"modify_occurrence","override":{"title":"Training (Halle 2)","start_at":"2026-11-16T15:30:00.000Z",
       "end_at":"2026-11-16T16:30:00.000Z","location":null,"description":"Turnschuhe"}}]'),
  'applied',
  '03 modify_occurrence → applied'
);

select results_eq(
  $$ select action::text, override from public.event_exceptions
     where event_id = 'e2e2e2e2-0000-4000-8000-100000000003' and occurrence_date = '2026-11-16' $$,
  $$ values ('modified'::text, '{"title":"Training (Halle 2)","start_at":"2026-11-16T15:30:00.000Z",
             "end_at":"2026-11-16T16:30:00.000Z","location":null,"description":"Turnschuhe"}'::jsonb) $$,
  '03 modify_occurrence legt eine modified-Exception mit genau diesem Override an'
);

select ok(
  (select override ? 'location' and override -> 'location' = 'null'::jsonb
   from public.event_exceptions
   where event_id = 'e2e2e2e2-0000-4000-8000-100000000003' and occurrence_date = '2026-11-16'),
  '03 Override behält "location": null als Schlüssel (Review Focus 3)'
);

select ok(
  (select updated_at < now() from public.events where id = 'e2e2e2e2-0000-4000-8000-100000000003'),
  '03 modify_occurrence lässt den Master unberührt'
);

-- 04 cancel_occurrence, danach modify_occurrence auf die abgesagte Occurrence (Review Focus 2)
select is(
  public.apply_event_change(
    '0a000000-0000-4000-8000-000000000004', 'e2e2e2e2-0000-4000-8000-100000000004', '2026-11-23',
    pg_temp.master_version('e2e2e2e2-0000-4000-8000-100000000004'), null,
    '[{"op":"cancel_occurrence"}]'),
  'applied',
  '04 cancel_occurrence → applied'
);

select results_eq(
  $$ select action::text, override from public.event_exceptions
     where event_id = 'e2e2e2e2-0000-4000-8000-100000000004' and occurrence_date = '2026-11-23' $$,
  $$ values ('cancelled'::text, null::jsonb) $$,
  '04 cancel_occurrence legt eine cancelled-Exception ohne Override an'
);

select is(
  public.apply_event_change(
    '0a000000-0000-4000-8000-000000000044', 'e2e2e2e2-0000-4000-8000-100000000004', '2026-11-23',
    pg_temp.master_version('e2e2e2e2-0000-4000-8000-100000000004'),
    pg_temp.exception_version('e2e2e2e2-0000-4000-8000-100000000004', '2026-11-23'),
    '[{"op":"modify_occurrence","override":{"title":"Training (doch)","start_at":"2026-11-23T15:00:00.000Z",
       "end_at":"2026-11-23T16:00:00.000Z","location":null,"description":null}}]'),
  'applied',
  '04 modify_occurrence auf eine abgesagte Occurrence → applied (Review Focus 2)'
);

select results_eq(
  $$ select action::text, override ->> 'title' from public.event_exceptions
     where event_id = 'e2e2e2e2-0000-4000-8000-100000000004' and occurrence_date = '2026-11-23' $$,
  $$ values ('modified'::text, 'Training (doch)'::text) $$,
  '04 aus der cancelled-Exception wird eine modified-Exception mit Override, in derselben Zeile'
);

-- 05 delete_master (ohne Occurrence-Schlüssel); die Exceptions gehen per Kaskade mit
select is(
  public.apply_event_change(
    '0a000000-0000-4000-8000-000000000005', 'e2e2e2e2-0000-4000-8000-100000000005', null,
    pg_temp.master_version('e2e2e2e2-0000-4000-8000-100000000005'), null,
    '[{"op":"delete_master"}]'),
  'applied',
  '05 delete_master → applied'
);

select is(
  (select count(*) from public.events where id = 'e2e2e2e2-0000-4000-8000-100000000005')
  + (select count(*) from public.event_exceptions where event_id = 'e2e2e2e2-0000-4000-8000-100000000005'),
  0::bigint,
  '05 delete_master löscht den Master samt Exceptions'
);

select is(
  public.apply_event_change(
    '0a000000-0000-4000-8000-000000000005', 'e2e2e2e2-0000-4000-8000-100000000005', null,
    '2026-10-01T00:00:00Z', null, '[{"op":"delete_master"}]'),
  'already_applied',
  '05 Wiederholung des Löschens mit derselben Kennung → already_applied statt EF404'
);

-- 06 delete_all_exceptions
select is(
  public.apply_event_change(
    '0a000000-0000-4000-8000-000000000006', 'e2e2e2e2-0000-4000-8000-100000000006', '2026-11-02',
    pg_temp.master_version('e2e2e2e2-0000-4000-8000-100000000006'), null,
    '[{"op":"delete_all_exceptions"}]'),
  'applied',
  '06 delete_all_exceptions → applied'
);

select is(
  (select count(*) from public.event_exceptions where event_id = 'e2e2e2e2-0000-4000-8000-100000000006'),
  0::bigint,
  '06 delete_all_exceptions löscht alle drei Exceptions der Serie'
);

select ok(
  (select updated_at < now() from public.events where id = 'e2e2e2e2-0000-4000-8000-100000000006'),
  '06 delete_all_exceptions lässt den Master unberührt'
);

-- 07 delete_exceptions_from
select is(
  public.apply_event_change(
    '0a000000-0000-4000-8000-000000000007', 'e2e2e2e2-0000-4000-8000-100000000007', '2026-11-16',
    pg_temp.master_version('e2e2e2e2-0000-4000-8000-100000000007'),
    pg_temp.exception_version('e2e2e2e2-0000-4000-8000-100000000007', '2026-11-16'),
    '[{"op":"delete_exceptions_from"}]'),
  'applied',
  '07 delete_exceptions_from → applied'
);

select results_eq(
  $$ select occurrence_date from public.event_exceptions
     where event_id = 'e2e2e2e2-0000-4000-8000-100000000007' order by occurrence_date $$,
  $$ values ('2026-11-09'::date) $$,
  '07 delete_exceptions_from löscht ab dem Schlüssel einschließlich, die frühere bleibt'
);

-- 08 set_rrule_until
select is(
  public.apply_event_change(
    '0a000000-0000-4000-8000-000000000008', 'e2e2e2e2-0000-4000-8000-100000000008', '2026-11-30',
    pg_temp.master_version('e2e2e2e2-0000-4000-8000-100000000008'), null,
    '[{"op":"set_rrule_until","until":"2026-11-29T22:59:59.999Z"}]'),
  'applied',
  '08 set_rrule_until → applied'
);

select results_eq(
  $$ select rrule_until, rrule_count, title from public.events
     where id = 'e2e2e2e2-0000-4000-8000-100000000008' $$,
  $$ values ('2026-11-29T22:59:59.999Z'::timestamptz, null::integer, 'Training'::text) $$,
  '08 set_rrule_until schreibt nur rrule_until'
);

-- 09 set_rrule_count
select is(
  public.apply_event_change(
    '0a000000-0000-4000-8000-000000000009', 'e3e3e3e3-0000-4000-8000-100000000009', '2026-11-17',
    pg_temp.master_version('e3e3e3e3-0000-4000-8000-100000000009'), null,
    '[{"op":"set_rrule_count","count":2}]'),
  'applied',
  '09 set_rrule_count → applied'
);

select results_eq(
  $$ select rrule_count, rrule_until, title from public.events
     where id = 'e3e3e3e3-0000-4000-8000-100000000009' $$,
  $$ values (2, null::timestamptz, 'Schulprojekt'::text) $$,
  '09 set_rrule_count schreibt nur rrule_count'
);

-- 10 insert_split_event aus einer zählbegrenzten Serie: UNTIL bleibt leer
select is(
  public.apply_event_change(
    '0a000000-0000-4000-8000-000000000010', 'e3e3e3e3-0000-4000-8000-100000000010', '2026-11-17',
    pg_temp.master_version('e3e3e3e3-0000-4000-8000-100000000010'), null,
    '[{"op":"insert_split_event","changes":{"title":"Schulprojekt (neu)","start_at":"2026-11-17T07:30:00.000Z",
       "end_at":"2026-11-17T08:30:00.000Z","location":"Raum 4","description":null},"rrule_count":8}]'),
  'applied',
  '10 insert_split_event → applied'
);

select results_eq(
  $$ select s.family_id, s.type_id, s.child_id, s.parent_id, s.all_day, s.timezone, s.rrule_freq::text,
            s.rrule_interval, s.rrule_byweekday, s.rrule_until, s.rrule_count, s.created_by,
            s.title, s.start_at, s.end_at, s.location, s.description
     from public.events s where s.title = 'Schulprojekt (neu)' $$,
  $$ select m.family_id, m.type_id, m.child_id, m.parent_id, m.all_day, m.timezone, m.rrule_freq::text,
            m.rrule_interval, m.rrule_byweekday, null::timestamptz, 8, m.created_by,
            'Schulprojekt (neu)'::text, '2026-11-17T07:30:00Z'::timestamptz, '2026-11-17T08:30:00Z'::timestamptz,
            'Raum 4'::text, null::text
     from public.events m where m.id = 'e3e3e3e3-0000-4000-8000-100000000010' $$,
  '10 die neue Zeile trägt Familie, Typ, Kind, Zone, Regel und created_by des Masters, rrule_count aus dem Schritt'
);

select results_eq(
  $$ select title, rrule_count, updated_at < now() from public.events
     where id = 'e3e3e3e3-0000-4000-8000-100000000010' $$,
  $$ values ('Schulprojekt'::text, 10, true) $$,
  '10 insert_split_event lässt den Master unberührt'
);

-- 11 insert_split_event ohne rrule_count: UNTIL des Masters gilt weiter
select is(
  public.apply_event_change(
    '0a000000-0000-4000-8000-000000000011', 'e2e2e2e2-0000-4000-8000-100000000011', '2026-12-07',
    pg_temp.master_version('e2e2e2e2-0000-4000-8000-100000000011'), null,
    '[{"op":"insert_split_event","changes":{"title":"Training (ab Dezember)","start_at":"2026-12-07T16:00:00.000Z",
       "end_at":"2026-12-07T17:00:00.000Z","location":null,"description":null},"rrule_count":null}]'),
  'applied',
  '11 insert_split_event mit rrule_count null → applied'
);

select results_eq(
  $$ select rrule_until, rrule_count, child_id from public.events where title = 'Training (ab Dezember)' $$,
  $$ values ('2027-06-30T21:59:59.999Z'::timestamptz, null::integer,
             'c1c1c1c1-0000-4000-8000-000000000001'::uuid) $$,
  '11 rrule_until des Masters wandert mit, wenn rrule_count null ist'
);

select is(
  public.apply_event_change(
    '0a000000-0000-4000-8000-000000000111', 'e2e2e2e2-0000-4000-8000-100000000011', '2026-12-07',
    pg_temp.master_version('e2e2e2e2-0000-4000-8000-100000000011'), null,
    '[{"op":"insert_split_event","changes":{"title":"Training (gezählt)","start_at":"2026-12-07T16:00:00.000Z",
       "end_at":"2026-12-07T17:00:00.000Z","location":null,"description":null},"rrule_count":4}]'),
  'applied',
  '11 insert_split_event mit rrule_count aus einer UNTIL-Serie → applied'
);

select results_eq(
  $$ select rrule_until, rrule_count from public.events where title = 'Training (gezählt)' $$,
  $$ values (null::timestamptz, 4) $$,
  '11 mit rrule_count bleibt rrule_until leer (events_rrule_count_xor_until)'
);

-- ── Konflikte (EF409) ───────────────────────────────────────────────────────

-- 12 Master geändert: B ändert den Titel, A schickt den alten Stand
set local request.jwt.claims to '{"sub":"bbbbbbbb-0000-4000-8000-000000000001","role":"authenticated"}';
update public.events set title = 'Training (von B)' where id = 'e2e2e2e2-0000-4000-8000-100000000012';
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  pg_temp.error_of($$ select public.apply_event_change(
    '0a000000-0000-4000-8000-000000000012', 'e2e2e2e2-0000-4000-8000-100000000012', '2026-11-16',
    pg_temp.master_version('e2e2e2e2-0000-4000-8000-000000000001'), null,
    '[{"op":"update_master","changes":{"title":"Training (von A)"}}]') $$),
  'EF409 master',
  '12 Master-updated_at weicht ab → EF409, Detail master'
);

select is(
  (select title from public.events where id = 'e2e2e2e2-0000-4000-8000-100000000012'),
  'Training (von B)',
  '12 nach dem Konflikt ist nichts geändert'
);

select is(
  (select count(*) from private.event_change_requests
   where request_id = '0a000000-0000-4000-8000-000000000012'),
  0::bigint,
  '12 nach dem Konflikt ist die Kennung nicht verbucht'
);

select is(
  public.apply_event_change(
    '0a000000-0000-4000-8000-000000000012', 'e2e2e2e2-0000-4000-8000-100000000012', '2026-11-16',
    pg_temp.master_version('e2e2e2e2-0000-4000-8000-100000000012'), null,
    '[{"op":"update_master","changes":{"title":"Training (von A)"}}]'),
  'applied',
  '12 dieselbe Kennung läuft nach dem EF409 mit frischem Stand normal'
);

select results_eq(
  $$ select title, start_at from public.events where id = 'e2e2e2e2-0000-4000-8000-100000000012' $$,
  $$ values ('Training (von A)'::text, '2026-11-02T15:00:00Z'::timestamptz) $$,
  '12 update_master schreibt nur die mitgeschickten Felder'
);

-- 13 Exception neu da: B sagt die Occurrence ab, A hatte dort keine Exception gesehen
set local request.jwt.claims to '{"sub":"bbbbbbbb-0000-4000-8000-000000000001","role":"authenticated"}';
insert into public.event_exceptions (event_id, occurrence_date, action)
values ('e2e2e2e2-0000-4000-8000-100000000013', '2026-11-16', 'cancelled');
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  pg_temp.error_of($$ select public.apply_event_change(
    '0a000000-0000-4000-8000-000000000013', 'e2e2e2e2-0000-4000-8000-100000000013', '2026-11-16',
    pg_temp.master_version('e2e2e2e2-0000-4000-8000-100000000013'), null,
    '[{"op":"modify_occurrence","override":{"title":"Training (von A)"}}]') $$),
  'EF409 exception',
  '13 Exception neu da (gesehen null) → EF409, Detail exception'
);

select results_eq(
  $$ select action::text, override from public.event_exceptions
     where event_id = 'e2e2e2e2-0000-4000-8000-100000000013' and occurrence_date = '2026-11-16' $$,
  $$ values ('cancelled'::text, null::jsonb) $$,
  '13 die Absage von B bleibt stehen'
);

-- 14 Exception geändert: B ändert den Override, A schickt den alten Stand
set local request.jwt.claims to '{"sub":"bbbbbbbb-0000-4000-8000-000000000001","role":"authenticated"}';
update public.event_exceptions set override = '{"title":"von B"}'
where event_id = 'e2e2e2e2-0000-4000-8000-100000000014' and occurrence_date = '2026-11-09';
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  pg_temp.error_of($$ select public.apply_event_change(
    '0a000000-0000-4000-8000-000000000014', 'e2e2e2e2-0000-4000-8000-100000000014', '2026-11-09',
    pg_temp.master_version('e2e2e2e2-0000-4000-8000-100000000014'),
    pg_temp.exception_version('e2e2e2e2-0000-4000-8000-000000000001', '2026-11-09'),
    '[{"op":"modify_occurrence","override":{"title":"von A"}}]') $$),
  'EF409 exception',
  '14 Exception geändert → EF409, Detail exception'
);

select is(
  (select override from public.event_exceptions
   where event_id = 'e2e2e2e2-0000-4000-8000-100000000014' and occurrence_date = '2026-11-09'),
  '{"title":"von B"}'::jsonb,
  '14 der Override von B bleibt stehen'
);

-- 15 Exception verschwunden: B löscht sie, A schickt den alten Stand
set local request.jwt.claims to '{"sub":"bbbbbbbb-0000-4000-8000-000000000001","role":"authenticated"}';
delete from public.event_exceptions
where event_id = 'e2e2e2e2-0000-4000-8000-100000000015' and occurrence_date = '2026-11-09';
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  pg_temp.error_of($$ select public.apply_event_change(
    '0a000000-0000-4000-8000-000000000015', 'e2e2e2e2-0000-4000-8000-100000000015', '2026-11-09',
    pg_temp.master_version('e2e2e2e2-0000-4000-8000-100000000015'),
    pg_temp.exception_version('e2e2e2e2-0000-4000-8000-000000000001', '2026-11-09'),
    '[{"op":"cancel_occurrence"}]') $$),
  'EF409 exception',
  '15 Exception verschwunden → EF409, Detail exception'
);

select is(
  (select count(*) from public.event_exceptions
   where event_id = 'e2e2e2e2-0000-4000-8000-100000000015' and occurrence_date = '2026-11-09'),
  0::bigint,
  '15 die Absage von A legt die gelöschte Exception nicht wieder an'
);

-- ── Idempotenz ──────────────────────────────────────────────────────────────

-- 16 dieselbe Kennung zweimal: der zweite Aufruf prüft nichts mehr, auch keinen veralteten Stand
select is(
  public.apply_event_change(
    '0a000000-0000-4000-8000-000000000016', 'e2e2e2e2-0000-4000-8000-100000000016', '2026-11-16',
    pg_temp.master_version('e2e2e2e2-0000-4000-8000-100000000016'), null,
    '[{"op":"insert_split_event","changes":{"title":"Training (Split 16)","start_at":"2026-11-16T15:00:00.000Z",
       "end_at":"2026-11-16T16:00:00.000Z","location":null,"description":null},"rrule_count":null}]'),
  'applied',
  '16 erster Aufruf → applied'
);

select is(
  public.apply_event_change(
    '0a000000-0000-4000-8000-000000000016', 'e2e2e2e2-0000-4000-8000-100000000016', '2026-11-16',
    '2026-10-01T00:00:00Z', null,
    '[{"op":"insert_split_event","changes":{"title":"Training (Split 16)","start_at":"2026-11-16T15:00:00.000Z",
       "end_at":"2026-11-16T16:00:00.000Z","location":null,"description":null},"rrule_count":null}]'),
  'already_applied',
  '16 zweiter Aufruf mit derselben Kennung → already_applied, ohne Versionsprüfung'
);

select is(
  (select count(*) from public.events where title = 'Training (Split 16)'),
  1::bigint,
  '16 die Wirkung tritt genau einmal ein'
);

-- ── Rollback ────────────────────────────────────────────────────────────────

-- 17 delete_all_exceptions, dann ein update_master, das events_rrule_count_xor_until verletzt
select throws_ok(
  $$ select public.apply_event_change(
       '0a000000-0000-4000-8000-000000000017', 'e2e2e2e2-0000-4000-8000-100000000017', '2026-11-02',
       pg_temp.master_version('e2e2e2e2-0000-4000-8000-100000000017'), null,
       '[{"op":"delete_all_exceptions"},
         {"op":"update_master","changes":{"title":"Training"},
          "recurrence":{"rrule_freq":"weekly","rrule_interval":1,"rrule_byweekday":[1],
                        "rrule_count":5,"rrule_until":"2027-01-01T00:00:00.000Z"}}]') $$,
  '23514', null,
  '17 der zweite Schritt verletzt einen Constraint → Fehler'
);

select is(
  (select count(*) from public.event_exceptions where event_id = 'e2e2e2e2-0000-4000-8000-100000000017'),
  3::bigint,
  '17 die Exceptions der Serie sind nach dem Fehler unverändert da (Lücke 2)'
);

select results_eq(
  $$ select rrule_count, rrule_until, updated_at < now() from public.events
     where id = 'e2e2e2e2-0000-4000-8000-100000000017' $$,
  $$ values (null::integer, null::timestamptz, true) $$,
  '17 der Master ist nach dem Fehler unverändert'
);

-- ── insert_split_event: Familienfelder nur vom Server ───────────────────────

-- 18 untergeschobene family_id bzw. created_by in changes
select throws_ok(
  $$ select public.apply_event_change(
       '0a000000-0000-4000-8000-000000000018', 'e2e2e2e2-0000-4000-8000-100000000018', '2026-11-16',
       pg_temp.master_version('e2e2e2e2-0000-4000-8000-100000000018'), null,
       '[{"op":"insert_split_event","changes":{"title":"Untergeschoben","start_at":"2026-11-16T15:00:00.000Z",
          "end_at":"2026-11-16T16:00:00.000Z","family_id":"f2f2f2f2-0000-4000-8000-000000000001"},
          "rrule_count":null}]') $$,
  '22023', null,
  '18 insert_split_event mit family_id in changes → 22023'
);

select throws_ok(
  $$ select public.apply_event_change(
       '0a000000-0000-4000-8000-000000000018', 'e2e2e2e2-0000-4000-8000-100000000018', '2026-11-16',
       pg_temp.master_version('e2e2e2e2-0000-4000-8000-100000000018'), null,
       '[{"op":"insert_split_event","changes":{"title":"Untergeschoben","start_at":"2026-11-16T15:00:00.000Z",
          "end_at":"2026-11-16T16:00:00.000Z","created_by":"cccccccc-0000-4000-8000-000000000011"},
          "rrule_count":null}]') $$,
  '22023', null,
  '18 insert_split_event mit created_by in changes → 22023'
);

select is(
  (select count(*) from public.events where title = 'Untergeschoben'),
  0::bigint,
  '18 kein Split-Termin angelegt'
);

-- ── insert_split_event: jede Spalte entschieden ─────────────────────────────

-- 37 Die Fälle 10 und 11 zählen die übernommenen Spalten von Hand auf; eine neue Spalte,
-- die insert_split_event nicht kennt, fiele dort nicht auf — die abgespaltene Hälfte
-- bekäme still ihren Default. Dieser Fall vergleicht deshalb die ganze Zeile über
-- `to_jsonb` und zieht nur die Spalten ab, die der Split bewusst nicht übernimmt:
-- id, created_at, updated_at (vom Server), title, description, location, start_at,
-- end_at (aus `changes`), rrule_count (aus dem Schritt) und rrule_until (nur ohne
-- rrule_count, unten eigens geprüft).
--
-- Der Wertvergleich allein reicht nicht: Steht eine neue Spalte im Master auf ihrem
-- Default, sind Master und Split gleich, ob sie übernommen wird oder nicht. Die erste
-- Prüfung schreibt daher die Spaltenliste fest — kommt eine Spalte hinzu, schlägt sie
-- fehl, bis jemand entscheidet, ob der Split sie übernimmt (dann in insert_split_event,
-- in die Liste unten und mit abweichendem Wert in den Fixture-Patch) oder bewusst nicht
-- (dann zu den abgezogenen Spalten, mit Grund).
select is(
  public.apply_event_change(
    '0a000000-0000-4000-8000-000000000037', 'e2e2e2e2-0000-4000-8000-100000000037', '2026-11-16',
    pg_temp.master_version('e2e2e2e2-0000-4000-8000-100000000037'), null,
    '[{"op":"insert_split_event","changes":{"title":"Vollständig abgespalten","start_at":"2026-11-16T05:00:00.000Z",
       "end_at":"2026-11-17T04:59:59.999Z","location":"Halle 2","description":"ganztägig"},"rrule_count":null}]'),
  'applied',
  '37 insert_split_event aus einer Serie mit Eltern-Zuordnung, ganztägig, fremder Zone → applied'
);

select is(
  (select array_agg(k order by k)
   from public.events m,
        jsonb_object_keys(to_jsonb(m) - array['id', 'created_at', 'updated_at', 'title', 'description',
                                              'location', 'start_at', 'end_at', 'rrule_count', 'rrule_until']) k
   where m.id = 'e2e2e2e2-0000-4000-8000-100000000037'),
  array['all_day', 'child_id', 'created_by', 'family_id', 'parent_id', 'rrule_byweekday', 'rrule_freq',
        'rrule_interval', 'timezone', 'type_id'],
  '37 events hat genau die Spalten, über die für den Split entschieden ist — eine neue gehört hier eingetragen'
);

select is(
  (select to_jsonb(s) - array['id', 'created_at', 'updated_at', 'title', 'description', 'location',
                              'start_at', 'end_at', 'rrule_count', 'rrule_until']
   from public.events s where s.title = 'Vollständig abgespalten'),
  (select to_jsonb(m) - array['id', 'created_at', 'updated_at', 'title', 'description', 'location',
                              'start_at', 'end_at', 'rrule_count', 'rrule_until']
   from public.events m where m.id = 'e2e2e2e2-0000-4000-8000-100000000037'),
  '37 die abgespaltene Hälfte trägt jede übernommene Spalte des Masters, auch parent_id, all_day und timezone'
);

select results_eq(
  $$ select s.title, s.description, s.location, s.start_at, s.end_at, s.rrule_count, s.rrule_until
     from public.events s where s.title = 'Vollständig abgespalten' $$,
  $$ values ('Vollständig abgespalten'::text, 'ganztägig'::text, 'Halle 2'::text,
             '2026-11-16T05:00:00Z'::timestamptz, '2026-11-17T04:59:59.999Z'::timestamptz, null::integer,
             '2027-03-31T21:59:59.999Z'::timestamptz) $$,
  '37 die abgezogenen Spalten kommen aus changes bzw. dem Schritt, rrule_until vom Master'
);

-- ── Ungültige Eingaben (Review Focus 5): je 22023, nichts verbucht, nichts geändert ──

select throws_ok(
  $$ select public.apply_event_change('0b000000-0000-4000-8000-000000000001',
       'e2e2e2e2-0000-4000-8000-100000000019', '2026-11-09',
       pg_temp.master_version('e2e2e2e2-0000-4000-8000-100000000019'),
       pg_temp.exception_version('e2e2e2e2-0000-4000-8000-100000000019', '2026-11-09'),
       '[]') $$,
  '22023', null, 'RF5 p_steps = [] → 22023'
);

select throws_ok(
  $$ select public.apply_event_change('0b000000-0000-4000-8000-000000000002',
       'e2e2e2e2-0000-4000-8000-100000000019', '2026-11-09',
       pg_temp.master_version('e2e2e2e2-0000-4000-8000-100000000019'),
       pg_temp.exception_version('e2e2e2e2-0000-4000-8000-100000000019', '2026-11-09'),
       '[{"op":"delete_all_exceptions"},{"op":"delete_all_exceptions"},{"op":"delete_all_exceptions"},
         {"op":"delete_all_exceptions"},{"op":"delete_all_exceptions"}]') $$,
  '22023', null, 'RF5 fünf Schritte → 22023'
);

select throws_ok(
  $$ select public.apply_event_change('0b000000-0000-4000-8000-000000000003',
       'e2e2e2e2-0000-4000-8000-100000000019', '2026-11-09',
       pg_temp.master_version('e2e2e2e2-0000-4000-8000-100000000019'),
       pg_temp.exception_version('e2e2e2e2-0000-4000-8000-100000000019', '2026-11-09'),
       '{}') $$,
  '22023', null, 'RF5 Objekt statt Array → 22023'
);

select throws_ok(
  $$ select public.apply_event_change('0b000000-0000-4000-8000-000000000004',
       'e2e2e2e2-0000-4000-8000-100000000019', '2026-11-09',
       pg_temp.master_version('e2e2e2e2-0000-4000-8000-100000000019'),
       pg_temp.exception_version('e2e2e2e2-0000-4000-8000-100000000019', '2026-11-09'),
       '["delete_all_exceptions"]') $$,
  '22023', null, 'RF5 Element als String → 22023'
);

select throws_ok(
  $$ select public.apply_event_change('0b000000-0000-4000-8000-000000000005',
       'e2e2e2e2-0000-4000-8000-100000000019', '2026-11-09',
       pg_temp.master_version('e2e2e2e2-0000-4000-8000-100000000019'),
       pg_temp.exception_version('e2e2e2e2-0000-4000-8000-100000000019', '2026-11-09'),
       '[{"op":"truncate_events"}]') $$,
  '22023', null, 'RF5 unbekannte op → 22023'
);

select throws_ok(
  $$ select public.apply_event_change('0b000000-0000-4000-8000-000000000006',
       'e2e2e2e2-0000-4000-8000-100000000019', '2026-11-09',
       pg_temp.master_version('e2e2e2e2-0000-4000-8000-100000000019'),
       pg_temp.exception_version('e2e2e2e2-0000-4000-8000-100000000019', '2026-11-09'),
       '[{"changes":{"title":"ohne op"}}]') $$,
  '22023', null, 'RF5 Schritt ohne op → 22023'
);

select throws_ok(
  $$ select public.apply_event_change('0b000000-0000-4000-8000-000000000007',
       'e2e2e2e2-0000-4000-8000-100000000019', '2026-11-09',
       pg_temp.master_version('e2e2e2e2-0000-4000-8000-100000000019'),
       pg_temp.exception_version('e2e2e2e2-0000-4000-8000-100000000019', '2026-11-09'),
       '[{"op":"update_master","changes":{"title":"x","type_id":"00000000-0000-4000-8000-000000000000"}}]') $$,
  '22023', null, 'RF5 unbekannter Schlüssel in changes → 22023'
);

select throws_ok(
  $$ select public.apply_event_change('0b000000-0000-4000-8000-000000000008',
       'e2e2e2e2-0000-4000-8000-100000000019', '2026-11-09',
       pg_temp.master_version('e2e2e2e2-0000-4000-8000-100000000019'),
       pg_temp.exception_version('e2e2e2e2-0000-4000-8000-100000000019', '2026-11-09'),
       '[{"op":"modify_occurrence","override":{"title":"x","action":"cancelled"}}]') $$,
  '22023', null, 'RF5 unbekannter Schlüssel in override → 22023'
);

select throws_ok(
  $$ select public.apply_event_change('0b000000-0000-4000-8000-000000000009',
       'e2e2e2e2-0000-4000-8000-100000000019', '2026-11-09',
       pg_temp.master_version('e2e2e2e2-0000-4000-8000-100000000019'),
       pg_temp.exception_version('e2e2e2e2-0000-4000-8000-100000000019', '2026-11-09'),
       '[{"op":"update_master","changes":{"title":"x"},"recurrence":{"rrule_wkst":"MO"}}]') $$,
  '22023', null, 'RF5 unbekannter Schlüssel in recurrence → 22023'
);

select throws_ok(
  $$ select public.apply_event_change('0b000000-0000-4000-8000-000000000010',
       'e2e2e2e2-0000-4000-8000-100000000019', '2026-11-09',
       pg_temp.master_version('e2e2e2e2-0000-4000-8000-100000000019'),
       pg_temp.exception_version('e2e2e2e2-0000-4000-8000-100000000019', '2026-11-09'),
       '[{"op":"cancel_occurrence","occurrence_key":"2026-11-16"}]') $$,
  '22023', null, 'RF5 Schritt mit occurrence_key → 22023'
);

select throws_ok(
  $$ select public.apply_event_change('0b000000-0000-4000-8000-000000000011',
       'e2e2e2e2-0000-4000-8000-100000000019', '2026-11-09',
       pg_temp.master_version('e2e2e2e2-0000-4000-8000-100000000019'),
       pg_temp.exception_version('e2e2e2e2-0000-4000-8000-100000000019', '2026-11-09'),
       '[{"op":"delete_master","event_id":"e9e9e9e9-0000-4000-8000-000000000001"}]') $$,
  '22023', null, 'RF5 Schritt mit event_id → 22023'
);

select throws_ok(
  $$ select public.apply_event_change('0b000000-0000-4000-8000-000000000012',
       'e2e2e2e2-0000-4000-8000-100000000019', '2026-11-09',
       pg_temp.master_version('e2e2e2e2-0000-4000-8000-100000000019'),
       pg_temp.exception_version('e2e2e2e2-0000-4000-8000-100000000019', '2026-11-09'),
       '[{"op":"delete_exceptions_from","from":"2026-11-01"}]') $$,
  '22023', null, 'RF5 Schritt mit from → 22023'
);

select throws_ok(
  $$ select public.apply_event_change('0b000000-0000-4000-8000-000000000013',
       'e2e2e2e2-0000-4000-8000-100000000019', '2026-11-09',
       pg_temp.master_version('e2e2e2e2-0000-4000-8000-100000000019'),
       pg_temp.exception_version('e2e2e2e2-0000-4000-8000-100000000019', '2026-11-09'),
       null) $$,
  '22023', null, 'p_steps null → 22023'
);

select throws_ok(
  $$ select public.apply_event_change('0b000000-0000-4000-8000-000000000014',
       'e2e2e2e2-0000-4000-8000-100000000019', null,
       pg_temp.master_version('e2e2e2e2-0000-4000-8000-100000000019'), null,
       '[{"op":"modify_occurrence","override":{"title":"x"}}]') $$,
  '22023', null, 'modify_occurrence ohne p_occurrence_key → 22023'
);

select throws_ok(
  $$ select public.apply_event_change('0b000000-0000-4000-8000-000000000015',
       'e2e2e2e2-0000-4000-8000-100000000019', '2026-11-09',
       pg_temp.master_version('e2e2e2e2-0000-4000-8000-100000000019'),
       pg_temp.exception_version('e2e2e2e2-0000-4000-8000-100000000019', '2026-11-09'),
       '[{"op":"update_master","changes":{"start_at":"gestern"}}]') $$,
  '22023', null, 'ungültiger Zeitstempel in changes → 22023'
);

select throws_ok(
  $$ select public.apply_event_change('0b000000-0000-4000-8000-000000000016',
       'e2e2e2e2-0000-4000-8000-100000000019', '2026-11-09',
       pg_temp.master_version('e2e2e2e2-0000-4000-8000-100000000019'),
       pg_temp.exception_version('e2e2e2e2-0000-4000-8000-100000000019', '2026-11-09'),
       '[{"op":"set_rrule_count","count":"2"}]') $$,
  '22023', null, 'count als String → 22023'
);

select throws_ok(
  $$ select public.apply_event_change('0b000000-0000-4000-8000-000000000017',
       'e2e2e2e2-0000-4000-8000-100000000019', '2026-11-09',
       pg_temp.master_version('e2e2e2e2-0000-4000-8000-100000000019'),
       pg_temp.exception_version('e2e2e2e2-0000-4000-8000-100000000019', '2026-11-09'),
       '[{"op":"delete_master"},{"op":"delete_all_exceptions"}]') $$,
  '22023', null, 'Schritt nach delete_master → 22023'
);

select throws_ok(
  $$ select public.apply_event_change('0b000000-0000-4000-8000-000000000018',
       'e2e2e2e2-0000-4000-8000-100000000019', '2026-11-09',
       null,
       pg_temp.exception_version('e2e2e2e2-0000-4000-8000-100000000019', '2026-11-09'),
       '[{"op":"delete_all_exceptions"}]') $$,
  '22023', null, 'p_seen_master_updated_at null → 22023'
);

select throws_ok(
  $$ select public.apply_event_change('0b000000-0000-4000-8000-000000000019',
       'e2e2e2e2-0000-4000-8000-100000000019', null,
       pg_temp.master_version('e2e2e2e2-0000-4000-8000-100000000019'),
       '2026-10-01T00:00:00Z',
       '[{"op":"delete_all_exceptions"}]') $$,
  '22023', null, 'gesehene Exception ohne p_occurrence_key → 22023'
);

select throws_ok(
  $$ select public.apply_event_change(null,
       'e2e2e2e2-0000-4000-8000-100000000019', '2026-11-09',
       pg_temp.master_version('e2e2e2e2-0000-4000-8000-100000000019'),
       pg_temp.exception_version('e2e2e2e2-0000-4000-8000-100000000019', '2026-11-09'),
       '[{"op":"delete_all_exceptions"}]') $$,
  '22023', null, 'p_request_id null → 22023'
);

select throws_ok(
  $$ select public.apply_event_change('0b000000-0000-4000-8000-000000000021',
       'e2e2e2e2-0000-4000-8000-100000000019', '2026-11-09',
       pg_temp.master_version('e2e2e2e2-0000-4000-8000-100000000019'),
       pg_temp.exception_version('e2e2e2e2-0000-4000-8000-100000000019', '2026-11-09'),
       '[{"op":"set_rrule_until"}]') $$,
  '22023', null, 'fehlender Pflichtschlüssel (until) → 22023'
);

select results_eq(
  $$ select updated_at < now(), (select count(*) from public.event_exceptions x
                                 where x.event_id = e.id)
     from public.events e where e.id = 'e2e2e2e2-0000-4000-8000-100000000019' $$,
  $$ values (true, 1::bigint) $$,
  'RF5 nach den abgelehnten Aufrufen ist der Termin samt Exception unverändert'
);

-- ── Nicht gefunden (EF404) ──────────────────────────────────────────────────

select throws_ok(
  $$ select public.apply_event_change('0a000000-0000-4000-8000-000000000020',
       '00000000-0000-4000-8000-0000000000ff', null, '2026-10-01T00:00:00Z', null,
       '[{"op":"delete_master"}]') $$,
  'EF404', null,
  'Master fehlt → EF404'
);

set local request.jwt.claims to '{"sub":"cccccccc-0000-4000-8000-000000000001","role":"authenticated"}';

select throws_ok(
  $$ select public.apply_event_change('0a000000-0000-4000-8000-000000000021',
       'e1e1e1e1-0000-4000-8000-000000000001', '2026-11-03', '2026-10-01T00:00:00Z', null,
       '[{"op":"update_master","changes":{"title":"Gekapert"}}]') $$,
  'EF404', null,
  'C (Fremdfamilie) auf den Termin von A → EF404'
);

select throws_ok(
  $$ select public.apply_event_change('0a000000-0000-4000-8000-000000000022',
       'e2e2e2e2-0000-4000-8000-000000000001', '2026-11-16', '2026-10-01T00:00:00Z', null,
       '[{"op":"cancel_occurrence"}]') $$,
  'EF404', null,
  'C sagt eine Occurrence von A ab → EF404'
);

reset role;

select results_eq(
  $$ select title, updated_at < now() from public.events where id = 'e1e1e1e1-0000-4000-8000-000000000001' $$,
  $$ values ('Einzeltermin'::text, true) $$,
  'nach dem EF404 von C ist die Zeile von A unverändert'
);

select is(
  (select count(*) from public.event_exceptions
   where event_id = 'e2e2e2e2-0000-4000-8000-000000000001' and occurrence_date = '2026-11-16'),
  0::bigint,
  'nach dem EF404 von C hat die Serie von A keine neue Exception'
);

select is(
  (select count(*) from private.event_change_requests
   where request_id in ('0a000000-0000-4000-8000-000000000020', '0a000000-0000-4000-8000-000000000021',
                        '0a000000-0000-4000-8000-000000000022')),
  0::bigint,
  'nach EF404 ist keine Kennung verbucht'
);

-- ── Nichts verbucht nach Konflikt, Rollback und ungültiger Eingabe ──────────

select is(
  (select count(*) from private.event_change_requests
   where request_id in ('0a000000-0000-4000-8000-000000000013', '0a000000-0000-4000-8000-000000000014',
                        '0a000000-0000-4000-8000-000000000015', '0a000000-0000-4000-8000-000000000017',
                        '0a000000-0000-4000-8000-000000000018', '0a000000-0000-4000-8000-000000000098',
                        '0a000000-0000-4000-8000-000000000099')),
  0::bigint,
  'nach EF409, Rollback, 22023 und abgewiesenem Aufruf ist keine Kennung verbucht'
);

select is(
  (select count(*) from private.event_change_requests where request_id::text like '0b000000-%'),
  0::bigint,
  'RF5 nach 22023 ist keine Kennung verbucht'
);

select results_eq(
  $$ select user_id, event_id from private.event_change_requests
     where request_id = '0a000000-0000-4000-8000-000000000001' $$,
  $$ values ('aaaaaaaa-0000-4000-8000-000000000001'::uuid, 'e1e1e1e1-0000-4000-8000-100000000001'::uuid) $$,
  'die Verbuchung trägt den aufrufenden Nutzer und den Termin'
);

-- ── Verbuchungen sind privat ────────────────────────────────────────────────

set local role authenticated;
set local request.jwt.claims to '{"sub":"bbbbbbbb-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  (select count(*) from private.event_change_requests
   where request_id = '0a000000-0000-4000-8000-000000000001'),
  0::bigint,
  'B sieht die Verbuchung von A nicht'
);

select is(
  (select count(*) from private.event_change_requests),
  0::bigint,
  'B sieht überhaupt keine fremden Verbuchungen'
);

delete from private.event_change_requests;

select throws_ok(
  $$ insert into private.event_change_requests (user_id, request_id, event_id)
     values ('aaaaaaaa-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000097',
             'e1e1e1e1-0000-4000-8000-000000000001') $$,
  '42501', null,
  'B kann keine Kennung im Namen von A verbuchen'
);

select throws_ok(
  $$ update private.event_change_requests set created_at = now() $$,
  '42501', null,
  'authenticated hat kein update auf event_change_requests'
);

reset role;

select is(
  (select count(*) from private.event_change_requests
   where request_id = '0a000000-0000-4000-8000-000000000001'),
  1::bigint,
  'B kann die Verbuchung von A nicht löschen'
);

-- ── Aufräumen nach 30 Tagen ─────────────────────────────────────────────────

insert into private.event_change_requests (user_id, request_id, event_id, created_at) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '0c000000-0000-4000-8000-000000000001',
   'e1e1e1e1-0000-4000-8000-000000000001', now() - interval '31 days'),
  ('aaaaaaaa-0000-4000-8000-000000000001', '0c000000-0000-4000-8000-000000000002',
   'e1e1e1e1-0000-4000-8000-000000000001', now() - interval '29 days'),
  ('bbbbbbbb-0000-4000-8000-000000000001', '0c000000-0000-4000-8000-000000000003',
   'e1e1e1e1-0000-4000-8000-000000000001', now() - interval '31 days');

set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  public.apply_event_change(
    '0a000000-0000-4000-8000-000000000030', 'e1e1e1e1-0000-4000-8000-100000000020', '2026-11-03',
    pg_temp.master_version('e1e1e1e1-0000-4000-8000-100000000020'), null,
    '[{"op":"update_master","changes":{"title":"Einzeltermin (aufgeräumt)"}}]'),
  'applied',
  '30 Aufruf von A → applied'
);

reset role;

select results_eq(
  $$ select request_id from private.event_change_requests
     where request_id::text like '0c000000-%' order by request_id $$,
  $$ values ('0c000000-0000-4000-8000-000000000002'::uuid), ('0c000000-0000-4000-8000-000000000003'::uuid) $$,
  '30 der Aufruf räumt die eigene Verbuchung älter als 30 Tage weg, die jüngere und die von B bleiben'
);

insert into private.event_change_requests (user_id, request_id, event_id, created_at) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '0c000000-0000-4000-8000-000000000004',
   'e1e1e1e1-0000-4000-8000-000000000001', now() - interval '31 days');

set local role authenticated;

select is(
  public.apply_event_change(
    '0a000000-0000-4000-8000-000000000030', 'e1e1e1e1-0000-4000-8000-100000000020', '2026-11-03',
    '2026-10-01T00:00:00Z', null,
    '[{"op":"update_master","changes":{"title":"Einzeltermin (aufgeräumt)"}}]'),
  'already_applied',
  '30 Wiederholung → already_applied'
);

reset role;

select is(
  (select count(*) from private.event_change_requests
   where request_id = '0c000000-0000-4000-8000-000000000004'),
  0::bigint,
  '30 auch ein already_applied räumt auf (§6: bei jedem Aufruf)'
);

-- ── Fremde Zeile am Schlüssel nach der Prüfung (Upsert-Bedingung) ──────────

-- 31 Eine bestehende Exception desselben Termins wird nach der Prüfung per UPDATE von
-- `occurrence_date` auf den Schlüssel geschoben — der Weg, auf dem eine fremde Zeile die
-- Upsert-Bedingung tatsächlich erreicht: Ein UPDATE braucht keine Fremdschlüsselprüfung
-- und wartet deshalb nicht auf die Master-Sperre. Ein frischer INSERT aus einer zweiten
-- Sitzung kommt dort nicht an (er wartet auf die Sperre oder endet im Deadlock, siehe
-- Kommentar in der Migration). In einer Sitzung nachgestellt: Ein Trigger auf der Kopie
-- verschiebt die Exception vom 09.11. auf den 16.11., während update_master läuft, also
-- zwischen Prüfung und modify_occurrence.
create function pg_temp.move_exception_onto_key()
returns trigger
language plpgsql
as $$
begin
  update public.event_exceptions set occurrence_date = '2026-11-16'
  where event_id = new.id and occurrence_date = '2026-11-09';
  return null;
end;
$$;

create trigger move_exception_onto_key
after update on public.events
for each row
when (new.id = 'e2e2e2e2-0000-4000-8000-100000000031')
execute function pg_temp.move_exception_onto_key();

do $$ begin
  perform pg_temp.clone_event('e2e2e2e2-0000-4000-8000-000000000001', 'e2e2e2e2-0000-4000-8000-100000000031');
end $$;

set local role authenticated;

select is(
  pg_temp.error_of($$ select public.apply_event_change(
    '0a000000-0000-4000-8000-000000000031', 'e2e2e2e2-0000-4000-8000-100000000031', '2026-11-16',
    pg_temp.master_version('e2e2e2e2-0000-4000-8000-100000000031'), null,
    '[{"op":"update_master","changes":{"title":"Training (A)"}},
      {"op":"modify_occurrence","override":{"title":"Training (A, 16.11.)"}}]') $$),
  'EF409 exception',
  '31 eine nach der Prüfung auf den Schlüssel geschobene Exception → EF409 statt stillem Überschreiben'
);

select results_eq(
  $$ select title, updated_at < now(),
            (select array_agg(x.occurrence_date) from public.event_exceptions x where x.event_id = e.id)
     from public.events e where e.id = 'e2e2e2e2-0000-4000-8000-100000000031' $$,
  $$ values ('Training'::text, true, array['2026-11-09'::date]) $$,
  '31 der frühere Schritt (update_master) ist mit zurückgerollt, die Exception liegt wieder am 09.11.'
);

reset role;
drop trigger move_exception_onto_key on public.events;

-- ── insert_split_event liest den gesperrten Master ──────────────────────────

-- 32 Ein früherer Schritt ändert UNTIL; die abgespaltene Hälfte übernimmt trotzdem den
-- Stand aus der Sperre, wie `insertSplitEvent(master, …)` den vorab geladenen Master.
do $$ begin
  perform pg_temp.clone_event('e2e2e2e2-0000-4000-8000-000000000001', 'e2e2e2e2-0000-4000-8000-100000000032',
    '{"rrule_until": "2027-06-30T21:59:59.999Z"}');
end $$;

set local role authenticated;

select is(
  public.apply_event_change(
    '0a000000-0000-4000-8000-000000000032', 'e2e2e2e2-0000-4000-8000-100000000032', '2026-12-07',
    pg_temp.master_version('e2e2e2e2-0000-4000-8000-100000000032'), null,
    '[{"op":"set_rrule_until","until":"2026-12-06T22:59:59.999Z"},
      {"op":"insert_split_event","changes":{"title":"Training (Split 32)","start_at":"2026-12-07T16:00:00.000Z",
       "end_at":"2026-12-07T17:00:00.000Z","location":null,"description":null},"rrule_count":null}]'),
  'applied',
  '32 set_rrule_until gefolgt von insert_split_event → applied'
);

select results_eq(
  $$ select (select rrule_until from public.events where title = 'Training (Split 32)'),
            (select rrule_until from public.events where id = 'e2e2e2e2-0000-4000-8000-100000000032') $$,
  $$ values ('2027-06-30T21:59:59.999Z'::timestamptz, '2026-12-06T22:59:59.999Z'::timestamptz) $$,
  '32 die neue Hälfte trägt UNTIL aus der Sperre, der Master das neue'
);

reset role;

-- ── Weitere Fälle aus dem Review ────────────────────────────────────────────

do $$ begin
  perform pg_temp.clone_event('e2e2e2e2-0000-4000-8000-000000000001', ('e2e2e2e2-0000-4000-8000-1000000000' || n)::uuid)
  from unnest(array['33', '34', '36']) as n;
  perform pg_temp.clone_event('e1e1e1e1-0000-4000-8000-000000000001', ('e1e1e1e1-0000-4000-8000-1000000000' || n)::uuid)
  from unnest(array['35', '36']) as n;
end $$;

set local role authenticated;

-- 33 cancel_occurrence auf eine bestehende modified-Exception: Der Override geht mit weg.
select is(
  public.apply_event_change(
    '0a000000-0000-4000-8000-000000000033', 'e2e2e2e2-0000-4000-8000-100000000033', '2026-11-09',
    pg_temp.master_version('e2e2e2e2-0000-4000-8000-100000000033'),
    pg_temp.exception_version('e2e2e2e2-0000-4000-8000-100000000033', '2026-11-09'),
    '[{"op":"cancel_occurrence"}]'),
  'applied',
  '33 cancel_occurrence auf eine modified-Exception → applied'
);

select results_eq(
  $$ select action::text, override from public.event_exceptions
     where event_id = 'e2e2e2e2-0000-4000-8000-100000000033' and occurrence_date = '2026-11-09' $$,
  $$ values ('cancelled'::text, null::jsonb) $$,
  '33 aus der modified-Exception wird cancelled ohne Override'
);

-- 34 "recurrence": null zählt wie nicht mitgeschickt.
select is(
  public.apply_event_change(
    '0a000000-0000-4000-8000-000000000034', 'e2e2e2e2-0000-4000-8000-100000000034', '2026-11-16',
    pg_temp.master_version('e2e2e2e2-0000-4000-8000-100000000034'), null,
    '[{"op":"update_master","changes":{"title":"Training (34)"},"recurrence":null}]'),
  'applied',
  '34 update_master mit recurrence null → applied'
);

select results_eq(
  $$ select title, rrule_freq::text, rrule_interval, rrule_byweekday, rrule_count, rrule_until
     from public.events where id = 'e2e2e2e2-0000-4000-8000-100000000034' $$,
  $$ values ('Training (34)'::text, 'weekly'::text, 1, array[1], null::integer, null::timestamptz) $$,
  '34 recurrence null lässt die Regel stehen'
);

-- 35 Das Aufräumen lässt die eigene, abgelaufene Verbuchung der aufrufenden Kennung stehen.
reset role;
insert into private.event_change_requests (user_id, request_id, event_id, created_at) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '0c000000-0000-4000-8000-000000000005',
   'e1e1e1e1-0000-4000-8000-100000000035', now() - interval '31 days');
set local role authenticated;

select is(
  public.apply_event_change(
    '0c000000-0000-4000-8000-000000000005', 'e1e1e1e1-0000-4000-8000-100000000035', '2026-11-03',
    pg_temp.master_version('e1e1e1e1-0000-4000-8000-100000000035'), null,
    '[{"op":"update_master","changes":{"title":"Einzeltermin (35)"}}]'),
  'already_applied',
  '35 Retry mit einer über 30 Tage alten Kennung → already_applied'
);

select results_eq(
  $$ select (select count(*) from private.event_change_requests
             where request_id = '0c000000-0000-4000-8000-000000000005'),
            (select title from public.events where id = 'e1e1e1e1-0000-4000-8000-100000000035') $$,
  $$ values (1::bigint, 'Einzeltermin'::text) $$,
  '35 die Verbuchung, die den Retry abgefangen hat, bleibt stehen, und nichts wird ausgeführt'
);

-- 36 Die Kennung ist an ihren Termin gebunden.
select is(
  public.apply_event_change(
    '0a000000-0000-4000-8000-000000000036', 'e1e1e1e1-0000-4000-8000-100000000036', '2026-11-03',
    pg_temp.master_version('e1e1e1e1-0000-4000-8000-100000000036'), null,
    '[{"op":"update_master","changes":{"title":"Einzeltermin (36)"}}]'),
  'applied',
  '36 erster Aufruf → applied'
);

select throws_ok(
  $$ select public.apply_event_change(
       '0a000000-0000-4000-8000-000000000036', 'e2e2e2e2-0000-4000-8000-100000000036', '2026-11-16',
       pg_temp.master_version('e2e2e2e2-0000-4000-8000-100000000036'), null,
       '[{"op":"update_master","changes":{"title":"Training (36)"}}]') $$,
  '22023', 'apply_event_change: Kennung ist schon für einen anderen Termin verbucht',
  '36 dieselbe Kennung für einen anderen Termin → 22023'
);

select results_eq(
  $$ select (select title from public.events where id = 'e2e2e2e2-0000-4000-8000-100000000036'),
            (select array_agg(event_id) from private.event_change_requests
             where request_id = '0a000000-0000-4000-8000-000000000036') $$,
  $$ values ('Training'::text, array['e1e1e1e1-0000-4000-8000-100000000036'::uuid]) $$,
  '36 der andere Termin ist unverändert, die Verbuchung zeigt weiter auf den ersten'
);

-- ── Familie während des Aufrufs verloren (Trefferprüfung, Lücke 2) ──────────

-- Nach dem Review-Repro: A verliert ihre Familie mitten im Aufruf („parents: delete
-- self", ein zweites Gerät). Unter READ COMMITTED sieht der nächste Schritt den Master
-- per RLS nicht mehr. Die Trigger entfernen A's Eltern-Zeile an genau der Stelle, an der
-- ein zweites Gerät es könnte, und nur für die Kopien dieses Abschnitts. Die Kopien
-- gehören B (`created_by`), damit das `on delete set null` von A's Zeile sie nicht anfasst.
reset role;

do $$ begin
  perform pg_temp.clone_event('e2e2e2e2-0000-4000-8000-000000000001', ('e2e2e2e2-0000-4000-8000-1000000000' || n)::uuid,
    '{"created_by": "bbbbbbbb-0000-4000-8000-000000000011"}')
  from unnest(array['40', '41', '42', '44']) as n;
  perform pg_temp.clone_event('e3e3e3e3-0000-4000-8000-000000000001', 'e3e3e3e3-0000-4000-8000-100000000043');
end $$;

create function pg_temp.remove_a()
returns trigger
language plpgsql
as $$
begin
  set local role postgres;
  delete from public.parents where id = 'aaaaaaaa-0000-4000-8000-000000000011';
  set local role authenticated;
  return null;
end;
$$;

create trigger remove_a_on_exception_delete
after delete on public.event_exceptions
for each row
when (old.event_id in ('e2e2e2e2-0000-4000-8000-100000000040', 'e2e2e2e2-0000-4000-8000-100000000044'))
execute function pg_temp.remove_a();

create trigger remove_a_on_event_update
after update on public.events
for each row
when (new.id = 'e2e2e2e2-0000-4000-8000-100000000041')
execute function pg_temp.remove_a();

create trigger remove_a_on_split_insert
after insert on public.events
for each row
when (new.title in ('Split 42', 'Split 43'))
execute function pg_temp.remove_a();

set local role authenticated;

-- 40 Der Repro: delete_all_exceptions, dann update_master mit neuer Regel.
select throws_ok(
  $$ select public.apply_event_change(
       '0d000000-0000-4000-8000-000000000040', 'e2e2e2e2-0000-4000-8000-100000000040', null,
       pg_temp.master_version('e2e2e2e2-0000-4000-8000-100000000040'), null,
       '[{"op":"delete_all_exceptions"},
         {"op":"update_master","changes":{"title":"Neuer Rhythmus"},
          "recurrence":{"rrule_freq":"weekly","rrule_interval":2,"rrule_byweekday":[1],
                        "rrule_count":null,"rrule_until":null}}]') $$,
  'EF404', 'apply_event_change: Schritt 2 (update_master) trifft den Termin nicht mehr',
  '40 update_master trifft nach Familienverlust null Zeilen → EF404'
);

-- 41 Der letzte Schritt löscht Exceptions und darf null Zeilen treffen; die Prüfung der
--    Familie am Ende fängt es.
select throws_ok(
  $$ select public.apply_event_change(
       '0d000000-0000-4000-8000-000000000041', 'e2e2e2e2-0000-4000-8000-100000000041', '2026-11-09',
       pg_temp.master_version('e2e2e2e2-0000-4000-8000-100000000041'),
       pg_temp.exception_version('e2e2e2e2-0000-4000-8000-100000000041', '2026-11-09'),
       '[{"op":"set_rrule_until","until":"2026-11-08T22:59:59.999Z"},{"op":"delete_exceptions_from"}]') $$,
  'EF404', 'apply_event_change: nicht mehr in der Familie des Termins',
  '41 Familienverlust vor einem Löschschritt am Ende → EF404'
);

-- 42 Forward-Split: set_rrule_until nach dem Split trifft nichts mehr.
select throws_ok(
  $$ select public.apply_event_change(
       '0d000000-0000-4000-8000-000000000042', 'e2e2e2e2-0000-4000-8000-100000000042', '2026-11-16',
       pg_temp.master_version('e2e2e2e2-0000-4000-8000-100000000042'), null,
       '[{"op":"insert_split_event","changes":{"title":"Split 42","start_at":"2026-11-16T15:00:00.000Z",
          "end_at":"2026-11-16T16:00:00.000Z","location":null,"description":null},"rrule_count":null},
         {"op":"set_rrule_until","until":"2026-11-15T22:59:59.999Z"}]') $$,
  'EF404', 'apply_event_change: Schritt 2 (set_rrule_until) trifft den Termin nicht mehr',
  '42 set_rrule_until trifft nach Familienverlust null Zeilen → EF404'
);

-- 43 Zählbegrenzter Split: set_rrule_count nach dem Split trifft nichts mehr.
select throws_ok(
  $$ select public.apply_event_change(
       '0d000000-0000-4000-8000-000000000043', 'e3e3e3e3-0000-4000-8000-100000000043', '2026-11-17',
       pg_temp.master_version('e3e3e3e3-0000-4000-8000-100000000043'), null,
       '[{"op":"insert_split_event","changes":{"title":"Split 43","start_at":"2026-11-17T07:00:00.000Z",
          "end_at":"2026-11-17T08:00:00.000Z","location":null,"description":null},"rrule_count":8},
         {"op":"set_rrule_count","count":2}]') $$,
  'EF404', 'apply_event_change: Schritt 2 (set_rrule_count) trifft den Termin nicht mehr',
  '43 set_rrule_count trifft nach Familienverlust null Zeilen → EF404'
);

-- 44 delete_master nach dem Familienverlust.
select throws_ok(
  $$ select public.apply_event_change(
       '0d000000-0000-4000-8000-000000000044', 'e2e2e2e2-0000-4000-8000-100000000044', null,
       pg_temp.master_version('e2e2e2e2-0000-4000-8000-100000000044'), null,
       '[{"op":"delete_all_exceptions"},{"op":"delete_master"}]') $$,
  'EF404', 'apply_event_change: Schritt 2 (delete_master) trifft den Termin nicht mehr',
  '44 delete_master trifft nach Familienverlust null Zeilen → EF404'
);

reset role;
drop trigger remove_a_on_exception_delete on public.event_exceptions;
drop trigger remove_a_on_event_update on public.events;
drop trigger remove_a_on_split_insert on public.events;

select results_eq(
  $$ select title, rrule_interval, updated_at < now(),
            (select count(*) from public.event_exceptions x where x.event_id = e.id)
     from public.events e where e.id = 'e2e2e2e2-0000-4000-8000-100000000040' $$,
  $$ values ('Training'::text, 1, true, 1::bigint) $$,
  '40 nach dem EF404: Master unverändert, die Exception der Serie noch da'
);

select results_eq(
  $$ select e.id, e.updated_at < now(), e.rrule_until, e.rrule_count,
            (select count(*) from public.event_exceptions x where x.event_id = e.id)
     from public.events e
     where e.id in ('e2e2e2e2-0000-4000-8000-100000000041', 'e2e2e2e2-0000-4000-8000-100000000042',
                    'e3e3e3e3-0000-4000-8000-100000000043', 'e2e2e2e2-0000-4000-8000-100000000044')
     order by e.id $$,
  $$ values ('e2e2e2e2-0000-4000-8000-100000000041'::uuid, true, null::timestamptz, null::integer, 1::bigint),
            ('e2e2e2e2-0000-4000-8000-100000000042'::uuid, true, null::timestamptz, null::integer, 1::bigint),
            ('e2e2e2e2-0000-4000-8000-100000000044'::uuid, true, null::timestamptz, null::integer, 1::bigint),
            ('e3e3e3e3-0000-4000-8000-100000000043'::uuid, true, null::timestamptz, 10, 0::bigint) $$,
  '41–44 nach dem EF404: alle Master und Exceptions unverändert'
);

select is(
  (select count(*) from public.events where title in ('Split 42', 'Split 43')),
  0::bigint,
  '42–43 die abgespaltene Hälfte ist mit zurückgerollt'
);

select is(
  (select count(*) from private.event_change_requests
   where request_id::text like '0d000000-%'),
  0::bigint,
  '40–44 nach dem EF404 ist keine Kennung verbucht'
);

select is(
  (select count(*) from public.parents where id = 'aaaaaaaa-0000-4000-8000-000000000011'),
  1::bigint,
  '40–44 die Entfernung von A ist mit zurückgerollt'
);

-- ── Account gelöscht: Verbuchungen gehen mit ───────────────────────────────

-- 45 Läuft zuletzt, weil er C samt Eltern-Zeile entfernt.
insert into private.event_change_requests (user_id, request_id, event_id) values
  ('cccccccc-0000-4000-8000-000000000001', '0c000000-0000-4000-8000-000000000006',
   'e9e9e9e9-0000-4000-8000-000000000001');

delete from auth.users where id = 'cccccccc-0000-4000-8000-000000000001';

select is(
  (select count(*) from private.event_change_requests
   where user_id = 'cccccccc-0000-4000-8000-000000000001'),
  0::bigint,
  '45 wird der Account gelöscht, gehen seine Verbuchungen mit (on delete cascade)'
);

select * from finish();

rollback;
