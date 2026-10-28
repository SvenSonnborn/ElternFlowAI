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
    expect(allergyCheck(milkRecipe, { kind: "loading" })).toEqual({
      kind: "loading",
    });
  });

  test("unbekannte Allergien ergeben unknown", () => {
    expect(allergyCheck(milkRecipe, { kind: "unknown" })).toEqual({ kind: "unknown" });
  });

  test("deklarierter Treffer ergibt unsafe mit eindeutigen Keys", () => {
    const check = allergyCheck(milkRecipe, { kind: "known", keys: ["milk"] });
    expect(check).toEqual({ kind: "hits", status: "unsafe", keys: ["milk"] });
  });

  test("Zutaten-Treffer ergibt caution", () => {
    const check = allergyCheck(butterRecipe, { kind: "known", keys: ["milk"] });
    expect(check).toMatchObject({ kind: "hits", status: "caution" });
  });

  test("unverified ergibt ok", () => {
    expect(allergyCheck(bareRecipe, { kind: "known", keys: ["milk"] })).toEqual({
      kind: "ok",
    });
  });

  test("safe ergibt ok", () => {
    expect(allergyCheck(milkRecipe, { kind: "known", keys: [] })).toEqual({
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

  test("bewusstes Ersetzen mit Treffer: nur der Allergie-Hinweis", () => {
    expect(planningSteps({ allergy: hits, occupant, intent: "replace" })).toEqual([
      { kind: "confirmAllergy", status: "unsafe", keys: ["milk"] },
    ]);
  });
});
