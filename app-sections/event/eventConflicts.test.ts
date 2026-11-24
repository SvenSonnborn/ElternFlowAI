import { describe, expect, test } from "bun:test";

import type { CalendarOccurrence } from "@/features/calendar";

import { findConflicts } from "./eventConflicts";

/** 2026-10-01 17:00–18:30 Z, familienweit; die Tests überschreiben nur die Person. */
function occ(over: Partial<CalendarOccurrence> = {}): CalendarOccurrence {
  return {
    eventId: "e1",
    occurrenceKey: "2026-10-01",
    occurrenceDate: "2026-10-01",
    timezone: "Europe/Berlin",
    startAt: new Date("2026-10-01T17:00:00.000Z"),
    endAt: new Date("2026-10-01T18:30:00.000Z"),
    title: "Termin",
    description: null,
    location: null,
    allDay: false,
    childId: null,
    parentId: null,
    isException: false,
    isRecurring: false,
    version: "v1",
    rrule: { freq: null, interval: 1, byweekday: null, count: null, until: null },
    type: { slug: "family", color: "#000", iconName: "calendar", labelDe: "", labelEn: "" },
    ...over,
  };
}

const overlapping = {
  startAt: new Date("2026-10-01T17:30:00.000Z"),
  endAt: new Date("2026-10-01T18:00:00.000Z"),
};
const nobody = { childId: null, parentId: null };
const child = (id: string) => ({ childId: id, parentId: null });

describe("findConflicts", () => {
  test("gleiche Person kollidiert", () => {
    expect(findConflicts([occ({ childId: "c1" })], overlapping, child("c1"))).toHaveLength(1);
  });

  test("familienweit gegen Person und umgekehrt kollidiert", () => {
    expect(findConflicts([occ({ childId: "c1" })], overlapping, nobody)).toHaveLength(1);
    expect(findConflicts([occ()], overlapping, child("c1"))).toHaveLength(1);
  });

  test("andere Person kollidiert nicht", () => {
    expect(findConflicts([occ({ childId: "c2" })], overlapping, child("c1"))).toHaveLength(0);
  });

  test("Kind gegen Elternteil kollidiert nicht", () => {
    expect(findConflicts([occ({ parentId: "p1" })], overlapping, child("c1"))).toHaveLength(0);
  });

  test("schließt genau die eigene Occurrence aus", () => {
    const self = { eventId: "e1", occurrenceKey: "2026-10-01" };
    expect(findConflicts([occ()], overlapping, nobody, self)).toHaveLength(0);
  });

  test("Geschwister-Occurrence derselben Serie kollidiert", () => {
    const self = { eventId: "e1", occurrenceKey: "2026-09-24" };
    expect(findConflicts([occ()], overlapping, nobody, self)).toHaveLength(1);
  });

  test("sich berührende Kanten kollidieren nicht", () => {
    const touching = {
      startAt: new Date("2026-10-01T18:30:00.000Z"),
      endAt: new Date("2026-10-01T19:00:00.000Z"),
    };
    const before = {
      startAt: new Date("2026-10-01T16:00:00.000Z"),
      endAt: new Date("2026-10-01T17:00:00.000Z"),
    };
    expect(findConflicts([occ()], touching, nobody)).toHaveLength(0);
    expect(findConflicts([occ()], before, nobody)).toHaveLength(0);
  });

  test("ganztägig in Europe/Berlin kollidiert mit dem Termin am Abend", () => {
    const allDay = {
      startAt: new Date("2026-09-30T22:00:00.000Z"),
      endAt: new Date("2026-10-01T21:59:00.000Z"),
    };
    expect(findConflicts([occ()], allDay, nobody)).toHaveLength(1);
  });
});
