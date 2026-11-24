import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/features/supabase/database.types";

import { supabase } from "@/features/supabase";

import type { EventWithRelations } from "./expand";

type EventTypeRow = Database["public"]["Tables"]["event_types"]["Row"];

/**
 * Die Spalten, die `EventWithRelations` verlangt — beide gehören zusammen:
 * Fehlt hier eine Relation, ist der Typ eine Lüge, und `expandEvents` liest
 * `event_exceptions` ins Leere.
 *
 * Exportiert (und damit umbenannt — `SELECT` sagt außerhalb dieser Datei
 * nichts), damit jeder, der einen Master für den Schreibpfad lädt, dieselbe
 * Zeile bekommt wie die Queries — auch ein Test, der `updateEvent` mit eigenem
 * Client und eigenem `fetchMaster` gegen die lokale Instanz fährt. Die
 * Nachlese nach einem Konflikt braucht genau diese Form, weil der
 * Konflikt-Dialog sie expandiert. Ein zweiter, handgeführter Spaltenstring
 * wäre genau die Divergenz, die `EventWithRelations` und den Konflikt-Dialog
 * unbemerkt falsch werden ließe.
 */
export const EVENT_SELECT = "*, event_types(*), event_exceptions(*)";

export const calendarKeys = {
  all: ["calendar"] as const,
  /**
   * Präfix über **alle** Range-Queries — `range()` hängt nur Start und Ende an.
   * Existiert getrennt von `all`, weil `all` (`["calendar"]`) auch `types` und
   * `reminders` überdeckt. Reminder einer bestehenden Event-Id ändert eine
   * Termin-Änderung nie; der Forward-Split legt sie nur unter einer neuen Id
   * an, die noch nie im Cache stand (ADR-058).
   */
  eventsRoot: ["calendar", "events"] as const,
  /** Präfix über alle Einzeltermin-Queries. Siehe `eventsRoot`. */
  oneRoot: ["calendar", "event"] as const,
  range: (start: string, end: string) => ["calendar", "events", start, end] as const,
  one: (id: string) => ["calendar", "event", id] as const,
  types: ["calendar", "types"] as const,
  reminders: (eventId: string) => ["calendar", "reminders", eventId] as const,
};

/**
 * Lädt die Termine eines Kalenderfensters in der Form von `EVENT_SELECT` —
 * über die RPC `events_in_range`, nicht über `.from("events")`: Eine Serie, deren
 * Occurrence ein Override weit hinter `rrule_until` oder vor den Serienstart
 * verschiebt, findet nur der Vergleich mit dem Zeitpunkt aus
 * `event_exceptions.override`. PostgREST vergleicht Werte aus jsonb aber nur
 * als Text, ein Override mit Offset (`+02:00`) sortierte falsch; die Funktion
 * castet in SQL. Sie liefert eher zu viel, `expandEvents` filtert exakt.
 *
 * `client` ist injizierbar wie bei `fetchEventById` (Integrationstests); die App
 * ruft ohne drittes Argument. Deshalb, wie dort, nie als nacktes
 * `queryFn: fetchEventsInRange` übergeben — TanStack Query riefe die Funktion
 * mit seinem Kontext als Argument auf.
 */
export async function fetchEventsInRange(
  rangeStart: Date,
  rangeEnd: Date,
  client: SupabaseClient<Database> = supabase,
): Promise<EventWithRelations[]> {
  const { data, error } = await client
    .rpc("events_in_range", {
      p_start: rangeStart.toISOString(),
      p_end: rangeEnd.toISOString(),
    })
    .select(EVENT_SELECT);
  if (error) throw error;
  return data ?? [];
}

/**
 * Lädt einen Termin in der Form von `EVENT_SELECT`. `client` ist injizierbar,
 * damit die Integrationstests gegen die lokale Instanz mit einem eigenen,
 * angemeldeten Client lesen (wie bei `createEvent`); die App ruft ohne zweites
 * Argument. Deshalb nie als nacktes `queryFn: fetchEventById` übergeben —
 * TanStack Query reichte seinen Kontext als zweites Argument durch.
 */
export async function fetchEventById(
  id: string,
  client: SupabaseClient<Database> = supabase,
): Promise<EventWithRelations | null> {
  const { data, error } = await client
    .from("events")
    .select(EVENT_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function fetchEventTypes(): Promise<EventTypeRow[]> {
  const { data, error } = await supabase.from("event_types").select("*").order("slug");
  if (error) throw error;
  return data ?? [];
}
