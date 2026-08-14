import { useCallback } from "react";

import type { JudgeableRecipe, RecipeAllergenVerdict } from "./allergens";

import { judgeWithAllergyState } from "./allergens";
import { useFamilyAllergies } from "./useFamilyAllergies";

/**
 * Ein stabiler Urteiler über die Allergien der eigenen Familie — die gebundene
 * Form von `judgeWithAllergyState`, das die eigentliche Regel trägt.
 *
 * Bewusst kein Hook pro Rezept: der Rezept-Browser urteilt über eine Liste, und
 * Hooks dürfen nicht in einer Schleife laufen. Die zurückgegebene Funktion
 * behält ihre Identität, solange sich der Allergie-Zustand nicht ändert, damit
 * ein `useMemo` beim Aufrufer nicht bei jedem Render neu rechnet.
 */
export function useRecipeJudge(): (recipe: JudgeableRecipe) => RecipeAllergenVerdict {
  const { keys, isLoading, error } = useFamilyAllergies();

  return useCallback(
    (recipe: JudgeableRecipe) => judgeWithAllergyState(recipe, { keys, isLoading, error }),
    [keys, isLoading, error],
  );
}
