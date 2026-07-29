import { useQuery } from "@tanstack/react-query";
import { format, parseISO, subDays } from "date-fns";
import { useMemo } from "react";

import { supabase } from "@/features/supabase";

import type { TaskGroup, TaskStats, TaskWithType } from "./types";

import { computeTaskStats, groupTasksByChild } from "./stats";

const SELECT = "*, task_types(*)";

/**
 * How far back completed tasks stay in the window. Long enough to feed
 * "erledigt heute" and the running week's quota, short enough that the archive
 * never loads.
 */
const DONE_WINDOW_DAYS = 7;

export const taskKeys = {
  all: ["tasks"] as const,
  family: (doneSince: string) => ["tasks", "family", doneSince] as const,
};

/**
 * Every open task plus everything completed since `doneSince`.
 *
 * No `family_id` filter on purpose: `tasks` runs `force row level security`
 * with `family_id = current_family_id()` on all four commands, so the policy
 * is the single definition of "my family". A client-side filter would be a
 * second one, free to drift.
 */
export async function fetchFamilyTasks(doneSince: string): Promise<TaskWithType[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select(SELECT)
    .or(`is_done.eq.false,completed_at.gte.${doneSince}`)
    .order("due_date", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * Local midnight today. Recomputed each render but stable within a calendar
 * day, so the query key holds still — and rolls over if the app stays open
 * past midnight.
 */
function useToday(): Date {
  const dayKey = format(new Date(), "yyyy-MM-dd");
  return useMemo(() => parseISO(dayKey), [dayKey]);
}

interface UseFamilyTasksResult {
  data: TaskWithType[];
  isLoading: boolean;
  error: unknown;
}

export function useFamilyTasks(): UseFamilyTasksResult {
  const today = useToday();
  const doneSince = useMemo(() => subDays(today, DONE_WINDOW_DAYS).toISOString(), [today]);

  const query = useQuery({
    queryKey: taskKeys.family(doneSince),
    queryFn: () => fetchFamilyTasks(doneSince),
  });

  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}

export function useTasksByChild(): TaskGroup[] {
  const { data } = useFamilyTasks();
  return useMemo(() => groupTasksByChild(data), [data]);
}

export function useTasksStats(): TaskStats {
  const { data } = useFamilyTasks();
  const today = useToday();
  // computeTaskStats only reads the calendar day off `now`, so local midnight
  // is as good as the wall clock — and it keeps the memo from re-running.
  return useMemo(() => computeTaskStats(data, today), [data, today]);
}
