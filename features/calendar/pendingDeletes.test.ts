import { describe, expect, test } from "bun:test";

import type { CalendarOccurrence } from "./types";

import { hidesOccurrence, withoutPendingDeletes, type PendingEventDelete } from "./pendingDeletes";

function pending(partial: Partial<PendingEventDelete> = {}): PendingEventDelete {
  return { eventId: "e1", occurrenceDate: "2026-09-10", scope: "this", ...partial };
}

function occ(occurrenceDate: string, eventId = "e1"): CalendarOccurrence {
  return {
    eventId,
    occurrenceDate,
    startAt: new Date(occurrenceDate),
    endAt: new Date(occurrenceDate),
    title: "Test",
    description: null,
    location: null,
    allDay: false,
    childId: null,
    parentId: null,
    isException: false,
    isRecurring: false,
    rrule: {
      freq: null,
      interval: 0,
      byweekday: null,
      count: null,
      until: null,
    },
    type: {
      slug: "test",
      color: "#000000",
      iconName: "calendar" as const,
      labelDe: "Test",
      labelEn: "Test",
    },
  };
}

describe("scope 'this'", () => {
  test("verdeckt genau die eine Occurrence", () => {
    expect(hidesOccurrence(pending(), occ("2026-09-10"))).toBe(true);
  });

  test("lässt die Nachbarn derselben Serie stehen", () => {
    expect(hidesOccurrence(pending(), occ("2026-09-09"))).toBe(false);
    expect(hidesOccurrence(pending(), occ("2026-09-11"))).toBe(false);
  });
});

describe("scope 'forward'", () => {
  const p = pending({ scope: "forward" });

  test("verdeckt den Stichtag selbst", () => {
    expect(hidesOccurrence(p, occ("2026-09-10"))).toBe(true);
  });

  test("verdeckt alles danach", () => {
    expect(hidesOccurrence(p, occ("2026-09-11"))).toBe(true);
    expect(hidesOccurrence(p, occ("2026-10-01"))).toBe(true);
    expect(hidesOccurrence(p, occ("2027-01-02"))).toBe(true);
  });

  test("lässt alles davor stehen", () => {
    expect(hidesOccurrence(p, occ("2026-09-09"))).toBe(false);
    expect(hidesOccurrence(p, occ("2026-08-31"))).toBe(false);
    expect(hidesOccurrence(p, occ("2025-12-31"))).toBe(false);
  });
});

describe("scope 'all'", () => {
  const p = pending({ scope: "all" });

  test("verdeckt jede Occurrence des Events", () => {
    expect(hidesOccurrence(p, occ("2020-01-01"))).toBe(true);
    expect(hidesOccurrence(p, occ("2026-09-10"))).toBe(true);
    expect(hidesOccurrence(p, occ("2030-12-31"))).toBe(true);
  });
});

describe("Fremde Events", () => {
  test("kein Scope greift auf ein anderes Event über", () => {
    for (const scope of ["this", "forward", "all"] as const) {
      expect(hidesOccurrence(pending({ scope }), occ("2026-09-10", "e2"))).toBe(false);
    }
  });
});

describe("Einzeltermin", () => {
  test("alle drei Scopes verdecken die eine Occurrence", () => {
    for (const scope of ["this", "forward", "all"] as const) {
      expect(hidesOccurrence(pending({ scope }), occ("2026-09-10"))).toBe(true);
    }
  });
});

describe("withoutPendingDeletes", () => {
  test("bei leerer Liste kommt dieselbe Array-Referenz zurück", () => {
    const input = [occ("2026-09-10"), occ("2026-09-11")];
    const result = withoutPendingDeletes(input, []);
    expect(result).toBe(input);
  });

  test("Scope 'all' entfernt alle Occurrences des Events und lässt fremde stehen", () => {
    const input = [
      occ("2026-09-09"),
      occ("2026-09-10"),
      occ("2026-09-11"),
      occ("2026-09-10", "e2"),
    ];
    const result = withoutPendingDeletes(input, [pending({ scope: "all" })]);
    expect(result).toEqual([occ("2026-09-10", "e2")]);
  });

  test("zwei offene Löschungen wirken beide", () => {
    const input = [occ("2026-09-09"), occ("2026-09-10"), occ("2026-09-11")];
    const p1 = pending({ scope: "this" });
    const p2 = pending({ scope: "forward", occurrenceDate: "2026-09-11" });
    const result = withoutPendingDeletes(input, [p1, p2]);
    expect(result).toEqual([occ("2026-09-09")]);
  });
});
