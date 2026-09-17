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

  test("verwirft einen unmöglichen Kalendertag, statt ihn stillschweigend zu verschieben", () => {
    // `new Date(...)` normalisiert einen überlaufenden Tag still, statt ihn
    // abzulehnen — nachgemessen: der 30. Februar 2026 wird zum 2. März, der
    // 31. Juni zum 1. Juli. `event_exceptions.override` ist freies `jsonb`
    // ohne Inhaltsprüfung; ein solcher Wert kann per direktem DB-Schreibzugriff
    // oder künftigem serverseitigem Writer entstehen, nicht über den
    // App-Schreibpfad (`modifyOccurrence` schreibt korrekte ISO-Strings).
    expect(overrideDate("2026-02-30T07:00:00.000Z")).toBeNull();
    expect(overrideDate("2026-06-31T07:00:00.000Z")).toBeNull();
  });

  test("die Falle: ein gültiger Wert mit Offset wird NICHT verworfen", () => {
    // `"2026-06-15T00:30:00+02:00"` ist UTC bereits der 14.06. — ein
    // Rundlauf-Check gegen `getUTCDate()` des geparsten `Date` würde diesen
    // legitimen Wert fälschlich als Kalenderüberlauf verwerfen. Der Check
    // muss deshalb das Datumspräfix des STRINGS prüfen (`"2026-06-15"`, ein
    // gültiger Tag), nicht die UTC-Komponenten des Ergebnisses. Ohne diesen
    // Test fiele der naheliegende, aber falsche Fix (Rundlauf gegen
    // `getUTCDate()`) genau in diese Falle.
    expect(overrideDate("2026-06-15T00:30:00+02:00")?.toISOString()).toBe(
      "2026-06-14T22:30:00.000Z",
    );
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
