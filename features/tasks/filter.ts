import { endOfDay, endOfWeek, parseISO, startOfDay } from "date-fns";

import type { TaskWithType } from "./types";

export type StatusFilter = "all" | "open" | "done";

/**
 * Die vier Fälligkeits-Fenster spiegeln die Zählweise von `computeTaskStats`
 * wider, statt eine zweite danebenzustellen: `today` und `week` schließen
 * Überfälliges ein, genau wie die gleichnamigen Stat-Kacheln. Die Fenster
 * überlappen sich deshalb (`overdue ⊆ today ⊆ week`); `longTerm` ist das
 * Komplement zu `week`.
 */
export type DueFilter = "all" | "overdue" | "today" | "week" | "longTerm";

/**
 * Reservierte Sentinels der Kind-Dimension. `tasks.child_id` ist eine UUID und
 * kann mit keinem von beiden kollidieren, deshalb bleibt der Filterwert ein
 * schlichter String — das hält `FilterChipRow` generisch über Option-IDs.
 */
export const CHILD_ALL = "all";
/** Aufgaben, die an keinem Kind hängen: Eltern-Besorgungen und Hausarbeit. */
export const CHILD_NONE = "none";

export interface TaskFilter {
  status: StatusFilter;
  due: DueFilter;
  childId: string;
}

export const DEFAULT_TASK_FILTER: TaskFilter = {
  status: "all",
  due: "all",
  childId: CHILD_ALL,
};

function matchesStatus(task: TaskWithType, status: StatusFilter): boolean {
  if (status === "all") return true;
  return status === "done" ? task.is_done : !task.is_done;
}

function matchesChild(task: TaskWithType, childId: string): boolean {
  if (childId === CHILD_ALL) return true;
  if (childId === CHILD_NONE) return task.child_id === null;
  return task.child_id === childId;
}

function matchesDue(task: TaskWithType, due: DueFilter, now: Date): boolean {
  if (due === "all") return true;

  // parseISO, nie new Date(): `due_date` ist ein Postgres-`date`, und
  // new Date("2026-08-11") läse UTC-Mitternacht und verschöbe den Tag.
  const dueAt = parseISO(task.due_date);

  // Absichtlich ohne is_done-Prüfung: das Fenster beschreibt allein den
  // Fälligkeitstag, damit auch „Erledigt + Diese Woche" eine Bedeutung hat.
  if (due === "overdue") return dueAt < startOfDay(now);
  if (due === "today") return dueAt <= endOfDay(now);
  if (due === "week") return dueAt <= endOfWeek(now, { weekStartsOn: 1 });
  return dueAt > endOfWeek(now, { weekStartsOn: 1 });
}

/**
 * Die drei Dimensionen sind UND-verknüpft. `now` ist Parameter, damit die Tests
 * deterministisch bleiben — wie bei `computeTaskStats`.
 */
export function filterTasks(rows: TaskWithType[], f: TaskFilter, now: Date): TaskWithType[] {
  return rows.filter(
    (task) =>
      matchesStatus(task, f.status) &&
      matchesChild(task, f.childId) &&
      matchesDue(task, f.due, now),
  );
}

/** Steuert Reset-Button und die Wahl des Leerzustands. */
export function isFiltered(f: TaskFilter): boolean {
  return (
    f.status !== DEFAULT_TASK_FILTER.status ||
    f.due !== DEFAULT_TASK_FILTER.due ||
    f.childId !== DEFAULT_TASK_FILTER.childId
  );
}
