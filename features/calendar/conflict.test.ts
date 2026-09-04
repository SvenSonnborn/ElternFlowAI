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
