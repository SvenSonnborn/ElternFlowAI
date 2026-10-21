import { describe, expect, test } from "bun:test";

import type { MealPlanEntryWithRecipe, RecipeRow } from "@/features/meals";
import type { PlanningStep } from "@/features/meals/planningSteps";

import { MealSlotOccupiedError } from "@/features/meals/errors";

import { runPlanning, type PlanningDeps, type PlanningRequest } from "./runPlanning";

function entry(id: string, recipeId: string): MealPlanEntryWithRecipe {
  return { id, recipe_id: recipeId } as MealPlanEntryWithRecipe;
}

const recipe = { id: "r-new" } as RecipeRow;

function request(over: Partial<PlanningRequest> = {}): PlanningRequest {
  return { recipe, date: "2026-10-28", slot: "dinner", allergy: { kind: "ok" }, ...over };
}

interface Harness {
  deps: PlanningDeps;
  log: string[];
  asked: PlanningStep[];
  planCalls: unknown[];
  replaceCalls: unknown[];
}

function harness(opts: {
  answers?: boolean[];
  occupant?: MealPlanEntryWithRecipe | null;
  occupantAfterCommit?: MealPlanEntryWithRecipe | null;
  planErrors?: Error[];
}): Harness {
  const log: string[] = [];
  const asked: PlanningStep[] = [];
  const planCalls: unknown[] = [];
  const replaceCalls: unknown[] = [];
  const answers = [...(opts.answers ?? [])];
  const errors = [...(opts.planErrors ?? [])];
  let committed = false;
  const deps: PlanningDeps = {
    confirm: (step) => {
      asked.push(step);
      return Promise.resolve(answers.length > 0 ? (answers.shift() as boolean) : true);
    },
    commitPendingDelete: () => {
      log.push("commit");
      committed = true;
      return Promise.resolve();
    },
    getOccupant: () => {
      log.push("occupant");
      if (committed && opts.occupantAfterCommit !== undefined) return opts.occupantAfterCommit;
      return opts.occupant ?? null;
    },
    plan: (vars) => {
      planCalls.push(vars);
      const err = errors.shift();
      return err ? Promise.reject(err) : Promise.resolve();
    },
    replace: (vars) => {
      replaceCalls.push(vars);
      return Promise.resolve();
    },
  };
  return { deps, log, asked, planCalls, replaceCalls };
}

