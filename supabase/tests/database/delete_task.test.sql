-- pgTAP: public.delete_task.
-- Spec: docs/superpowers/specs/2026-10-21-calendar-transaction-rpc-design.md (§7, §8)
--
-- Läuft in einer Transaktion und rollt am Ende zurück; die Seed-Daten bleiben unberührt.
-- Ausnahme ist der Abschnitt „Nebenläufigkeit": Ein echter Wettlauf braucht zwei weitere
-- Sitzungen (dblink), und die sehen nur Committetes. Er legt deshalb eigene Aufgaben an,
-- committet sie und räumt sie am Ende wieder weg. Bricht ein Lauf vorher ab, räumt der
-- nächste zuerst auf.
--
-- Die weiteren Sitzungen melden sich mit dem Passwort des lokalen Stacks an (postgres /
-- postgres), und zwar über die Adresse, unter der dieser Test selbst verbunden ist: dblink
-- verlangt von Nicht-Superusern eine Anmeldung mit Passwort, und 127.0.0.1 steht im lokalen
-- pg_hba auf trust. `supabase test db` verbindet sich über das Docker-Netz, dort gilt
-- scram-sha-256. Über einen Unix-Socket gestartet, bricht der Abschnitt mit einer Meldung ab.
--
-- Feste Kennungen (Seed-IDs siehe Kopf von supabase/seed.sql):
--   Kopien von a1 in dieser Transaktion   a1a1a1a1-0000-4000-8000-1000000000NN   NN = Fallnummer
--   committete Wettlauf-Aufgaben          a5a5a5a5-0000-4000-8000-1000000000NN   NN = 51, 52

begin;

create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

select plan(25);

-- ── Helfer ──────────────────────────────────────────────────────────────────

-- Kopiert die Seed-Aufgabe a1 unter neuer ID. Die Kopie übernimmt ihr `updated_at`, das vor
-- `now()` liegt; `updated_at < now()` heißt in dieser Transaktion also „unverändert".
create function pg_temp.clone_task(p_dst uuid)
returns void
language sql
as $$
  insert into public.tasks
  select (jsonb_populate_record(t, jsonb_build_object('id', p_dst))).*
  from public.tasks t
  where t.id = 'a1a1a1a1-0000-4000-8000-000000000001';
$$;

-- Der Stand, den ein Client gesehen hätte. Für alle Kopien derselbe: der von a1, einmal als
-- postgres gelesen. Eine Abfrage zur Laufzeit sähe als C oder als B ohne Familie per RLS nichts.
do $$
begin
  perform set_config('pgtap.seen',
    (select updated_at::text from public.tasks where id = 'a1a1a1a1-0000-4000-8000-000000000001'), true);
end;
$$;

create function pg_temp.seen()
returns timestamptz
language sql
stable
as $$ select current_setting('pgtap.seen')::timestamptz $$;

-- SQLSTATE plus Detail eines Aufrufs; der Block rollt die Wirkung zurück.
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

create function pg_temp.dsn()
returns text
language plpgsql
stable
as $$
begin
  if inet_server_addr() is null then
    raise exception 'Der Wettlauf braucht eine TCP-Verbindung (supabase test db), keinen Unix-Socket';
  end if;
  return format('host=%s port=%s dbname=%s user=postgres password=postgres',
                host(inet_server_addr()), inet_server_port(), current_database());
end;
$$;

-- Eine Anweisung in einer eigenen Sitzung als postgres, sofort committet.
create function pg_temp.committed(p_sql text)
returns void
language plpgsql
as $$
begin
  perform extensions.dblink_connect('setup', pg_temp.dsn());
  perform extensions.dblink_exec('setup', p_sql);
  perform extensions.dblink_disconnect('setup');
end;
$$;

