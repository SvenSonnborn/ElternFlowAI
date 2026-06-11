import { describe, expect, test } from "bun:test";
import { addYears, format, subYears } from "date-fns";

import { ageFromBirthday } from "./age";

const iso = (d: Date) => format(d, "yyyy-MM-dd");

describe("ageFromBirthday", () => {
  test("a birthday exactly N years ago → N", () => {
    expect(ageFromBirthday(iso(subYears(new Date(), 8)))).toBe(8);
  });

  test("a birthday not yet reached this year rounds down", () => {
    // 8 years ago minus one day → the 9th birthday hasn't happened yet → still 8.
    const almostNine = new Date(subYears(new Date(), 9).getTime() + 24 * 60 * 60 * 1000);
    expect(ageFromBirthday(iso(almostNine))).toBe(8);
  });

  test("born today → 0", () => {
    expect(ageFromBirthday(iso(new Date()))).toBe(0);
  });

  test("a future birthday clamps to 0 (never negative)", () => {
    expect(ageFromBirthday(iso(addYears(new Date(), 3)))).toBe(0);
  });
});
