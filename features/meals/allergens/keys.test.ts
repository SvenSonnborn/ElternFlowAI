import { describe, expect, test } from "bun:test";

import { ALLERGEN_KEYS, isAllergenKey } from "./keys";

describe("ALLERGEN_KEYS", () => {
  test("führt genau die 14 EU-Pflichtallergene", () => {
    expect(ALLERGEN_KEYS).toHaveLength(14);
  });

  test("enthält die sechs bestehenden Keys wortgleich", () => {
    // Diese sechs stehen bereits in children.allergies/parents.allergies.
    // Eine Umbenennung wäre ein Datenmigrations-Fall — der Test hält sie fest.
    for (const key of ["peanuts", "milk", "eggs", "gluten", "soy", "nuts"]) {
      expect(ALLERGEN_KEYS).toContain(key);
    }
  });

  test("enthält keine Duplikate", () => {
    expect(new Set(ALLERGEN_KEYS).size).toBe(ALLERGEN_KEYS.length);
  });

  test("isAllergenKey trennt bekannte von unbekannten Werten", () => {
    expect(isAllergenKey("sesame")).toBe(true);
    expect(isAllergenKey("fructose")).toBe(false);
    expect(isAllergenKey("")).toBe(false);
  });
});
