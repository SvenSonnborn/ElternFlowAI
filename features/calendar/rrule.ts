import { Frequency, RRule } from "rrule";

import type { Database } from "@/features/supabase/database.types";

type EventRow = Database["public"]["Tables"]["events"]["Row"];

const FREQ_MAP: Record<NonNullable<EventRow["rrule_freq"]>, Frequency> = {
  daily: RRule.DAILY,
  weekly: RRule.WEEKLY,
  monthly: RRule.MONTHLY,
  yearly: RRule.YEARLY,
};

/**
 * Build an RRule from an event row's `rrule_*` columns.
 * Returns `null` for single-occurrence events (`rrule_freq IS NULL`).
 *
 * Single source of truth for row → RRule so the expander and the scope-split
 * logic can never disagree about what a series actually contains.
 */
export function buildRule(row: EventRow): RRule | null {
  if (!row.rrule_freq) return null;
  return new RRule({
    freq: FREQ_MAP[row.rrule_freq],
    interval: row.rrule_interval || 1,
    dtstart: new Date(row.start_at),
    until: row.rrule_until ? new Date(row.rrule_until) : null,
    count: row.rrule_count ?? null,
    byweekday: row.rrule_byweekday?.length ? row.rrule_byweekday.map((n) => n - 1) : null,
  });
}
