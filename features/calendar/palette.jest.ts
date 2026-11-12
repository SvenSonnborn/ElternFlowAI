import "@/features/i18n";

import { typeLabelsForSlug } from "./palette";

describe("typeLabelsForSlug nach i18n.init()", () => {
  test("löst den Slug über cal.legend.* auf", () => {
    expect(typeLabelsForSlug("arzt")).toEqual({ de: "Arzt", en: "Doctor" });
  });

  test("löst einen Alias-Slug über den Alias auf", () => {
    expect(typeLabelsForSlug("hausaufgaben")).toEqual({ de: "HA", en: "Tasks" });
  });

  test("fällt bei unbekanntem Slug auf den Slug zurück", () => {
    expect(typeLabelsForSlug("unbekannt")).toEqual({ de: "unbekannt", en: "unbekannt" });
  });
});
