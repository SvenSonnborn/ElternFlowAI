import type {
  REALTIME_SUBSCRIBE_STATES,
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";

/**
 * Realtime-Kanal für den Kalender: ein Topic pro Familie, zwei
 * `postgres_changes`-Bindings auf `events` und `event_exceptions`.
 *
 * Der Schnitt in reine Funktionen, eine React-freie Kernfunktion und einen
 * dünnen Hook ist keine Stilfrage, sondern die einzige Form, in der das Modul
 * hier prüfbar ist: Im Repo gibt es keinen Pfad, auf dem React-Komponenten
 * unter `bun test` rendern, und `features/calendar/hooks.ts` ist über
 * `useTheme` → nativewind-Runtime nicht einmal ladbar (siehe docs/TODO.md).
 *
 * Spec: docs/superpowers/specs/2026-09-01-realtime-calendar-channel-design.md
 * Entscheidung: ADR-028.
 */

export type CalendarRealtimeTable = "events" | "event_exceptions";
export type CalendarChangeType = "INSERT" | "UPDATE" | "DELETE";

export type CalendarRealtimeStatus =
  /** Kein `familyId` — es gibt nichts zu abonnieren. */
  "idle" | "subscribing" | "subscribed" | "timedOut" | "error" | "closed";

export interface CalendarChange {
  table: CalendarRealtimeTable;
  type: CalendarChangeType;
  /** Primärschlüssel der geänderten Zeile. Bei DELETE das einzige belastbare Feld. */
  rowId: string | null;
  /**
   * Die Event-Id, an der eine Invalidierung hängen kann: bei `events` die eigene
   * `id`, bei `event_exceptions` die `event_id`.
   *
   * **Bei DELETE immer `null`.** RLS greift bei `postgres_changes` nicht auf
   * DELETE — Postgres kann eine gelöschte Zeile nicht mehr gegen eine Policy
   * prüfen —, der Payload trägt deshalb nur den Primärschlüssel, und der einer
   * Exception verrät ihre Event-Id nicht. Das steht im Typ und nicht in einem
   * Kommentar, damit ein Konsument die Fallunterscheidung nicht übersehen kann.
   */
  eventId: string | null;
  receivedAt: number;
}

export interface CalendarBinding {
  event: "*";
  schema: "public";
  table: CalendarRealtimeTable;
  /** PostgREST-Ausdruck. Fehlt, wo die Tabelle keine `family_id`-Spalte hat. */
  filter?: string;
}

export const CALENDAR_CHANNEL_PREFIX = "calendar";

export function calendarChannelTopic(familyId: string): string {
  return `${CALENDAR_CHANNEL_PREFIX}:${familyId}`;
}

/**
 * Ein Kanal trägt beide Bindings — zwei Topics kosteten zwei WebSocket-
 * Abonnements und zwei Zustände für etwas, das nur gemeinsam gebraucht wird.
 */
export function calendarBindings(familyId: string): CalendarBinding[] {
  return [
    { event: "*", schema: "public", table: "events", filter: `family_id=eq.${familyId}` },
    // Ohne Filter: `event_exceptions` hat keine `family_id`-Spalte, nur
    // `event_id`. RLS filtert INSERT und UPDATE über die
    // `exists (… events … current_family_id())`-Policy; DELETE bleibt
    // ungefiltert (siehe `CalendarChange.eventId`). Die Spalte zu
    // denormalisieren löste den DELETE-Fall nicht mit — verworfen in ADR-028.
    { event: "*", schema: "public", table: "event_exceptions" },
  ];
}

export function toRealtimeStatus(state: `${REALTIME_SUBSCRIBE_STATES}`): CalendarRealtimeStatus {
  switch (state) {
    case "SUBSCRIBED":
      return "subscribed";
    case "TIMED_OUT":
      return "timedOut";
    case "CLOSED":
      return "closed";
    case "CHANNEL_ERROR":
      return "error";
  }
}

/**
 * `unknown` statt `object` als Eingabe: Der Payload-Union trägt `new` bzw. `old`
 * je nach Variante als `{}`, und `{}` ist in TypeScript **nicht** `object`
 * zuweisbar (es schließt Primitive ein). Die Laufzeitprüfung hier kostet nichts
 * und erspart eine Behauptung, die nichts prüft.
 */
function stringField(row: unknown, key: string): string | null {
  if (typeof row !== "object" || row === null) return null;
  const value = (row as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

export function normalizeChange(
  table: CalendarRealtimeTable,
  payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
  now: () => number = Date.now,
): CalendarChange {
  const type = payload.eventType;
  // Bei DELETE steht die Zeile in `old` und trägt nur den Primärschlüssel.
  const row: unknown = type === "DELETE" ? payload.old : payload.new;
  const rowId = stringField(row, "id");
  const eventId =
    type === "DELETE" ? null : table === "events" ? rowId : stringField(row, "event_id");

  return { table, type, rowId, eventId, receivedAt: now() };
}
