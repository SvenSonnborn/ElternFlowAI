import type { MealPlanEntryWithRecipe } from "./types";

/**
 * Wird vor jedem Netzwerkaufruf geworfen, wenn eine Mutation die Eltern-Zeile
 * braucht und sie noch nicht geladen ist. Lokal definiert statt aus
 * `features/tasks` importiert: Zwei Features sollen sich nicht über eine
 * Fehlerklasse aneinander binden.
 */
export class MissingParentError extends Error {
  constructor() {
    super("Current parent is not loaded");
    this.name = "MissingParentError";
  }
}

/**
 * Der Platz trägt gerade `current` — nicht das, was der Aufrufer annahm.
 *
 * `meal_plan_entries` hat kein `updated_at`; der Schutz gegen fremde
 * Änderungen läuft über die gesehene `recipe_id`. Wer diesen Fehler fängt,
 * fragt den Nutzer mit dem frischen Eintrag erneut, statt ihn mit einem Toast
 * abzuspeisen.
 */
export class MealSlotOccupiedError extends Error {
  constructor(readonly current: MealPlanEntryWithRecipe) {
    super("Meal slot is occupied by a different entry");
    this.name = "MealSlotOccupiedError";
  }
}

export type MealErrorKey =
  | "meals.error.generic"
  | "meals.error.notAuthenticated"
  | "meals.error.recipeGone"
  | "meals.error.changed";

/**
 * Ordnet die *Ursache* einem i18n-Key zu. Über `instanceof`, nicht über
 * `name`: beide Klassen leben in diesem Feature.
 */
export function mapMealError(err: unknown): MealErrorKey {
  if (err instanceof MealSlotOccupiedError) return "meals.error.changed";
  if (err instanceof MissingParentError) return "meals.error.notAuthenticated";

  const code =
    typeof err === "object" && err !== null && "code" in err
      ? (err as { code?: unknown }).code
      : undefined;
  // 42501: RLS verweigert die Zeile. 23503: das Rezept existiert nicht mehr.
  if (code === "42501") return "meals.error.notAuthenticated";
  if (code === "23503") return "meals.error.recipeGone";
  return "meals.error.generic";
}
