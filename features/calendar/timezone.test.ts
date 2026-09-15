import { describe, expect, test } from "bun:test";

import {
  floatingToInstant,
  instantToFloating,
  mergeDateAndTimeOfDay,
  zonedDateKey,
  zonedDayBounds,
  zoneOffsetMs,
} from "./timezone";

const BERLIN = "Europe/Berlin";

/** Eine Wandzeit als „floating" Date — die Komponenten stehen in UTC. */
function wall(iso: string): Date {
  return new Date(`${iso}Z`);
}

describe("zoneOffsetMs", () => {
  test("Sommerzeit sind zwei Stunden, Winterzeit eine", () => {
    expect(zoneOffsetMs(new Date("2026-07-01T00:00:00.000Z"), BERLIN)).toBe(2 * 3600_000);
    expect(zoneOffsetMs(new Date("2026-01-01T00:00:00.000Z"), BERLIN)).toBe(1 * 3600_000);
  });

  test("UTC hat keinen Offset", () => {
    expect(zoneOffsetMs(new Date("2026-07-01T00:00:00.000Z"), "UTC")).toBe(0);
  });

  test("Millisekunden des Instants verfälschen den Offset nicht", () => {
    // `formatToParts` kennt keine Millisekunden; ohne Sekunden-Trunkierung
    // käme hier ein um 123 ms verschobener Offset heraus.
    expect(zoneOffsetMs(new Date("2026-07-01T00:00:00.123Z"), BERLIN)).toBe(2 * 3600_000);
  });
});

describe("instantToFloating", () => {
  test("trägt die Wandzeit in die UTC-Komponenten", () => {
    const floating = instantToFloating(new Date("2026-07-01T10:00:00.000Z"), BERLIN);
    expect(floating.toISOString()).toBe("2026-07-01T12:00:00.000Z");
  });

  test("erhält die Millisekunden", () => {
    const floating = instantToFloating(new Date("2026-07-01T10:00:00.250Z"), BERLIN);
    expect(floating.toISOString()).toBe("2026-07-01T12:00:00.250Z");
  });
});

describe("floatingToInstant", () => {
  test("Rundlauf: instant → floating → instant", () => {
    for (const iso of [
      "2026-01-15T08:30:00.000Z",
      "2026-07-15T08:30:00.000Z",
      "2026-10-25T00:30:00.000Z",
    ]) {
      const instant = new Date(iso);
      expect(floatingToInstant(instantToFloating(instant, BERLIN), BERLIN).toISOString()).toBe(iso);
    }
  });

  test("Sprung-Lücke: 29.03. 02:30 existiert nicht → 03:30", () => {
    // Die Uhr springt von 02:00 auf 03:00. Gewählt wird der spätere Zeitpunkt,
    // dieselbe Richtung, die `new Date(y, m, d, 2, 30)` lokal nimmt.
    const instant = floatingToInstant(wall("2026-03-29T02:30:00"), BERLIN);
    expect(instant.toISOString()).toBe("2026-03-29T01:30:00.000Z");
    expect(instantToFloating(instant, BERLIN).toISOString()).toBe("2026-03-29T03:30:00.000Z");
  });

  test("Umstellungswochenende, aber außerhalb der Sprung-Lücke: 29.03. 09:00 (valid.length === 1)", () => {
    // Der eigentliche Normalfall am Umstellungswochenende: Die ±26h-Sonde
    // spannt über den Sprung (01:00 UTC), offsetBefore/offsetAfter weichen
    // also voneinander ab und der Code betritt den Kandidaten-Zweig — aber nur
    // *einer* der beiden Kandidaten rundet auf dieselbe Wandzeit zurück, weil
    // 09:00 selbst nicht in der Lücke liegt. Genau dieser `valid.length === 1`-
    // Zweig war vor diesem Test unbelegt, obwohl er jeden Termin am
    // Umstellungssonntag außerhalb 02:00–03:00 trifft (nachgemessen, Befund 3
    // des Task-6-Reviews).
    expect(floatingToInstant(wall("2026-03-29T09:00:00"), BERLIN).toISOString()).toBe(
      "2026-03-29T07:00:00.000Z",
    );
  });

  test("doppelte Stunde: 25.10. 02:30 gibt es zweimal → der erste zählt", () => {
    // 00:30Z ist noch Sommerzeit (+2), 01:30Z schon Winterzeit (+1). Genommen
    // wird der frühere: ein Termin, der vor der Umstellung angelegt wurde, war
    // in deren Regime gemeint.
    expect(floatingToInstant(wall("2026-10-25T02:30:00"), BERLIN).toISOString()).toBe(
      "2026-10-25T00:30:00.000Z",
    );
  });

  test("Umstellungswochenende, aber außerhalb der doppelten Stunde: 24.10. 18:00 (valid.length === 1)", () => {
    // Derselbe Zweig wie beim März-Test oben, hier für die Oktober-Richtung:
    // Samstagabend vor der Umstellung liegt außerhalb 02:00–03:00, die
    // ±26h-Sonde reicht aber schon über den Umstellungsinstant (25.10., 01:00
    // UTC) hinaus, also weichen die Offsets ab und nur ein Kandidat ist gültig.
    expect(floatingToInstant(wall("2026-10-24T18:00:00"), BERLIN).toISOString()).toBe(
      "2026-10-24T16:00:00.000Z",
    );
  });

  test("außerhalb jeder Umstellung ist es die schlichte Umkehrung", () => {
    expect(floatingToInstant(wall("2026-07-01T12:00:00"), BERLIN).toISOString()).toBe(
      "2026-07-01T10:00:00.000Z",
    );
  });
});

