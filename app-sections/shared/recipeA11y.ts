import type { TFunction } from "i18next";

import type { RecipeAllergenVerdict } from "@/features/meals";

/**
 * Wie ein Allergen-Urteil einem Screenreader vorgelesen wird.
 *
 * An einer Stelle, weil drei Oberflächen dasselbe Urteil zeigen — das
 * Wochenraster, der Rezept-Browser und der Meal-Hero des Dashboards. ADR-014
 * hält die *Regel* (was ist unsicher?) in `features/meals/allergens/`
 * zusammen; das hier ist ihre Ansage, und sie soll aus demselben Grund nicht
 * zweimal formuliert werden. Liegt in `shared/`, seit der dritte Aufrufer
 * außerhalb des Essen-Tabs sitzt.
 *
 * `t` kommt als Parameter statt aus einem Hook: so bleibt die Funktion pur und
 * testbar — dieselbe Form wie `formatDurationLabel` in KalenderScreen.
 */
export function recipeA11yLabel(
  t: TFunction,
  title: string,
  verdict: RecipeAllergenVerdict,
): string {
  // Ein sicheres Rezept braucht keinen Zusatz — der Titel ist die ganze
  // Information. „sicher" vorzulesen würde die Warnfälle abstumpfen.
  if (verdict.status === "safe") return title;
  if (verdict.status === "unverified") return t("meals.a11y.unverifiedRecipe", { title });

  // Dedupliziert: derselbe Key kann über die Deklaration *und* über eine Zutat
  // hereinkommen, vorgelesen würde er sonst doppelt.
  const list = [...new Set(verdict.hits.map((hit) => hit.key))]
    .map((key) => t(`onb.s4.allergies.${key}`))
    .join(", ");

  return verdict.status === "unsafe"
    ? t("meals.a11y.unsafeRecipe", { title, list })
    : t("meals.a11y.cautionRecipe", { title, list });
}
