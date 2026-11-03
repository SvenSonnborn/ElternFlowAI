-- Abgelaufene, unbenutzte Einladungen nachts abräumen.
-- Spec: docs/superpowers/specs/2026-11-03-db-aufraeumen-design.md (§3.1)

-- pg_cron wie in der Supabase-Doku („Cron → Install"): Erweiterung anlegen, dem Besitzer der
-- Jobs (postgres) den Zugriff auf das Schema `cron` geben.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

create function private.purge_expired_invitations()
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
