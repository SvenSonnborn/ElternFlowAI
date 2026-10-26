-- pgTAP: Rechte der Trigger-Funktionen und Durchsicht der security-definer-Funktionen.
-- Spec: docs/superpowers/specs/2026-10-21-calendar-transaction-rpc-design.md (§8)
--
-- Läuft in einer Transaktion und rollt am Ende zurück; die Seed-Daten bleiben unberührt.
--
-- Drei Teile:
--   1. Die drei Trigger-Funktionen sind nicht mehr per RPC aufrufbar — und ihre Trigger
--      feuern trotzdem weiter. Postgres prüft EXECUTE nur bei CREATE TRIGGER.
--   2. Die vier gewollten security-definer-Funktionen: Einstellungen und Rechte, dazu ein
--      Inventar, das jede neue definer-Funktion in public und jedes execute für anon meldet.
--   3. Das Verhalten, auf dem die Durchsicht ihr „kein Mangel" stützt: Einladung nur mit
--      gültigem Token und nur einmal, keine Unterscheidung zwischen unbekanntem, abgelaufenem
--      und benutztem Token, kein zweiter Beitritt, keine fremde Familie.
--
-- Feste Kennungen (Seed-IDs siehe Kopf von supabase/seed.sql):
--   Einladungen (Testfamilie)   1e000000-0000-4000-8000-0000000000NN   01 gültig, 02 abgelaufen, 03 benutzt
--   unbekanntes Token           1e000000-0000-4000-8000-0000000000ff

begin;

create extension if not exists pgtap with schema extensions;

select plan(33);

-- ── Helfer ──────────────────────────────────────────────────────────────────

-- Kann `realtime.messages` jetzt eine Zeile aufnehmen? Die Tabelle ist nach Tagen
-- partitioniert, und die Partitionen legt der Realtime-Dienst an, nicht eine Migration.
-- Fehlt die passende, bricht der Insert ab, und `realtime.send` macht daraus nur eine
-- WARNING — der Broadcast-Beleg unten sähe dann aus wie ein Trigger, der nicht feuert.
-- Die Probe fügt eine Zeile ein, wie `realtime.send` es tut, und rollt sie über einen
-- eigenen Fehlercode sofort wieder zurück. Rückgabe 'bereit' oder der Fehler.
create function pg_temp.messages_partition_ready()
returns text
language plpgsql
as $$
begin
  begin
    insert into realtime.messages (topic, extension, event, payload, private)
    values ('pgtap:probe', 'broadcast', 'probe', '{}'::jsonb, true);
    raise exception 'Probe zurückrollen' using errcode = 'PT001';
  exception
    when sqlstate 'PT001' then
      return 'bereit';
    when others then
      return sqlstate || ' ' || sqlerrm;
  end;
end;
$$;

-- ── 1. Trigger-Funktionen: kein execute per RPC ─────────────────────────────

select ok(
  not has_function_privilege('anon', 'public.broadcast_family_change()', 'execute'),
  'anon hat kein execute auf broadcast_family_change'
);

select ok(
  not has_function_privilege('authenticated', 'public.broadcast_family_change()', 'execute'),
  'authenticated hat kein execute auf broadcast_family_change'
);

select ok(
  not has_function_privilege('anon', 'public.set_updated_at()', 'execute'),
  'anon hat kein execute auf set_updated_at'
);

select ok(
  not has_function_privilege('authenticated', 'public.set_updated_at()', 'execute'),
  'authenticated hat kein execute auf set_updated_at'
);

select ok(
  not has_function_privilege('anon', 'public.set_reminder_family_id()', 'execute'),
  'anon hat kein execute auf set_reminder_family_id'
);

select ok(
  not has_function_privilege('authenticated', 'public.set_reminder_family_id()', 'execute'),
  'authenticated hat kein execute auf set_reminder_family_id'
);

