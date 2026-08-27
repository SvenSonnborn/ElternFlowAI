const DAY_MS = 24 * 60 * 60 * 1000;

/** How much life is left in a pending invitation, ready for display. */
export interface InviteExpiry {
  /** Whole days remaining, rounded up. `0` once the invite has expired. */
  daysLeft: number;
  /** Less than a day left (or already gone) — worth a warning tone. */
  isUrgent: boolean;
}

/**
 * Turns a `family_invitations.expires_at` timestamp into the two values the
 * Familie card renders. Pure, so the "läuft in n Tagen ab" copy is testable
 * without a clock or a DB.
 *
 * Days round *up*: 4 days and 23 hours reads as "5 days", never as "4", so the
 * label never undersells the time a partner actually has. An unparseable or
 * past timestamp collapses to `0` rather than leaking `NaN` into the UI.
 */
export function inviteExpiry(expiresAt: string, nowIso: string): InviteExpiry {
  const msLeft = Date.parse(expiresAt) - Date.parse(nowIso);
  if (!Number.isFinite(msLeft) || msLeft <= 0) return { daysLeft: 0, isUrgent: true };
  const daysLeft = Math.ceil(msLeft / DAY_MS);
  return { daysLeft, isUrgent: daysLeft <= 1 };
}
