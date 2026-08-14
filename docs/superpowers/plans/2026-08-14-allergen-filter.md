# Allergen-Filter für Rezepte — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rezepte, die eine Allergie eines Familienmitglieds enthalten, werden im Essen-Tab ausgegraut und mit einem farbcodierten Badge gekennzeichnet — belastbar auch dann, wenn die Rezeptdaten keine Allergen-Deklaration mitbringen.

**Architecture:** Ein reines TypeScript-Modul unter `features/meals/allergens/` bildet das EU-14-Vokabular, eine DE/EN-Begriffsliste und ein vierwertiges Urteil ab (`safe` / `unsafe` / `caution` / `unverified`). Es importiert weder React noch Supabase, damit die spätere Klassifizierungs-Edge-Function dieselbe Datei verwenden kann. Der Rezept-Browser im Essen-Tab urteilt clientseitig — serverseitiges Filtern würde die Zeilen entfernen statt sie auszugrauen.

**Tech Stack:** TypeScript 6 (strict), Bun Test Runner (`bun:test`), React Native 0.86 / Expo SDK 57, NativeWind v4, TanStack Query, Supabase (SQL-Migration), react-i18next.

**Spec:** [docs/superpowers/specs/2026-08-14-allergen-filter-design.md](../specs/2026-08-14-allergen-filter-design.md)

## Global Constraints

- **Handoff-Bundle ist tabu:** `design-system/{colors,typography,spacing,themes,components,index}.ts`, `docs/{HANDOFF,COPY,ICONS,README}.md`, `patterns/*.md` werden **nicht** editiert. Neue i18n-Keys gehen in `de.json`/`en.json` **plus** einen Nachtrag-Eintrag in `docs/TODO.md`.
- **Alle UI-Strings über i18n.** Keine deutschen oder englischen Literale in Komponenten.
- **Du-Form, nie Sie.** Brand voice: warm, ruhig, modern. Niemals kindlich.
- **Touch-Targets ≥ 44×44.**
- **`app/` bleibt Thin-Wrapper** — Screens leben in `app-sections/`.
- **Kein `Co-Authored-By: Claude`-Trailer** in Commit-Messages. Conventional-Commits-Präfix, auf den Bereich gescoped.
- **Pre-commit-Hooks nie mit `--no-verify` umgehen.**
- **Tests laufen mit `bun test`**, Testdateien importieren aus `bun:test`. `npx jest` scheitert an diesen Imports.
- **Deutsche Kommentare** in neuen Modulen, passend zum Bestand in `features/meals/`.
- **Kanonische Sprache ist DE**, EN spiegelt.

---

## Task 1: Vokabular und Sprach-Normalisierung

Legt die 14 EU-Allergen-Keys fest und die `fold()`-Funktion, auf der jedes spätere Matching aufsetzt.

**Files:**

- Create: `features/meals/allergens/keys.ts`
- Create: `features/meals/allergens/keys.test.ts`
- Create: `features/meals/allergens/fold.ts`
- Create: `features/meals/allergens/fold.test.ts`

**Interfaces:**

- Consumes: nichts.
- Produces:
  - `type AllergenKey` — Union der 14 Keys
  - `const ALLERGEN_KEYS: readonly AllergenKey[]`
  - `function isAllergenKey(value: string): value is AllergenKey`
  - `function fold(input: string): string`

- [ ] **Step 1: Test für das Vokabular schreiben**

`features/meals/allergens/keys.test.ts`:

```ts
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
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `bun test features/meals/allergens/keys.test.ts`
Expected: FAIL — `Cannot find module './keys'`

- [ ] **Step 3: `keys.ts` implementieren**

```ts
// Die 14 Pflichtallergene nach Anhang II der EU-Verordnung 1169/2011.
//
// Sechs davon (peanuts, milk, eggs, gluten, soy, nuts) liegen bereits in
// `children.allergies[]` und `parents.allergies[]` und behalten deshalb ihre
// exakte Schreibweise — ein Umbenennen wäre ein Datenmigrations-Fall wie der
// Backfill von 2026-06-04. Die acht übrigen sind eine reine Erweiterung.
//
// Persistiert werden immer diese Keys, niemals lokalisierte Labels; gerendert
// wird über `onb.s4.allergies.<key>`.

export type AllergenKey =
  | "gluten"
  | "crustaceans"
  | "eggs"
  | "fish"
  | "peanuts"
  | "soy"
  | "milk"
  | "nuts"
  | "celery"
  | "mustard"
  | "sesame"
  | "sulphites"
  | "lupin"
  | "molluscs";

export const ALLERGEN_KEYS: readonly AllergenKey[] = [
  "gluten",
  "crustaceans",
  "eggs",
  "fish",
  "peanuts",
  "soy",
  "milk",
  "nuts",
  "celery",
  "mustard",
  "sesame",
  "sulphites",
  "lupin",
  "molluscs",
] as const;

