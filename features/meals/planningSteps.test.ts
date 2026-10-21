import { describe, expect, test } from "bun:test";

import type { JudgeableRecipe } from "./allergens";
import type { MealPlanEntryWithRecipe } from "./types";

import { allergyCheck, planningSteps, type AllergyCheck } from "./planningSteps";

const occupant = { id: "e-1", recipe_id: "r-1" } as MealPlanEntryWithRecipe;

const milkRecipe: JudgeableRecipe = { contains_allergens: ["milk"], ingredients: [] };
const butterRecipe: JudgeableRecipe = {
  contains_allergens: null,
  ingredients: [{ amount: null, unit: null, name: { de: "Butter", en: "Butter" } }],
};
const bareRecipe: JudgeableRecipe = { contains_allergens: null, ingredients: [] };

describe("allergyCheck", () => {
  test("Laden hat Vorrang", () => {
    expect(allergyCheck(milkRecipe, { keys: ["milk"], isLoading: true, error: null })).toEqual({
      kind: "loading",
    });
  });

  test("Fehler ergibt unknown", () => {
    expect(allergyCheck(milkRecipe, { keys: [], isLoading: false, error: new Error("x") })).toEqual(
      { kind: "unknown" },
    );
  });

  test("deklarierter Treffer ergibt unsafe mit eindeutigen Keys", () => {
    const check = allergyCheck(milkRecipe, { keys: ["milk"], isLoading: false, error: null });
    expect(check).toEqual({ kind: "hits", status: "unsafe", keys: ["milk"] });
  });

  test("Zutaten-Treffer ergibt caution", () => {
    const check = allergyCheck(butterRecipe, { keys: ["milk"], isLoading: false, error: null });
    expect(check).toMatchObject({ kind: "hits", status: "caution" });
  });

  test("unverified ergibt ok", () => {
    expect(allergyCheck(bareRecipe, { keys: ["milk"], isLoading: false, error: null })).toEqual({
      kind: "ok",
    });
  });

  test("safe ergibt ok", () => {
    expect(allergyCheck(milkRecipe, { keys: [], isLoading: false, error: null })).toEqual({
      kind: "ok",
    });
  });
});

describe("planningSteps", () => {
  const hits: AllergyCheck = { kind: "hits", status: "unsafe", keys: ["milk"] };

  test("Treffer plus Belegung: erst Allergie, dann Ersetzen", () => {
    expect(planningSteps({ allergy: hits, occupant, intent: "plan" })).toEqual([
      { kind: "confirmAllergy", status: "unsafe", keys: ["milk"] },
      { kind: "confirmReplace", current: occupant },
    ]);
  });

  test("ok und leer ergibt keine Frage", () => {
    expect(planningSteps({ allergy: { kind: "ok" }, occupant: null, intent: "plan" })).toEqual([]);
  });

  test("unknown ergibt den eigenen Hinweis", () => {
    expect(planningSteps({ allergy: { kind: "unknown" }, occupant: null, intent: "plan" })).toEqual(
      [{ kind: "confirmAllergyUnknown" }],
    );
  });

  test("bewusstes Ersetzen fragt nicht nach dem Ersetzen", () => {
    expect(planningSteps({ allergy: { kind: "ok" }, occupant, intent: "replace" })).toEqual([]);
  });
});