-- Der Wettlauf, gegen den die Sperre in delete_task schützt: B schreibt an der Aufgabe,
-- während A sie löscht. B öffnet eine Transaktion, führt `p_b_sql` aus und hält damit die
-- Zeilensperre. A ruft delete_task mit dem Stand von vorher auf. Erst wenn A nachweislich
-- an B's Sperre wartet (pg_blocking_pids), committet B — so ist die Reihenfolge fest und der
-- Test nicht vom Zufall abhängig. Rückgabe ist A's Antwort, ein Fehler als „SQLSTATE
-- Detail" wie bei error_of. A's Transaktion rollt danach zurück.
create function pg_temp.race(p_task uuid, p_b_sql text)
returns text
language plpgsql
as $$
declare
  v_seen      timestamptz := (select t.updated_at from public.tasks t where t.id = p_task);
  v_a_pid     integer;
  v_b_pid     integer;
  v_waited    boolean := false;
  v_deadline  timestamptz;
  v_result    text;
  v_detail    text;
begin
  perform extensions.dblink_connect('b', pg_temp.dsn());
  perform extensions.dblink_connect('a', pg_temp.dsn());
  select t.pid into v_b_pid from extensions.dblink('b', 'select pg_backend_pid()') as t(pid integer);
  select t.pid into v_a_pid from extensions.dblink('a', 'select pg_backend_pid()') as t(pid integer);

  -- Obergrenzen, damit ein Fehler im Ablauf den Testlauf nicht hängen lässt.
  perform extensions.dblink_exec('a', $q$set lock_timeout = '10s'$q$);
  perform extensions.dblink_exec('b', $q$set lock_timeout = '10s'$q$);

  perform extensions.dblink_exec('b', 'begin');
  perform extensions.dblink_exec('b', 'set local role authenticated');
  perform extensions.dblink_exec('b',
    $q$set local request.jwt.claims to '{"sub":"bbbbbbbb-0000-4000-8000-000000000001","role":"authenticated"}'$q$);
  perform extensions.dblink_exec('b', p_b_sql);

  perform extensions.dblink_exec('a', 'begin');
  perform extensions.dblink_exec('a', 'set local role authenticated');
  perform extensions.dblink_exec('a',
    $q$set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}'$q$);
  perform extensions.dblink_send_query('a',
    format('select public.delete_task(%L::uuid, %L::timestamptz)', p_task, v_seen));

  v_deadline := clock_timestamp() + interval '10 seconds';
  loop
    v_waited := v_b_pid = any (pg_blocking_pids(v_a_pid));
    exit when v_waited or clock_timestamp() > v_deadline;
    perform pg_sleep(0.01);
  end loop;

  perform extensions.dblink_exec('b', 'commit');

  begin
    select t.r into v_result from extensions.dblink_get_result('a') as t(r text);
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    v_result := sqlstate || coalesce(' ' || nullif(v_detail, ''), '');
  end;
  -- dblink verlangt einen zweiten Abruf, der leer zurückkommt, bevor die Verbindung wieder frei ist.
  perform 1 from extensions.dblink_get_result('a') as t(r text);
  perform extensions.dblink_exec('a', 'rollback');
  perform extensions.dblink_disconnect('a');
  perform extensions.dblink_disconnect('b');

  if not v_waited then
    return 'A hat nicht an der Sperre von B gewartet: ' || coalesce(v_result, 'null');
  end if;
  return v_result;
end;
$$;

-- ── Struktur und Rechte ─────────────────────────────────────────────────────

select has_function(
  'public', 'delete_task', array['uuid', 'timestamp with time zone'],
  'public.delete_task existiert mit der Signatur aus §7'
);

select is(
  (select prosecdef from pg_proc where oid = to_regprocedure('public.delete_task(uuid,timestamptz)')),
  false,
  'delete_task läuft als security invoker'
);

select is(
  (select proconfig from pg_proc where oid = to_regprocedure('public.delete_task(uuid,timestamptz)')),
  array['search_path=""'],
  'delete_task setzt einen leeren search_path'
);

select ok(
  not has_function_privilege('anon', 'public.delete_task(uuid,timestamptz)', 'execute'),
  'anon hat kein execute auf delete_task'
);

select ok(
  has_function_privilege('authenticated', 'public.delete_task(uuid,timestamptz)', 'execute'),
  'authenticated hat execute auf delete_task'
);

-- ── Nebenläufigkeit (zwei weitere Sitzungen, committet) ─────────────────────
--
-- Steht vor allem anderen: Diese Transaktion darf noch keine Sperre auf `tasks` halten,
-- auf die eine der beiden Sitzungen warten müsste.

