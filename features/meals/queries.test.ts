import { beforeEach, describe, expect, mock, test } from "bun:test";

import type { Database } from "@/features/supabase/database.types";

import type { NormalizedRecipeFilter } from "./types";

import { escapeLike } from "./normalize";

/**
 * Same shape as features/calendar/reminders.test.ts: `fetchMealPlanWeek` and
 * `fetchRecipes` have no logic worth testing beyond the query they build —
 * which filters they apply, in which order, with which values — so this
 * suite stubs the Supabase client and asserts on the recorded calls instead
 * of hiding the query behind an ops port.
 */

interface QueryResult {
  data: unknown;
  error: unknown;
}

interface MethodCall {
  method: string;
  args: unknown[];
}

interface RecordedCall {
  table: string;
  select: string;
  calls: MethodCall[];
}

let calls: RecordedCall[] = [];
let result: QueryResult = { data: [], error: null };

/**
 * PostgREST builders are thenables, not promises — `await`ing one runs the
 * request. Every filter/order/limit call records itself on `call.calls` and
 * returns the same chain, so a test can assert both which methods ran and
 * with which arguments.
 */
function chain(call: RecordedCall) {
  const self = {
    gte(column: string, value: unknown) {
      call.calls.push({ method: "gte", args: [column, value] });
      return self;
    },
    lte(column: string, value: unknown) {
      call.calls.push({ method: "lte", args: [column, value] });
      return self;
    },
    eq(column: string, value: unknown) {
      call.calls.push({ method: "eq", args: [column, value] });
      return self;
    },
    ilike(column: string, value: unknown) {
      call.calls.push({ method: "ilike", args: [column, value] });
      return self;
    },
    not(column: string, operator: string, value: unknown) {
      call.calls.push({ method: "not", args: [column, operator, value] });
      return self;
    },
    order(column: string, options: unknown) {
      call.calls.push({ method: "order", args: [column, options] });
      return self;
    },
    limit(count: number) {
      call.calls.push({ method: "limit", args: [count] });
      return self;
    },
    maybeSingle(): Promise<QueryResult> {
      return Promise.resolve(result);
    },
    then<T>(onFulfilled: (r: QueryResult) => T): Promise<T> {
      return Promise.resolve(result).then(onFulfilled);
    },
  };
  return self;
}

function record(table: string, select: string) {
  const call: RecordedCall = { table, select, calls: [] };
  calls.push(call);
  return chain(call);
}

const supabase = {
  from(table: string) {
    return {
      select: (columns: string) => record(table, columns),
    };
  },
};

void mock.module("@/features/supabase", () => ({ supabase }));

// `queries.ts` also imports `useToday`, which reaches for `AppState` from
// `react-native` at module scope — `bun.test.preload.ts`'s global mock
// doesn't stub that export, and none of the functions under test here call
// the hook, so a trivial stub keeps the import side-effect-free.
void mock.module("@/features/shared", () => ({ useToday: () => new Date() }));

// Imported after the module mocks are installed: a static import would be
// hoisted above them and `queries.ts` would capture the real modules.
const { fetchMealPlanWeek, fetchRecipeById, fetchRecipes, normalizeRecipeFilter } =
  await import("./queries");

function only(table: string): RecordedCall {
  const matching = calls.filter((c) => c.table === table);
  expect(matching).toHaveLength(1);
  return matching[0];
}

function methodCalls(call: RecordedCall, method: string): unknown[][] {
  return call.calls.filter((c) => c.method === method).map((c) => c.args);
}

type DbRecipeRow = Database["public"]["Tables"]["recipes"]["Row"];
type MealPlanEntryRow = Database["public"]["Tables"]["meal_plan_entries"]["Row"];

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

function makeEntryRow(overrides: Partial<MealPlanEntryRow> = {}): MealPlanEntryRow {
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
    ...overrides,
  };
}

beforeEach(() => {
  calls = [];
  result = { data: [], error: null };
});

