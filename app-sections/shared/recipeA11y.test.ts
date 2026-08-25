import type { TFunction } from "i18next";

import { describe, expect, test } from "bun:test";

import type { AllergenHit, RecipeAllergenVerdict } from "@/features/meals";

import { recipeA11yLabel } from "./recipeA11y";

/**
 * Ein `t`, das Schlüssel und Platzhalter sichtbar macht. Die Tests prüfen
 * damit, welcher Copy-Key gewählt wurde — nicht, wie er übersetzt ist. Der
 * Wortlaut gehört dem Designer und darf sich ändern, ohne diese Tests zu
 * brechen.
 */
const t = ((key: string, options?: Record<string, string>) =>
  options
    ? `${key}(${Object.entries(options)
        .map(([name, value]) => `${name}=${value}`)
        .join("|")})`
    : key) as unknown as TFunction;

function hit(key: AllergenHit["key"], source: AllergenHit["source"] = "ingredient"): AllergenHit {
  return { key, source, evidence: key };
}

const TITLE = "Kürbis-Risotto";

describe("recipeA11yLabel", () => {
  test("laesst ein sicheres Rezept beim blossen Titel", () => {
    expect(recipeA11yLabel(t, TITLE, { status: "safe" })).toBe(TITLE);
  });

  test("benennt ein ungeprueftes Rezept als solches", () => {
    expect(recipeA11yLabel(t, TITLE, { status: "unverified" })).toBe(
      `meals.a11y.unverifiedRecipe(title=${TITLE})`,
    );
  });

  test("nennt bei einem Treffer das Allergen", () => {
    const verdict: RecipeAllergenVerdict = { status: "unsafe", hits: [hit("peanuts")] };

    expect(recipeA11yLabel(t, TITLE, verdict)).toBe(
      `meals.a11y.unsafeRecipe(title=${TITLE}|list=onb.s4.allergies.peanuts)`,
    );
  });

  test("unterscheidet Verdacht von Gewissheit", () => {
    const verdict: RecipeAllergenVerdict = { status: "caution", hits: [hit("milk")] };

    expect(recipeA11yLabel(t, TITLE, verdict)).toBe(
      `meals.a11y.cautionRecipe(title=${TITLE}|list=onb.s4.allergies.milk)`,
    );
  });

  test("nennt ein Allergen einmal, auch wenn zwei Quellen darauf zeigen", () => {
    const verdict: RecipeAllergenVerdict = {
      status: "unsafe",
      hits: [hit("milk", "declared"), hit("milk"), hit("eggs")],
    };

    expect(recipeA11yLabel(t, TITLE, verdict)).toBe(
      `meals.a11y.unsafeRecipe(title=${TITLE}|list=onb.s4.allergies.milk, onb.s4.allergies.eggs)`,
    );
  });
});
