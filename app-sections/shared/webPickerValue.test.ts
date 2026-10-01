import { describe, expect, test } from "bun:test";

import { parseWebPickerValue } from "./webPickerValue";

// Lokale Konstruktoren statt ISO-Strings: der Test soll in jeder Prozess-Zeitzone
// dasselbe sagen.
describe("parseWebPickerValue", () => {
  test("Datums-Modus übernimmt die Uhrzeit des Basiswerts", () => {
    const base = new Date(2026, 0, 1, 14, 30, 12, 345);
    const next = parseWebPickerValue("2026-03-15", "date", base);
    expect(next).toEqual(new Date(2026, 2, 15, 14, 30, 12, 345));
  });

  test("Zeit-Modus übernimmt das Datum des Basiswerts und setzt Sekunden zurück", () => {
    const base = new Date(2026, 0, 1, 14, 30, 12, 345);
    const next = parseWebPickerValue("09:05", "time", base);
    expect(next).toEqual(new Date(2026, 0, 1, 9, 5, 0, 0));
  });

  test("leere und unvollständige Eingabe ergibt null", () => {
    const base = new Date(2018, 0, 1);
    expect(parseWebPickerValue("", "date", base)).toBeNull();
    expect(parseWebPickerValue("2026-1", "date", base)).toBeNull();
  });

  test("ungültiger Basiswert fällt auf die Epoche zurück statt zu werfen", () => {
    const next = parseWebPickerValue("2026-03-15", "date", new Date(Number.NaN));
    expect(next).not.toBeNull();
    expect(next?.getFullYear()).toBe(2026);
    expect(next?.getMonth()).toBe(2);
    expect(next?.getDate()).toBe(15);
  });

  test("ein Tag nach maximumDate wird auf den Tag des Maximums geklemmt", () => {
    // Die Uhrzeit bleibt die des Basiswerts, nur Jahr/Monat/Tag kommen vom Maximum.
    const max = new Date(2026, 9, 1, 10, 0);
    const next = parseWebPickerValue("2026-10-02", "date", new Date(2018, 0, 1), max);
    expect(next).toEqual(new Date(2026, 9, 1, 0, 0));
  });

  test("ein Jahr weit hinter maximumDate (Tippen im Jahressegment) landet ebenfalls auf dem Maximum", () => {
    // Chrome meldet `change` pro Ziffer: 0002 → 0020 → 0203 → 2031. Verworfen bliebe das Feld auf 0203.
    const max = new Date(2026, 9, 1, 10, 0);
    const next = parseWebPickerValue("2031-04-17", "date", new Date(2018, 0, 1, 8, 15), max);
    expect(next).toEqual(new Date(2026, 9, 1, 8, 15));
  });

  test("Zeit-Modus ignoriert maximumDate", () => {
    // `max` am Input gilt nur im Datums-Modus; der Basiswert liegt hier hinter dem Maximum.
    const base = new Date(2027, 0, 1, 14, 30);
    const next = parseWebPickerValue("09:05", "time", base, new Date(2026, 9, 1));
    expect(next).toEqual(new Date(2027, 0, 1, 9, 5, 0, 0));
  });

  test("derselbe Tag wie maximumDate gilt auch mit späterer Uhrzeit im Basiswert", () => {
    // Ein Instant-Vergleich würde 23:59 gegen 10:00 verwerfen — gemeint ist der Kalendertag.
    const max = new Date(2026, 9, 1, 10, 0);
    const next = parseWebPickerValue("2026-10-01", "date", new Date(2018, 0, 1, 23, 59), max);
    expect(next).toEqual(new Date(2026, 9, 1, 23, 59));
  });

  test("ein Tag vor maximumDate ist gültig", () => {
    const max = new Date(2026, 9, 1, 10, 0);
    const next = parseWebPickerValue("2026-09-30", "date", new Date(2018, 0, 1), max);
    expect(next).toEqual(new Date(2026, 8, 30, 0, 0));
  });
});
