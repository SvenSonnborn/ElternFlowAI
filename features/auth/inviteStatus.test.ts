import { describe, expect, it } from "bun:test";

import { inviteExpiry } from "./inviteStatus";

const NOW = "2026-06-11T12:00:00.000Z";

describe("inviteExpiry", () => {
  it("rounds a whole number of days up to the next full day", () => {
    // 5 days minus a minute is still shown as "5 days left" — never round a
    // remaining day down to the day the user would lose.
    expect(inviteExpiry("2026-06-16T11:59:00.000Z", NOW).daysLeft).toBe(5);
  });

  it("reports the exact day count for a whole-day remainder", () => {
    expect(inviteExpiry("2026-06-18T12:00:00.000Z", NOW).daysLeft).toBe(7);
  });

  it("reports 1 day for anything inside the last 24 hours", () => {
    expect(inviteExpiry("2026-06-12T11:00:00.000Z", NOW).daysLeft).toBe(1);
    expect(inviteExpiry("2026-06-11T12:00:01.000Z", NOW).daysLeft).toBe(1);
  });

  it("clamps an already-expired invite to 0 days", () => {
    expect(inviteExpiry("2026-06-10T12:00:00.000Z", NOW).daysLeft).toBe(0);
    expect(inviteExpiry(NOW, NOW).daysLeft).toBe(0);
  });

  it("flags the last 24 hours as urgent", () => {
    expect(inviteExpiry("2026-06-12T11:00:00.000Z", NOW).isUrgent).toBe(true);
  });

  it("does not flag an invite with more than a day left", () => {
    expect(inviteExpiry("2026-06-13T12:00:00.000Z", NOW).isUrgent).toBe(false);
  });

  it("treats an expired invite as urgent", () => {
    expect(inviteExpiry("2026-06-10T12:00:00.000Z", NOW).isUrgent).toBe(true);
  });

  it("reports an unparseable timestamp as expired rather than NaN", () => {
    const result = inviteExpiry("not-a-date", NOW);
    expect(result.daysLeft).toBe(0);
    expect(result.isUrgent).toBe(true);
  });
});
