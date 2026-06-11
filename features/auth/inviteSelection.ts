/** The invitation fields needed to decide whether a row is still usable. */
export interface ReusableInvite {
  token: string;
  used_at: string | null;
  expires_at: string;
  created_at: string;
}

/**
 * Picks the invitation a family can re-share instead of minting a new one:
 * the newest row that is still unused and not yet expired. Returns `null` when
 * none qualifies (caller should then create a fresh invite). Pure — keeps the
 * "one pending invite per family" invariant testable without hitting the DB.
 */
export function pickReusableInvite<T extends ReusableInvite>(
  invites: T[],
  nowIso: string,
): T | null {
  const now = Date.parse(nowIso);
  const usable = invites.filter((i) => i.used_at == null && Date.parse(i.expires_at) > now);
  if (usable.length === 0) return null;
  return usable.reduce((newest, i) =>
    Date.parse(i.created_at) > Date.parse(newest.created_at) ? i : newest,
  );
}
