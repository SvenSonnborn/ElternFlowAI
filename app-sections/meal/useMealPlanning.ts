import { useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { de as deLocale, enUS as enLocale } from "date-fns/locale";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { confirmDestructive } from "@/app-sections/shared";
import {
  allergyCheck,
  findPendingMealDelete,
  localize,
  mapMealError,
  mealKeys,
  slotOccupant,
  toDateKey,
  usePlanMeal,
  useFamilyAllergies,
  useReplaceMeal,
  weekStartFor,
  type MealErrorKey,
  type MealPlanEntryWithRecipe,
  type MealSlot,
  type PlanningStep,
  type RecipeRow,
} from "@/features/meals";
import { usePendingDeleteStore } from "@/features/shared";

import { runPlanning } from "./runPlanning";

interface PlanRecipeInput {
  recipe: RecipeRow;
  date: string;
  slot: MealSlot;
  replaceTarget?: { entryId: string; seenRecipeId: string };
}

/**
 * Der Einplan-Ablauf für alle Einstiegspunkte (Wochenübersicht, Rezept,
 * Dashboard, Zeilenmenü): Dialoge und Schreiben stecken in {@link runPlanning},
 * dieser Hook verdrahtet sie mit Cache, Undo-Store und `confirmDestructive`.
 *
 * Solange die Familien-Allergien laden, gibt `planRecipe` `"cancelled"` zurück,
 * ohne zu fragen — still ohne Hinweis zu planen wäre die falsche Richtung.
 * Aufrufer sperren ihre Aktion über `allergiesLoading`. `planRecipe` wirft nie.
 *
 * **Fehler kommen als `error` zurück, nicht als Toast.** Beide Aufrufer sind
 * `formSheet`s, und ein Toast aus einem Sheet liegt auf iOS *unter* ihm
 * (docs/TODO.md, „Toasts liegen hinter nativen Modal-Screens"); bei
 * `"failed"` bleibt das Sheet offen, der Nutzer sähe also nichts. `error`
 * ist der i18n-Key aus `mapMealError` und wird beim nächsten `planRecipe`
 * geleert — die Sheets zeigen ihn als Zeile (`PlanningErrorLine`).
 */
export function useMealPlanning(): {
  planRecipe: (input: PlanRecipeInput) => Promise<"planned" | "cancelled" | "failed">;
  allergiesLoading: boolean;
  busy: boolean;
  error: MealErrorKey | null;
} {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const allergies = useFamilyAllergies();
  const plan = usePlanMeal();
  const replace = useReplaceMeal();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MealErrorKey | null>(null);
  const inFlight = useRef(0);

  const confirm = useCallback(
    (step: PlanningStep, recipe: RecipeRow, slot: MealSlot, date: string): Promise<boolean> => {
      if (step.kind === "confirmReplace") {
        const isGerman = i18n.language.startsWith("de");
        const day = format(parseISO(date), isGerman ? "EEEE, d.M." : "EEEE, M/d", {
          locale: isGerman ? deLocale : enLocale,
        });
        return confirmDestructive({
          title: t("meals.planning.replaceTitle"),
          body: t("meals.planning.replaceBody", {
            day,
            slotPhrase: t(`meals.slotPhrase.${slot}`),
            recipe: step.current.recipe ? localize(step.current.recipe.title, i18n.language) : "",
          }),
          confirm: t("meals.planning.replaceConfirm"),
          cancel: t("meals.planning.replaceCancel"),
        });
      }
      const title = localize(recipe.title, i18n.language);
      let body: string;
      if (step.kind === "confirmAllergyUnknown") {
        body = t("meals.planning.allergyUnknownBody");
      } else {
        // Wie `AllergyNotice` in RecipeScreen: eindeutige Keys, lokalisiert.
        const list = step.keys.map((key) => t(`onb.s4.allergies.${key}`)).join(", ");
        body = t(
          step.status === "unsafe"
            ? "meals.planning.allergyUnsafeBody"
            : "meals.planning.allergyCautionBody",
          { recipe: title, list },
        );
      }
      return confirmDestructive({
        title: t("meals.planning.allergyTitle"),
        body,
        confirm: t("meals.planning.allergyConfirm"),
        cancel: t("action.cancel"),
      });
    },
    [i18n.language, t],
  );

  const planRecipe = useCallback(
    async (input: PlanRecipeInput): Promise<"planned" | "cancelled" | "failed"> => {
      setError(null);
      const check = allergyCheck(input.recipe, allergies);
      if (check.kind === "loading") return "cancelled";

      inFlight.current += 1;
      setBusy(true);
      try {
        return await runPlanning(
          { ...input, allergy: check },
          {
            confirm: (step) => confirm(step, input.recipe, input.slot, input.date),
            commitPendingDelete: async (date, slot) => {
              const pending = findPendingMealDelete(
                usePendingDeleteStore.getState().entries,
                date,
                slot,
              );
              if (pending) await usePendingDeleteStore.getState().commit(pending.id);
            },
            getOccupant: (date, slot) => {
              const pendingIds = new Set(
                usePendingDeleteStore
                  .getState()
                  .entries.filter((e) => e.kind === "meal")
                  .map((e) => (e.target as { entryId: string }).entryId),
              );
              return slotOccupant(
                queryClient.getQueryData<MealPlanEntryWithRecipe[]>(
                  mealKeys.plan(toDateKey(weekStartFor(parseISO(date)))),
                ),
                pendingIds,
                date,
                slot,
              );
            },
            plan: (vars) => plan.mutateAsync(vars),
            replace: (vars) => replace.mutateAsync(vars),
          },
        );
      } catch (err) {
        setError(mapMealError(err));
        return "failed";
      } finally {
        inFlight.current -= 1;
        if (inFlight.current === 0) setBusy(false);
      }
    },
    [allergies, confirm, plan, replace, queryClient],
  );

  return { planRecipe, allergiesLoading: allergies.kind === "loading", busy, error };
}
