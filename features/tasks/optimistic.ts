import type { TaskUpdate, TaskWithType } from "./types";

/**
 * What an update is allowed to change. `is_done`, `completed_at` and
 * `completed_by` are missing on purpose: the tasks_completed_consistency CHECK
 * is symmetric, so those three only ever move together — through applyToggle.
 */
export type TaskChanges = Pick<
  TaskUpdate,
  "title" | "description" | "subject" | "due_date" | "due_time" | "child_id" | "type_id"
>;

/**
 * Replace one row via `mapper`, leaving every other element by reference. An
 * unknown id returns the array untouched: the cache is a snapshot, and a row
 * it does not hold is a normal state, not an error.
 */
function replaceTask(
  tasks: TaskWithType[],
  taskId: string,
  mapper: (task: TaskWithType) => TaskWithType,
): TaskWithType[] {
  let changed = false;
  const next = tasks.map((task) => {
    if (task.id !== taskId) return task;
    changed = true;
    return mapper(task);
  });
  return changed ? next : tasks;
}

/**
 * `completedAt` and `completedBy` are parameters rather than derived here so
 * the tests stay deterministic — same reason as computeTaskStats(tasks, now).
 * Marking done keeps the row: it falls inside the completed-tasks window and
 * stays visible.
 */
export function applyToggle(
  tasks: TaskWithType[],
  taskId: string,
  done: boolean,
  completedAt: string | null,
  completedBy: string | null,
): TaskWithType[] {
  return replaceTask(tasks, taskId, (task) => ({
    ...task,
    is_done: done,
    completed_at: done ? completedAt : null,
    completed_by: done ? completedBy : null,
  }));
}

export function applyUpdate(
  tasks: TaskWithType[],
  taskId: string,
  changes: TaskChanges,
): TaskWithType[] {
  return replaceTask(tasks, taskId, (task) => ({ ...task, ...changes }));
}

export function applyDelete(tasks: TaskWithType[], taskId: string): TaskWithType[] {
  const next = tasks.filter((task) => task.id !== taskId);
  return next.length === tasks.length ? tasks : next;
}
