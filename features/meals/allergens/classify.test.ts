import { describe, expect, test } from "bun:test";

import type { Ingredient } from "../types";
import type { AllergenKey } from "./keys";

import { scanIngredients, scanText } from "./classify";
import { ALLERGEN_KEYS } from "./keys";
import { ALLERGEN_SPECS, FOLDED_SPECS, keysForDeclaredCode } from "./terms";

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
});

describe("scanText — Selbstbezeichnungen", () => {
  // Markierung genau wie Spec §5A, Reihenfolge wie in terms.ts
  test("markierte Selbstbezeichnungen je Key", () => {
    const selfTerms = Object.fromEntries(
      ALLERGEN_SPECS.map((s) => [s.key, s.terms.filter((t) => t.self).map((t) => t.text)]),
    );
    expect(selfTerms).toEqual({
      gluten: ["gluten"],
      crustaceans: ["krebs"],
      eggs: ["ei", "eier", "egg", "eggs"],
      fish: ["fisch"],
      peanuts: ["erdnuss", "erdnuesse", "peanut"],
      soy: ["soja", "soy", "soya"],
      milk: ["milch", "milk"],
      nuts: ["nuss", "nut"],
      celery: ["sellerie", "celery"],
      mustard: ["senf", "mustard"],
      sesame: ["sesam", "sesame"],
      sulphites: ["sulfit", "sulphite", "sulfite"],
      lupin: ["lupine", "lupin"],
      molluscs: [],
    });
  });

  // Kein Begriff und kein Ausschluss enthält ein Trennwort als ganzes Wort (Spec §5A)
  test("Trennwörter zerschneiden keinen Begriff", () => {
    const SPLIT = ["oder", "or", "und", "and", "bzw"];
    for (const spec of FOLDED_SPECS)
      for (const text of [...spec.terms.map((t) => t.text), ...spec.exclude])
        expect(text.split(" ").filter((w) => SPLIT.includes(w))).toEqual([]);
  });

  const CLEARED: [string, AllergenKey][] = [
    ["glutenfreie Nudeln", "gluten"],
    ["Nudeln, glutenfrei", "gluten"],
    ["Nudeln (glutenfrei)", "gluten"],
    ["gluten free pasta", "gluten"],
    ["Nudeln ohne Gluten", "gluten"],
    ["milchfreier Käse", "milk"],
    ["nussfreie Mandelcreme", "nuts"], // gewollter Preis (Spec §4)
  ];
  const KEPT: [string, AllergenKey][] = [
    ["laktosefreie Milch", "milk"],
    ["Weizennudeln oder glutenfreie Nudeln", "gluten"],
    ["Butter und milchfreie Margarine", "milk"],
    ["Milch / milchfreier Drink", "milk"],
    ["Milch & milchfreier Drink", "milk"],
    ["Milch, milchfreie Alternative", "milk"],
    ["Vollmilch, milchfrei", "milk"],
    ["haselnussfreie Schokolade mit Mandeln", "nuts"],
    // Sichert Bedingung 2 (unverneintes `nuss` in "walnuss"), nicht Bedingung 1.
    ["haselnussfreie Schokolade mit Walnusskernen", "nuts"],
    ["thunfischfreie Pasta mit Lachs", "fish"],
    ["gluten- und laktosefreie Nudeln", "gluten"], // bekannte Grenze (Spec §5A)
    ["Weizennudeln/glutenfreie Nudeln", "gluten"],
    ["Weizennudeln & glutenfreie Nudeln", "gluten"],
    ["Mandeln, glutenfrei", "nuts"],
    ["Milch /", "milk"],
  ];
  test.each(CLEARED)("%s meldet kein %s", (text, key) => expect(scanText(text)).not.toContain(key));
  test.each(KEPT)("%s meldet %s", (text, key) => expect(scanText(text)).toContain(key));

  test("Mandeln, glutenfrei räumt Gluten ab", () =>
    expect(scanText("Mandeln, glutenfrei")).not.toContain("gluten"));
  test("nur Trennwörter ergeben nichts", () => expect(scanText("oder")).toEqual([]));
  test("räumt nur eine Sprache ab, bleibt die andere", () =>
    expect(scanIngredients([ing("glutenfreie Nudeln", "pasta")])).toContainEqual({
      key: "gluten",
      evidence: "pasta",
    }));
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

  test("nennt die Sprachvariante, die den Treffer ausgelöst hat", () => {
    // Trifft nur der englische Name, wäre der deutsche als evidence irreführend:
    // er benennt eine Zutat, die nichts ausgelöst hat.
    const hits = scanIngredients([ing("Spezialpaste", "peanut butter")]);
    // "peanut butter" trifft zwei Keys: `peanut` und `butter` (Milch).
    expect(hits.map((h) => h.key).sort()).toEqual(["milk", "peanuts"]);
    for (const hit of hits) {
      expect(hit.evidence).toBe("peanut butter");
    }
  });

  test("bevorzugt den deutschen Namen, wenn beide treffen", () => {
    const hits = scanIngredients([ing("Haselnuss", "hazelnut")]);
    expect(hits[0]?.evidence).toBe("Haselnuss");
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

  test("das Ergebnis ist eine Kopie, keine Referenz auf den Index", () => {
    // Sonst schriebe ein Aufrufer mit `.sort()` oder `.push()` das Vokabular
    // für alle folgenden Urteile um.
    const first = keysForDeclaredCode("shellfish");
    first.push("eggs");
    expect(keysForDeclaredCode("shellfish")).not.toContain("eggs");
  });

  test("ein mehrdeutiger Code trifft alle Keys, die er bedeuten kann", () => {
    // `shellfish` deckt umgangssprachlich Krebs- UND Weichtiere ab. Wäre der
    // Code nur einer Seite zugeordnet, ergäbe ein Rezept damit für die andere
    // fälschlich `safe` — bekannter Code, aber am Allergen vorbei.
    expect(keysForDeclaredCode("shellfish").sort()).toEqual(["crustaceans", "molluscs"]);
  });
});