export function isAllergenKey(value: string): value is AllergenKey {
  return (ALLERGEN_KEYS as readonly string[]).includes(value);
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg prüfen**

Run: `bun test features/meals/allergens/keys.test.ts`
Expected: PASS — 4 Tests

- [ ] **Step 5: Test für `fold()` schreiben**

`features/meals/allergens/fold.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { fold } from "./fold";

describe("fold", () => {
  test("faltet deutsche Umlaute nach ae/oe/ue/ss", () => {
    expect(fold("Nüsse")).toBe("nuesse");
    expect(fold("Öl")).toBe("oel");
    expect(fold("Käse")).toBe("kaese");
    expect(fold("Weiß")).toBe("weiss");
  });

  test("bildet Umlaut-Schreibvarianten auf dieselbe Form ab", () => {
    // Der eigentliche Zweck: wer "Nuesse" tippt, muss dasselbe treffen wie
    // "Nüsse". Deshalb ae/oe/ue VOR dem NFD-Strippen — umgekehrt käme "nusse"
    // heraus und die Varianten liefen auseinander.
    const forms = ["Nüsse", "NÜSSE", "nuesse", "Nuesse"];
    expect(new Set(forms.map(fold)).size).toBe(1);
  });

  test("strippt übrige Diakritika", () => {
    expect(fold("Crème fraîche")).toBe("creme fraiche");
  });

  test("ersetzt Nicht-Alphanumerisches durch einzelne Spaces", () => {
    expect(fold("Weizen-Mehl")).toBe("weizen mehl");
    expect(fold("  Soja  ,  Tofu ")).toBe("soja tofu");
  });

  test("liefert für leere und reine Zeichen-Eingaben einen leeren String", () => {
    expect(fold("")).toBe("");
    expect(fold("---")).toBe("");
  });
});
```

- [ ] **Step 6: Test laufen lassen, Fehlschlag prüfen**

Run: `bun test features/meals/allergens/fold.test.ts`
Expected: FAIL — `Cannot find module './fold'`

- [ ] **Step 7: `fold.ts` implementieren**

```ts
// Bringt Zutatentexte und Begriffslisten auf eine gemeinsame Form.
//
// Die Reihenfolge ist die Pointe: Umlautfaltung (ae/oe/ue/ss) läuft VOR dem
// NFD-Strippen. Umgekehrt würde "Nüsse" über die Zerlegung zu "nusse" statt
// "nuesse" — und wer "Nuesse" schreibt, träfe nicht mehr. Deutsche
// Umlautfaltung ist ae/oe/ue, nicht das Entfernen des Diakritikums; das
// Strippen danach fängt nur noch Lehnwörter wie "Crème fraîche".

const UMLAUTS: readonly (readonly [RegExp, string])[] = [
  [/ä/g, "ae"],
  [/ö/g, "oe"],
  [/ü/g, "ue"],
  [/ß/g, "ss"],
];

export function fold(input: string): string {
  let out = input.toLowerCase();
  for (const [pattern, replacement] of UMLAUTS) {
    out = out.replace(pattern, replacement);
  }

  return out
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
```

- [ ] **Step 8: Test laufen lassen, Erfolg prüfen**

Run: `bun test features/meals/allergens/`
Expected: PASS — 9 Tests

- [ ] **Step 9: Commit**

```bash
git add features/meals/allergens/keys.ts features/meals/allergens/keys.test.ts features/meals/allergens/fold.ts features/meals/allergens/fold.test.ts
git commit -m "feat(meals): EU-14-Allergen-Vokabular und Sprach-Normalisierung"
```

---

## Task 2: Begriffslisten und Zutaten-Klassifizierer

Das Herzstück. Bildet Zutatentexte auf Allergen-Keys ab — mit Match-Modi, Negativlisten und Negations-Guard.

**Files:**

- Create: `features/meals/allergens/terms.ts`
- Create: `features/meals/allergens/classify.ts`
- Create: `features/meals/allergens/classify.test.ts`

**Interfaces:**

- Consumes: `AllergenKey`, `ALLERGEN_KEYS`, `isAllergenKey` aus `./keys`; `fold` aus `./fold`; `Ingredient` aus `../types`.
- Produces:
  - `type MatchMode = "substring" | "word"`
  - `interface AllergenSpec { key; declaredCodes; terms; exclude }`
  - `const ALLERGEN_SPECS: readonly AllergenSpec[]`
  - `function keyForDeclaredCode(code: string): AllergenKey | null`
  - `interface TermMatch { key: AllergenKey; evidence: string }`
  - `function scanText(text: string): AllergenKey[]`
  - `function scanIngredients(ingredients: readonly Ingredient[]): TermMatch[]`

- [ ] **Step 1: Testdatei anlegen — Golden-Corpus und falsche Freunde**

`features/meals/allergens/classify.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import type { Ingredient } from "../types";

import { scanIngredients, scanText } from "./classify";
import { ALLERGEN_SPECS, keyForDeclaredCode } from "./terms";
import { ALLERGEN_KEYS } from "./keys";

function ing(de: string, en?: string): Ingredient {
  return { amount: null, unit: null, name: en ? { de, en } : { de } };
}

describe("scanText — Golden-Corpus", () => {
  test.each([
    ["Spaghetti", ["gluten"]],
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
    ["Haferflocken", ["gluten"]],
    ["Haselnusskerne", ["nuts"]],
    ["Gluten", ["gluten"]],
  ])("%s → %j", (text, expected) => {
    expect(scanText(text).sort()).toEqual([...expected].sort());
  });
});

describe("scanText — falsche Freunde", () => {
  test.each([
    ["Reis", "eggs"],
    ["Weizen", "eggs"],
    ["Buchweizenmehl", "gluten"],
    ["Reisnudeln", "gluten"],
    ["Schweinefleisch", "sulphites"],
    ["Kokosnuss", "nuts"],
    ["Muskatnuss", "nuts"],
  ])("%s trifft nicht %s", (text, forbidden) => {
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
  test.each([
    ["glutenfreies Mehl", "gluten"],
    ["gluten free flour", "gluten"],
    ["Sojaersatz", "soy"],
    ["ohne Ei", "eggs"],
    ["vegane Sahne", "milk"],
    ["milchfreie Schokolade", "milk"],
  ])("%s trifft nicht %s", (text, forbidden) => {
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
      expect(spec.terms.length).toBeGreaterThanOrEqual(2);
    }
  });

  test("kein Deklarations-Code gehört zu zwei Keys", () => {
    const codes = ALLERGEN_SPECS.flatMap((s) => s.declaredCodes);
    expect(new Set(codes).size).toBe(codes.length);
  });

  test("jeder Key ist über seinen eigenen Namen deklarierbar", () => {
    for (const key of ALLERGEN_KEYS) {
      expect(keyForDeclaredCode(key)).toBe(key);
    }
  });

  test("keyForDeclaredCode bildet die Rezept-Codes der Migration ab", () => {
    expect(keyForDeclaredCode("egg")).toBe("eggs");
    expect(keyForDeclaredCode("wheat")).toBe("gluten");
    expect(keyForDeclaredCode("MILK")).toBe("milk");
    expect(keyForDeclaredCode("unbekannt")).toBeNull();
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `bun test features/meals/allergens/classify.test.ts`
Expected: FAIL — `Cannot find module './classify'`

- [ ] **Step 3: `terms.ts` implementieren**

```ts
import type { AllergenKey } from "./keys";

import { fold } from "./fold";

export type MatchMode = "substring" | "word";

export interface Term {
  readonly text: string;
  /**
   * Default `substring`, weil Deutsch Komposita zusammenschreibt: `weizen`
   * muss "Vollkornweizenmehl" finden, `nuss` muss "Nussmischung" finden.
   * `word` für Terme, die in anderen Wörtern aufgehen — `ei` steckt in "Reis"
   * und "Weizen", das englische `nut` in "nutmeg" und "coconut".
   */
  readonly mode?: MatchMode;
}

export interface AllergenSpec {
  readonly key: AllergenKey;
  /** Was in `recipes.contains_allergens` als dieser Key gilt. */
  readonly declaredCodes: readonly string[];
  /** Zutaten-Heuristik, DE und EN gemischt. */
  readonly terms: readonly Term[];
  /** Verwirft einen Termtreffer, der innerhalb eines dieser Begriffe liegt. */
  readonly exclude: readonly string[];
}

/** Kurzschreibweise, damit die Listen unten lesbar bleiben. */
function t(text: string, mode?: MatchMode): Term {
  return mode ? { text, mode } : { text };
}

export const ALLERGEN_SPECS: readonly AllergenSpec[] = [
  {
    key: "gluten",
    declaredCodes: ["gluten", "wheat", "barley", "rye", "spelt", "oats", "cereals"],
    terms: [
      t("gluten"),
      t("weizen"),
      t("dinkel"),
      t("roggen"),
      t("gerste"),
      t("hafer"),
      t("grieß"),
      t("bulgur"),
      t("couscous"),
      t("seitan"),
      t("paniermehl"),
      t("vollkorn"),
      t("nudeln"),
      t("spaghetti"),
      t("pasta"),
      t("brot"),
      t("wheat"),
      t("barley"),
      t("rye"),
      t("spelt"),
      t("oats"),
      t("semolina"),
      t("breadcrumb"),
      t("noodle"),
      t("bread"),
    ],
    // Buchweizen ist der lehrreichste Eintrag: er enthält `weizen` als
    // Substring, ist aber ein glutenfreies Pseudogetreide. Ohne diesen
    // Ausschluss sperrte die App einem Zöliakie-Kind ausgerechnet die Rezepte,
    // die für es gemacht sind.
    exclude: [
      "buchweizen",
      "buckwheat",
      "reisnudeln",
      "glasnudeln",
      "rice noodle",
      "mandelmehl",
      "reismehl",
      "maismehl",
      "kokosmehl",
      "kichererbsenmehl",
      "almond flour",
      "rice flour",
      "corn flour",
    ],
  },
  {
    key: "crustaceans",
    declaredCodes: ["crustaceans", "crustacean", "shellfish"],
    terms: [
      t("garnele"),
      t("krabbe"),
      t("hummer"),
      t("scampi"),
      t("krebs"),
      t("shrimp"),
      t("prawn"),
      t("lobster"),
      t("crab"),
      t("crayfish"),
    ],
    exclude: [],
  },
  {
    key: "eggs",
    declaredCodes: ["eggs", "egg"],
    terms: [
      t("ei", "word"),
      t("eier", "word"),
      t("eigelb"),
      t("eiweiss"),
      t("eiernudeln"),
      t("mayonnaise"),
      t("egg", "word"),
      t("eggs", "word"),
      t("yolk"),
      t("albumen"),
    ],
    exclude: [],
  },
  {
    key: "fish",
    declaredCodes: ["fish"],
    terms: [
      t("fisch"),
      t("lachs"),
      t("thunfisch"),
      t("kabeljau"),
      t("hering"),
      t("sardelle"),
      t("anchovi"),
      t("worcester"),
      t("dashi"),
      t("bonito"),
      t("salmon"),
      t("tuna"),
      t("cod", "word"),
      t("herring"),
      t("anchovy"),
    ],
    exclude: [],
  },
  {
    key: "peanuts",
    declaredCodes: ["peanuts", "peanut"],
    terms: [t("erdnuss"), t("erdnuesse"), t("peanut"), t("groundnut"), t("arachis")],
    exclude: [],
  },
  {
    key: "soy",
    declaredCodes: ["soy", "soya", "soybeans"],
    terms: [
      t("soja"),
      t("tofu"),
      t("edamame"),
      t("miso"),
      t("tempeh"),
      t("soy"),
      t("soya"),
      t("soybean"),
    ],
    exclude: [],
  },
  {
    key: "milk",
    declaredCodes: ["milk", "dairy", "lactose"],
    terms: [
      t("milch"),
      t("butter"),
      t("sahne"),
      t("quark"),
      t("joghurt"),
      t("kaese"),
      t("parmesan"),
      t("pecorino"),
      t("mozzarella"),
      t("mascarpone"),
      t("ricotta"),
      t("schmand"),
      t("molke"),
      t("laktose"),
      t("ghee"),
      t("milk"),
      t("cream"),
      t("cheese"),
      t("yogurt"),
      t("whey"),
      t("lactose"),
    ],
    // Pflanzendrinks enthalten kein Milcheiweiß. "Mandelmilch" verliert damit
    // den milk-Treffer, behält aber den nuts-Treffer über `mandel` — genau so
    // soll das Modell arbeiten.
    exclude: [
      "hafermilch",
      "sojamilch",
      "mandelmilch",
      "reismilch",
      "kokosmilch",
      "oat milk",
      "soy milk",
      "almond milk",
      "rice milk",
      "coconut milk",
    ],
  },
  {
    key: "nuts",
    declaredCodes: ["nuts", "tree_nuts", "treenuts"],
    terms: [
      t("haselnuss"),
      t("walnuss"),
      t("mandel"),
      t("cashew"),
      t("pistazie"),
      t("pekan"),
      t("macadamia"),
      t("paranuss"),
      t("nuss"),
      t("hazelnut"),
      t("walnut"),
      t("almond"),
      t("pistachio"),
      t("pecan"),
      t("brazil nut"),
      t("nut", "word"),
    ],
    // Erdnuss ist eine Hülsenfrucht, Kokos- und Muskatnuss sind keine
    // Schalenfrüchte im Sinne der EU-Kennzeichnung.
    exclude: [
      "erdnuss",
      "peanut",
      "kokosnuss",
      "coconut",
      "muskatnuss",
      "muskat",
      "nutmeg",
      "nutrition",
    ],
  },
  {
    key: "celery",
    declaredCodes: ["celery"],
    terms: [t("sellerie"), t("celery"), t("celeriac")],
    exclude: [],
  },
  {
    key: "mustard",
    declaredCodes: ["mustard"],
    terms: [t("senf"), t("dijon"), t("mustard")],
    exclude: [],
  },
  {
    key: "sesame",
    declaredCodes: ["sesame", "sesame_seeds"],
    terms: [t("sesam"), t("tahin"), t("hummus"), t("sesame"), t("tahini")],
    exclude: [],
  },
  {
    key: "sulphites",
    declaredCodes: ["sulphites", "sulfites", "sulphur_dioxide"],
    terms: [
      t("sulfit"),
      t("schwefeldioxid"),
      t("trockenfruechte"),
      t("wein"),
      t("sulphite"),
      t("sulfite"),
      t("wine", "word"),
    ],
    // "Schweinefleisch" enthält den Term `wein`.
    exclude: ["schwein"],
  },
  {
    key: "lupin",
    declaredCodes: ["lupin"],
    terms: [t("lupine"), t("lupinenmehl"), t("lupin")],
    exclude: [],
  },
  {
    key: "molluscs",
    declaredCodes: ["molluscs", "mollusks"],
    terms: [
      t("muschel"),
      t("tintenfisch"),
      t("calamari"),
      t("auster"),
      t("jakobsmuschel"),
      t("mussel"),
      t("squid"),
      t("octopus"),
      t("oyster"),
      t("clam"),
      t("scallop"),
    ],
    exclude: [],
  },
];

export interface FoldedTerm {
  readonly text: string;
  readonly mode: MatchMode;
}

export interface FoldedSpec {
  readonly key: AllergenKey;
  readonly terms: readonly FoldedTerm[];
  readonly exclude: readonly string[];
}

/**
 * Die Listen werden lesbar gepflegt ("Haselnuss") und hier einmalig durch
 * dieselbe `fold()`-Funktion gezogen, die auch die Zutaten trifft. Eine
 * Definition der Normalisierung, nicht zwei.
 */
export const FOLDED_SPECS: readonly FoldedSpec[] = ALLERGEN_SPECS.map((spec) => ({
  key: spec.key,
  terms: spec.terms.map((term) => ({ text: fold(term.text), mode: term.mode ?? "substring" })),
  exclude: spec.exclude.map(fold),
}));

const DECLARED_INDEX = new Map<string, AllergenKey>(
  ALLERGEN_SPECS.flatMap((spec) => spec.declaredCodes.map((code) => [fold(code), spec.key])),
);

/**
 * Ein Code aus `recipes.contains_allergens` → Key, oder `null`. Groß- und
 * Kleinschreibung sowie Trennzeichen sind egal; `null` heißt "kennen wir
 * nicht" und wird vom Urteil bewusst nicht als Entwarnung gewertet.
 */
export function keyForDeclaredCode(code: string): AllergenKey | null {
  return DECLARED_INDEX.get(fold(code)) ?? null;
}
```

- [ ] **Step 4: `classify.ts` implementieren**

```ts
import type { Ingredient } from "../types";
import type { AllergenKey } from "./keys";

import { fold } from "./fold";
import { FOLDED_SPECS } from "./terms";

export interface TermMatch {
  readonly key: AllergenKey;
  /** Die auslösende Zutat im Original — für a11y-Text und Fehlersuche. */
  readonly evidence: string;
}

// Angehängt oder mit Space: "glutenfrei" wie "gluten free".
const NEGATION_SUFFIXES = ["frei", "free", "los", "ersatz", "alternative"] as const;

// Als vorangehendes Wort: "ohne Ei", "vegane Sahne".
const NEGATION_PREFIXES = [
  "ohne",
  "without",
  "vegan",
  "vegane",
  "veganer",
  "veganes",
  "pflanzlich",
  "pflanzliche",
  "pflanzlicher",
] as const;

function indicesOf(haystack: string, needle: string): number[] {
  const out: number[] = [];
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    out.push(idx);
    idx = haystack.indexOf(needle, idx + 1);
  }
  return out;
}

