import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { Database } from "@/features/supabase/database.types";

import { supabase } from "@/features/supabase";

import { calendarKeys, fetchEventById } from "./queries";
import {
  applyDeleteScope,
  applyEditScope,
  createSupabaseEventOps,
  type ApplyDeleteScopeArgs,
  type EditScope,
  type EventChanges,
  type EventOps,
} from "./recurrence";

type EventRow = Database["public"]["Tables"]["events"]["Row"];

type DeleteVars = Omit<ApplyDeleteScopeArgs, "ops">;

export interface UpdateEventVars {
  scope: EditScope;
  eventId: string;
  occurrenceDate: string;
  isRecurring: boolean;
  changes: EventChanges;
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
    ops: deps.ops,
  });
}

export function useDeleteEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: DeleteVars) => {
      const ops = createSupabaseEventOps(supabase);
      await applyDeleteScope({ ...vars, ops });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: calendarKeys.all });
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
