import { describe, expect, test } from "bun:test";

import { tabBarSize } from "./tabBarSize";

/**
 * Höhe, die einem Tab nach Polster oben, Systemrand unten und der Haarlinie
 * oben bleibt (`StyleSheet.hairlineWidth`, höchstens 1).
 */
function tabHeight(bottomInset: number) {
  const { height, paddingTop } = tabBarSize(bottomInset);
  return height - paddingTop - bottomInset - 1;
}

describe("tabBarSize", () => {
  test("ohne Systemrand (Web) bleibt die Leiste 72 hoch", () => {
    expect(tabBarSize(0)).toEqual({ height: 72, paddingTop: 8 });
  });

  test.each([
    ["iPhone mit Home-Indikator", 34],
    ["Android-Gestenleiste", 24],
    ["Android mit Drei-Tasten-Leiste", 48],
  ])("%s: jeder Tab ist mindestens 44 hoch", (_, inset) => {
    expect(tabHeight(inset)).toBeGreaterThanOrEqual(44);
  });

  test("ein kleiner Rand lässt die 72 stehen", () => {
    expect(tabBarSize(10).height).toBe(72);
  });
});
