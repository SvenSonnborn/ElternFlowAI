-- pgTAP: public.events_in_range — ein Fenster laden, samt weit verschobener Occurrences.
-- Spec: docs/superpowers/specs/2026-11-19-kalender-stille-fehler-design.md (D)
--
-- Läuft in einer Transaktion und rollt am Ende zurück; die Seed-Daten bleiben unberührt.
-- Die Fixtures legt postgres an (BYPASSRLS), gelesen wird als A der Testfamilie: Die
-- Funktion läuft als security invoker, RLS gilt also wie im Client.
--
-- Jede Serie ist eine Kopie der Seed-Wochenserie e2 (montags, eine Stunde) mit eigenem Start
-- und eigenem `rrule_until`, ohne deren Exception (`pg_temp.clone_series`).
--
-- Feste Kennungen (Kopien): <Vorlage>-0000-4000-8000-3000000000NN
--   e2…01      Fall 1  Serie bis Juni 2026, Occurrence 2026-06-22 per Override auf den 10. August
--   e2…02      Fall 2  Serie ab 2027, Occurrence 2027-01-04 per Override auf den 14. Dezember 2026
--   e2…03, 04  Fall 3  wie 1, Override-Start mit Offset bzw. ohne Offset
--   e2…05      Fall 4  wie 1, Override nur mit start_at
--   e2…06      Fall 5  wie 1, Exception aber abgesagt
--   e2…07–10   Fall 6  wie 1, Override-Start unbrauchbar: "kaputt", 30. Februar, Zahl, fehlt
--   e1…11      Fall 7  Einzeltermin im Oktober 2026
--   e2…12, 13  Fall 8  wie 5, Override-Start Ende Juli: Ende 13 Stunden bzw. 1 Tag 13 Stunden vor August

begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

-- ── Helfer ──────────────────────────────────────────────────────────────────

-- Kopiert die Seed-Serie e2 unter neuer ID, eine Stunde ab `p_start`, bis `p_until`.
create function pg_temp.clone_series(p_dst uuid, p_start timestamptz, p_until timestamptz)
returns void
language sql
as $$
  insert into public.events
  select (jsonb_populate_record(e, jsonb_build_object(
    'id', p_dst, 'start_at', p_start, 'end_at', p_start + interval '1 hour', 'rrule_until', p_until))).*
  from public.events e
  where e.id = 'e2e2e2e2-0000-4000-8000-000000000001';
$$;

-- Liefert `events_in_range` den Termin für dieses Fenster? Läuft mit den Rechten der
-- aktuellen Rolle.
create function pg_temp.loads(p_id uuid, p_start timestamptz, p_end timestamptz)
returns boolean
language sql
stable
as $$ select exists (select 1 from public.events_in_range(p_start, p_end) where id = p_id) $$;

-- ── Fixtures (als postgres, BYPASSRLS) ──────────────────────────────────────

select pg_temp.clone_series(('e2e2e2e2-0000-4000-8000-3000000000' || n)::uuid,
                            '2026-06-01T14:00:00Z', '2026-06-30T23:59:59Z')
from unnest(array['01', '03', '04', '05', '06', '07', '08', '09', '10', '12', '13']) as n;

select pg_temp.clone_series('e2e2e2e2-0000-4000-8000-300000000002', '2027-01-04T14:00:00Z', null);

insert into public.events
select (jsonb_populate_record(e, jsonb_build_object(
  'id', 'e1e1e1e1-0000-4000-8000-300000000011',
  'start_at', '2026-10-14T08:00:00Z', 'end_at', '2026-10-14T09:00:00Z'))).*
from public.events e
where e.id = 'e1e1e1e1-0000-4000-8000-000000000001';

insert into public.event_exceptions (event_id, occurrence_date, action, override) values
  ('e2e2e2e2-0000-4000-8000-300000000001', '2026-06-22', 'modified',
   '{"start_at":"2026-08-10T07:00:00.000Z","end_at":"2026-08-10T08:00:00.000Z"}'),
  ('e2e2e2e2-0000-4000-8000-300000000002', '2027-01-04', 'modified',
   '{"start_at":"2026-12-14T14:00:00.000Z","end_at":"2026-12-14T15:00:00.000Z"}'),
  ('e2e2e2e2-0000-4000-8000-300000000003', '2026-06-22', 'modified',
   '{"start_at":"2026-08-10T09:00:00+02:00","end_at":"2026-08-10T08:00:00.000Z"}'),
  ('e2e2e2e2-0000-4000-8000-300000000004', '2026-06-22', 'modified',
   '{"start_at":"2026-08-10T07:00:00","end_at":"2026-08-10T08:00:00.000Z"}'),
  ('e2e2e2e2-0000-4000-8000-300000000005', '2026-06-22', 'modified',
   '{"start_at":"2026-08-10T07:00:00.000Z"}'),
  ('e2e2e2e2-0000-4000-8000-300000000006', '2026-06-22', 'cancelled',
   '{"start_at":"2026-08-10T07:00:00.000Z","end_at":"2026-08-10T08:00:00.000Z"}'),
  -- Fall 6: Das Ende liegt jeweils im August, nur der Start ist unbrauchbar.
  ('e2e2e2e2-0000-4000-8000-300000000007', '2026-06-22', 'modified',
   '{"start_at":"kaputt","end_at":"2026-08-10T08:00:00.000Z"}'),
  ('e2e2e2e2-0000-4000-8000-300000000008', '2026-06-22', 'modified',
   '{"start_at":"2026-02-30T07:00:00Z","end_at":"2026-08-10T08:00:00.000Z"}'),
  ('e2e2e2e2-0000-4000-8000-300000000009', '2026-06-22', 'modified',
   '{"start_at":123,"end_at":"2026-08-10T08:00:00.000Z"}'),
  ('e2e2e2e2-0000-4000-8000-300000000010', '2026-06-22', 'modified',
   '{"end_at":"2026-08-10T08:00:00.000Z"}'),
  -- Fall 8: Nur start_at, die Dauer erbt der Override vom Master (eine Stunde).
  ('e2e2e2e2-0000-4000-8000-300000000012', '2026-06-22', 'modified',
   '{"start_at":"2026-07-31T10:00:00.000Z"}'),
  ('e2e2e2e2-0000-4000-8000-300000000013', '2026-06-22', 'modified',
   '{"start_at":"2026-07-30T10:00:00.000Z"}');

