import { useMutation, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/features/supabase";

import { calendarKeys } from "./queries";
import {
  applyDeleteScope,
  applyEditScope,
  createSupabaseEventOps,
  type ApplyDeleteScopeArgs,
  type ApplyEditScopeArgs,
} from "./recurrence";

type DeleteVars = Omit<ApplyDeleteScopeArgs, "ops">;
type UpdateVars = Omit<ApplyEditScopeArgs, "ops">;

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
    mutationFn: async (vars: UpdateVars) => {
      // Forward-edit on a recurring series needs the canonical master row for
      // insertSplitEvent (family_id/type_id/rrule_*). EventEditScreen currently
      // reconstructs `master` from CalendarOccurrence with empty placeholders —
      // safe for sample-mode (isRecurring=false) and for scope this/all on real
      // events (master isn't consumed), but the forward path would hit a FK
      // violation. See docs/TODO.md for the planned fetchEventById refetch fix.
      if (vars.scope === "forward" && vars.isRecurring && !vars.master.family_id) {
        throw new Error(
          "forward-edit on a recurring event requires the real master row; " +
            "load it via fetchEventById(eventId) before calling useUpdateEvent.mutate. " +
            "See docs/TODO.md.",
        );
      }
      const ops = createSupabaseEventOps(supabase);
      await applyEditScope({ ...vars, ops });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: calendarKeys.all });
    },
  });
}
