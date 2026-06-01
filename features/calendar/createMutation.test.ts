import { describe, expect, test } from "bun:test";

import { recurrenceToRrule } from "./createMutation";

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
