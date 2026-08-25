import { describe, expect, test } from "bun:test";

import type { Ingredient } from "./types";

import { pickAlternative } from "./alternative";

function ing(de: string): Ingredient {
  return { amount: null, unit: null, name: { de } };
}

/**
 * Die minimale Form, die `pickAlternative` verlangt — dieselbe strukturelle
 * Typung wie `JudgeableRecipe` in `allergens/judge.ts`, damit ein Test keine
 * vollständige `RecipeRow` mit zwanzig Spalten bauen muss.
 */
function recipe(id: string, declared: string[], ingredients: string[]) {
  return { id, contains_allergens: declared, ingredients: ingredients.map(ing) };
}

/** Deklariert und ohne Treffer — das einzige, was `judgeRecipe` `safe` nennt. */
const SAFE_A = recipe("a", ["none"], ["Reis", "Karotte"]);
const SAFE_B = recipe("b", ["none"], ["Kartoffel", "Lauch"]);
const SAFE_C = recipe("c", ["none"], ["Polenta", "Zucchini"]);

/** Deklariert Milch — für eine Milch-Familie `unsafe`. */
const UNSAFE = recipe("u", ["milk"], ["Sahne", "Nudeln"]);

/** Zutat trifft, Deklaration nicht — `caution`. */
const CAUTION = recipe("k", ["none"], ["Butter", "Nudeln"]);

/** Leere Deklaration ohne Zutatentreffer — `unverified`, keine Entwarnung. */
const UNVERIFIED = recipe("v", [], ["Reis", "Karotte"]);

const MILK = ["milk"] as const;

describe("pickAlternative", () => {
  test("wählt ein Rezept, das für die Familie sicher ist", () => {
    expect(pickAlternative([SAFE_A], MILK, { seed: "2026-08-25-dinner" })).toBe(SAFE_A);
  });

  test("überspringt unsichere, fragliche und ungeprüfte Rezepte", () => {
    // `unverified` gehört ausdrücklich dazu: die Heuristik kann Anwesenheit
    // belegen, nie Abwesenheit — ein ungeprüftes Rezept als Ausweg aus einem
    // Allergen-Treffer anzubieten wäre eine Entwarnung ohne Deckung.
    const pool = [UNSAFE, CAUTION, UNVERIFIED, SAFE_A];
    expect(pickAlternative(pool, MILK, { seed: "2026-08-25-dinner" })).toBe(SAFE_A);
  });

  test("bietet nicht das Rezept an, das ohnehin schon geplant ist", () => {
    const pool = [SAFE_A, SAFE_B];
    const picked = pickAlternative(pool, MILK, { seed: "s", excludeId: SAFE_A.id });
    expect(picked).toBe(SAFE_B);
  });

  test("gibt null, wenn kein Kandidat übrig bleibt", () => {
    expect(pickAlternative([UNSAFE, CAUTION], MILK, { seed: "s" })).toBeNull();
    expect(pickAlternative([], MILK, { seed: "s" })).toBeNull();
    expect(pickAlternative([SAFE_A], MILK, { seed: "s", excludeId: SAFE_A.id })).toBeNull();
  });

  test("liefert für denselben Seed immer dasselbe Rezept", () => {
    // Der Kern der Sache: mit `Math.random` wechselte der Vorschlag bei jedem
    // Re-Render des Dashboards.
    const pool = [SAFE_A, SAFE_B, SAFE_C];
    const first = pickAlternative(pool, MILK, { seed: "2026-08-25-dinner" });
    expect(pickAlternative(pool, MILK, { seed: "2026-08-25-dinner" })).toBe(first);
    expect(pickAlternative(pool, MILK, { seed: "2026-08-25-dinner" })).toBe(first);
  });

  test("verteilt über verschiedene Seeds mehr als ein Rezept", () => {
    // Ohne diese Zusicherung wäre „immer das erste" eine bestehende Lösung für
    // den Determinismus-Test — und jeder Tag zeigte dasselbe Gericht.
    const pool = [SAFE_A, SAFE_B, SAFE_C];
    const seen = new Set(
      Array.from(
        { length: 20 },
        (_, i) => pickAlternative(pool, MILK, { seed: `2026-08-${i}-dinner` })?.id,
      ),
    );
    expect(seen.size).toBeGreaterThan(1);
  });

  test("hängt nicht an der Reihenfolge des Pools", () => {
    // PostgREST sortiert nach `created_at` mit `id`-Tiebreak; ein neu
    // importiertes Rezept darf den Vorschlag des Tages nicht durchwürfeln,
    // solange es selbst kein Kandidat ist.
    const picked = pickAlternative([SAFE_A, SAFE_B, SAFE_C], MILK, { seed: "s" });
    expect(pickAlternative([SAFE_C, SAFE_A, SAFE_B], MILK, { seed: "s" })).toBe(picked);
  });

  test("eine Familie ohne Allergien bekommt trotzdem einen Kandidaten", () => {
    // `judgeRecipe` nennt für eine Familie ohne Einträge jedes Rezept `safe`
    // — auch das ungeprüfte. Der Hook fragt hier zwar nie an (ohne Treffer
    // gibt es nichts auszuweichen), aber die Funktion darf deshalb nicht leer
    // ausgehen.
    expect(pickAlternative([UNVERIFIED], [], { seed: "s" })).toBe(UNVERIFIED);
  });
});
