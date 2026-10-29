import type { SupabaseClient } from "@supabase/supabase-js";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { Database } from "@/features/supabase/database.types";

import { supabase } from "@/features/supabase";

import type { EventWithRelations } from "./expand";

import { OPTIMISTIC_EVENT_ID_PREFIX, useOptimisticEventsStore } from "./optimisticEvents";
import { calendarKeys } from "./queries";
import { instantToFloating } from "./timezone";

type EventRow = Database["public"]["Tables"]["events"]["Row"];
type EventTypeRow = Database["public"]["Tables"]["event_types"]["Row"];

export type RecurrenceOption = "none" | "daily" | "weekdays" | "weekly" | "monthly";

export interface RruleFields {
  rrule_freq: EventRow["rrule_freq"];
  rrule_interval: number;
  rrule_byweekday: number[] | null;
}

/**
 * Baut die fünf V1-Optionen auf `RruleFields`, für `"weekly"` inklusive
 * `rrule_byweekday`.
 *
 * `timeZone` ist die Zone des Termins (`vars.timezone` beim Anlegen, die Zone
 * der bearbeiteten Occurrence beim Bearbeiten) — die Regel wird dort auch
 * ausgewertet (ADR-033). `startAt.getDay()` läse den Wochentag in der Zone
 * des **Lesers** und träfe für einen Termin nahe Mitternacht den falschen Tag,
 * sobald sich Leser- und Terminzone unterscheiden (ADR-034).
 */
