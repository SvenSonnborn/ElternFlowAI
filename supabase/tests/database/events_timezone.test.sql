-- pgTAP: Trigger public.events_timezone_known — events.timezone muss dem Server bekannt sein.
-- Spec: docs/superpowers/specs/2026-11-19-kalender-stille-fehler-design.md (F)
--
-- Läuft in einer Transaktion und rollt am Ende zurück; die Seed-Daten bleiben unberührt.
-- Jeder Fall arbeitet auf einer Kopie des Seed-Termins e1e1e1e1-…-0001 (`pg_temp.clone_event`).
--
-- Feste Kennungen (Kopien): e1e1e1e1-0000-4000-8000-2000000000NN, NN = Fallnummer.

begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

-- ── Helfer ──────────────────────────────────────────────────────────────────

-- Kopiert den Seed-Einzeltermin unter neuer ID mit anderer Zone.
create function pg_temp.clone_event(p_dst uuid, p_zone text)
returns void
language sql
as $$
  insert into public.events
  select (jsonb_populate_record(e, jsonb_build_object('id', p_dst, 'timezone', p_zone))).*
  from public.events e
  where e.id = 'e1e1e1e1-0000-4000-8000-000000000001';
$$;

-- Die Meldung eines Aufrufs. Der Block rollt die Wirkung zurück.
create function pg_temp.message_of(p_sql text)
returns text
language plpgsql
as $$
begin
  execute p_sql;
  return 'kein Fehler';
exception when others then
  return sqlerrm;
end;
$$;

-- ── 1. Bekannte Zonen werden angenommen ─────────────────────────────────────

select lives_ok($$ select pg_temp.clone_event('e1e1e1e1-0000-4000-8000-200000000001', 'Europe/Berlin') $$,
  'Europe/Berlin wird angenommen');
select lives_ok($$ select pg_temp.clone_event('e1e1e1e1-0000-4000-8000-200000000002', 'UTC') $$,
  'UTC wird angenommen');
select lives_ok($$ select pg_temp.clone_event('e1e1e1e1-0000-4000-8000-200000000003', 'Asia/Calcutta') $$,
  'der Altname Asia/Calcutta wird angenommen');
select lives_ok($$ select pg_temp.clone_event('e1e1e1e1-0000-4000-8000-200000000004', '+00:00') $$,
  'die Offset-Form +00:00 wird angenommen, obwohl pg_timezone_names sie nicht kennt');
select lives_ok($$ select pg_temp.clone_event('e1e1e1e1-0000-4000-8000-200000000005', 'Europe/Kyiv') $$,
  'Europe/Kyiv wird angenommen');
select lives_ok($$ select pg_temp.clone_event('e1e1e1e1-0000-4000-8000-200000000006', 'America/Ciudad_Juarez') $$,
  'America/Ciudad_Juarez wird angenommen');

-- Ein BEFORE-Trigger, der `null` liefert, verwirft die Zeile ohne Fehler; `lives_ok` sähe das nicht.
select is(
  (select count(*)::int from public.events
    where id between 'e1e1e1e1-0000-4000-8000-200000000001' and 'e1e1e1e1-0000-4000-8000-200000000006'),
  6, 'alle sechs Kopien stehen in der Tabelle');

-- ── 2. Unbekannte Zonen werden abgewiesen ───────────────────────────────────

select throws_ok($$ select pg_temp.clone_event('e1e1e1e1-0000-4000-8000-200000000007', 'Mars/Olympus') $$,
  '23514', null, 'Einfügen mit Mars/Olympus wird abgewiesen');

select ok(
  pg_temp.message_of($$ select pg_temp.clone_event('e1e1e1e1-0000-4000-8000-200000000008', 'Mars/Olympus') $$)
    like '%Mars/Olympus%',
  'die Meldung nennt die Zone'
);

select throws_ok(
  $$ update public.events set timezone = 'Mars/Olympus' where id = 'e1e1e1e1-0000-4000-8000-200000000001' $$,
  '23514', null, 'Ändern der Zone auf Mars/Olympus wird abgewiesen');

-- ── 3. Altlasten bleiben bearbeitbar ────────────────────────────────────────

-- Eine Zeile mit unbekannter Zone, wie sie aus der Zeit vor dem Trigger stammen könnte.
alter table public.events disable trigger events_timezone_known;
select pg_temp.clone_event('e1e1e1e1-0000-4000-8000-200000000009', 'Mars/Olympus');
alter table public.events enable trigger events_timezone_known;

select lives_ok(
  $$ update public.events set title = 'Umbenannt' where id = 'e1e1e1e1-0000-4000-8000-200000000009' $$,
  'eine Altlast lässt sich umbenennen');

select is(
  (select title from public.events where id = 'e1e1e1e1-0000-4000-8000-200000000009'),
  'Umbenannt', 'der neue Titel der Altlast steht in der Zeile');

select lives_ok(
  $$ update public.events set timezone = timezone where id = 'e1e1e1e1-0000-4000-8000-200000000009' $$,
  'eine unveränderte Zone wird nicht erneut geprüft');

select throws_ok(
  $$ update public.events set timezone = 'Mars/Phobos' where id = 'e1e1e1e1-0000-4000-8000-200000000009' $$,
  '23514', null, 'auch die Altlast kann nicht auf eine andere unbekannte Zone wechseln');

select lives_ok(
  $$ update public.events set timezone = 'Europe/Berlin' where id = 'e1e1e1e1-0000-4000-8000-200000000009' $$,
  'die Altlast lässt sich auf eine bekannte Zone korrigieren');

select is(
  (select timezone from public.events where id = 'e1e1e1e1-0000-4000-8000-200000000009'),
  'Europe/Berlin', 'die korrigierte Zone steht in der Zeile');

select * from finish();

rollback;
