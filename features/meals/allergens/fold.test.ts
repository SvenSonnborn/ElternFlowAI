import { describe, expect, test } from "bun:test";

import { fold } from "./fold";

describe("fold", () => {
  test("faltet deutsche Umlaute nach ae/oe/ue/ss", () => {
    expect(fold("Nüsse")).toBe("nuesse");
    expect(fold("Öl")).toBe("oel");
    expect(fold("Käse")).toBe("kaese");
    expect(fold("Weiß")).toBe("weiss");
  });

  test("bildet Umlaut-Schreibvarianten auf dieselbe Form ab", () => {
    // Der eigentliche Zweck: wer "Nuesse" tippt, muss dasselbe treffen wie
    // "Nüsse". Deshalb ae/oe/ue VOR dem NFD-Strippen — umgekehrt käme "nusse"
    // heraus und die Varianten liefen auseinander.
    const forms = ["Nüsse", "NÜSSE", "nuesse", "Nuesse"];
    expect(new Set(forms.map(fold)).size).toBe(1);
  });

  test("strippt übrige Diakritika", () => {
    expect(fold("Crème fraîche")).toBe("creme fraiche");
  });

  test("faltet auch zerlegt vorliegende Umlaute", () => {
    // NFD-Eingabe: "u" + combining diaeresis statt eines vorkomponierten "ü".
    // So liefern es macOS-Dateisysteme und manche APIs.
    const decomposed = "Nu\u0308sse";
    expect(decomposed.normalize("NFC")).toBe("N\u00fcsse");
    expect(fold(decomposed)).toBe("nuesse");
  });

  test("ersetzt Nicht-Alphanumerisches durch einzelne Spaces", () => {
    expect(fold("Weizen-Mehl")).toBe("weizen mehl");
    expect(fold("  Soja  ,  Tofu ")).toBe("soja tofu");
  });

  test("liefert für leere und reine Zeichen-Eingaben einen leeren String", () => {
    expect(fold("")).toBe("");
    expect(fold("---")).toBe("");
  });
});
