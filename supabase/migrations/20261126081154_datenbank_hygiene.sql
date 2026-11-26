-- Datenbank-Hygiene.
-- Spec: docs/superpowers/specs/2026-11-25-datenbank-hygiene-design.md (§5)
--
-- Vier Teile, in dieser Reihenfolge:
--   A. Grenzen für Name, Kürzel und Farbe (CHECK-Constraints)
--   B. updated_at-Trigger auf families, parents und children
--   C. Indizes: Fremdschlüssel und Rezept-Suche
--   D. Default-ACL: neue Funktionen und Sequenzen nicht mehr für anon
--
-- Idempotent: Ein zweiter Lauf legt die Constraints neu an (und prüft sie erneut), ersetzt die
-- Trigger und überspringt vorhandene Indizes.

-- ============================================================
-- A. Grenzen für Name, Kürzel und Farbe
-- ============================================================
-- Auf den Tabellen, nicht in create_family/accept_invitation: `parents: update self` und
-- `families: update own` lassen dieselben Spalten direkt beschreiben, eine Prüfung nur in
-- den RPCs wäre umgehbar. Verletzung: SQLSTATE 23514.
--
-- `char_length` zählt Code-Points; `maxLength` am TextInput zählt UTF-16-Einheiten, also nie
-- weniger. Ein Client-Limit von 50 hält das Server-Limit damit immer ein.
--
-- Farbe als Format statt als Liste: die Palette (AVATAR_COLORS) gehört dem Designer, eine
-- Liste in der Datenbank müsste bei jeder Paletten-Änderung mitwandern.

alter table public.families
  drop constraint if exists families_name_length,
  add constraint families_name_length check (btrim(name) <> '' and char_length(name) <= 50);

alter table public.parents
  drop constraint if exists parents_name_length,
  drop constraint if exists parents_short_length,
  drop constraint if exists parents_color_hex,
  add constraint parents_name_length check (btrim(name) <> '' and char_length(name) <= 50),
  add constraint parents_short_length check (btrim(short) <> '' and char_length(short) <= 3),
  add constraint parents_color_hex check (color ~ '^#[0-9A-Fa-f]{6}$');

alter table public.children
  drop constraint if exists children_name_length,
  drop constraint if exists children_color_hex,
  add constraint children_name_length check (btrim(name) <> '' and char_length(name) <= 50),
  add constraint children_color_hex check (color ~ '^#[0-9A-Fa-f]{6}$');

-- ============================================================
-- B. updated_at-Trigger
-- ============================================================
-- `set_updated_at()` stammt aus 20260904075041_conflict_detection.sql und stempelt dort schon
-- events, tasks und event_exceptions. Deren Schlusskommentar, die Spalte sei auf families,
-- parents und children tot, bleibt stehen (angewandte Migrationen werden nicht editiert);
-- ab hier gilt er nicht mehr. Ein vom Client mitgeschicktes `updated_at` (useUpdateParent,
-- useUpdateChild) überschreibt der Trigger.

drop trigger if exists families_set_updated_at on public.families;
create trigger families_set_updated_at
before update on public.families
for each row execute function public.set_updated_at();

drop trigger if exists parents_set_updated_at on public.parents;
create trigger parents_set_updated_at
before update on public.parents
for each row execute function public.set_updated_at();

drop trigger if exists children_set_updated_at on public.children;
create trigger children_set_updated_at
before update on public.children
for each row execute function public.set_updated_at();

-- ============================================================
-- C. Indizes
-- ============================================================
-- C1. Fremdschlüssel. Ein B-Tree je Fremdschlüssel ohne Index, Spalten in der Reihenfolge des
-- Fremdschlüssels, ohne Teilbedingung (einfacher; der Advisor prüft nur die führenden Spalten).
--
-- Die drei alten events-Indizes decken nur eine Spalte ihres zweispaltigen Fremdschlüssels
-- (family_id, x) ab, der Advisor wertet sie deshalb nicht als Abdeckung. Sie weichen den
-- zweispaltigen Nachfolgern.
--
-- Die 15 nie benutzten Indizes, die der Advisor ebenfalls meldet, bleiben bewusst: bei der
-- heutigen Zeilenzahl liest der Planer ohnehin sequenziell, "nie benutzt" sagt noch nichts.

