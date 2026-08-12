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

/**
 * Die Sektionen des Aufgaben-Screens. `overdue` und `doneRecent` sind mit der
 * Filter-Iteration dazugekommen: Überfälliges lag vorher unsichtbar in `today`,
 * und älter als heute Erledigtes lag ungenutzt im 7-Tage-Cache.
 */
export interface TaskSections {
  /** Offen, `due_date` vor heute. */
  overdue: TaskWithType[];
  /** Offen, `due_date` ist heute. */
  today: TaskWithType[];
  /** Offen, `due_date` nach heute — inklusive langfristiger Aufgaben. */
  upcoming: TaskWithType[];
  doneToday: TaskWithType[];
  /** Erledigt vor heute, innerhalb des `DONE_WINDOW_DAYS`-Fensters. */
  doneRecent: TaskWithType[];
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
