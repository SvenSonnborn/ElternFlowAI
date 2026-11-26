-- Datenbank-Hygiene.
-- Spec: docs/superpowers/specs/2026-11-25-datenbank-hygiene-design.md (§5)
--
-- Vier Teile, in dieser Reihenfolge:
--   A. Grenzen für Name, Kürzel und Farbe (CHECK-Constraints)

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
  add constraint families_name_length check (btrim(name) <> '' and char_length(name) <= 50);

alter table public.parents
  add constraint parents_name_length check (btrim(name) <> '' and char_length(name) <= 50),
  add constraint parents_short_length check (btrim(short) <> '' and char_length(short) <= 3),
  add constraint parents_color_hex check (color ~ '^#[0-9A-Fa-f]{6}$');

alter table public.children
  add constraint children_name_length check (btrim(name) <> '' and char_length(name) <= 50),
  add constraint children_color_hex check (color ~ '^#[0-9A-Fa-f]{6}$');
