-- pgTAP: Datenbank-Hygiene — Grenzen, updated_at, Fremdschlüssel-Indizes, Default-ACL.
-- Spec: docs/superpowers/specs/2026-11-25-datenbank-hygiene-design.md (§5, §6)
--
-- Schreibt nur in eigene Zeilen (Nutzer, Familie, Elternteil, Kind), die in der Transaktion
-- entstehen; Seed-Zeilen bleiben unberührt. Das `rollback` am Ende räumt sie auch bei Fehlschlag ab.
--
-- Teile:
--   1. Grenzen für Name, Kürzel und Farbe: jede Regel an beiden Rändern, dazu beide
--      Schreibwege (direkter Update als `authenticated`, `create_family`).
--   2. updated_at: die drei Trigger stempeln den Wert, auch gegen einen alten Client-Wert.
--   3. Indizes: jeder Fremdschlüssel in `public` ist abgedeckt (Katalogabfrage wie der
--      Supabase-Advisor `unindexed_foreign_keys`), die Rezept-Indizes sind da, die drei
--      ersetzten `events`-Indizes sind weg.
--   4. Default-ACL: neue Funktionen (public, private, pg_temp) sind für `anon` nicht ausführbar,
--      für `authenticated` schon; neue Sequenzen in public sind für `anon` unbenutzbar.
--
-- Feste Kennungen:
--   eigene Zeilen: Nutzer / Familie / Elternteil / Kind   60000000-…-01 / -11 / -21 / -31
--   Seed-Nutzer ohne Elternzeile (create_family)          0e000000-0000-4000-8000-000000000001

begin;

create extension if not exists pgtap with schema extensions;

select plan(49);

-- ── Eigene Zeilen und Helfer ────────────────────────────────────────────────

insert into auth.users (id) values ('60000000-0000-4000-8000-000000000001');
insert into public.families (id, name) values ('60000000-0000-4000-8000-000000000011', 'Hygiene');
insert into public.parents (id, auth_user_id, family_id, name, short, color) values
  ('60000000-0000-4000-8000-000000000021', '60000000-0000-4000-8000-000000000001',
   '60000000-0000-4000-8000-000000000011', 'Hygiene', 'H', '#7DB6A8');
insert into public.children (id, family_id, name, birthday, color) values
  ('60000000-0000-4000-8000-000000000031', '60000000-0000-4000-8000-000000000011',
   'Hygiene', '2020-01-01', '#7DB6A8');

-- Setzt eine Spalte der eigenen Zeile auf einen Wert; Aufruf als `postgres` (umgeht RLS).
create function pg_temp.set_col(p_table text, p_col text, p_val text)
returns void
language plpgsql
as $$
declare
  v_id uuid := case p_table
    when 'families' then '60000000-0000-4000-8000-000000000011'
    when 'parents'  then '60000000-0000-4000-8000-000000000021'
    when 'children' then '60000000-0000-4000-8000-000000000031'
  end;
begin
  execute format('update public.%I set %I = %L where id = %L', p_table, p_col, p_val, v_id);
end;
$$;

-- ── 1. Grenzen ──────────────────────────────────────────────────────────────

-- Namen: 1..50 Code-Points, nicht leer nach btrim.
select lives_ok($$ select pg_temp.set_col('families', 'name', repeat('x', 50)) $$, 'families.name: 50 Zeichen gehen durch');
select throws_ok($$ select pg_temp.set_col('families', 'name', repeat('x', 51)) $$, '23514',
  'new row for relation "families" violates check constraint "families_name_length"', 'families.name: 51 Zeichen scheitern');
select throws_ok($$ select pg_temp.set_col('families', 'name', '') $$, '23514', null, 'families.name: leer scheitert');
select throws_ok($$ select pg_temp.set_col('families', 'name', '   ') $$, '23514', null, 'families.name: nur Leerzeichen scheitert');

select lives_ok($$ select pg_temp.set_col('parents', 'name', repeat('x', 50)) $$, 'parents.name: 50 Zeichen gehen durch');
select lives_ok($$ select pg_temp.set_col('parents', 'name', repeat('ä', 50)) $$, 'parents.name: 50 Umlaute gehen durch');
select lives_ok($$ select pg_temp.set_col('parents', 'name', repeat('😀', 50)) $$, 'parents.name: 50 Emojis gehen durch');
select throws_ok($$ select pg_temp.set_col('parents', 'name', repeat('x', 51)) $$, '23514',
  'new row for relation "parents" violates check constraint "parents_name_length"', 'parents.name: 51 Zeichen scheitern');
