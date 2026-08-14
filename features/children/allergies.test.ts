import { describe, expect, test } from "bun:test";

import de from "@/features/i18n/locales/de.json";
import en from "@/features/i18n/locales/en.json";

import { ALLERGY_KEYS } from "./allergies";

describe("ALLERGY_KEYS", () => {
  test("führt die 14 EU-Pflichtallergene", () => {
    expect(ALLERGY_KEYS).toHaveLength(14);
  });

  test.each(["de", "en"])("jeder Key hat ein %s-Label", (lang) => {
    // Bricht, sobald jemand einen Key ergänzt, ohne die Kataloge nachzuziehen —
    // die Chip-Reihe zeigte sonst den rohen Key-String an.
    const labels = (lang === "de" ? de : en).onb.s4.allergies as Record<string, string>;
    for (const key of ALLERGY_KEYS) {
      expect(labels[key], `${lang}: onb.s4.allergies.${key} fehlt`).toBeTruthy();
    }
  });
});
