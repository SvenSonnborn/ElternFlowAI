import { differenceInYears, parseISO } from "date-fns";

/**
 * Derives a child's age in whole years from a stored birthday.
 *
 * The `children` table stores only `birthday` (a `date`), not a separate age —
 * age is always computed at render time so it never goes stale. Accepts the ISO
 * date string (`YYYY-MM-DD`) Supabase returns for `date` columns.
 */
export function ageFromBirthday(birthday: string): number {
  // Clamp to 0 so a (data-entry) birthday in the future never renders a negative age.
  return Math.max(0, differenceInYears(new Date(), parseISO(birthday)));
}