do $$
begin
  perform pg_temp.committed($q$ delete from public.tasks where id::text like 'a5a5a5a5-%' $q$);
  perform pg_temp.committed($q$
    insert into public.tasks
    select (jsonb_populate_record(t, jsonb_build_object('id', n.id, 'title', n.title))).*
    from public.tasks t,
         (values ('a5a5a5a5-0000-4000-8000-100000000051'::uuid, 'Wettlauf 51'),
                 ('a5a5a5a5-0000-4000-8000-100000000052'::uuid, 'Wettlauf 52')) as n(id, title)
    where t.id = 'a1a1a1a1-0000-4000-8000-000000000001'
  $q$);
end;
$$;

-- 51 Ohne Sperre läse A die alte Fassung, verglich erfolgreich und löschte danach B's neue.
select is(
  pg_temp.race('a5a5a5a5-0000-4000-8000-100000000051',
    $$ update public.tasks set title = 'Wettlauf 51 (B)' where id = 'a5a5a5a5-0000-4000-8000-100000000051' $$),
  'EF409 task',
  '51 B ändert die Aufgabe, während A wartet → EF409 statt B''s Fassung zu löschen'
);

select is(
  (select title from public.tasks where id = 'a5a5a5a5-0000-4000-8000-100000000051'),
  'Wettlauf 51 (B)',
  '51 danach steht die Aufgabe noch, mit B''s Änderung'
);

-- 52 Ohne Sperre träfe A's Löschen nach B's Commit null Zeilen und meldete forbidden.
select is(
  pg_temp.race('a5a5a5a5-0000-4000-8000-100000000052',
    $$ delete from public.tasks where id = 'a5a5a5a5-0000-4000-8000-100000000052' $$),
  'missing',
  '52 B löscht die Aufgabe, während A wartet → missing'
);

do $$
begin
  perform pg_temp.committed($q$ delete from public.tasks where id::text like 'a5a5a5a5-%' $q$);
end;
$$;

select is(
  (select count(*) from public.tasks where id::text like 'a5a5a5a5-%'),
  0::bigint,
  'die committeten Wettlauf-Aufgaben sind wieder weg'
);

-- ── Fixtures (als postgres, BYPASSRLS) ──────────────────────────────────────

do $$
begin
  perform pg_temp.clone_task(('a1a1a1a1-0000-4000-8000-1000000000' || n)::uuid)
  from unnest(array['01', '04', '05', '06', '07', '08']) as n;
end;
$$;

-- ── anon und ohne Nutzer ────────────────────────────────────────────────────

set local role anon;

select throws_ok(
  $$ select public.delete_task('a1a1a1a1-0000-4000-8000-100000000001', '2026-10-01T00:00:00Z') $$,
  '42501', null,
  'anon kann delete_task nicht aufrufen'
);

reset role;
set local role authenticated;
set local request.jwt.claims to '{"role":"authenticated"}';

-- 07 Ohne `sub` gibt es keine Familie (§7 Schritt 1).
select is(
  public.delete_task('a1a1a1a1-0000-4000-8000-100000000007', pg_temp.seen()),
  'forbidden',
  '07 ohne auth.uid() → forbidden'
);

-- ── Als A ───────────────────────────────────────────────────────────────────

set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  public.delete_task('a1a1a1a1-0000-4000-8000-100000000001', pg_temp.seen()),
  'deleted',
  '01 gesehener Stand stimmt → deleted'
);

select is(
  public.delete_task('a1a1a1a1-0000-4000-8000-100000000001', pg_temp.seen()),
  'missing',
  '02 dieselbe Aufgabe noch einmal → missing (schon gelöscht)'
);

select is(
  public.delete_task('00000000-0000-4000-8000-0000000000ff', pg_temp.seen()),
  'missing',
  '03 unbekannte ID → missing'
);

select is(
  pg_temp.error_of($$ select public.delete_task('a1a1a1a1-0000-4000-8000-100000000004',
                                                pg_temp.seen() - interval '1 second') $$),
  'EF409 task',
  '04 gesehener Stand weicht ab → EF409, Detail task'
);

