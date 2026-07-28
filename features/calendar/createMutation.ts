import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { Database } from "@/features/supabase/database.types";

import { supabase } from "@/features/supabase";

import { calendarKeys } from "./queries";

type EventRow = Database["public"]["Tables"]["events"]["Row"];

export type RecurrenceOption = "none" | "daily" | "weekdays" | "weekly" | "monthly";

export interface RruleFields {
  rrule_freq: EventRow["rrule_freq"];
  rrule_interval: number;
  rrule_byweekday: number[] | null;
}

export function recurrenceToRrule(opt: RecurrenceOption, startAt: Date): RruleFields {
  switch (opt) {
    case "none":
      return { rrule_freq: null, rrule_interval: 1, rrule_byweekday: null };
    case "daily":
      return { rrule_freq: "daily", rrule_interval: 1, rrule_byweekday: null };
    case "weekdays":
      return { rrule_freq: "weekly", rrule_interval: 1, rrule_byweekday: [1, 2, 3, 4, 5] };
    case "weekly": {
      // JS getDay(): 0=Sun … 6=Sat. ISO: 1=Mon … 7=Sun. Map: (n+6) % 7 + 1.
      const isoWeekday = ((startAt.getDay() + 6) % 7) + 1;
      return { rrule_freq: "weekly", rrule_interval: 1, rrule_byweekday: [isoWeekday] };
    }
    case "monthly":
      return { rrule_freq: "monthly", rrule_interval: 1, rrule_byweekday: null };
  }
}

/**
 * Inverse of `recurrenceToRrule`: which of the five V1 options an already-stored
 * rule corresponds to.
 *
 * Returns `null` when the rule is outside what the radio can express — a yearly
 * series, an interval > 1, or a weekly rule on days the option set has no name
 * for. Callers hide the editor in that case rather than let the radio silently
 * rewrite a rule it cannot represent.
 */
export function rruleToRecurrence(fields: RruleFields, startAt: Date): RecurrenceOption | null {
  if (!fields.rrule_freq) return "none";
  if ((fields.rrule_interval || 1) !== 1) return null;
  const days = fields.rrule_byweekday;
  switch (fields.rrule_freq) {
    case "daily":
      return days?.length ? null : "daily";
    case "monthly":
      return days?.length ? null : "monthly";
    case "weekly": {
      // rrule defaults a byweekday-less weekly rule to dtstart's weekday, which
      // is exactly what the "weekly" option produces.
      if (!days?.length) return "weekly";
      if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))) return "weekdays";
      const isoWeekday = ((startAt.getDay() + 6) % 7) + 1;
      if (days.length === 1 && days[0] === isoWeekday) return "weekly";
      return null;
    }
    case "yearly":
      return null;
  }
}

/**
 * Reads the "ends after N occurrences" input. Empty text means an unbounded
 * series (`null`); anything that is not a positive integer is rejected outright
 * so the form can flag it instead of quietly saving an unbounded series.
 */
export function parseRecurrenceCount(text: string): number | null | "invalid" {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 1) return "invalid";
  return parsed;
}

export interface CreateEventVars {
  familyId: string;
  typeId: string;
  childId: string | null;
  parentId: string | null;
  title: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  location: string | null;
  description: string | null;
  recurrence: RecurrenceOption;
  /** iCal COUNT — how many occurrences the series runs for. `null` = unbounded. */
  recurrenceCount: number | null;
  createdBy: string | null;
}

export async function createEvent(vars: CreateEventVars): Promise<void> {
  if (vars.childId !== null && vars.parentId !== null) {
    throw new Error("Event can be assigned to either a child or a parent, not both.");
  }
  const rrule = recurrenceToRrule(vars.recurrence, new Date(vars.startAt));
  const { error } = await supabase.from("events").insert({
    family_id: vars.familyId,
    type_id: vars.typeId,
    child_id: vars.childId,
    parent_id: vars.parentId,
    title: vars.title,
    description: vars.description,
    location: vars.location,
    start_at: vars.startAt,
    end_at: vars.endAt,
    all_day: vars.allDay,
    rrule_freq: rrule.rrule_freq,
    rrule_interval: rrule.rrule_interval,
    rrule_byweekday: rrule.rrule_byweekday,
    // A count only means anything on a recurring event; the DB also forbids
    // pairing it with an until (`events_rrule_count_xor_until`), which nothing
    // sets at create time.
    rrule_count: vars.recurrence === "none" ? null : vars.recurrenceCount,
    created_by: vars.createdBy,
  });
  if (error) throw error;
}

export function useCreateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createEvent,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: calendarKeys.all });
    },
  });
}
