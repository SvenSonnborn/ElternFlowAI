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

  if (scope === "forward") {
    const cutoff = dayBefore(occurrenceDate);
    if (cutoff < dateOnly(masterStartAt)) {
      await ops.deleteMaster(eventId);
      return;
    }
    await ops.setRruleUntil(eventId, cutoff);
    await ops.deleteExceptionsFromDate(eventId, occurrenceDate);
    return;
  }

  // scope === "all"
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

  if (scope === "forward") {
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

  // scope === "all"
  await ops.updateMaster(eventId, changes);
}
