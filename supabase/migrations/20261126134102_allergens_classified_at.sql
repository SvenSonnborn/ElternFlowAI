-- Spalte allergens_classified_at ersetzt den Platzhalter 'none'.
-- Spec: docs/superpowers/specs/2026-11-26-allergen-urteil-design.md (§5B)
--
-- Drei Teile, in dieser Reihenfolge:
--   1. Spalte anlegen (nullable, kein Default: nur der Klassifizierer stempelt)
--   2. Zeilen mit nicht leerem contains_allergens stempeln (created_at, nicht now())
--   3. 'none' aus den Arrays entfernen
--
-- Idempotent: `add column if not exists`; der Stempel greift nur bei null; ein zweiter Lauf
-- findet kein 'none' mehr.

alter table public.recipes
  add column if not exists allergens_classified_at timestamptz;

-- Erst stempeln, solange 'none' die Zeile noch als geprüft ausweist (cardinality > 0).
update public.recipes
set allergens_classified_at = created_at
where cardinality(contains_allergens) > 0
  and allergens_classified_at is null;

update public.recipes
set contains_allergens = array_remove(contains_allergens, 'none')
where 'none' = any(contains_allergens);

comment on column public.recipes.allergens_classified_at is
  'Set by the allergen classifier when it checked contains_allergens; null = never classified. '
  'Must be reset when ingredients change.';

comment on column public.recipes.contains_allergens is
  'Source-of-truth for allergen filtering. Normalized codes (milk, egg, wheat, ...) derived via '
  'semantic ingredient analysis in Edge Function. NOT derived from diet_tags. '
  'Empty with allergens_classified_at set = classified, nothing found; empty without = never classified.';
