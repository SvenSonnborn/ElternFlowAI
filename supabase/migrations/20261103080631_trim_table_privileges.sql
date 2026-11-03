-- Tabellenrechte zuschneiden: anon verliert alle Rechte auf public-Tabellen,
-- authenticated behält select/insert/update/delete (Supabase vergibt per Default alles).
--
-- Bewusst nur gezielte Entzüge, kein `revoke all` + `grant`: ein pauschales grant
-- öffnete `insert` auf family_invitations wieder, wo authenticated absichtlich nur
-- `insert (family_id)` hat (Migration calendar_transaction_rpc).
--
-- `maintain` setzt Postgres 17 voraus.
--
-- Die Default-ACLs gelten nur für den Besitzer postgres (so legen Migrationen
-- Tabellen an). Default-ACLs anderer Besitzer, etwa supabase_admin, fasst die
-- Migration nicht an; der Rollout prüft pg_default_acl.

revoke all on all tables in schema public from anon;
revoke truncate, references, trigger, maintain on all tables in schema public from authenticated;

alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger, maintain on tables from authenticated;
