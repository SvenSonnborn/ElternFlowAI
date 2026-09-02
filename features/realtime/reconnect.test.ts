import { describe, expect, test } from "bun:test";

import { DEGRADED_AFTER_MS, degradedDelayMs, shouldRefetchAfterResubscribe } from "./reconnect";

describe("shouldRefetchAfterResubscribe", () => {
  test("das erste Abonnieren löst keinen Nachlade-Lauf aus", () => {
    expect(shouldRefetchAfterResubscribe("idle", "subscribed")).toBe(false);
    expect(shouldRefetchAfterResubscribe("subscribing", "subscribed")).toBe(false);
  });

  test("die Rückkehr aus einem Verlust lädt nach", () => {
    expect(shouldRefetchAfterResubscribe("closed", "subscribed")).toBe(true);
    expect(shouldRefetchAfterResubscribe("timedOut", "subscribed")).toBe(true);
    expect(shouldRefetchAfterResubscribe("error", "subscribed")).toBe(true);
  });

  test("subscribed → subscribed lädt nichts nach", () => {
    // Kein Statuswechsel, kein Verlust dazwischen — derselbe Fall wie das
    // erste Abonnieren, nur mit "subscribed" statt "idle"/"subscribing" als
    // Vorzustand. War bislang nur empirisch am laufenden System geprüft.
    expect(shouldRefetchAfterResubscribe("subscribed", "subscribed")).toBe(false);
  });

  test("jeder Wechsel, der nicht auf subscribed endet, lädt nichts nach", () => {
    expect(shouldRefetchAfterResubscribe("subscribed", "closed")).toBe(false);
    expect(shouldRefetchAfterResubscribe("error", "timedOut")).toBe(false);
  });
});

describe("degradedDelayMs", () => {
  test("eine stehende Verbindung wird nie degradiert", () => {
    expect(degradedDelayMs("subscribed")).toBeNull();
  });

  test("ohne Familie gibt es nichts zu melden", () => {
    expect(degradedDelayMs("idle")).toBeNull();
  });

  test("jeder Verlustzustand bekommt dieselbe Schonfrist", () => {
    for (const status of ["subscribing", "timedOut", "error", "closed"] as const) {
      expect(degradedDelayMs(status)).toBe(DEGRADED_AFTER_MS);
    }
  });
});
