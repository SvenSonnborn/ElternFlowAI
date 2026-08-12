import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { useCurrentParent } from "@/features/auth";
import { supabase } from "@/features/supabase";

import type { TaskChanges } from "./optimistic";
import type { TaskRow, TaskWithType } from "./types";

import { MissingParentError } from "./errors";
import { applyDelete, applyToggle, applyUpdate } from "./optimistic";
import { taskKeys } from "./queries";

export interface CreateTaskVars {
  typeId: string;
  title: string;
  /** `YYYY-MM-DD`, a local calendar day. */
  dueDate: string;
  childId?: string | null;
  description?: string | null;
  subject?: string | null;
  dueTime?: string | null;
}

export interface UpdateTaskVars {
  taskId: string;
  changes: TaskChanges;
}

export interface DeleteTaskVars {
  taskId: string;
}

export interface ToggleTaskDoneVars {
  taskId: string;
  done: boolean;
}

/** Every cached `useFamilyTasks` entry, paired with its key. */
type TasksSnapshot = [readonly unknown[], TaskWithType[] | undefined][];

/**
 * Patch every tasks cache entry, whatever its `doneSince` suffix. Rebuilding
 * the exact key here would duplicate useToday's day arithmetic, and two copies
 * of the same date maths drift apart the moment one changes.
 */
async function patchTaskCaches(
  qc: QueryClient,
  updater: (tasks: TaskWithType[]) => TaskWithType[],
): Promise<TasksSnapshot> {
  await qc.cancelQueries({ queryKey: taskKeys.familyRoot });
  const snapshot = qc.getQueriesData<TaskWithType[]>({ queryKey: taskKeys.familyRoot });
  qc.setQueriesData<TaskWithType[]>({ queryKey: taskKeys.familyRoot }, (tasks) =>
    tasks ? updater(tasks) : tasks,
  );
  return snapshot;
}

function restoreTaskCaches(qc: QueryClient, snapshot: TasksSnapshot | undefined): void {
  if (!snapshot) return;
  for (const [key, tasks] of snapshot) {
    qc.setQueryData(key, tasks);
  }
}

/**
 * Returned, not fired-and-forgotten: React Query keeps the mutation pending
 * until the promise settles, so `isPending` only drops once the refetched rows
 * are in. Otherwise a screen would flip out of its saving state and then jump
 * a moment later when the server data lands.
 */
function invalidateTasks(qc: QueryClient): Promise<void> {
  return qc.invalidateQueries({ queryKey: taskKeys.familyRoot });
}

/**
 * Not optimistic on purpose: an optimistic row would need an invented id *and*
 * the joined task_types row, and a rollback would make the row the user just
 * created disappear again.
 */
export function useCreateTask() {
  const qc = useQueryClient();
  const { data: parent } = useCurrentParent();

  return useMutation({
    mutationFn: async (vars: CreateTaskVars): Promise<TaskRow> => {
      if (!parent) throw new MissingParentError();

      const { data, error } = await supabase
        .from("tasks")
        .insert({
          family_id: parent.family_id,
          created_by: parent.id,
          type_id: vars.typeId,
          title: vars.title,
          due_date: vars.dueDate,
          child_id: vars.childId ?? null,
          description: vars.description ?? null,
          subject: vars.subject ?? null,
          due_time: vars.dueTime ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSettled: () => invalidateTasks(qc),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (vars: UpdateTaskVars): Promise<void> => {
      // `.select("id").maybeSingle()` turns a same-family-but-vanished row
      // into a genuine error. Without it, an `UPDATE … WHERE id = …` that
      // matches zero rows — because another family member deleted the task
      // while this edit was in flight — still reports `error: null`, and the
      // screen would navigate away believing the edit was saved.
      const { data, error } = await supabase
        .from("tasks")
        .update(vars.changes)
        .eq("id", vars.taskId)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        // `hw.error.staleReference` names a stale *child or task type*
        // reference specifically — using it here (the task row itself is
        // gone) would misdescribe the failure. A plain Error falls through
        // mapTaskError's classification to `hw.error.generic`, which is the
        // closer fit.
        throw new Error("Task no longer exists");
      }
    },
    onMutate: (vars) =>
      patchTaskCaches(qc, (tasks) => applyUpdate(tasks, vars.taskId, vars.changes)),
    onError: (_err, _vars, snapshot) => restoreTaskCaches(qc, snapshot),
    onSettled: () => invalidateTasks(qc),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (vars: DeleteTaskVars): Promise<void> => {
      const { error } = await supabase.from("tasks").delete().eq("id", vars.taskId);
      if (error) throw error;
    },
    onMutate: (vars) => patchTaskCaches(qc, (tasks) => applyDelete(tasks, vars.taskId)),
    onError: (_err, _vars, snapshot) => restoreTaskCaches(qc, snapshot),
    onSettled: () => invalidateTasks(qc),
  });
}

/**
 * Writes `is_done`, `completed_at` and `completed_by` together — the
 * tasks_completed_consistency CHECK is symmetric and rejects any partial write.
 *
 * The optimistic `completed_at` and the one that reaches the server come from
 * two different `new Date()` calls and can differ by milliseconds: onMutate
 * runs first and cannot hand a value to mutationFn. onSettled refetches, so
 * the server's timestamp is what survives — and nothing renders sub-second
 * precision anyway.
 */
export function useToggleTaskDone() {
  const qc = useQueryClient();
  const { data: parent } = useCurrentParent();

  return useMutation({
    mutationFn: async (vars: ToggleTaskDoneVars): Promise<void> => {
      if (!parent) throw new MissingParentError();

      const { error } = await supabase
        .from("tasks")
        .update(
          vars.done
            ? { is_done: true, completed_at: new Date().toISOString(), completed_by: parent.id }
            : { is_done: false, completed_at: null, completed_by: null },
        )
        .eq("id", vars.taskId);
      if (error) throw error;
    },
    onMutate: (vars) => {
      // Without a parent the mutationFn throws MissingParentError, so there is
      // nothing worth patching. Skipping also keeps an impossible row out of
      // the cache: `is_done: true` with a null `completed_by` is exactly what
      // the tasks_completed_consistency CHECK forbids.
      if (!parent) return undefined;

      return patchTaskCaches(qc, (tasks) =>
        applyToggle(
          tasks,
          vars.taskId,
          vars.done,
          vars.done ? new Date().toISOString() : null,
          vars.done ? parent.id : null,
        ),
      );
    },
    onError: (_err, _vars, snapshot) => restoreTaskCaches(qc, snapshot),
    onSettled: () => invalidateTasks(qc),
  });
}