select throws_ok($$ select pg_temp.set_col('parents', 'name', repeat('😀', 51)) $$, '23514', null, 'parents.name: 51 Emojis scheitern');
select throws_ok($$ select pg_temp.set_col('parents', 'name', '') $$, '23514', null, 'parents.name: leer scheitert');
select throws_ok($$ select pg_temp.set_col('parents', 'name', '   ') $$, '23514', null, 'parents.name: nur Leerzeichen scheitert');

select lives_ok($$ select pg_temp.set_col('children', 'name', repeat('x', 50)) $$, 'children.name: 50 Zeichen gehen durch');
select throws_ok($$ select pg_temp.set_col('children', 'name', repeat('x', 51)) $$, '23514',
  'new row for relation "children" violates check constraint "children_name_length"', 'children.name: 51 Zeichen scheitern');
select throws_ok($$ select pg_temp.set_col('children', 'name', '') $$, '23514', null, 'children.name: leer scheitert');
select throws_ok($$ select pg_temp.set_col('children', 'name', '   ') $$, '23514', null, 'children.name: nur Leerzeichen scheitert');

-- Kürzel: 1..3 Code-Points, nicht leer nach btrim.
select lives_ok($$ select pg_temp.set_col('parents', 'short', 'A') $$, 'parents.short: 1 Zeichen geht durch');
select lives_ok($$ select pg_temp.set_col('parents', 'short', 'ABC') $$, 'parents.short: 3 Zeichen gehen durch');
select throws_ok($$ select pg_temp.set_col('parents', 'short', 'ABCD') $$, '23514', null, 'parents.short: 4 Zeichen scheitern');
select throws_ok($$ select pg_temp.set_col('parents', 'short', '') $$, '23514', null, 'parents.short: leer scheitert');
select throws_ok($$ select pg_temp.set_col('parents', 'short', ' ') $$, '23514', null, 'parents.short: nur Leerzeichen scheitert');

-- Farbe: Format #RRGGBB, Groß- und Kleinschreibung egal.
select lives_ok($$ select pg_temp.set_col('parents', 'color', '#7DB6A8') $$, 'parents.color: #7DB6A8 geht durch');
select lives_ok($$ select pg_temp.set_col('parents', 'color', '#7db6a8') $$, 'parents.color: #7db6a8 geht durch');
select throws_ok($$ select pg_temp.set_col('parents', 'color', 'primary') $$, '23514', null, 'parents.color: Token-Name scheitert');
select throws_ok($$ select pg_temp.set_col('parents', 'color', '#FFF') $$, '23514', null, 'parents.color: Kurzform scheitert');
select throws_ok($$ select pg_temp.set_col('parents', 'color', '#GGGGGG') $$, '23514', null, 'parents.color: keine Hex-Ziffern scheitert');

select lives_ok($$ select pg_temp.set_col('children', 'color', '#7DB6A8') $$, 'children.color: #7DB6A8 geht durch');
select lives_ok($$ select pg_temp.set_col('children', 'color', '#7db6a8') $$, 'children.color: #7db6a8 geht durch');
select throws_ok($$ select pg_temp.set_col('children', 'color', 'primary') $$, '23514', null, 'children.color: Token-Name scheitert');
select throws_ok($$ select pg_temp.set_col('children', 'color', '#FFF') $$, '23514', null, 'children.color: Kurzform scheitert');
select throws_ok($$ select pg_temp.set_col('children', 'color', '#GGGGGG') $$, '23514', null, 'children.color: keine Hex-Ziffern scheitert');

-- Beide Schreibwege.
set local role authenticated;
set local request.jwt.claims to '{"sub":"60000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok($$ update public.parents set name = repeat('x', 51) where id = '60000000-0000-4000-8000-000000000021' $$,
  '23514', null, 'Direkter Update als authenticated: 51 Zeichen scheitern');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"0e000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok($$ select public.create_family(repeat('x', 51), 'Neu', 'NN', '#7DB6A8') $$,
  '23514', null, 'create_family: 51 Zeichen im Familiennamen scheitern');
