import type {
  AllergyCheck,
  MealPlanEntryWithRecipe,
  MealSlot,
  PlanMealVars,
  PlanningStep,
  RecipeRow,
  ReplaceMealVars,
} from "@/features/meals";

// Zur Laufzeit nur Blatt-Module: dieses Modul ist bun-getestet, und der
// Barrel `@/features/meals` zieht `@/features/auth` und nativewind herein.
import { MealSlotOccupiedError } from "@/features/meals/errors";
import { planningSteps } from "@/features/meals/planningSteps";

export interface PlanningRequest {
  recipe: RecipeRow;
  /** `yyyy-MM-dd`. */
  date: string;
  slot: MealSlot;
  allergy: Exclude<AllergyCheck, { kind: "loading" }>;
  /** Bewusstes Ersetzen („Anderes Rezept wählen"): kein Ersetzen-Dialog. */
  replaceTarget?: { entryId: string; seenRecipeId: string };
}

export interface PlanningDeps {
  confirm(step: PlanningStep): Promise<boolean>;
  commitPendingDelete(date: string, slot: MealSlot): Promise<void>;
  getOccupant(date: string, slot: MealSlot): MealPlanEntryWithRecipe | null;
  plan(vars: PlanMealVars): Promise<unknown>;
  replace(vars: ReplaceMealVars): Promise<unknown>;
}

/** Schreibversuche, bevor ein anhaltender Wettlauf als Fehler durchgereicht wird. */
const MAX_ROUNDS = 3;

/**
 * Der eine Einplan-Ablauf aller Einstiegspunkte: Allergie-Hinweis, dann
 * „schon etwas geplant", dann schreiben.
 *
 * **Reihenfolge ist Inhalt.** Eine offene Löschung auf dem Platz wird zuerst
 * abgeschlossen, *dann* wird der Platz gelesen — sonst nennte der Dialog das
 * gerade gelöschte Rezept (Undo-Fenster, 5 s). Und weil zwischen Lesen und
 * Schreiben ein anderes Elternteil denselben Platz füllen kann, fängt der Ablauf
 * `MealSlotOccupiedError` ab und fragt mit dem frischen Eintrag erneut, statt
 * einen Fehler zu zeigen. Nach {@link MAX_ROUNDS} Runden gilt der Wettlauf als
 * Fehler und wird weitergeworfen.
 */
export async function runPlanning(
  req: PlanningRequest,
  deps: PlanningDeps,
): Promise<"planned" | "cancelled"> {
  const { recipe, date, slot } = req;

  await deps.commitPendingDelete(date, slot);
  const occupant = req.replaceTarget ? null : deps.getOccupant(date, slot);

  const steps = planningSteps({
    allergy: req.allergy,
    occupant,
    intent: req.replaceTarget ? "replace" : "plan",
  });
  for (const step of steps) {
    if (!(await deps.confirm(step))) return "cancelled";
  }

  let target: { entryId: string; seenRecipeId: string } | null =
    req.replaceTarget ??
    (occupant ? { entryId: occupant.id, seenRecipeId: occupant.recipe_id } : null);

  for (let round = 1; ; round += 1) {
    try {
      if (target) await deps.replace({ ...target, date, slot, recipe });
      else await deps.plan({ date, slot, recipe });
      return "planned";
    } catch (err) {
      if (!(err instanceof MealSlotOccupiedError) || round >= MAX_ROUNDS) throw err;
      if (!(await deps.confirm({ kind: "confirmReplace", current: err.current }))) {
        return "cancelled";
      }
      target = { entryId: err.current.id, seenRecipeId: err.current.recipe_id };
    }
  }
}
