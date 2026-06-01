import { describe, expect, test } from "bun:test";

import { passwordStrength } from "./passwordStrength";

describe("passwordStrength", () => {
  test("returns 0 for empty", () => {
    expect(passwordStrength("").score).toBe(0);
    expect(passwordStrength("").label).toBe("weak");
  });
  test("scores by length + variety (1-4 bars)", () => {
    expect(passwordStrength("abc").score).toBe(1);
    expect(passwordStrength("abcdefgh").score).toBe(2);
    expect(passwordStrength("abcdefg1").score).toBe(3);
    expect(passwordStrength("Abcdefg1!").score).toBe(4);
  });
  test("acceptable starts at score >= 3", () => {
    expect(passwordStrength("abcdefg1").acceptable).toBe(true);
    expect(passwordStrength("abcdefgh").acceptable).toBe(false);
  });
});