describe("zoneOffsetMs mit unbekannter Zone (Befund D)", () => {
  test("eine zur Laufzeit unbekannte Zone liefert den UTC-Offset statt zu werfen", () => {
    // "Foo/Bar" besteht den rein syntaktischen IANA-Regex-Constraint in
    // supabase/migrations/20260909131523_events_timezone_iana_widen.sql
    // (gemessen), ist aber keine `Intl`-bekannte Zone — `new
    // Intl.DateTimeFormat({ timeZone: "Foo/Bar" })` wirft einen `RangeError`.
    // Ohne Fallback reißt das den gesamten `expandEvents`-Aufruf mit sich statt
    // nur den einen kaputten Termin.
    expect(zoneOffsetMs(new Date("2026-07-01T00:00:00.000Z"), "Foo/Bar")).toBe(0);
  });

  test("die verworfene Zone wird gecacht — ein zweiter Aufruf wirft ebenfalls nicht", () => {
    expect(zoneOffsetMs(new Date("2026-01-01T00:00:00.000Z"), "Foo/Bar")).toBe(0);
  });
});

describe("mergeDateAndTimeOfDay", () => {
  test("nimmt das Datum von `day`, die Uhrzeit von `time` — in der Zone, nicht lokal", () => {
    // 09:15 Europe/Berlin (CET, +1h) am 01.02., 20:45 Europe/Berlin (CEST, +2h)
    // am 01.08. — zwei verschiedene Offsets, damit ein Rückfall auf lokale
    // Getter (statt Floating-Raum) hier auffiele.
    const day = new Date("2026-02-01T08:15:00.000Z");
    const time = new Date("2026-08-01T18:45:00.000Z");
    const merged = mergeDateAndTimeOfDay(day, time, "Europe/Berlin");
    // Datum vom 01.02. (CET) + Uhrzeit 20:45 Berlin ⇒ 19:45 UTC.
    expect(merged.toISOString()).toBe("2026-02-01T19:45:00.000Z");
  });

  test("bindet Datum und Uhrzeit an dieselbe Zone, auch über eine Zeitumstellung hinweg", () => {
    // Dieselbe Konstellation wie der Task-4-Fund: `day` liegt vor Berlins
    // Herbst-Zeitumstellung (CEST), `time` danach (CET). Ohne den
    // Floating-Merge läse eine Runner-Zone ungleich Berlin hier einen
    // anderen Offset für `day` als für `time` und verschöbe das Ergebnis um
    // eine Stunde — nachgestellt in `recurrence.test.ts` und
    // `optimisticEvents.test.ts` (ADR-034).
    const day = new Date("2026-10-06T16:00:00.000Z"); // 18:00 Europe/Berlin, CEST
    const time = new Date("2026-10-27T17:00:00.000Z"); // 18:00 Europe/Berlin, CET
    const merged = mergeDateAndTimeOfDay(day, time, "Europe/Berlin");
    expect(merged.toISOString()).toBe("2026-10-06T16:00:00.000Z");
  });
});

