import { describe, expect, test } from "bun:test";

import { hidesOccurrence, type PendingEventDelete } from "./pendingDeletes";

function pending(partial: Partial<PendingEventDelete> = {}): PendingEventDelete {
  return { eventId: "e1", occurrenceDate: "2026-09-10", scope: "this", ...partial };
}

function occ(occurrenceDate: string, eventId = "e1") {
  return { eventId, occurrenceDate };
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
