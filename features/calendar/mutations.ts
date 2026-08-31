import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { Database } from "@/features/supabase/database.types";

import { supabase } from "@/features/supabase";

import { EventNotFoundError } from "./errors";
import { useOptimisticEventsStore } from "./optimisticEvents";
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
    throw new EventNotFoundError(vars.eventId);
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
    throw new EventNotFoundError(vars.eventId);
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

/**
 * Bearbeitet einen Termin und zeigt die Änderungen sofort im Kalender, statt auf die
 * Server-Antwort zu warten. `onMutate` schreibt bei Erfolg einen Overlay-Eintrag
 * (`kind: "update"`) in den Store, der die geänderten Felder anwendet.
 * `onSettled` invalidiert die Kalender-Queries und gibt den Store-Eintrag erst danach frei:
 * andersherum blitzte der optimistische Stand für einen Frame durch, bevor der
 * Refetch ihn ersetzt — dieselbe Lehre, die `useDeleteEvent` in ADR-026 gezogen hat.
 *
 * **Grenze:** `vars.recurrence` (eine Änderung der Wiederholungsregel) wird
 * **nicht** optimistisch abgebildet. Ändert der Nutzer den Rhythmus einer Serie,
 * verschieben sich die Occurrence-Termine selbst — das vorherzusagen hieße, die
 * RRULE-Expansion für eine ungespeicherte Regel zu fahren. Der Refetch bringt es
 * eine Sekunde später; bis dahin zeigt der Kalender die alten Termine mit den
 * neuen Feldern.
 */
export function useUpdateEvent() {
  const qc = useQueryClient();
  const add = useOptimisticEventsStore((state) => state.add);
  const remove = useOptimisticEventsStore((state) => state.remove);

  return useMutation({
    mutationFn: async (vars: UpdateEventVars) => {
      const ops = createSupabaseEventOps(supabase);
      await updateEvent(vars, { fetchMaster: fetchEventById, ops });
    },
    onMutate: (vars) =>
      add({
        kind: "update",
        eventId: vars.eventId,
        occurrenceDate: vars.occurrenceDate,
        scope: vars.scope,
        changes: vars.changes,
      }),
    onError: (_err, _vars, id) => {
      if (id) remove(id);
    },
    onSettled: async (_data, _err, _vars, id) => {
      // Erst invalidieren, **dann** freigeben — sonst blitzt der alte Stand für
      // einen Frame durch.
      await qc.invalidateQueries({ queryKey: calendarKeys.all });
      if (id) remove(id);
    },
  });
}
