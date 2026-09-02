import type { QueryKey } from "@tanstack/react-query";

import { describe, expect, test } from "bun:test";

import { mergeInvalidationKeys } from "./coalesce";

describe("mergeInvalidationKeys", () => {
  test("leere Eingabe bleibt leer", () => {
    expect(mergeInvalidationKeys([])).toEqual([]);
  });

  test("dedupliziert strukturgleiche Schlüssel", () => {
    const keys: QueryKey[] = [
      ["calendar", "events"],
      ["calendar", "events"],
      ["calendar", "event", "evt-1"],
    ];
    expect(mergeInvalidationKeys(keys)).toEqual([
      ["calendar", "events"],
      ["calendar", "event", "evt-1"],
    ]);
  });

  test("hält die Reihenfolge des ersten Auftretens", () => {
    const keys: QueryKey[] = [
      ["calendar", "event", "b"],
      ["calendar", "event", "a"],
      ["calendar", "event", "b"],
    ];
    expect(mergeInvalidationKeys(keys)).toEqual([
      ["calendar", "event", "b"],
      ["calendar", "event", "a"],
    ]);
  });

  test("ein Serien-Delete kollabiert auf zwei Schlüssel", () => {
    // Master-Zeile + zwei Exceptions desselben Events im selben Fenster.
    const keys: QueryKey[] = [
      ["calendar", "events"],
      ["calendar", "event", "evt-1"],
      ["calendar", "events"],
      ["calendar", "event", "evt-1"],
      ["calendar", "events"],
      ["calendar", "event", "evt-1"],
    ];
    expect(mergeInvalidationKeys(keys)).toHaveLength(2);
  });
});
