import type { SupabaseClient } from "@supabase/supabase-js";

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";

import type { Database } from "@/features/supabase/database.types";

import { useCurrentParent } from "@/features/auth";
import { supabase } from "@/features/supabase";

import type { TaskChanges } from "./optimistic";
import type { TaskRow, TaskWithType } from "./types";

import { MissingParentError, TaskConflictError, TaskForbiddenError } from "./errors";
import { applyDelete, applyToggle, applyUpdate } from "./optimistic";
import { TASK_SELECT, taskKeys } from "./queries";

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
  /**
   * `task.updated_at` beim Laden des Formulars. Aufgaben brauchen kein
   * zusammengesetztes Token wie der Kalender — eine Aufgabe ist eine Zeile.
   */
  baseVersion: string;
}

export interface DeleteTaskVars {
  taskId: string;
  /**
   * `task.updated_at` beim Laden des Formulars — derselbe eingefrorene Stand
   * wie bei {@link UpdateTaskVars}, aus demselben Grund: Maßgeblich ist, was
   * der Nutzer *gesehen* hat, nicht was die lebende Query inzwischen führt
   * (ADR-031 Decision 6).
   */
  baseVersion: string;
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
 * Der Schnitt, an dem der Schreibpfad die Datenbank berührt — das Gegenstück
 * zu `EventOps` in [features/calendar/recurrence.ts](../calendar/recurrence.ts).
 * Ohne ihn spricht die Mutation direkt mit dem Modul-`supabase`, und die
 * Behandlung eines Konflikts wäre allein durch einen beobachteten
 * Zwei-Client-Lauf belegt statt durch einen Test.
 *
 * **Die Ops melden, die reine Funktion urteilt.** `updateRow` gibt
 * `true`/`false` zurück, statt bei null Zeilen selbst zu werfen: Das
 * Klassifizieren („fremde Änderung" gegen „Zeile weg") braucht einen zweiten
 * Aufruf (`fetchRow`), und eine Op, die eine andere Op ruft, ist keine Op
 * mehr. `deleteRow` meldet ein {@link DeleteOutcome}, das der Server selbst
 * klassifiziert hat (`delete_task`); nur beim Konflikt liest `deleteTask`
 * nach.
 *
 * Nur `useUpdateTask` und `useDeleteTask` laufen hierüber. `useCreateTask`
 * und `useToggleTaskDone` bleiben bewusst beim direkten Client: Beide haben
 * kein Compare-and-Swap, das zu prüfen wäre, und sie ohne Anlass umzubauen
 * hieße, zwei Pfade anzufassen, für die niemand einen Testfall genannt hat.
 * Die Datei trägt dafür vorerst zwei Idiome.
 *
 * Das ist enger als der tatsächliche Abstand zwischen den beiden Paaren:
 * „kein CAS" ist eine andere Eigenschaft als „kein 0-Zeilen-Guard", und
 * `useToggleTaskDone` fehlt **beides** — sein `.update(...).eq("id", …)` läuft
 * ohne `.select()` und meldet unter RLS oder nach einer Fremdlöschung
 * `error: null`, obwohl keine Zeile getroffen wurde. Siehe `docs/TODO.md`,
 * Abschnitt „Aufgaben / Tasks".
 */
export interface TaskOps {
  /** Die Zeile samt `task_types`-Join — die Form, die `TaskConflictError` trägt. */
  fetchRow: (taskId: string) => Promise<TaskWithType | null>;
  /** `true`, wenn das Compare-and-Swap die Zeile getroffen hat. */
  updateRow: (taskId: string, changes: TaskChanges, seenUpdatedAt: string) => Promise<boolean>;
  /** Löscht über `delete_task` gegen den gesehenen Stand; der Server klassifiziert. */
  deleteRow: (taskId: string, seenUpdatedAt: string) => Promise<DeleteOutcome>;
}

/**
 * Ergebnis von `delete_task`. `deleted`/`missing`/`forbidden` sind die drei
 * Rückgabewerte der SQL-Funktion; `conflict` ist ihr Fehler `EF409` (Zeile
 * sichtbar, `updated_at` weicht ab), vom Supabase-Adapter in einen Wert
 * übersetzt, damit `deleteTask` rein bleibt.
 */
export type DeleteOutcome = "deleted" | "missing" | "forbidden" | "conflict";

const DELETE_OUTCOMES: readonly string[] = ["deleted", "missing", "forbidden"];

/**
 * Kapselt die Datenbankaufrufe von `updateTask` und `deleteTask` — und zwar
 * nur deren: `useCreateTask` und `useToggleTaskDone` sprechen weiterhin direkt
 * mit dem Modul-`supabase` (siehe {@link TaskOps}).
 *
 * **Update:** `.eq("updated_at", …)` macht daraus ein Compare-and-Swap: Es
 * trifft die Zeile nur, solange niemand anderes sie seit dem Laden des
 * Formulars angefasst hat. `.select("id").maybeSingle()` ist die andere
 * Hälfte davon — **ohne sie meldet PostgREST auch dann `error: null`, wenn
 * null Zeilen getroffen wurden**, und der Aufrufer könnte „gelungen" nicht von
 * „nichts passiert" unterscheiden. Beides zusammen ist das CAS; einzeln ist
 * keines davon etwas wert (ADR-031).
 *
 * **Delete:** läuft über die RPC `delete_task`. Ein CAS über PostgREST sah bei
 * null Zeilen nicht, ob die Aufgabe weg war oder der Zugriff; die Funktion
 * trennt beides. Der Konflikt kommt als Fehler `EF409` an — PostgREST liefert
 * ihn als HTTP 400, erkannt wird er deshalb am `code`, nie am Status. Jeder
 * andere Fehler (auch `22023` bei fehlender Eingabe, ein Client-Fehler) wird
 * unverändert geworfen, ein unbekannter Rückgabewert ebenfalls: Ihn als Erfolg
 * zu lesen, hieße, ein Löschen zu melden, das nie bestätigt wurde.
 */
export function createSupabaseTaskOps(client: SupabaseClient<Database>): TaskOps {
  return {
    fetchRow: async (taskId) => {
      const { data, error } = await client
        .from("tasks")
        .select(TASK_SELECT)
        .eq("id", taskId)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },

    updateRow: async (taskId, changes, seenUpdatedAt) => {
      const { data, error } = await client
        .from("tasks")
        .update(changes)
        .eq("id", taskId)
        .eq("updated_at", seenUpdatedAt)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      return data !== null;
    },

    deleteRow: async (taskId, seenUpdatedAt) => {
      const { data, error } = await client.rpc("delete_task", {
        p_task_id: taskId,
        p_seen_updated_at: seenUpdatedAt,
      });
      if (error) {
        if (error.code === "EF409") return "conflict";
        throw error;
      }
      if (!DELETE_OUTCOMES.includes(data)) {
        throw new Error(`delete_task returned an unexpected value: ${String(data)}`);
      }
      return data as DeleteOutcome;
    },
  };
}

/**
 * Schreibt die Änderungen, solange niemand anderes die Zeile seit dem Laden
 * des Formulars angefasst hat.
 *
 * Anders als im Kalender ist das Compare-and-Swap hier der *Detektor*, nicht
 * bloß die Absicherung: Es gibt keinen Fetch, den man mitbenutzen könnte, und
 * ein Pre-Flight kostete einen Roundtrip pro Speichern. Gelesen wird erst,
 * **wenn** das CAS verfehlt — im Normalfall kostet der Guard damit keinen
 * zusätzlichen Roundtrip (ADR-031).
 */
export async function updateTask(vars: UpdateTaskVars, deps: TaskOps): Promise<void> {
  const hit = await deps.updateRow(vars.taskId, vars.changes, vars.baseVersion);
  if (hit) return;

  // Null Zeilen heißt eines von zwei Dingen. Erst *jetzt* wird gelesen.
  const current = await deps.fetchRow(vars.taskId);
  if (!current) {
    // `hw.error.staleReference` names a stale *child or task type* reference
    // specifically — using it here (the task row itself is gone) would
    // misdescribe the failure. A plain Error falls through mapTaskError's
    // classification to `hw.error.generic`, which is the closer fit.
    throw new Error("Task no longer exists");
  }
  throw new TaskConflictError(current);
}

/**
 * Löscht die Aufgabe, solange niemand anderes sie seit dem Laden des
 * Formulars angefasst hat — derselbe Stand-Vergleich wie {@link updateTask},
 * aber vom Server entschieden (`delete_task`).
 *
 * **Eine bereits verschwundene Zeile ist hier ein Erfolg, beim Speichern ein
 * Fehler.** Beim Speichern geht *Inhalt* verloren: Der Nutzer hat etwas
 * getippt, das nirgendwo mehr ankommt. Beim Löschen ist die *Absicht*
 * erfüllt — die Aufgabe ist weg, gleich wessen DELETE sie erwischt hat, und
 * eine Fehlermeldung darüber wäre schlicht falsch.
 *
 * **`forbidden` ist dagegen ein Fehler:** Der Elternteil wurde aus der Familie
 * entfernt, während der Undo-Timer lief, die Aufgabe steht also noch. Das ließ
 * sich über PostgREST nicht von „schon gelöscht" unterscheiden. Der
 * *Abmelde*-Fall war nie betroffen: `useSignOut` ruft `flush()` vor
 * `signOut`, das Löschen läuft also noch angemeldet.
 *
 * Nur bei `conflict` wird nachgelesen — um die fremde Fassung für den Dialog
 * zu haben; ist die Zeile inzwischen weg, gilt das wie `missing`.
 */
export async function deleteTask(vars: DeleteTaskVars, deps: TaskOps): Promise<void> {
  const outcome = await deps.deleteRow(vars.taskId, vars.baseVersion);
  if (outcome === "deleted" || outcome === "missing") return;
  if (outcome === "forbidden") throw new TaskForbiddenError();

  const current = await deps.fetchRow(vars.taskId);
  if (!current) return; // zwischenzeitlich gelöscht — das Ziel ist erreicht
  throw new TaskConflictError(current);
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
    mutationFn: (vars: UpdateTaskVars) => updateTask(vars, createSupabaseTaskOps(supabase)),
    onMutate: (vars) =>
      patchTaskCaches(qc, (tasks) => applyUpdate(tasks, vars.taskId, vars.changes)),
    onError: (_err, _vars, snapshot) => restoreTaskCaches(qc, snapshot),
    onSettled: () => invalidateTasks(qc),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (vars: DeleteTaskVars) => deleteTask(vars, createSupabaseTaskOps(supabase)),
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
