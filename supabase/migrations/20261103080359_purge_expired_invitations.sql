-- Abgelaufene, unbenutzte Einladungen nachts abräumen.
-- Spec: docs/superpowers/specs/2026-11-03-db-aufraeumen-design.md (§3.1)

-- Die Rechte von postgres auf das Schema `cron` vergibt Supabases Event-Trigger
-- grant_pg_cron_access bei jedem `create extension`, auch wenn die Erweiterung schon da ist.
-- Die zwei `grant … to postgres` aus der Supabase-Doku („Cron → Install") fehlen bewusst: Sie
-- legten Einträge mit postgres als Grantor an, und am nächsten Lauf scheiterte das `revoke` des
-- Triggers an ihnen („dependent privileges exist") — die Migration wäre nicht wiederholbar.
create extension if not exists pg_cron with schema pg_catalog;

-- security invoker genügt nur, weil der Job als postgres läuft und postgres RLS umgeht
-- (BYPASSRLS): family_invitations erzwingt RLS, ihre Policies gelten nur für authenticated.
-- Unter einer Rolle ohne BYPASSRLS löschte der Job still nichts.
create or replace function private.purge_expired_invitations()
returns void
language sql
security invoker
set search_path = ''
as $$
  delete from public.family_invitations
  where used_at is null and expires_at < now();
$$;

-- Nur der Job (postgres) ruft das auf; die App hat keinen Grund dazu.
revoke execute on function private.purge_expired_invitations() from public, anon, authenticated;

comment on function private.purge_expired_invitations() is
  'Löscht abgelaufene, unbenutzte Einladungen. Der Cron-Job purge-expired-invitations und der pgTAP-Test führen genau diese Funktion aus. Keine Karenzzeit: Die App zeigt abgelaufene Einladungen ohnehin nicht (die Query filtert auf expires_at > now()). Benutzte Einladungen bleiben stehen.';

-- cron.schedule ersetzt einen Job gleichen Namens, die Migration bleibt wiederholbar.
select cron.schedule('purge-expired-invitations', '17 3 * * *', 'select private.purge_expired_invitations()');
