-- pgTAP: Spalte recipes.allergens_classified_at ersetzt den Platzhalter 'none'.
-- Spec: docs/superpowers/specs/2026-11-26-allergen-urteil-design.md (§5B, §6)
--
-- Nur lesend: prüft Form der Spalte und das Ergebnis der Rückfüllung an den Seed-Rezepten.

begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

select col_type_is('public', 'recipes', 'allergens_classified_at', 'timestamp with time zone',
  'allergens_classified_at ist ein timestamptz.');

select col_is_null('public', 'recipes', 'allergens_classified_at',
  'allergens_classified_at ist nullable, null heißt nie klassifiziert.');

select col_hasnt_default('public', 'recipes', 'allergens_classified_at',
  'allergens_classified_at hat keinen Default, nur der Klassifizierer stempelt.');

select is((select count(*) from public.recipes where 'none' = any(contains_allergens)), 0::bigint,
  'Kein Rezept trägt noch den Platzhalter none in contains_allergens.');

select is((select count(*) from public.recipes
           where cardinality(contains_allergens) > 0 and allergens_classified_at is null), 0::bigint,
  'Jedes Rezept mit deklarierten Allergenen ist als klassifiziert gestempelt.');

select ok((select contains_allergens = '{}' and allergens_classified_at is not null
           from public.recipes where recipe_dedup_hash = 'seed-ofengemuese'),
  'Ofengemüse (vormals none) hat leere Allergene und einen Zeitstempel.');

select is((select count(*) from public.recipes
           where recipe_dedup_hash in ('seed-hummus', 'seed-karottensuppe')
             and allergens_classified_at is null), 2::bigint,
  'Hummus und Karottensuppe bleiben ungeprüft, weil sie nie klassifiziert wurden.');

-- Rückfüllung mit created_at, nicht now() (Spec §5B Schritt 2)
select is((select count(*) from public.recipes
           where recipe_dedup_hash in ('seed-carbonara', 'seed-pad-thai', 'seed-ofengemuese', 'seed-bruschetta')
             and allergens_classified_at = created_at), 4::bigint,
  'Die Rückfüllung stempelt mit created_at statt mit now().');

select * from finish();

rollback;
