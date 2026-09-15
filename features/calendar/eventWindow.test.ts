import { describe, expect, test } from "bun:test";

import { eventLookupWindow } from "./eventWindow";

// Montag, 04.05.2026, 18:30 Europe/Berlin (CEST, +2 h → 16:30 UTC) — derselbe
// Fixture-Stil wie `recurrence.test.ts`.
const MASTER_START = new Date("2026-05-04T16:30:00.000Z");

describe("eventLookupWindow", () => {
  test("ohne occurrenceKey: ein Jahr um den Serienstart", () => {
    const { start, end } = eventLookupWindow(MASTER_START, undefined, "Europe/Berlin");
    expect(start.toISOString()).toBe("2026-05-03T16:30:00.000Z");
    expect(end.toISOString()).toBe("2027-05-05T16:30:00.000Z");
  });

  test("occurrenceKey innerhalb des Standardfensters ändert die Grenzen nicht", () => {
    const { start, end } = eventLookupWindow(MASTER_START, "2026-06-15", "Europe/Berlin");
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
    const farPastMaster = new Date("2024-01-01T00:00:00.000Z");
    const { end } = eventLookupWindow(farPastMaster, "2026-09-10", "America/Los_Angeles");
    // Tagesende des 10.09.2026 in America/Los_Angeles (PDT, −7 h):
    // 23:59:59.999 Ortszeit = 06:59:59.999Z am 11.09.
    expect(end.toISOString()).toBe("2026-09-11T06:59:59.999Z");
  });

  test("occurrenceKey vor dem Serienstart weitet das Fenster vor den Tagesbeginn in der Terminzone", () => {
    const laterMaster = new Date("2026-09-15T00:00:00.000Z");
    const { start } = eventLookupWindow(laterMaster, "2026-09-10", "America/Los_Angeles");
    // Tagesbeginn des 10.09.2026 in America/Los_Angeles (PDT, −7 h):
    // 00:00:00 Ortszeit = 07:00:00Z.
    expect(start.toISOString()).toBe("2026-09-10T07:00:00.000Z");
  });
});
