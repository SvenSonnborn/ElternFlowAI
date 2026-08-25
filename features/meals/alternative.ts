import type { AllergenKey, JudgeableRecipe } from "./allergens";

import { isRecipeSafeForFamily } from "./allergens";

interface PickOptions {
  /**
   * Woraus die Auswahl entsteht. Derselbe Seed ergibt immer dasselbe Rezept —
   * das Dashboard reicht `<Kalendertag>-<Slot>` herein, der Vorschlag steht
   * damit für die Dauer der Mahlzeit fest.
   */
  seed: string;
  /** Das bereits geplante Rezept. Als Ausweg aus sich selbst taugt es nicht. */
  excludeId?: string | null;
}

/**
 * FNV-1a, 32 Bit.
 *
 * Ein Hash statt `Math.random`, weil die Auswahl reproduzierbar sein muss:
 * eine zufällige würde bei jedem Re-Render des Dashboards ein anderes Gericht
 * zeigen. `>>> 0` hält das Ergebnis vorzeichenlos — `Math.imul` rechnet in
 * Int32 und lieferte sonst negative Indizes.
 */
function hash(value: string): number {
  let result = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    result = Math.imul(result ^ value.charCodeAt(i), 0x01000193);
  }
  return result >>> 0;
}

/**
 * Ein Ausweichgericht für eine Familie, deren geplante Mahlzeit ein Allergen
 * trifft.
 *
 * Der Filter ist `isRecipeSafeForFamily` und nicht etwa „alles außer unsafe":
 * `caution` und `unverified` sind keine Entwarnung (ADR-014), und ein Vorschlag
 * ist genau das — wer wegen eines Treffers ausweicht, darf nicht auf einem
 * ungeprüften Rezept landen. Damit bleibt die Regel aus `patterns/meals.md`
 * („Never propose a meal containing an active allergy") an ihrer einen Stelle.
 *
 * Strukturell getypt wie `JudgeableRecipe`, damit Tests und eine spätere
 * Edge-Function ohne vollständige `RecipeRow` auskommen.
 */
export function pickAlternative<T extends JudgeableRecipe & { id: string }>(
  pool: readonly T[],
  familyKeys: readonly AllergenKey[],
  { seed, excludeId }: PickOptions,
): T | null {
  const candidates = pool
    .filter((recipe) => recipe.id !== excludeId && isRecipeSafeForFamily(recipe, familyKeys))
    // Sortiert statt in Pool-Reihenfolge: `fetchRecipes` ordnet nach
    // `created_at`, ein neu importiertes Rezept schöbe die bestehenden sonst
    // durch und der Vorschlag des Tages wechselte ohne Zutun.
    .sort((a, b) => a.id.localeCompare(b.id));

  if (candidates.length === 0) return null;
  return candidates[hash(seed) % candidates.length] ?? null;
}
