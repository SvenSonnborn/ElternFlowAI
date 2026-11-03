import { describe, expect, test } from "bun:test";

import { parseDeepLink, redirectInviteSystemPath, type ParsedDeepLink } from "./deepLinkHandler";

describe("parseDeepLink", () => {
  test("confirm URL with token_hash and type=email", () => {
    const result = parseDeepLink("elternflow://auth/confirm?token_hash=abc123&type=email");
    const expected: ParsedDeepLink = {
      kind: "auth-confirm",
      tokenHash: "abc123",
      otpType: "email",
    };
    expect(result).toEqual(expected);
  });

  test("recovery URL", () => {
    const result = parseDeepLink("elternflow://auth/recovery?token_hash=xyz789&type=recovery");
    expect(result).toEqual({
      kind: "auth-recovery",
      tokenHash: "xyz789",
      otpType: "recovery",
    });
  });

  test("invite URL with token in path", () => {
    const result = parseDeepLink("elternflow://invite/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    expect(result).toEqual({
      kind: "invite",
      token: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    });
  });

  test("missing token_hash → null (malformed)", () => {
    expect(parseDeepLink("elternflow://auth/confirm?type=email")).toBeNull();
  });

  test("unknown host → null", () => {
    expect(parseDeepLink("elternflow://settings")).toBeNull();
  });

  test("non-elternflow scheme → null", () => {
    expect(parseDeepLink("https://example.com/auth/confirm")).toBeNull();
  });

  test("invalid URL string → null", () => {
    expect(parseDeepLink("not a url")).toBeNull();
    expect(parseDeepLink("")).toBeNull();
  });
});

describe("redirectInviteSystemPath", () => {
  const uuid = "0b9a4a52-5f0e-4c8e-9a43-2d1f6a7c9e10";
  test("Einladungslinks gehen beim Kaltstart auf /", () => {
    const initial = true;
    expect(redirectInviteSystemPath({ path: `elternflow://invite/${uuid}`, initial })).toBe("/");
    expect(redirectInviteSystemPath({ path: `/invite/${uuid}`, initial })).toBe("/");
  });

  test("Einladungslinks bei laufender App lassen den Screen stehen", () => {
    const initial = false;
    expect(redirectInviteSystemPath({ path: `elternflow://invite/${uuid}`, initial })).toBeNull();
    expect(redirectInviteSystemPath({ path: `/invite/${uuid}`, initial })).toBeNull();
  });

  for (const initial of [true, false]) {
    test(`alles andere bleibt unverändert (initial=${initial})`, () => {
      for (const path of [
        "elternflow://auth/confirm?token_hash=x&type=email",
        "/event/abc",
        "::::",
      ]) {
        expect(redirectInviteSystemPath({ path, initial })).toBe(path);
      }
    });
  }
});
