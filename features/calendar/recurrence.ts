import type { SupabaseClient } from "@supabase/supabase-js";

import { addDays, format, parseISO } from "date-fns";

import type { Database } from "@/features/supabase/database.types";

import { buildRule } from "./rrule";

type EventRow = Database["public"]["Tables"]["events"]["Row"];

export type EditScope = "this" | "forward" | "all";

export interface EventChanges {
  title: string;
  start_at: string;
  end_at: string;
  location: string | null;
  description: string | null;
}

/**
 * A series-level rule change. Separate from `EventChanges` because the latter
 * doubles as the per-occurrence override JSON, where rrule columns have no
 * meaning — a single occurrence cannot carry a recurrence rule.
 *
 * All five columns travel together so the write is total: partial updates could
 * leave a count and an until set at once, which the DB rejects
 * (`events_rrule_count_xor_until`).
 */
export interface RecurrenceChanges {
  rrule_freq: EventRow["rrule_freq"];
  rrule_interval: number;
  rrule_byweekday: number[] | null;
  rrule_count: number | null;
  rrule_until: string | null;
}

export interface EventOps {
  cancelOccurrence: (eventId: string, occurrenceDate: string) => Promise<void>;
  modifyOccurrence: (
    eventId: string,
    occurrenceDate: string,
    override: Partial<EventChanges>,
  ) => Promise<void>;
  deleteMaster: (eventId: string) => Promise<void>;
  updateMaster: (
    eventId: string,
    changes: EventChanges,
    recurrence?: RecurrenceChanges,
  ) => Promise<void>;
  deleteAllExceptions: (eventId: string) => Promise<void>;
  setRruleUntil: (eventId: string, until: string) => Promise<void>;
  setRruleCount: (eventId: string, count: number) => Promise<void>;
  deleteExceptionsFromDate: (eventId: string, fromDateInclusive: string) => Promise<void>;
  insertSplitEvent: (
    master: EventRow,
    changes: EventChanges,
    rruleCount: number | null,
  ) => Promise<void>;
}

export interface ApplyDeleteScopeArgs {
  ops: EventOps;
  scope: EditScope;
  eventId: string;
  occurrenceDate: string;
  isRecurring: boolean;
  master: EventRow;
}

export interface ApplyEditScopeArgs {
  ops: EventOps;
  scope: EditScope;
  eventId: string;
  occurrenceDate: string;
  isRecurring: boolean;
  master: EventRow;
  changes: EventChanges;
  /**
   * Set only when the user edited the series rule. A rule change redefines the
   * whole series, so it is applied on the "all" path — the edit form forces
   * that scope whenever this is present.
   */
  recurrence?: RecurrenceChanges | null;
}

function dayBefore(isoDate: string): string {
  return format(addDays(parseISO(isoDate), -1), "yyyy-MM-dd");
}

