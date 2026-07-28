import { describe, expect, test } from "bun:test";

import { parseRecurrenceCount, recurrenceToRrule, rruleToRecurrence } from "./createMutation";

describe("recurrenceToRrule", () => {
  test("none → all-null rrule", () => {
    const r = recurrenceToRrule("none", new Date("2026-06-03T16:00:00Z"));
    expect(r.rrule_freq).toBeNull();
    expect(r.rrule_interval).toBe(1);
    expect(r.rrule_byweekday).toBeNull();
  });

  test("daily → freq=daily, no byweekday filter", () => {
    const r = recurrenceToRrule("daily", new Date("2026-06-03T16:00:00Z"));
    expect(r.rrule_freq).toBe("daily");
    expect(r.rrule_byweekday).toBeNull();
  });

  test("weekdays → weekly with Mon–Fri (ISO 1..5)", () => {
    const r = recurrenceToRrule("weekdays", new Date("2026-06-03T16:00:00Z"));
    expect(r.rrule_freq).toBe("weekly");
    expect(r.rrule_byweekday).toEqual([1, 2, 3, 4, 5]);
  });

  test("weekly on a Wednesday (2026-06-03) → byweekday=[3]", () => {
    // 2026-06-03 is a Wednesday.
    const r = recurrenceToRrule("weekly", new Date("2026-06-03T16:00:00Z"));
    expect(r.rrule_freq).toBe("weekly");
    expect(r.rrule_byweekday).toEqual([3]);
  });

  test("weekly on a Sunday → byweekday=[7] (ISO Sunday=7, not 0)", () => {
    // 2026-06-07 is a Sunday.
    const r = recurrenceToRrule("weekly", new Date("2026-06-07T16:00:00Z"));
    expect(r.rrule_byweekday).toEqual([7]);
  });

  test("monthly → freq=monthly, no byweekday", () => {
    const r = recurrenceToRrule("monthly", new Date("2026-06-03T16:00:00Z"));
    expect(r.rrule_freq).toBe("monthly");
    expect(r.rrule_byweekday).toBeNull();
  });
});

// 2026-06-03 is a Wednesday, so a "weekly" rule off this start is byweekday=[3].
const WEDNESDAY = new Date("2026-06-03T16:00:00");

describe("rruleToRecurrence", () => {
  test("round-trips every option the create form can produce", () => {
    for (const opt of ["none", "daily", "weekdays", "weekly", "monthly"] as const) {
      expect(rruleToRecurrence(recurrenceToRrule(opt, WEDNESDAY), WEDNESDAY)).toBe(opt);
    }
  });

  test("a weekly rule without byweekday is the plain weekly option", () => {
    // rrule falls back to dtstart's weekday, which is what "weekly" means here.
    const opt = rruleToRecurrence(
      { rrule_freq: "weekly", rrule_interval: 1, rrule_byweekday: null },
      WEDNESDAY,
    );
    expect(opt).toBe("weekly");
  });

  // Rules the radio has no name for must stay hidden rather than be rewritten
  // into the nearest option on the next save.

  test("interval > 1 is not representable", () => {
    expect(
      rruleToRecurrence(
        { rrule_freq: "weekly", rrule_interval: 2, rrule_byweekday: [3] },
        WEDNESDAY,
      ),
    ).toBeNull();
  });

  test("yearly is not representable", () => {
    expect(
      rruleToRecurrence(
        { rrule_freq: "yearly", rrule_interval: 1, rrule_byweekday: null },
        WEDNESDAY,
      ),
    ).toBeNull();
  });

  test("an arbitrary weekday set is not representable", () => {
    expect(
      rruleToRecurrence(
        { rrule_freq: "weekly", rrule_interval: 1, rrule_byweekday: [2, 4] },
        WEDNESDAY,
      ),
    ).toBeNull();
  });

  test("a weekly rule on a day other than dtstart's is not representable", () => {
    expect(
      rruleToRecurrence(
        { rrule_freq: "weekly", rrule_interval: 1, rrule_byweekday: [1] },
        WEDNESDAY,
      ),
    ).toBeNull();
  });
});

describe("parseRecurrenceCount", () => {
  test("empty means unbounded", () => {
    expect(parseRecurrenceCount("")).toBeNull();
    expect(parseRecurrenceCount("   ")).toBeNull();
  });

  test("positive integers pass through", () => {
    expect(parseRecurrenceCount("10")).toBe(10);
    expect(parseRecurrenceCount(" 1 ")).toBe(1);
  });

  test("zero, negatives and fractions are rejected rather than treated as unbounded", () => {
    expect(parseRecurrenceCount("0")).toBe("invalid");
    expect(parseRecurrenceCount("-3")).toBe("invalid");
    expect(parseRecurrenceCount("2.5")).toBe("invalid");
    expect(parseRecurrenceCount("abc")).toBe("invalid");
  });
});
