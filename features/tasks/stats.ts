import type { TaskGroup, TaskWithType } from "./types";

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