export function recurrenceToRrule(
  opt: RecurrenceOption,
  startAt: Date,
  timeZone: string,
): RruleFields {
  switch (opt) {
    case "none":
      return { rrule_freq: null, rrule_interval: 1, rrule_byweekday: null };
    case "daily":
      return { rrule_freq: "daily", rrule_interval: 1, rrule_byweekday: null };
    case "weekdays":
      return { rrule_freq: "weekly", rrule_interval: 1, rrule_byweekday: [1, 2, 3, 4, 5] };
    case "weekly": {
      // Der Wochentag gilt in der Zone des Termins — dort wird die Regel auch
      // ausgewertet. `startAt.getDay()` läse ihn in der Zone des Lesers und
      // träfe für einen Termin nahe Mitternacht den falschen Tag (ADR-034).
      // `getUTCDay()` auf dem floating `Date` ist der Wochentag der Wandzeit.
      // JS getDay(): 0=Sun … 6=Sat. ISO: 1=Mon … 7=Sun. Map: (n+6) % 7 + 1.
      const isoWeekday = ((instantToFloating(startAt, timeZone).getUTCDay() + 6) % 7) + 1;
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
 *
 * `timeZone` must be the **same** zone `recurrenceToRrule` used to write
 * `rrule_byweekday` (the event's zone, not the reader's) — the round-trip only
 * holds if both directions read the weekday in the same wall-clock space. Until
 * this fix, this side still read `startAt.getDay()` in the **device's** zone
 * while `recurrenceToRrule` had already moved to `instantToFloating(startAt,
 * timeZone)`: for a start near midnight the two disagreed, the weekly option
 * came back `null`, and `EventEditScreen` hid the recurrence editor for a
 * perfectly representable rule (ADR-034 follow-up, Befund 1 of the final
 * review — see the round-trip test in `createMutation.test.ts` for the
 * concrete case).
 */
export function rruleToRecurrence(
  fields: RruleFields,
  startAt: Date,
  timeZone: string,
): RecurrenceOption | null {
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
      const isoWeekday = ((instantToFloating(startAt, timeZone).getUTCDay() + 6) % 7) + 1;
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
  /**
   * Die `id` des neuen Termins, von der App vergeben (`newRequestId` in
   * `app-sections/shared`, Spec §6). Damit ist das Anlegen idempotent: Ein
   * Retry nach verlorener Antwort trägt dieselben `vars` und legt keinen
   * zweiten Termin an, die Eindeutigkeit erzwingt der Primärschlüssel.
   */
  id: string;
  familyId: string;
  typeId: string;
  childId: string | null;
  parentId: string | null;
  title: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  /** IANA-Zone, in der die Wanduhrzeit dieses Termins gilt. Siehe `deviceTimeZone`. */
  timezone: string;
  location: string | null;
  description: string | null;
  recurrence: RecurrenceOption;
  /** iCal COUNT — how many occurrences the series runs for. `null` = unbounded. */
  recurrenceCount: number | null;
  createdBy: string | null;
}

/**
 * Legt einen Termin unter der `id` aus `vars` an — idempotent (Spec §6).
 *
 * `upsert` mit `ignoreDuplicates` wird zu `insert … on conflict (id) do
 * nothing`: Steht die `id` schon, schreibt Postgres nichts und meldet keinen
 * Fehler, die Antwort ist nur leer. RLS verlangt dafür nichts Zusätzliches —
 * `do nothing` braucht anders als `do update` weder Update- noch
 * Select-Policy auf der vorhandenen Zeile.
 *
 * Eine leere Antwort heißt deshalb nur „die id gab es schon", nicht „es ist
 * meiner". Die Sichtbarkeitsprüfung danach trennt die beiden Fälle: Sieht der
 * Aufrufer die Zeile, ist es sein eigener erster Versuch, dessen Antwort
 * verloren ging — Erfolg. Sieht er sie nicht, gehört die id einem Termin
 * einer fremden Familie; angelegt wurde nichts, und ein Erfolg wäre gelogen.
 * Bei einer UUID v4 aus einem CSPRNG ist das praktisch nur über einen Fehler
 * im Client erreichbar.
 *
 * `client` ist injizierbar, damit die Integrationstests gegen die lokale
 * Instanz einen eigenen, angemeldeten Client einsetzen können; die App ruft
 * ohne zweites Argument.
 */
export async function createEvent(
  vars: CreateEventVars,
  client: SupabaseClient<Database> = supabase,
): Promise<void> {
  if (vars.childId !== null && vars.parentId !== null) {
    throw new Error("Event can be assigned to either a child or a parent, not both.");
  }
  const rrule = recurrenceToRrule(vars.recurrence, new Date(vars.startAt), vars.timezone);
  const { data, error } = await client
    .from("events")
    .upsert(
      {
        id: vars.id,
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
        timezone: vars.timezone,
        rrule_freq: rrule.rrule_freq,
        rrule_interval: rrule.rrule_interval,
        rrule_byweekday: rrule.rrule_byweekday,
        // Zum Anlegezeitpunkt gibt es nie ein UNTIL (das entsteht erst beim
        // Forward-Löschen). Explizit `null` statt ausgelassen, damit die beiden
        // Event-Schreiber im Client — hier und `optimisticEventRow` darunter —
        // dieselbe Spaltenmenge führen; `eventColumns.test.ts` hält sie darauf
        // fest. Der dritte, die abgespaltene Hälfte eines Forward-Splits, lebt
        // seit Block 7 in `apply_event_change` (`insert_split_event`).
        rrule_until: null,
        // A count only means anything on a recurring event; the DB also forbids
        // pairing it with an until (`events_rrule_count_xor_until`), which nothing
        // sets at create time.
        rrule_count: vars.recurrence === "none" ? null : vars.recurrenceCount,
        created_by: vars.createdBy,
      },
      { onConflict: "id", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw error;
  if (data.length > 0) return;

  const { data: visible, error: lookupError } = await client
    .from("events")
    .select("id")
    .eq("id", vars.id)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (!visible) {
    throw new Error(
      `createEvent: id ${vars.id} gehört einem fremden Termin, angelegt wurde nichts`,
    );
  }
}

// Modul-Sequenz statt einer aus Formularwerten abgeleiteten Id: `startAt` und
// `typeId` sind deterministisch und wiederholen sich, sobald zwei Termine
// hintereinander ohne Zeit-/Typänderung angelegt werden — `EventCreateScreen`
// setzt `startAt` bei jedem Öffnen auf 09:00 des Zieldatums und `typeId` auf
// einen festen Default-Typ. Zwei optimistische Zeilen trügen dann dieselbe Id
// und, weil `start_at` ebenfalls gleich ist, denselben `occurrenceKey` — der
// React-Key `${eventId}-${occurrenceKey}-${date}` in KalenderScreen.tsx und
// DashboardScreen.tsx kollidierte, eine der beiden Occurrences verschwände bis
// zum nächsten Refetch. Eine Zeile lebt Sekundenbruchteile, eine Kollision über
// einen App-Lauf hinweg gibt es nicht.
let sequence = 0;

/**
 * Baut aus den Mutations-Variablen eine Master-Zeile in der Form, die
 * `fetchEventsInRange` liefert — damit sie durch dasselbe `expandEvents` laufen
 * kann wie die echten.
 *
 * Erfunden werden nur die `id` und die beiden Zeitstempel; alles andere kommt
 * aus dem Formular oder aus der bereits geladenen Typ-Zeile. Die Feldliste
 * spiegelt bewusst den `upsert` in `createEvent` direkt darüber: Weicht sie ab,
 * zeigt der Kalender etwas anderes an, als gleich gespeichert wird.
 *
 * **Warum nicht `vars.id`**, obwohl die echte Zeile genau diese Id bekommt:
 * Eine echte UUID verlöre den Präfix `optimistic-`, an dem
 * `isOptimisticEventId` die Zeile erkennt und die Navigation zum noch nicht
 * gespeicherten Termin sperrt. Die echte Id trägt der Eintrag daneben als
 * `serverId`; darüber ordnen `appliesToView` und `visibleOccurrences` ihn der
 * Serverzeile zu.
 */
export function optimisticEventRow(vars: CreateEventVars, type: EventTypeRow): EventWithRelations {
  const rrule = recurrenceToRrule(vars.recurrence, new Date(vars.startAt), vars.timezone);
  const now = new Date().toISOString();
  sequence += 1;
  return {
    id: `${OPTIMISTIC_EVENT_ID_PREFIX}${sequence}`,
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
    timezone: vars.timezone,
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
    // Nicht `mutationFn: createEvent`: TanStack ruft mit einem zweiten Argument
    // (dem Mutations-Kontext), und `createEvent` nähme es als Supabase-Client.
    mutationFn: (vars: CreateEventVars) => createEvent(vars),
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
      if (!type) {
        // Nicht stumm degradieren. Beim ersten Absenden ist der Cache garantiert
        // warm (`canSave` verlangt `typeId`), der **Retry** aus dem Fehler-Toast
        // ist es aber nicht: Ein Fehler-Toast läuft nie ab, und nach `gcTime`
        // (5 min) ist die Types-Query weg. Dann erscheint der Termin erst mit dem
        // Refetch — sichtbar nur hier im Log.
        console.warn("[useCreateEvent] Event-Typ nicht im Cache, kein optimistischer Eintrag", {
          typeId: vars.typeId,
          cached: types?.length ?? 0,
        });
        return undefined;
      }
      return add({ kind: "create", row: optimisticEventRow(vars, type), serverId: vars.id });
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
