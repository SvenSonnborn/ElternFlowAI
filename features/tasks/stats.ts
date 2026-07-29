import { endOfDay, endOfWeek, isSameDay, parseISO, startOfWeek } from "date-fns";

import type { TaskGroup, TaskStats, TaskWithType } from "./types";

/** `due_date` is a plain `YYYY-MM-DD` string — lexical order is date order. */
function byDueDateAsc(a: TaskWithType, b: TaskWithType): number {
  return a.due_date.localeCompare(b.due_date);
}

function byCompletedAtDesc(a: TaskWithType, b: TaskWithType): number {
  return (b.completed_at ?? "").localeCompare(a.completed_at ?? "");
}

export function groupTasksByChild(tasks: TaskWithType[]): TaskGroup[] {
  // Sorting first makes the Map's insertion order the "earliest due date
  // first" order the caller sees.
  const buckets = new Map<string | null, TaskWithType[]>();
  for (const task of [...tasks].sort(byDueDateAsc)) {
    const bucket = buckets.get(task.child_id);
    if (bucket) bucket.push(task);
    else buckets.set(task.child_id, [task]);
  }

  const groups: TaskGroup[] = [];
  for (const [childId, bucket] of buckets) {
    const open = bucket.filter((t) => !t.is_done).sort(byDueDateAsc);
    const done = bucket.filter((t) => t.is_done).sort(byCompletedAtDesc);
    groups.push({ childId, tasks: [...open, ...done], openCount: open.length });
  }

  // Parent errands and chores sort to the end. Array.sort is stable, so the
  // child groups keep their due-date order.
  return groups.sort((a, b) => Number(a.childId === null) - Number(b.childId === null));
}

/**
 * All counters read `now` at day granularity only — the caller may pass any
 * time of day. `now` is a parameter so the tests stay deterministic.
 */
export function computeTaskStats(tasks: TaskWithType[], now: Date): TaskStats {
  const todayEnd = endOfDay(now);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

  let dueToday = 0;
  let thisWeek = 0;
  let open = 0;
  let doneToday = 0;
  let doneThisWeek = 0;

  for (const task of tasks) {
    if (task.is_done) {
      // The tasks_completed_consistency CHECK guarantees completed_at is set
      // whenever is_done — the guard is for rows read through a stale cache.
      if (!task.completed_at) continue;
      const completedAt = new Date(task.completed_at);
      if (isSameDay(completedAt, now)) doneToday += 1;
      if (completedAt >= weekStart && completedAt <= weekEnd) doneThisWeek += 1;
      continue;
    }

    open += 1;
    // `due_date` is a Postgres `date`: parseISO reads it as local midnight,
    // new Date() would read it as UTC midnight and shift the day.
    const dueAt = parseISO(task.due_date);
    // Overdue folds into "today" — patterns/homework.md derives urgency as
    // `today` if `due <= end of today`.
    if (dueAt <= todayEnd) dueToday += 1;
    if (dueAt <= weekEnd) thisWeek += 1;
  }

  const weekTotal = doneThisWeek + thisWeek;
  const donePct = weekTotal === 0 ? 0 : Math.round((doneThisWeek / weekTotal) * 100);

  return { dueToday, thisWeek, donePct, open, doneToday };
}
