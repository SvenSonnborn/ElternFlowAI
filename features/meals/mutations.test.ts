import { describe, expect, test } from "bun:test";

import type { MealOps, MealParent } from "./mutations";
import type { MealPlanEntryWithRecipe, RecipeRow } from "./types";

import { MealSlotOccupiedError, MissingParentError, mapMealError } from "./errors";
import { planMeal, removeMeal, replaceMeal } from "./mutations";

const PARENT: MealParent = { id: "parent-1", family_id: "fam-1" };

function recipe(id: string): RecipeRow {
  return { id, title: { de: id } } as unknown as RecipeRow;
}

function entry(id: string, recipeId: string): MealPlanEntryWithRecipe {
  return {
    id,
    family_id: "fam-1",
    created_by: "parent-2",
    created_at: "2026-10-21T08:00:00.000Z",
    date: "2026-10-22",
    meal_slot: "dinner",
    recipe_id: recipeId,
    notes: null,
    servings_override: null,
    recipe: recipe(recipeId),
  };
}

type InsertResult = MealPlanEntryWithRecipe | "taken";

/** Ops als Fakes: Antworten kommen aus Warteschlangen, Aufrufe werden gezählt. */
function fakeOps(opts: {
  inserts?: InsertResult[];
  slots?: (MealPlanEntryWithRecipe | null)[];
  update?: boolean;
  del?: boolean;
}) {
  const inserts = [...(opts.inserts ?? [])];
  const slots = [...(opts.slots ?? [])];
  const calls = {
    insert: [] as Parameters<MealOps["insertEntry"]>[0][],
    fetchSlot: 0,
    update: 0,
    del: 0,
  };
  const ops: MealOps = {
    fetchSlot: () => {
      calls.fetchSlot += 1;
      return Promise.resolve(slots.shift() ?? null);
    },
    insertEntry: (row) => {
      calls.insert.push(row);
      const next = inserts.shift();
      if (next === undefined) throw new Error("unexpected insert");
      return Promise.resolve(next);
    },
    updateRecipe: () => {
      calls.update += 1;
      return Promise.resolve(opts.update ?? false);
    },
    deleteEntry: () => {
      calls.del += 1;
      return Promise.resolve(opts.del ?? false);
    },
  };
  return { ops, calls };
}

const PLAN = { date: "2026-10-22", slot: "dinner" as const, recipe: recipe("r-new") };

describe("planMeal", () => {
  test("freier Platz: Familie und Eltern aus parent, Rückgabe ist die Zeile", async () => {
    const inserted = entry("e-1", "r-new");
    const { ops, calls } = fakeOps({ inserts: [inserted] });
    expect(await planMeal(PLAN, PARENT, ops)).toBe(inserted);
    expect(calls.insert).toEqual([
      {
        family_id: "fam-1",
        created_by: "parent-1",
        date: "2026-10-22",
        meal_slot: "dinner",
        recipe_id: "r-new",
      },
    ]);
    expect(calls.fetchSlot).toBe(0);
  });

  test("belegter Platz: MealSlotOccupiedError mit dem frischen Eintrag", async () => {
    const x = entry("e-x", "r-x");
    const { ops } = fakeOps({ inserts: ["taken"], slots: [x] });
    const err = await planMeal(PLAN, PARENT, ops).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MealSlotOccupiedError);
    expect((err as MealSlotOccupiedError).current).toBe(x);
  });

  test("taken, dann frei: genau ein zweiter Versuch, Erfolg wird zurückgegeben", async () => {
    const inserted = entry("e-2", "r-new");
    const { ops, calls } = fakeOps({ inserts: ["taken", inserted], slots: [null] });
    expect(await planMeal(PLAN, PARENT, ops)).toBe(inserted);
    expect(calls.insert).toHaveLength(2);
  });

  test("zweites taken: Occupied mit dem dann gelesenen Eintrag", async () => {
    const y = entry("e-y", "r-y");
    const { ops, calls } = fakeOps({ inserts: ["taken", "taken"], slots: [null, y] });
    const err = await planMeal(PLAN, PARENT, ops).catch((e: unknown) => e);
    expect((err as MealSlotOccupiedError).current).toBe(y);
    expect(calls.insert).toHaveLength(2);
  });

  test("zweites taken und wieder frei: generischer Fehler, kein dritter Versuch", async () => {
    const { ops, calls } = fakeOps({ inserts: ["taken", "taken"], slots: [null, null] });
    const err = await planMeal(PLAN, PARENT, ops).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(MealSlotOccupiedError);
    expect(calls.insert).toHaveLength(2);
  });
});

describe("replaceMeal", () => {
  const vars = {
    entryId: "e-1",
    seenRecipeId: "r-old",
    date: "2026-10-22",
    slot: "dinner" as const,
    recipe: recipe("r-new"),
  };

  test("Treffer: kein fetchSlot", async () => {
    const { ops, calls } = fakeOps({ update: true });
    await replaceMeal(vars, PARENT, ops);
    expect(calls.fetchSlot).toBe(0);
  });

  test("Fehlschuss, Platz trägt anderes Rezept: Occupied mit current", async () => {
    const y = entry("e-1", "r-y");
    const { ops } = fakeOps({ update: false, slots: [y] });
    const err = await replaceMeal(vars, PARENT, ops).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MealSlotOccupiedError);
    expect((err as MealSlotOccupiedError).current).toBe(y);
  });

  test("Fehlschuss, Platz leer: plant stattdessen ein", async () => {
    const { ops, calls } = fakeOps({
      update: false,
      slots: [null],
      inserts: [entry("e-9", "r-new")],
    });
    await replaceMeal(vars, PARENT, ops);
    expect(calls.insert).toHaveLength(1);
    expect(calls.insert[0]?.recipe_id).toBe("r-new");
  });

  test("Fehlschuss, Platz trägt schon das Zielrezept: Erfolg", async () => {
    const { ops, calls } = fakeOps({ update: false, slots: [entry("e-1", "r-new")] });
    await replaceMeal(vars, PARENT, ops);
    expect(calls.insert).toHaveLength(0);
  });
});

describe("removeMeal", () => {
  const vars = {
    entryId: "e-1",
    seenRecipeId: "r-old",
    date: "2026-10-22",
    slot: "dinner" as const,
  };

  test("Treffer: fertig", async () => {
    const { ops, calls } = fakeOps({ del: true });
    await removeMeal(vars, ops);
    expect(calls.fetchSlot).toBe(0);
  });

  test("Fehlschuss und Platz leer: fertig ohne Fehler", async () => {
    const { ops } = fakeOps({ del: false, slots: [null] });
    expect(await removeMeal(vars, ops)).toBeUndefined();
  });

  test("Fehlschuss und Platz anders belegt: Occupied", async () => {
    const y = entry("e-2", "r-y");
    const { ops } = fakeOps({ del: false, slots: [y] });
    const err = await removeMeal(vars, ops).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MealSlotOccupiedError);
    expect((err as MealSlotOccupiedError).current).toBe(y);
  });
});

describe("mapMealError", () => {
  test("ordnet Ursachen den Keys zu", () => {
    expect(mapMealError(new MealSlotOccupiedError(entry("e", "r")))).toBe("meals.error.changed");
    expect(mapMealError(new MissingParentError())).toBe("meals.error.notAuthenticated");
    expect(mapMealError({ code: "42501" })).toBe("meals.error.notAuthenticated");
    expect(mapMealError({ code: "23503" })).toBe("meals.error.recipeGone");
    expect(mapMealError(new Error("boom"))).toBe("meals.error.generic");
    expect(mapMealError(null)).toBe("meals.error.generic");
  });
});
