import { describe, expect, test } from "bun:test";

import type { EventChanges } from "./recurrence";
import type { CalendarOccurrence } from "./types";

import { differingEventFields } from "./conflict";

const START = new Date("2026-06-15T15:00:00.000Z");
const END = new Date("2026-06-15T16:00:00.000Z");

function theirs(overrides: Partial<CalendarOccurrence> = {}): CalendarOccurrence {
  return {
    eventId: "evt-1",
    occurrenceDate: "2026-06-15",
    startAt: START,
    endAt: END,
    title: "Zahnarzt",
    description: null,
    location: "Praxis Dr. Weiß",
    allDay: false,
    childId: null,
    parentId: null,
    isException: false,
    isRecurring: false,
    version: "v1|-",
    rrule: { freq: null, interval: 1, byweekday: null, count: null, until: null },
    type: { slug: "arzt", color: "#000", iconName: "calendar", labelDe: "Arzt", labelEn: "Doctor" },
    ...overrides,
  };
}

function mine(overrides: Partial<EventChanges> = {}): EventChanges {
  return {
    title: "Zahnarzt",
    start_at: START.toISOString(),
    end_at: END.toISOString(),
    location: "Praxis Dr. Weiß",
    description: null,
    ...overrides,
  };
}

describe("differingEventFields", () => {
  test("identische Fassungen ergeben keine Abweichung", () => {
    expect(differingEventFields(theirs(), mine())).toEqual([]);
  });

  test("ein abweichender Titel", () => {
    expect(differingEventFields(theirs(), mine({ title: "Kieferorthopäde" }))).toEqual(["title"]);
  });

  test("abweichende Zeiten, beide Enden", () => {
    expect(
      differingEventFields(
        theirs(),
        mine({
          start_at: "2026-06-15T17:00:00.000Z",
          end_at: "2026-06-15T18:00:00.000Z",
        }),
      ),
    ).toEqual(["start_at", "end_at"]);
  });

  test("Zeitpunkte werden als Zeitpunkt verglichen, nicht als Zeichenkette", () => {
    // Dasselbe Instant, andere Schreibweise — der Server liefert PostgREST-
    // Zeitstempel, das Formular `toISOString()`. Ein Stringvergleich meldete
    // hier eine Abweichung, die keine ist.
    expect(differingEventFields(theirs(), mine({ start_at: "2026-06-15T17:00:00+02:00" }))).toEqual(
      [],
    );
  });

  test("leerer Ort und null gelten als dasselbe", () => {
    // Das Formular schickt `location.trim() || null`; eine fremde Fassung kann
    // "" tragen. Beide heißen „kein Ort".
    expect(differingEventFields(theirs({ location: "" }), mine({ location: null }))).toEqual([]);
  });

  test("mehrere Abweichungen kommen in fester Reihenfolge", () => {
    expect(
      differingEventFields(theirs(), mine({ description: "Karte mitnehmen", title: "Neu" })),
    ).toEqual(["title", "description"]);
  });
});
