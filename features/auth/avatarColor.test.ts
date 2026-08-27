import { describe, expect, test } from "bun:test";

import { AVATAR_COLORS, deriveShort, normalizeShort } from "./avatarColor";

describe("deriveShort", () => {
  test("first two letters uppercase", () => {
    expect(deriveShort("Anna")).toBe("AN");
    expect(deriveShort("jan")).toBe("JA");
  });
  test("single letter is doubled", () => {
    expect(deriveShort("X")).toBe("XX");
  });
  test("empty falls back to ??", () => {
    expect(deriveShort("")).toBe("??");
    expect(deriveShort("   ")).toBe("??");
  });
  test("trims whitespace", () => {
    expect(deriveShort("  Maria  ")).toBe("MA");
  });
  test("multi-word uses first letter of each", () => {
    expect(deriveShort("Anna Becker")).toBe("AB");
  });
});

describe("AVATAR_COLORS", () => {
  test("provides 6 valid hex chips", () => {
    expect(AVATAR_COLORS.length).toBe(6);
    AVATAR_COLORS.forEach((c) => expect(/^#[0-9A-Fa-f]{6}$/.test(c)).toBe(true));
  });
});

describe("normalizeShort", () => {
  test("uppercases and trims what the user typed", () => {
    expect(normalizeShort("as", "Anna Sonnborn")).toBe("AS");
    expect(normalizeShort("  as  ", "Anna Sonnborn")).toBe("AS");
  });
  test("caps at three characters", () => {
    expect(normalizeShort("anna", "Anna Sonnborn")).toBe("ANN");
  });
  test("empty input falls back to the name-derived short", () => {
    expect(normalizeShort("", "Anna Becker")).toBe("AB");
    expect(normalizeShort("   ", "Anna Becker")).toBe("AB");
  });
  test("keeps the ?? floor when there is no name either", () => {
    // The column is NOT NULL, so something has to come out of here.
    expect(normalizeShort("", "")).toBe("??");
  });
});