describe("zonedDateKey", () => {
  test("nimmt das Datum der Zone, nicht das des Lesers", () => {
    // 2026-06-02T22:30Z ist in Berlin bereits der 3. Juni (00:30 MESZ),
    // in New York noch der 2. (18:30 EDT).
    const instant = new Date("2026-06-02T22:30:00.000Z");
    expect(zonedDateKey(instant, "Europe/Berlin")).toBe("2026-06-03");
    expect(zonedDateKey(instant, "America/New_York")).toBe("2026-06-02");
    expect(zonedDateKey(instant, "UTC")).toBe("2026-06-02");
  });

  test("die Umstellung verschiebt den Schlüssel nicht", () => {
    // 25.10.2026, 00:30Z — Berlin steht auf 02:30 MESZ, der Tag ist derselbe.
    expect(zonedDateKey(new Date("2026-10-25T00:30:00.000Z"), "Europe/Berlin")).toBe("2026-10-25");
  });

  test("über die Datumsgrenze hinweg", () => {
    const silvester = new Date("2026-12-31T23:00:00.000Z");
    expect(zonedDateKey(silvester, "Europe/Berlin")).toBe("2027-01-01");
    expect(zonedDateKey(silvester, "America/New_York")).toBe("2026-12-31");
  });
});

describe("zonedDayBounds", () => {
  test("die Grenzen entstehen in der übergebenen Zone, nicht in der des Lesers", () => {
    const bounds = zonedDayBounds("2026-06-15", BERLIN);
    // 00:00 Berlin am 15.06. (CEST, +2 h) = 22:00Z am 14.06.
    expect(bounds?.start.toISOString()).toBe("2026-06-14T22:00:00.000Z");
    // 23:59:59.999 Berlin am 15.06. = 21:59:59.999Z am 15.06.
    expect(bounds?.end.toISOString()).toBe("2026-06-15T21:59:59.999Z");
  });

  test("an einem Tag ohne lokale Mitternacht beginnt der Tag um 01:00, nicht am Vortag um 23:00", () => {
    // `America/Santiago` stellt am 2026-09-06 um 00:00 vor — die Stunde
    // existiert dort nicht (nachgemessen; `America/Havana` 2026-03-08 und
    // `Asia/Beirut` 2026-03-29 verhalten sich gleich). `floatingToInstant`
    // nimmt in der Lücke den SPÄTEREN Zeitpunkt, also 01:00 desselben Tages.
    // Die Gegenregel („früherer gewinnt") ergäbe 23:00 des VORTAGES — die
    // Tagesgrenze läge dann einen ganzen Tag daneben, und genau das prüft die
    // zweite Assertion.
    const bounds = zonedDayBounds("2026-09-06", "America/Santiago");
    expect(bounds?.start.toISOString()).toBe("2026-09-06T04:00:00.000Z");
    expect(zonedDateKey(bounds!.start, "America/Santiago")).toBe("2026-09-06");
  });

  test("ein formwidriger Schlüssel ergibt null, damit der Aufrufer entscheidet", () => {
    // Kein Wurf und kein Ratewert: `eventLookupWindow` fällt auf sein
    // Standardfenster zurück, `endOfDayInstant` wirft — die Entscheidung
    // gehört den Aufrufern, nicht dieser Funktion.
    expect(zonedDayBounds("kaputt", BERLIN)).toBeNull();
    expect(zonedDayBounds("2026-6-1", BERLIN)).toBeNull();
    expect(zonedDayBounds("", BERLIN)).toBeNull();
  });

  test("ein Date.UTC-Überlauf wird bewusst nicht abgefangen", () => {
    // `"2026-13-45"` entspricht dem Muster, rollt aber über: Monat 13 =
    // Januar 2027, Tag 45 = 14. Februar. Das ist keine Eingabe-Validierung,
    // sondern nur eine Totalitätsgarantie für die Form — dasselbe Verhalten,
    // das `eventLookupWindow` seit PR #121 hat und das dessen Test
    // ausdrücklich festhält. Wer echte Validierung braucht, baut sie an der
    // Route (siehe docs/TODO.md).
    expect(zonedDayBounds("2026-13-45", BERLIN)?.start.toISOString()).toBe(
      "2027-02-13T23:00:00.000Z",
    );
  });
});
