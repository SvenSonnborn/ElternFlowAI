import { describe, expect, test } from "bun:test";

import { lightTheme } from "@/design-system";

import { taskIconFor, taskTypeColorFor, taskTypeLabelKey } from "./palette";

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

describe("taskTypeLabelKey", () => {
  test("builds a catalog key from a slug", () => {
    expect(taskTypeLabelKey("hausaufgaben")).toBe("hw.type.hausaufgaben");
    expect(taskTypeLabelKey("besorgung")).toBe("hw.type.besorgung");
  });

  test("camel-cases a hyphenated slug", () => {
    expect(taskTypeLabelKey("eltern-aufgabe")).toBe("hw.type.elternAufgabe");
  });
});

describe("taskIconFor", () => {
  test("resolves the three slugs the migration seeds", () => {
    expect(taskIconFor("hausaufgaben", "book-open")).toBe("book-open");
    expect(taskIconFor("besorgung", "shopping-bag")).toBe("shopping-cart");
    expect(taskIconFor("eltern-aufgabe", "check-square")).toBe("check-square");
  });

  test("falls back to the row's icon when the slug is a family-owned one", () => {
    expect(taskIconFor("umzug", "book-open")).toBe("book-open");
  });

  test("translates an icon name the icon map does not carry", () => {
    // `shopping-bag` steht im Seed, die Icon-Map kennt nur `shopping-cart`.
    expect(taskIconFor("umzug", "shopping-bag")).toBe("shopping-cart");
  });

  test("falls back to a neutral icon when neither slug nor icon is known", () => {
    expect(taskIconFor("umzug", "rocket")).toBe("check-square");
    expect(taskIconFor("", "")).toBe("check-square");
  });
});

describe("taskIconFor · geerbte Schlüssel", () => {
  test("does not return an inherited member for a slug", () => {
    // `task_types.slug` ist bei familieneigenen Typen frei wählbar, und
    // `SLUG_TO_ICON["toString"]` läge sonst als Funktion in der Zeile.
    expect(taskIconFor("toString", "book-open")).toBe("book-open");
    expect(taskIconFor("__proto__", "book-open")).toBe("book-open");
  });

  test("does not return an inherited member for an icon name", () => {
    expect(taskIconFor("umzug", "toString")).toBe("check-square");
    expect(taskIconFor("umzug", "constructor")).toBe("check-square");
  });
});
