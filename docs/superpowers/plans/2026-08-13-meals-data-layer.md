# Meal-Planner-Daten-Layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `features/meals/` liefert vier lesende Hooks — `useMealPlans`, `useTodaysMeal`, `useRecipeById`, `useRecipes` — über die Tabellen `recipes` und `meal_plan_entries`.

**Architecture:** Reine Logik (JSONB-Normalisierung, Wochenlogik) liegt in eigenen Dateien mit Unit-Tests; `queries.ts` bleibt ein dünner Wrapper aus Supabase-Fetchern und React-Query-Hooks. Der Wochenplan wird zu genau sieben `MealPlanDay` gruppiert, jeder mit einem `Record<MealSlot, Entry | null>`. Vorher wandert das bestehende `useToday()` aus `features/tasks/queries.ts` nach `features/shared/`, damit es nicht zweimal existiert.

**Tech Stack:** TypeScript (strict), `@supabase/supabase-js`, `@tanstack/react-query` 5.101.4, `date-fns` 4.4.0, Tests mit `bun:test`.

**Spec:** [docs/superpowers/specs/2026-08-13-meals-data-layer-design.md](../specs/2026-08-13-meals-data-layer-design.md)

> **Nachtrag nach der Umsetzung.** Drei Stellen dieses Plans weichen vom
> ausgelieferten Code ab. Der Originaltext bleibt stehen — verbindlich ist der
> Code, nicht dieser Plan.
>
> 1. **Task 2, `toIngredients`:** Der Implementierungs-Code in Step 4 behandelt
>    ein nacktes String-Element als Zutatennamen, der Test in Step 2 („kein
>    Objekt" wird verworfen) verlangt das Gegenteil — der Plan widerspricht sich
>    selbst. Ausgeliefert ist die Test-Variante: ein String als _Array-Element_
>    wird verworfen, weil er sich nicht von einer Mengenangabe unterscheiden
>    lässt; ein String im `name`-**Feld** eines Zutaten-Objekts bleibt gültig.
>    `toInstructions` nimmt nackte Strings weiterhin an — ein Zubereitungsschritt
>    _ist_ nur Text. Siehe [features/meals/normalize.ts](../../../features/meals/normalize.ts).
> 2. **Task 4, Kommentar zum Allergenfilter:** „trifft `recipes_contains_allergens_gin`"
>    ist falsch. Ein negiertes Overlap ist nicht indizierbar; Postgres
>    sequenz-scannt. Im Code korrigiert, Index-Bedarf in [docs/TODO.md](../../TODO.md).
> 3. **Task 4, „keine Unit-Tests":** gilt nur für die Hooks. Die Fetcher sind in
>    `features/meals/queries.test.ts` abgedeckt, nach dem Muster von
>    [features/calendar/reminders.test.ts](../../../features/calendar/reminders.test.ts).
>
> Ebenfalls ungenau: Task 5, Step 2 erwartet beim Grep „nur der Treffer in
> `CLAUDE.md`" — es sind zwei, der zweite steht in
> `docs/eltern-flow-ai-project-structure.md` und ist als TODO erfasst.

## Global Constraints

- **Branch:** `feat/meals-data-layer`. Bereits angelegt, die Spec ist darauf committed.
- **Commits:** Conventional-Commits-Prefix, scoped (`feat(meals): …`). **Niemals** einen `Co-Authored-By: Claude …`-Trailer anhängen — Repo-Policy.
- **Pre-commit-Hooks** (`lint-staged`) dürfen nie mit `--no-verify` umgangen werden.
- **Handoff-Bundle ist tabu:** `design-system/{colors,typography,spacing,themes,components,index}.ts`, `docs/HANDOFF.md`, `docs/COPY.md`, `docs/ICONS.md`, `docs/README.md`, `patterns/*.md`. Dieser Plan fasst keine davon an.
- **Keine UI-Strings.** Dieser Layer rendert nichts; es entstehen keine i18n-Keys. `escapeLike`-Ergebnisse und Slot-Namen sind Datenwerte, keine Copy.
- **Pfad-Alias** `@/*` zeigt auf die Repo-Wurzel.
- **Import-Reihenfolge** wird von `perfectionist/sort-imports` (natural, asc, `internalPattern: ["^@/.+"]`) erzwungen. Die Import-Blöcke in diesem Plan sind bereits korrekt sortiert — unverändert übernehmen.
- **`@typescript-eslint` läuft type-aware** (`recommendedTypeChecked`). Keine überflüssigen `as`-Casts: `no-unnecessary-type-assertion` schlägt zu.
- **`react-hooks/exhaustive-deps` ist `error`**, nicht `warn`.
- **Kein `noUncheckedIndexedAccess`** — Index-Zugriffe wie `days[2].date` sind in Tests ohne Guard erlaubt.
- **Verifikation nach jeder Task:** `bun run typecheck && bun lint && bun test` müssen sauber durchlaufen, bevor committet wird.

---

## File Structure

| Datei                              | Verantwortung                                                           |
| ---------------------------------- | ----------------------------------------------------------------------- |
| `features/shared/useToday.ts`      | Lokale Mitternacht mit Tageswechsel-Erkennung (verschoben, unverändert) |
| `features/shared/index.ts`         | Barrel                                                                  |
| `features/meals/types.ts`          | DB-abgeleitete und Layer-eigene Types. Kein Runtime-Code                |
| `features/meals/normalize.ts`      | `Json` → typisiert, defensiv. `localize()`, `escapeLike()`              |
| `features/meals/week.ts`           | Wochenfenster, Gruppierung nach Tag+Slot, Tageszeit→Slot-Regel          |
| `features/meals/queries.ts`        | `mealKeys`, Supabase-Fetcher, die vier Hooks                            |
| `features/meals/index.ts`          | Barrel                                                                  |
| `features/meals/normalize.test.ts` | Unit-Tests für `normalize.ts`                                           |
| `features/meals/week.test.ts`      | Unit-Tests für `week.ts`                                                |

Gelöscht wird `features/meal-planner/README.md` (Placeholder, samt Ordner).

---

## Task 1: `useToday` nach `features/shared/` extrahieren

**Files:**

- Create: `features/shared/useToday.ts`
- Create: `features/shared/index.ts`
- Modify: `features/tasks/queries.ts:1-6` (Imports) und `features/tasks/queries.ts:56-92` (lokale Hook-Definition entfernen)

**Interfaces:**

- Consumes: nichts.
- Produces: `useToday(): Date` — importierbar als `import { useToday } from "@/features/shared";`. Task 4 nutzt ihn.

**Warum diese Task keinen neuen Test hat:** `useToday` ist ein React-Hook mit Timer und `AppState`-Listener; im Repo gibt es keine RTL-Hook-Infrastruktur, und alles Getestete in `features/tasks` ist rein. Die Task ist ein reiner Ortswechsel — die Absicherung ist, dass der Hook-Rumpf **byte-identisch** bleibt und die bestehende Suite plus `typecheck` weiterhin grün sind. Schritt 5 prüft die Identität explizit.

- [ ] **Step 1: `features/shared/useToday.ts` anlegen**

Der Rumpf ist wortgleich aus `features/tasks/queries.ts:56-92` übernommen, nur `export` ergänzt:

```ts
import { addDays, startOfDay } from "date-fns";
import { useEffect, useState } from "react";
import { AppState } from "react-native";

/**
 * Local midnight today, refreshed when the calendar day turns over. The
 * returned Date keeps its identity for the whole day, so the query key derived
 * from it holds still.
 *
 * Two triggers, because neither covers the other: the timer catches midnight
 * while the app is in the foreground, and the AppState listener catches the
 * midnights that passed while it was backgrounded — JS timers are suspended
 * there and would never fire.
 */
export function useToday(): Date {
  const [today, setToday] = useState(() => startOfDay(new Date()));

  useEffect(() => {
    const sync = () => {
      const current = startOfDay(new Date());
      // Keep the old instance when the day has not changed, so consumers'
      // memos and the query key do not churn on every foreground event.
      setToday((prev) => (prev.getTime() === current.getTime() ? prev : current));
    };

    // `addDays` on a local midnight lands on the next local midnight, so this
    // survives DST shifts that a flat +24h would get wrong. The extra second
    // keeps a timer that fires a hair early from re-arming at ~0ms.
    const timer = setTimeout(sync, addDays(today, 1).getTime() - Date.now() + 1_000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") sync();
    });

    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [today]);

  return today;
}
```

- [ ] **Step 2: `features/shared/index.ts` anlegen**

```ts
export { useToday } from "./useToday";
```

- [ ] **Step 3: `features/tasks/queries.ts` auf den geteilten Hook umstellen**

Die Import-Zeilen 1–6 werden zu (beachte: `@/features/shared` sortiert vor `@/features/supabase`):

```ts
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { subDays } from "date-fns";
import { useMemo } from "react";

import { useToday } from "@/features/shared";
import { supabase } from "@/features/supabase";
```

`addDays`, `startOfDay`, `useEffect`, `useState` und der komplette `AppState`-Import aus `react-native` entfallen — sie wurden ausschließlich von `useToday` gebraucht. `subDays` und `useMemo` bleiben.

Anschließend den gesamten Block von `features/tasks/queries.ts:56-92` löschen: den JSDoc-Kommentar über `function useToday(): Date {` und die Funktion selbst. Alles andere in der Datei bleibt unverändert; die vier Aufrufstellen (`useFamilyTasks`, `useTasksSections`, `useFilteredTaskSections`, `useTasksStats`) rufen jetzt den importierten Hook.

- [ ] **Step 4: Verifizieren, dass nichts kaputtging**

```bash
bun run typecheck && bun lint && bun test
```

Erwartet: `typecheck` ohne Ausgabe, `lint` ohne Fehler, alle bestehenden Tests grün. Kein Test ist neu.

- [ ] **Step 5: Prüfen, dass der Hook-Rumpf unverändert ist**

```bash
git diff --stat
git show HEAD:features/tasks/queries.ts | sed -n '56,92p' > /tmp/useToday-old.txt
diff <(sed -n '/^\/\*\*$/,$p' features/shared/useToday.ts | sed 's/^export function useToday/function useToday/') /tmp/useToday-old.txt && echo "IDENTISCH"
```

Erwartet: `IDENTISCH`. Weicht etwas ab, ist beim Kopieren Verhalten verlorengegangen — zurück zu Schritt 1. (Der `sed`-Ausdruck schneidet die Import-Zeilen ab und macht das `export` rückgängig, damit nur der Rumpf verglichen wird.)

- [ ] **Step 6: Committen**

```bash
git add features/shared/useToday.ts features/shared/index.ts features/tasks/queries.ts
git commit -m "refactor(shared): useToday nach features/shared extrahieren" -m "Der Meal-Planner-Layer braucht denselben Hook. Eine zweite Kopie mit
DST-Sonderfall und AppState-Listener wuerde beim naechsten Fix auseinanderlaufen."
```

---

## Task 2: Types und JSONB-Normalisierung

**Files:**

- Create: `features/meals/types.ts`
- Create: `features/meals/normalize.ts`
- Test: `features/meals/normalize.test.ts`

**Interfaces:**

- Consumes: `Database` und `Json` aus `@/features/supabase/database.types`.
- Produces:
  - Types: `MealSlot`, `LocalizedText`, `Ingredient`, `RecipeRow`, `MealPlanEntryRow`, `MealPlanEntryWithRecipe`, `MealPlanDay`, `RecipeFilter`, `NormalizedRecipeFilter`.
  - Funktionen: `toLocalizedText(value: Json | undefined): LocalizedText`, `toOptionalLocalizedText(value: Json | null): LocalizedText | null`, `toIngredients(value: Json): Ingredient[]`, `toInstructions(value: Json): LocalizedText[]`, `normalizeRecipe(row: DbRecipeRow): RecipeRow`, `localize(text: LocalizedText | null | undefined, lang: string): string`, `escapeLike(input: string): string`.

`types.ts` hat keinen Runtime-Code und damit nichts, was ein eigener Test prüfen könnte; er liegt deshalb in dieser Task, weil `normalize.ts` ihn braucht.

- [ ] **Step 1: `features/meals/types.ts` anlegen**

```ts
import type { Database } from "@/features/supabase/database.types";

export type MealSlot = Database["public"]["Enums"]["meal_slot_enum"];

/**
 * Ein Text in beiden Katalogsprachen. `de` ist laut CLAUDE.md die kanonische
 * Sprache und deshalb nicht optional — leer, wenn die Quelle nichts lieferte.
 */
export interface LocalizedText {
  de: string;
  en?: string;
}

export interface Ingredient {
  amount: string | null;
  unit: string | null;
  name: LocalizedText;
}

type DbRecipeRow = Database["public"]["Tables"]["recipes"]["Row"];

/**
 * Die Rezept-Zeile, nachdem `normalize.ts` die vier `jsonb`-Spalten dekodiert
 * hat. `Omit` statt eigenem Typ: alles Übrige hängt weiter an der generierten
 * Quelle und driftet beim nächsten Types-Regen nicht weg.
 */
export type RecipeRow = Omit<
  DbRecipeRow,
  "title" | "description" | "ingredients" | "instructions"
> & {
  title: LocalizedText;
  description: LocalizedText | null;
  ingredients: Ingredient[];
  instructions: LocalizedText[];
};

export type MealPlanEntryRow = Database["public"]["Tables"]["meal_plan_entries"]["Row"];

/**
 * Ein Wochenplan-Eintrag mit seinem Rezept. Singular `recipe` statt des
 * PostgREST-Namens `recipes`: der Fetcher schreibt die Zeile ohnehin um, um die
 * JSONB-Felder zu dekodieren. Nullable, weil PostgREST `null` für ein Embed
 * liefert, das RLS nicht freigibt.
 */
export type MealPlanEntryWithRecipe = MealPlanEntryRow & { recipe: RecipeRow | null };

export interface MealPlanDay {
  /** ISO-Kalendertag, `yyyy-MM-dd` — derselbe Raum wie `meal_plan_entries.date`. */
  date: string;
  isToday: boolean;
  slots: Record<MealSlot, MealPlanEntryWithRecipe | null>;
}

export interface RecipeFilter {
  search?: string;
  /** Normalisierte Codes wie in `recipes.contains_allergens` (`milk`, `egg`, …). */
  excludeAllergens?: string[];
  limit?: number;
}

/** Was `useRecipes` aus einem `RecipeFilter` macht — Cache-Key und Abfrage lesen dies. */
export interface NormalizedRecipeFilter {
  search: string;
  excludeAllergens: string[];
  limit: number;
}
```

- [ ] **Step 2: Den fehlschlagenden Test schreiben**

`features/meals/normalize.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import type { Database, Json } from "@/features/supabase/database.types";

import {
  escapeLike,
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
```

- [ ] **Step 3: Test laufen lassen und Fehlschlag bestätigen**

```bash
bun test features/meals/normalize.test.ts
```

Erwartet: FAIL mit `Cannot find module './normalize'` — die Datei existiert noch nicht.

- [ ] **Step 4: `features/meals/normalize.ts` implementieren**

```ts
import type { Database, Json } from "@/features/supabase/database.types";

import type { Ingredient, LocalizedText, RecipeRow } from "./types";

type DbRecipeRow = Database["public"]["Tables"]["recipes"]["Row"];

/** Der einzige `Json`-Fall, in dem Key-Zugriff erlaubt ist. */
function asRecord(value: Json | undefined): { [key: string]: Json | undefined } | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}

/** Ein Skalar als getrimmter String, oder `null`. Zahlen kommen aus dem Crawler vor. */
function asScalar(value: Json | undefined): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  return null;
}

function isEmpty(text: LocalizedText): boolean {
  return !text.de && !text.en;
}

/**
 * `jsonb` garantiert keine Form, also wird hier geraten — defensiv und ohne zu
 * werfen. Ein einzelnes kaputtes Rezept aus dem Crawler darf nicht den ganzen
 * Wochenplan abschießen.
 */
export function toLocalizedText(value: Json | undefined): LocalizedText {
  if (typeof value === "string") return { de: value };

  const record = asRecord(value);
  if (!record) return { de: "" };

  const de = typeof record.de === "string" ? record.de : "";
  const en = typeof record.en === "string" ? record.en : "";
  return en ? { de, en } : { de };
}

/** Wie `toLocalizedText`, aber ein durchweg leerer Text wird zu `null`. */
export function toOptionalLocalizedText(value: Json | null): LocalizedText | null {
  if (value === null) return null;
  const text = toLocalizedText(value);
  return isEmpty(text) ? null : text;
}

export function toIngredients(value: Json): Ingredient[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (typeof item === "string") {
      const name = toLocalizedText(item);
      return isEmpty(name) ? [] : [{ amount: null, unit: null, name }];
    }

    const record = asRecord(item);
    if (!record) return [];

    const name = toLocalizedText(record.name);
    // Ohne Namen ist die Zutat unbrauchbar — Menge und Einheit allein sagen nichts.
    if (isEmpty(name)) return [];

    return [{ amount: asScalar(record.amount), unit: asScalar(record.unit), name }];
  });
}

export function toInstructions(value: Json): LocalizedText[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((step) => {
    const text = toLocalizedText(step);
    return isEmpty(text) ? [] : [text];
  });
}

export function normalizeRecipe(row: DbRecipeRow): RecipeRow {
  const { title, description, ingredients, instructions, ...rest } = row;

  return {
    ...rest,
    title: toLocalizedText(title),
    description: toOptionalLocalizedText(description),
    ingredients: toIngredients(ingredients),
    instructions: toInstructions(instructions),
  };
}

/**
 * Der Text in der gewünschten Sprache, sonst in der anderen. DE ist die
 * kanonische Sprache, aber ein leeres Feld ist keine Übersetzung, sondern eine
 * Lücke — deshalb greift der Fallback in beide Richtungen.
 */
export function localize(text: LocalizedText | null | undefined, lang: string): string {
  if (!text) return "";

  const preferEn = lang.startsWith("en");
  const primary = preferEn ? text.en : text.de;
  const fallback = preferEn ? text.de : text.en;

  if (primary?.trim()) return primary;
  return fallback ?? "";
}

/**
 * Macht eine Nutzereingabe für `ilike` harmlos. `%` und `_` sind LIKE-Platzhalter
 * und werden maskiert; `*` lässt sich nicht maskieren, weil PostgREST es vor der
 * Abfrage selbst durch `%` ersetzt — es fliegt deshalb raus.
 */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (char) => `\\${char}`).replace(/\*/g, "");
}
```

- [ ] **Step 5: Test laufen lassen und Erfolg bestätigen**

```bash
bun test features/meals/normalize.test.ts
```

Erwartet: PASS, 22 Tests.

- [ ] **Step 6: Volle Verifikation**

```bash
bun run typecheck && bun lint && bun test
```

Erwartet: alles sauber.

- [ ] **Step 7: Committen**

```bash
git add features/meals/types.ts features/meals/normalize.ts features/meals/normalize.test.ts
git commit -m "feat(meals): Types und JSONB-Normalisierung fuer Rezepte"
```

---

## Task 3: Wochenlogik

**Files:**

- Create: `features/meals/week.ts`
- Test: `features/meals/week.test.ts`

**Interfaces:**

- Consumes: `MealPlanDay`, `MealPlanEntryWithRecipe`, `MealSlot` aus `./types` (Task 2).
- Produces: `toDateKey(date: Date): string`, `weekStartFor(date: Date): Date`, `weekDayKeys(weekStart: Date): string[]`, `groupByDay(entries: MealPlanEntryWithRecipe[], weekStart: Date, today: Date): MealPlanDay[]`, `slotForTime(now: Date): MealSlot`. Task 4 nutzt alle bis auf `weekDayKeys`.

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

`features/meals/week.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import type { MealPlanEntryWithRecipe } from "./types";

import { groupByDay, slotForTime, toDateKey, weekDayKeys, weekStartFor } from "./week";

function makeEntry(overrides: Partial<MealPlanEntryWithRecipe> = {}): MealPlanEntryWithRecipe {
  return {
    id: "entry-1",
    family_id: "fam-1",
    date: "2026-08-12",
    meal_slot: "dinner",
    recipe_id: "recipe-1",
    servings_override: null,
    notes: null,
    created_by: null,
    created_at: "2026-08-01T08:00:00.000Z",
    recipe: null,
    ...overrides,
  };
}

/**
 * Lokale Mitternacht. Der Layer rechnet durchgehend in lokaler Zeit —
 * `new Date("2026-08-13")` wäre UTC und würde westlich von Greenwich auf den
 * Vortag fallen.
 */
function localDay(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

describe("weekStartFor", () => {
  test("zieht jeden Tag auf den Montag seiner Woche", () => {
    // 2026-08-13 ist ein Donnerstag, 2026-08-16 der Sonntag derselben Woche.
    expect(toDateKey(weekStartFor(localDay("2026-08-13")))).toBe("2026-08-10");
    expect(toDateKey(weekStartFor(localDay("2026-08-16")))).toBe("2026-08-10");
    expect(toDateKey(weekStartFor(localDay("2026-08-10")))).toBe("2026-08-10");
  });

  test("trägt über die Monatsgrenze", () => {
    // 2026-09-01 ist ein Dienstag; der Montag davor liegt noch im August.
    expect(toDateKey(weekStartFor(localDay("2026-09-01")))).toBe("2026-08-31");
  });
});

describe("weekDayKeys", () => {
  test("liefert sieben aufeinanderfolgende Tage ab dem Wochenstart", () => {
    expect(weekDayKeys(localDay("2026-08-10"))).toEqual([
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
      "2026-08-14",
      "2026-08-15",
      "2026-08-16",
    ]);
  });
});

describe("groupByDay", () => {
  const weekStart = localDay("2026-08-10");
  const today = localDay("2026-08-13");

  function allSlotsEmpty(days: ReturnType<typeof groupByDay>): boolean {
    return days.every((day) => Object.values(day.slots).every((entry) => entry === null));
  }

  test("liefert sieben Tage, auch wenn nichts geplant ist", () => {
    const days = groupByDay([], weekStart, today);

    expect(days).toHaveLength(7);
    expect(days.map((day) => day.date)).toEqual(weekDayKeys(weekStart));
    expect(allSlotsEmpty(days)).toBe(true);
  });

  test("legt einen Eintrag auf den richtigen Tag und Slot", () => {
    const entry = makeEntry({ date: "2026-08-12", meal_slot: "lunch" });
    const wednesday = groupByDay([entry], weekStart, today)[2];

    expect(wednesday.date).toBe("2026-08-12");
    expect(wednesday.slots.lunch).toBe(entry);
    expect(wednesday.slots.dinner).toBeNull();
  });

  test("hält mehrere Slots am selben Tag auseinander", () => {
    const lunch = makeEntry({ id: "e-lunch", date: "2026-08-13", meal_slot: "lunch" });
    const dinner = makeEntry({ id: "e-dinner", date: "2026-08-13", meal_slot: "dinner" });
    const thursday = groupByDay([lunch, dinner], weekStart, today)[3];

    expect(thursday.slots.lunch).toBe(lunch);
    expect(thursday.slots.dinner).toBe(dinner);
    expect(thursday.slots.breakfast).toBeNull();
    expect(thursday.slots.snack).toBeNull();
  });

  test("ignoriert Einträge außerhalb des Fensters", () => {
    const days = groupByDay(
      [makeEntry({ date: "2026-08-09" }), makeEntry({ id: "e-2", date: "2026-08-17" })],
      weekStart,
      today,
    );

    expect(days).toHaveLength(7);
    expect(allSlotsEmpty(days)).toBe(true);
  });

  test("markiert genau einen Tag als heute", () => {
    const days = groupByDay([], weekStart, today);

    expect(days.filter((day) => day.isToday).map((day) => day.date)).toEqual(["2026-08-13"]);
  });

  test("markiert keinen Tag, wenn die Woche nicht die aktuelle ist", () => {
    const days = groupByDay([], localDay("2026-08-03"), today);

    expect(days.some((day) => day.isToday)).toBe(false);
  });
});

describe("slotForTime", () => {
  test("folgt der Tageszeit-Regel aus patterns/meals.md", () => {
    expect(slotForTime(new Date(2026, 7, 13, 7, 30))).toBe("breakfast");
    expect(slotForTime(new Date(2026, 7, 13, 10, 59))).toBe("breakfast");
    expect(slotForTime(new Date(2026, 7, 13, 11, 0))).toBe("lunch");
    expect(slotForTime(new Date(2026, 7, 13, 14, 59))).toBe("lunch");
    expect(slotForTime(new Date(2026, 7, 13, 15, 0))).toBe("dinner");
    expect(slotForTime(new Date(2026, 7, 13, 23, 59))).toBe("dinner");
  });
});
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

```bash
bun test features/meals/week.test.ts
```

Erwartet: FAIL mit `Cannot find module './week'`.

- [ ] **Step 3: `features/meals/week.ts` implementieren**

```ts
import { addDays, format, startOfWeek } from "date-fns";

import type { MealPlanDay, MealPlanEntryWithRecipe, MealSlot } from "./types";

/**
 * Ein Kalendertag als `yyyy-MM-dd` aus **lokaler** Zeit. `meal_plan_entries.date`
 * ist eine `date`-Spalte ohne Zone; `toISOString()` auf lokaler Mitternacht
 * würde östlich von UTC einen Tag zu früh landen.
 */
export function toDateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/** Der Montag der Woche, in der `date` liegt. DE ist primäre Locale. */
export function weekStartFor(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 1 });
}

