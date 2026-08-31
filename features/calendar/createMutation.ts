import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { Database } from "@/features/supabase/database.types";

import { supabase } from "@/features/supabase";

import type { EventWithRelations } from "./expand";

import { useOptimisticEventsStore } from "./optimisticEvents";
import { calendarKeys } from "./queries";

type EventRow = Database["public"]["Tables"]["events"]["Row"];
type EventTypeRow = Database["public"]["Tables"]["event_types"]["Row"];

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

// Modul-Sequenz statt einer aus Formularwerten abgeleiteten Id: `startAt` und
// `typeId` sind deterministisch und wiederholen sich, sobald zwei Termine
// hintereinander ohne Zeit-/Typänderung angelegt werden — `EventCreateScreen`
// setzt `startAt` bei jedem Öffnen auf 09:00 des Zieldatums und `typeId` auf
// einen festen Default-Typ. Zwei optimistische Zeilen trügen dann dieselbe Id
// und, weil `start_at` ebenfalls gleich ist, dasselbe `occurrenceDate` — der
// React-Key `${eventId}-${occurrenceDate}-${date}` in KalenderScreen.tsx und
// DashboardScreen.tsx kollidierte, eine der beiden Occurrences verschwände bis
// zum nächsten Refetch. Eine Zeile lebt Sekundenbruchteile, eine Kollision über
// einen App-Lauf hinweg gibt es nicht.
let sequence = 0;

/**
 * Baut aus den Mutations-Variablen eine Master-Zeile in der Form, die
 * `fetchEventsInRange` liefert — damit sie durch dasselbe `expandEvents` laufen
 * kann wie die echten.
 *
 * Erfunden wird nur die `id` (Präfix `optimistic-`, damit sie in Logs erkennbar
 * ist) und die beiden Zeitstempel; alles andere kommt aus dem Formular oder aus
 * der bereits geladenen Typ-Zeile. Die Feldliste spiegelt bewusst den `insert`
 * in `createEvent` direkt darüber: Weicht sie ab, zeigt der Kalender etwas
 * anderes an, als gleich gespeichert wird.
 */
export function optimisticEventRow(vars: CreateEventVars, type: EventTypeRow): EventWithRelations {
  const rrule = recurrenceToRrule(vars.recurrence, new Date(vars.startAt));
  const now = new Date().toISOString();
  sequence += 1;
  return {
    id: `optimistic-${sequence}`,
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
    rrule_count: vars.recurrence === "none" ? null : vars.recurrenceCount,
    rrule_until: null,
    created_by: vars.createdBy,
    created_at: now,
    updated_at: now,
    event_types: type,
    event_exceptions: [],
  };
}

/**
 * Legt einen Termin an und zeigt ihn sofort im Kalender, statt auf die
 * Server-Antwort zu warten. `onMutate` schreibt bei Erfolg eine synthetische
 * Master-Zeile (`optimisticEventRow`) in den Overlay-Store — vorausgesetzt der
 * Typ des Termins steht bereits im Cache, sonst bleibt der Termin unsichtbar
 * bis zum Refetch (siehe Kommentar dort). `onSettled` invalidiert die
 * Kalender-Queries **nur bei Erfolg** und gibt den Store-Eintrag erst danach
 * frei: andersherum blitzte der optimistische Stand für einen Frame durch, bevor
 * der Refetch ihn ersetzt — dieselbe Lehre, die `useDeleteEvent` in ADR-026
 * gezogen hat. Warum der Fehlerfall nicht invalidiert, steht am `if` selbst.
 */
export function useCreateEvent() {
  const qc = useQueryClient();
  const add = useOptimisticEventsStore((state) => state.add);
  const remove = useOptimisticEventsStore((state) => state.remove);

  return useMutation({
    mutationFn: createEvent,
    onMutate: (vars) => {
      // Der Typ kommt aus dem Cache statt aus `useEventTypes()`: `onMutate`
      // braucht kein Abonnement, nur den aktuellen Stand — und ein Import aus
      // `./hooks` zöge über `useTheme` das nativewind-Runtime herein, das sich
      // unter `bun test` nicht laden lässt. Der Anlegen-Screen ruft
      // `useEventTypes()` ohnehin, der Eintrag ist beim Absenden also warm.
      const types = qc.getQueryData<EventTypeRow[]>(calendarKeys.types);
      // Ohne die Typ-Zeile wäre die Occurrence unvollständig (Farbe, Icon,
      // Beschriftung). Dann lieber nicht optimistisch als falsch: Der Termin
      // erscheint eben erst mit dem Refetch.
      const type = types?.find((row) => row.id === vars.typeId);
      if (!type) return undefined;
      return add({ kind: "create", row: optimisticEventRow(vars, type) });
    },
    onError: (_err, _vars, id) => {
      if (id) remove(id);
    },
    onSettled: async (_data, error, _vars, id) => {
      // **Nur bei Erfolg invalidieren.** Bei einem Fehler ist serverseitig
      // nichts passiert, der Refetch brächte dieselben Daten zurück — und er
      // kostet mehr als nichts: TanStack ruft `onError` → `await onSettled` →
      // **dann erst** lehnt `mutateAsync` ab. Der Rollback (`remove`) läuft also
      // sofort, der Fehler-Toast wartete aber hinter einem Refetch, der bei
      // toter Verbindung mit `retry: 1` und Backoff ins Leere läuft. Im
      // Funkloch sähe der Nutzer seinen Termin kommen und wieder gehen, ohne
      // ein Wort dazu. Das `if` ist deshalb kein Sonderfall, den man
      // „vereinfachen" darf.
      if (!error) {
        // Erst invalidieren, **dann** freigeben. Andersherum blitzt der alte
        // Stand für einen Frame durch, bevor der Refetch landet — dieselbe
        // Lehre, die `useDeleteEvent` in ADR-026 gezogen hat.
        await qc.invalidateQueries({ queryKey: calendarKeys.all });
      }
      if (id) remove(id);
    },
  });
}
