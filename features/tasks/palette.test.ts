import { describe, expect, test } from "bun:test";

import { lightTheme } from "@/design-system/themes";

import { taskTypeColorFor } from "./palette";

describe("taskTypeColorFor", () => {
  test("resolves a semantic theme role to its colour", () => {
    expect(taskTypeColorFor("accent", lightTheme)).toBe(lightTheme.accent);
  });

  test("resolves the camelCase roles the migration seeds", () => {
    expect(taskTypeColorFor("primarySoft", lightTheme)).toBe(lightTheme.primarySoft);
  });

  test("falls back to primary for an unknown role", () => {
    expect(taskTypeColorFor("chartreuse", lightTheme)).toBe(lightTheme.primary);
  });

  test("falls back to primary for null and undefined", () => {
    expect(taskTypeColorFor(null, lightTheme)).toBe(lightTheme.primary);
    expect(taskTypeColorFor(undefined, lightTheme)).toBe(lightTheme.primary);
  });

  test("does not return a non-string theme member", () => {
    // Guards against a role name that collides with an inherited member.
    expect(typeof taskTypeColorFor("toString", lightTheme)).toBe("string");
    expect(taskTypeColorFor("toString", lightTheme)).toBe(lightTheme.primary);
  });
});