/** Die sieben Kalendertage einer Woche, Mo–So. */
export function weekDayKeys(weekStart: Date): string[] {
  return Array.from({ length: 7 }, (_, offset) => toDateKey(addDays(weekStart, offset)));
}

/**
 * Alle vier Slots leer. Als Literal statt aus einer Konstante gebaut: wächst das
 * `meal_slot_enum`, bricht hier der Typcheck — genau da, wo eine Entscheidung
 * fällig ist.
 */
function emptySlots(): Record<MealSlot, MealPlanEntryWithRecipe | null> {
  return { breakfast: null, lunch: null, dinner: null, snack: null };
}

/**
 * Die Woche als genau sieben Tage — leere eingeschlossen, damit das Mo–So-Raster
 * aus `patterns/meals.md` ohne Sonderbehandlung für Lücken rendert.
 *
 * Höchstens ein Eintrag je Tag und Slot ist keine Annahme, sondern das
 * `unique (family_id, date, meal_slot)` aus der Migration.
 */
export function groupByDay(
  entries: MealPlanEntryWithRecipe[],
  weekStart: Date,
  today: Date,
): MealPlanDay[] {
  const todayKey = toDateKey(today);
  const days = new Map<string, MealPlanDay>();

  for (const date of weekDayKeys(weekStart)) {
    days.set(date, { date, isToday: date === todayKey, slots: emptySlots() });
  }

  for (const entry of entries) {
    // PostgREST liefert eine `date`-Spalte bereits als 'yyyy-MM-dd'.
    const day = days.get(entry.date);
    // Die Query filtert das Fenster schon; das hier fängt den Fall ab, dass ein
    // Aufrufer eine andere Woche gruppiert als die, die er geladen hat.
    if (!day) continue;
    day.slots[entry.meal_slot] = entry;
  }

  return [...days.values()];
}

