-- Paritätsabfrage (Block 7, Spec §4.2/§4.3): Schema und Konfiguration, nicht Daten.
-- Eine einzige Abfrage ohne Seiteneffekte; läuft unverändert in psql (-At -F '|') und als
-- Einzelstatement über eine API. Lokal gegen die Docker-DB, live rein lesend, danach zeilenweise diff.
--
-- Ausgabe (kind, name, detail), sortiert in Collation "C". Bewusst nicht enthalten: OIDs, Größen,
-- Statistiken, Zeitstempel, Ordinalpositionen, Daten. Arrays und ACLs sind vor dem Zusammenfügen
-- sortiert, Ausdrücke in der Whitespace-Folge normalisiert, Funktionsrümpfe nur als md5.
-- Das Schema `private` darf fehlen (Filter statt Join). Plattform-Schemas (auth, storage, ...) sind
-- draußen; Ausnahmen: Policies auf realtime.messages, Extensions, Migrationsversionen.
--
-- search_path: pg_get_expr/-def und format_type qualifizieren Namen je nach search_path der Sitzung.
-- Das CTE `sp` leert ihn transaktionslokal (set_config, is_local = true); jeder Zweig, der solche
-- Funktionen ruft, hängt per Join an `sp`, damit die Ausgabe in psql und über eine API gleich ist.
-- REGEL: Jeder Zweig, der pg_get_* oder format_type aufruft, MUSS `sp` joinen (direkt oder über
-- `rels`, das `sp` enthält und materialisiert ist). Die Neutralisierung hängt allein daran.
with
sp as materialized (
  select pg_catalog.set_config('search_path', '', true) as v
),
rels as materialized (
  select c.oid, n.nspname, c.relname, c.relkind::text as relkind, c.relowner, c.relrowsecurity, c.relforcerowsecurity,
         c.relpersistence::text as relpersistence, c.relreplident::text as relreplident, c.reloptions, c.relacl
  from sp, pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'private')
    and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
    and not exists (select 1 from pg_catalog.pg_depend d where d.classid = 'pg_catalog.pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')
),
acl_rel as (
  select r.oid, r.nspname, r.relname, r.relkind,
         (select coalesce(string_agg(
                   case a.grantee when 0 then 'PUBLIC' else a.grantee::regrole::text end
                   || ':' || a.privilege_type || case when a.is_grantable then '*' else '' end,
                   ',' order by
                   case a.grantee when 0 then 'PUBLIC' else a.grantee::regrole::text end collate "C",
                   a.privilege_type collate "C"), '')
          from pg_catalog.aclexplode(coalesce(r.relacl,
               pg_catalog.acldefault((case r.relkind when 'S' then 's' else 'r' end)::"char", r.relowner))) a) as acl
  from rels r
),
rows_all as (
  -- Schemas (Besitzer, Rechte)
  select 'schema'::text as kind, n.nspname::text as name,
         ('owner=' || n.nspowner::regrole::text || ' acl=' ||
          (select coalesce(string_agg(
                    case a.grantee when 0 then 'PUBLIC' else a.grantee::regrole::text end
                    || ':' || a.privilege_type || case when a.is_grantable then '*' else '' end,
                    ',' order by
                    case a.grantee when 0 then 'PUBLIC' else a.grantee::regrole::text end collate "C",
                    a.privilege_type collate "C"), '')
           from pg_catalog.aclexplode(coalesce(n.nspacl, pg_catalog.acldefault('n'::"char", n.nspowner))) a))::text as detail
  from pg_catalog.pg_namespace n
  where n.nspname in ('public', 'private')

  union all
  -- Relationen: Art, Besitzer, RLS enable/force, Persistenz, Optionen
  select 'table', r.nspname || '.' || r.relname,
         'relkind=' || r.relkind || ' owner=' || r.relowner::regrole::text
         || ' rls=' || r.relrowsecurity || ' force_rls=' || r.relforcerowsecurity
         || ' persistence=' || r.relpersistence
         || ' replident=' || r.relreplident
         || case when r.relreplident = 'i'
                 then ':' || coalesce((select ic.relname from pg_catalog.pg_index i
                                       join pg_catalog.pg_class ic on ic.oid = i.indexrelid
                                       where i.indrelid = r.oid and i.indisreplident), '')
                 else '' end
         || ' options=' || coalesce((select string_agg(o, ',' order by o collate "C") from unnest(r.reloptions) o), '')
  from rels r

  union all
  -- Tabellen- und Sequenzrechte
  select 'table_grant', a.nspname || '.' || a.relname, 'relkind=' || a.relkind || ' acl=' || a.acl
  from acl_rel a

  union all
  -- Spaltenrechte (nur explizit gesetzte)
  select 'column_grant', r.nspname || '.' || r.relname || '.' || at.attname,
         (select string_agg(
                   case a.grantee when 0 then 'PUBLIC' else a.grantee::regrole::text end
                   || ':' || a.privilege_type || case when a.is_grantable then '*' else '' end,
                   ',' order by
                   case a.grantee when 0 then 'PUBLIC' else a.grantee::regrole::text end collate "C",
                   a.privilege_type collate "C")
          from pg_catalog.aclexplode(at.attacl) a)
  from rels r
  join pg_catalog.pg_attribute at on at.attrelid = r.oid and at.attacl is not null and not at.attisdropped

  union all
  -- Spalten: Typ, Nullbarkeit, Default, generiert/Identity (keine Positionen)
  select 'column', r.nspname || '.' || r.relname || '.' || at.attname,
         pg_catalog.format_type(at.atttypid, at.atttypmod)
         || ' notnull=' || at.attnotnull
         || ' default=' || coalesce(regexp_replace(pg_catalog.pg_get_expr(ad.adbin, ad.adrelid), '\s+', ' ', 'g'), '')
         || ' generated=' || at.attgenerated::text || ' identity=' || at.attidentity::text
         || ' collation=' || coalesce((select co.collname from pg_catalog.pg_collation co
                                       where co.oid = at.attcollation and at.attcollation <> 100), '')
  from rels r
  join pg_catalog.pg_attribute at on at.attrelid = r.oid and at.attnum > 0 and not at.attisdropped
  left join pg_catalog.pg_attrdef ad on ad.adrelid = at.attrelid and ad.adnum = at.attnum
  where r.relkind in ('r', 'p', 'f')

  union all
  -- Constraints (PK, FK, unique, check, exclusion; ohne NOT-NULL-Pseudo-Constraints)
  select 'constraint', r.nspname || '.' || r.relname || '/' || co.conname,
         'type=' || co.contype::text
         || ' deferrable=' || co.condeferrable || ' deferred=' || co.condeferred
         || ' validated=' || co.convalidated
         || ' def=' || regexp_replace(pg_catalog.pg_get_constraintdef(co.oid), '\s+', ' ', 'g')
  from rels r
  join pg_catalog.pg_constraint co on co.conrelid = r.oid
  where co.contype <> 'n'

  union all
  -- Indizes
  select 'index', r.nspname || '.' || r.relname || '/' || ic.relname,
         regexp_replace(pg_catalog.pg_get_indexdef(i.indexrelid), '\s+', ' ', 'g')
         || ' valid=' || i.indisvalid
  from rels r
  join pg_catalog.pg_index i on i.indrelid = r.oid
  join pg_catalog.pg_class ic on ic.oid = i.indexrelid

  union all
  -- Policies auf public/private und auf realtime.messages
  select 'policy', n.nspname || '.' || c.relname || '/' || p.polname,
         'cmd=' || p.polcmd::text || ' permissive=' || p.polpermissive
         || ' roles=' || (select string_agg(case ro when 0 then 'PUBLIC' else ro::regrole::text end, ','
                                            order by case ro when 0 then 'PUBLIC' else ro::regrole::text end collate "C")
                          from unnest(p.polroles) ro)
         || ' using=' || coalesce(regexp_replace(pg_catalog.pg_get_expr(p.polqual, p.polrelid), '\s+', ' ', 'g'), '')
         || ' check=' || coalesce(regexp_replace(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), '\s+', ' ', 'g'), '')
  from sp, pg_catalog.pg_policy p
  join pg_catalog.pg_class c on c.oid = p.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'private') or (n.nspname = 'realtime' and c.relname = 'messages')

  union all
  -- RLS-Schalter von realtime.messages
  select 'table', 'realtime.messages',
         'relkind=' || c.relkind::text || ' rls=' || c.relrowsecurity || ' force_rls=' || c.relforcerowsecurity
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'realtime' and c.relname = 'messages'

  union all
  -- Funktionen: Signatur, Definition (md5), security definer, Config (search_path), Besitzer, Rechte
  select 'function', n.nspname || '.' || p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')',
         'kind=' || p.prokind::text
         || ' returns=' || pg_catalog.pg_get_function_result(p.oid)
         || ' lang=' || l.lanname
         || ' secdef=' || p.prosecdef
         || ' volatility=' || p.provolatile::text
         || ' strict=' || p.proisstrict
         || ' leakproof=' || p.proleakproof
         || ' parallel=' || p.proparallel::text
         || ' config=' || coalesce((select string_agg(cfg, ';' order by cfg collate "C") from unnest(p.proconfig) cfg), '')
         || ' owner=' || p.proowner::regrole::text
         || ' acl=' || (select coalesce(string_agg(
                          case a.grantee when 0 then 'PUBLIC' else a.grantee::regrole::text end
                          || ':' || a.privilege_type || case when a.is_grantable then '*' else '' end,
                          ',' order by
                          case a.grantee when 0 then 'PUBLIC' else a.grantee::regrole::text end collate "C",
                          a.privilege_type collate "C"), '')
                        from pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f'::"char", p.proowner))) a)
         || ' md5=' || md5(pg_catalog.pg_get_functiondef(p.oid))
  from sp, pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  join pg_catalog.pg_language l on l.oid = p.prolang
  where n.nspname in ('public', 'private')
    and p.prokind in ('f', 'p')
    and not exists (select 1 from pg_catalog.pg_depend d where d.classid = 'pg_catalog.pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')

  union all
  -- Trigger (benutzerdefinierte, auf public/private; Definition inkl. Funktion, Zeitpunkt, Ereignisse)
  select 'trigger', r.nspname || '.' || r.relname || '/' || t.tgname,
         'enabled=' || t.tgenabled::text || ' def=' || regexp_replace(pg_catalog.pg_get_triggerdef(t.oid), '\s+', ' ', 'g')
  from rels r
  join pg_catalog.pg_trigger t on t.tgrelid = r.oid
  where not t.tgisinternal

  union all
  -- Enum-Typen mit Labels in Reihenfolge
  select 'enum', n.nspname || '.' || t.typname,
         (select string_agg(e.enumlabel, ',' order by e.enumsortorder) from pg_catalog.pg_enum e where e.enumtypid = t.oid)
  from pg_catalog.pg_type t
  join pg_catalog.pg_namespace n on n.oid = t.typnamespace
  where t.typtype = 'e' and n.nspname in ('public', 'private')

  union all
  -- Views: Hash der Definition
  select 'view', r.nspname || '.' || r.relname,
         'relkind=' || r.relkind || ' md5=' || md5(regexp_replace(pg_catalog.pg_get_viewdef(r.oid), '\s+', ' ', 'g'))
  from rels r
  where r.relkind in ('v', 'm')

  union all
  -- Default-Privilegien für public/private
  select 'default_acl', coalesce(n.nspname, '*global') || ' for ' || d.defaclrole::regrole::text || ' on ' || d.defaclobjtype::text,
         (select coalesce(string_agg(
                   case a.grantee when 0 then 'PUBLIC' else a.grantee::regrole::text end
                   || ':' || a.privilege_type || case when a.is_grantable then '*' else '' end,
                   ',' order by
                   case a.grantee when 0 then 'PUBLIC' else a.grantee::regrole::text end collate "C",
                   a.privilege_type collate "C"), '')
          from pg_catalog.aclexplode(d.defaclacl) a)
  from pg_catalog.pg_default_acl d
  left join pg_catalog.pg_namespace n on n.oid = d.defaclnamespace
  where d.defaclnamespace = 0 or n.nspname in ('public', 'private')

  union all
  -- Publikationen: Flags
  select 'publication', pb.pubname,
         'owner=' || pb.pubowner::regrole::text || ' all_tables=' || pb.puballtables
         || ' insert=' || pb.pubinsert || ' update=' || pb.pubupdate
         || ' delete=' || pb.pubdelete || ' truncate=' || pb.pubtruncate || ' viaroot=' || pb.pubviaroot
  from pg_catalog.pg_publication pb

  union all
  -- Publikationen: enthaltene Tabellen mit Zeilenfilter und Spaltenliste
  select 'publication_table', pb.pubname || '/' || pn.nspname || '.' || pc.relname,
         'where=' || coalesce(regexp_replace(pg_catalog.pg_get_expr(pr.prqual, pr.prrelid), '\s+', ' ', 'g'), '')
         || ' columns=' || coalesce((select string_agg(a.attname, ',' order by a.attname collate "C")
                                     from pg_catalog.pg_attribute a
                                     where a.attrelid = pr.prrelid and a.attnum = any(pr.prattrs)), '')
  from sp, pg_catalog.pg_publication_rel pr
  join pg_catalog.pg_publication pb on pb.oid = pr.prpubid
  join pg_catalog.pg_class pc on pc.oid = pr.prrelid
  join pg_catalog.pg_namespace pn on pn.oid = pc.relnamespace

  union all
  -- Publikationen: Schema-Mitgliedschaft (FOR TABLES IN SCHEMA)
  select 'publication_schema', pb.pubname || '/' || pn.nspname, ''
  from pg_catalog.pg_publication_namespace pnn
  join pg_catalog.pg_publication pb on pb.oid = pnn.pnpubid
  join pg_catalog.pg_namespace pn on pn.oid = pnn.pnnspid

  union all
  -- Sequenzen
  select 'sequence', r.nspname || '.' || r.relname,
         'type=' || pg_catalog.format_type(sq.seqtypid, null) || ' start=' || sq.seqstart
         || ' increment=' || sq.seqincrement || ' min=' || sq.seqmin || ' max=' || sq.seqmax
         || ' cycle=' || sq.seqcycle || ' cache=' || sq.seqcache
  from rels r
  join pg_catalog.pg_sequence sq on sq.seqrelid = r.oid

  union all
  -- Domains: Basistyp, NOT NULL, Default, Check-Constraints
  select 'domain', n.nspname || '.' || t.typname,
         'base=' || pg_catalog.format_type(t.typbasetype, t.typtypmod) || ' notnull=' || t.typnotnull
         || ' default=' || coalesce(t.typdefault, '')
         || ' checks=' || coalesce((select string_agg(co.conname || ':' ||
                                      regexp_replace(pg_catalog.pg_get_constraintdef(co.oid), '\s+', ' ', 'g'),
                                      ';' order by co.conname collate "C")
                                    from pg_catalog.pg_constraint co where co.contypid = t.oid), '')
  from sp, pg_catalog.pg_type t
  join pg_catalog.pg_namespace n on n.oid = t.typnamespace
  where t.typtype = 'd' and n.nspname in ('public', 'private')

  union all
  -- Composite-Typen: Attribute in Reihenfolge
  select 'composite', n.nspname || '.' || t.typname,
         (select string_agg(at.attname || ' ' || pg_catalog.format_type(at.atttypid, at.atttypmod),
                            ', ' order by at.attnum)
          from pg_catalog.pg_attribute at
          where at.attrelid = t.typrelid and at.attnum > 0 and not at.attisdropped)
  from sp, pg_catalog.pg_type t
  join pg_catalog.pg_namespace n on n.oid = t.typnamespace
  join pg_catalog.pg_class cc on cc.oid = t.typrelid and cc.relkind = 'c'
  where t.typtype = 'c' and n.nspname in ('public', 'private')

  union all
  -- Extensions mit Version und Schema
  select 'extension', e.extname, 'version=' || e.extversion || ' schema=' || n.nspname
  from pg_catalog.pg_extension e
  join pg_catalog.pg_namespace n on n.oid = e.extnamespace

  union all
  -- Migrationshistorie: nur Version und Name, nie die Statements
  select 'migration', m.version::text, coalesce(m.name, '')
  from supabase_migrations.schema_migrations m
)
select kind, name, detail
from rows_all
order by kind collate "C", name collate "C", detail collate "C";