set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}';

-- ── 1. Weit verschobene Occurrences laden mit ───────────────────────────────
--
-- Das alte Prädikat (start_at ≤ Ende, rrule_until leer oder ≥ Anfang) trifft keine der
-- beiden Serien: Fall 1 endet vor August, Fall 2 beginnt nach Dezember.

select ok(
  pg_temp.loads('e2e2e2e2-0000-4000-8000-300000000001', '2026-08-01T00:00:00Z', '2026-08-31T23:59:59Z'),
  'Serie bis Juni, Occurrence per Override auf den August → im August-Fenster geladen'
);

select ok(
  pg_temp.loads('e2e2e2e2-0000-4000-8000-300000000002', '2026-12-01T00:00:00Z', '2026-12-31T23:59:59Z'),
  'Serie ab 2027, Occurrence per Override auf Dezember 2026 → im Dezember-Fenster geladen'
);

-- ── 2. ISO mit und ohne Offset, Override ohne Ende ──────────────────────────

select ok(
  pg_temp.loads('e2e2e2e2-0000-4000-8000-300000000003', '2026-08-01T00:00:00Z', '2026-08-31T23:59:59Z'),
  'Override-Start mit Offset (+02:00) → im August-Fenster geladen'
);

select ok(
  pg_temp.loads('e2e2e2e2-0000-4000-8000-300000000004', '2026-08-01T00:00:00Z', '2026-08-31T23:59:59Z'),
  'Override-Start ohne Offset → im August-Fenster geladen'
);

select ok(
  pg_temp.loads('e2e2e2e2-0000-4000-8000-300000000005', '2026-08-01T00:00:00Z', '2026-08-31T23:59:59Z'),
  'Override nur mit start_at erbt die Dauer des Masters → im August-Fenster geladen'
);

-- ── 3. Was nichts weitet ────────────────────────────────────────────────────

select ok(
  not pg_temp.loads('e2e2e2e2-0000-4000-8000-300000000006', '2026-08-01T00:00:00Z', '2026-08-31T23:59:59Z'),
  'abgesagte Exception mit August-Start → im August-Fenster nicht geladen'
);

-- Alle vier unbrauchbaren Overrides liegen in diesem Aufruf gleichzeitig vor.
select lives_ok(
  $$ select count(*) from public.events_in_range('2026-08-01T00:00:00Z', '2026-08-31T23:59:59Z') $$,
  'unbrauchbare Override-Starts lassen das Laden nicht scheitern'
);

select ok(
  not pg_temp.loads('e2e2e2e2-0000-4000-8000-300000000007', '2026-08-01T00:00:00Z', '2026-08-31T23:59:59Z'),
  'Override-Start "kaputt" → im August-Fenster nicht geladen'
);

select ok(
  not pg_temp.loads('e2e2e2e2-0000-4000-8000-300000000008', '2026-08-01T00:00:00Z', '2026-08-31T23:59:59Z'),
  'Override-Start am 30. Februar → im August-Fenster nicht geladen'
);

select ok(
  not pg_temp.loads('e2e2e2e2-0000-4000-8000-300000000009', '2026-08-01T00:00:00Z', '2026-08-31T23:59:59Z'),
  'Override-Start als Zahl → im August-Fenster nicht geladen'
);

select ok(
  not pg_temp.loads('e2e2e2e2-0000-4000-8000-300000000010', '2026-08-01T00:00:00Z', '2026-08-31T23:59:59Z'),
  'Override ohne start_at → im August-Fenster nicht geladen'
);

-- ── 4. Polster von einem Tag ────────────────────────────────────────────────
--
-- Pinnt das Polster von einem Tag und die geerbte Dauer: Ohne Polster fiele 12 heraus, bei
-- einem Polster von zwei Tagen oder mehr käme 13 hinein.

select ok(
  pg_temp.loads('e2e2e2e2-0000-4000-8000-300000000012', '2026-08-01T00:00:00Z', '2026-08-31T23:59:59Z'),
  'Override endet 13 Stunden vor dem Fenster (innerhalb des Tages Polster) → geladen'
);

select ok(
  not pg_temp.loads('e2e2e2e2-0000-4000-8000-300000000013', '2026-08-01T00:00:00Z', '2026-08-31T23:59:59Z'),
  'Override endet 1 Tag 13 Stunden vor dem Fenster (jenseits des Polsters) → nicht geladen'
);

-- ── 5. Kontrolle ────────────────────────────────────────────────────────────

select ok(
  not pg_temp.loads('e2e2e2e2-0000-4000-8000-300000000001', '2026-10-01T00:00:00Z', '2026-10-31T23:59:59Z'),
  'die Serie aus Fall 1 → im Oktober-Fenster nicht geladen (das Override-Intervall liegt im August)'
);

select ok(
  pg_temp.loads('e1e1e1e1-0000-4000-8000-300000000011', '2026-10-01T00:00:00Z', '2026-10-31T23:59:59Z'),
  'Einzeltermin im Oktober → im Oktober-Fenster geladen (das alte Prädikat wirkt weiter)'
);

select * from finish();

rollback;