-- Vorher endete ein direkter Aufruf erst im Funktionsrumpf (0A000, „trigger functions can
-- only be called as triggers"); jetzt lehnt ihn schon die Rechteprüfung ab.
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}';

select throws_ok(
  $$ select public.broadcast_family_change() $$,
  '42501', null,
  'broadcast_family_change direkt aufgerufen → 42501'
);

select throws_ok(
  $$ select public.set_updated_at() $$,
  '42501', null,
  'set_updated_at direkt aufgerufen → 42501'
);

select throws_ok(
  $$ select public.set_reminder_family_id() $$,
  '42501', null,
  'set_reminder_family_id direkt aufgerufen → 42501'
);

-- ── 1. … und die Trigger feuern weiter ──────────────────────────────────────

reset role;

select is(
  pg_temp.messages_partition_ready(),
  'bereit',
  'Voraussetzung: realtime.messages hat eine Partition für heute (legt der lokale Realtime-Dienst an)'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}';

update public.events set title = 'Beleg: Broadcast' where id = 'e1e1e1e1-0000-4000-8000-000000000001';

update public.tasks set title = 'Beleg: updated_at', updated_at = '2000-01-01T00:00:00Z'
where id = 'a2a2a2a2-0000-4000-8000-000000000001';

-- Die Familie im Insert ist absichtlich die falsche: Der Trigger muss sie aus der Aufgabe
-- übernehmen. Die Insert-Policy prüft nur die Aufgabe, nicht diese Spalte.
insert into public.reminders (family_id, task_id, offset_minutes)
values ('f2f2f2f2-0000-4000-8000-000000000001', 'a1a1a1a1-0000-4000-8000-000000000001', 4321);

reset role;

-- broadcast_family_change: Das Update von A landet als Nachricht auf dem privaten Topic der
-- Familie, mit dem frischen updated_at (set_updated_at läuft als BEFORE-Trigger davor).
select results_eq(
  $$ select m.topic, m.event, m.extension, m.private,
            (m.payload -> 'record' ->> 'updated_at')::timestamptz = now()
     from realtime.messages m
     where m.payload -> 'record' ->> 'id' = 'e1e1e1e1-0000-4000-8000-000000000001'
       and m.payload -> 'record' ->> 'title' = 'Beleg: Broadcast' $$,
  $$ values ('family:f1f1f1f1-0000-4000-8000-000000000001'::text, 'UPDATE'::text, 'broadcast'::text, true, true) $$,
  'broadcast_family_change feuert weiter: Update von A → Nachricht auf family:<id>'
);

select is(
  (select updated_at from public.tasks where id = 'a2a2a2a2-0000-4000-8000-000000000001'),
  now(),
  'set_updated_at feuert weiter: updated_at rückt vor, auch gegen einen mitgeschickten Wert'
);

select is(
  (select family_id from public.reminders
   where task_id = 'a1a1a1a1-0000-4000-8000-000000000001' and offset_minutes = 4321),
  'f1f1f1f1-0000-4000-8000-000000000001'::uuid,
  'set_reminder_family_id feuert weiter: family_id kommt aus der Aufgabe, nicht vom Client'
);

-- ── 2. Die vier gewollten security-definer-Funktionen ───────────────────────

select results_eq(
  $$ select p.proname::text collate "default", p.prosecdef, p.proconfig collate "default"
     from pg_proc p
     where p.oid in ('public.accept_invitation(uuid,text,text,text)'::regprocedure,
                     'public.create_family(text,text,text,text)'::regprocedure,
                     'public.regenerate_invitation(uuid)'::regprocedure,
                     'public.current_family_id()'::regprocedure)
     order by 1 $$,
  $$ values ('accept_invitation'::text, true, array['search_path=""']),
            ('create_family', true, array['search_path=""']),
            ('current_family_id', true, array['search_path=""']),
            ('regenerate_invitation', true, array['search_path=""']) $$,
  'die vier definer-Funktionen: security definer mit festem, leerem search_path'
);

