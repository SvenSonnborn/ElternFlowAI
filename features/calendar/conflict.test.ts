import { describe, expect, test } from "bun:test";

import type { EventChanges, RecurrenceChanges } from "./recurrence";
import type { CalendarOccurrence, OccurrenceRrule } from "./types";

import { differingEventFields, ruleConflicts } from "./conflict";

const START = new Date("2026-06-15T15:00:00.000Z");
const END = new Date("2026-06-15T16:00:00.000Z");

function theirs(overrides: Partial<CalendarOccurrence> = {}): CalendarOccurrence {
  return {
    eventId: "evt-1",
    occurrenceKey: "2026-06-15",
    occurrenceDate: "2026-06-15",
    timezone: "Europe/Berlin",
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
    expect(differingEventFields(theirs(), mine(), theirs())).toEqual([]);
  });

  test("ein abweichender Titel ohne fremde Änderung ist meine eigene Bearbeitung", () => {
    // base == theirs (unverändert): Niemand sonst hat den Titel angefasst, der
    // Unterschied zu `mine` ist ausschließlich meine eigene Eingabe — unter der
    // Drei-Wege-Regel kein Konflikt (vorher, mit dem zweiwertigen Vergleich,
    // genau der Fehler aus Task 13).
    expect(differingEventFields(theirs(), mine({ title: "Kieferorthopäde" }), theirs())).toEqual(
      [],
    );
  });

  test("abweichende Zeiten ohne fremde Änderung sind meine eigene Bearbeitung", () => {
    // Wie oben, für start_at/end_at: base == theirs, also kein Konflikt, auch
    // wenn mein Formular beide Enden verschiebt.
    expect(
      differingEventFields(
        theirs(),
        mine({
          start_at: "2026-06-15T17:00:00.000Z",
          end_at: "2026-06-15T18:00:00.000Z",
        }),
        theirs(),
      ),
    ).toEqual([]);
  });

  test("Zeitpunkte werden als Zeitpunkt verglichen, nicht als Zeichenkette", () => {
    // `base` weicht bewusst vom Standard-`startAt` ab (12:00Z statt 15:00Z),
    // damit die Basis-Bedingung wahr ist und `sameInstant` tatsächlich
    // ausgewertet wird — mit `base == theirs` (wie zuvor) würde der Kurzschluss
    // vor `mine`-Vergleich schon greifen und der Toleranz-Test liefe leer.
    // Dasselbe Instant, andere Schreibweise — der Server liefert PostgREST-
    // Zeitstempel, das Formular `toISOString()`. Ein Stringvergleich meldete
    // hier eine Abweichung, die keine ist.
    expect(
      differingEventFields(
        theirs(),
        mine({ start_at: "2026-06-15T17:00:00+02:00" }),
        theirs({ startAt: new Date("2026-06-15T12:00:00.000Z") }),
      ),
    ).toEqual([]);
  });

  test("leerer Ort und null gelten als dasselbe", () => {
    // Das Formular schickt `location.trim() || null`; eine fremde Fassung kann
    // "" tragen. Beide heißen „kein Ort".
    expect(
      differingEventFields(theirs({ location: "" }), mine({ location: null }), theirs()),
    ).toEqual([]);
  });

  test("mehrere fremd geänderte Felder kommen in fester Reihenfolge", () => {
    // Zwei echte Konflikte (theirs weicht von base ab, mein Formular trägt
    // noch die alten Werte) — die Liste muss der Prüfreihenfolge im Code
    // folgen (title → start_at → end_at → location → description), nicht der
    // Reihenfolge, in der die Felder geändert wurden.
    const fremd = theirs({ description: "Karte mitnehmen", title: "Neu" });
    expect(differingEventFields(fremd, mine(), theirs())).toEqual(["title", "description"]);
  });
});

describe("differingEventFields — Drei-Wege", () => {
  test("die eigene Änderung ist kein Konflikt", () => {
    // base == theirs: niemand sonst hat den Titel angefasst.
    expect(differingEventFields(theirs(), mine({ title: "Neu" }), theirs())).toEqual([]);
  });

  test("ein fremd geändertes Feld, das ich zurückdrehen würde, ist einer", () => {
    // Ich habe den Ort nicht angefasst — aber mein Formular trägt den alten
    // Wert, und Speichern würde die fremde Änderung verwerfen.
    const fremd = theirs({ location: "Praxis Nord" });
    expect(differingEventFields(fremd, mine(), theirs())).toEqual(["location"]);
  });

  test("beide Seiten haben dasselbe Feld verschieden geändert", () => {
    const fremd = theirs({ title: "Ihre Fassung" });
    expect(differingEventFields(fremd, mine({ title: "Meine Fassung" }), theirs())).toEqual([
      "title",
    ]);
  });

  test("beide Seiten haben dasselbe Feld gleich geändert — kein Konflikt", () => {
    const fremd = theirs({ title: "Gleich" });
    expect(differingEventFields(fremd, mine({ title: "Gleich" }), theirs())).toEqual([]);
  });

  test("meine Änderung und eine fremde an einem anderen Feld: nur das fremde", () => {
    // Der Fall aus Schritt 6 der Zwei-Client-Verifikation.
    const fremd = theirs({ location: "Praxis Nord" });
    expect(differingEventFields(fremd, mine({ title: "Neu" }), theirs())).toEqual(["location"]);
  });

  test("ein fremd verschobener Start ist ein Konflikt", () => {
    // Positive Erkennung für start_at: theirs weicht vom eingefrorenen `base`
    // ab, mein Formular trägt noch den alten Wert.
    const fremd = theirs({ startAt: new Date("2026-06-15T18:00:00.000Z") });
    expect(differingEventFields(fremd, mine(), theirs())).toEqual(["start_at"]);
  });

  test("ein fremd verschobenes Ende ist ein Konflikt", () => {
    // Dasselbe für end_at.
    const fremd = theirs({ endAt: new Date("2026-06-15T19:00:00.000Z") });
    expect(differingEventFields(fremd, mine(), theirs())).toEqual(["end_at"]);
  });
});

