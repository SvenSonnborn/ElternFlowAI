import type { SupabaseClient } from "@supabase/supabase-js";

import { addDays, format, parseISO } from "date-fns";

import type { Database } from "@/features/supabase/database.types";

type EventRow = Database["public"]["Tables"]["events"]["Row"];

export type EditScope = "this" | "forward" | "all";

export interface EventChanges {
  title: string;
  start_at: string;
  end_at: string;
  location: string | null;
  description: string | null;
}

export interface EventOps {
  cancelOccurrence: (eventId: string, occurrenceDate: string) => Promise<void>;
  modifyOccurrence: (
    eventId: string,
    occurrenceDate: string,
    override: Partial<EventChanges>,
  ) => Promise<void>;
  deleteMaster: (eventId: string) => Promise<void>;
  updateMaster: (eventId: string, changes: EventChanges) => Promise<void>;
  setRruleUntil: (eventId: string, until: string) => Promise<void>;
  deleteExceptionsFromDate: (eventId: string, fromDateInclusive: string) => Promise<void>;
  insertSplitEvent: (master: EventRow, changes: EventChanges) => Promise<void>;
}

export interface ApplyDeleteScopeArgs {
  ops: EventOps;
  scope: EditScope;
  eventId: string;
  occurrenceDate: string;
  isRecurring: boolean;
  masterStartAt: Date;
}

export interface ApplyEditScopeArgs {
  ops: EventOps;
  scope: EditScope;
  eventId: string;
  occurrenceDate: string;
  isRecurring: boolean;
  master: EventRow;
  changes: EventChanges;
}

function dayBefore(isoDate: string): string {
  return format(addDays(parseISO(isoDate), -1), "yyyy-MM-dd");
}

function dateOnly(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export async function applyDeleteScope(args: ApplyDeleteScopeArgs): Promise<void> {
  const { ops, scope, eventId, occurrenceDate, isRecurring, masterStartAt } = args;

  if (scope === "this") {
    if (isRecurring) {
      await ops.cancelOccurrence(eventId, occurrenceDate);
      return;
    }
    await ops.deleteMaster(eventId);
    return;
  }

  if (scope === "forward" && isRecurring) {
    const cutoff = dayBefore(occurrenceDate);
    if (cutoff < dateOnly(masterStartAt)) {
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

export async function applyEditScope(args: ApplyEditScopeArgs): Promise<void> {
  const { ops, scope, eventId, occurrenceDate, isRecurring, master, changes } = args;

  if (scope === "this") {
    if (isRecurring) {
      await ops.modifyOccurrence(eventId, occurrenceDate, changes);
      return;
    }
    await ops.updateMaster(eventId, changes);
    return;
  }

  if (scope === "forward" && isRecurring) {
    const cutoff = dayBefore(occurrenceDate);
    if (cutoff < dateOnly(new Date(master.start_at))) {
      await ops.updateMaster(eventId, changes);
      return;
    }
    await ops.setRruleUntil(eventId, cutoff);
    await ops.insertSplitEvent(master, changes);
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

    updateMaster: async (eventId, changes) => {
      const { error } = await client.from("events").update(changes).eq("id", eventId);
      if (error) throw error;
    },

    setRruleUntil: async (eventId, until) => {
      const { error } = await client
        .from("events")
        .update({ rrule_until: until })
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

    insertSplitEvent: async (master, changes) => {
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
        rrule_until: null,
        rrule_count: null,
        created_by: master.created_by,
      });
      if (error) throw error;
    },
  };
}
