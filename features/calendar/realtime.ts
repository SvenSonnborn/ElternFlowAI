import type {
  REALTIME_SUBSCRIBE_STATES,
  RealtimePostgresChangesPayload,
  SupabaseClient,
} from "@supabase/supabase-js";

import { useEffect, useRef, useState } from "react";

import type { Database } from "@/features/supabase/database.types";

import { supabase } from "@/features/supabase";

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

export interface SubscribeToCalendarChangesArgs {
  client: SupabaseClient<Database>;
  familyId: string;
  onChange: (change: CalendarChange) => void;
  onStatus?: (status: CalendarRealtimeStatus) => void;
  now?: () => number;
}

/**
 * React-frei: Der Client kommt als Parameter, damit ein Test ihn ohne
 * `mock.module` ersetzen kann.
 *
 * Rückgabewert ist die Abmeldung.
 */
export function subscribeToCalendarChanges({
  client,
  familyId,
  onChange,
  onStatus,
  now,
}: SubscribeToCalendarChangesArgs): () => void {
  const channel = client.channel(calendarChannelTopic(familyId));

  for (const binding of calendarBindings(familyId)) {
    channel.on<Record<string, unknown>>("postgres_changes", binding, (payload) => {
      // Die Tabelle kommt aus dem Binding, nicht aus `payload.table`: Das
      // Binding ist typisiert, `payload.table` ist ein `string`, und die
      // Zuweisung auf die Union bräuchte eine Behauptung, die nichts prüft.
      onChange(normalizeChange(binding.table, payload, now));
    });
  }

  onStatus?.("subscribing");
  channel.subscribe((state) => {
    onStatus?.(toRealtimeStatus(state));
  });

  return () => {
    void client.removeChannel(channel);
  };
}

/**
 * `familyId` kommt als Parameter statt aus einem `useCurrentParent()` im Hook —
 * das hält ihn frei von der Query-Abhängigkeit und komponierbar.
 *
 * Ein `supabase.realtime.setAuth()` ruft der Hook bewusst nicht: `supabase-js`
 * schiebt den Zugriffstoken bei jedem Auth-Wechsel selbst an den Socket, und
 * abonniert wird ohnehin erst, wenn `familyId` steht — was eine aufgelöste
 * `parents`-Query und damit eine authentifizierte Sitzung voraussetzt.
 */
export function useCalendarRealtime(
  familyId: string | null,
  onChange: (change: CalendarChange) => void,
): { status: CalendarRealtimeStatus } {
  // Startwert `subscribing`: Steht beim ersten Render bereits ein `familyId`,
  // ist genau das der Zustand — abonniert wird gleich, geantwortet hat noch
  // niemand. Ohne `familyId` überschreibt die Ableitung unten den Wert ohnehin.
  const [channelStatus, setChannelStatus] = useState<CalendarRealtimeStatus>("subscribing");

  // Der Callback liegt in einer Ref, weil `react-hooks/exhaustive-deps` in
  // diesem Repo auf `error` steht: stünde er in der Dependency-Liste, baute
  // jeder Render mit frischer Closure die Subscription neu auf.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!familyId) return;
    // Der Kanal wird hier frisch erzeugt und im Cleanup entsorgt, nie über
    // Renders hinweg wiederverwendet: React hängt im StrictMode jeden Effekt
    // einmal ab und wieder an, und ein zweites `subscribe()` auf demselben
    // Kanal wirft „tried to subscribe multiple times".
    return subscribeToCalendarChanges({
      client: supabase,
      familyId,
      onChange: (change) => onChangeRef.current(change),
      onStatus: setChannelStatus,
    });
  }, [familyId]);

  // `idle` wird abgeleitet, nicht gespeichert. Ein `setStatus("idle")` im
  // Effekt wäre eine kaskadierende Zustandsänderung
  // (`react-hooks/set-state-in-effect`) — und sachlich falsch dazu: Ohne
  // `familyId` gibt es keine Subscription, deren Zustand man halten müsste.
  // `channelStatus` bleibt gespeichert, weil er vom Server kommt und sich nicht
  // aus den Argumenten ableiten lässt.
  return { status: familyId ? channelStatus : "idle" };
}