reset role;

-- ── 2. updated_at ───────────────────────────────────────────────────────────

-- `now()` ist in der Transaktion konstant, `set_updated_at()` setzt `now()`.
select pg_temp.set_col('families', 'updated_at', '2000-01-01');
select is((select updated_at from public.families where id = '60000000-0000-4000-8000-000000000011'), now(),
  'families: Trigger stempelt updated_at');
select pg_temp.set_col('parents', 'updated_at', '2000-01-01');
select is((select updated_at from public.parents where id = '60000000-0000-4000-8000-000000000021'), now(),
  'parents: Trigger stempelt updated_at');
select pg_temp.set_col('children', 'updated_at', '2000-01-01');
select is((select updated_at from public.children where id = '60000000-0000-4000-8000-000000000031'), now(),
  'children: Trigger stempelt updated_at');

-- ── 3. Indizes ──────────────────────────────────────────────────────────────

-- Spiegelt den Advisor `unindexed_foreign_keys`: Reihenfolge der führenden Spalten zählt,
-- Teilindizes zählen, INCLUDE-Spalten nicht (`indnkeyatts`). Beim Scheitern listet `is_empty` die fehlenden Fremdschlüssel.
select is_empty($$
  select c.conrelid::regclass::text, c.conname
    from pg_constraint c
   where c.contype = 'f'
     and c.connamespace = 'public'::regnamespace
     and not exists (
       select 1 from pg_index i
        where i.indrelid = c.conrelid
          and i.indisvalid
          and i.indnkeyatts >= cardinality(c.conkey)
          and (string_to_array(i.indkey::text, ' ')::smallint[])[1:cardinality(c.conkey)] = c.conkey
     )
$$, 'jeder Fremdschlüssel in public hat einen Index mit passenden führenden Spalten');

select has_index('public', 'recipes', 'recipes_title_de_trgm_idx'::name, 'recipes: Trigram-Index auf title->>de');
select has_index('public', 'recipes', 'recipes_title_en_trgm_idx'::name, 'recipes: Trigram-Index auf title->>en');
select has_index('public', 'recipes', 'recipes_created_at_id_idx'::name, 'recipes: Index für Sortierung und Tiebreaker');

select hasnt_index('public', 'events', 'events_child_id_idx'::name, 'events_child_id_idx ist durch (family_id, child_id) ersetzt');
select hasnt_index('public', 'events', 'events_parent_id_idx'::name, 'events_parent_id_idx ist durch (family_id, parent_id) ersetzt');
select hasnt_index('public', 'events', 'events_created_by_idx'::name, 'events_created_by_idx ist durch (family_id, created_by) ersetzt');

-- ── Teil 4: Default-ACL ─────────────────────────────────────────────────────
-- Die Probeobjekte entstehen als `postgres` und damit unter der Default-ACL dieser Rolle;
-- die Transaktion rollt am Ende zurück, nichts bleibt in der Datenbank.

create function public.hygiene_probe() returns int language sql as 'select 1';
create function private.hygiene_probe() returns int language sql as 'select 1';
create function pg_temp.hygiene_probe() returns int language sql as 'select 1';
create sequence public.hygiene_probe_seq;

select ok(not has_function_privilege('anon', 'public.hygiene_probe()', 'execute'), 'neue Funktion in public: anon darf nicht ausführen');
select ok(not has_function_privilege('anon', 'private.hygiene_probe()', 'execute'), 'neue Funktion in private: anon darf nicht ausführen');
select ok(not has_function_privilege('anon', 'pg_temp.hygiene_probe()', 'execute'), 'neue Funktion in pg_temp: anon darf nicht ausführen');

select ok(has_function_privilege('authenticated', 'public.hygiene_probe()', 'execute'), 'neue Funktion in public: authenticated darf ausführen');
select ok(has_function_privilege('authenticated', 'private.hygiene_probe()', 'execute'), 'neue Funktion in private: authenticated darf ausführen');
select ok(has_function_privilege('authenticated', 'pg_temp.hygiene_probe()', 'execute'), 'neue Funktion in pg_temp: authenticated darf ausführen');

select ok(not has_sequence_privilege('anon', 'public.hygiene_probe_seq', 'usage, select, update'), 'neue Sequenz in public: anon hat kein usage, select, update');

select * from finish();

rollback;
