import { describe, expect, test } from "bun:test";

import type { PendingDelete } from "@/features/shared/pendingDeletes";

import type { MealPlanEntryWithRecipe } from "./types";

import { findPendingMealDelete, withoutPendingMealDeletes } from "./pendingDeletes";

function entry(id: string): MealPlanEntryWithRecipe {
  return { id } as MealPlanEntryWithRecipe;
}

function pending(id: string, kind: PendingDelete["kind"], target: unknown): PendingDelete {
  return { id, kind, target, run: () => Promise.resolve(), timeoutMs: 1 };
}

describe("withoutPendingMealDeletes", () => {
  test("filtert per id", () => {
    const rows = [entry("a"), entry("b")];
    expect(withoutPendingMealDeletes(rows, new Set(["a"])).map((e) => e.id)).toEqual(["b"]);
  });

  test("ohne offene Löschung kommt die Eingabe unverändert zurück", () => {
    const rows = [entry("a")];
    expect(withoutPendingMealDeletes(rows, new Set())).toBe(rows);
  });
});

describe("findPendingMealDelete", () => {
  const meal = pending("p1", "meal", { entryId: "a", date: "2026-10-22", slot: "dinner" });
  const task = pending("p2", "task", { entryId: "a", date: "2026-10-22", slot: "dinner" });

  test("findet nach date und slot", () => {
    expect(findPendingMealDelete([meal], "2026-10-22", "dinner")).toBe(meal);
    expect(findPendingMealDelete([meal], "2026-10-22", "lunch")).toBeUndefined();
    expect(findPendingMealDelete([meal], "2026-10-23", "dinner")).toBeUndefined();
  });

  test("ignoriert andere Arten", () => {
    expect(findPendingMealDelete([task], "2026-10-22", "dinner")).toBeUndefined();
  });
});
