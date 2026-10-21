import { describe, expect, test } from "bun:test";

import type { ShowToastOptions } from "@/app-sections/shared/toastStore";
import type {
  MealOps,
  MealPlanEntryWithRecipe,
  RecipeRow,
  ReplaceMealVars,
} from "@/features/meals";

import { MealSlotOccupiedError } from "@/features/meals/errors";
import { replaceMeal } from "@/features/meals/mutations";

import { swapMeal, type SwapMealDeps } from "./swapMeal";

const previous = { id: "r-old", title: { de: "Garnelen", en: "Prawns" } } as RecipeRow;
const alternative = { id: "r-alt", title: { de: "Nudeln", en: "Pasta" } } as RecipeRow;
const entry = {
  id: "e1",
  recipe_id: "r-old",
  date: "2026-10-21",
  meal_slot: "dinner",
  recipe: previous,
} as MealPlanEntryWithRecipe;

function harness(replaceImpl: (vars: unknown) => Promise<unknown> = () => Promise.resolve()) {
  const replaceCalls: unknown[] = [];
  const toasts: ShowToastOptions[] = [];
  const deps: SwapMealDeps = {
    replace: (vars) => {
      replaceCalls.push(vars);
      return replaceImpl(vars);
    },
    showToast: (o) => toasts.push(o),
    t: ((key: string, opts?: Record<string, unknown>) =>
      typeof opts?.recipe === "string" ? `${key}:${opts.recipe}` : key) as SwapMealDeps["t"],
    lang: "de",
  };
  return { deps, replaceCalls, toasts };
}

describe("swapMeal", () => {
  test("ersetzt den Eintrag gegen das gesehene Rezept und bietet Rückgängig an", async () => {
    const { deps, replaceCalls, toasts } = harness();
    await swapMeal({ entry, alternative }, deps);

    expect(replaceCalls).toEqual([
      {
        entryId: "e1",
        seenRecipeId: "r-old",
        date: "2026-10-21",
        slot: "dinner",
        recipe: alternative,
      },
    ]);
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.variant).toBe("success");
    expect(toasts[0]?.title).toBe("dash.meal.swapped:Nudeln");
    expect(toasts[0]?.action?.label).toBe("action.undo");
  });

  test("Rückgängig ersetzt zurück, geschützt durch das Ausweichgericht als gesehenes Rezept", async () => {
    const { deps, replaceCalls, toasts } = harness();
    await swapMeal({ entry, alternative }, deps);
    toasts[0]?.action?.onPress();
    await Promise.resolve();

    expect(replaceCalls[1]).toEqual({
      entryId: "e1",
      seenRecipeId: "r-alt",
      date: "2026-10-21",
      slot: "dinner",
      recipe: previous,
      planIfGone: false,
    });
  });

  test("Rückgängig in einen inzwischen geleerten Platz meldet „geändert“ und plant nichts", async () => {
    // Das echte `replaceMeal` über Fake-Ops: Erst so zeigt der Test, dass
    // `planIfGone: false` tatsächlich kein INSERT mehr auslöst.
    let slotEmptied = false;
    const inserts: unknown[] = [];
    const ops: MealOps = {
      updateRecipe: () => Promise.resolve(!slotEmptied),
      fetchSlot: () => Promise.resolve(null),
      insertEntry: (row) => {
        inserts.push(row);
        return Promise.resolve("taken");
      },
      deleteEntry: () => Promise.resolve(false),
    };
    const parent = { id: "p1", family_id: "f1" };
    const { deps, toasts } = harness((vars) => replaceMeal(vars as ReplaceMealVars, parent, ops));
    await swapMeal({ entry, alternative }, deps);
    slotEmptied = true;
    toasts[0]?.action?.onPress();
    await new Promise((r) => setTimeout(r, 0));

    expect(inserts).toHaveLength(0);
    expect(toasts).toHaveLength(2);
    expect(toasts[1]?.variant).toBe("error");
    expect(toasts[1]?.title).toBe("meals.error.changed");
  });

  test("hat jemand den Platz inzwischen geändert, meldet Rückgängig das als Fehler-Toast", async () => {
    let calls = 0;
    const { deps, toasts } = harness(() => {
      calls += 1;
      return calls === 2 ? Promise.reject(new MealSlotOccupiedError(entry)) : Promise.resolve();
    });
    await swapMeal({ entry, alternative }, deps);
    toasts[0]?.action?.onPress();
    await new Promise((r) => setTimeout(r, 0));

    expect(toasts).toHaveLength(2);
    expect(toasts[1]?.variant).toBe("error");
    expect(toasts[1]?.title).toBe("meals.error.changed");
  });

  test("ein Fehler beim Tausch selbst wird zum Fehler-Toast, ohne Rückgängig", async () => {
    const { deps, toasts } = harness(() =>
      Promise.reject(Object.assign(new Error("rls"), { code: "42501" })),
    );
    await swapMeal({ entry, alternative }, deps);

    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.variant).toBe("error");
    expect(toasts[0]?.title).toBe("meals.error.notAuthenticated");
    expect(toasts[0]?.action).toBeUndefined();
  });
});
