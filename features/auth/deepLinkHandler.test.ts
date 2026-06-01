import { describe, expect, test } from "bun:test";

import { parseDeepLink, type ParsedDeepLink } from "./deepLinkHandler";

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
