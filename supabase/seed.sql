-- Seed für die lokale Supabase (`supabase db reset`). Nur lokal, nie live: Die Passwörter
-- stehen im Klartext in diesem Repo, die Daten sind frei erfunden.
--
-- Feste UUIDs (spätere Tasks, pgTAP- und Integrationstests verlassen sich darauf):
--
--   Accounts (alle bestätigt, Passwort `lokal-test-1`)
--     A  a@test.local  
--        auth_user  aaaaaaaa-0000-4000-8000-000000000001
--        parent     aaaaaaaa-0000-4000-8000-000000000011   (Testfamilie)
--     B  b@test.local
--        auth_user  bbbbbbbb-0000-4000-8000-000000000001
--        parent     bbbbbbbb-0000-4000-8000-000000000011   (Testfamilie)
--     C  c@test.local
--        auth_user  cccccccc-0000-4000-8000-000000000001
--        parent     cccccccc-0000-4000-8000-000000000011   (Fremdfamilie)
--
--   Familien
--     Testfamilie   f1f1f1f1-0000-4000-8000-000000000001
--     Fremdfamilie  f2f2f2f2-0000-4000-8000-000000000001
--
--   Kind (Testfamilie)          c1c1c1c1-0000-4000-8000-000000000001   „Mia"
--
--   Termine (Testfamilie, Typ `family` bzw. `schule` aus type_lookups)
--     Einzeltermin              e1e1e1e1-0000-4000-8000-000000000001   2026-11-03 10:00 Europe/Berlin
--     Wochenserie, unbegrenzt   e2e2e2e2-0000-4000-8000-000000000001   montags 16:00, ab 2026-11-02
--       modified-Exception      d1d1d1d1-0000-4000-8000-000000000001   Occurrence 2026-11-09, anderer Titel und Zeit
--     Serie mit rrule_count 10  e3e3e3e3-0000-4000-8000-000000000001   dienstags 08:00, ab 2026-11-03
--   Termin Fremdfamilie         e9e9e9e9-0000-4000-8000-000000000001
--
--   Aufgaben
--     Testfamilie               a1a1a1a1-0000-4000-8000-000000000001   offen, mit Kind
--                               a2a2a2a2-0000-4000-8000-000000000001   erledigt (von A)
--     Fremdfamilie              a9a9a9a9-0000-4000-8000-000000000001

