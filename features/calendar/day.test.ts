import type { TFunction } from "i18next";

import { describe, expect, test } from "bun:test";

import type { CalendarOccurrence } from "./types";

import { segmentsForDay, segmentTimeLabel } from "./day";
import { toDaySegments } from "./spans";

/** Echoes key and params so a test can assert which branch was taken. */
const t = ((key: string, params?: Record<string, unknown>) =>
  params ? `${key}(${JSON.stringify(params)})` : key) as unknown as TFunction;

function makeOccurrence(
  startIso: string,
  endIso: string,
  overrides: Partial<CalendarOccurrence> = {},
): CalendarOccurrence {
  return {
    eventId: `evt-${startIso}`,
    occurrenceDate: startIso.slice(0, 10),
    startAt: new Date(startIso),
    endAt: new Date(endIso),
    title: "Termin",
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

function segmentsOf(...occurrences: CalendarOccurrence[]) {
  return toDaySegments(occurrences, WINDOW_START, WINDOW_END);
}

describe("segmentsForDay", () => {
  test("keeps only the segments painting on the requested day", () => {
    const segments = segmentsOf(
      makeOccurrence("2026-06-10T09:00:00", "2026-06-10T10:00:00"),
      makeOccurrence("2026-06-11T09:00:00", "2026-06-11T10:00:00"),
    );

    const result = segmentsForDay(segments, "2026-06-10");

    expect(result).toHaveLength(1);
    expect(result[0]?.date).toBe("2026-06-10");
  });

  test("a multi-day event shows up on its middle day too", () => {
    const segments = segmentsOf(makeOccurrence("2026-06-09T09:00:00", "2026-06-11T14:00:00"));

    const result = segmentsForDay(segments, "2026-06-10");

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ isStart: false, isEnd: false, index: 1, total: 3 });
  });

  test("sorts timed appointments by start time", () => {
    const segments = segmentsOf(
      makeOccurrence("2026-06-10T14:00:00", "2026-06-10T15:00:00", { title: "Arzt" }),
      makeOccurrence("2026-06-10T08:00:00", "2026-06-10T09:00:00", { title: "Schule" }),
    );

    const result = segmentsForDay(segments, "2026-06-10");

    expect(result.map((s) => s.occurrence.title)).toEqual(["Schule", "Arzt"]);
  });

  test("puts an all-day event above the day's timed appointments", () => {
    const segments = segmentsOf(
      makeOccurrence("2026-06-10T08:00:00", "2026-06-10T09:00:00", { title: "Schule" }),
      makeOccurrence("2026-06-10T00:00:00", "2026-06-10T23:59:00", {
        title: "Ferien",
        allDay: true,
      }),
    );

    const result = segmentsForDay(segments, "2026-06-10");

    expect(result.map((s) => s.occurrence.title)).toEqual(["Ferien", "Schule"]);
  });

  test("puts a continuation day above the day's timed appointments", () => {
    // Its 09:00 start lies two days back — sorting it by that time would drop
    // it below an 08:00 appointment that actually happens today.
    const segments = segmentsOf(
      makeOccurrence("2026-06-10T08:00:00", "2026-06-10T09:00:00", { title: "Schule" }),
      makeOccurrence("2026-06-09T09:00:00", "2026-06-11T14:00:00", { title: "Klassenfahrt" }),
    );

    const result = segmentsForDay(segments, "2026-06-10");

    expect(result.map((s) => s.occurrence.title)).toEqual(["Klassenfahrt", "Schule"]);
  });

  test("returns an empty list for a day nothing covers", () => {
    const segments = segmentsOf(makeOccurrence("2026-06-10T09:00:00", "2026-06-10T10:00:00"));

    expect(segmentsForDay(segments, "2026-06-12")).toEqual([]);
  });

  test("leaves the caller's array untouched", () => {
    // Consumers hand in a memoized array; sorting it in place would reorder
    // the month grid behind their backs.
    const segments = segmentsOf(
      makeOccurrence("2026-06-10T14:00:00", "2026-06-10T15:00:00", { title: "Arzt" }),
      makeOccurrence("2026-06-10T08:00:00", "2026-06-10T09:00:00", { title: "Schule" }),
    );
    const before = segments.map((s) => s.occurrence.title);

    segmentsForDay(segments, "2026-06-10");

    expect(segments.map((s) => s.occurrence.title)).toEqual(before);
  });
});

describe("segmentTimeLabel", () => {
  test("a single-day appointment reads as its bare start time", () => {
    const [segment] = segmentsOf(makeOccurrence("2026-06-10T09:05:00", "2026-06-10T10:00:00"));

    expect(segmentTimeLabel(segment, t)).toBe("09:05");
  });

  test("an all-day event reads as all-day", () => {
    const [segment] = segmentsOf(
      makeOccurrence("2026-06-10T00:00:00", "2026-06-10T23:59:00", { allDay: true }),
    );

    expect(segmentTimeLabel(segment, t)).toBe("cal.span.allDay");
  });

  test("all-day wins over the span labels on a multi-day event", () => {
    const segments = segmentsOf(
      makeOccurrence("2026-06-09T00:00:00", "2026-06-11T23:59:00", { allDay: true }),
    );

    expect(segments.map((s) => segmentTimeLabel(s, t))).toEqual([
      "cal.span.allDay",
      "cal.span.allDay",
      "cal.span.allDay",
    ]);
  });

  test("a span reads from / through / until across its days", () => {
    const segments = segmentsOf(makeOccurrence("2026-06-09T09:00:00", "2026-06-11T14:00:00"));

    expect(segments.map((s) => segmentTimeLabel(s, t))).toEqual([
      'cal.span.from({"time":"09:00"})',
      "cal.span.through",
      'cal.span.until({"time":"14:00"})',
    ]);
  });
});
