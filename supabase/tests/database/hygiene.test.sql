-- pgTAP: Datenbank-Hygiene — Grenzen, updated_at, Fremdschlüssel-Indizes, Default-ACL.
-- Spec: docs/superpowers/specs/2026-11-25-datenbank-hygiene-design.md (§5, §6)
--
-- Läuft in einer Transaktion und rollt am Ende zurück; die Seed-Daten bleiben unberührt.
--
-- Teile:
--   1. Grenzen für Name, Kürzel und Farbe: jede Regel an beiden Rändern, dazu beide
--      Schreibwege (direkter Update als `authenticated`, `create_family`).
--   2. updated_at: die drei Trigger stempeln den Wert, auch gegen einen alten Client-Wert.
--   3. Indizes: jeder Fremdschlüssel in `public` ist abgedeckt (Katalogabfrage wie der
--      Supabase-Advisor `unindexed_foreign_keys`), die Rezept-Indizes sind da, die drei
--      ersetzten `events`-Indizes sind weg.
--
-- Feste Kennungen (Seed-IDs siehe Kopf von supabase/seed.sql):
--   Testfamilie / Elternteil A / Kind Mia   f1f1f1f1-…-01 / aaaaaaaa-…-11 / c1c1c1c1-…-01
--   Nutzer ohne Elternzeile (create_family) 0e000000-0000-4000-8000-000000000001

begin;

create extension if not exists pgtap with schema extensions;

select plan(42);

-- ── Helfer ──────────────────────────────────────────────────────────────────

-- Setzt eine Spalte der Seed-Zeile auf einen Wert; Aufruf als `postgres` (umgeht RLS).
create function pg_temp.set_col(p_table text, p_col text, p_val text)
returns void
language plpgsql
as $$
declare
  v_id uuid := case p_table
    when 'families' then 'f1f1f1f1-0000-4000-8000-000000000001'
    when 'parents'  then 'aaaaaaaa-0000-4000-8000-000000000011'
    when 'children' then 'c1c1c1c1-0000-4000-8000-000000000001'
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
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok($$ update public.parents set name = repeat('x', 51) where id = 'aaaaaaaa-0000-4000-8000-000000000011' $$,
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
select is((select updated_at from public.families where id = 'f1f1f1f1-0000-4000-8000-000000000001'), now(),
  'families: Trigger stempelt updated_at');
select pg_temp.set_col('parents', 'updated_at', '2000-01-01');
select is((select updated_at from public.parents where id = 'aaaaaaaa-0000-4000-8000-000000000011'), now(),
  'parents: Trigger stempelt updated_at');
select pg_temp.set_col('children', 'updated_at', '2000-01-01');
select is((select updated_at from public.children where id = 'c1c1c1c1-0000-4000-8000-000000000001'), now(),
  'children: Trigger stempelt updated_at');

-- ── 3. Indizes ──────────────────────────────────────────────────────────────

-- Spiegelt den Advisor `unindexed_foreign_keys`: Reihenfolge der führenden Spalten zählt,
-- Teilindizes zählen. Beim Scheitern listet `is_empty` die fehlenden Fremdschlüssel.
select is_empty($$
  select c.conrelid::regclass::text, c.conname
    from pg_constraint c
   where c.contype = 'f'
     and c.connamespace = 'public'::regnamespace
     and not exists (
       select 1 from pg_index i
        where i.indrelid = c.conrelid
          and i.indisvalid
          and (string_to_array(i.indkey::text, ' ')::smallint[])[1:cardinality(c.conkey)] = c.conkey
     )
$$, 'jeder Fremdschlüssel in public hat einen Index mit passenden führenden Spalten');

select has_index('public', 'recipes', 'recipes_title_de_trgm_idx'::name, 'recipes: Trigram-Index auf title->>de');
select has_index('public', 'recipes', 'recipes_title_en_trgm_idx'::name, 'recipes: Trigram-Index auf title->>en');
select has_index('public', 'recipes', 'recipes_created_at_id_idx'::name, 'recipes: Index für Sortierung und Tiebreaker');

select hasnt_index('public', 'events', 'events_child_id_idx'::name, 'events_child_id_idx ist durch (family_id, child_id) ersetzt');
select hasnt_index('public', 'events', 'events_parent_id_idx'::name, 'events_parent_id_idx ist durch (family_id, parent_id) ersetzt');
select hasnt_index('public', 'events', 'events_created_by_idx'::name, 'events_created_by_idx ist durch (family_id, created_by) ersetzt');

select * from finish();

rollback;
