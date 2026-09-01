import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { Database } from "@/features/supabase/database.types";

import { supabase } from "@/features/supabase";

import { EventNotFoundError } from "./errors";
import { canApplyOptimistically, useOptimisticEventsStore } from "./optimisticEvents";
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
 * Bearbeitet einen Termin und zeigt die Änderungen sofort im Kalender, statt auf
 * die Server-Antwort zu warten. `onMutate` schreibt einen Overlay-Eintrag
 * (`kind: "update"`) in den Store, der die geänderten Felder anwendet — es sei
 * denn, `canApplyOptimistically` verneint (siehe dort). `onSettled` invalidiert
 * die Kalender-Queries **nur bei Erfolg** und gibt den Store-Eintrag erst danach
 * frei: andersherum blitzte der optimistische Stand für einen Frame durch, bevor
 * der Refetch ihn ersetzt — dieselbe Lehre, die `useDeleteEvent` in ADR-026
 * gezogen hat. Warum der Fehlerfall nicht invalidiert, steht am `if` selbst.
 *
 * **Zwei Grenzen, dieselbe Konsequenz.** `all`/`forward` **mit geändertem
 * Datum** bekommt gar keinen Eintrag, weil das Overlay dort die Nicht-Änderung
 * zeigte — die Begründung steht bei `canApplyOptimistically`. Und eine
 * mitgeschickte `vars.recurrence` (eine Änderung der Wiederholungsregel)
 * bekommt seit derselben Prüfung ebenfalls **gar keinen** Eintrag: Ändert der
 * Nutzer den Rhythmus einer Serie, ändert sich der gesamte Occurrence-Satz,
 * das vorherzusagen hieße, die RRULE-Expansion für eine ungespeicherte Regel
 * zu fahren. Ein Eintrag zeigte dann die alten Occurrence-Termine mit den
 * neuen Feldern — derselbe Fehler wie bei der Datumsänderung, nur an der Regel
 * statt am Datum. Der Refetch bringt eine Sekunde später die korrekten
 * Termine.
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
    onMutate: (vars) => {
      // Lieber gar nichts zeigen als die Nicht-Änderung dessen, was der Nutzer
      // gerade geändert hat — siehe `canApplyOptimistically`.
      if (!canApplyOptimistically(vars)) return undefined;
      return add({
        kind: "update",
        eventId: vars.eventId,
        occurrenceDate: vars.occurrenceDate,
        scope: vars.scope,
        changes: vars.changes,
      });
    },
    onError: (_err, _vars, id) => {
      if (id) remove(id);
    },
    onSettled: async (_data, error, _vars, id) => {
      // **Nur bei Erfolg invalidieren.** Bei einem Fehler ist serverseitig nichts
      // passiert, der Refetch brächte dieselben Daten zurück — und er kostet mehr
      // als nichts: TanStack ruft `onError` → `await onSettled` → **dann erst**
      // lehnt `mutateAsync` ab. Der Rollback (`remove`) läuft also sofort, der
      // Fehler-Toast wartete aber hinter einem Refetch, der bei toter Verbindung
      // mit `retry: 1` und Backoff ins Leere läuft. Im Funkloch sähe der Nutzer
      // seine Änderung kommen und wieder gehen, ohne ein Wort dazu. Das `if` ist
      // deshalb kein Sonderfall, den man „vereinfachen" darf.
      if (!error) {
        // Erst invalidieren, **dann** freigeben — sonst blitzt der alte Stand
        // für einen Frame durch.
        await qc.invalidateQueries({ queryKey: calendarKeys.all });
      }
      if (id) remove(id);
    },
  });
}
