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