select throws_ok(
  $$ select public.delete_task('a1a1a1a1-0000-4000-8000-100000000004', pg_temp.seen() - interval '1 second') $$,
  'EF409', 'delete_task: Konflikt',
  '04 die Meldung nennt keine Inhalte der Zeile'
);

-- 09 Ungültige Eingabe
select throws_ok(
  $$ select public.delete_task(null, '2026-10-01T00:00:00Z') $$,
  '22023', null,
  '09 ohne p_task_id → 22023'
);

select throws_ok(
  $$ select public.delete_task('a1a1a1a1-0000-4000-8000-100000000004', null) $$,
  '22023', null,
  '09 ohne p_seen_updated_at → 22023'
);

-- ── Als C (Fremdfamilie) ────────────────────────────────────────────────────
--
-- 'missing' darf nicht verraten, dass die ID in einer anderen Familie existiert: C bekommt
-- dasselbe wie für eine unbekannte ID, auch mit einem falschen Stand (kein EF409-Orakel).

set local request.jwt.claims to '{"sub":"cccccccc-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  public.delete_task('a1a1a1a1-0000-4000-8000-100000000005', pg_temp.seen()),
  'missing',
  '05 C auf die Aufgabe von A, mit richtigem Stand → missing'
);

select is(
  public.delete_task('a1a1a1a1-0000-4000-8000-100000000005', '2026-10-01T00:00:00Z'),
  'missing',
  '05 C auf die Aufgabe von A, mit falschem Stand → missing, kein EF409'
);

-- ── B ohne Familie ──────────────────────────────────────────────────────────
--
-- Der Fall aus §7: B wurde aus der Familie entfernt, während der Undo-Timer lief.

reset role;
delete from public.parents where id = 'bbbbbbbb-0000-4000-8000-000000000011';
set local role authenticated;
set local request.jwt.claims to '{"sub":"bbbbbbbb-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  public.delete_task('a1a1a1a1-0000-4000-8000-100000000006', pg_temp.seen()),
  'forbidden',
  '06 B ohne Familie → forbidden'
);

select is(
  public.delete_task('00000000-0000-4000-8000-0000000000ff', pg_temp.seen()),
  'forbidden',
  '06 B ohne Familie auf eine unbekannte ID → ebenfalls forbidden (kein Existenz-Orakel)'
);

-- ── Das Löschen trifft nichts mehr (Trefferprüfung) ─────────────────────────
--
-- Sperre und Vergleich bestanden, das DELETE selbst sieht die Zeile aber nicht mehr. Real
-- passiert das, wenn A ihre Familie zwischen den beiden Anweisungen verliert: RLS wertet
-- `current_family_id()` in jedem Statement neu aus. Nachgestellt mit einer restriktiven
-- Policy, die die Kopie nur vor dem DELETE verbirgt. Läuft zuletzt: Das `create policy`
-- sperrt `tasks` bis zum Ende dieser Transaktion.

reset role;

create policy "pgtap: Kopie 08 nicht löschbar"
  on public.tasks as restrictive for delete
  to authenticated
  using ( id <> 'a1a1a1a1-0000-4000-8000-100000000008' );

set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  public.delete_task('a1a1a1a1-0000-4000-8000-100000000008', pg_temp.seen()),
  'forbidden',
  '08 das DELETE trifft null Zeilen → forbidden statt deleted'
);

-- ── Stand danach ────────────────────────────────────────────────────────────

reset role;

select is(
  (select count(*) from public.tasks where id = 'a1a1a1a1-0000-4000-8000-100000000001'),
  0::bigint,
  '01 die Aufgabe ist gelöscht'
);

select results_eq(
  $$ select id from public.tasks
     where id::text like 'a1a1a1a1-0000-4000-8000-1000000000%' and updated_at < now()
     order by id $$,
  $$ values ('a1a1a1a1-0000-4000-8000-100000000004'::uuid),
            ('a1a1a1a1-0000-4000-8000-100000000005'::uuid),
            ('a1a1a1a1-0000-4000-8000-100000000006'::uuid),
            ('a1a1a1a1-0000-4000-8000-100000000007'::uuid),
            ('a1a1a1a1-0000-4000-8000-100000000008'::uuid) $$,
  '04–08 nach EF409, missing und forbidden stehen die Aufgaben unverändert da'
);

select * from finish();

rollback;
