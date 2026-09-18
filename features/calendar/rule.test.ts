import { describe, expect, test } from "bun:test";

import type { OccurrenceRrule } from "./types";

import { ruleOf, sameRule } from "./rule";

const WEEKLY: OccurrenceRrule = {
  freq: "weekly",
  interval: 1,
  byweekday: [1],
  count: null,
  until: null,
};

function rule(overrides: Partial<OccurrenceRrule> = {}): OccurrenceRrule {
  return { ...WEEKLY, ...overrides };
}

describe("sameRule", () => {
  test("identische Regeln sind gleich", () => {
    expect(sameRule(rule(), rule())).toBe(true);
  });

  test("jedes der fünf Felder macht für sich einen Unterschied", () => {
    expect(sameRule(rule(), rule({ freq: "daily" }))).toBe(false);
    expect(sameRule(rule(), rule({ interval: 2 }))).toBe(false);
    expect(sameRule(rule(), rule({ byweekday: [3] }))).toBe(false);
    expect(sameRule(rule(), rule({ count: 10 }))).toBe(false);
    expect(sameRule(rule(), rule({ until: "2026-09-27T21:59:59.999Z" }))).toBe(false);
  });

  test("Wochentage vergleichen als Menge, nicht als Liste", () => {
    expect(sameRule(rule({ byweekday: [1, 3, 5] }), rule({ byweekday: [5, 1, 3] }))).toBe(true);
  });

  test("null und eine leere Liste bedeuten beide: keine Wochentage", () => {
    expect(sameRule(rule({ byweekday: null }), rule({ byweekday: [] }))).toBe(true);
  });

  test("das Serienende vergleicht als Zeitpunkt, nicht als Zeichenkette", () => {
    // PostgREST liefert `…+00:00`, `toISOString()` schreibt `…Z`.
    expect(
      sameRule(
        rule({ until: "2026-09-27T21:59:59.999+00:00" }),
        rule({ until: "2026-09-27T21:59:59.999Z" }),
      ),
    ).toBe(true);
  });

  test("ein fehlendes Serienende gegen ein gesetztes ist ein Unterschied", () => {
    expect(sameRule(rule({ until: null }), rule({ until: "2026-09-27T21:59:59.999Z" }))).toBe(
      false,
    );
    expect(sameRule(rule({ until: null }), rule({ until: null }))).toBe(true);
  });
});

describe("ruleOf", () => {
  test("bildet die fünf rrule-Spalten auf die Form von occ.rrule ab", () => {
    expect(
      ruleOf({
        rrule_freq: "monthly",
        rrule_interval: 1,
        rrule_byweekday: null,
        rrule_count: 6,
        rrule_until: null,
      }),
    ).toEqual({ freq: "monthly", interval: 1, byweekday: null, count: 6, until: null });
  });
});
