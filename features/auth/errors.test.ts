import { describe, expect, test } from "bun:test";

import { mapAuthError } from "./errors";

describe("mapAuthError", () => {
  test("Invalid login credentials → auth.error.invalidCredentials", () => {
    expect(mapAuthError({ message: "Invalid login credentials" })).toBe(
      "auth.error.invalidCredentials",
    );
  });
  test("User already registered → auth.error.emailTaken", () => {
    expect(mapAuthError({ message: "User already registered" })).toBe("auth.error.emailTaken");
  });
  test("Email not confirmed → auth.error.emailNotConfirmed", () => {
    expect(mapAuthError({ message: "Email not confirmed" })).toBe("auth.error.emailNotConfirmed");
  });
  test("password length error → auth.error.weakPassword", () => {
    expect(mapAuthError({ message: "Password should be at least 8 characters" })).toBe(
      "auth.error.weakPassword",
    );
  });
  test("Postgres 23505 → auth.error.alreadyInFamily", () => {
    expect(mapAuthError({ code: "23505", message: "user already belongs to a family" })).toBe(
      "auth.error.alreadyInFamily",
    );
  });
  test("Postgres 22023 → auth.error.linkExpired", () => {
    expect(mapAuthError({ code: "22023", message: "invitation invalid or expired" })).toBe(
      "auth.error.linkExpired",
    );
  });
  test("Postgres 42501 → auth.error.notAuthenticated (caller should redirect)", () => {
    expect(mapAuthError({ code: "42501", message: "not authenticated" })).toBe(
      "auth.error.notAuthenticated",
    );
  });
  test("Network-like → auth.error.network", () => {
    expect(mapAuthError({ message: "Network request failed" })).toBe("auth.error.network");
    expect(mapAuthError({ name: "AbortError", message: "aborted" })).toBe("auth.error.network");
  });
  test("Unknown shape → auth.error.generic", () => {
    expect(mapAuthError({ message: "something exploded" })).toBe("auth.error.generic");
    expect(mapAuthError(null)).toBe("auth.error.generic");
    expect(mapAuthError(undefined)).toBe("auth.error.generic");
  });
});
