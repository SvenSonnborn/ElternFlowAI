import { describe, expect, test } from "bun:test";
import { createInstance, type i18n as I18nInstance } from "i18next";

import de from "@/features/i18n/locales/de.json";
import en from "@/features/i18n/locales/en.json";

import { getSampleChildren, getSampleFamilyName, sampleParents } from "./family";

/**
 * A private i18next bound to the real catalogs, so these tests exercise the
 * shipped copy rather than a stub. `createInstance` keeps it off the global
 * singleton, so no test file can leak a language into another.
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

describe("getSampleFamilyName", () => {
  test("translates the family name", () => {
    expect(getSampleFamilyName(deT)).toBe("Familie Becker");
    expect(getSampleFamilyName(enT)).toBe("The Becker family");
  });
});

describe("getSampleChildren", () => {
  test("translates school and grade", () => {
    const de = getSampleChildren(deT);
    const en = getSampleChildren(enT);
    expect(de[0].school).toBe("Grundschule am Park");
    expect(en[0].school).toBe("Park Primary School");
    expect(de[0].grade).toBe("2. Klasse");
    expect(en[0].grade).toBe("Year 2");
    // docs/COPY.md schreibt Leos Schule "Goethe-Gymnasium", nicht "Gymnasium Goethe".
    expect(de[2].school).toBe("Goethe-Gymnasium");
  });

  test("translates likes and dislikes", () => {
    const de = getSampleChildren(deT);
    const en = getSampleChildren(enT);
    expect(de[0].likes).toContain("Erdbeeren");
    expect(en[0].likes).toContain("Strawberries");
    expect(de[0].dislikes).toContain("Pilze");
    expect(en[0].dislikes).toContain("Mushrooms");
  });

  test("keeps proper names and ids untranslated", () => {
    const de = getSampleChildren(deT);
    const en = getSampleChildren(enT);
    expect(de.map((c) => c.name)).toEqual(en.map((c) => c.name));
    expect(de.map((c) => c.id)).toEqual(en.map((c) => c.id));
    expect(de.map((c) => c.id)).toEqual(["ben", "mia", "leo"]);
  });

  test("keeps non-copy fields identical across languages", () => {
    const de = getSampleChildren(deT);
    const en = getSampleChildren(enT);
    expect(de.map((c) => c.age)).toEqual(en.map((c) => c.age));
    expect(de.map((c) => c.color)).toEqual(en.map((c) => c.color));
    expect(de.map((c) => c.allergies)).toEqual(en.map((c) => c.allergies));
  });

  // Catches a key missing from *German*; a missing English one falls back to
  // German rather than to the key, and is covered by features/i18n/catalogs.test.ts.
  test("leaves no key unresolved in either catalog", () => {
    for (const translate of [deT, enT]) {
      for (const child of getSampleChildren(translate)) {
        for (const value of [child.school, child.grade, ...child.likes, ...child.dislikes]) {
          expect(value).not.toMatch(/^sample\./);
          expect(value.trim().length).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe("sampleParents", () => {
  test("carries no copy — names and e-mails are literals, not catalog keys", () => {
    expect(sampleParents.map((p) => p.short)).toEqual(["Anna", "Tobi"]);
    for (const parent of sampleParents) {
      expect(parent.name).not.toMatch(/^sample\./);
      expect(parent.email).toContain("@");
    }
  });
});
