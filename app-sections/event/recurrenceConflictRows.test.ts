import { describe, expect, test } from "bun:test";

import type { RecurrenceChanges } from "@/features/calendar/recurrence";
import type { OccurrenceRrule } from "@/features/calendar/types";

import { recurrenceConflictRows, recurrenceRowsWithoutOccurrence } from "./recurrenceConflictRows";

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

describe("recurrenceRowsWithoutOccurrence", () => {
  type ForeignRow = Parameters<typeof recurrenceRowsWithoutOccurrence>[0];

  // Die fremde Zeile: eine Serie, die an einem Montag begann (04.05.2026,
  // 17:00 Berlin). Die bearbeitete Occurrence fehlt in ihr — deshalb gibt es
  // kein `theirs`.
  function foreignRow(overrides: Partial<ForeignRow> = {}): ForeignRow {
    return {
      rrule_freq: "weekly",
      rrule_interval: 1,
      rrule_byweekday: [1],
      rrule_count: null,
      rrule_until: null,
      start_at: "2026-05-04T15:00:00.000Z",
      timezone: ZONE,
      ...overrides,
    };
  }
  const regular = (iso: string) => ({ isException: false, startAt: new Date(iso) });
  const moved = (iso: string) => ({ isException: true, startAt: new Date(iso) });
  const MONDAY = regular("2026-05-04T15:00:00.000Z");
  const daily = { rrule_freq: "daily" as const, rrule_byweekday: null };

  test("die andere Seite stellt auf monatlich → die Options-Zeile, obwohl die Occurrence fehlt", () => {
    expect(
      recurrenceRowsWithoutOccurrence(
        foreignRow({ rrule_freq: "monthly", rrule_byweekday: null }),
        [MONDAY],
        WEEKLY,
        mine(daily),
        t,
      ),
    ).toEqual([
      {
        label: "cal.create.fieldRecurrence",
        theirs: "conflict.theirs: cal.recur.monthly",
        mine: "conflict.mine: cal.recur.daily",
      },
    ]);
  });

  test("die andere Seite begrenzt auf 6, ich auf 10 → die Serienende-Zeile", () => {
    expect(
      recurrenceRowsWithoutOccurrence(
        foreignRow({ rrule_count: 6 }),
        [MONDAY],
        WEEKLY,
        mine({ rrule_count: 10 }),
        t,
      ),
    ).toEqual([
      {
        label: "cal.create.fieldRecurrenceCount",
        theirs: "conflict.theirs: 6",
        mine: "conflict.mine: 10",
      },
    ]);
  });

  test("ein fremder Schnitt gegen meine offene tägliche Serie → beide Zeilen", () => {
    expect(
      recurrenceRowsWithoutOccurrence(
        foreignRow({ rrule_until: "2026-06-14T21:59:59.999+00:00" }),
        [MONDAY],
        WEEKLY,
        mine(daily),
        t,
      ),
    ).toEqual([
      {
        label: "cal.create.fieldRecurrence",
        theirs: "conflict.theirs: cal.recur.weekly",
        mine: "conflict.mine: cal.recur.daily",
      },
      {
        label: "cal.create.fieldRecurrenceCount",
        theirs: "conflict.theirs: —",
        mine: "conflict.mine: cal.create.recurrenceCountUnlimited",
      },
    ]);
  });

  test("ich fasse die Regel nicht an → keine Zeilen", () => {
    expect(
      recurrenceRowsWithoutOccurrence(
        foreignRow({ rrule_freq: "monthly", rrule_byweekday: null }),
        [MONDAY],
        WEEKLY,
        null,
        t,
      ),
    ).toEqual([]);
  });

  test("die andere Seite hat die Regel nicht geändert → keine Zeilen", () => {
    // `theirs` fehlt dann aus einem anderen Grund, etwa außerhalb des Suchfensters.
    expect(recurrenceRowsWithoutOccurrence(foreignRow(), [MONDAY], WEEKLY, mine(daily), t)).toEqual(
      [],
    );
  });

  test("ohne hydrierte Basis → keine Zeilen", () => {
    expect(
      recurrenceRowsWithoutOccurrence(
        foreignRow({ rrule_freq: "monthly", rrule_byweekday: null }),
        [MONDAY],
        null,
        mine(daily),
        t,
      ),
    ).toEqual([]);
  });

  test("der Wochentag hängt an einer erzeugten Occurrence, nicht am Serienanker", () => {
    // „Wöchentlich am Mittwoch" auf einer Serie, die an einem Montag begann:
    // Der Anker bleibt bei einer Regeländerung stehen (ADR-032). Gegen den
    // Montag gelesen, hielte `rruleToRecurrence` die Regel für nicht darstellbar.
    const rows = recurrenceRowsWithoutOccurrence(
      foreignRow({ rrule_byweekday: [3] }),
      [regular("2026-05-06T15:00:00.000Z")],
      WEEKLY,
      mine(daily),
      t,
    );
    expect(rows[0]?.theirs).toBe("conflict.theirs: cal.recur.weekly");
  });

  test("verschobene Exceptions zählen nicht als Anker", () => {
    const rows = recurrenceRowsWithoutOccurrence(
      foreignRow({ rrule_byweekday: [3] }),
      [moved("2026-05-05T15:00:00.000Z"), regular("2026-05-06T15:00:00.000Z")],
      WEEKLY,
      mine(daily),
      t,
    );
    expect(rows[0]?.theirs).toBe("conflict.theirs: cal.recur.weekly");
  });

  test("ohne reguläre Occurrence im Fenster bleibt der Serienanker", () => {
    const rows = recurrenceRowsWithoutOccurrence(
      foreignRow({ rrule_count: 6 }),
      [],
      WEEKLY,
      mine(daily),
      t,
    );
    expect(rows[0]?.theirs).toBe("conflict.theirs: cal.recur.weekly");
  });
});
