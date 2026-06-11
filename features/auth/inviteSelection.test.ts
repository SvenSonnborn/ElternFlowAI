import { describe, expect, it } from "bun:test";

import { pickReusableInvite, type ReusableInvite } from "./inviteSelection";

const NOW = "2026-06-11T12:00:00.000Z";

function inv(p: Partial<ReusableInvite>): ReusableInvite {
  return {
    token: "t",
    used_at: null,
    expires_at: "2026-06-18T12:00:00.000Z",
    created_at: "2026-06-11T11:00:00.000Z",
    ...p,
  };
}

describe("pickReusableInvite", () => {
  it("returns null for an empty list", () => {
    expect(pickReusableInvite([], NOW)).toBeNull();
  });

  it("reuses a single unused, non-expired invite", () => {
    const i = inv({ token: "keep" });
    expect(pickReusableInvite([i], NOW)?.token).toBe("keep");
  });

  it("ignores used invites", () => {
    const i = inv({ token: "used", used_at: "2026-06-11T11:30:00.000Z" });
    expect(pickReusableInvite([i], NOW)).toBeNull();
  });

  it("ignores expired invites", () => {
    const i = inv({ token: "old", expires_at: "2026-06-11T11:59:59.000Z" });
    expect(pickReusableInvite([i], NOW)).toBeNull();
  });

  it("picks the newest reusable invite when several exist", () => {
    const older = inv({ token: "older", created_at: "2026-06-11T10:00:00.000Z" });
    const newer = inv({ token: "newer", created_at: "2026-06-11T11:30:00.000Z" });
    expect(pickReusableInvite([older, newer], NOW)?.token).toBe("newer");
    // order-independent
    expect(pickReusableInvite([newer, older], NOW)?.token).toBe("newer");
  });

  it("skips expired/used and keeps the newest valid one", () => {
    const expired = inv({ token: "exp", expires_at: "2026-06-10T12:00:00.000Z" });
    const used = inv({ token: "used", used_at: "2026-06-11T11:00:00.000Z" });
    const valid = inv({ token: "valid", created_at: "2026-06-11T11:45:00.000Z" });
    expect(pickReusableInvite([expired, used, valid], NOW)?.token).toBe("valid");
  });
});
