import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { useCurrentParent } from "@/features/auth";
import { supabase } from "@/features/supabase";

import type { MealPlanEntryWithRecipe } from "./types";

import { MissingParentError } from "./errors";
import {
  createSupabaseMealOps,
  planMeal,
  removeMeal,
  replaceMeal,
  type PlanMealVars,
  type RemoveMealVars,
  type ReplaceMealVars,
} from "./mutations";
import {
  applyPlan,
  applyRemove,
  applyReplace,
  optimisticEntry,
  patchMealWeek,
  restoreMealWeek,
  type MealWeekSnapshot,
} from "./optimistic";
import { mealKeys } from "./queries";

/**
 * Zurückgegeben, nicht abgefeuert: `isPending` fällt erst, wenn die
 * nachgeladenen Zeilen da sind, sonst spränge der Screen nach dem Speichern
 * noch einmal um.
 */
function invalidatePlans(qc: QueryClient): Promise<void> {
  return qc.invalidateQueries({ queryKey: mealKeys.plansRoot });
}

/**
 * Plant ein Rezept — optimistisch, sobald die Eltern-Zeile geladen ist. Ohne
 * sie wirft `mutationFn` `MissingParentError`, und es gibt nichts zu patchen;
 * eine erfundene Zeile ohne `family_id` gehörte nie in den Cache.
 *
 * `onSuccess` tauscht die optimistische Zeile sofort gegen die echte, statt
 * auf den Refetch zu warten: Bis dahin trüge der Platz eine vorläufige Id,
 * ohne Menü und ohne Ziel für Ersetzen oder Löschen.
 *
 * Die Hooks liegen getrennt von `mutations.ts`, weil sie `@/features/auth`
 * brauchen und die reinen Funktionen davon frei bleiben sollen (Tests).
 */
export function usePlanMeal() {
  const qc = useQueryClient();
  const { data: parent } = useCurrentParent();

  return useMutation({
    mutationFn: (vars: PlanMealVars): Promise<MealPlanEntryWithRecipe> => {
      if (!parent) return Promise.reject(new MissingParentError());
      return planMeal(vars, parent, createSupabaseMealOps(supabase));
    },
    onMutate: (vars): Promise<MealWeekSnapshot> | undefined => {
      if (!parent) return undefined;
      return patchMealWeek(qc, vars.date, (entries) =>
        applyPlan(entries, optimisticEntry(vars, parent, new Date())),
      );
    },
    onSuccess: (entry) => patchMealWeek(qc, entry.date, (entries) => applyPlan(entries, entry)),
    onError: (_err, _vars, snapshot) => restoreMealWeek(qc, snapshot),
    onSettled: () => invalidatePlans(qc),
  });
}

/** Tauscht das Rezept eines Eintrags (siehe {@link replaceMeal}). */
export function useReplaceMeal() {
  const qc = useQueryClient();
  const { data: parent } = useCurrentParent();

  return useMutation({
    mutationFn: (vars: ReplaceMealVars): Promise<void> => {
      if (!parent) return Promise.reject(new MissingParentError());
      return replaceMeal(vars, parent, createSupabaseMealOps(supabase));
    },
    onMutate: (vars): Promise<MealWeekSnapshot> | undefined => {
      if (!parent) return undefined;
      return patchMealWeek(qc, vars.date, (entries) =>
        applyReplace(entries, vars.entryId, vars.recipe),
      );
    },
    onError: (_err, _vars, snapshot) => restoreMealWeek(qc, snapshot),
    onSettled: () => invalidatePlans(qc),
  });
}

/**
 * Löscht einen Eintrag. Im UI läuft das über den Undo-Store (`useUndoableDelete`),
 * der diese Mutation erst nach dem Undo-Fenster ausführt; der Patch hier
 * deckt den Fall ab, dass sie direkt aufgerufen wird.
 */
export function useRemoveMeal() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (vars: RemoveMealVars): Promise<void> =>
      removeMeal(vars, createSupabaseMealOps(supabase)),
    onMutate: (vars) =>
      patchMealWeek(qc, vars.date, (entries) => applyRemove(entries, vars.entryId)),
    onError: (_err, _vars, snapshot) => restoreMealWeek(qc, snapshot),
    onSettled: () => invalidatePlans(qc),
  });
}
