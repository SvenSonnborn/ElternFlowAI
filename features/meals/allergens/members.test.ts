import { describe, expect, test } from "bun:test";

import { mergeAllergies } from "./members";

describe("mergeAllergies", () => {
  test("vereinigt Kinder und Eltern ohne Duplikate", () => {
    expect(
      mergeAllergies([{ allergies: ["milk", "eggs"] }, { allergies: ["eggs", "peanuts"] }]),
    ).toEqual(["eggs", "milk", "peanuts"]);
  });

  test("sortiert stabil, damit der useMemo-Vergleich greift", () => {
    expect(mergeAllergies([{ allergies: ["soy", "gluten"] }])).toEqual(["gluten", "soy"]);
  });

  test("verwirft unbekannte Werte", () => {
    // children.allergies ist ein freies text[]; Altdaten und ein künftiges
    // Freitext-Feld dürfen den Klassifizierer nicht mit Müll füttern.
    expect(mergeAllergies([{ allergies: ["milk", "fructose", ""] }])).toEqual(["milk"]);
  });

  test("verträgt null und leere Arrays", () => {
    expect(mergeAllergies([{ allergies: null }, { allergies: [] }])).toEqual([]);
    expect(mergeAllergies([])).toEqual([]);
  });
});
