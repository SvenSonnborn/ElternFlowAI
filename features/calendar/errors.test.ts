import { describe, expect, spyOn, test } from "bun:test";

import { EventNotFoundError, mapEventError } from "./errors";

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
