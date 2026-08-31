import { describe, expect, test } from "bun:test";

import type { Translate } from "@/features/shared";

import { undoDeleteMessage } from "./undoDeleteMessage";

/**
 * Gibt statt einer echten Übersetzung den Key zurück — bei Parametern den Key
 * plus deren JSON-Repräsentation. Reicht, um zu prüfen, welcher Key mit
 * welchen Werten aufgerufen wurde, ohne den i18n-Katalog zu laden.
 */
const t: Translate = (key, params) => (params ? `${key}(${JSON.stringify(params)})` : key);

describe("undoDeleteMessage", () => {
  test("Einzeltermin: nur der Titel, kein Serien-Zusatz", () => {
    const message = undoDeleteMessage({
      title: "Zahnarzt",
      scope: "all",
      occurrenceDate: "2026-09-12",
      isRecurring: false,
      t,
      formatDate: () => "12. Sep",
    });

    expect(message).toBe("Zahnarzt");
    // Ausdrücklich gegen den Serien-Zusatz behauptet, nicht nur Gleichheit mit
    // dem Titel: ein Einzeltermin hat `scope: "all"` (Initialwert, kein
    // Dialog-Ergebnis) und darf trotzdem nie "· ganze Serie" zeigen.
    expect(message).not.toContain(t("cal.delete.undoScopeAll"));
    expect(message).not.toContain("·");
  });

  test("Serie, Scope 'all': Titel plus Serien-Zusatz", () => {
    const message = undoDeleteMessage({
      title: "Zahnarzt",
      scope: "all",
      occurrenceDate: "2026-09-12",
      isRecurring: true,
      t,
      formatDate: () => "12. Sep",
    });

    expect(message).toBe(`Zahnarzt · ${t("cal.delete.undoScopeAll")}`);
  });

  test("Serie, Scope 'forward': Titel plus Zusatz mit formatiertem Datum", () => {
    const calls: string[] = [];
    const formatDate = (occurrenceDate: string) => {
      calls.push(occurrenceDate);
      return "12. Sep";
    };

    const message = undoDeleteMessage({
      title: "Zahnarzt",
      scope: "forward",
      occurrenceDate: "2026-09-12",
      isRecurring: true,
      t,
      formatDate,
    });

    expect(message).toBe(`Zahnarzt · ${t("cal.delete.undoScopeForward", { date: "12. Sep" })}`);
    // formatDate muss mit der Occurrence-Date der Löschung aufgerufen werden,
    // nicht mit irgendeinem anderen Datum.
    expect(calls).toEqual(["2026-09-12"]);
  });

  test("Serie, Scope 'this': nur der Titel, kein Zusatz", () => {
    const message = undoDeleteMessage({
      title: "Zahnarzt",
      scope: "this",
      occurrenceDate: "2026-09-12",
      isRecurring: true,
      t,
      formatDate: () => "12. Sep",
    });

    expect(message).toBe("Zahnarzt");
  });
});
