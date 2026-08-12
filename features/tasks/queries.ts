import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { addDays, startOfDay, subDays } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";

import { supabase } from "@/features/supabase";

import type { TaskGroup, TaskSections, TaskStats, TaskTypeRow, TaskWithType } from "./types";

import { computeTaskStats, groupTasksByChild, groupTasksByDue } from "./stats";

const SELECT = "*, task_types(*)";

/**
 * How far back completed tasks stay in the window. Long enough to feed
 * "erledigt heute" and the running week's quota, short enough that the archive
 * never loads.
 */
const DONE_WINDOW_DAYS = 7;

export const taskKeys = {
  /** Everything tasks-related. Matches the lists *and* `types` by prefix. */
  all: ["tasks"] as const,
  /**
   * The task lists alone — every `family(doneSince)` entry, and deliberately
   * not `types`. Mutations scope their cancel/snapshot/patch/invalidate to
   * this: under `all` they would drop the type lookup's five-minute
   * `staleTime` on every write, and hand `TaskTypeRow[]` to updaters typed for
   * `TaskWithType[]`.
   */
  familyRoot: ["tasks", "family"] as const,
  family: (doneSince: string) => ["tasks", "family", doneSince] as const,
  types: ["tasks", "types"] as const,
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
  /** True while a pull-to-refresh (or any background refetch) is in flight. */
  isRefetching: boolean;
  error: unknown;
  /** Narrowed to `() => void`: callers hand this straight to `onRefresh`. */
  refetch: () => void;
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
    isRefetching: query.isRefetching,
    error: query.error,
    refetch: () => void query.refetch(),
  };
}

interface UseTaskResult {
  data: TaskWithType | undefined;
  isLoading: boolean;
}

/**
 * One task out of the family list — a selector, not a second query. The list
 * is the only cache entry the mutations patch; a `taskKeys.detail(id)` entry
 * would be a second copy of the same row that nothing invalidates.
 *
 * Consequence: a task outside the list's window (open, or completed less than
 * DONE_WINDOW_DAYS ago) resolves to `undefined`, and the edit screen renders
 * its not-found state. Reachable only by deep link — every row the list shows
 * is in the cache by definition.
 */
export function useTask(taskId: string): UseTaskResult {
  const { data, isLoading } = useFamilyTasks();
  const task = useMemo(() => data.find((row) => row.id === taskId), [data, taskId]);
  return { data: task, isLoading };
}

export function useTasksByChild(): TaskGroup[] {
  const { data } = useFamilyTasks();
  return useMemo(() => groupTasksByChild(data), [data]);
}

export function useTasksSections(): TaskSections {
  const { data } = useFamilyTasks();
  const today = useToday();
  // groupTasksByDue only reads the calendar day off `now`, so local midnight is
  // as good as the wall clock — and it keeps the memo from re-running.
  return useMemo(() => groupTasksByDue(data, today), [data, today]);
}

export function useTasksStats(): TaskStats {
  const { data } = useFamilyTasks();
  const today = useToday();
  // computeTaskStats only reads the calendar day off `now`, so local midnight
  // is as good as the wall clock — and it keeps the memo from re-running.
  return useMemo(() => computeTaskStats(data, today), [data, today]);
}

/**
 * The lookup behind a task's `type_id`. `task_types` holds global rows
 * (`family_id IS NULL`) next to family-owned ones and the RLS policy releases
 * both, so no filter is needed here either.
 */
export async function fetchTaskTypes(): Promise<TaskTypeRow[]> {
  const { data, error } = await supabase.from("task_types").select("*").order("slug");
  if (error) throw error;
  return data ?? [];
}

export function useTaskTypes(): UseQueryResult<TaskTypeRow[], Error> {
  return useQuery({
    queryKey: taskKeys.types,
    queryFn: fetchTaskTypes,
    staleTime: 5 * 60_000,
  });
}
