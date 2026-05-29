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
      const ops = createSupabaseEventOps(supabase);
      await applyEditScope({ ...vars, ops });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: calendarKeys.all });
    },
  });
}