function isWordBoundary(haystack: string, start: number, end: number): boolean {
  const before = start === 0 ? " " : haystack[start - 1];
  const after = end >= haystack.length ? " " : haystack[end];
  return before === " " && after === " ";
}

/** Liegt das Vorkommen vollständig innerhalb eines Ausschlussbegriffs? */
function isExcluded(
  haystack: string,
  start: number,
  end: number,
  excludes: readonly string[],
): boolean {
  return excludes.some((ex) =>
    indicesOf(haystack, ex).some((exStart) => exStart <= start && end <= exStart + ex.length),
  );
}

/**
 * Der Guard wirkt pro Vorkommen, nicht pro Key — das ist der Unterschied, an
 * dem "laktosefreie Milch" hängt: `laktose` wird negiert, `milch` bleibt
 * stehen, der Key trifft. Laktosefrei heißt gespaltener Milchzucker, nicht
 * entferntes Milcheiweiß.
 */
function isNegated(haystack: string, start: number, end: number): boolean {
  const after = haystack.slice(end);
  const attached = after.startsWith(" ") ? after.slice(1) : after;
  if (NEGATION_SUFFIXES.some((suffix) => attached.startsWith(suffix))) return true;

  const before = haystack.slice(0, start).trimEnd();
  const lastWord = before.slice(before.lastIndexOf(" ") + 1);
  return (NEGATION_PREFIXES as readonly string[]).includes(lastWord);
}

/** Die Keys, die ein einzelner Text auslöst. Exportiert, weil die Tests darauf zielen. */
export function scanText(text: string): AllergenKey[] {
  const haystack = fold(text);
  if (!haystack) return [];

  const hits: AllergenKey[] = [];

  for (const spec of FOLDED_SPECS) {
    const matched = spec.terms.some((term) =>
      indicesOf(haystack, term.text).some((start) => {
        const end = start + term.text.length;
        if (term.mode === "word" && !isWordBoundary(haystack, start, end)) return false;
        if (isExcluded(haystack, start, end, spec.exclude)) return false;
        return !isNegated(haystack, start, end);
      }),
    );
    if (matched) hits.push(spec.key);
  }

  return hits;
}

/**
 * Beide Sprachvarianten werden gescannt: ein Rezept aus dem Crawler kann
 * englische Zutatennamen führen, und `localize()` fällt sprachübergreifend
 * zurück — der Klassifizierer muss das auch tun.
 */
