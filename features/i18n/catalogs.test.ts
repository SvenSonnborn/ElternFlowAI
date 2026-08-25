import { describe, expect, test } from "bun:test";

import de from "./locales/de.json";
import en from "./locales/en.json";

/**
 * i18next runs with `fallbackLng: "de"`, so a key missing from the English
 * catalog never surfaces as a missing translation at runtime — it silently
 * renders German to an English user. Only a structural comparison catches
 * that, which is why these assertions read the JSON rather than going through
 * a `t`.
 */
function flatten(node: unknown, prefix = ""): Record<string, string> {
  if (typeof node !== "object" || node === null) return { [prefix]: String(node) };
  return Object.entries(node).reduce<Record<string, string>>((acc, [key, value]) => {
    return Object.assign(acc, flatten(value, prefix ? `${prefix}.${key}` : key));
  }, {});
}

/** `{{name}}` / `{{count, number}}` → `name` / `count`. */
function placeholders(value: string): string[] {
  return [...new Set(value.match(/{{\s*\w+[^}]*}}/g) ?? [])]
    .map((match) => /{{\s*(\w+)/.exec(match)?.[1] ?? "")
    .sort();
}

const deFlat = flatten(de);
const enFlat = flatten(en);

describe("i18n catalogs", () => {
  test("German and English carry exactly the same keys", () => {
    const deKeys = new Set(Object.keys(deFlat));
    const enKeys = new Set(Object.keys(enFlat));
    expect({
      missingInEn: Object.keys(deFlat).filter((key) => !enKeys.has(key)),
      missingInDe: Object.keys(enFlat).filter((key) => !deKeys.has(key)),
    }).toEqual({ missingInEn: [], missingInDe: [] });
  });

  test("no catalog value is blank", () => {
    // Merging the two into one object would let English overwrite German for
    // every shared key — i.e. hide a blank German value behind a filled English
    // one. They have to be walked separately.
    const blank = (["de", "en"] as const).flatMap((lng) =>
      Object.entries(lng === "de" ? deFlat : enFlat)
        .filter(([, value]) => value.trim().length === 0)
        .map(([key]) => `${lng}.${key}`),
    );
    expect(blank).toEqual([]);
  });

  test("both languages interpolate the same placeholders per key", () => {
    const mismatched = Object.entries(deFlat)
      .filter(([key, value]) => {
        const counterpart = enFlat[key];
        return (
          counterpart !== undefined &&
          placeholders(value).join() !== placeholders(counterpart).join()
        );
      })
      .map(([key]) => key);
    expect(mismatched).toEqual([]);
  });

  test("the sample fixture namespace is present in both languages", () => {
    const deSample = Object.keys(deFlat).filter((key) => key.startsWith("sample."));
    const enSample = Object.keys(enFlat).filter((key) => key.startsWith("sample."));
    expect(deSample.length).toBeGreaterThan(0);
    expect(enSample).toEqual(deSample);
  });
});