/**
 * Der Slot, den der Nutzer gerade meint. Regel aus `patterns/meals.md`
 * ("Behaviour rules"): vor 11 Frühstück, 11–15 Mittag, sonst Abendessen.
 * `snack` wird nie automatisch gewählt.
 */
export function slotForTime(now: Date): MealSlot {
  const hour = now.getHours();
  if (hour < 11) return "breakfast";
  if (hour < 15) return "lunch";
  return "dinner";
}
```

- [ ] **Step 4: Test laufen lassen und Erfolg bestätigen**

```bash
bun test features/meals/week.test.ts
```

Erwartet: PASS, 10 Tests.

- [ ] **Step 5: Volle Verifikation**

```bash
bun run typecheck && bun lint && bun test
```

- [ ] **Step 6: Committen**

```bash
git add features/meals/week.ts features/meals/week.test.ts
git commit -m "feat(meals): Wochenlogik fuer den Essensplan"
```

---

## Task 4: Queries und Hooks

**Files:**

- Create: `features/meals/queries.ts`
- Create: `features/meals/index.ts`

**Interfaces:**

- Consumes: `useToday` aus `@/features/shared` (Task 1); `normalizeRecipe`, `escapeLike` aus `./normalize` (Task 2); `groupByDay`, `slotForTime`, `toDateKey`, `weekStartFor` aus `./week` (Task 3); alle Types aus `./types`.
- Produces: `mealKeys`, `normalizeRecipeFilter`, `fetchMealPlanWeek`, `fetchRecipeById`, `fetchRecipes`, `useMealPlans`, `useTodaysMeal`, `useRecipeById`, `useRecipes`.

**Warum diese Task keine Unit-Tests hat:** Alles hier ist entweder ein React-Hook oder ein Supabase-Fetcher gegen ein echtes Netzwerk. Die testbare Logik ist bereits in Task 2 und 3 abgedeckt; ein Mock des Supabase-Query-Builders würde die Mock-Attrappe testen, nicht die Abfrage. Verifikation ist `typecheck` + `lint` + der Web-Smoke-Build.

- [ ] **Step 1: `features/meals/queries.ts` implementieren**

```ts
import { keepPreviousData, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { addDays } from "date-fns";
import { useMemo } from "react";

import { useToday } from "@/features/shared";
import { supabase } from "@/features/supabase";

import type {
  MealPlanDay,
  MealPlanEntryWithRecipe,
  MealSlot,
  NormalizedRecipeFilter,
  RecipeFilter,
  RecipeRow,
} from "./types";

import { escapeLike, normalizeRecipe } from "./normalize";
import { groupByDay, slotForTime, toDateKey, weekStartFor } from "./week";

const ENTRY_SELECT = "*, recipes(*)";

const DEFAULT_RECIPE_LIMIT = 50;

export const mealKeys = {
  /** Alles zum Meal-Planner. */
  all: ["meals"] as const,
  /**
   * Nur die Wochenpläne. Spätere Mutationen invalidieren hierüber alle Wochen,
   * ohne den langlebigen `recipe`-Cache mitzureißen — dieselbe Trennung wie
   * `taskKeys.familyRoot` gegenüber `taskKeys.all`.
   */
  plansRoot: ["meals", "plan"] as const,
  plan: (weekStart: string) => ["meals", "plan", weekStart] as const,
  recipesRoot: ["meals", "recipes"] as const,
  recipes: (filter: NormalizedRecipeFilter) => ["meals", "recipes", filter] as const,
  recipe: (id: string) => ["meals", "recipe", id] as const,
};

/**
 * Bringt einen Filter in die Form, die Cache-Key und Abfrage teilen. Ohne das
 * wären `{}` und `{ limit: 50 }` zwei Einträge für dieselbe Abfrage, und
 * `["milk","egg"]` ein dritter neben `["egg","milk"]`.
 */
export function normalizeRecipeFilter(filter: RecipeFilter): NormalizedRecipeFilter {
  return {
    search: filter.search?.trim() ?? "",
    excludeAllergens: [...new Set(filter.excludeAllergens ?? [])].sort(),
    limit: filter.limit ?? DEFAULT_RECIPE_LIMIT,
  };
}

/**
 * Die Einträge einer Kalenderwoche.
 *
 * Kein `family_id`-Filter: `meal_plan_entries` läuft mit `force row level
 * security` und `family_id = current_family_id()` auf allen vier Kommandos, die
 * Policy ist also die einzige Definition von "meine Familie". Ein Client-Filter
 * wäre eine zweite, die davon wegdriften kann.
 */
export async function fetchMealPlanWeek(weekStart: Date): Promise<MealPlanEntryWithRecipe[]> {
  const { data, error } = await supabase
    .from("meal_plan_entries")
    .select(ENTRY_SELECT)
    .gte("date", toDateKey(weekStart))
    .lte("date", toDateKey(addDays(weekStart, 6)))
    .order("date", { ascending: true });
  if (error) throw error;

  return (data ?? []).map(({ recipes, ...entry }) => ({
    ...entry,
    recipe: recipes ? normalizeRecipe(recipes) : null,
  }));
}

export async function fetchRecipeById(id: string): Promise<RecipeRow | null> {
  const { data, error } = await supabase.from("recipes").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? normalizeRecipe(data) : null;
}

/**
 * Der sichtbare Rezept-Pool, gefiltert.
 *
 * Gefiltert wird gegen `contains_allergens`, nicht gegen `diet_tags` — der
 * Spaltenkommentar in der Migration ist da eindeutig: `diet_tags` sind
 * UI-Badges, `contains_allergens` ist die Quelle der Wahrheit. `not(…, "ov", …)`
 * heißt "überlappt nicht" und trifft `recipes_contains_allergens_gin`.
 */
export async function fetchRecipes(filter: NormalizedRecipeFilter): Promise<RecipeRow[]> {
  let query = supabase.from("recipes").select("*");

  if (filter.search) {
    query = query.ilike("title->>de", `%${escapeLike(filter.search)}%`);
  }
  if (filter.excludeAllergens.length > 0) {
    query = query.not("contains_allergens", "ov", `{${filter.excludeAllergens.join(",")}}`);
  }

  const { data, error } = await query.order("created_at", { ascending: false }).limit(filter.limit);
  if (error) throw error;

  return (data ?? []).map(normalizeRecipe);
}

interface UseMealPlansResult {
  /** Immer sieben Tage, Mo–So. */
  data: MealPlanDay[];
  isLoading: boolean;
  /** True während eines Pull-to-Refresh oder eines Hintergrund-Refetch. */
  isRefetching: boolean;
  error: unknown;
  /** Auf `() => void` verengt: Aufrufer reichen das direkt an `onRefresh`. */
  refetch: () => void;
}

/**
 * Der Wochenplan der Familie.
 *
 * `weekStart` wird selbst auf den Montag gezogen — ein Aufrufer, der irgendein
 * Datum aus der Woche übergibt, landet damit auf demselben Cache-Eintrag statt
 * einen siebten anzulegen.
 */
export function useMealPlans(weekStart: Date): UseMealPlansResult {
  const today = useToday();
  const start = useMemo(() => weekStartFor(weekStart), [weekStart]);

  const query = useQuery({
    queryKey: mealKeys.plan(toDateKey(start)),
    queryFn: () => fetchMealPlanWeek(start),
  });

  const data = useMemo(
    () => groupByDay(query.data ?? [], start, today),
    [query.data, start, today],
  );

  return {
    data,
    isLoading: query.isLoading,
    isRefetching: query.isRefetching,
    error: query.error,
    refetch: () => void query.refetch(),
  };
}

interface UseTodaysMealResult {
  /** `null`, wenn für diesen Slot nichts geplant ist — kein Fallback auf einen anderen. */
  entry: MealPlanEntryWithRecipe | null;
  slot: MealSlot;
  isLoading: boolean;
  error: unknown;
}

/**
 * Die Mahlzeit für jetzt — ein Selektor auf `useMealPlans`, keine eigene Query.
 * Heute liegt per Definition in der aktuellen Woche, der Cache-Eintrag existiert
 * also ohnehin; ein eigener Key wäre eine zweite Kopie derselben Zeile, die
 * keine spätere Mutation invalidiert. Analog zu `useTask` in features/tasks.
 */
export function useTodaysMeal(): UseTodaysMealResult {
  const today = useToday();
  const weekStart = useMemo(() => weekStartFor(today), [today]);
  const { data, isLoading, error } = useMealPlans(weekStart);

  // Der Slot wird pro Render aus der Uhrzeit gelesen und aktualisiert sich nicht
  // von selbst, wenn 11:00 oder 15:00 bei offenem Screen vergeht (docs/TODO.md).
  const slot = slotForTime(new Date());

  const entry = useMemo(() => data.find((day) => day.isToday)?.slots[slot] ?? null, [data, slot]);

  return { entry, slot, isLoading, error };
}

/**
 * Ein einzelnes Rezept — hier doch eine eigene Query, weil die Rezeptliste
 * gefiltert und limitiert ist: ein Rezept aus einem Wochenplan-Eintrag muss in
 * ihr nicht vorkommen. Pool-Rezepte sind serverseitig unveränderlich, daher der
 * lange `staleTime`.
 */
export function useRecipeById(id: string): UseQueryResult<RecipeRow | null, Error> {
  return useQuery({
    queryKey: mealKeys.recipe(id),
    queryFn: () => fetchRecipeById(id),
    enabled: !!id,
    staleTime: 5 * 60_000,
  });
}

/**
 * Der Rezept-Pool. `keepPreviousData`, damit die Liste beim Tippen nicht auf
 * `isLoading` zurückfällt und weiß blinkt.
 *
 * Der Filter wird pro Render neu normalisiert; React Query hasht Query-Keys
 * strukturell, ein frisches Objekt gleichen Inhalts trifft also denselben
 * Cache-Eintrag.
 */
export function useRecipes(filter: RecipeFilter = {}): UseQueryResult<RecipeRow[], Error> {
  const normalized = normalizeRecipeFilter(filter);

  return useQuery({
    queryKey: mealKeys.recipes(normalized),
    queryFn: () => fetchRecipes(normalized),
    placeholderData: keepPreviousData,
  });
}
```

- [ ] **Step 2: `features/meals/index.ts` anlegen**

```ts
export {
  escapeLike,
  localize,
  normalizeRecipe,
  toIngredients,
  toInstructions,
  toLocalizedText,
  toOptionalLocalizedText,
} from "./normalize";
export {
  fetchMealPlanWeek,
  fetchRecipeById,
  fetchRecipes,
  mealKeys,
  normalizeRecipeFilter,
  useMealPlans,
  useRecipeById,
  useRecipes,
  useTodaysMeal,
} from "./queries";
export type {
  Ingredient,
  LocalizedText,
  MealPlanDay,
  MealPlanEntryRow,
  MealPlanEntryWithRecipe,
  MealSlot,
  NormalizedRecipeFilter,
  RecipeFilter,
  RecipeRow,
} from "./types";
export { groupByDay, slotForTime, toDateKey, weekDayKeys, weekStartFor } from "./week";
```

- [ ] **Step 3: Typecheck und Lint**

```bash
bun run typecheck && bun lint
```

Erwartet: beides sauber.

**Falls `typecheck` beim Destructuring von `recipes` in `fetchMealPlanWeek` meckert:** supabase-js leitet den Embed-Namen aus dem Select-String ab. Prüfe, dass `ENTRY_SELECT` exakt `"*, recipes(*)"` lautet — PostgREST benennt das Embed nach der Zieltabelle (`recipes`), nicht nach der Spalte (`recipe_id`). Erfindet keinen Cast: `features/calendar/queries.ts` fährt mit demselben Muster.

- [ ] **Step 4: Tests und Web-Smoke-Build**

```bash
bun test
bunx expo export --platform web --output-dir /tmp/eltern-web-meals
```

Erwartet: alle Tests grün, der Export läuft durch. Der Build ist hier der eigentliche Beweis — er lädt das Modul und damit alle Imports.

- [ ] **Step 5: Committen**

```bash
git add features/meals/queries.ts features/meals/index.ts
git commit -m "feat(meals): Queries und Hooks fuer Wochenplan und Rezepte"
```

---

## Task 5: Doku nachziehen und Placeholder entfernen

**Files:**

- Delete: `features/meal-planner/README.md` (und damit der Ordner)
- Modify: `CLAUDE.md:109-115` (Ordnerbaum `features/`)
- Modify: `docs/TODO.md` (neue Sektion nach `## Aufgaben / Tasks (Daten-Layer V1)`)

**Interfaces:**

- Consumes: nichts. Reine Dokumentation.
- Produces: nichts.

- [ ] **Step 1: Placeholder-Ordner löschen**

```bash
git rm -r features/meal-planner
```

Der Ordner enthält nur `README.md` mit einer überholten Notiz (Edamam-API — das Projekt nutzt gustar.io). Er wird von `features/meals/` abgelöst.

- [ ] **Step 2: Prüfen, dass niemand darauf zeigt**

```bash
grep -rn "meal-planner" --include="*.ts" --include="*.tsx" --include="*.md" --include="*.json" . \
  | grep -v node_modules | grep -v "docs/superpowers"
```

Erwartet: nur der Treffer in `CLAUDE.md`, den Schritt 3 repariert. Taucht ein `.ts`/`.tsx`-Import auf, muss er zuerst umgebogen werden.

- [ ] **Step 3: Den `features/`-Baum in `CLAUDE.md` ersetzen**

Zeilen 109–115 lauten aktuell:

```
features/                Cross-cutting feature logic
├─ i18n/                 react-i18next init + de.json + en.json
├─ auth/                 Session-Store · AuthGate · DeepLinkHandler · Onboarding-Mutations
├─ voice-assistant/      (placeholder)
├─ meal-planner/         (placeholder)
├─ supabase/             client.ts (createClient + AsyncStorage session) + barrel
└─ notifications/        (placeholder)
```

Ersetzen durch:

```
features/                Cross-cutting feature logic
├─ i18n/                 react-i18next init + de.json + en.json
├─ auth/                 Session-Store · AuthGate · DeepLinkHandler · Onboarding-Mutations
├─ calendar/             Queries · Mutations · RRULE-Expansion · Reminder
├─ tasks/                Queries · Mutations · Filter · Stats
├─ children/             Kinderprofile
├─ meals/                Meal-Planner-Daten-Layer (Queries · JSONB-Normalisierung · Wochenlogik)
├─ shared/               Feature-übergreifende Hooks (useToday)
├─ sample-data/          Mock-Daten für noch nicht verdrahtete Screens
├─ voice-assistant/      (placeholder)
├─ supabase/             client.ts (createClient + AsyncStorage session) + barrel
└─ notifications/        (placeholder)
```

Neben `meals/` und `shared/` kommen `calendar/`, `tasks/`, `children/` und `sample-data/` dazu: die existieren längst und fehlten im Baum. Das ist eine Reparatur desselben Blocks, keine neue Konvention.

- [ ] **Step 4: Die neue TODO-Sektion einfügen**

In `docs/TODO.md` direkt **vor** `## Dashboard` einfügen:

```markdown
## Essen / Meal-Planner (Daten-Layer V1)

- **Mutationen fehlen** ([features/meals/queries.ts](../features/meals/queries.ts)): Der Layer ist lesend. Mahlzeit setzen, tauschen und löschen (`meal_plan_entries` INSERT/UPDATE/DELETE — die Policies liegen bereit) kommt mit dem Screen, der sie auslöst; vorher gäbe es Mutationen ohne Aufrufer.
- **Der Essen-Tab hängt weiter an den Sample-Daten** ([EssenScreen](<../app-sections/(tabs)/essen/EssenScreen.tsx>)): Der Daten-Layer ist da, der Screen rendert aber noch `weeklyMeals` aus [features/sample-data/meals.ts](../features/sample-data/meals.ts). Beim Verdrahten fällt diese Datei weg — `WeeklyMeal` und `Recipe` in [features/sample-data/types.ts](../features/sample-data/types.ts) mit aufräumen.
- **Der Rezept-Pool ist leer**: `supabase/migrations/` enthält kein einziges `insert into public.recipes`. `useRecipes` liefert bis zum gustar.io-Worker realistisch `[]`, die Suche lässt sich also nicht gegen echte Daten prüfen. Entweder Seeds nachziehen oder den Worker abwarten.
- **Allergene kommen nicht aus den Kinderprofilen** ([features/meals/queries.ts](../features/meals/queries.ts) — `useRecipes`): `excludeAllergens` ist ein Parameter. `patterns/meals.md` verlangt „niemals eine Mahlzeit mit einem aktiven Allergen vorschlagen" — diese Regel gehört in die KI-Vorschlagslogik, die `children.allergy_keys` liest, nicht in den Browse-Filter, sonst steht sie an zwei Orten.
- **`useTodaysMeal` merkt den Slot-Wechsel nicht** ([features/meals/queries.ts](../features/meals/queries.ts)): Der Slot wird pro Render aus `new Date()` gelesen. Vergeht 11:00 oder 15:00, während der Screen offen liegt, bleibt der alte Slot stehen, bis irgendetwas anderes ein Re-Render auslöst. Bräuchte einen Timer auf die nächste Grenze, analog zu [features/shared/useToday.ts](../features/shared/useToday.ts) — lohnt sich erst, wenn ein Screen den Hook wirklich rendert.
- **`snack` hat im Screen keinen Platz** ([patterns/meals.md](../patterns/meals.md)): Das `meal_slot_enum` führt vier Slots, V1 des Essen-Tabs zeigt drei Tabs (Abendessen · Mittag · Frühstück). Der Layer führt `snack` mit; solange nichts `snack` schreibt, ist das kein Konflikt. Beim Screen-Wiring mit dem Designer klären.
```

- [ ] **Step 5: Formatierung und Verifikation**

```bash
bun format:check && bun run typecheck && bun lint && bun test
```

Erwartet: alles sauber. Meckert `format:check`, mit `bun format` korrigieren und erneut prüfen.

- [ ] **Step 6: Committen**

```bash
git add CLAUDE.md docs/TODO.md
git commit -m "docs(meals): Ordnerbaum und Backlog auf den Daten-Layer nachziehen" -m "Loest den Placeholder features/meal-planner ab und traegt die
Nicht-Ziele des Layers als Backlog-Eintraege nach."
```

---

## Abschluss

- [ ] **CodeRabbit-Durchlauf vor dem PR**

```bash
coderabbit review --base main
```

Jeden Befund abarbeiten oder bewusst mit Begründung verwerfen — so öffnet der PR sauber (CLAUDE.md, "Code review").

- [ ] **Gesamtverifikation, wie CI sie fährt**

```bash
bun format:check && bun lint && bun run typecheck && bun test && bunx expo export --platform web --output-dir /tmp/eltern-web-meals
```

Alle fünf Schritte müssen grün sein — das ist exakt die Reihenfolge aus `ci.yml`.
