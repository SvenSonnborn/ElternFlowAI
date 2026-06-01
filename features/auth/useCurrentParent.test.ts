import { describe, expect, test } from "bun:test";

import { currentParentKey, shouldFetchParent } from "./useCurrentParent";

describe("currentParentKey", () => {
  test("includes the user id so different users have different caches", () => {
    expect(currentParentKey("u1")).toEqual(["currentParent", "u1"]);
    expect(currentParentKey("u2")).toEqual(["currentParent", "u2"]);
  });
  test("uses a sentinel when no user id is known", () => {
    expect(currentParentKey(null)).toEqual(["currentParent", "anonymous"]);
  });
});

describe("shouldFetchParent", () => {
  test("enables only when authenticated", () => {
    expect(shouldFetchParent("loading")).toBe(false);
    expect(shouldFetchParent("unauthenticated")).toBe(false);
    expect(shouldFetchParent("authenticated")).toBe(true);
  });
});