describe("differingEventFields — die Regel", () => {
  const WEEKLY: OccurrenceRrule = {
    freq: "weekly",
    interval: 1,
    byweekday: [1],
    count: null,
    until: null,
  };
  const base = () => theirs({ isRecurring: true, rrule: WEEKLY });
  // Die fremde Fassung: B hat die Serie auf zehn Termine begrenzt.
  const fremd = (overrides: Partial<CalendarOccurrence> = {}) =>
    theirs({ isRecurring: true, rrule: { ...WEEKLY, count: 10 }, ...overrides });
  const rule = (overrides: Partial<RecurrenceChanges> = {}): RecurrenceChanges => ({
    rrule_freq: "weekly",
    rrule_interval: 1,
    rrule_byweekday: [1],
    rrule_count: null,
    rrule_until: null,
    ...overrides,
  });

  test("beide ändern die Regel verschieden → Konflikt", () => {
    expect(differingEventFields(fremd(), mine(), base(), rule({ rrule_count: 6 }))).toEqual([
      "recurrence",
    ]);
  });

  test("ich ändere Titel und Regel, die andere Seite nur die Regel → nur die Regel", () => {
    // Das Szenario, in dem der Drei-Wege-Vergleich (ADR-031) die Lücke schärfer
    // gemacht hatte: Meine Titeländerung ist keine fremde, die Liste war leer.
    expect(
      differingEventFields(
        fremd(),
        mine({ title: "Kieferorthopäde" }),
        base(),
        rule({ rrule_freq: "daily", rrule_byweekday: null }),
      ),
    ).toEqual(["recurrence"]);
  });

  test("GRENZWÄCHTER: ich fasse die Regel nicht an → kein Konflikt, auch wenn sie fremd geändert wurde", () => {
    // Ohne Regel im Schreibvorgang stehen die `rrule_*`-Spalten nicht im
    // UPDATE — es gibt nichts zu überschreiben.
    expect(differingEventFields(fremd(), mine(), base(), null)).toEqual([]);
    expect(differingEventFields(fremd(), mine(), base())).toEqual([]);
  });

  test("GRENZWÄCHTER: beide ändern die Regel gleich → kein Konflikt", () => {
    expect(differingEventFields(fremd(), mine(), base(), rule({ rrule_count: 10 }))).toEqual([]);
  });

  test("nur ich ändere die Regel → meine eigene Bearbeitung, kein Konflikt", () => {
    expect(differingEventFields(base(), mine(), base(), rule({ rrule_count: 6 }))).toEqual([]);
  });

  test("die Regel steht in der Liste hinter den fünf Feldern", () => {
    expect(
      differingEventFields(
        fremd({ title: "Fremd" }),
        mine({ title: "Meins" }),
        base(),
        rule({ rrule_count: 6 }),
      ),
    ).toEqual(["title", "recurrence"]);
  });
});

describe("ruleConflicts", () => {
  const WEEKLY: OccurrenceRrule = {
    freq: "weekly",
    interval: 1,
    byweekday: [1],
    count: null,
    until: null,
  };
  const MONTHLY: OccurrenceRrule = {
    freq: "monthly",
    interval: 1,
    byweekday: null,
    count: null,
    until: null,
  };
  const daily: RecurrenceChanges = {
    rrule_freq: "daily",
    rrule_interval: 1,
    rrule_byweekday: null,
    rrule_count: null,
    rrule_until: null,
  };

  test("fremd geändert und meine Regel weicht ab → Konflikt", () => {
    expect(ruleConflicts(MONTHLY, WEEKLY, daily)).toBe(true);
  });

  test("ohne eigene Regel nie ein Konflikt", () => {
    expect(ruleConflicts(MONTHLY, WEEKLY, null)).toBe(false);
    expect(ruleConflicts(MONTHLY, WEEKLY, undefined)).toBe(false);
  });

  test("fremd unverändert → kein Konflikt, auch wenn meine Regel abweicht", () => {
    expect(ruleConflicts(WEEKLY, WEEKLY, daily)).toBe(false);
  });

  test("beide Seiten gleich geändert → kein Konflikt", () => {
    expect(ruleConflicts(MONTHLY, WEEKLY, { ...daily, rrule_freq: "monthly" })).toBe(false);
  });
});
