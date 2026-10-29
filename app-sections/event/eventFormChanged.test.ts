import { describe, expect, test } from "bun:test";

import { eventFormChanged, type EventFormValues } from "./eventFormChanged";

function values(overrides: Partial<EventFormValues> = {}): EventFormValues {
  return {
    title: "Zahnarzt",
    startAt: new Date("2026-10-28T09:00:00.000Z"),
    endAt: new Date("2026-10-28T10:00:00.000Z"),
    allDay: false,
    location: "Praxis",
    notes: "Karte mitnehmen",
    typeId: "type-1",
    memberId: "member-1",
    recurrence: "none",
    countText: "",
    ...overrides,
  };
}

describe("eventFormChanged", () => {
  test("gleiche Werte, Datumsfelder als andere Instanzen, sind keine Änderung", () => {
    const pristine = values();
    const current = values({
      startAt: new Date(pristine.startAt.getTime()),
      endAt: new Date(pristine.endAt.getTime()),
    });
    expect(eventFormChanged(current, pristine)).toBe(false);
  });

  const differing: [string, Partial<EventFormValues>][] = [
    ["title", { title: "Zahnarzt 2" }],
    ["startAt", { startAt: new Date("2026-10-28T09:30:00.000Z") }],
    ["endAt", { endAt: new Date("2026-10-28T10:30:00.000Z") }],
    ["allDay", { allDay: true }],
    ["location", { location: "Anderswo" }],
    ["notes", { notes: "" }],
    ["typeId", { typeId: "type-2" }],
    ["memberId", { memberId: null }],
    ["recurrence", { recurrence: "weekly" }],
  ];

  test.each(differing)("abweichendes Feld %s ist eine Änderung", (_field, override) => {
    expect(eventFormChanged(values(override), values())).toBe(true);
  });

  test("ein Leerzeichen im Titel zählt, Strings sind ungetrimmt", () => {
    expect(eventFormChanged(values({ title: "Zahnarzt " }), values())).toBe(true);
  });

  test("abweichender Zähler bei aktiver Wiederholung ist eine Änderung", () => {
    expect(
      eventFormChanged(
        values({ recurrence: "weekly", countText: "3" }),
        values({ recurrence: "weekly", countText: "" }),
      ),
    ).toBe(true);
  });

  test("verborgener Zähler ohne Wiederholung ist keine Änderung", () => {
    expect(
      eventFormChanged(
        values({ recurrence: "none", countText: "3" }),
        values({ recurrence: "none", countText: "" }),
      ),
    ).toBe(false);
  });
});
