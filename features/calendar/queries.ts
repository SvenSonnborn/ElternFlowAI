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
 * nichts), seit `createSupabaseEventOps.updateMaster` im Konfliktfall
 * dieselbe Zeile nachliest, die auch die Queries laden. Ein zweiter,
 * handgeführter Spaltenstring dort wäre genau die Divergenz, die
 * `EventWithRelations` unbemerkt falsch werden ließe.
 */
export const EVENT_SELECT = "*, event_types(*), event_exceptions(*)";

export const calendarKeys = {
  all: ["calendar"] as const,
  /**
   * Präfix über **alle** Range-Queries — `range()` hängt nur Start und Ende an.
   * Existiert getrennt von `all`, weil `all` (`["calendar"]`) auch `types` und
   * `reminders` überdeckt, die eine Termin-Änderung nie betrifft.
   */
  eventsRoot: ["calendar", "events"] as const,
  /** Präfix über alle Einzeltermin-Queries. Siehe `eventsRoot`. */
  oneRoot: ["calendar", "event"] as const,
  range: (start: string, end: string) => ["calendar", "events", start, end] as const,
  one: (id: string) => ["calendar", "event", id] as const,
  types: ["calendar", "types"] as const,
  reminders: (eventId: string) => ["calendar", "reminders", eventId] as const,
};

export async function fetchEventsInRange(
  rangeStart: Date,
  rangeEnd: Date,
): Promise<EventWithRelations[]> {
  const startIso = rangeStart.toISOString();
  const endIso = rangeEnd.toISOString();
  const { data, error } = await supabase
    .from("events")
    .select(EVENT_SELECT)
    .lte("start_at", endIso)
    .or(`rrule_until.is.null,rrule_until.gte.${startIso}`);
  if (error) throw error;
  return data ?? [];
}

export async function fetchEventById(id: string): Promise<EventWithRelations | null> {
  const { data, error } = await supabase
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
