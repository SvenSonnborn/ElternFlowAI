import { QueryClient } from "@tanstack/react-query";
import { describe, expect, test } from "bun:test";

import type { MealPlanEntryWithRecipe, RecipeRow } from "./types";

import {
  applyPlan,
  applyRemove,
  applyReplace,
  isOptimisticEntry,
  optimisticEntry,
  patchMealWeek,
  restoreMealWeek,
  slotOccupant,
} from "./optimistic";
import { mealKeys } from "./queries";

function recipe(id: string): RecipeRow {
  return { id, title: { de: id } } as unknown as RecipeRow;
}

function entry(
  id: string,
  date: string,
  slot: MealPlanEntryWithRecipe["meal_slot"],
  recipeId = "r-1",
): MealPlanEntryWithRecipe {
  return {
    id,
    family_id: "fam-1",
    created_by: null,
    created_at: "2026-10-21T08:00:00.000Z",
    date,
    meal_slot: slot,
    recipe_id: recipeId,
    notes: null,
    servings_override: null,
    recipe: recipe(recipeId),
  };
}

describe("applyPlan", () => {
  test("ersetzt den Eintrag desselben Platzes und lässt andere stehen", () => {
    const old = entry("a", "2026-10-22", "dinner");
    const other = entry("b", "2026-10-22", "lunch");
    const otherDay = entry("c", "2026-10-23", "dinner");
    const next = entry("optimistic:x", "2026-10-22", "dinner", "r-2");
    expect(applyPlan([old, other, otherDay], next)).toEqual([other, otherDay, next]);
  });
});

describe("applyReplace / applyRemove", () => {
  test("applyReplace setzt recipe_id und recipe, Eingabe bleibt unverändert", () => {
    const input = [entry("a", "2026-10-22", "dinner"), entry("b", "2026-10-22", "lunch")];
    const snapshot = structuredClone(input);
    const out = applyReplace(input, "a", recipe("r-2"));
    expect(out[0]).toMatchObject({ id: "a", recipe_id: "r-2" });
    expect(out[0]?.recipe?.id).toBe("r-2");
    expect(out[1]).toBe(input[1]);
    expect(input).toEqual(snapshot);
  });

  test("applyRemove entfernt, Eingabe bleibt unverändert", () => {
    const input = [entry("a", "2026-10-22", "dinner"), entry("b", "2026-10-22", "lunch")];
    const out = applyRemove(input, "a");
    expect(out.map((e) => e.id)).toEqual(["b"]);
    expect(input).toHaveLength(2);
  });
});

describe("optimisticEntry", () => {
  test("trägt Platz, Rezept und Eltern und ist als vorläufig erkennbar", () => {
    const row = optimisticEntry(
      { date: "2026-10-22", slot: "dinner", recipe: recipe("r-9") },
      { id: "p-1", family_id: "fam-1" },
      new Date("2026-10-21T10:00:00.000Z"),
    );
    expect(row).toMatchObject({
      family_id: "fam-1",
      created_by: "p-1",
      date: "2026-10-22",
      meal_slot: "dinner",
      recipe_id: "r-9",
    });
    expect(isOptimisticEntry(row)).toBe(true);
    expect(isOptimisticEntry(entry("real", "2026-10-22", "dinner"))).toBe(false);
  });
});

function getWeek(qc: QueryClient, key: readonly unknown[]) {
  return qc.getQueryData<MealPlanEntryWithRecipe[]>(key);
}

describe("patchMealWeek / restoreMealWeek", () => {
  // 2026-10-21 ist ein Mittwoch -> Woche ab Montag 2026-10-19; 2026-10-28 liegt in der Folgewoche.
  const weekA = mealKeys.plan("2026-10-19");
  const weekB = mealKeys.plan("2026-10-26");

  test("patcht nur die Woche des Datums, restore stellt den Stand exakt her", async () => {
    const qc = new QueryClient();
    const a = [entry("a", "2026-10-22", "dinner")];
    const b = [entry("b", "2026-10-28", "dinner")];
    qc.setQueryData(weekA, a);
    qc.setQueryData(weekB, b);

    const snapshot = await patchMealWeek(qc, "2026-10-22", (entries) => applyRemove(entries, "a"));

    expect(getWeek(qc, weekA)).toEqual([]);
    expect(getWeek(qc, weekB)).toBe(b);

    restoreMealWeek(qc, snapshot);
    expect(getWeek(qc, weekA)).toEqual(a);
    expect(getWeek(qc, weekB)).toBe(b);
  });

  test("nicht geladene Woche bleibt unberührt", async () => {
    const qc = new QueryClient();
    const snapshot = await patchMealWeek(qc, "2026-10-22", (entries) => [...entries]);
    expect(getWeek(qc, weekA)).toBeUndefined();
    restoreMealWeek(qc, snapshot);
    expect(getWeek(qc, weekA)).toBeUndefined();
  });
});

describe("slotOccupant", () => {
  const none: ReadonlySet<string> = new Set();

  test("echte Zeile auf dem Platz: die Zeile", () => {
    const real = entry("e-1", "2026-10-22", "dinner");
    const other = entry("e-2", "2026-10-22", "lunch");
    expect(slotOccupant([other, real], none, "2026-10-22", "dinner")).toBe(real);
  });

  test("optimistische Zeile: null — ihre Id darf nie an den Server", () => {
    const pending = entry("optimistic:2026-10-22:dinner", "2026-10-22", "dinner");
    expect(slotOccupant([pending], none, "2026-10-22", "dinner")).toBeNull();
  });

  test("Zeile im Undo-Fenster: null", () => {
    const deleted = entry("e-1", "2026-10-22", "dinner");
    expect(slotOccupant([deleted], new Set(["e-1"]), "2026-10-22", "dinner")).toBeNull();
  });

  test("leerer Platz oder nicht geladene Woche: null", () => {
    const other = entry("e-1", "2026-10-23", "dinner");
    expect(slotOccupant([other], none, "2026-10-22", "dinner")).toBeNull();
    expect(slotOccupant(undefined, none, "2026-10-22", "dinner")).toBeNull();
  });
});
