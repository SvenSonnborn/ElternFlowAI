import { describe, expect, test } from "bun:test";

import type { Database, Json } from "@/features/supabase/database.types";

import {
  escapeLike,
  formatAmount,
  localize,
  normalizeRecipe,
  toIngredients,
  toInstructions,
  toLocalizedText,
  toOptionalLocalizedText,
} from "./normalize";

type DbRecipeRow = Database["public"]["Tables"]["recipes"]["Row"];

/** Nur die vier JSONB-Spalten tragen Bedeutung; der Rest füllt `DbRecipeRow` auf. */
function makeDbRecipe(overrides: Partial<DbRecipeRow> = {}): DbRecipeRow {
  return {
    id: "recipe-1",
    source: "user_custom",
    source_external_id: null,
    source_url: null,
    created_by_family_id: null,
    title: { de: "Kürbis-Risotto" },
    description: null,
    image_url: null,
    duration_min: 35,
    servings: 4,
    difficulty: "easy",
    ingredients: [],
    instructions: [],
    contains_allergens: [],
    diet_tags: [],
    keywords: [],
    recipe_dedup_hash: "hash-1",
    fetched_at: "2026-08-13T08:00:00.000Z",
    created_at: "2026-08-13T08:00:00.000Z",
    ...overrides,
  };
}

describe("toLocalizedText", () => {
  test("lässt ein vollständiges Objekt unverändert", () => {
    expect(toLocalizedText({ de: "Pasta", en: "Pasta al forno" })).toEqual({
      de: "Pasta",
      en: "Pasta al forno",
    });
  });

  test("hebt einen nackten String nach DE", () => {
    expect(toLocalizedText("Pasta")).toEqual({ de: "Pasta" });
  });

  test("behält EN, wenn DE fehlt", () => {
    expect(toLocalizedText({ en: "Pasta" })).toEqual({ de: "", en: "Pasta" });
  });

  test("gibt bei unbrauchbaren Werten ein leeres DE zurück", () => {
    const junk: Json[] = [null, 42, true, [], {}];
    for (const value of junk) {
      expect(toLocalizedText(value)).toEqual({ de: "" });
    }
    expect(toLocalizedText(undefined)).toEqual({ de: "" });
  });
});

describe("toOptionalLocalizedText", () => {
  test("gibt null zurück, wenn nichts Lesbares drinsteht", () => {
    expect(toOptionalLocalizedText(null)).toBeNull();
    expect(toOptionalLocalizedText([])).toBeNull();
    expect(toOptionalLocalizedText({ de: "" })).toBeNull();
  });

  test("gibt den Text zurück, wenn eine Sprache gefüllt ist", () => {
    expect(toOptionalLocalizedText({ de: "Cremig" })).toEqual({ de: "Cremig" });
    expect(toOptionalLocalizedText({ en: "Creamy" })).toEqual({ de: "", en: "Creamy" });
  });

  test("behandelt einen durchweg leeren Whitespace-String wie einen leeren", () => {
    expect(toOptionalLocalizedText({ de: "   " })).toBeNull();
  });
});

describe("toIngredients", () => {
  test("liest Menge, Einheit und Namen", () => {
    expect(toIngredients([{ amount: "300", unit: "g", name: { de: "Risotto-Reis" } }])).toEqual([
      { amount: "300", unit: "g", name: { de: "Risotto-Reis" } },
    ]);
  });

  test("verwirft kaputte Elemente und behält die intakten", () => {
    const result = toIngredients([
      { amount: "300", unit: "g", name: { de: "Reis" } },
      "kein Objekt",
      { amount: "1", unit: null },
      { name: { de: "Salz" } },
    ]);

    expect(result).toEqual([
      { amount: "300", unit: "g", name: { de: "Reis" } },
      { amount: null, unit: null, name: { de: "Salz" } },
    ]);
  });

  test("akzeptiert eine numerische Menge und einen nackten Namen", () => {
    expect(toIngredients([{ amount: 300, unit: "g", name: "Reis" }])).toEqual([
      { amount: "300", unit: "g", name: { de: "Reis" } },
    ]);
  });

  test("gibt [] zurück, wenn der Wert kein Array ist", () => {
    expect(toIngredients(null)).toEqual([]);
    expect(toIngredients({ de: "nope" })).toEqual([]);
  });
});

