// Die 14 Pflichtallergene nach Anhang II der EU-Verordnung 1169/2011.
//
// Sechs davon (peanuts, milk, eggs, gluten, soy, nuts) liegen bereits in
// `children.allergies[]` und `parents.allergies[]` und behalten deshalb ihre
// exakte Schreibweise — ein Umbenennen wäre ein Datenmigrations-Fall wie der
// Backfill von 2026-06-04. Die acht übrigen sind eine reine Erweiterung.
//
// Persistiert werden immer diese Keys, niemals lokalisierte Labels; gerendert
// wird über `onb.s4.allergies.<key>`.

export type AllergenKey =
  | "gluten"
  | "crustaceans"
  | "eggs"
  | "fish"
  | "peanuts"
  | "soy"
  | "milk"
  | "nuts"
  | "celery"
  | "mustard"
  | "sesame"
  | "sulphites"
  | "lupin"
  | "molluscs";

export const ALLERGEN_KEYS: readonly AllergenKey[] = [
  "gluten",
  "crustaceans",
  "eggs",
  "fish",
  "peanuts",
  "soy",
  "milk",
  "nuts",
  "celery",
  "mustard",
  "sesame",
  "sulphites",
  "lupin",
  "molluscs",
] as const;

export function isAllergenKey(value: string): value is AllergenKey {
  return (ALLERGEN_KEYS as readonly string[]).includes(value);
}
