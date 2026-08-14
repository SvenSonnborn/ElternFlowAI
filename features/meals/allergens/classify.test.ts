import { describe, expect, test } from "bun:test";

import type { Ingredient } from "../types";

import { scanIngredients, scanText } from "./classify";
import { ALLERGEN_KEYS } from "./keys";
import { ALLERGEN_SPECS, keysForDeclaredCode } from "./terms";

function ing(de: string, en?: string): Ingredient {
  return { amount: null, unit: null, name: en ? { de, en } : { de } };
}

// Explizit getypt statt inline: `test.each` mit einem gemischten Array-Literal
// leitet sonst `string | string[]` für beide Parameter ab und der Typecheck
// bricht am `scanText(text)`-Aufruf.
const GOLDEN: [string, string[]][] = [
  ["Spaghetti", ["gluten"]],
  ["Gluten", ["gluten"]],
  ["Haferflocken", ["gluten"]],
  ["Eigelb", ["eggs"]],
  ["Pecorino", ["milk"]],
  ["Erdnüsse", ["peanuts"]],
  ["Fischsauce", ["fish"]],
  ["Sojasauce", ["soy"]],
  ["Sesamöl", ["sesame"]],
  ["Sellerieknolle", ["celery"]],
  ["Dijon-Senf", ["mustard"]],
  ["Garnelen", ["crustaceans"]],
  ["Jakobsmuscheln", ["molluscs"]],
  ["Lupinenmehl", ["lupin"]],
  ["Haselnusskerne", ["nuts"]],
];

const FALSE_FRIENDS: [string, string][] = [
  ["Reis", "eggs"],
  ["Weizen", "eggs"],
  ["Buchweizenmehl", "gluten"],
  ["Reisnudeln", "gluten"],
  ["Schweinefleisch", "sulphites"],
  ["Kokosnuss", "nuts"],
  ["Muskatnuss", "nuts"],
  // `oats` steckt als Substring in "goats" — daher `word`-Modus.
  ["Goats cheese", "gluten"],
];

const NEGATED: [string, string][] = [
  ["glutenfreies Mehl", "gluten"],
  ["gluten free flour", "gluten"],
  ["Sojaersatz", "soy"],
  ["ohne Ei", "eggs"],
  ["vegane Sahne", "milk"],
  ["milchfreie Schokolade", "milk"],
];

describe("scanText — Golden-Corpus", () => {
  test.each(GOLDEN)("%s → %j", (text, expected) => {
    // `actual` verbreitert auf `string[]`: `toEqual` verlangt sonst
    // `AllergenKey[]`, und die Erwartungswerte oben sind bewusst rohe Strings.
    const actual: string[] = scanText(text);
    expect(actual.sort()).toEqual([...expected].sort());
  });
});

describe("scanText — falsche Freunde", () => {
  test.each(FALSE_FRIENDS)("%s trifft nicht %s", (text, forbidden) => {
    expect(scanText(text)).not.toContain(forbidden);
  });

  test("Erdnussbutter ist peanuts, nicht nuts", () => {
    const keys = scanText("Erdnussbutter");
    expect(keys).toContain("peanuts");
    expect(keys).not.toContain("nuts");
  });

  test("Mandelmehl ist nuts, nicht gluten", () => {
    const keys = scanText("Mandelmehl");
    expect(keys).toContain("nuts");
    expect(keys).not.toContain("gluten");
  });
});

