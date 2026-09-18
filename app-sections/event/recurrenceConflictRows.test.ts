import { describe, expect, test } from "bun:test";

import type { RecurrenceChanges } from "@/features/calendar/recurrence";
import type { OccurrenceRrule } from "@/features/calendar/types";

import { recurrenceConflictRows } from "./recurrenceConflictRows";

// Gibt den Key zurück — so prüft der Test, WELCHER Text gewählt wurde, ohne
// von der Übersetzung abzuhängen.
const t = (key: string) => key;

// Montag, 15.06.2026, 17:00 in Berlin — ein wöchentlicher Termin am Montag.
const START = new Date("2026-06-15T15:00:00.000Z");
const ZONE = "Europe/Berlin";

const WEEKLY: OccurrenceRrule = {
  freq: "weekly",
  interval: 1,
  byweekday: [1],
  count: null,
  until: null,
};

function theirs(rrule: Partial<OccurrenceRrule> = {}) {
  return { rrule: { ...WEEKLY, ...rrule }, startAt: START, timezone: ZONE };
}

function mine(recurrence: Partial<RecurrenceChanges> = {}) {
  return {
    recurrence: {
      rrule_freq: "weekly" as const,
      rrule_interval: 1,
      rrule_byweekday: [1],
      rrule_count: null,
      rrule_until: null,
      ...recurrence,
    },
    startAt: START,
    timezone: ZONE,
  };
}

describe("recurrenceConflictRows", () => {
  test("nur die Anzahl weicht ab → nur die Serienende-Zeile", () => {
    expect(recurrenceConflictRows(theirs({ count: 10 }), mine({ rrule_count: 6 }), t)).toEqual([
      {
        label: "cal.create.fieldRecurrenceCount",
        theirs: "conflict.theirs: 10",
        mine: "conflict.mine: 6",
      },
    ]);
  });

  test("nur die Option weicht ab → nur die Options-Zeile", () => {
    expect(
      recurrenceConflictRows(theirs(), mine({ rrule_freq: "daily", rrule_byweekday: null }), t),
    ).toEqual([
      {
        label: "cal.create.fieldRecurrence",
        theirs: "conflict.theirs: cal.recur.weekly",
        mine: "conflict.mine: cal.recur.daily",
      },
    ]);
  });

  test("eine an einem Datum beendete Serie heißt nie „Unbegrenzt“", () => {
    // B hat per „ab hier löschen" ein Enddatum gesetzt, A lässt die Serie offen.
    const rows = recurrenceConflictRows(
      theirs({ until: "2026-09-27T21:59:59.999+00:00" }),
      mine(),
      t,
    );
    expect(rows).toEqual([
      {
        label: "cal.create.fieldRecurrenceCount",
        theirs: "conflict.theirs: —",
        mine: "conflict.mine: cal.create.recurrenceCountUnlimited",
      },
    ]);
  });

  test("kein sichtbarer Unterschied → trotzdem die Options-Zeile", () => {
    // Zwei verschiedene Enddaten: beide zeigen „—", die Option ist gleich. Der
    // Vergleich hat trotzdem einen Konflikt gemeldet — der Dialog darf ihn
    // nicht ohne Zeile zeigen.
    const rows = recurrenceConflictRows(
      theirs({ until: "2026-09-27T21:59:59.999+00:00" }),
      mine({ rrule_until: "2026-10-04T21:59:59.999+00:00" }),
      t,
    );
    expect(rows).toEqual([
      {
        label: "cal.create.fieldRecurrence",
        theirs: "conflict.theirs: cal.recur.weekly",
        mine: "conflict.mine: cal.recur.weekly",
      },
    ]);
  });

  test("eine fremde Regel außerhalb der fünf Optionen erscheint als „—“", () => {
    const rows = recurrenceConflictRows(theirs({ interval: 2 }), mine(), t);
    expect(rows[0]).toEqual({
      label: "cal.create.fieldRecurrence",
      theirs: "conflict.theirs: —",
      mine: "conflict.mine: cal.recur.weekly",
    });
  });

  test("Option und Anzahl weichen beide ab → beide Zeilen, Options-Zeile zuerst", () => {
    const rows = recurrenceConflictRows(
      theirs(),
      mine({ rrule_freq: "daily", rrule_byweekday: null, rrule_count: 6 }),
      t,
    );
    expect(rows).toEqual([
      {
        label: "cal.create.fieldRecurrence",
        theirs: "conflict.theirs: cal.recur.weekly",
        mine: "conflict.mine: cal.recur.daily",
      },
      {
        label: "cal.create.fieldRecurrenceCount",
        theirs: "conflict.theirs: cal.create.recurrenceCountUnlimited",
        mine: "conflict.mine: 6",
      },
    ]);
  });

  test("A hat auf „Keine“ gestellt, B die Serie auf zehn Termine begrenzt → kein „Unbegrenzt“ für einen Einzeltermin", () => {
    // Regressionstest zu Befund 2 (Review-Runde 1): Ein Einzeltermin ("Keine")
    // hat kein Serienende, ist aber auch nicht „unbegrenzt" — das Formular
    // blendet das Anzahl-Feld für „Keine" ohnehin aus.
    const rows = recurrenceConflictRows(
      theirs({ count: 10 }),
      mine({ rrule_freq: null, rrule_byweekday: null }),
      t,
    );
    expect(rows).toEqual([
      {
        label: "cal.create.fieldRecurrence",
        theirs: "conflict.theirs: cal.recur.weekly",
        mine: "conflict.mine: cal.recur.none",
      },
      {
        label: "cal.create.fieldRecurrenceCount",
        theirs: "conflict.theirs: 10",
        mine: "conflict.mine: —",
      },
    ]);
  });

  test("die eigene Seite ist nicht darstellbar → „—“ auf der eigenen Seite", () => {
    const rows = recurrenceConflictRows(theirs(), mine({ rrule_interval: 2 }), t);
    expect(rows).toEqual([
      {
        label: "cal.create.fieldRecurrence",
        theirs: "conflict.theirs: cal.recur.weekly",
        mine: "conflict.mine: —",
      },
    ]);
  });
});
