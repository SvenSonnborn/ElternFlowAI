import type { TFunction } from "i18next";

import type { ShowToastOptions } from "@/app-sections/shared/toastStore";
import type { MealPlanEntryWithRecipe, RecipeRow, ReplaceMealVars } from "@/features/meals";

// Zur Laufzeit nur Blatt-Module: dieses Modul ist bun-getestet, und der
// Barrel `@/features/meals` zieht `@/features/auth` und nativewind herein.
import { mapMealError } from "@/features/meals/errors";
import { localize } from "@/features/meals/normalize";

/**
 * Wie lange „Rückgängig" steht. Anders als beim Löschen läuft hier nichts
 * ab, wenn das Fenster zu ist — der Schutz hängt am gesehenen Zustand, nicht
 * an der Zeit; das Fenster hält den Toast nur davon ab, ewig stehen zu bleiben.
 */
export const SWAP_UNDO_MS = 8000;

export interface SwapMealDeps {
  replace: (vars: ReplaceMealVars) => Promise<unknown>;
  showToast: (options: ShowToastOptions) => void;
  t: TFunction;
  /** Sprache für den Rezepttitel im Toast. */
  lang: string;
}

/**
 * Tauscht die geplante Mahlzeit des Heros gegen das Ausweichgericht und
 * bietet „Rückgängig" an.
 *
 * Beide Richtungen laufen über dieselbe geschützte Ersetzung: der Tausch
 * meldet das gesehene Rezept des Eintrags, das Zurücktauschen das
 * Ausweichgericht. Hat jemand den Platz zwischenzeitlich anders belegt,
 * trifft das Zurücktauschen null Zeilen (`MealSlotOccupiedError`) und meldet
 * sich als Toast — es überschreibt nie still eine fremde Änderung. Hat jemand
 * ihn geleert, plant es auch nicht neu ein (`planIfGone: false`, Spec 4.6):
 * Rückgängig stellt den gesehenen Stand wieder her, es füllt keinen Platz,
 * den ein anderer Elternteil bewusst freigemacht hat (`MealEntryGoneError`,
 * derselbe „geändert"-Toast).
 *
 * Fehler werden hier zu Toasts und nicht weitergeworfen: der Aufrufer ist ein
 * Tap-Handler ohne Fehlerpfad. Ohne vorheriges Rezept (`entry.recipe` ist
 * nullable) gibt es nichts, wohin zurückgetauscht werden könnte; dann bleibt
 * die Aktion weg.
 */
export async function swapMeal(
  args: { entry: MealPlanEntryWithRecipe; alternative: RecipeRow },
  deps: SwapMealDeps,
): Promise<void> {
  const { entry, alternative } = args;
  const { replace, showToast, t, lang } = deps;
  const previous = entry.recipe;
  const place = { entryId: entry.id, date: entry.date, slot: entry.meal_slot };

  const fail = (err: unknown) =>
    showToast({ title: t(mapMealError(err)), variant: "error", position: "bottom" });

  try {
    await replace({ ...place, seenRecipeId: entry.recipe_id, recipe: alternative });
  } catch (err) {
    fail(err);
    return;
  }

  showToast({
    title: t("dash.meal.swapped", { recipe: localize(alternative.title, lang) }),
    variant: "success",
    position: "bottom",
    durationMs: SWAP_UNDO_MS,
    action: previous
      ? {
          label: t("action.undo"),
          onPress: () => {
            replace({
              ...place,
              seenRecipeId: alternative.id,
              recipe: previous,
              planIfGone: false,
            }).catch(fail);
          },
        }
      : undefined,
  });
}
