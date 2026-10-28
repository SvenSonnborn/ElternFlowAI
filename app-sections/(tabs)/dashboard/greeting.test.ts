import { describe, expect, it } from "bun:test";

import { greetingKey } from "./greeting";

/** Lokaler Zeitpunkt am selben Tag, damit die Gerätezeit-Rechnung getestet wird. */
const at = (h: number, m: number) => new Date(2026, 9, 28, h, m);

describe("greetingKey", () => {
  it.each([
    [4, 59, "evening"],
    [5, 0, "morning"],
    [10, 59, "morning"],
    [11, 0, "day"],
    [17, 59, "day"],
    [18, 0, "evening"],
    [0, 0, "evening"],
  ] as const)("%i:%i -> %s", (h, m, expected) => {
    expect(greetingKey(at(h, m))).toBe(expected);
  });
});
