import { describe, expect, test } from "bun:test";
import i18next from "i18next";

import { typeLabelsForSlug } from "./palette";

describe("typeLabelsForSlug vor i18n.init()", () => {
  test("i18next ist in bun test nicht initialisiert", () => {
    // Sonst prüften die Tests darunter still den anderen Zweig.
    expect(i18next.isInitialized).toBeFalsy(); // vor init() `undefined`, nicht `false`
  });

  test("liefert den Slug für DE und EN", () => {
    expect(typeLabelsForSlug("arzt")).toEqual({ de: "arzt", en: "arzt" });
  });

  test("liefert bei einem Alias-Slug den Slug, nicht den Alias", () => {
    expect(typeLabelsForSlug("hausaufgaben")).toEqual({ de: "hausaufgaben", en: "hausaufgaben" });
  });
});
