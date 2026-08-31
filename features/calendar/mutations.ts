import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { Database } from "@/features/supabase/database.types";

import { supabase } from "@/features/supabase";

import { calendarKeys, fetchEventById } from "./queries";
import {
  applyDeleteScope,
  applyEditScope,
  createSupabaseEventOps,
  type EditScope,
  type EventChanges,
  type EventOps,
  type RecurrenceChanges,
} from "./recurrence";

export {
  useCreateEvent,
  recurrenceToRrule,
  rruleToRecurrence,
  parseRecurrenceCount,
  type CreateEventVars,
  type RecurrenceOption,
  type RruleFields,
} from "./createMutation";

type EventRow = Database["public"]["Tables"]["events"]["Row"];

export interface DeleteEventVars {
  scope: EditScope;
  eventId: string;
  occurrenceDate: string;
  isRecurring: boolean;
}

export interface UpdateEventVars extends DeleteEventVars {
  changes: EventChanges;
  recurrence?: RecurrenceChanges | null;
}

export interface UpdateEventDeps {
  fetchMaster: (eventId: string) => Promise<EventRow | null>;
  ops: EventOps;
}

export async function updateEvent(vars: UpdateEventVars, deps: UpdateEventDeps): Promise<void> {
  const master = await deps.fetchMaster(vars.eventId);
  if (!master) {
    throw new Error(`Event ${vars.eventId} not found`);
  }
  await applyEditScope({
    scope: vars.scope,
    eventId: vars.eventId,
    occurrenceDate: vars.occurrenceDate,
    isRecurring: vars.isRecurring,
    master,
    changes: vars.changes,
    recurrence: vars.recurrence,
    ops: deps.ops,
  });
}

export async function deleteEvent(vars: DeleteEventVars, deps: UpdateEventDeps): Promise<void> {
  const master = await deps.fetchMaster(vars.eventId);
  if (!master) {
    throw new Error(`Event ${vars.eventId} not found`);
  }
  await applyDeleteScope({
    scope: vars.scope,
    eventId: vars.eventId,
    occurrenceDate: vars.occurrenceDate,
    isRecurring: vars.isRecurring,
    master,
    ops: deps.ops,
  });
}

export function useDeleteEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: DeleteEventVars) => {
      const ops = createSupabaseEventOps(supabase);
      await deleteEvent(vars, { fetchMaster: fetchEventById, ops });
    },
    onSuccess: () => {
      // Zurückgegeben statt `void`: der Pending-Delete-Store gibt das Item erst
      // frei, wenn `mutateAsync` durch ist. Ohne das Warten blitzte es für einen
      // Frame zurück, bevor der Refetch es erneut entfernt.
      return qc.invalidateQueries({ queryKey: calendarKeys.all });
    },
  });
}

export function useUpdateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: UpdateEventVars) => {
      const ops = createSupabaseEventOps(supabase);
      await updateEvent(vars, { fetchMaster: fetchEventById, ops });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: calendarKeys.all });
    },
  });
}
