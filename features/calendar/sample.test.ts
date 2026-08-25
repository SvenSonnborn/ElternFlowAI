import { describe, expect, test } from "bun:test";
import { createInstance, type i18n as I18nInstance } from "i18next";

import de from "@/features/i18n/locales/de.json";
import en from "@/features/i18n/locales/en.json";

import { findSampleOccurrence, getSampleOccurrences } from "./sample";

/**
 * The seeds resolve their copy through a translate function, so these tests run
 * against the *real* catalogs rather than a stub.
 *
 * Note what this setup can and cannot see: `fallbackLng: "de"` mirrors the app's
 * config, which means a key missing from the English catalog silently renders
 * German instead of echoing the key back. The assertions that name an expected
 * English string therefore catch it, but a generic "not a bare key" check would
 * not. Structural DE/EN parity is guarded in features/i18n/catalogs.test.ts.
 */
function catalog(lng: "de" | "en"): I18nInstance {
  const instance = createInstance();
  void instance.init({
    resources: { de: { translation: de }, en: { translation: en } },
    lng,
    fallbackLng: "de",
    interpolation: { escapeValue: false },
    compatibilityJSON: "v4",
  });
  return instance;
}

const deT = catalog("de").t;
const enT = catalog("en").t;

const NOW = new Date("2026-05-14T00:00:00.000Z");

/**
 * The full expected output, in seed order. Spot-checking a few titles would
 * miss a seed pointing at the wrong `titleKey` — the catalogs would still
 * resolve, just to the wrong string — so both lists are pinned exhaustively.
 */
const EXPECTED_DE_TITLES = [
  "Schule",
  "Kinderarzt Dr. Weber",
  "Fußballtraining",
  "Mathe-Hausaufgaben",
  "Vorsorge Mia",
  "Schwimmkurs",
  "Lesen üben",
  "Geburtstag Oma",
  "Klassenarbeit Englisch",
  "Fußballtraining",
  "Mathe üben",
  "Familien-Abendessen",
  "Zahnarzt Ben",
];

const EXPECTED_EN_TITLES = [
  "School",
  "Paediatrician Dr Weber",
  "Football practice",
  "Maths homework",
  "Mia's check-up",
  "Swimming lessons",
  "Reading practice",
  "Grandma's birthday",
  "English test",
  "Football practice",
  "Maths practice",
  "Family dinner",
  "Ben's dentist appointment",
];

describe("getSampleOccurrences", () => {
  test("renders every title in German", () => {
    expect(getSampleOccurrences(deT, NOW).map((o) => o.title)).toEqual(EXPECTED_DE_TITLES);
  });

  test("renders every title in English", () => {
    const titles = getSampleOccurrences(enT, NOW).map((o) => o.title);
    expect(titles).toEqual(EXPECTED_EN_TITLES);
    // Belt and braces: `fallbackLng: "de"` would render German for a missing
    // English key, so assert no German title survives the switch.
    for (const german of EXPECTED_DE_TITLES) {
      expect(titles).not.toContain(german);
    }
  });

  test("interpolates the child name into per-child titles", () => {
    const deTitles = getSampleOccurrences(deT, NOW).map((o) => o.title);
    const enTitles = getSampleOccurrences(enT, NOW).map((o) => o.title);
    expect(deTitles).toContain("Vorsorge Mia");
    expect(deTitles).toContain("Zahnarzt Ben");
    expect(enTitles).toContain("Mia's check-up");
    expect(enTitles).toContain("Ben's dentist appointment");
  });

  test("translates locations", () => {
    const deLocations = getSampleOccurrences(deT, NOW).map((o) => o.location);
    const enLocations = getSampleOccurrences(enT, NOW).map((o) => o.location);
    expect(deLocations).toContain("Sportplatz Süd");
    expect(enLocations).toContain("South sports field");
  });

  test("leaves no key unresolved in either catalog", () => {
    for (const translate of [deT, enT]) {
      for (const occurrence of getSampleOccurrences(translate, NOW)) {
        expect(occurrence.title).not.toMatch(/^sample\./);
        expect(occurrence.title.trim().length).toBeGreaterThan(0);
        if (occurrence.location !== null) {
          expect(occurrence.location).not.toMatch(/^sample\./);
        }
      }
    }
  });

  test("keeps event ids stable across languages", () => {
    const deIds = getSampleOccurrences(deT, NOW).map((o) => o.eventId);
    const enIds = getSampleOccurrences(enT, NOW).map((o) => o.eventId);
    expect(enIds).toEqual(deIds);
  });

  test("keeps the schedule independent of language", () => {
    const deStarts = getSampleOccurrences(deT, NOW).map((o) => o.startAt.toISOString());
    const enStarts = getSampleOccurrences(enT, NOW).map((o) => o.startAt.toISOString());
    expect(enStarts).toEqual(deStarts);
  });
});

describe("findSampleOccurrence", () => {
  test("finds an occurrence by id and translates it", () => {
    const id = getSampleOccurrences(deT, NOW)[0].eventId;
    expect(findSampleOccurrence(id, deT, NOW)?.title).toBe("Schule");
    expect(findSampleOccurrence(id, enT, NOW)?.title).toBe("School");
  });

  test("returns null for an unknown id", () => {
    expect(findSampleOccurrence("nope", deT, NOW)).toBeNull();
  });
});