describe("fetchMealPlanWeek", () => {
  // Montag; siehe features/meals/week.test.ts für dieselbe Referenzwoche.
  const weekStart = new Date(2026, 7, 10);

  test("filtert `date` mit gte auf Montag und lte auf Sonntag", async () => {
    await fetchMealPlanWeek(weekStart);

    const call = only("meal_plan_entries");
    expect(methodCalls(call, "gte")).toEqual([["date", "2026-08-10"]]);
    // Ein Off-by-one in `addDays(weekStart, 6)` würde hier auf 08-15 oder
    // 08-17 statt 08-16 fallen.
    expect(methodCalls(call, "lte")).toEqual([["date", "2026-08-16"]]);
    expect(methodCalls(call, "order")).toEqual([["date", { ascending: true }]]);
  });

  test("mappt die eingebettete `recipes`-Zeile auf `recipe` und normalisiert sie", async () => {
    const raw = makeEntryRow();
    // Ein nackter String statt `{de: "..."}` beweist, dass `normalizeRecipe`
    // tatsächlich lief — ein reines Durchreichen würde hier fehlschlagen.
    result = { data: [{ ...raw, recipes: makeDbRecipe({ title: "Kürbis-Suppe" }) }], error: null };

    const entries = await fetchMealPlanWeek(weekStart);

    expect(entries).toHaveLength(1);
    expect(entries[0].recipe?.title).toEqual({ de: "Kürbis-Suppe" });
    expect(entries[0].recipe?.id).toBe("recipe-1");
    expect(entries[0]).not.toHaveProperty("recipes");
  });

  test("liefert `recipe: null`, wenn das Embed null ist", async () => {
    result = { data: [{ ...makeEntryRow(), recipes: null }], error: null };

    const entries = await fetchMealPlanWeek(weekStart);

    expect(entries[0].recipe).toBeNull();
  });
});

describe("fetchRecipeById", () => {
  test("filtert per eq auf die id und normalisiert die Zeile", async () => {
    result = { data: makeDbRecipe({ title: "Linsensuppe" }), error: null };

    const recipe = await fetchRecipeById("recipe-1");

    const call = only("recipes");
    expect(methodCalls(call, "eq")).toEqual([["id", "recipe-1"]]);
    expect(recipe?.title).toEqual({ de: "Linsensuppe" });
  });

  test("gibt null zurück, wenn nichts gefunden wird", async () => {
    result = { data: null, error: null };

    expect(await fetchRecipeById("missing")).toBeNull();
  });
});

describe("fetchRecipes", () => {
  const baseFilter: NormalizedRecipeFilter = { search: "", excludeAllergens: [], limit: 50 };

  test("überspringt den ilike-Filter, wenn die Suche leer ist", async () => {
    await fetchRecipes(baseFilter);

    const call = only("recipes");
    expect(methodCalls(call, "ilike")).toEqual([]);
  });

  test("hüllt die escapte Suche in %…% und zielt auf title->>de", async () => {
    await fetchRecipes({ ...baseFilter, search: "50% Käse" });

    const call = only("recipes");
    expect(methodCalls(call, "ilike")).toEqual([["title->>de", `%${escapeLike("50% Käse")}%`]]);
  });

  test("baut das Allergen-Literal als {a,b} aus sortierten Codes", async () => {
    await fetchRecipes({ ...baseFilter, excludeAllergens: ["a", "b"] });

    const call = only("recipes");
    expect(methodCalls(call, "not")).toEqual([["contains_allergens", "ov", "{a,b}"]]);
  });

  test("lässt den Allergen-Filter weg, wenn die Liste leer ist", async () => {
    await fetchRecipes(baseFilter);

    const call = only("recipes");
    expect(methodCalls(call, "not")).toEqual([]);
  });

  test("sortiert nach created_at desc und id asc", async () => {
    await fetchRecipes(baseFilter);

    const call = only("recipes");
    expect(methodCalls(call, "order")).toEqual([
      ["created_at", { ascending: false }],
      ["id", { ascending: true }],
    ]);
  });
});

describe("normalizeRecipeFilter", () => {
  test("trimmt die Suche", () => {
    expect(normalizeRecipeFilter({ search: "  Pasta  " }).search).toBe("Pasta");
  });

  test("de-dupliziert und sortiert die Allergene", () => {
    const filter = normalizeRecipeFilter({ excludeAllergens: ["soy", "milk", "soy", "gluten"] });

    expect(filter.excludeAllergens).toEqual(["gluten", "milk", "soy"]);
  });

  test("setzt das Default-Limit, wenn keins übergeben wird", () => {
    // DEFAULT_RECIPE_LIMIT in queries.ts, nicht exportiert.
    expect(normalizeRecipeFilter({}).limit).toBe(50);
  });

  test("übernimmt ein explizites Limit unverändert", () => {
    expect(normalizeRecipeFilter({ limit: 12 }).limit).toBe(12);
  });

  test("verwirft Codes, die nicht auf das Allergen-Muster passen", () => {
    // ',' spaltet das Postgres-Array-Literal in zwei Elemente, '' ergäbe das
    // leere Literal `{}`, und '}' würde PostgREST mit 400 quittieren.
    const filter = normalizeRecipeFilter({
      excludeAllergens: ["milk", "a,b", "", "a}b", "EGG"],
    });

    expect(filter.excludeAllergens).toEqual(["milk"]);
  });
});
