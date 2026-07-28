import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";

import { supabase } from "@/features/supabase";

import { calendarKeys } from "./queries";

/**
 * The two reminder offsets the event detail sheet exposes, in minutes before
 * the event starts (`patterns/calendar.md` → "Event detail sheet").
 * `reminders.offset_minutes` is a free int, so more offsets are a UI question,
 * not a schema one.
 */
export const REMINDER_OFFSET_24H = 1440;
export const REMINDER_OFFSET_1H = 60;

/**
 * Reminders hang off the master event, not off a single occurrence — the
 * schema has no `occurrence_date` column — so a switch toggled on a recurring
 * event applies to the whole series.
 */
export async function fetchEventReminderOffsets(eventId: string): Promise<number[]> {
  const { data, error } = await supabase
    .from("reminders")
    .select("offset_minutes")
    .eq("event_id", eventId);
  if (error) throw error;
  return (data ?? []).map((row) => row.offset_minutes);
}

export function useEventReminders(eventId: string): UseQueryResult<number[], Error> {
  return useQuery({
    queryKey: calendarKeys.reminders(eventId),
    queryFn: () => fetchEventReminderOffsets(eventId),
    enabled: !!eventId,
  });
}

export interface ToggleReminderVars {
  eventId: string;
  familyId: string;
  offsetMinutes: number;
  enabled: boolean;
}

/**
 * There is no unique index on (event_id, offset_minutes), so enabling deletes
 * before it inserts — that keeps a double-tap from stacking duplicate rows the
 * cron worker would later send twice.
 *
 * `family_id` is required by the generated Insert type; the
 * `reminders_set_family_id` trigger overwrites it from the event anyway, and
 * RLS validates event ownership independently.
 */
export async function toggleReminder(vars: ToggleReminderVars): Promise<void> {
  const { error: deleteError } = await supabase
    .from("reminders")
    .delete()
    .eq("event_id", vars.eventId)
    .eq("offset_minutes", vars.offsetMinutes);
  if (deleteError) throw deleteError;

  if (!vars.enabled) return;

  const { error } = await supabase.from("reminders").insert({
    event_id: vars.eventId,
    family_id: vars.familyId,
    offset_minutes: vars.offsetMinutes,
  });
  if (error) throw error;
}

export function useToggleReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: toggleReminder,
    onSettled: (_data, _error, vars) => {
      void qc.invalidateQueries({ queryKey: calendarKeys.reminders(vars.eventId) });
    },
  });
}
