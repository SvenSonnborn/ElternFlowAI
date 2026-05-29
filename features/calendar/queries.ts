import { supabase } from "@/features/supabase";

import type { EventWithRelations } from "./expand";

const SELECT = "*, event_types(*), event_exceptions(*)";

export const calendarKeys = {
  all: ["calendar"] as const,
  range: (start: string, end: string) => ["calendar", "events", start, end] as const,
  one: (id: string) => ["calendar", "event", id] as const,
};

export async function fetchEventsInRange(
  rangeStart: Date,
  rangeEnd: Date,
): Promise<EventWithRelations[]> {
  const startIso = rangeStart.toISOString();
  const endIso = rangeEnd.toISOString();
  const { data, error } = await supabase
    .from("events")
    .select(SELECT)
    .lte("start_at", endIso)
    .or(`rrule_until.is.null,rrule_until.gte.${startIso}`);
  if (error) throw error;
  return data ?? [];
}

export async function fetchEventById(id: string): Promise<EventWithRelations | null> {
  const { data, error } = await supabase.from("events").select(SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ?? null;
}
