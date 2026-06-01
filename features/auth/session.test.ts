import { describe, expect, test } from "bun:test";

import { selectStatus, type SessionStoreSnapshot } from "./session";

const empty: SessionStoreSnapshot = { session: null, initialized: false };
const ready: SessionStoreSnapshot = { session: null, initialized: true };
const authed: SessionStoreSnapshot = {
  session: { user: { id: "u1" }, access_token: "x" } as never,
  initialized: true,
};

describe("selectStatus", () => {
  test("returns 'loading' before init completes", () => {
    expect(selectStatus(empty)).toBe("loading");
  });
  test("returns 'unauthenticated' after init with no session", () => {
    expect(selectStatus(ready)).toBe("unauthenticated");
  });
  test("returns 'authenticated' once a session is set", () => {
    expect(selectStatus(authed)).toBe("authenticated");
  });
});