describe("toInstructions", () => {
  test("nimmt Objekte und nackte Strings", () => {
    expect(toInstructions([{ de: "Wasser kochen" }, "Reis zugeben"])).toEqual([
      { de: "Wasser kochen" },
      { de: "Reis zugeben" },
    ]);
  });

  test("verwirft leere Schritte", () => {
    expect(toInstructions([{ de: "" }, "", { de: "Umrühren" }])).toEqual([{ de: "Umrühren" }]);
  });

  test("verwirft einen Whitespace-only-Schritt statt eine Leerzeile zu rendern", () => {
    expect(toInstructions(["   ", { de: "Umrühren" }])).toEqual([{ de: "Umrühren" }]);
  });

  test("gibt [] zurück, wenn der Wert kein Array ist", () => {
    expect(toInstructions(null)).toEqual([]);
  });
});

describe("localize", () => {
  test("nimmt die gewünschte Sprache", () => {
    expect(localize({ de: "Nudeln", en: "Pasta" }, "de")).toBe("Nudeln");
    expect(localize({ de: "Nudeln", en: "Pasta" }, "en")).toBe("Pasta");
  });

  test("erkennt Regionalcodes wie en-US", () => {
    expect(localize({ de: "Nudeln", en: "Pasta" }, "en-US")).toBe("Pasta");
  });

  test("fällt in beide Richtungen auf die gefüllte Sprache zurück", () => {
    expect(localize({ de: "Nudeln" }, "en")).toBe("Nudeln");
    expect(localize({ de: "", en: "Pasta" }, "de")).toBe("Pasta");
  });

  test("gibt einen leeren String zurück, wenn nichts da ist", () => {
    expect(localize({ de: "" }, "de")).toBe("");
    expect(localize(null, "de")).toBe("");
    expect(localize(undefined, "de")).toBe("");
  });
});

describe("formatAmount", () => {
  test("setzt Menge und Einheit mit einem Leerzeichen zusammen", () => {
    expect(formatAmount({ amount: "400", unit: "g", name: { de: "Spaghetti" } })).toBe("400 g");
  });

  test("gibt die Menge allein zurück, wenn keine Einheit da ist", () => {
    expect(formatAmount({ amount: "4", unit: null, name: { de: "Eigelb" } })).toBe("4");
  });

  test("gibt die Einheit allein zurück, wenn keine Menge da ist", () => {
    // "1 Prise" ohne die 1 bleibt als "Prise" lesbar — eine erfundene Menge wäre falsch.
    expect(formatAmount({ amount: null, unit: "Prise", name: { de: "Salz" } })).toBe("Prise");
  });

  test("gibt einen leeren String zurück, wenn beides fehlt", () => {
    expect(formatAmount({ amount: null, unit: null, name: { de: "Olivenöl" } })).toBe("");
  });

  test("behandelt reinen Whitespace wie ein leeres Feld", () => {
    // `toIngredients` trimmt bereits, aber der Helfer ist exportiert und darf
    // sich nicht darauf verlassen, nur von dort gefüttert zu werden.
    expect(formatAmount({ amount: "  ", unit: " g ", name: { de: "Mehl" } })).toBe("g");
  });
});

describe("escapeLike", () => {
  test("maskiert die LIKE-Platzhalter", () => {
    expect(escapeLike("50% Rabatt_")).toBe("50\\% Rabatt\\_");
  });

  test("maskiert den Backslash selbst", () => {
    expect(escapeLike("a\\b")).toBe("a\\\\b");
  });

  test("entfernt das PostgREST-Wildcard *", () => {
    expect(escapeLike("*Reis*")).toBe("Reis");
  });
});

describe("normalizeRecipe", () => {
  test("dekodiert die vier JSONB-Spalten und lässt den Rest stehen", () => {
    const recipe = normalizeRecipe(
      makeDbRecipe({
        title: { de: "Kürbis-Risotto", en: "Pumpkin risotto" },
        description: "Cremig",
        ingredients: [{ amount: "300", unit: "g", name: { de: "Reis" } }],
        instructions: ["Zwiebeln anschwitzen"],
        contains_allergens: ["milk"],
      }),
    );

    expect(recipe.title).toEqual({ de: "Kürbis-Risotto", en: "Pumpkin risotto" });
    expect(recipe.description).toEqual({ de: "Cremig" });
    expect(recipe.ingredients).toEqual([{ amount: "300", unit: "g", name: { de: "Reis" } }]);
    expect(recipe.instructions).toEqual([{ de: "Zwiebeln anschwitzen" }]);
    expect(recipe.contains_allergens).toEqual(["milk"]);
    expect(recipe.duration_min).toBe(35);
    expect(recipe.id).toBe("recipe-1");
  });

  test("überlebt ein durchweg kaputtes Rezept", () => {
    const recipe = normalizeRecipe(
      makeDbRecipe({ title: 42, description: [], ingredients: "nope", instructions: null }),
    );

    expect(recipe.title).toEqual({ de: "" });
    expect(recipe.description).toBeNull();
    expect(recipe.ingredients).toEqual([]);
    expect(recipe.instructions).toEqual([]);
  });
});
