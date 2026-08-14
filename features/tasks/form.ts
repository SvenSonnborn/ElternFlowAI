import { format, isValid, parse, parseISO } from "date-fns";

import type { CreateTaskVars } from "./mutations";
import type { TaskChanges } from "./optimistic";
import type { TaskWithType } from "./types";

/** Postgres `date`. */
const DATE_FORMAT = "yyyy-MM-dd";
/** Postgres `time`. */
const TIME_FORMAT = "HH:mm:ss";

/**
 * The editable shape of a task, as the create and edit forms hold it. Dates
 * live as `Date` here and only become strings on the way to the mutation —
 * the pickers speak `Date`, and one conversion point is easier to keep honest
 * than one per field.
 */
export interface TaskFormState {
  typeId: string | null;
  childId: string | null;
  title: string;
  subject: string;
  dueDate: Date;
  /** `null` means "no finer deadline than the day". */
  dueTime: Date | null;
  notes: string;
}

export type TaskFormErrorKey =
  "hw.error.titleRequired" | "hw.error.typeRequired" | "hw.error.dateRequired";

export interface TaskFormErrors {
  title?: TaskFormErrorKey;
  typeId?: TaskFormErrorKey;
  dueDate?: TaskFormErrorKey;
}

export function emptyTaskForm(now: Date): TaskFormState {
  return {
    typeId: null,
    childId: null,
    title: "",
    subject: "",
    dueDate: now,
    dueTime: null,
    notes: "",
  };
}

/**
 * `due_time` is a bare Postgres `time` — no day, no zone. It is parsed against
 * the task's own due date so the resulting Date sits on the day the time
 * belongs to; only the clock part is ever read back out.
 */
function parseDueTime(value: string | null, reference: Date): Date | null {
  if (!value) return null;
  const base = isValid(reference) ? reference : new Date();
  // Postgres renders `time` as HH:mm:ss, but a value written as HH:mm reaches
  // the client unchanged, so both spellings are accepted.
  for (const pattern of [TIME_FORMAT, "HH:mm"]) {
    const parsed = parse(value, pattern, base);
    if (isValid(parsed)) return parsed;
  }
  return null;
}

export function taskToForm(task: TaskWithType): TaskFormState {
  // parseISO, never new Date(): `due_date` is a Postgres `date`, and
  // new Date("2026-08-14") would read UTC midnight and shift the day.
  const dueDate = parseISO(task.due_date);
  return {
    typeId: task.type_id,
    childId: task.child_id,
    title: task.title,
    subject: task.subject ?? "",
    dueDate,
    dueTime: parseDueTime(task.due_time, dueDate),
    notes: task.description ?? "",
  };
}

/**
 * Returns i18n keys, not sentences — the layer classifies, the screen
 * translates. Same split as `mapTaskError`.
 */
export function validateTaskForm(state: TaskFormState): TaskFormErrors {
  const errors: TaskFormErrors = {};
  if (!state.title.trim()) errors.title = "hw.error.titleRequired";
  if (!state.typeId) errors.typeId = "hw.error.typeRequired";
  // The picker cannot clear the date, so this only fires for a row whose
  // stored `due_date` did not parse — without the guard it would reach
  // `format()` as an Invalid Date and throw.
  if (!isValid(state.dueDate)) errors.dueDate = "hw.error.dateRequired";
  return errors;
}

export function hasTaskFormErrors(errors: TaskFormErrors): boolean {
  return Object.keys(errors).length > 0;
}

/** Local formatting on purpose: `toISOString()` would move a late-evening due date to the previous day. */
function toDueDate(value: Date): string {
  return format(value, DATE_FORMAT);
}

function toDueTime(value: Date | null): string | null {
  return value ? format(value, TIME_FORMAT) : null;
}

/**
 * `null` when the state does not validate. The screens guard on
 * `validateTaskForm` first; this is the type-level backstop that keeps a
 * missing type id out of an insert the NOT NULL constraint would reject.
 */
export function toCreateVars(state: TaskFormState): CreateTaskVars | null {
  if (!state.typeId || hasTaskFormErrors(validateTaskForm(state))) return null;
  return {
    typeId: state.typeId,
    title: state.title.trim(),
    dueDate: toDueDate(state.dueDate),
    childId: state.childId,
    description: state.notes.trim() || null,
    subject: state.subject.trim() || null,
    dueTime: toDueTime(state.dueTime),
  };
}

/**
 * The full editable field set, not a diff. `applyUpdate` merges anyway, and
 * the set is small enough that a complete UPDATE costs nothing — a diff would
 * only add a way to get it wrong.
 */
export function toTaskChanges(state: TaskFormState): TaskChanges | null {
  if (!state.typeId || hasTaskFormErrors(validateTaskForm(state))) return null;
  return {
    type_id: state.typeId,
    child_id: state.childId,
    title: state.title.trim(),
    subject: state.subject.trim() || null,
    due_date: toDueDate(state.dueDate),
    due_time: toDueTime(state.dueTime),
    description: state.notes.trim() || null,
  };
}
