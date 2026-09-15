import { describe, expect, test } from "bun:test";

import { overrideDate, overrideInterval } from "./override";

describe("overrideDate", () => {
  test("liest einen ISO-String", () => {
    expect(overrideDate("2026-06-15T07:00:00.000Z")?.toISOString()).toBe(
      "2026-06-15T07:00:00.000Z",
    );
  });

  test("verwirft alles, was kein parsbares Datum ist", () => {
    expect(overrideDate("kein-datum")).toBeNull();
    expect(overrideDate(undefined)).toBeNull();
    expect(overrideDate(null)).toBeNull();
    expect(overrideDate(42)).toBeNull();
  });
});

describe("overrideInterval", () => {
  test("liefert Start und Ende, wenn beide da sind", () => {
    const interval = overrideInterval({
      start_at: "2026-07-20T07:00:00.000Z",
      end_at: "2026-07-20T08:00:00.000Z",
    });
    expect(interval?.start.toISOString()).toBe("2026-07-20T07:00:00.000Z");
    expect(interval?.end.toISOString()).toBe("2026-07-20T08:00:00.000Z");
  });

  test("ohne brauchbaren Start gibt es kein Intervall", () => {
    // Ein Override ohne `start_at` verschiebt nichts — es gibt also nichts zu
    // fenstern und keinen Kandidaten zu erzeugen.
    expect(overrideInterval({ title: "Nur ein neuer Titel" })).toBeNull();
    expect(overrideInterval({ start_at: "kein-datum" })).toBeNull();
    expect(overrideInterval(null)).toBeNull();
  });

  test("ohne brauchbares Ende gilt der Start auch als Ende", () => {
    const interval = overrideInterval({ start_at: "2026-07-20T07:00:00.000Z" });
    expect(interval?.end.toISOString()).toBe("2026-07-20T07:00:00.000Z");
  });
});