describe("runPlanning", () => {
  test("Nein beim Allergie-Hinweis schreibt nichts", async () => {
    const h = harness({ answers: [false] });
    const result = await runPlanning(
      request({ allergy: { kind: "hits", status: "unsafe", keys: ["milk"] } }),
      h.deps,
    );
    expect(result).toBe("cancelled");
    expect(h.planCalls).toHaveLength(0);
    expect(h.replaceCalls).toHaveLength(0);
  });

  test("freier Platz plant direkt", async () => {
    const h = harness({});
    expect(await runPlanning(request(), h.deps)).toBe("planned");
    expect(h.asked).toHaveLength(0);
    expect(h.planCalls).toEqual([{ date: "2026-10-28", slot: "dinner", recipe }]);
  });

  test("bestätigtes Ersetzen nutzt Id und gesehene recipe_id des Belegers", async () => {
    const occ = entry("e-1", "r-old");
    const h = harness({ occupant: occ });
    expect(await runPlanning(request(), h.deps)).toBe("planned");
    expect(h.replaceCalls).toEqual([
      { entryId: "e-1", seenRecipeId: "r-old", date: "2026-10-28", slot: "dinner", recipe },
    ]);
    expect(h.planCalls).toHaveLength(0);
  });

  test("Nein beim Ersetzen bricht ab", async () => {
    const h = harness({ occupant: entry("e-1", "r-old"), answers: [false] });
    expect(await runPlanning(request(), h.deps)).toBe("cancelled");
    expect(h.replaceCalls).toHaveLength(0);
  });

  test("Rennen: plan wirft Occupied, Dialog mit dem frischen Eintrag, dann Ersetzen", async () => {
    const x = entry("e-x", "r-x");
    const h = harness({ planErrors: [new MealSlotOccupiedError(x)] });
    expect(await runPlanning(request(), h.deps)).toBe("planned");
    expect(h.asked).toEqual([{ kind: "confirmReplace", current: x }]);
    expect(h.replaceCalls).toEqual([
      { entryId: "e-x", seenRecipeId: "r-x", date: "2026-10-28", slot: "dinner", recipe },
    ]);
  });

  test("Nein im Rennen-Dialog bricht ab", async () => {
    const h = harness({
      planErrors: [new MealSlotOccupiedError(entry("e-x", "r-x"))],
      answers: [false],
    });
    expect(await runPlanning(request(), h.deps)).toBe("cancelled");
    expect(h.replaceCalls).toHaveLength(0);
  });

  test("offene Löschung wird vor dem Lesen des Platzes abgeschlossen", async () => {
    const h = harness({ occupant: entry("e-gone", "r-gone"), occupantAfterCommit: null });
    expect(await runPlanning(request(), h.deps)).toBe("planned");
    expect(h.log).toEqual(["commit", "occupant"]);
    expect(h.asked).toHaveLength(0);
    expect(h.planCalls).toHaveLength(1);
  });

  test("vier Occupied-Fehler hintereinander: nach drei Runden wird der Fehler geworfen", async () => {
    const errs = [1, 2, 3, 4].map((n) => new MealSlotOccupiedError(entry(`e-${n}`, `r-${n}`)));
    const h = harness({ planErrors: errs });
    // replace schlägt in dieser Fake-Reihe nicht fehl; der Fehler kommt aus plan,
    // deshalb lässt der Test replace ebenfalls Occupied werfen.
    let replaceRuns = 0;
    h.deps.replace = () => {
      replaceRuns += 1;
      return Promise.reject(errs[replaceRuns]);
    };
    const thrown = await runPlanning(request(), h.deps).catch((err: unknown) => err);
    expect(thrown).toBeInstanceOf(MealSlotOccupiedError);
    expect(replaceRuns).toBe(2);
  });

  test("replaceTarget ersetzt ohne Ersetzen-Frage", async () => {
    const h = harness({ occupant: entry("e-1", "r-old") });
    const result = await runPlanning(
      request({ replaceTarget: { entryId: "e-1", seenRecipeId: "r-old" } }),
      h.deps,
    );
    expect(result).toBe("planned");
    expect(h.asked).toHaveLength(0);
    expect(h.replaceCalls).toEqual([
      { entryId: "e-1", seenRecipeId: "r-old", date: "2026-10-28", slot: "dinner", recipe },
    ]);
  });

  test("replaceTarget mit Allergie-Treffer: Nein schreibt nichts", async () => {
    const h = harness({ occupant: entry("e-1", "r-old"), answers: [false] });
    const result = await runPlanning(
      request({
        allergy: { kind: "hits", status: "unsafe", keys: ["milk"] },
        replaceTarget: { entryId: "e-1", seenRecipeId: "r-old" },
      }),
      h.deps,
    );
    expect(result).toBe("cancelled");
    expect(h.asked).toEqual([{ kind: "confirmAllergy", status: "unsafe", keys: ["milk"] }]);
    expect(h.planCalls).toHaveLength(0);
    expect(h.replaceCalls).toHaveLength(0);
  });

  test("replaceTarget mit Allergie-Treffer: Ja ersetzt ohne Ersetzen-Frage", async () => {
    const h = harness({ occupant: entry("e-1", "r-old"), answers: [true] });
    const result = await runPlanning(
      request({
        allergy: { kind: "hits", status: "caution", keys: ["milk"] },
        replaceTarget: { entryId: "e-1", seenRecipeId: "r-old" },
      }),
      h.deps,
    );
    expect(result).toBe("planned");
    expect(h.asked).toEqual([{ kind: "confirmAllergy", status: "caution", keys: ["milk"] }]);
    expect(h.replaceCalls).toEqual([
      { entryId: "e-1", seenRecipeId: "r-old", date: "2026-10-28", slot: "dinner", recipe },
    ]);
    expect(h.planCalls).toHaveLength(0);
  });

  test("andere Fehler werden weitergeworfen", async () => {
    const h = harness({ planErrors: [new Error("netz")] });
    const thrown = await runPlanning(request(), h.deps).catch((err: unknown) => err);
    expect((thrown as Error).message).toBe("netz");
  });
});