-- Auth-Nutzer. Die Token-Spalten bleiben '' statt null: GoTrue scannt sie als string und
-- bricht bei null mit „converting NULL to string" ab.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
) values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'a@test.local',
   extensions.crypt('lokal-test-1', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'b@test.local',
   extensions.crypt('lokal-test-1', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'cccccccc-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'c@test.local',
   extensions.crypt('lokal-test-1', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', '');

insert into auth.identities (
  id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(), u.id, u.id::text, 'email',
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  now(), now(), now()
from auth.users u
where u.id in (
  'aaaaaaaa-0000-4000-8000-000000000001',
  'bbbbbbbb-0000-4000-8000-000000000001',
  'cccccccc-0000-4000-8000-000000000001'
);

insert into public.families (id, name) values
  ('f1f1f1f1-0000-4000-8000-000000000001', 'Testfamilie'),
  ('f2f2f2f2-0000-4000-8000-000000000001', 'Fremdfamilie');

insert into public.parents (id, auth_user_id, family_id, name, short, color) values
  ('aaaaaaaa-0000-4000-8000-000000000011', 'aaaaaaaa-0000-4000-8000-000000000001',
   'f1f1f1f1-0000-4000-8000-000000000001', 'Anna Test', 'A', 'primary'),
  ('bbbbbbbb-0000-4000-8000-000000000011', 'bbbbbbbb-0000-4000-8000-000000000001',
   'f1f1f1f1-0000-4000-8000-000000000001', 'Ben Test', 'B', 'accent'),
  ('cccccccc-0000-4000-8000-000000000011', 'cccccccc-0000-4000-8000-000000000001',
   'f2f2f2f2-0000-4000-8000-000000000001', 'Carla Fremd', 'C', 'primary');

insert into public.children (id, family_id, name, birthday, color) values
  ('c1c1c1c1-0000-4000-8000-000000000001', 'f1f1f1f1-0000-4000-8000-000000000001',
   'Mia', '2018-05-14', 'primary');

-- Termine. Die Typen kommen aus type_lookups (global, family_id is null). Zeiten in UTC;
-- im November gilt in Berlin MEZ (UTC+1), 16:00 Wandzeit = 15:00 UTC.
insert into public.events (
  id, family_id, type_id, child_id, title, start_at, end_at, timezone,
  rrule_freq, rrule_interval, rrule_byweekday, rrule_until, rrule_count, created_by
) values
  ('e1e1e1e1-0000-4000-8000-000000000001', 'f1f1f1f1-0000-4000-8000-000000000001',
   (select id from public.event_types where slug = 'family' and family_id is null),
   null, 'Einzeltermin', '2026-11-03T09:00:00Z', '2026-11-03T10:00:00Z', 'Europe/Berlin',
   null, 1, null, null, null, 'aaaaaaaa-0000-4000-8000-000000000011'),
  ('e2e2e2e2-0000-4000-8000-000000000001', 'f1f1f1f1-0000-4000-8000-000000000001',
   (select id from public.event_types where slug = 'training' and family_id is null),
   'c1c1c1c1-0000-4000-8000-000000000001', 'Training', '2026-11-02T15:00:00Z', '2026-11-02T16:00:00Z', 'Europe/Berlin',
   'weekly', 1, '{1}', null, null, 'aaaaaaaa-0000-4000-8000-000000000011'),
  ('e3e3e3e3-0000-4000-8000-000000000001', 'f1f1f1f1-0000-4000-8000-000000000001',
   (select id from public.event_types where slug = 'schule' and family_id is null),
   'c1c1c1c1-0000-4000-8000-000000000001', 'Schulprojekt', '2026-11-03T07:00:00Z', '2026-11-03T08:00:00Z', 'Europe/Berlin',
   'weekly', 1, '{2}', null, 10, 'bbbbbbbb-0000-4000-8000-000000000011'),
  ('e9e9e9e9-0000-4000-8000-000000000001', 'f2f2f2f2-0000-4000-8000-000000000001',
   (select id from public.event_types where slug = 'family' and family_id is null),
   null, 'Fremdtermin', '2026-11-04T09:00:00Z', '2026-11-04T10:00:00Z', 'Europe/Berlin',
   null, 1, null, null, null, 'cccccccc-0000-4000-8000-000000000011');

-- Occurrence 2026-11-09 der Wochenserie: anderer Titel, eine Stunde später.
insert into public.event_exceptions (id, event_id, occurrence_date, action, override) values
  ('d1d1d1d1-0000-4000-8000-000000000001', 'e2e2e2e2-0000-4000-8000-000000000001',
   '2026-11-09', 'modified',
   '{"title":"Training (verschoben)","start_at":"2026-11-09T16:00:00.000Z","end_at":"2026-11-09T17:00:00.000Z"}');

insert into public.tasks (
  id, family_id, type_id, child_id, title, subject, due_date, is_done, completed_at, completed_by, created_by
) values
  ('a1a1a1a1-0000-4000-8000-000000000001', 'f1f1f1f1-0000-4000-8000-000000000001',
   (select id from public.task_types where slug = 'hausaufgaben' and family_id is null),
   'c1c1c1c1-0000-4000-8000-000000000001', 'Mathe-Blatt', 'Mathe', '2026-11-05',
   false, null, null, 'aaaaaaaa-0000-4000-8000-000000000011'),
  ('a2a2a2a2-0000-4000-8000-000000000001', 'f1f1f1f1-0000-4000-8000-000000000001',
   (select id from public.task_types where slug = 'besorgung' and family_id is null),
   null, 'Geschenk besorgen', null, '2026-11-06',
   true, '2026-11-01T12:00:00Z', 'aaaaaaaa-0000-4000-8000-000000000011', 'bbbbbbbb-0000-4000-8000-000000000011'),
  ('a9a9a9a9-0000-4000-8000-000000000001', 'f2f2f2f2-0000-4000-8000-000000000001',
   (select id from public.task_types where slug = 'eltern-aufgabe' and family_id is null),
   null, 'Fremdaufgabe', null, '2026-11-07',
   false, null, null, 'cccccccc-0000-4000-8000-000000000011');
