import { describe, expect, test } from "bun:test";

import type { Database } from "@/features/supabase/database.types";

import type { EventWithRelations } from "./expand";

import { eventLookupWindow } from "./eventWindow";

type EventRow = Database["public"]["Tables"]["events"]["Row"];
type EventExceptionRow = Database["public"]["Tables"]["event_exceptions"]["Row"];

// Montag, 04.05.2026, 18:30 Europe/Berlin (CEST, +2 h → 16:30 UTC) — derselbe
// Fixture-Stil wie `recurrence.test.ts`.
const MASTER_START = new Date("2026-05-04T16:30:00.000Z");

function makeRow(overrides: Partial<EventRow> = {}): EventWithRelations {
  const row: EventRow = {
    id: "evt-1",
    family_id: "fam-1",
    type_id: "type-1",
    child_id: null,
    parent_id: null,
    title: "Serie",
    description: null,
    location: null,
    start_at: MASTER_START.toISOString(),
    end_at: new Date(MASTER_START.getTime() + 3600_000).toISOString(),
    all_day: false,
    timezone: "Europe/Berlin",
    rrule_freq: "weekly",
    rrule_interval: 1,
    rrule_byweekday: null,
    rrule_count: null,
    rrule_until: null,
    created_at: "2026-01-01T00:00:00.000Z",
    created_by: null,
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
  return { ...row, event_types: null, event_exceptions: [] };
}

function movedException(
  occurrenceDate: string,
  startIso: string,
  endIso: string,
): EventExceptionRow {
  return {
    id: `ex-${occurrenceDate}`,
    event_id: "evt-1",
    occurrence_date: occurrenceDate,
    action: "modified",
    override: { start_at: startIso, end_at: endIso, title: "Verschoben" },
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-02T00:00:00.000Z",
  };
}

describe("eventLookupWindow", () => {
  test("ohne occurrenceKey: ein Jahr um den Serienstart", () => {
    const { start, end } = eventLookupWindow(makeRow());
    expect(start.toISOString()).toBe("2026-05-03T16:30:00.000Z");
    expect(end.toISOString()).toBe("2027-05-05T16:30:00.000Z");
  });

  test("occurrenceKey innerhalb des Standardfensters ändert die Grenzen nicht", () => {
    const { start, end } = eventLookupWindow(makeRow(), "2026-06-15");
    expect(start.toISOString()).toBe("2026-05-03T16:30:00.000Z");
    expect(end.toISOString()).toBe("2027-05-05T16:30:00.000Z");
  });

  // Befund B, PR #121: Der angeforderte Regel-Tag wird explizit in der
  // Terminzone gebildet, nicht in der Zone des Lesers/Runners — deshalb liest
  // dieser Test unter jeder `TZ` dasselbe.
  test("occurrenceKey weit nach dem Serienstart weitet das Fenster nach dem Tagesende in der Terminzone", () => {
    // Serienstart weit in der Vergangenheit: `addDays(start, 366)` deckt den
    // angeforderten Tag nicht ab, das Fenster muss also über `occurrenceKey`
    // geweitet werden — genau der Fall aus der Fehlerbeschreibung, in dem ein
    // lokal (Runner-Zone statt Terminzone) berechnetes Fensterende die
    // Occurrence verfehlt.
    const { end } = eventLookupWindow(
      makeRow({ start_at: "2024-01-01T00:00:00.000Z", timezone: "America/Los_Angeles" }),
      "2026-09-10",
    );
    // Tagesende des 10.09.2026 in America/Los_Angeles (PDT, −7 h):
    // 23:59:59.999 Ortszeit = 06:59:59.999Z am 11.09.
    expect(end.toISOString()).toBe("2026-09-11T06:59:59.999Z");
  });

  test("occurrenceKey vor dem Serienstart weitet das Fenster vor den Tagesbeginn in der Terminzone", () => {
    const { start } = eventLookupWindow(
      makeRow({ start_at: "2026-09-15T00:00:00.000Z", timezone: "America/Los_Angeles" }),
      "2026-09-10",
    );
    // Tagesbeginn des 10.09.2026 in America/Los_Angeles (PDT, −7 h):
    // 00:00:00 Ortszeit = 07:00:00Z.
    expect(start.toISOString()).toBe("2026-09-10T07:00:00.000Z");
  });

  // PR-121-Review-Befund: Ein Routen-Parameter, der nicht dem Muster
  // `yyyy-MM-dd` entspricht, darf die Funktion nicht zum Werfen bringen —
  // sonst hielte sie ihr eigenes Docstring-Versprechen (Fallback auf
  // `expanded[0]` bei Nicht-Treffer) nicht ein. Vor dem Guard verhielten sich
  // die vier Fälle uneinheitlich: "" und "2026-6-1" fielen schon zufällig
  // (falsy bzw. Nicht-Muster) auf das Standardfenster zurück, "kaputt" allein
  // warf einen `RangeError` aus `floatingToInstant`, weil `split("-").map(Number)`
  // dafür `NaN`-Komponenten liefert. Der Guard macht alle drei zum selben
  // Zweig, statt den Wurf isoliert abzufangen. "2026-13-45" fällt seit dem
  // Rundlauf-Check in `zonedDayBounds` (PR #122) aus einem eigenen Grund auf
  // dasselbe Fenster zurück — echte Validierung, kein Zufallstreffer mehr,
  // siehe der eigene Test unten.
  describe("nicht dem Muster yyyy-MM-dd entsprechender occurrenceKey: Standardfenster statt Wurf oder Zufallsergebnis", () => {
    test('leerer String ("")', () => {
      const { start, end } = eventLookupWindow(makeRow(), "");
      expect(start.toISOString()).toBe("2026-05-03T16:30:00.000Z");
      expect(end.toISOString()).toBe("2027-05-05T16:30:00.000Z");
    });

    test('fehlende Nullauffüllung ("2026-6-1")', () => {
      const { start, end } = eventLookupWindow(makeRow(), "2026-6-1");
      expect(start.toISOString()).toBe("2026-05-03T16:30:00.000Z");
      expect(end.toISOString()).toBe("2027-05-05T16:30:00.000Z");
    });

    test('Date.UTC-Überlauf ("2026-13-45"): echter Fallback, kein Zufallstreffer', () => {
      // Vor PR #122 bestand dieser Test nur, weil Februar 2027 — das
      // `Date.UTC`-Überlaufziel von Monat 13 — zufällig innerhalb des
      // Ein-Jahres-Standardfensters um `MASTER_START` (04.05.2026) liegt.
      // `zonedDayBounds` liefert für diesen Schlüssel seither `null` statt
      // eines Ergebnisses in `+010007` oder sonst irgendwo — das Fenster
      // fällt hier also auf denselben Zweig zurück wie "" oder "2026-6-1",
      // nicht mehr auf einen Treffer, der nur der Zufall der Fixture-Daten
      // war.
      const { start, end } = eventLookupWindow(makeRow(), "2026-13-45");
      expect(start.toISOString()).toBe("2026-05-03T16:30:00.000Z");
      expect(end.toISOString()).toBe("2027-05-05T16:30:00.000Z");
    });

    test('Date.UTC-Überlauf, weit außerhalb jedes Zufalls ("9999-99-99")', () => {
      // Dieser Schlüssel überlebte den `Date.UTC`-Überlauf vor PR #122 NICHT
      // zufällig im Standardfenster — er landete in `+010007`, weit davor.
      // Das Suchfenster einer unbegrenzten Tagesserie über diesen Schlüssel
      // umfasste nachgemessen 2.915.008 Tage; `expandEvents` brauchte darüber
      // 31,2 Sekunden für 2.912.292 Occurrences. Nach dem Rundlauf-Check in
      // `zonedDayBounds` ist das Fensterende identisch mit dem
      // Standardfenster — die Sprengung ist weg.
      const { start, end } = eventLookupWindow(makeRow(), "9999-99-99");
      expect(start.toISOString()).toBe("2026-05-03T16:30:00.000Z");
      expect(end.toISOString()).toBe("2027-05-05T16:30:00.000Z");
    });

    // Vor dem Guard: RangeError aus `floatingToInstant`
    // ("date value is not finite in DateTimeFormat formatToParts()"), weil
    // `Number("kaputt")` zu `NaN` wird und `Date.UTC(NaN, ...)` ein Invalid
    // Date liefert — der einzige der vier Fälle, der tatsächlich wirft statt
    // ein (zufälliges) Ergebnis zu liefern.
    test('keine Datumsstruktur ("kaputt")', () => {
      const { start, end } = eventLookupWindow(makeRow(), "kaputt");
      expect(start.toISOString()).toBe("2026-05-03T16:30:00.000Z");
      expect(end.toISOString()).toBe("2027-05-05T16:30:00.000Z");
    });
  });
});

describe("eventLookupWindow deckt das Override-Intervall mit ab (ADR-035)", () => {
  test("ROT VOR DEM FIX: ein Override hinter dem Fensterende weitet das Fenster", () => {
    // Regel-Datum 2027-10-18 liegt >366 Tage nach dem Serienstart, das Fenster
    // endet also am Ende dieses Regel-Tages. Der Override schiebt die
    // Occurrence auf den 25.10. — ohne Weitung verwirft der Fensterfilter in
    // `expandEvents` sie, `find` läuft leer, und der `expanded[0]`-Fallback
    // zeigt stillschweigend das erste Vorkommen der Serie (nachgemessen).
    const row = makeRow({
      start_at: "2026-06-01T07:00:00.000Z",
      end_at: "2026-06-01T08:00:00.000Z",
    });
    row.event_exceptions = [
      movedException("2027-10-18", "2027-10-25T07:00:00.000Z", "2027-10-25T08:00:00.000Z"),
    ];
    const { end } = eventLookupWindow(row, "2027-10-18");
    expect(end.getTime()).toBeGreaterThanOrEqual(new Date("2027-10-25T08:00:00.000Z").getTime());
  });

  test("ROT VOR DEM FIX: ein Override vor dem Fensteranfang weitet es in die Gegenrichtung", () => {
    const row = makeRow({
      start_at: "2027-06-07T07:00:00.000Z",
      end_at: "2027-06-07T08:00:00.000Z",
    });
    row.event_exceptions = [
      movedException("2027-06-14", "2026-01-05T07:00:00.000Z", "2026-01-05T08:00:00.000Z"),
    ];
    const { start } = eventLookupWindow(row, "2027-06-14");
    expect(start.getTime()).toBeLessThanOrEqual(new Date("2026-01-05T07:00:00.000Z").getTime());
  });

  test("GRENZWÄCHTER: ein Override ohne start_at weitet nichts", () => {
    const row = makeRow();
    row.event_exceptions = [
      {
        id: "ex-title-only",
        event_id: row.id,
        occurrence_date: "2026-06-15",
        action: "modified",
        override: { title: "Nur ein neuer Titel" },
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-02T00:00:00.000Z",
      },
    ];
    const { start, end } = eventLookupWindow(row, "2026-06-15");
    expect(start.toISOString()).toBe("2026-05-03T16:30:00.000Z");
    expect(end.toISOString()).toBe("2027-05-05T16:30:00.000Z");
  });

  test("GRENZWÄCHTER: der Override einer ANDEREN Occurrence weitet nichts", () => {
    // Nur die angeforderte Occurrence zählt — sonst zöge eine einzige weit
    // verschobene Exception das Fenster jeder anderen Occurrence derselben
    // Serie mit sich, und `expandEvents` expandierte für jeden Detail-Aufruf
    // Jahre statt Tage.
    const row = makeRow();
    row.event_exceptions = [
      movedException("2027-10-18", "2030-01-01T07:00:00.000Z", "2030-01-01T08:00:00.000Z"),
    ];
    const { end } = eventLookupWindow(row, "2026-06-15");
    expect(end.toISOString()).toBe("2027-05-05T16:30:00.000Z");
  });
});
