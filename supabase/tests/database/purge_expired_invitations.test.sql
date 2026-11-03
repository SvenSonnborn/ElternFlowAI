-- pgTAP: Cron-Job private.purge_expired_invitations.
-- Spec: docs/superpowers/specs/2026-11-03-db-aufraeumen-design.md (§3.1, §4)
--
-- Läuft in einer Transaktion und rollt am Ende zurück; die Seed-Daten bleiben unberührt.
-- Dieselben drei Tokens wie in security.test.sql (Familie f1…01 aus seed.sql). Die benutzte
-- Einladung ist hier zusätzlich abgelaufen: Benutzte bleiben stehen, auch nach Ablauf.

begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

select results_eq(
  $$ select schedule::text, command::text, username::text
       from cron.job where jobname = 'purge-expired-invitations' $$,
  $$ values ('17 3 * * *', 'select private.purge_expired_invitations()', 'postgres') $$,
  'Job purge-expired-invitations läuft nachts als postgres');

select ok(not has_function_privilege('anon', 'private.purge_expired_invitations()', 'execute'), 'anon darf nicht aufräumen');
select ok(not has_function_privilege('authenticated', 'private.purge_expired_invitations()', 'execute'), 'authenticated darf nicht aufräumen');

insert into public.family_invitations (token, family_id, expires_at, used_at) values
  ('1e000000-0000-4000-8000-000000000001', 'f1f1f1f1-0000-4000-8000-000000000001', now() + interval '7 days', null),
  ('1e000000-0000-4000-8000-000000000002', 'f1f1f1f1-0000-4000-8000-000000000001', now() - interval '1 day', null),
  ('1e000000-0000-4000-8000-000000000003', 'f1f1f1f1-0000-4000-8000-000000000001', now() - interval '1 day', now() - interval '2 days');

select lives_ok($$ select private.purge_expired_invitations() $$, 'als Job-Rolle (postgres) aufrufbar');

select results_eq(
  $$ select token::text from public.family_invitations where token::text like '1e000000-%' order by token $$,
  $$ values ('1e000000-0000-4000-8000-000000000001'), ('1e000000-0000-4000-8000-000000000003') $$,
  'nur die abgelaufene, unbenutzte Einladung ist weg');

select * from finish();

rollback;
