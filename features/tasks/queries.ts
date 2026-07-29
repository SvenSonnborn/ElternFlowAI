import { useQuery } from "@tanstack/react-query";
import { addDays, startOfDay, subDays } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";

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
 * Local midnight today, refreshed when the calendar day turns over. The
 * returned Date keeps its identity for the whole day, so the query key derived
 * from it holds still.
 *
 * Two triggers, because neither covers the other: the timer catches midnight
 * while the app is in the foreground, and the AppState listener catches the
 * midnights that passed while it was backgrounded — JS timers are suspended
 * there and would never fire.
 */
function useToday(): Date {
  const [today, setToday] = useState(() => startOfDay(new Date()));

  useEffect(() => {
    const sync = () => {
      const current = startOfDay(new Date());
      // Keep the old instance when the day has not changed, so consumers'
      // memos and the query key do not churn on every foreground event.
      setToday((prev) => (prev.getTime() === current.getTime() ? prev : current));
    };

    // `addDays` on a local midnight lands on the next local midnight, so this
    // survives DST shifts that a flat +24h would get wrong. The extra second
    // keeps a timer that fires a hair early from re-arming at ~0ms.
    const timer = setTimeout(sync, addDays(today, 1).getTime() - Date.now() + 1_000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") sync();
    });

    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [today]);

  return today;
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
