import { describe, expect, test } from "bun:test";

import type { CalendarOccurrence } from "./types";

import { toDayMarkings, toDaySegments } from "./spans";

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
    const zeroLength = makeOccurrence("2026-06-10T09:00:00", "2026-06-10T09:00:00");
    expect(toDaySegments([zeroLength], WINDOW_START, WINDOW_END)).toHaveLength(1);
    // Inverted range — the form rejects it, but bad data must not vanish.
    const inverted = makeOccurrence("2026-06-10T09:00:00", "2026-06-10T08:00:00");
    expect(toDaySegments([inverted], WINDOW_START, WINDOW_END)).toHaveLength(1);
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

describe("toDaySegments counts calendar days", () => {
  test("a 48-hour span over the European DST weekend is still three days", () => {
    // 2026-03-29 is the European spring-forward date, so in a DST-observing
    // zone this window contains a 23-hour day. The assertion holds in every
    // timezone — it is `differenceInCalendarDays` that makes it hold, and a
    // millisecond-division implementation would fail it under Europe/Berlin.
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

describe("toDayMarkings", () => {
  const segmentsFor = (occs: CalendarOccurrence[]) => toDaySegments(occs, WINDOW_START, WINDOW_END);

  test("single-day events become dots, one per type slug", () => {
    const marks = toDayMarkings(
      segmentsFor([
        makeOccurrence("2026-06-10T09:00:00", "2026-06-10T10:00:00", { eventId: "a" }),
        makeOccurrence("2026-06-10T11:00:00", "2026-06-10T12:00:00", { eventId: "b" }),
      ]),
      "2026-06-01",
      "#E8F7F5",
    );
    expect(marks["2026-06-10"].dots).toEqual([{ key: "schule", color: "#4ECDC4" }]);
    expect(marks["2026-06-10"].bars ?? []).toEqual([]);
    expect(marks["2026-06-10"].marked).toBe(true);
  });

  test("a multi-day event becomes a bar on every covered day, rounded at its ends", () => {
    const marks = toDayMarkings(
      segmentsFor([makeOccurrence("2026-06-10T09:00:00", "2026-06-12T14:00:00")]),
      "2026-06-01",
      "#E8F7F5",
    );
    expect(marks["2026-06-10"].bars).toEqual([
      { key: "evt-1-2026-06-10", color: "#4ECDC4", isStart: true, isEnd: false },
    ]);
    expect(marks["2026-06-11"].bars?.[0]).toMatchObject({ isStart: false, isEnd: false });
    expect(marks["2026-06-12"].bars?.[0]).toMatchObject({ isStart: false, isEnd: true });
    expect(marks["2026-06-11"].dots ?? []).toEqual([]);
  });

  test("a span keeps one lane for its whole length", () => {
    // Mint runs 10.–12., blue starts on the 12. and runs on. Blue must stay in
    // lane 1 on the 13. too — a bar that jumps rows mid-span breaks the very
    // continuity the bars exist to show.
    const marks = toDayMarkings(
      segmentsFor([
        makeOccurrence("2026-06-10T09:00:00", "2026-06-12T14:00:00", { eventId: "mint" }),
        makeOccurrence("2026-06-12T09:00:00", "2026-06-14T14:00:00", {
          eventId: "blue",
          type: {
            slug: "family",
            color: "#7DD3FC",
            iconName: "book-open",
            labelDe: "Familie",
            labelEn: "Social",
          },
        }),
      ]),
      "2026-06-01",
      "#E8F7F5",
    );
    const laneOfBlue = (date: string) =>
      (marks[date].bars ?? []).findIndex((b) => b?.key.startsWith("blue"));
    expect(laneOfBlue("2026-06-12")).toBe(1);
    expect(laneOfBlue("2026-06-13")).toBe(1);
    expect(laneOfBlue("2026-06-14")).toBe(1);
    // The freed lane 0 stays as an explicit hole, not a collapsed row.
    expect(marks["2026-06-13"].bars?.[0]).toBeNull();
  });

  test("a span reuses a lane once the earlier span has ended", () => {
    const marks = toDayMarkings(
      segmentsFor([
        makeOccurrence("2026-06-10T09:00:00", "2026-06-11T14:00:00", { eventId: "first" }),
        makeOccurrence("2026-06-13T09:00:00", "2026-06-14T14:00:00", { eventId: "second" }),
      ]),
      "2026-06-01",
      "#E8F7F5",
    );
    expect(marks["2026-06-10"].bars?.[0]?.key).toContain("first");
    expect(marks["2026-06-13"].bars?.[0]?.key).toContain("second");
  });

  test("beyond two bars a span falls back into the dot row instead of vanishing", () => {
    const spans = [1, 2, 3].map((n) =>
      makeOccurrence("2026-06-10T09:00:00", "2026-06-12T14:00:00", {
        eventId: `evt-${n}`,
        type: {
          slug: `slug-${n}`,
          color: `#00000${n}`,
          iconName: "book-open",
          labelDe: "x",
          labelEn: "x",
        },
      }),
    );
    const marks = toDayMarkings(segmentsFor(spans), "2026-06-01", "#E8F7F5");
    expect(marks["2026-06-10"].bars).toHaveLength(2);
    expect(marks["2026-06-10"].dots).toEqual([{ key: "slug-3", color: "#000003" }]);
  });

  test("dots stay capped at three", () => {
    const many = [1, 2, 3, 4].map((n) =>
      makeOccurrence("2026-06-10T09:00:00", "2026-06-10T10:00:00", {
        eventId: `evt-${n}`,
        type: {
          slug: `slug-${n}`,
          color: `#00000${n}`,
          iconName: "book-open",
          labelDe: "x",
          labelEn: "x",
        },
      }),
    );
    expect(
      toDayMarkings(segmentsFor(many), "2026-06-01", "#E8F7F5")["2026-06-10"].dots,
    ).toHaveLength(3);
  });

  test("the selected day is marked even when it holds no events", () => {
    const marks = toDayMarkings([], "2026-06-15", "#E8F7F5");
    expect(marks["2026-06-15"]).toEqual({ selected: true, selectedColor: "#E8F7F5" });
  });

  test("selection is merged onto a day that already has markings", () => {
    const marks = toDayMarkings(
      segmentsFor([makeOccurrence("2026-06-10T09:00:00", "2026-06-10T10:00:00")]),
      "2026-06-10",
      "#E8F7F5",
    );
    expect(marks["2026-06-10"].selected).toBe(true);
    expect(marks["2026-06-10"].dots).toHaveLength(1);
  });
});