select results_eq(
  $$ select p.proname::text collate "default",
            has_function_privilege('anon', p.oid, 'execute'),
            has_function_privilege('authenticated', p.oid, 'execute')
     from pg_proc p
     where p.oid in ('public.accept_invitation(uuid,text,text,text)'::regprocedure,
                     'public.create_family(text,text,text,text)'::regprocedure,
                     'public.regenerate_invitation(uuid)'::regprocedure,
                     'public.current_family_id()'::regprocedure)
     order by 1 $$,
  $$ values ('accept_invitation'::text, false, true),
            ('create_family', false, true),
            ('current_family_id', false, true),
            ('regenerate_invitation', false, true) $$,
  'die vier definer-Funktionen: nicht für anon, nur für authenticated'
);

-- Inventar: Eine neue definer-Funktion in public oder ein execute für anon schlägt hier an
-- und braucht eine eigene Durchsicht, bevor der Test angepasst wird.
select results_eq(
  $$ select p.proname::text collate "default"
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
     order by 1 $$,
  $$ values ('accept_invitation'::text), ('broadcast_family_change'), ('create_family'),
            ('current_family_id'), ('regenerate_invitation') $$,
  'Inventar: genau diese security-definer-Funktionen liegen in public'
);

select is(
  (select coalesce(array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text), '{}')
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')),
  '{}'::text[],
  'Inventar: anon darf keine Funktion in public ausführen'
);

-- ── 3. Verhalten der definer-Funktionen ─────────────────────────────────────

insert into public.family_invitations (token, family_id, expires_at, used_at) values
  ('1e000000-0000-4000-8000-000000000001', 'f1f1f1f1-0000-4000-8000-000000000001', now() + interval '7 days', null),
  ('1e000000-0000-4000-8000-000000000002', 'f1f1f1f1-0000-4000-8000-000000000001', now() - interval '1 day', null),
  ('1e000000-0000-4000-8000-000000000003', 'f1f1f1f1-0000-4000-8000-000000000001', now() + interval '7 days',
   now() - interval '1 hour');

set local role authenticated;

-- Ohne `sub`: kein Nutzer, keine Familie.
set local request.jwt.claims to '{"role":"authenticated"}';

select is(public.current_family_id(), null, 'current_family_id ohne auth.uid() → null');

select throws_ok(
  $$ select public.create_family('Neu', 'Niemand', 'NN', '#7DB6A8') $$,
  '42501', 'not authenticated',
  'create_family ohne auth.uid() → 42501'
);

select throws_ok(
  $$ select public.accept_invitation('1e000000-0000-4000-8000-000000000001', 'Niemand', 'NN', '#7DB6A8') $$,
  '42501', 'not authenticated',
  'accept_invitation ohne auth.uid() → 42501'
);

-- A ist schon in einer Familie: keine zweite gründen, keiner zweiten beitreten.
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}';

select throws_ok(
  $$ select public.create_family('Zweitfamilie', 'Anna', 'AN', '#7DB6A8') $$,
  '23505', 'user already belongs to a family',
  'create_family für jemanden mit Familie → 23505'
);

select throws_ok(
  $$ select public.accept_invitation('1e000000-0000-4000-8000-000000000001', 'Anna', 'AN', '#7DB6A8') $$,
  '23505', 'user already belongs to a family',
  'accept_invitation für jemanden mit Familie → 23505'
);

-- Die Familienprüfung kommt vor dem Token: Mitglieder können Tokens gar nicht erst abfragen.
select throws_ok(
  $$ select public.accept_invitation('1e000000-0000-4000-8000-0000000000ff', 'Anna', 'AN', '#7DB6A8') $$,
  '23505', 'user already belongs to a family',
  'accept_invitation für jemanden mit Familie, unbekanntes Token → ebenfalls 23505'
);