export function scanIngredients(ingredients: readonly Ingredient[]): TermMatch[] {
  const seen = new Set<AllergenKey>();
  const out: TermMatch[] = [];

  for (const ingredient of ingredients) {
    const evidence = ingredient.name.de?.trim() || ingredient.name.en?.trim() || "";

    for (const variant of [ingredient.name.de, ingredient.name.en]) {
      if (!variant) continue;
      for (const key of scanText(variant)) {
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ key, evidence });
      }
    }
  }

  return out;
}
```

- [ ] **Step 5: Tests laufen lassen, Erfolg prüfen**

Run: `bun test features/meals/allergens/classify.test.ts`
Expected: PASS — alle Fälle. Schlägt ein Golden-Corpus-Eintrag fehl, fehlt ein Term in `ALLERGEN_SPECS`; schlägt ein "falscher Freund" fehl, fehlt ein Eintrag in `exclude` oder der Term braucht `mode: "word"`.

- [ ] **Step 6: Typecheck und Lint**

Run: `bun run typecheck && bun lint`
Expected: keine Fehler

- [ ] **Step 7: Commit**

```bash
git add features/meals/allergens/terms.ts features/meals/allergens/classify.ts features/meals/allergens/classify.test.ts
git commit -m "feat(meals): Begriffslisten und Zutaten-Klassifizierer fuer Allergene"
```

---

## Task 3: Vierwertiges Urteil

Verbindet den deklarierten Kanal (`contains_allergens`) mit dem heuristischen (Zutaten) zu einem Urteil.

**Files:**

- Create: `features/meals/allergens/judge.ts`
- Create: `features/meals/allergens/judge.test.ts`
- Create: `features/meals/allergens/index.ts`
- Modify: `features/meals/index.ts`

**Interfaces:**

- Consumes: `AllergenKey` aus `./keys`; `keyForDeclaredCode` aus `./terms`; `scanIngredients` aus `./classify`; `Ingredient` aus `../types`.
- Produces:
  - `type AllergenSource = "declared" | "ingredient"`
  - `interface AllergenHit { key; source; evidence }`
  - `type RecipeAllergenVerdict` — 4 Varianten
  - `interface JudgeableRecipe { contains_allergens; ingredients }`
  - `function judgeRecipe(recipe: JudgeableRecipe, familyKeys: readonly AllergenKey[]): RecipeAllergenVerdict`
  - `function isRecipeSafeForFamily(recipe, familyKeys): boolean`
  - `function matchedAllergens(recipe, familyKeys): AllergenKey[]`

- [ ] **Step 1: Test schreiben**

`features/meals/allergens/judge.test.ts`:

```ts
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
    const verdict = judgeRecipe(CARBONARA, ["eggs", "milk"]);
    expect(verdict.status).toBe("unsafe");
  });

  test("kein Treffer bei befüllter Deklaration ergibt safe", () => {
    expect(judgeRecipe(DECLARED_CLEAN, ["eggs"])).toEqual({ status: "safe" });
  });

  test("kein Treffer bei leerer Deklaration ergibt unverified, nicht safe", () => {
    // Der Kern des Modells: die Heuristik kann Anwesenheit belegen, niemals
    // Abwesenheit. Eine leere Deklaration wird nie zu Grün.
    expect(judgeRecipe(NOTHING_KNOWN, ["eggs"])).toEqual({ status: "unverified" });
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
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `bun test features/meals/allergens/judge.test.ts`
Expected: FAIL — `Cannot find module './judge'`

- [ ] **Step 3: `judge.ts` implementieren**

```ts
import type { Ingredient } from "../types";
import type { AllergenKey } from "./keys";

import { scanIngredients } from "./classify";
import { keyForDeclaredCode } from "./terms";

export type AllergenSource = "declared" | "ingredient";

export interface AllergenHit {
  readonly key: AllergenKey;
  readonly source: AllergenSource;
  readonly evidence: string;
}

export type RecipeAllergenVerdict =
  | { status: "safe" }
  | { status: "unsafe"; hits: AllergenHit[] }
  | { status: "caution"; hits: AllergenHit[] }
  | { status: "unverified" };

/**
 * Strukturell getypt statt an `RecipeRow` gebunden: die spätere
 * Klassifizierungs-Edge-Function reicht ein einfaches Objekt herein und muss
 * dafür nicht die halbe Datenbank-Typdatei importieren.
 */
export interface JudgeableRecipe {
  readonly contains_allergens: readonly string[] | null;
  readonly ingredients: readonly Ingredient[];
}

export function judgeRecipe(
  recipe: JudgeableRecipe,
  familyKeys: readonly AllergenKey[],
): RecipeAllergenVerdict {
  // Nichts zu prüfen — und ohne diesen Kurzschluss stünde bei jeder Familie
  // ohne Allergie-Eintrag überall "nicht geprüft".
  if (familyKeys.length === 0) return { status: "safe" };

  const relevant = new Set(familyKeys);
  const declaredCodes = recipe.contains_allergens ?? [];

  const declaredHits: AllergenHit[] = [];
  for (const code of declaredCodes) {
    const key = keyForDeclaredCode(code);
    if (key && relevant.has(key) && !declaredHits.some((hit) => hit.key === key)) {
      declaredHits.push({ key, source: "declared", evidence: code });
    }
  }
  if (declaredHits.length > 0) return { status: "unsafe", hits: declaredHits };

  const ingredientHits = scanIngredients(recipe.ingredients)
    .filter((match) => relevant.has(match.key))
    .map((match): AllergenHit => ({ ...match, source: "ingredient" }));
  if (ingredientHits.length > 0) return { status: "caution", hits: ingredientHits };

  // Eine befüllte Deklaration ohne Treffer ist eine echte Entwarnung. Eine
  // leere ist keine: die Heuristik kann Anwesenheit belegen, nie Abwesenheit.
  return declaredCodes.length > 0 ? { status: "safe" } : { status: "unverified" };
}

/** Der schmale Boolean für Aufrufer ohne Bedarf an Nuancen — etwa die KI-Vorschlagslogik. */
export function isRecipeSafeForFamily(
  recipe: JudgeableRecipe,
  familyKeys: readonly AllergenKey[],
): boolean {
  return judgeRecipe(recipe, familyKeys).status === "safe";
}

/**
 * Die betroffenen Keys — als `AllergenKey`, nicht als Rezept-Code: lokalisierte
 * Labels gibt es nur für die Keys (`onb.s4.allergies.<key>`), ein rohes `wheat`
 * hätte keinen Katalog-Eintrag fürs Badge.
 */
export function matchedAllergens(
  recipe: JudgeableRecipe,
  familyKeys: readonly AllergenKey[],
): AllergenKey[] {
  const verdict = judgeRecipe(recipe, familyKeys);
  if (verdict.status === "safe" || verdict.status === "unverified") return [];
  return [...new Set(verdict.hits.map((hit) => hit.key))].sort();
}
```

- [ ] **Step 4: Barrel `features/meals/allergens/index.ts` anlegen**

```ts
export { scanIngredients, scanText, type TermMatch } from "./classify";
export { fold } from "./fold";
export {
  isRecipeSafeForFamily,
  judgeRecipe,
  matchedAllergens,
  type AllergenHit,
  type AllergenSource,
  type JudgeableRecipe,
  type RecipeAllergenVerdict,
} from "./judge";
export { ALLERGEN_KEYS, isAllergenKey, type AllergenKey } from "./keys";
export {
  ALLERGEN_SPECS,
  keyForDeclaredCode,
  type AllergenSpec,
  type MatchMode,
  type Term,
} from "./terms";
```

- [ ] **Step 5: Aus `features/meals/index.ts` re-exportieren**

Am Anfang von `features/meals/index.ts` einfügen (alphabetisch vor dem `escapeLike`-Block):

```ts
export {
  ALLERGEN_KEYS,
  isAllergenKey,
  isRecipeSafeForFamily,
  judgeRecipe,
  keyForDeclaredCode,
  matchedAllergens,
  scanIngredients,
  scanText,
  type AllergenHit,
  type AllergenKey,
  type AllergenSource,
  type JudgeableRecipe,
  type RecipeAllergenVerdict,
} from "./allergens";
```

- [ ] **Step 6: Tests, Typecheck, Lint**

Run: `bun test features/meals/ && bun run typecheck && bun lint`
Expected: PASS, keine Fehler

- [ ] **Step 7: Commit**

```bash
git add features/meals/allergens/judge.ts features/meals/allergens/judge.test.ts features/meals/allergens/index.ts features/meals/index.ts
git commit -m "feat(meals): vierwertiges Allergen-Urteil fuer Rezepte"
```

---

## Task 4: Familien-Allergien aggregieren

**Files:**

- Create: `features/meals/useFamilyAllergies.ts`
- Create: `features/meals/useFamilyAllergies.test.ts`
- Modify: `features/meals/index.ts`

**Interfaces:**

- Consumes: `AllergenKey`, `isAllergenKey` aus `./allergens`; `useCurrentParent` aus `@/features/auth`; `useFamilyChildren`, `useFamilyParents` aus `@/features/auth`.
- Produces:
  - `function mergeAllergies(rows: readonly { allergies: string[] | null }[]): AllergenKey[]`
  - `function useFamilyAllergies(): { keys: AllergenKey[]; isLoading: boolean; error: unknown }`

- [ ] **Step 1: Test für die reine Aggregation schreiben**

`features/meals/useFamilyAllergies.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { mergeAllergies } from "./useFamilyAllergies";

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
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `bun test features/meals/useFamilyAllergies.test.ts`
Expected: FAIL — `Cannot find module './useFamilyAllergies'`

- [ ] **Step 3: Implementieren**

```ts
import { useMemo } from "react";

import { useCurrentParent, useFamilyChildren, useFamilyParents } from "@/features/auth";

import { isAllergenKey, type AllergenKey } from "./allergens";

interface AllergyBearer {
  readonly allergies: string[] | null;
}

/**
 * Die Vereinigung der Allergien aller Mitglieder, normalisiert und sortiert.
 *
 * Unbekannte Werte fliegen raus: `allergies` ist ein freies `text[]`, und
 * `ChildProfileScreen` rendert Nicht-Key-Werte bewusst roh durch (Altdaten vor
 * dem Backfill von 2026-06-04). Der Klassifizierer bekommt nur, was er kennt.
 *
 * Als eigene Funktion herausgezogen, weil das die einzige Logik hier ist —
 * der Hook drumherum ist reine Verdrahtung und ohne React-Renderer nicht
 * sinnvoll testbar.
 */
export function mergeAllergies(rows: readonly AllergyBearer[]): AllergenKey[] {
  const keys = new Set<AllergenKey>();
  for (const row of rows) {
    for (const value of row.allergies ?? []) {
      if (isAllergenKey(value)) keys.add(value);
    }
  }
  return [...keys].sort();
}

interface UseFamilyAllergiesResult {
  keys: AllergenKey[];
  isLoading: boolean;
  error: unknown;
}

/**
 * Die Allergien der ganzen Familie — Kinder **und** Eltern.
 *
 * `patterns/meals.md` sagt "any family member", und `parents.allergies`
 * existiert im Schema. Kein eigener `useCurrentFamily`: `useCurrentParent`
 * liefert die `family_id` bereits, ein zusätzlicher Hook hätte keinen zweiten
 * Aufrufer.
 *
 * Liegt unter `features/meals/`, weil Meals der einzige Verbraucher ist; zieht
 * um, sobald ein zweiter dazukommt.
 */
export function useFamilyAllergies(): UseFamilyAllergiesResult {
  const parent = useCurrentParent();
  const familyId = parent.data?.family_id;

  const children = useFamilyChildren(familyId);
  const parents = useFamilyParents(familyId);

  const keys = useMemo(
    () => mergeAllergies([...(children.data ?? []), ...(parents.data ?? [])]),
    [children.data, parents.data],
  );

  return {
    keys,
    isLoading: parent.isLoading || children.isLoading || parents.isLoading,
    error: parent.error ?? children.error ?? parents.error,
  };
}
```

- [ ] **Step 4: Aus `features/meals/index.ts` re-exportieren**

```ts
export { mergeAllergies, useFamilyAllergies } from "./useFamilyAllergies";
```

- [ ] **Step 5: Tests, Typecheck, Lint**

Run: `bun test features/meals/ && bun run typecheck && bun lint`
Expected: PASS, keine Fehler

- [ ] **Step 6: Commit**

```bash
git add features/meals/useFamilyAllergies.ts features/meals/useFamilyAllergies.test.ts features/meals/index.ts
git commit -m "feat(meals): Familien-Allergien aus Kindern und Eltern aggregieren"
```

---

## Task 5: Vokabular in Picker und i18n auf EU-14 ziehen

Die acht neuen Keys sind wertlos, solange niemand sie auswählen kann. Beide Picker mappen über `ALLERGY_KEYS` — wird die Konstante zur Re-Export-Schicht auf `ALLERGEN_KEYS`, rendern sie automatisch 14 Chips.

**Files:**

- Modify: `features/children/allergies.ts` (komplett ersetzen)
- Modify: `features/i18n/locales/de.json` — Block `onb.s4.allergies`
- Modify: `features/i18n/locales/en.json` — Block `onb.s4.allergies`
- Create: `features/children/allergies.test.ts`

**Interfaces:**

- Consumes: `ALLERGEN_KEYS`, `type AllergenKey` aus `@/features/meals/allergens`.
- Produces: `ALLERGY_KEYS` und `type AllergyKey` bleiben als Namen bestehen — `Step4FirstChild` und `ChildProfileScreen` importieren sie unverändert weiter.

- [ ] **Step 1: Test schreiben, der Keys und i18n-Katalog gegeneinander hält**

`features/children/allergies.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import de from "@/features/i18n/locales/de.json";
import en from "@/features/i18n/locales/en.json";

import { ALLERGY_KEYS } from "./allergies";

describe("ALLERGY_KEYS", () => {
  test("führt die 14 EU-Pflichtallergene", () => {
    expect(ALLERGY_KEYS).toHaveLength(14);
  });

  test.each(["de", "en"])("jeder Key hat ein %s-Label", (lang) => {
    // Bricht, sobald jemand einen Key ergänzt, ohne die Kataloge nachzuziehen —
    // die Chip-Reihe zeigte sonst den rohen Key-String an.
    const labels = (lang === "de" ? de : en).onb.s4.allergies as Record<string, string>;
    for (const key of ALLERGY_KEYS) {
      expect(labels[key], `${lang}: onb.s4.allergies.${key} fehlt`).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `bun test features/children/allergies.test.ts`
Expected: FAIL — `expected 6 to be 14`

- [ ] **Step 3: `features/children/allergies.ts` ersetzen**

```ts
// Stabile Allergie-KEYS — niemals lokalisierte Labels. Persistiert in
// `children.allergies[]` und `parents.allergies[]`, gerendert über
// `onb.s4.allergies.<key>`, damit ein Sprachwechsel die Labels neu rendert,
// ohne gespeicherte Daten anzufassen.
//
// Seit dem Allergen-Filter (ADR-014) ist das Vokabular auf die 14
// EU-Pflichtallergene erweitert und lebt in `features/meals/allergens/keys.ts`,
// zusammen mit den Begriffslisten, die es auf Zutaten abbilden. Diese Datei
// bleibt als Import-Pfad bestehen, den Onboarding und Kinderprofil kennen.

export {
  ALLERGEN_KEYS as ALLERGY_KEYS,
  type AllergenKey as AllergyKey,
} from "@/features/meals/allergens";
```

- [ ] **Step 4: `de.json` — Block `onb.s4.allergies` ersetzen**

```json
      "allergies": {
        "gluten": "Gluten",
        "crustaceans": "Krebstiere",
        "eggs": "Eier",
        "fish": "Fisch",
        "peanuts": "Erdnüsse",
        "soy": "Soja",
        "milk": "Milch",
        "nuts": "Nüsse",
        "celery": "Sellerie",
        "mustard": "Senf",
        "sesame": "Sesam",
        "sulphites": "Sulfite",
        "lupin": "Lupinen",
        "molluscs": "Weichtiere"
      },
```

- [ ] **Step 5: `en.json` — denselben Block spiegeln**

```json
      "allergies": {
        "gluten": "Gluten",
        "crustaceans": "Crustaceans",
        "eggs": "Eggs",
        "fish": "Fish",
        "peanuts": "Peanuts",
        "soy": "Soy",
        "milk": "Milk",
        "nuts": "Nuts",
        "celery": "Celery",
        "mustard": "Mustard",
        "sesame": "Sesame",
        "sulphites": "Sulphites",
        "lupin": "Lupin",
        "molluscs": "Molluscs"
      },
```

- [ ] **Step 6: Tests laufen lassen, Erfolg prüfen**

Run: `bun test features/children/ && bun run typecheck && bun lint`
Expected: PASS. `Step4FirstChild` und `ChildProfileScreen` brauchen **keine** Änderung — beide mappen über `ALLERGY_KEYS` und rendern die 14 Chips automatisch.

- [ ] **Step 7: Sichtprüfung im Web**

Run: `bun run web`
Prüfen: Kinderprofil öffnen → die Allergie-Chip-Reihe zeigt 14 Optionen, alle mit lesbarem Label (kein roher Key-String), Umbruch sauber, Touch-Targets ≥ 44px.

- [ ] **Step 8: Commit**

```bash
git add features/children/allergies.ts features/children/allergies.test.ts features/i18n/locales/de.json features/i18n/locales/en.json
git commit -m "feat(children): Allergie-Vokabular auf die EU-14 Pflichtallergene erweitern"
```

---

## Task 6: Seed-Rezepte

Ohne Rezepte im Pool ist nichts von alledem am Gerät prüfbar. Die Auswahl deckt bewusst alle vier Urteilszustände ab.

**Files:**

- Create: `supabase/migrations/20260814120000_seed_recipes.sql`

**Interfaces:**

- Consumes: Schema aus `20260529093329_recipes_and_meal_plan.sql`.
- Produces: 6 Zeilen in `public.recipes` mit `created_by_family_id = null`.

- [ ] **Step 1: Migration schreiben**

```sql
-- Eltern Flow AI: Seed-Rezepte für den globalen Pool.
--
-- Der Pool war bis hierher leer (kein einziges `insert into public.recipes`),
-- der gustar.io-Worker existiert nicht. Ohne Rezepte lässt sich der
-- Allergen-Filter (ADR-014) weder am Gerät prüfen noch überhaupt sehen.
--
-- Die Auswahl deckt alle vier Urteilszustände ab:
--   - deklariert mit Allergen  → unsafe
--   - deklariert ohne Allergen → safe
--   - leer deklariert, Zutaten sprechen → caution
--   - leer deklariert, Zutaten unauffällig → unverified
--
-- `recipe_dedup_hash` ist `not null unique`. Statt einen echten sha256 zu
-- berechnen, tragen die Seeds ein stabiles 'seed-<slug>' — ehrlicher als ein
-- Pseudo-Hash und kollisionsfrei gegenüber echten Importen, deren Hash aus
-- Titel und Zutaten entsteht.

insert into public.recipes (
  source, source_url, created_by_family_id,
  title, description, image_url, duration_min, servings, difficulty,
  ingredients, instructions, contains_allergens, diet_tags, keywords,
  recipe_dedup_hash
)
values
  -- unsafe: deklariert Ei, Milch, Weizen
  (
    'user_custom', null, null,
    '{"de":"Spaghetti Carbonara","en":"Spaghetti Carbonara"}'::jsonb,
    '{"de":"Der Klassiker — ohne Sahne, dafür mit Eigelb.","en":"The classic — no cream, just egg yolk."}'::jsonb,
    null, 25, 4, 'easy',
    '[{"amount":"400","unit":"g","name":{"de":"Spaghetti","en":"spaghetti"}},
      {"amount":"4","unit":null,"name":{"de":"Eigelb","en":"egg yolks"}},
      {"amount":"80","unit":"g","name":{"de":"Pecorino","en":"pecorino"}},
      {"amount":"120","unit":"g","name":{"de":"Guanciale","en":"guanciale"}}]'::jsonb,
    '[{"de":"Nudeln in Salzwasser kochen.","en":"Cook the pasta in salted water."},
      {"de":"Guanciale auslassen.","en":"Render the guanciale."},
      {"de":"Eigelb mit Pecorino verrühren und unterheben.","en":"Whisk yolks with pecorino and fold in."}]'::jsonb,
    array['egg','milk','wheat'], array[]::text[], array['pasta','italienisch'],
    'seed-carbonara'
  ),
  -- unsafe: deklariert Erdnuss, Fisch, Ei, Soja
  (
    'user_custom', null, null,
    '{"de":"Pad Thai","en":"Pad Thai"}'::jsonb,
    '{"de":"Reisnudeln aus dem Wok, in 20 Minuten fertig.","en":"Wok-fried rice noodles, done in 20 minutes."}'::jsonb,
    null, 20, 2, 'medium',
    '[{"amount":"200","unit":"g","name":{"de":"Reisnudeln","en":"rice noodles"}},
      {"amount":"50","unit":"g","name":{"de":"Erdnüsse","en":"peanuts"}},
      {"amount":"2","unit":"EL","name":{"de":"Fischsauce","en":"fish sauce"}},
      {"amount":"2","unit":null,"name":{"de":"Eier","en":"eggs"}},
      {"amount":"150","unit":"g","name":{"de":"Tofu","en":"tofu"}}]'::jsonb,
    '[{"de":"Nudeln einweichen.","en":"Soak the noodles."},
      {"de":"Alles im Wok braten.","en":"Stir-fry everything in the wok."}]'::jsonb,
    array['peanut','fish','egg','soy'], array[]::text[], array['asiatisch','wok'],
    'seed-pad-thai'
  ),
  -- safe: deklariert, aber ohne Allergen
  (
    'user_custom', null, null,
    '{"de":"Ofengemüse mit Kräutern","en":"Roasted vegetables with herbs"}'::jsonb,
    '{"de":"Blech rein, warten, fertig.","en":"Tray in, wait, done."}'::jsonb,
    null, 40, 4, 'easy',
    '[{"amount":"500","unit":"g","name":{"de":"Kartoffeln","en":"potatoes"}},
      {"amount":"2","unit":null,"name":{"de":"Karotten","en":"carrots"}},
      {"amount":"1","unit":null,"name":{"de":"Zucchini","en":"zucchini"}},
      {"amount":"3","unit":"EL","name":{"de":"Olivenöl","en":"olive oil"}}]'::jsonb,
    '[{"de":"Gemüse würfeln.","en":"Dice the vegetables."},
      {"de":"Bei 200 °C 35 Minuten backen.","en":"Bake at 200 °C for 35 minutes."}]'::jsonb,
    array['none'], array['vegan'], array['gemuese','ofen'],
    'seed-ofengemuese'
  ),
  -- safe: deklariert, nur Gluten — trifft nur glutenallergische Familien
  (
    'user_custom', null, null,
    '{"de":"Tomaten-Bruschetta","en":"Tomato bruschetta"}'::jsonb,
    '{"de":"Fünf Zutaten, zehn Minuten.","en":"Five ingredients, ten minutes."}'::jsonb,
    null, 10, 2, 'easy',
    '[{"amount":"4","unit":"Scheiben","name":{"de":"Weißbrot","en":"white bread"}},
      {"amount":"3","unit":null,"name":{"de":"Tomaten","en":"tomatoes"}},
      {"amount":"1","unit":null,"name":{"de":"Knoblauchzehe","en":"garlic clove"}},
      {"amount":"2","unit":"EL","name":{"de":"Olivenöl","en":"olive oil"}}]'::jsonb,
    '[{"de":"Brot rösten.","en":"Toast the bread."},
      {"de":"Tomaten würfeln und aufhäufen.","en":"Dice the tomatoes and pile them on."}]'::jsonb,
    array['wheat'], array['vegan'], array['vorspeise','schnell'],
    'seed-bruschetta'
  ),
  -- caution: KEINE Deklaration, aber die Zutaten sprechen (Sesam via Tahin)
  (
    'user_custom', null, null,
    '{"de":"Hummus","en":"Hummus"}'::jsonb,
    '{"de":"Cremig, zitronig, in fünf Minuten im Mixer.","en":"Creamy, lemony, five minutes in the blender."}'::jsonb,
    null, 10, 4, 'easy',
    '[{"amount":"400","unit":"g","name":{"de":"Kichererbsen","en":"chickpeas"}},
      {"amount":"3","unit":"EL","name":{"de":"Tahin","en":"tahini"}},
      {"amount":"1","unit":null,"name":{"de":"Zitrone","en":"lemon"}},
      {"amount":"1","unit":null,"name":{"de":"Knoblauchzehe","en":"garlic clove"}}]'::jsonb,
    '[{"de":"Alles im Mixer glatt rühren.","en":"Blend everything until smooth."}]'::jsonb,
    array[]::text[], array['vegan'], array['dip','orientalisch'],
    'seed-hummus'
  ),
  -- unverified: keine Deklaration, Zutaten unauffällig
  (
    'user_custom', null, null,
    '{"de":"Karottensuppe","en":"Carrot soup"}'::jsonb,
    '{"de":"Ein Topf, wenig Aufwand.","en":"One pot, little effort."}'::jsonb,
    null, 30, 4, 'easy',
    '[{"amount":"600","unit":"g","name":{"de":"Karotten","en":"carrots"}},
      {"amount":"1","unit":null,"name":{"de":"Zwiebel","en":"onion"}},
      {"amount":"800","unit":"ml","name":{"de":"Gemüsebrühe","en":"vegetable stock"}},
      {"amount":"1","unit":"TL","name":{"de":"Ingwer","en":"ginger"}}]'::jsonb,
    '[{"de":"Alles weich kochen.","en":"Simmer until soft."},
      {"de":"Fein pürieren.","en":"Blend until smooth."}]'::jsonb,
    array[]::text[], array['vegan'], array['suppe','einfach'],
    'seed-karottensuppe'
  )
on conflict (recipe_dedup_hash) do nothing;
```

- [ ] **Step 2: Migration anwenden**

Über den Supabase-MCP-Server `apply_migration` mit dem Namen `seed_recipes` und dem obigen SQL.

- [ ] **Step 3: Ergebnis prüfen**

Über den Supabase-MCP-Server `execute_sql`:

```sql
select recipe_dedup_hash, title->>'de' as titel, contains_allergens
from public.recipes
where created_by_family_id is null
order by recipe_dedup_hash;
```

Expected: 6 Zeilen. `seed-hummus` und `seed-karottensuppe` haben ein leeres `contains_allergens`, die übrigen vier ein befülltes.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260814120000_seed_recipes.sql
git commit -m "feat(meals): Seed-Rezepte fuer den globalen Pool"
```

---

## Task 7: Badge und Rezept-Browser

**Files:**

- Create: `app-sections/(tabs)/essen/AllergenBadge.tsx`
- Create: `app-sections/(tabs)/essen/RecipeBrowser.tsx`
- Modify: `app-sections/(tabs)/essen/EssenScreen.tsx`
- Modify: `features/i18n/locales/de.json` — Block `meals`
- Modify: `features/i18n/locales/en.json` — Block `meals`

**Interfaces:**

- Consumes: `judgeRecipe`, `type RecipeAllergenVerdict`, `useFamilyAllergies`, `useRecipes`, `localize`, `type RecipeRow` aus `@/features/meals`; `Pill`, `Icon`, `Field` aus `@/app-sections/shared`.
- Produces: `AllergenBadge`, `RecipeBrowser` — beide nur intern im Essen-Tab verwendet.

- [ ] **Step 1: i18n-Keys ergänzen — `de.json`, im `meals`-Block hinter `"recipe"`**

```json
    "browse": {
      "title": "Rezepte durchsuchen",
      "search": "Suche",
      "searchPlaceholder": "Nudeln, Suppe, schnell …",
      "empty": "Keine Rezepte gefunden.",
      "loadError": "Rezepte konnten nicht geladen werden."
    },
    "allergen": {
      "contains": "enthält {{list}}",
      "maybe": "möglicherweise {{list}}",
      "unverified": "nicht geprüft",
      "more": "+{{n}}"
    },
    "a11y": {
      "unsafeRecipe": "{{title}} — enthält {{list}}",
      "cautionRecipe": "{{title}} — enthält möglicherweise {{list}}",
      "unverifiedRecipe": "{{title}} — Allergene nicht geprüft"
    }
```

- [ ] **Step 2: i18n-Keys ergänzen — `en.json`, spiegelbildlich**

```json
    "browse": {
      "title": "Browse recipes",
      "search": "Search",
      "searchPlaceholder": "Pasta, soup, quick …",
      "empty": "No recipes found.",
      "loadError": "Recipes could not be loaded."
    },
    "allergen": {
      "contains": "contains {{list}}",
      "maybe": "may contain {{list}}",
      "unverified": "not checked",
      "more": "+{{n}}"
    },
    "a11y": {
      "unsafeRecipe": "{{title}} — contains {{list}}",
      "cautionRecipe": "{{title}} — may contain {{list}}",
      "unverifiedRecipe": "{{title}} — allergens not checked"
    }
```

- [ ] **Step 3: `AllergenBadge.tsx` implementieren**

```tsx
import { useTranslation } from "react-i18next";

import { Pill } from "@/app-sections/shared";
import type { AllergenKey, RecipeAllergenVerdict } from "@/features/meals";

/** Mehr als zwei Labels sprengen die Zeile — der Rest wird gezählt. */
const MAX_LABELS = 2;

interface AllergenBadgeProps {
  verdict: RecipeAllergenVerdict;
}

export function AllergenBadge({ verdict }: AllergenBadgeProps) {
  const { t } = useTranslation();

  if (verdict.status === "safe") return null;

  if (verdict.status === "unverified") {
    return <Pill label={t("meals.allergen.unverified")} tone="ink" />;
  }

  const keys = [...new Set(verdict.hits.map((hit) => hit.key))];
  const shown = keys.slice(0, MAX_LABELS);
  const rest = keys.length - shown.length;

  const list =
    shown.map((key: AllergenKey) => t(`onb.s4.allergies.${key}`)).join(", ") +
    (rest > 0 ? ` ${t("meals.allergen.more", { n: rest })}` : "");

  return verdict.status === "unsafe" ? (
    <Pill label={t("meals.allergen.contains", { list })} tone="danger" />
  ) : (
    <Pill label={t("meals.allergen.maybe", { list })} tone="warn" />
  );
}
```

- [ ] **Step 4: `RecipeBrowser.tsx` implementieren**

```tsx
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, View } from "react-native";

import { Field, Icon, SectionHeader } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Text } from "@/design-system/ui";
import {
  judgeRecipe,
  localize,
  useFamilyAllergies,
  useRecipes,
  type RecipeAllergenVerdict,
  type RecipeRow,
} from "@/features/meals";

import { AllergenBadge } from "./AllergenBadge";

interface JudgedRecipe {
  recipe: RecipeRow;
  verdict: RecipeAllergenVerdict;
}

export function RecipeBrowser() {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const [search, setSearch] = useState("");

  const { keys } = useFamilyAllergies();
  const { data, isLoading, error } = useRecipes({ search });

  // Bewusst KEIN `excludeAllergens` an die Query: serverseitiges Filtern
  // entfernte die Zeilen, statt sie auszugrauen — der Nutzer könnte "existiert
  // nicht" nicht von "wurde gefiltert" unterscheiden.
  const judged = useMemo<JudgedRecipe[]>(
    () => (data ?? []).map((recipe) => ({ recipe, verdict: judgeRecipe(recipe, keys) })),
    [data, keys],
  );

  return (
    <View className="mt-6">
      <SectionHeader title={t("meals.browse.title")} />

      <Field
        label={t("meals.browse.search")}
        iconName="search"
        value={search}
        onChangeText={setSearch}
        placeholder={t("meals.browse.searchPlaceholder")}
        autoCorrect={false}
      />

      {isLoading ? <ActivityIndicator className="mt-4" color={theme.primary} /> : null}

      {error ? (
        <Text variant="caption" tone="danger" style={{ marginTop: 12 }}>
          {t("meals.browse.loadError")}
        </Text>
      ) : null}

      {!isLoading && !error && judged.length === 0 ? (
        <Text variant="caption" tone="inkSecondary" style={{ marginTop: 12 }}>
          {t("meals.browse.empty")}
        </Text>
      ) : null}

      <View className="mt-3 gap-2">
        {judged.map(({ recipe, verdict }) => (
          <RecipeRowItem
            key={recipe.id}
            title={localize(recipe.title, i18n.language)}
            durationMin={recipe.duration_min}
            verdict={verdict}
          />
        ))}
      </View>
    </View>
  );
}

interface RecipeRowItemProps {
  title: string;
  durationMin: number | null;
  verdict: RecipeAllergenVerdict;
}

function RecipeRowItem({ title, durationMin, verdict }: RecipeRowItemProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();

  const dimmed = verdict.status === "unsafe" || verdict.status === "caution";

  const a11yLabel = (() => {
    if (verdict.status === "safe") return title;
    if (verdict.status === "unverified") return t("meals.a11y.unverifiedRecipe", { title });
    const list = [...new Set(verdict.hits.map((hit) => hit.key))]
      .map((key) => t(`onb.s4.allergies.${key}`))
      .join(", ");
    return verdict.status === "unsafe"
      ? t("meals.a11y.unsafeRecipe", { title, list })
      : t("meals.a11y.cautionRecipe", { title, list });
  })();

  return (
    <View
      accessible
      accessibilityLabel={a11yLabel}
      className={`gap-2 rounded-2xl border border-line bg-card p-3 ${dimmed ? "opacity-50" : ""}`}
    >
      <Text variant="listTitle" numberOfLines={1}>
        {title}
      </Text>

      <View className="flex-row items-center gap-2">
        {durationMin !== null ? (
          <View className="flex-row items-center gap-1.5">
            <Icon name="clock" size={11} color={theme.inkSecondary} />
            <Text variant="caption" tone="inkSecondary">
              {t("meals.duration", { n: durationMin })}
            </Text>
          </View>
        ) : null}
        <AllergenBadge verdict={verdict} />
      </View>
    </View>
  );
}
```

- [ ] **Step 5: In `EssenScreen.tsx` einhängen**

Import ergänzen:

```tsx
import { RecipeBrowser } from "./RecipeBrowser";
```

Und direkt vor dem schließenden `</Screen>` — also nach der Einkaufslisten-`Pressable` — einfügen:

```tsx
<RecipeBrowser />
```

- [ ] **Step 6: Typecheck, Lint, Format, Tests**

Run: `bun run typecheck && bun lint && bun format:check && bun test`
Expected: alles grün

- [ ] **Step 7: Sichtprüfung im Web**

Run: `bun run web`

Prüfen — mit einem Kinderprofil, das `Eier` und `Sesam` gesetzt hat:

- **Spaghetti Carbonara** ausgegraut, rotes Badge „enthält Eier"
- **Hummus** ausgegraut, oranges Badge „möglicherweise Sesam"
- **Karottensuppe** normal, graues Badge „nicht geprüft"
- **Ofengemüse** normal, kein Badge
- Ohne gesetzte Allergien: alle vier normal und ohne Badge
- Suche „Pad" filtert die Liste

- [ ] **Step 8: Commit**

```bash
git add "app-sections/(tabs)/essen/AllergenBadge.tsx" "app-sections/(tabs)/essen/RecipeBrowser.tsx" "app-sections/(tabs)/essen/EssenScreen.tsx" features/i18n/locales/de.json features/i18n/locales/en.json
git commit -m "feat(meals): Rezept-Browser mit Allergen-Kennzeichnung im Essen-Tab"
```

---

## Task 8: Dokumentation nachziehen

**Files:**

- Modify: `docs/decision-log.md` — ADR-014 anhängen
- Modify: `docs/TODO.md`
- Modify: `CLAUDE.md` — Folder-Structure

- [ ] **Step 1: ADR-014 an `docs/decision-log.md` anhängen**

Format an ADR-013 orientieren (Titel mit Datum, Kontext, Decisions, Konsequenzen). Inhalt:

- **Kontext:** `contains_allergens` hat keinen Befüller; `AllergyKey` und die Rezept-Codes decken sich nur bei `milk`; ein Boolean kann "keine Allergene" nicht von "wir wissen es nicht" unterscheiden.
- **Decision 1:** Vokabular auf die EU-14 erweitert, geschlossen, kein Freitext. Die sechs Bestands-Keys bleiben wortgleich — kein Migrationsfall.
- **Decision 2:** Das Regelwerk lebt als reines TS-Modul in `features/meals/allergens/`, ohne React- und Supabase-Import, damit die spätere Klassifizierungs-Edge-Function dieselbe Datei nutzt. Das LLM wird zusätzliche Quelle für den `declared`-Kanal, nicht Ersatz.
- **Decision 3:** Vier Zustände statt Boolean. Eine leere Deklaration ergibt `unverified`, nie `safe` — die Heuristik kann Anwesenheit belegen, nicht Abwesenheit.
- **Decision 4:** Matching läuft Substring für deutsche Terme (Komposita), wortgrenzen-basiert für kurze und englische. Negativlisten je Key fangen Buchweizen (glutenfrei, enthält `weizen`), Schweinefleisch (enthält `wein`), Kokos- und Muskatnuss (keine Schalenfrüchte).
- **Decision 5:** Der Negations-Guard wirkt pro Vorkommen, nicht pro Key. Folge: `laktosefrei` hebt `milk` **nicht** auf — gespaltener Milchzucker ist kein entferntes Milcheiweiß. `allergies` und `intolerances` bleiben getrennt.
- **Decision 6:** Gefiltert wird clientseitig, `RecipeFilter.excludeAllergens` bleibt ungenutzt — Ausgrauen statt Entfernen.
- **Konsequenzen:** Begriffslisten sind ein lebender Korpus und brauchen Nachschärfung an echten Daten; `unverified` dominiert, bis ein Klassifizierer läuft; die Chip-Reihe in Onboarding und Kinderprofil wird dichter.
- **Supersession:** ADR-014 ergänzt ADR-004 (Schema) um das Allergen-Vokabular, ersetzt es nicht.

- [ ] **Step 2: `docs/TODO.md` — erledigte Einträge entfernen**

In der Sektion **Essen / Meal-Planner**:

- **Löschen:** den Eintrag „Allergen-Vokabular von `recipes.contains_allergens` und `children.allergies` deckt sich nicht" — durch diese Iteration gelöst.
- **Löschen:** den Eintrag „Der Rezept-Pool ist leer" — Seeds sind da. Ersatz siehe nächster Schritt.
- **Anpassen:** „Allergene kommen nicht aus den Kinderprofilen" → die Regel liegt jetzt in `isRecipeSafeForFamily`; offen bleibt, dass die KI-Vorschlagslogik sie mitbenutzt, statt sie zu duplizieren.

- [ ] **Step 3: `docs/TODO.md` — neue Einträge ergänzen**

In der Sektion **Essen / Meal-Planner**, je ein Bullet mit Datei-Referenz und Begründung:

- **Klassifizierungs-Edge-Function fehlt weiterhin** — sie ist der Owner des `declared`-Kanals; bis dahin urteilt fast jedes importierte Rezept `unverified`. Sie soll `features/meals/allergens/` importieren, statt ein zweites Vokabular aufzumachen.
- **Begriffslisten sind ein Startkorpus** (`features/meals/allergens/terms.ts`) — an echten gustar.io-Daten nachschärfen; jeder neue Term braucht einen Testfall, jeder False Positive einen `exclude`-Eintrag.
- **`intolerances` wird nicht gelesen** — Laktose, Fructose, Histamin brauchen ein eigenes Urteilsmodell; die `frei`-Negation zeigt, dass die beiden Achsen nicht dasselbe sind.
- **Kein Freitext-Allergen** — Exoten außerhalb der EU-14 sind nicht abbildbar; ein „+ Andere"-Feld bräuchte eine Keys-Strategie und würde häufig `unverified` erzeugen (ersetzt den alten „+ Andere"-Eintrag in der Familie-Sektion nicht, sondern verweist darauf).
- **Nur sechs Seed-Rezepte** (`supabase/migrations/20260814120000_seed_recipes.sql`) — genug für die vier Urteilszustände, nicht für Last- oder Suchtests. Fällt weg, sobald der gustar.io-Worker liefert.
- **Neue i18n-Keys fehlen in `docs/COPY.md`** — `onb.s4.allergies.{crustaceans,fish,celery,mustard,sesame,sulphites,lupin,molluscs}`, `meals.browse.*`, `meals.allergen.*`, `meals.a11y.*`. Vom Designer nachtragen.
- **Chip-Reihe in beiden Pattern-Docs veraltet** — `patterns/onboarding.md` und `patterns/child-profile.md` beschreiben sechs Allergie-Chips, gerendert werden 14. Mit dem Designer abstimmen, ob eine Gruppierung nötig wird.

- [ ] **Step 4: `CLAUDE.md` — Folder-Structure ergänzen**

Im `features/`-Block, beim `meals/`-Eintrag:

```text
├─ meals/                Meal-Planner-Daten-Layer (Queries · JSONB-Normalisierung · Wochenlogik)
│  └─ allergens/         EU-14-Vokabular · Begriffslisten · Zutaten-Klassifizierer · Urteil (ADR-014)
```

- [ ] **Step 5: Format prüfen und committen**

```bash
bun format:check
git add docs/decision-log.md docs/TODO.md CLAUDE.md
git commit -m "docs(meals): ADR-014, TODO-Abgleich und Folder-Structure fuer den Allergen-Filter"
```

---

## Task 9: Abnahme

- [ ] **Step 1: Volle Gate-Kette lokal**

```bash
bun format:check && bun lint && bun run typecheck && bun test && bunx expo export --platform web --output-dir /tmp/eltern-web
```

Expected: alle fünf grün — dieselbe Reihenfolge wie `ci.yml`.

- [ ] **Step 2: CodeRabbit-Review**

```bash
coderabbit review --base main --agent
```

Findings abarbeiten oder mit Begründung verwerfen. Rate-Limit beachten: etwa 3 Reviews/Stunde über die CLI.

- [ ] **Step 3: Branch abschließen**

Mit `superpowers:finishing-a-development-branch` entscheiden, wie integriert wird.

---

## Self-Review

**Spec-Abdeckung:**

| Spec-Abschnitt             | Task                                   |
| -------------------------- | -------------------------------------- |
| 3.1 Ort der Logik          | 1–3 (Modul ohne React/Supabase-Import) |
| 3.3 Dateien                | 1–4, 7                                 |
| 4 Vokabular EU-14          | 1, 5                                   |
| 5.1 `fold()`               | 1                                      |
| 5.2 Matching-Modi          | 2                                      |
| 5.3 Negation inkl. Laktose | 2                                      |
| 5.4 Negativlisten          | 2                                      |
| 5.5 Begriffslisten         | 2                                      |
| 5.6 Urteil, 4 Zustände     | 3                                      |
| 6 `useFamilyAllergies`     | 4                                      |
| 7.1 RecipeBrowser          | 7                                      |
| 7.2 Darstellung            | 7                                      |
| 7.3 Badge-Ton              | 7 (nutzt bestehenden `Pill`-Ton)       |
| 7.4 Picker EU-14           | 5                                      |
| 7.5 i18n                   | 5, 7                                   |
| 8 Seeds                    | 6                                      |
| 9 Testing                  | 1–5 (Tests je Task), 9 (Gate-Kette)    |
| 10 Doku                    | 8                                      |

Keine Lücke.

**Typ-Konsistenz:** `AllergenKey` (Task 1) → `AllergenSpec.key` (2) → `TermMatch.key` (2) → `AllergenHit.key` (3) → `matchedAllergens` (3) → `mergeAllergies` (4) → `AllergenBadge` (7). `ALLERGY_KEYS`/`AllergyKey` bleiben in Task 5 als Alias-Namen bestehen, damit die beiden Picker unverändert bleiben. `judgeRecipe` nimmt `JudgeableRecipe`; `RecipeRow` erfüllt die Form strukturell, weil `contains_allergens: string[]` auf `readonly string[] | null` und `ingredients: Ingredient[]` auf `readonly Ingredient[]` zuweisbar sind.

**Bekanntes Risiko:** Der Golden-Corpus in Task 2 prüft die Begriffslisten gegen sich selbst. Schlägt ein Fall fehl, ist die Liste unvollständig — nicht der Algorithmus falsch. Die Fehlermeldung in Step 5 sagt das explizit, damit ein Umsetzer nicht am Matching schraubt, wo ein Term fehlt.
