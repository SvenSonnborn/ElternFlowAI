import type { AllergenKey, FamilyAllergyState, JudgeableRecipe } from "./allergens";
import type { MealPlanEntryWithRecipe } from "./types";

// Relativ aus dem Blatt-Modul, nicht aus dem Barrel: `runPlanning` ist
// bun-getestet, und der Barrel zieht `@/features/auth` und nativewind herein.
import { judgeRecipe } from "./allergens";

/** Ergebnis der Allergie-Prüfung für genau ein Rezept und die ganze Familie. */
export type AllergyCheck =
  | { kind: "ok" }
  | { kind: "hits"; status: "unsafe" | "caution"; keys: AllergenKey[] }
  | { kind: "unknown" }
  | { kind: "loading" };

/**
 * Übersetzt Urteil und Ladezustand in das, was der Einplan-Ablauf braucht.
 *
 * Anders als `judgeWithAllergyState` (das `loading` und `unknown` beide zu
 * `unverified` faltet) trennt es die beiden Fälle: Laden sperrt das Einplanen,
 * unbekannte Allergien (Fehler, offline, nie geladen) fragen nach („konnten
 * nicht geprüft werden"). `unverified` aus
 * `judgeRecipe` ist dagegen **kein** Hinweis — die Heuristik kann Abwesenheit
 * nie belegen, und ein Dialog bei jedem Rezept ohne Deklaration wäre Lärm.
 */
export function allergyCheck(recipe: JudgeableRecipe, allergies: FamilyAllergyState): AllergyCheck {
  if (allergies.kind !== "known") return { kind: allergies.kind };

  const verdict = judgeRecipe(recipe, allergies.keys);
  if (verdict.status === "unsafe" || verdict.status === "caution") {
    return {
      kind: "hits",
      status: verdict.status,
      keys: [...new Set(verdict.hits.map((hit) => hit.key))],
    };
  }
  return { kind: "ok" };
}

/** Eine Rückfrage an den Nutzer, bevor geschrieben wird. */
export type PlanningStep =
  | { kind: "confirmAllergy"; status: "unsafe" | "caution"; keys: AllergenKey[] }
  | { kind: "confirmAllergyUnknown" }
  | { kind: "confirmReplace"; current: MealPlanEntryWithRecipe };

/**
 * Die Fragen vor dem Schreiben, in der Reihenfolge, in der sie gestellt werden:
 * erst der Allergie-Hinweis, dann „schon etwas geplant". Beim bewussten
 * Ersetzen (`intent: "replace"`, „Anderes Rezept wählen") entfällt die
 * zweite — der Nutzer hat den Platz gerade selbst angesteuert.
 */
export function planningSteps(input: {
  allergy: Exclude<AllergyCheck, { kind: "loading" }>;
  occupant: MealPlanEntryWithRecipe | null;
  intent: "plan" | "replace";
}): PlanningStep[] {
  const steps: PlanningStep[] = [];
  const { allergy } = input;
  if (allergy.kind === "hits") {
    steps.push({ kind: "confirmAllergy", status: allergy.status, keys: allergy.keys });
  } else if (allergy.kind === "unknown") {
    steps.push({ kind: "confirmAllergyUnknown" });
  }
  if (input.intent === "plan" && input.occupant) {
    steps.push({ kind: "confirmReplace", current: input.occupant });
  }
  return steps;
}