-- C sieht nur die eigene Familie und kann kein Token der Testfamilie rotieren. Die Meldung
-- ist dieselbe wie für ein unbekanntes Token.
set local request.jwt.claims to '{"sub":"cccccccc-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  public.current_family_id(),
  'f2f2f2f2-0000-4000-8000-000000000001'::uuid,
  'current_family_id liefert nur die eigene Familie (C → Fremdfamilie)'
);

select throws_ok(
  $$ select public.regenerate_invitation('1e000000-0000-4000-8000-000000000001') $$,
  '22023', 'invitation not found',
  'regenerate_invitation auf ein Token einer fremden Familie → 22023'
);

select throws_ok(
  $$ select public.regenerate_invitation('1e000000-0000-4000-8000-0000000000ff') $$,
  '22023', 'invitation not found',
  'regenerate_invitation auf ein unbekanntes Token → dieselbe Meldung'
);

reset role;

select results_eq(
  $$ select family_id, used_at from public.family_invitations
     where token = '1e000000-0000-4000-8000-000000000001' $$,
  $$ values ('f1f1f1f1-0000-4000-8000-000000000001'::uuid, null::timestamptz) $$,
  'nach den abgewiesenen Aufrufen von A und C ist das gültige Token unverändert'
);

-- B verliert die Familie und tritt per Token wieder bei. Unbekannt, abgelaufen und benutzt
-- enden gleich, damit die Antwort nichts über ein Token verrät.
delete from public.parents where id = 'bbbbbbbb-0000-4000-8000-000000000011';

set local role authenticated;
set local request.jwt.claims to '{"sub":"bbbbbbbb-0000-4000-8000-000000000001","role":"authenticated"}';

select throws_ok(
  $$ select public.accept_invitation('1e000000-0000-4000-8000-0000000000ff', 'Ben', 'BE', '#E8A56A') $$,
  '22023', 'invitation invalid or expired',
  'accept_invitation mit unbekanntem Token → 22023'
);

select throws_ok(
  $$ select public.accept_invitation('1e000000-0000-4000-8000-000000000002', 'Ben', 'BE', '#E8A56A') $$,
  '22023', 'invitation invalid or expired',
  'accept_invitation mit abgelaufenem Token → dieselbe Meldung'
);

select throws_ok(
  $$ select public.accept_invitation('1e000000-0000-4000-8000-000000000003', 'Ben', 'BE', '#E8A56A') $$,
  '22023', 'invitation invalid or expired',
  'accept_invitation mit benutztem Token → dieselbe Meldung'
);

select is(
  public.accept_invitation('1e000000-0000-4000-8000-000000000001', 'Ben', 'BE', '#E8A56A'),
  'f1f1f1f1-0000-4000-8000-000000000001'::uuid,
  'accept_invitation mit gültigem Token → B ist wieder in der Testfamilie'
);

reset role;

select results_eq(
  $$ select i.used_at is not null, p.family_id
     from public.family_invitations i, public.parents p
     where i.token = '1e000000-0000-4000-8000-000000000001'
       and p.auth_user_id = 'bbbbbbbb-0000-4000-8000-000000000001' $$,
  $$ values (true, 'f1f1f1f1-0000-4000-8000-000000000001'::uuid) $$,
  'danach ist das Token benutzt und B hat eine Eltern-Zeile in der Testfamilie'
);

-- Dasselbe Token ein zweites Mal: B verliert die Familie erneut und versucht es noch einmal.
delete from public.parents where auth_user_id = 'bbbbbbbb-0000-4000-8000-000000000001';

set local role authenticated;
set local request.jwt.claims to '{"sub":"bbbbbbbb-0000-4000-8000-000000000001","role":"authenticated"}';

select throws_ok(
  $$ select public.accept_invitation('1e000000-0000-4000-8000-000000000001', 'Ben', 'BE', '#E8A56A') $$,
  '22023', 'invitation invalid or expired',
  'ein Token gilt nur einmal: derselbe Beitritt noch einmal → 22023'
);

reset role;

select * from finish();

rollback;
