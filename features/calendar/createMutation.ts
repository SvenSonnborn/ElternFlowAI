import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { Database } from "@/features/supabase/database.types";

import { supabase } from "@/features/supabase";

import { calendarKeys } from "./queries";

type EventRow = Database["public"]["Tables"]["events"]["Row"];

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
    created_by: vars.createdBy,
  });
  if (error) throw error;
}

export function useCreateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createEvent,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: calendarKeys.all });
    },
  });
}
