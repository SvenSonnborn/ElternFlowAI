import { describe, expect, test } from "bun:test";

import { mapTaskError, MissingParentError } from "./errors";

describe("mapTaskError", () => {
  test("MissingParentError → hw.error.notAuthenticated", () => {
    expect(mapTaskError(new MissingParentError())).toBe("hw.error.notAuthenticated");
  });

  test("Postgres 42501 (RLS refused) → hw.error.notAuthenticated", () => {
    expect(mapTaskError({ code: "42501", message: "new row violates row-level security" })).toBe(
      "hw.error.notAuthenticated",
    );
  });

  test("Postgres 23503 (foreign key) → hw.error.staleReference", () => {
    expect(mapTaskError({ code: "23503", message: "violates foreign key constraint" })).toBe(
      "hw.error.staleReference",
    );
  });

  test("AbortError → hw.error.network", () => {
    expect(mapTaskError({ name: "AbortError", message: "aborted" })).toBe("hw.error.network");
  });

  test("undici fetch failure message → hw.error.network", () => {
    expect(mapTaskError({ message: "TypeError: fetch failed" })).toBe("hw.error.network");
  });

  test("browser fetch failure message → hw.error.network", () => {
    expect(mapTaskError({ message: "TypeError: Failed to fetch" })).toBe("hw.error.network");
  });

  test("Postgres 23514 (CHECK) falls through to generic", () => {
    expect(mapTaskError({ code: "23514", message: "tasks_completed_consistency" })).toBe(
      "hw.error.generic",
    );
  });

  test("unrecognised error → hw.error.generic", () => {
    expect(mapTaskError({ message: "something odd" })).toBe("hw.error.generic");
  });

  test.each([null, undefined, "boom", 42])("non-object input %p → hw.error.generic", (input) => {
    expect(mapTaskError(input)).toBe("hw.error.generic");
  });
});
