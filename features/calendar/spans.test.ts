import { describe, expect, test } from "bun:test";

import type { CalendarOccurrence } from "./types";

import { toDaySegments } from "./spans";

/**
 * Minimal occurrence — only the fields the span math reads matter. Local times
 * on purpose: the calendar grid works in the user's timezone.
 */
function makeOccurrence(
  startIso: string,
  endIso: string,
  overrides: Partial<CalendarOccurrence> = {},
): CalendarOccurrence {
  const startAt = new Date(startIso);
  return {
    eventId: "evt-1",
    occurrenceDate: startIso.slice(0, 10),
    startAt,
    endAt: new Date(endIso),
    title: "Klassenfahrt",
    description: null,
    location: null,
    allDay: false,
    childId: null,
    parentId: null,
    isException: false,
    isRecurring: false,
    rrule: { freq: null, interval: 1, byweekday: null, count: null, until: null },
    type: {
      slug: "schule",
      color: "#4ECDC4",
      iconName: "book-open",
      labelDe: "Schule",
      labelEn: "School",
    },
    ...overrides,
  };
}

const WINDOW_START = new Date("2026-06-01T00:00:00");
const WINDOW_END = new Date("2026-06-30T23:59:59");

describe("toDaySegments", () => {
  test("a single-day event yields exactly one segment flagged as both ends", () => {
    const occ = makeOccurrence("2026-06-10T09:00:00", "2026-06-10T10:00:00");
    const segments = toDaySegments([occ], WINDOW_START, WINDOW_END);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      date: "2026-06-10",
      index: 0,
      total: 1,
      isStart: true,
      isEnd: true,
    });
    expect(segments[0].occurrence).toBe(occ);
  });

  test("a three-day event yields one segment per covered day", () => {
    const occ = makeOccurrence("2026-06-10T09:00:00", "2026-06-12T14:00:00");
    const segments = toDaySegments([occ], WINDOW_START, WINDOW_END);
    expect(segments.map((s) => s.date)).toEqual(["2026-06-10", "2026-06-11", "2026-06-12"]);
    expect(segments.map((s) => s.index)).toEqual([0, 1, 2]);
    expect(segments.every((s) => s.total === 3)).toBe(true);
    expect(segments.map((s) => s.isStart)).toEqual([true, false, false]);
    expect(segments.map((s) => s.isEnd)).toEqual([false, false, true]);
  });

  test("midnight is exclusive — a 20:00–00:00 event stays on its start day", () => {
    const occ = makeOccurrence("2026-06-10T20:00:00", "2026-06-11T00:00:00");
    const segments = toDaySegments([occ], WINDOW_START, WINDOW_END);
    expect(segments).toHaveLength(1);
    expect(segments[0].date).toBe("2026-06-10");
    expect(segments[0].total).toBe(1);
  });

  test("one minute past midnight does reach the next day", () => {
    const occ = makeOccurrence("2026-06-10T20:00:00", "2026-06-11T00:01:00");
    const segments = toDaySegments([occ], WINDOW_START, WINDOW_END);
    expect(segments.map((s) => s.date)).toEqual(["2026-06-10", "2026-06-11"]);
  });

  test("an all-day multi-day event needs no special case (00:00 to 23:59)", () => {
    const occ = makeOccurrence("2026-06-10T00:00:00", "2026-06-12T23:59:00", { allDay: true });
    const segments = toDaySegments([occ], WINDOW_START, WINDOW_END);
    expect(segments).toHaveLength(3);
    expect(segments[2]).toMatchObject({ date: "2026-06-12", index: 2, total: 3, isEnd: true });
  });

  test("an end at or before the start still yields one segment", () => {
    const occ = makeOccurrence("2026-06-10T09:00:00", "2026-06-10T09:00:00");
    expect(toDaySegments([occ], WINDOW_START, WINDOW_END)).toHaveLength(1);
  });
});

describe("toDaySegments window clipping", () => {
  test("a span reaching in from before the window keeps absolute index and total", () => {
    // 2026-05-25 → 2026-06-03: ten days total, only 06-01…06-03 are visible.
    const occ = makeOccurrence("2026-05-25T09:00:00", "2026-06-03T14:00:00");
    const segments = toDaySegments([occ], WINDOW_START, WINDOW_END);
    expect(segments.map((s) => s.date)).toEqual(["2026-06-01", "2026-06-02", "2026-06-03"]);
    expect(segments.map((s) => s.index)).toEqual([7, 8, 9]);
    expect(segments.every((s) => s.total === 10)).toBe(true);
    // Clipped edge must not claim to be the start of the span.
    expect(segments[0].isStart).toBe(false);
    expect(segments[2].isEnd).toBe(true);
  });

  test("a span running past the window is clipped at the end", () => {
    const occ = makeOccurrence("2026-06-29T09:00:00", "2026-07-05T14:00:00");
    const segments = toDaySegments([occ], WINDOW_START, WINDOW_END);
    expect(segments.map((s) => s.date)).toEqual(["2026-06-29", "2026-06-30"]);
    expect(segments[0].isStart).toBe(true);
    expect(segments[1].isEnd).toBe(false);
    expect(segments[1].total).toBe(7);
  });

  test("an event entirely outside the window yields nothing", () => {
    const occ = makeOccurrence("2026-04-01T09:00:00", "2026-04-03T14:00:00");
    expect(toDaySegments([occ], WINDOW_START, WINDOW_END)).toEqual([]);
  });

  test("a runaway end date does not flood the result", () => {
    const occ = makeOccurrence("2026-06-28T09:00:00", "2099-01-01T14:00:00");
    const segments = toDaySegments([occ], WINDOW_START, WINDOW_END);
    // Only the three visible June days are walked, however absurd `total` gets.
    expect(segments.map((s) => s.date)).toEqual(["2026-06-28", "2026-06-29", "2026-06-30"]);
    expect(segments[0].total).toBeGreaterThan(20_000);
  });
});

describe("toDaySegments across a DST transition", () => {
  test("counts calendar days, not 24-hour blocks", () => {
    // Europe/Berlin springs forward on 2026-03-29 — that day has 23 hours.
    const occ = makeOccurrence("2026-03-28T09:00:00", "2026-03-30T09:00:00");
    const segments = toDaySegments(
      [occ],
      new Date("2026-03-01T00:00:00"),
      new Date("2026-03-31T23:59:59"),
    );
    expect(segments.map((s) => s.date)).toEqual(["2026-03-28", "2026-03-29", "2026-03-30"]);
    expect(segments[0].total).toBe(3);
  });
});
