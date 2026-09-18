import { describe, expect, spyOn, test } from "bun:test";

import type { EventWithRelations } from "./expand";

import { EventConflictError, EventNotFoundError, mapEventError } from "./errors";

/**
 * Minimal, aber vollständig: `mapEventError` liest aus dem Fehler nur `name`,
 * die Zeile ist hier reines Typ-Futter. Ein `as` wäre die kürzere Lüge —
 * dieser Test soll bemerken, wenn `EventWithRelations` wächst.
 */
const ROW: EventWithRelations = {
  id: "evt-1",
  family_id: "fam-1",
  type_id: "type-1",
  child_id: null,
  parent_id: null,
  title: "Termin",
  description: null,
  location: null,
  start_at: "2026-05-04T16:30:00.000Z",
  end_at: "2026-05-04T17:30:00.000Z",
  all_day: false,
  timezone: "Europe/Berlin",
  rrule_freq: null,
  rrule_interval: 1,
  rrule_byweekday: null,
  rrule_until: null,
  rrule_count: null,
  created_by: null,
  created_at: "2026-04-20T00:00:00.000Z",
  updated_at: "2026-05-01T00:00:00.000Z",
  event_types: null,
  event_exceptions: null,
};

describe("mapEventError", () => {
  test("EventNotFoundError → cal.error.eventGone", () => {
    expect(mapEventError(new EventNotFoundError("evt-1"))).toBe("cal.error.eventGone");
  });

  test("erkennt den Fall an `name`, nicht an der Meldung", () => {
    // Die Meldung darf sich ändern, ohne die Klassifizierung mitzunehmen —
    // deshalb gibt es die Klasse überhaupt.
    expect(mapEventError({ name: "EventNotFoundError", message: "irgendwas anderes" })).toBe(
      "cal.error.eventGone",
    );
  });

  test("EventConflictError → cal.error.conflict", () => {
    expect(mapEventError(new EventConflictError(ROW))).toBe("cal.error.conflict");
  });

  test("auch der Konflikt wird an `name` erkannt, nicht an der Meldung", () => {
    expect(mapEventError({ name: "EventConflictError", message: "irgendwas" })).toBe(
      "cal.error.conflict",
    );
  });

  test("Postgres 42501 (RLS verweigert) → cal.error.notAuthenticated", () => {
    expect(mapEventError({ code: "42501", message: "new row violates row-level security" })).toBe(
      "cal.error.notAuthenticated",
    );
  });

  test("Postgres 23503 (Fremdschlüssel) → cal.error.eventGone", () => {
    expect(mapEventError({ code: "23503", message: "violates foreign key constraint" })).toBe(
      "cal.error.eventGone",
    );
  });

  test("AbortError → cal.error.network", () => {
    expect(mapEventError({ name: "AbortError", message: "aborted" })).toBe("cal.error.network");
  });

  test("undici-Meldung → cal.error.network", () => {
    expect(mapEventError({ message: "TypeError: fetch failed" })).toBe("cal.error.network");
  });

  test("Browser-Meldung → cal.error.network", () => {
    expect(mapEventError({ message: "Failed to fetch" })).toBe("cal.error.network");
  });

  test("null und Primitive fallen auf generic", () => {
    expect(mapEventError(null)).toBe("cal.error.generic");
    expect(mapEventError("kaputt")).toBe("cal.error.generic");
    expect(mapEventError(undefined)).toBe("cal.error.generic");
  });

  test("ein unbekannter Fehler wird geloggt, aber ohne Meldungstext", () => {
    // Eine Supabase-Meldung kann die Payload zurückwerfen, und Termin-Titel
    // sind privat. Der Log darf deshalb nur Primitive tragen.
    const spy = spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(mapEventError({ code: "99999", message: "Paartherapie 18:00 kollidiert" })).toBe(
        "cal.error.generic",
      );
      expect(spy).toHaveBeenCalledTimes(1);
      const logged = JSON.stringify(spy.mock.calls[0]);
      expect(logged).not.toContain("Paartherapie");
      expect(logged).toContain("99999");
    } finally {
      spy.mockRestore();
    }
  });
});