function dateOnly(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

/**
 * How many occurrences of a series fall strictly before `occurrenceDate`.
 *
 * iCal COUNT is relative to dtstart, so a bounded series cannot be truncated by
 * writing an UNTIL (the DB even forbids it — `events_rrule_count_xor_until`).
 * Splitting one means re-deriving both halves: the head keeps what it has
 * already consumed, the tail gets `count - consumed`.
 *
 * Occurrences are compared as local `yyyy-MM-dd` keys because that is exactly
 * how `expand.ts` derives the `occurrenceDate` the caller hands us.
 */
function consumedBefore(master: EventRow, occurrenceDate: string): number {
  const rule = buildRule(master);
  if (!rule) return 0;
  // `all()` is safe here: only ever called for count-bounded series.
  return rule.all().filter((d) => dateOnly(d) < occurrenceDate).length;
}

export async function applyDeleteScope(args: ApplyDeleteScopeArgs): Promise<void> {
  const { ops, scope, eventId, occurrenceDate, isRecurring, master } = args;

  if (scope === "this") {
    if (isRecurring) {
      await ops.cancelOccurrence(eventId, occurrenceDate);
      return;
    }
    await ops.deleteMaster(eventId);
    return;
  }

  if (scope === "forward" && isRecurring) {
    if (master.rrule_count != null) {
      const consumed = consumedBefore(master, occurrenceDate);
      if (consumed === 0) {
        await ops.deleteMaster(eventId);
        return;
      }
      await ops.setRruleCount(eventId, consumed);
      await ops.deleteExceptionsFromDate(eventId, occurrenceDate);
      return;
    }
    const cutoff = dayBefore(occurrenceDate);
    if (cutoff < dateOnly(new Date(master.start_at))) {
      await ops.deleteMaster(eventId);
      return;
    }
    await ops.setRruleUntil(eventId, cutoff);
    await ops.deleteExceptionsFromDate(eventId, occurrenceDate);
    return;
  }

  // scope === "all" (or "forward" on a non-recurring event — same outcome)
  await ops.deleteMaster(eventId);
}

/** Whether a rule change actually moves any occurrence, ignoring no-op edits. */
function ruleDiffers(master: EventRow, next: RecurrenceChanges): boolean {
  const sameDays =
    (master.rrule_byweekday ?? []).length === (next.rrule_byweekday ?? []).length &&
    (master.rrule_byweekday ?? []).every((d) => next.rrule_byweekday?.includes(d));
  return !(
    master.rrule_freq === next.rrule_freq &&
    master.rrule_interval === next.rrule_interval &&
    sameDays &&
    master.rrule_count === next.rrule_count &&
    master.rrule_until === next.rrule_until
  );
}

export async function applyEditScope(args: ApplyEditScopeArgs): Promise<void> {
  const { ops, scope, eventId, occurrenceDate, isRecurring, master, changes, recurrence } = args;

  if (recurrence) {
    // Exceptions are keyed by the occurrence dates the *old* rule produced, so a
    // real rule change clears them — before the rule moves, not after. These are
    // separate, non-transactional calls: failing here leaves the old rule and its
    // own exceptions intact, whereas the other order would leave a new rule with
    // stale exceptions cancelling occurrences the user never touched. Same
    // damage-minimising reasoning as the forward-split path below.
    if (ruleDiffers(master, recurrence)) {
      await ops.deleteAllExceptions(eventId);
    }
    await ops.updateMaster(eventId, changes, recurrence);
    return;
  }

  if (scope === "this") {
    if (isRecurring) {
      await ops.modifyOccurrence(eventId, occurrenceDate, changes);
      return;
    }
    await ops.updateMaster(eventId, changes);
    return;
  }

  if (scope === "forward" && isRecurring) {
    if (master.rrule_count != null) {
      const consumed = consumedBefore(master, occurrenceDate);
      if (consumed === 0) {
        await ops.updateMaster(eventId, changes);
        return;
      }
      const remaining = master.rrule_count - consumed;
      // Create the tail before shortening the head. These are separate,
      // non-transactional calls: if the insert fails after the head was already
      // truncated, the occurrences from the cutoff on are gone for good. The
      // other order merely risks a visible duplicate the user can delete.
      // remaining === 0 → the cutoff sits past the end of the series, so there
      // is nothing left to carry over into a split event.
      if (remaining > 0) {
        await ops.insertSplitEvent(master, changes, remaining);
      }
      await ops.setRruleCount(eventId, consumed);
      await ops.deleteExceptionsFromDate(eventId, occurrenceDate);
      return;
    }
    const cutoff = dayBefore(occurrenceDate);
    if (cutoff < dateOnly(new Date(master.start_at))) {
      await ops.updateMaster(eventId, changes);
      return;
    }
    // Tail first — same durability reasoning as the count path above.
    await ops.insertSplitEvent(master, changes, null);
    await ops.setRruleUntil(eventId, cutoff);
    await ops.deleteExceptionsFromDate(eventId, occurrenceDate);
    return;
  }

  // scope === "all" (or "forward" on a non-recurring event — same outcome)
  await ops.updateMaster(eventId, changes);
}

export function createSupabaseEventOps(client: SupabaseClient<Database>): EventOps {
  return {
    cancelOccurrence: async (eventId, occurrenceDate) => {
      const { error } = await client.from("event_exceptions").upsert(
        {
          event_id: eventId,
          occurrence_date: occurrenceDate,
          action: "cancelled",
          override: null,
        },
        { onConflict: "event_id,occurrence_date" },
      );
      if (error) throw error;
    },

    modifyOccurrence: async (eventId, occurrenceDate, override) => {
      const { error } = await client.from("event_exceptions").upsert(
        {
          event_id: eventId,
          occurrence_date: occurrenceDate,
          action: "modified",
          override,
        },
        { onConflict: "event_id,occurrence_date" },
      );
      if (error) throw error;
    },

    deleteMaster: async (eventId) => {
      const { error } = await client.from("events").delete().eq("id", eventId);
      if (error) throw error;
    },

    updateMaster: async (eventId, changes, recurrence) => {
      const { error } = await client
        .from("events")
        .update(recurrence ? { ...changes, ...recurrence } : changes)
        .eq("id", eventId);
      if (error) throw error;
    },

    deleteAllExceptions: async (eventId) => {
      const { error } = await client.from("event_exceptions").delete().eq("event_id", eventId);
      if (error) throw error;
    },

    setRruleUntil: async (eventId, until) => {
      const { error } = await client
        .from("events")
        .update({ rrule_until: until })
        .eq("id", eventId);
      if (error) throw error;
    },

    setRruleCount: async (eventId, count) => {
      const { error } = await client
        .from("events")
        .update({ rrule_count: count })
        .eq("id", eventId);
      if (error) throw error;
    },

    deleteExceptionsFromDate: async (eventId, fromDateInclusive) => {
      const { error } = await client
        .from("event_exceptions")
        .delete()
        .eq("event_id", eventId)
        .gte("occurrence_date", fromDateInclusive);
      if (error) throw error;
    },

    insertSplitEvent: async (master, changes, rruleCount) => {
      const { error } = await client.from("events").insert({
        family_id: master.family_id,
        type_id: master.type_id,
        child_id: master.child_id,
        title: changes.title,
        description: changes.description,
        location: changes.location,
        start_at: changes.start_at,
        end_at: changes.end_at,
        all_day: master.all_day,
        rrule_freq: master.rrule_freq,
        rrule_interval: master.rrule_interval,
        rrule_byweekday: master.rrule_byweekday,
        // A series is bounded by UNTIL or COUNT, never both
        // (`events_rrule_count_xor_until`). An absolute UNTIL still applies to
        // the tail unchanged; a COUNT was re-derived for the split by the
        // caller, since count is relative to dtstart and the tail starts later.
        rrule_until: rruleCount == null ? master.rrule_until : null,
        rrule_count: rruleCount,
        created_by: master.created_by,
      });
      if (error) throw error;
    },
  };
}
