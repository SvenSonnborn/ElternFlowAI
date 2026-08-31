import { describe, expect, test } from "bun:test";

import type { EventChanges } from "./recurrence";
import type { CalendarOccurrence } from "./types";

import { applyOptimisticChanges, patchesOccurrence } from "./optimisticEvents";

function occ(partial: Partial<CalendarOccurrence> = {}): CalendarOccurrence {
  return {
    eventId: "e1",
    occurrenceDate: "2026-09-10",
    startAt: new Date("2026-09-10T16:00:00"),
    endAt: new Date("2026-09-10T17:30:00"),
    title: "Fußballtraining",
    description: "Trikot einpacken",
    location: "Sportplatz",
    allDay: false,
    childId: null,
    parentId: null,
    isException: false,
    isRecurring: true,
    rrule: { freq: "weekly", interval: 1, byweekday: [3], count: null, until: null },
    type: {
      slug: "sport",
      color: "#000",
      iconName: "ball",
      labelDe: "Sport",
      labelEn: "Sport",
    },
    ...partial,
  };
}

function changes(partial: Partial<EventChanges> = {}): EventChanges {
  return {
    title: "Fußballtraining",
    start_at: new Date("2026-09-10T18:00:00").toISOString(),
    end_at: new Date("2026-09-10T19:30:00").toISOString(),
    location: "Sportplatz",
    description: "Trikot einpacken",
    ...partial,
  };
}

describe("patchesOccurrence", () => {
  const entry = { eventId: "e1", occurrenceDate: "2026-09-10", scope: "this" as const };

  test("`this` trifft genau diese Occurrence", () => {
    expect(patchesOccurrence(entry, { eventId: "e1", occurrenceDate: "2026-09-10" })).toBe(true);
    expect(patchesOccurrence(entry, { eventId: "e1", occurrenceDate: "2026-09-17" })).toBe(false);
  });

  test("`forward` schließt den Stichtag ein und lässt alles davor", () => {
    const fwd = { ...entry, scope: "forward" as const };
    expect(patchesOccurrence(fwd, { eventId: "e1", occurrenceDate: "2026-09-10" })).toBe(true);
    expect(patchesOccurrence(fwd, { eventId: "e1", occurrenceDate: "2026-09-17" })).toBe(true);
    expect(patchesOccurrence(fwd, { eventId: "e1", occurrenceDate: "2026-09-03" })).toBe(false);
  });

  test("`all` trifft jede Occurrence des Events", () => {
    const all = { ...entry, scope: "all" as const };
    expect(patchesOccurrence(all, { eventId: "e1", occurrenceDate: "2020-01-01" })).toBe(true);
    expect(patchesOccurrence(all, { eventId: "e1", occurrenceDate: "2030-12-31" })).toBe(true);
  });

  test("kein Scope greift auf ein fremdes Event über", () => {
    for (const scope of ["this", "forward", "all"] as const) {
      expect(
        patchesOccurrence({ ...entry, scope }, { eventId: "e2", occurrenceDate: "2026-09-10" }),
      ).toBe(false);
    }
  });
});

describe("applyOptimisticChanges · Serie mit Scope `all`", () => {
  test("verschiebt die Tageszeit und behält das Datum jeder Occurrence", () => {
    // Die naheliegende Fehlimplementierung schreibt `changes.start_at` stumpf in
    // jede Occurrence — dann zöge sich die ganze Serie auf einen Tag zusammen.
    const later = occ({
      occurrenceDate: "2026-09-17",
      startAt: new Date("2026-09-17T16:00:00"),
      endAt: new Date("2026-09-17T17:30:00"),
    });
    const out = applyOptimisticChanges(later, "all", changes());
    expect(out.occurrenceDate).toBe("2026-09-17");
    expect(out.startAt.getHours()).toBe(18);
    expect(out.startAt.getDate()).toBe(17);
  });

  test("erhält die Dauer", () => {
    const out = applyOptimisticChanges(occ(), "all", changes());
    expect(out.endAt.getTime() - out.startAt.getTime()).toBe(90 * 60 * 1000);
  });

  test("patcht auch die Beschreibung — der Server schreibt sie auf den Master", () => {
    const out = applyOptimisticChanges(occ(), "all", changes({ description: "Neue Notiz" }));
    expect(out.description).toBe("Neue Notiz");
  });
});

describe("applyOptimisticChanges · Serie mit Scope `this`", () => {
  test("übernimmt die Literalzeiten der Exception", () => {
    const out = applyOptimisticChanges(occ(), "this", changes());
    expect(out.startAt.getHours()).toBe(18);
    expect(out.isException).toBe(true);
  });

  test("lässt die Beschreibung stehen, obwohl der Server sie schreibt", () => {
    // `expandEvents` liest `description` immer von der Master-Zeile, auch bei
    // einer `modified`-Exception — `applyOverride` kennt das Feld nicht. Ein
    // Patch, der sie zeigte, nähme der Refetch eine Sekunde später wieder weg:
    // genau das Flackern, das dieses Feature abstellen soll.
    const out = applyOptimisticChanges(
      occ(),
      "this",
      changes({ title: "Neuer Titel", description: "Neue Notiz" }),
    );
    expect(out.title).toBe("Neuer Titel");
    expect(out.description).toBe("Trikot einpacken");
  });
});

describe("applyOptimisticChanges · Einzeltermin", () => {
  const single = occ({
    isRecurring: false,
    rrule: { freq: null, interval: 1, byweekday: null, count: null, until: null },
  });

  test("verschiebt sich auf ein neues Datum, statt auf dem alten zu bleiben", () => {
    // Beim Einzeltermin ändert `scope: "this"` die Master-Zeile; eine
    // Datumsänderung im Formular verschiebt den Termin also wirklich.
    const moved = changes({
      start_at: new Date("2026-09-24T18:00:00").toISOString(),
      end_at: new Date("2026-09-24T19:30:00").toISOString(),
    });
    const out = applyOptimisticChanges(single, "this", moved);
    expect(out.occurrenceDate).toBe("2026-09-24");
    expect(out.startAt.getDate()).toBe(24);
  });

  test("patcht die Beschreibung — es gibt keine Exception", () => {
    const out = applyOptimisticChanges(single, "this", changes({ description: "Neue Notiz" }));
    expect(out.description).toBe("Neue Notiz");
  });
});
