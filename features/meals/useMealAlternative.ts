import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import type { RecipeRow } from "./types";

import { pickAlternative } from "./alternative";
import { fetchRecipes, mealKeys, normalizeRecipeFilter } from "./queries";
import { useFamilyAllergies } from "./useFamilyAllergies";

interface UseMealAlternativeParams {
  /**
   * Nur `true`, wenn es tatsächlich etwas auszuweichen gibt — die geplante
   * Mahlzeit also `unsafe` oder `caution` ist. Ohne dieses Tor lüde jedes
   * Dashboard beim Start den Rezept-Pool, um ihn nie zu benutzen.
   */
  enabled: boolean;
  /** Das geplante Rezept, das nicht als sein eigener Ausweg taugt. */
  excludeId?: string | null;
  /** `<Kalendertag>-<Slot>`: hält den Vorschlag für die Dauer der Mahlzeit fest. */
  seed: string;
}

/** Der ungefilterte Pool — derselbe Cache-Eintrag, den der Rezept-Browser füllt. */
const POOL_FILTER = normalizeRecipeFilter({});

/**
 * Ein sicheres Ausweichgericht zur geplanten Mahlzeit.
 *
 * Bewusst **kein** `excludeAllergens` an die Abfrage: der serverseitige Filter
 * entfernt Zeilen und liefe damit auf einen zweiten Cache-Eintrag hinaus, den
 * sonst niemand teilt. Das Urteil fällt ohnehin clientseitig (ADR-014,
 * Decision 6) — hier über `pickAlternative`, das `isRecipeSafeForFamily`
 * benutzt statt die Regel neu zu formulieren.
 *
 * Der Query-Key ist derselbe wie der des Rezept-Browsers bei leerer Suche: wer
 * vorher im Essen-Tab war, bekommt den Vorschlag ohne zweiten Netzaufruf.
 */
export function useMealAlternative({
  enabled,
  excludeId,
  seed,
}: UseMealAlternativeParams): RecipeRow | null {
  const { keys, isLoading, error } = useFamilyAllergies();

  const { data } = useQuery({
    queryKey: mealKeys.recipes(POOL_FILTER),
    queryFn: () => fetchRecipes(POOL_FILTER),
    // Ein unbekannter Allergie-Zustand ist keine Grundlage für einen
    // Vorschlag: `judgeRecipe` läse ein leeres `keys` als „diese Familie hat
    // keine Allergien" und nennte jedes Rezept sicher.
    enabled: enabled && !isLoading && !error,
  });

  return useMemo(
    () => (data ? pickAlternative(data, keys, { seed, excludeId }) : null),
    [data, keys, seed, excludeId],
  );
}