describe("scanText — Negation", () => {
  test.each(NEGATED)("%s trifft nicht %s", (text, forbidden) => {
    expect(scanText(text)).not.toContain(forbidden);
  });

  test("laktosefreie Milch bleibt milk", () => {
    // Laktosefrei heißt gespaltener Milchzucker, nicht entferntes Milcheiweiß.
    // Ein milchallergisches Kind kann das nicht essen. Der Guard wirkt pro
    // Vorkommen: `laktose` wird negiert, `milch` bleibt stehen.
    expect(scanText("laktosefreie Milch")).toContain("milk");
  });

  test("veganer Käse mit Cashews bleibt nuts", () => {
    const keys = scanText("veganer Käse mit Cashews");
    expect(keys).not.toContain("milk");
    expect(keys).toContain("nuts");
  });

  test("Mandelmilch ist nuts, nicht milk", () => {
    expect(scanText("Mandelmilch")).toEqual(["nuts"]);
  });

  test("ein Wort, das nur mit einem Negationswort beginnt, negiert nicht", () => {
    // "frei" als Präfix von "Freilandhaltung" ist keine Negation. Ohne
    // vollständigen Token-Vergleich verschluckte der Guard hier den
    // Ei-Treffer — ein plausibler Zutatentext, der ein Allergen verliert.
    expect(scanText("Eier, Freilandhaltung")).toContain("eggs");
    expect(scanText("Ei Freilandhaltung")).toContain("eggs");
  });

  test("gebeugte Negationsformen greifen weiterhin", () => {
    expect(scanText("glutenfreier Teig")).not.toContain("gluten");
    expect(scanText("glutenfreies Mehl")).not.toContain("gluten");
    expect(scanText("laktosefreier Joghurt")).toContain("milk");
  });

  test.todo("ein negiertes Schlüsselwort räumt den ganzen Key ab", () => {
    // "glutenfreie Nudeln" meldet aktuell `gluten`: der Term `gluten` wird
    // negiert, aber `nudeln` trifft unabhängig davon. Das ist ein False
    // Positive — also die sichere Richtung —, aber bei einem so verbreiteten
    // Produkt störend.
    //
    // Der Fix ist nicht "Negation gilt für den ganzen Key": genau daran hängt
    // der laktosefrei-Fall, wo `milch` stehen bleiben MUSS. Die Trennlinie
    // verläuft anders — `gluten` ist der Name des Allergens selbst, `laktose`
    // dagegen nur ein Begleitstoff der Milch. Nötig wäre ein `selfTerms`-Feld
    // je Spec: wird ein Term negiert, der das Allergen selbst benennt, fällt
    // der ganze Key. Siehe docs/TODO.md.
    expect(scanText("glutenfreie Nudeln")).not.toContain("gluten");
  });
});

describe("scanIngredients", () => {
  test("sammelt über die ganze Zutatenliste und dedupliziert", () => {
    const hits = scanIngredients([ing("Spaghetti"), ing("Eigelb"), ing("Pecorino")]);
    expect(hits.map((h) => h.key).sort()).toEqual(["eggs", "gluten", "milk"]);
  });

  test("liest auch die englische Variante", () => {
    const hits = scanIngredients([ing("", "anchovy fillets")]);
    expect(hits.map((h) => h.key)).toContain("fish");
  });

  test("nennt die auslösende Zutat als evidence", () => {
    const hits = scanIngredients([ing("Haselnusskerne")]);
    expect(hits[0]?.evidence).toBe("Haselnusskerne");
  });

  test("liefert für eine leere Liste nichts", () => {
    expect(scanIngredients([])).toEqual([]);
  });
});

describe("ALLERGEN_SPECS — Vollständigkeit", () => {
  test("jeder Key hat genau einen Spec-Eintrag", () => {
    expect(ALLERGEN_SPECS.map((s) => s.key).sort()).toEqual([...ALLERGEN_KEYS].sort());
  });

  test("jeder Key hat mindestens einen DE- und einen EN-Term", () => {
    // Bricht, sobald jemand einen Key ergänzt, ohne die Begriffsliste
    // nachzuziehen — genau die Lücke, die diese Iteration ausgelöst hat.
    for (const spec of ALLERGEN_SPECS) {
      expect(spec.terms.length, `${spec.key} hat zu wenige Terme`).toBeGreaterThanOrEqual(2);
    }
  });

  test("jeder Key ist über seinen eigenen Namen deklarierbar", () => {
    for (const key of ALLERGEN_KEYS) {
      expect(keysForDeclaredCode(key), `${key} nicht als Code deklarierbar`).toContain(key);
    }
  });

  test("keysForDeclaredCode bildet die Rezept-Codes der Migration ab", () => {
    expect(keysForDeclaredCode("egg")).toEqual(["eggs"]);
    expect(keysForDeclaredCode("wheat")).toEqual(["gluten"]);
    expect(keysForDeclaredCode("MILK")).toEqual(["milk"]);
    expect(keysForDeclaredCode("unbekannt")).toEqual([]);
  });

  test("ein mehrdeutiger Code trifft alle Keys, die er bedeuten kann", () => {
    // `shellfish` deckt umgangssprachlich Krebs- UND Weichtiere ab. Wäre der
    // Code nur einer Seite zugeordnet, ergäbe ein Rezept damit für die andere
    // fälschlich `safe` — bekannter Code, aber am Allergen vorbei.
    expect(keysForDeclaredCode("shellfish").sort()).toEqual(["crustaceans", "molluscs"]);
  });
});
