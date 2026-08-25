import { useTranslation } from "react-i18next";

import type { RecipeAllergenVerdict } from "@/features/meals";

import { Pill } from "./Pill";

/** Mehr als zwei Labels sprengen die Zeile — der Rest wird gezählt. */
const MAX_LABELS = 2;

interface AllergenBadgeProps {
  verdict: RecipeAllergenVerdict;
}

/**
 * Übersetzt ein Urteil in genau eine Pille. `Pill` führt die drei nötigen Töne
 * bereits (`danger`, `warn`, `ink`), deshalb ist das hier ein dünner Wrapper
 * und keine eigene Ton-Komposition.
 *
 * Liegt in `shared/`, weil ihn drei Oberflächen zeigen — Wochenraster,
 * Rezept-Browser und der Meal-Hero des Dashboards.
 */
export function AllergenBadge({ verdict }: AllergenBadgeProps) {
  const { t } = useTranslation();

  if (verdict.status === "safe") return null;

  if (verdict.status === "unverified") {
    return <Pill label={t("meals.allergen.unverified")} tone="ink" />;
  }

  const keys = [...new Set(verdict.hits.map((hit) => hit.key))];
  const shown = keys.slice(0, MAX_LABELS);
  const rest = keys.length - shown.length;

  const list =
    shown.map((key) => t(`onb.s4.allergies.${key}`)).join(", ") +
    (rest > 0 ? ` ${t("meals.allergen.more", { n: rest })}` : "");

  return verdict.status === "unsafe" ? (
    <Pill label={t("meals.allergen.contains", { list })} tone="danger" />
  ) : (
    <Pill label={t("meals.allergen.maybe", { list })} tone="warn" />
  );
}