drop index if exists public.events_child_id_idx, public.events_parent_id_idx, public.events_created_by_idx;

create index if not exists events_family_id_child_id_idx on public.events (family_id, child_id);
create index if not exists events_family_id_parent_id_idx on public.events (family_id, parent_id);
create index if not exists events_family_id_created_by_idx on public.events (family_id, created_by);
create index if not exists events_type_id_idx on public.events (type_id);
create index if not exists family_invitations_created_by_idx on public.family_invitations (created_by);
create index if not exists meal_plan_entries_created_by_idx on public.meal_plan_entries (created_by);
create index if not exists meal_plan_entries_recipe_id_idx on public.meal_plan_entries (recipe_id);
create index if not exists recipes_created_by_family_id_idx on public.recipes (created_by_family_id);
create index if not exists reminders_recipient_parent_id_idx on public.reminders (recipient_parent_id);
create index if not exists reminders_task_id_idx on public.reminders (task_id);
create index if not exists tasks_completed_by_idx on public.tasks (completed_by);
create index if not exists tasks_created_by_idx on public.tasks (created_by);
create index if not exists tasks_type_id_idx on public.tasks (type_id);

-- C2. Rezepte. `title` ist jsonb; PostgREST übersetzt `title->>de.ilike` in den Ausdruck
-- `title->>'de'`, deshalb Ausdrucksindizes je Sprache. `gin (title gin_trgm_ops)` gäbe es für
-- jsonb nicht. Die Sortierung von fetchRecipes (created_at desc, id als Tiebreaker) bekommt
-- ihren eigenen B-Tree.

create extension if not exists pg_trgm with schema extensions;

create index if not exists recipes_title_de_trgm_idx on public.recipes
  using gin ((title->>'de') extensions.gin_trgm_ops);
create index if not exists recipes_title_en_trgm_idx on public.recipes
  using gin ((title->>'en') extensions.gin_trgm_ops);
create index if not exists recipes_created_at_id_idx on public.recipes (created_at desc, id);

-- ============================================================
-- D. Default-ACL für neue Funktionen und Sequenzen
-- ============================================================
-- Bestehende Objekte bleiben unberührt; für sie gilt weiter das Inventar in
-- security.test.sql und der Entzug je Migration.
--
-- Ein Entzug auf Schema-Ebene allein reicht bei Funktionen nicht: `execute` für PUBLIC kommt
-- aus der eingebauten globalen Vorgabe, `anon` ist Mitglied von PUBLIC, und eine
-- Schema-Vorgabe kann der globalen nur etwas hinzufügen, nichts wegnehmen. Deshalb Zeile 1
-- global.
--
-- Zeile 2 gibt `authenticated` und `service_role` zurück, was sie bisher über PUBLIC hatten.
-- Ohne sie wären neue Funktionen nur noch für ihren Besitzer ausführbar: pg_temp-Helfer der
-- Tests und Funktionen in `private` (RLS-Policies) scheiterten mit 42501.
--
-- Zeile 3 entzieht `anon` die Schema-Vorgabe, die Supabase in `public` ausdrücklich setzt;
-- Zeile 4 dasselbe für Sequenzen (dort gibt es keine globale PUBLIC-Vorgabe).
--
-- Ein künftiger Auth-Hook braucht ein ausdrückliches `grant execute … to supabase_auth_admin`.

alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres grant execute on functions to authenticated, service_role;
alter default privileges for role postgres in schema public revoke execute on functions from anon;
alter default privileges for role postgres in schema public revoke usage, select, update on sequences from anon;
