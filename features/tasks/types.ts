import type { Database } from "@/features/supabase/database.types";

export type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
export type TaskInsert = Database["public"]["Tables"]["tasks"]["Insert"];
export type TaskUpdate = Database["public"]["Tables"]["tasks"]["Update"];
export type TaskTypeRow = Database["public"]["Tables"]["task_types"]["Row"];

/**
 * A task row with its joined type lookup. `task_types` is nullable because
 * PostgREST returns `null` for an embedded row the caller may not read —
 * same shape as `EventWithRelations` in features/calendar/expand.ts.
 */
export type TaskWithType = TaskRow & {
  task_types: TaskTypeRow | null;
};

/**
 * One child's tasks. `childId: null` collects the tasks that hang on no child
 * at all — parent errands and chores.
 */
export interface TaskGroup {
  childId: string | null;
  tasks: TaskWithType[];
  openCount: number;
}

/** The three sections of patterns/homework.md V2, as `groupTasksByDue` returns them. */
export interface TaskSections {
  today: TaskWithType[];
  upcoming: TaskWithType[];
  doneToday: TaskWithType[];
}

export interface TaskStats {
  /** Open, `due_date <= end of today` — overdue tasks fold in here. */
  dueToday: number;
  /** Open, `due_date <= end of the ISO week`. Includes `dueToday`. */
  thisWeek: number;
  /** 0..100, rounded. Completed vs. total for the running ISO week. */
  donePct: number;
  open: number;
  doneToday: number;
}
