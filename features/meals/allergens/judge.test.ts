import { describe, expect, test } from "bun:test";

import type { Ingredient } from "../types";

import { isRecipeSafeForFamily, judgeRecipe, matchedAllergens } from "./judge";

function ing(de: string): Ingredient {
  return { amount: null, unit: null, name: { de } };
}

const CARBONARA = {
  contains_allergens: ["egg", "milk", "wheat"],
  ingredients: [ing("Spaghetti"), ing("Eigelb"), ing("Pecorino")],
};

const UNDECLARED_CARBONARA = {
  contains_allergens: [],
  ingredients: [ing("Spaghetti"), ing("Eigelb"), ing("Pecorino")],
};

const DECLARED_CLEAN = {
  contains_allergens: ["gluten"],
  ingredients: [ing("Reis"), ing("Karotte")],
};

const NOTHING_KNOWN = {
  contains_allergens: [],
  ingredients: [ing("Karotte"), ing("Salz")],
};

describe("judgeRecipe", () => {
  test("Familie ohne Allergien bekommt immer safe", () => {
    // Ohne diese Regel bekäme jede Familie ohne Eintrag überall `unverified`.
    expect(judgeRecipe(NOTHING_KNOWN, [])).toEqual({ status: "safe" });
    expect(judgeRecipe(CARBONARA, [])).toEqual({ status: "safe" });
  });

  test("deklarierter Treffer ergibt unsafe", () => {
    const verdict = judgeRecipe(CARBONARA, ["eggs"]);
    expect(verdict.status).toBe("unsafe");
    if (verdict.status !== "unsafe") throw new Error("unreachable");
    expect(verdict.hits[0]).toMatchObject({ key: "eggs", source: "declared" });
  });

  test("Rezept-Code wird auf den Familien-Key gemappt", () => {
    // `egg` ≠ `eggs`, `wheat` ≠ `gluten` — ohne Mapping schlüge der Filter
    // still fehl und ein eiallergisches Kind bekäme Ei-Rezepte.
    expect(judgeRecipe(CARBONARA, ["gluten"]).status).toBe("unsafe");
  });

  test("nur heuristischer Treffer ergibt caution", () => {
    const verdict = judgeRecipe(UNDECLARED_CARBONARA, ["eggs"]);
    expect(verdict.status).toBe("caution");
    if (verdict.status !== "caution") throw new Error("unreachable");
    expect(verdict.hits[0]).toMatchObject({ key: "eggs", source: "ingredient" });
    expect(verdict.hits[0]?.evidence).toBe("Eigelb");
  });

  test("deklarierter Treffer schlägt heuristischen", () => {
    expect(judgeRecipe(CARBONARA, ["eggs", "milk"]).status).toBe("unsafe");
  });

  test("kein Treffer bei befüllter Deklaration ergibt safe", () => {
    expect(judgeRecipe(DECLARED_CLEAN, ["eggs"])).toEqual({ status: "safe" });
  });

  test("kein Treffer bei leerer Deklaration ergibt unverified, nicht safe", () => {
    // Der Kern des Modells: die Heuristik kann Anwesenheit belegen, niemals
    // Abwesenheit. Eine leere Deklaration wird nie zu Grün.
    expect(judgeRecipe(NOTHING_KNOWN, ["eggs"])).toEqual({ status: "unverified" });
  });

  test("ein unbekannter Deklarations-Code verhindert safe", () => {
    // Ein Code aus einem fremden Vokabular könnte genau das gesuchte Allergen
    // benennen. Ihn als Entwarnung zu lesen wäre derselbe stille False
    // Negative, gegen den dieses Modul überhaupt gebaut ist.
    expect(judgeRecipe({ contains_allergens: ["sesam_de"], ingredients: [] }, ["sesame"])).toEqual({
      status: "unverified",
    });
  });

  test("der NO_ALLERGENS_CODE gilt als verstanden und erlaubt safe", () => {
    expect(judgeRecipe({ contains_allergens: ["none"], ingredients: [] }, ["eggs"])).toEqual({
      status: "safe",
    });
  });

  test("ein unbekannter Code neben einem bekannten verhindert safe ebenfalls", () => {
    expect(
      judgeRecipe({ contains_allergens: ["wheat", "sesam_de"], ingredients: [] }, ["eggs"]),
    ).toEqual({ status: "unverified" });
  });

  test("ein mehrdeutiger Deklarations-Code trifft beide Gruppen", () => {
    // Vor dem Fix ergab das `safe`: `shellfish` war nur `crustaceans`
    // zugeordnet, galt damit als bekannt und ging an `molluscs` vorbei.
    const shellfishDish = { contains_allergens: ["shellfish"], ingredients: [] };
    expect(judgeRecipe(shellfishDish, ["molluscs"]).status).toBe("unsafe");
    expect(judgeRecipe(shellfishDish, ["crustaceans"]).status).toBe("unsafe");
  });

  test("null in contains_allergens verhält sich wie leer", () => {
    expect(judgeRecipe({ ...NOTHING_KNOWN, contains_allergens: null }, ["eggs"])).toEqual({
      status: "unverified",
    });
  });

  test("meldet nur Keys, die die Familie betreffen", () => {
    const verdict = judgeRecipe(CARBONARA, ["eggs"]);
    if (verdict.status !== "unsafe") throw new Error("unreachable");
    expect(verdict.hits.map((h) => h.key)).toEqual(["eggs"]);
  });
});

describe("isRecipeSafeForFamily", () => {
  test("nur status safe gilt als sicher", () => {
    expect(isRecipeSafeForFamily(DECLARED_CLEAN, ["eggs"])).toBe(true);
    expect(isRecipeSafeForFamily(CARBONARA, ["eggs"])).toBe(false);
    expect(isRecipeSafeForFamily(UNDECLARED_CARBONARA, ["eggs"])).toBe(false);
    expect(isRecipeSafeForFamily(NOTHING_KNOWN, ["eggs"])).toBe(false);
  });
});

describe("matchedAllergens", () => {
  test("liefert die betroffenen Keys, dedupliziert und sortiert", () => {
    expect(matchedAllergens(CARBONARA, ["milk", "eggs"])).toEqual(["eggs", "milk"]);
  });

  test("liefert für ein sicheres Rezept nichts", () => {
    expect(matchedAllergens(DECLARED_CLEAN, ["eggs"])).toEqual([]);
  });
});
