# Tasks-Mutations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Tasks-Layer wird schreibfähig — `useCreateTask`, `useUpdateTask`, `useDeleteTask`, `useToggleTaskDone`, drei davon mit optimistischem Cache-Update.

**Architecture:** Die Logik, die Fehler trägt, liegt als reine Funktionen in eigenen Modulen: `optimistic.ts` patcht Task-Arrays, `errors.ts` klassifiziert Fehlerursachen zu i18n-Keys. `mutations.ts` ist nur noch Verdrahtung — React-Query-Mutations, die diese Funktionen auf den Cache anwenden. Fehler werden geworfen, nie dargestellt; die Darstellung ist Sache des Screens.

**Tech Stack:** TypeScript (strict), `@supabase/supabase-js`, `@tanstack/react-query`, `bun:test`.

**Spec:** [docs/superpowers/specs/2026-07-29-tasks-mutations-design.md](../specs/2026-07-29-tasks-mutations-design.md)

## Global Constraints

- Branch ist `feat/tasks-mutations`. Alle Commits landen dort.
- **Kein `Co-Authored-By: Claude`-Trailer** in Commit-Messages. Conventional-Commits-Präfix, gescoped (`feat(tasks): …`).
- **Pre-commit-Hooks niemals mit `--no-verify` umgehen.**
- Kein Eingriff ins Handoff-Bundle: `design-system/{colors,typography,spacing,themes,components,index}.ts`, `docs/{HANDOFF,COPY,ICONS,README}.md`, `patterns/*.md` bleiben unangetastet.
- Kein UI, keine Migration, kein Types-Regen. `AufgabenScreen` wird **nicht** angefasst.
- **Die Mutations importieren kein `react-native` und kein `Alert`.** Sie werfen; die Darstellung macht der Screen.
- Alle UI-Strings über i18n. Neue Keys nur im `hw.*`-Namespace, DE ist kanonisch, EN spiegelt. Immer **Du**, nie Sie; keine Ausrufezeichen.
- Kein `.eq("family_id", …)` im Client — die Isolation macht RLS.
- `due_date` ist ein Postgres-`date`, immer als `YYYY-MM-DD`-String behandelt.
- Kein `Date.now()` / `new Date()` in `optimistic.ts` — Zeitstempel sind Parameter.
- Tests laufen mit `bun test` (Buns Runner), Imports aus `bun:test`. Nicht `npx jest`.
- Pfad-Alias `@/*` → Repo-Root.

## File Structure

| Datei                                | Verantwortung                                                    | Task |
| ------------------------------------ | ---------------------------------------------------------------- | ---- |
| `features/tasks/optimistic.ts`       | reine Cache-Updater: `applyToggle`, `applyUpdate`, `applyDelete` | 1    |
| `features/tasks/optimistic.test.ts`  | Tests dagegen                                                    | 1    |
| `features/tasks/errors.ts`           | `MissingParentError`, `mapTaskError`                             | 2    |
| `features/tasks/errors.test.ts`      | Tests dagegen                                                    | 2    |
| `features/i18n/locales/{de,en}.json` | vier `hw.error.*`-Keys                                           | 2    |
| `features/tasks/queries.ts`          | `taskKeys.types`, `fetchTaskTypes`, `useTaskTypes`               | 3    |
| `features/tasks/mutations.ts`        | die vier Hooks                                                   | 4    |
| `features/tasks/index.ts`            | Barrel                                                           | 4    |
| `docs/TODO.md`                       | Backlog-Pflege                                                   | 4    |

`TaskChanges` wird in `optimistic.ts` definiert (Task 1) und von `mutations.ts` importiert — der Typ beschreibt, was ein Update ändern darf, und beide Seiten müssen sich darauf einigen.

---

### Task 1: Reine Cache-Updater

**Files:**

- Create: `features/tasks/optimistic.ts`
- Create: `features/tasks/optimistic.test.ts`

**Interfaces:**

- Consumes: `TaskUpdate`, `TaskWithType` aus `./types` (existieren bereits).
- Produces:
  - `type TaskChanges = Pick<TaskUpdate, "title" | "description" | "subject" | "due_date" | "due_time" | "child_id" | "type_id">`
  - `applyToggle(tasks: TaskWithType[], taskId: string, done: boolean, completedAt: string | null, completedBy: string | null): TaskWithType[]`
  - `applyUpdate(tasks: TaskWithType[], taskId: string, changes: TaskChanges): TaskWithType[]`
  - `applyDelete(tasks: TaskWithType[], taskId: string): TaskWithType[]`

- [ ] **Step 1: Failing tests schreiben**

Create `features/tasks/optimistic.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import type { TaskWithType } from "./types";

import { applyDelete, applyToggle, applyUpdate } from "./optimistic";

/**
 * Only the columns the updaters touch carry meaning; the rest is filler so the
 * fixture satisfies TaskWithType.
 */
function makeTask(overrides: Partial<TaskWithType> = {}): TaskWithType {
  return {
    id: "task-1",
    family_id: "fam-1",
    type_id: "type-1",
    child_id: null,
    title: "Mathe Übungsblatt",
    description: null,
    subject: null,
    due_date: "2026-07-29",
    due_time: null,
    is_done: false,
    completed_at: null,
    completed_by: null,
    created_by: null,
    created_at: "2026-07-01T08:00:00.000Z",
    updated_at: "2026-07-01T08:00:00.000Z",
    task_types: null,
    ...overrides,
  };
}

const DONE_AT = "2026-07-29T10:00:00.000Z";

describe("applyToggle", () => {
  test("marking done sets all three completion columns together", () => {
    const result = applyToggle([makeTask({ id: "a" })], "a", true, DONE_AT, "parent-1");

    expect(result[0].is_done).toBe(true);
    expect(result[0].completed_at).toBe(DONE_AT);
    expect(result[0].completed_by).toBe("parent-1");
  });

  test("un-marking clears all three completion columns together", () => {
    const done = makeTask({
      id: "a",
      is_done: true,
      completed_at: DONE_AT,
      completed_by: "parent-1",
    });

    const result = applyToggle([done], "a", false, null, null);

    expect(result[0].is_done).toBe(false);
    expect(result[0].completed_at).toBeNull();
    expect(result[0].completed_by).toBeNull();
  });

  test("keeps the task in the list — done tasks stay visible in the window", () => {
    const result = applyToggle([makeTask({ id: "a" })], "a", true, DONE_AT, "parent-1");

    expect(result).toHaveLength(1);
  });

  test("leaves other rows untouched", () => {
    const other = makeTask({ id: "b" });
    const result = applyToggle([makeTask({ id: "a" }), other], "a", true, DONE_AT, "parent-1");

    expect(result[1]).toBe(other);
  });

  test("an unknown id leaves the array unchanged", () => {
    const tasks = [makeTask({ id: "a" })];
    const result = applyToggle(tasks, "nope", true, DONE_AT, "parent-1");

    expect(result).toEqual(tasks);
  });

  test("does not mutate the input array or its elements", () => {
    const task = makeTask({ id: "a" });
    applyToggle([task], "a", true, DONE_AT, "parent-1");

    expect(task.is_done).toBe(false);
    expect(task.completed_at).toBeNull();
  });
});

describe("applyUpdate", () => {
  test("overwrites only the fields it was given", () => {
    const result = applyUpdate([makeTask({ id: "a", subject: "Mathe" })], "a", {
      title: "Deutsch Diktat",
    });

    expect(result[0].title).toBe("Deutsch Diktat");
    expect(result[0].subject).toBe("Mathe");
    expect(result[0].due_date).toBe("2026-07-29");
  });

  test("can null a nullable column", () => {
    const result = applyUpdate([makeTask({ id: "a", child_id: "child-1" })], "a", {
      child_id: null,
    });

    expect(result[0].child_id).toBeNull();
  });

  test("leaves other rows untouched", () => {
    const other = makeTask({ id: "b" });
    const result = applyUpdate([makeTask({ id: "a" }), other], "a", { title: "Neu" });

    expect(result[1]).toBe(other);
  });

  test("an unknown id leaves the array unchanged", () => {
    const tasks = [makeTask({ id: "a" })];

    expect(applyUpdate(tasks, "nope", { title: "Neu" })).toEqual(tasks);
  });

  test("does not mutate the input array or its elements", () => {
    const task = makeTask({ id: "a" });
    applyUpdate([task], "a", { title: "Neu" });

    expect(task.title).toBe("Mathe Übungsblatt");
  });
});

describe("applyDelete", () => {
  test("removes exactly the matching row", () => {
    const result = applyDelete([makeTask({ id: "a" }), makeTask({ id: "b" })], "a");

    expect(result.map((t) => t.id)).toEqual(["b"]);
  });

  test("an unknown id leaves the array unchanged", () => {
    const tasks = [makeTask({ id: "a" })];

    expect(applyDelete(tasks, "nope")).toEqual(tasks);
  });

  test("does not mutate the input array", () => {
    const tasks = [makeTask({ id: "a" }), makeTask({ id: "b" })];
    applyDelete(tasks, "a");

    expect(tasks).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Tests laufen lassen und Fehlschlag bestätigen**

Run: `bun test features/tasks/optimistic.test.ts`

Expected: FAIL — `Cannot find module './optimistic'`.

- [ ] **Step 3: Implementierung schreiben**

Create `features/tasks/optimistic.ts`:

```ts
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
```

- [ ] **Step 4: Tests laufen lassen und Erfolg bestätigen**

Run: `bun test features/tasks/optimistic.test.ts`

Expected: PASS — 14 Tests grün.

- [ ] **Step 5: Committen**

```bash
git add features/tasks/optimistic.ts features/tasks/optimistic.test.ts
git commit -m "feat(tasks): reine Cache-Updater für optimistische Mutations"
```

---

### Task 2: Fehlerklassifikation und i18n-Keys

**Files:**

- Create: `features/tasks/errors.ts`
- Create: `features/tasks/errors.test.ts`
- Modify: `features/i18n/locales/de.json` (`hw`-Block)
- Modify: `features/i18n/locales/en.json` (`hw`-Block)

**Interfaces:**

- Consumes: nichts aus früheren Tasks.
- Produces:
  - `class MissingParentError extends Error` mit `name = "MissingParentError"`
  - `type TaskErrorKey = "hw.error.notAuthenticated" | "hw.error.staleReference" | "hw.error.network" | "hw.error.generic"`
  - `mapTaskError(input: unknown): TaskErrorKey`

- [ ] **Step 1: Failing tests schreiben**

Create `features/tasks/errors.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { mapTaskError, MissingParentError } from "./errors";

describe("mapTaskError", () => {
  test("MissingParentError → hw.error.notAuthenticated", () => {
    expect(mapTaskError(new MissingParentError())).toBe("hw.error.notAuthenticated");
  });

  test("Postgres 42501 (RLS refused) → hw.error.notAuthenticated", () => {
    expect(mapTaskError({ code: "42501", message: "new row violates row-level security" })).toBe(
      "hw.error.notAuthenticated",
    );
  });

  test("Postgres 23503 (foreign key) → hw.error.staleReference", () => {
    expect(mapTaskError({ code: "23503", message: "violates foreign key constraint" })).toBe(
      "hw.error.staleReference",
    );
  });

  test("AbortError → hw.error.network", () => {
    expect(mapTaskError({ name: "AbortError", message: "aborted" })).toBe("hw.error.network");
  });

  test("fetch failure message → hw.error.network", () => {
    expect(mapTaskError({ message: "TypeError: fetch failed" })).toBe("hw.error.network");
  });

  test("Postgres 23514 (CHECK) falls through to generic", () => {
    expect(mapTaskError({ code: "23514", message: "tasks_completed_consistency" })).toBe(
      "hw.error.generic",
    );
  });

  test("unrecognised error → hw.error.generic", () => {
    expect(mapTaskError({ message: "something odd" })).toBe("hw.error.generic");
  });

  test.each([null, undefined, "boom", 42])("non-object input %p → hw.error.generic", (input) => {
    expect(mapTaskError(input)).toBe("hw.error.generic");
  });
});
```

- [ ] **Step 2: Tests laufen lassen und Fehlschlag bestätigen**

Run: `bun test features/tasks/errors.test.ts`

Expected: FAIL — `Cannot find module './errors'`.

- [ ] **Step 3: Implementierung schreiben**

Create `features/tasks/errors.ts`:

```ts
/**
 * Thrown before any network call when a mutation needs the current parent row
 * and it is not loaded. Naming the failure locally beats firing a request that
 * RLS will reject with 42501 a round trip later.
 */
export class MissingParentError extends Error {
  constructor() {
    super("Current parent is not loaded");
    this.name = "MissingParentError";
  }
}

export type TaskErrorKey =
  "hw.error.notAuthenticated" | "hw.error.staleReference" | "hw.error.network" | "hw.error.generic";

interface ErrorLike {
  message?: string;
  code?: string;
  name?: string;
}

function asErrorLike(input: unknown): ErrorLike | null {
  if (input == null) return null;
  if (typeof input !== "object") return null;
  return input;
}

/**
 * Classifies the *cause*, not the operation — which title sits above it is the
 * screen's call. Mirrors mapAuthError in features/auth/errors.ts.
 */
export function mapTaskError(input: unknown): TaskErrorKey {
  const err = asErrorLike(input);
  if (!err) return "hw.error.generic";

  if (err.name === "MissingParentError") return "hw.error.notAuthenticated";

  // Postgres SQLSTATE codes — checked first because they're specific.
  // 42501 is RLS refusing the row; 23503 means the child or task type the row
  // points at is gone. 23514 (the completion CHECK) deliberately has no key:
  // it can only break if this layer writes the three completion columns
  // inconsistently, which is a bug here, not something a parent can act on.
  if (err.code === "42501") return "hw.error.notAuthenticated";
  if (err.code === "23503") return "hw.error.staleReference";

  const message = err.message ?? "";
  if (err.name === "AbortError" || /network|fetch failed|aborted/i.test(message)) {
    return "hw.error.network";
  }

  // Log only safe primitives — a Supabase error message can echo the payload,
  // and task titles are private ("Attest für Schulpsychologe abgeben").
  console.error("[mapTaskError] unmapped error", {
    code: err.code ?? null,
    name: err.name ?? null,
    hasMessage: message.length > 0,
  });
  return "hw.error.generic";
}
```

- [ ] **Step 4: Tests laufen lassen und Erfolg bestätigen**

Run: `bun test features/tasks/errors.test.ts`

Expected: PASS — 12 Tests grün (die `test.each`-Zeile zählt als vier).

- [ ] **Step 5: i18n-Keys ergänzen**

In `features/i18n/locales/de.json`, im `hw`-Block hinter `"addVoice"` einfügen:

```json
"error": {
  "notAuthenticated": "Bitte erneut anmelden.",
  "staleReference": "Kind oder Aufgabentyp existiert nicht mehr.",
  "network": "Verbindung fehlgeschlagen. Bitte später erneut versuchen.",
  "generic": "Etwas ist schiefgelaufen. Bitte später erneut versuchen."
}
```

In `features/i18n/locales/en.json`, im `hw`-Block hinter `"addVoice"` einfügen:

```json
"error": {
  "notAuthenticated": "Please sign in again.",
  "staleReference": "That child or task type no longer exists.",
  "network": "Connection failed. Please try again later.",
  "generic": "Something went wrong. Please try again later."
}
```

- [ ] **Step 6: Typecheck und volle Suite laufen lassen**

Run: `bun run typecheck && bun test`

Expected: beide PASS. Der Typecheck deckt ab, dass die JSON-Kataloge valide bleiben und `TaskErrorKey` zu den Keys passt.

- [ ] **Step 7: Committen**

```bash
git add features/tasks/errors.ts features/tasks/errors.test.ts features/i18n/locales/de.json features/i18n/locales/en.json
git commit -m "feat(tasks): Fehlerklassifikation und hw.error-Keys"
```

---

### Task 3: `useTaskTypes`

**Files:**

- Modify: `features/tasks/queries.ts` (`taskKeys` erweitern, Fetcher und Hook ergänzen)

**Interfaces:**

- Consumes: `TaskTypeRow` aus `./types`, `supabase` aus `@/features/supabase` (beides bereits importiert bzw. verfügbar).
- Produces:
  - `taskKeys.types` = `["tasks", "types"]`
  - `fetchTaskTypes(): Promise<TaskTypeRow[]>`
  - `useTaskTypes(): UseQueryResult<TaskTypeRow[], Error>`

- [ ] **Step 1: `taskKeys` erweitern**

In `features/tasks/queries.ts` den Key-Block ersetzen:

```ts
export const taskKeys = {
  all: ["tasks"] as const,
  family: (doneSince: string) => ["tasks", "family", doneSince] as const,
  types: ["tasks", "types"] as const,
};
```

- [ ] **Step 2: Import-Zeilen anpassen**

Die beiden Zeilen oben in `features/tasks/queries.ts`:

```ts
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
```

```ts
import type { TaskGroup, TaskStats, TaskTypeRow, TaskWithType } from "./types";
```

- [ ] **Step 3: Fetcher und Hook ans Dateiende hängen**

```ts
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
```

- [ ] **Step 4: Typecheck und Lint laufen lassen**

Run: `bun run typecheck && bun lint`

Expected: PASS. Lint meldet weiterhin genau eine vorbestehende Warnung in `app/+not-found.tsx` und 0 Fehler.

- [ ] **Step 5: Committen**

```bash
git add features/tasks/queries.ts
git commit -m "feat(tasks): useTaskTypes als Lookup für type_id"
```

---

### Task 4: Die vier Mutations, Barrel und Backlog

**Files:**

- Create: `features/tasks/mutations.ts`
- Modify: `features/tasks/index.ts`
- Modify: `docs/TODO.md`

**Interfaces:**

- Consumes:
  - `applyDelete`, `applyToggle`, `applyUpdate`, `type TaskChanges` aus `./optimistic` (Task 1)
  - `MissingParentError` aus `./errors` (Task 2)
  - `taskKeys` aus `./queries` (Task 3 erweitert es)
  - `TaskRow`, `TaskWithType` aus `./types`
  - `useCurrentParent` aus `@/features/auth` — liefert `UseQueryResult<ParentRow | null, Error>`, `ParentRow` hat `id` und `family_id`
- Produces: `useCreateTask`, `useUpdateTask`, `useDeleteTask`, `useToggleTaskDone` sowie die Vars-Typen `CreateTaskVars`, `UpdateTaskVars`, `DeleteTaskVars`, `ToggleTaskDoneVars`

- [ ] **Step 1: Mutations schreiben**

Create `features/tasks/mutations.ts`:

```ts
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
  await qc.cancelQueries({ queryKey: taskKeys.all });
  const snapshot = qc.getQueriesData<TaskWithType[]>({ queryKey: taskKeys.all });
  qc.setQueriesData<TaskWithType[]>({ queryKey: taskKeys.all }, (tasks) =>
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

function invalidateTasks(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: taskKeys.all });
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
      const { error } = await supabase.from("tasks").update(vars.changes).eq("id", vars.taskId);
      if (error) throw error;
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
    onMutate: (vars) =>
      patchTaskCaches(qc, (tasks) =>
        applyToggle(
          tasks,
          vars.taskId,
          vars.done,
          vars.done ? new Date().toISOString() : null,
          vars.done ? (parent?.id ?? null) : null,
        ),
      ),
    onError: (_err, _vars, snapshot) => restoreTaskCaches(qc, snapshot),
    onSettled: () => invalidateTasks(qc),
  });
}
```

- [ ] **Step 2: Barrel erweitern**

Replace `features/tasks/index.ts` with:

```ts
export { mapTaskError, MissingParentError, type TaskErrorKey } from "./errors";
export {
  useCreateTask,
  useDeleteTask,
  useToggleTaskDone,
  useUpdateTask,
  type CreateTaskVars,
  type DeleteTaskVars,
  type ToggleTaskDoneVars,
  type UpdateTaskVars,
} from "./mutations";
export { applyDelete, applyToggle, applyUpdate, type TaskChanges } from "./optimistic";
export {
  fetchFamilyTasks,
  fetchTaskTypes,
  taskKeys,
  useFamilyTasks,
  useTaskTypes,
  useTasksByChild,
  useTasksStats,
} from "./queries";
export { computeTaskStats, groupTasksByChild } from "./stats";
export type {
  TaskGroup,
  TaskInsert,
  TaskRow,
  TaskStats,
  TaskTypeRow,
  TaskUpdate,
  TaskWithType,
} from "./types";
```

- [ ] **Step 3: Typecheck laufen lassen**

Run: `bun run typecheck`

Expected: PASS, keine Ausgabe. Schlägt der `onMutate`-Rückgabewert fehl, ist der Kontexttyp der Mutation gemeint — `patchTaskCaches` gibt `Promise<TasksSnapshot>` zurück, React Query leitet den Kontext daraus ab. **Nicht** casten, sondern die Signatur angleichen.

- [ ] **Step 4: Backlog pflegen**

In `docs/TODO.md`, im Abschnitt `## Aufgaben / Tasks (Daten-Layer V1)`:

**Entfernen** (mit dieser Iteration erledigt) — die Zeile, die mit `- **Tasks-Layer ist lesend**` beginnt.

**Ergänzen** am Ende des Abschnitts:

```markdown
- **`useCreateTask` ist nicht optimistisch** ([features/tasks/mutations.ts](../features/tasks/mutations.ts)): Toggle, Update und Delete patchen den Cache sofort, Create invalidiert nur. Eine optimistische neue Zeile bräuchte eine erfundene `id` **und** die gejointe `task_types`-Zeile, und ein Rollback ließe genau die Zeile wieder verschwinden, die der Nutzer eben angelegt hat. Erst relevant, wenn ein Screen die Latenz beim Anlegen spürbar macht.
- **`hw.error.*` fehlen in `docs/COPY.md`** ([features/i18n/locales/de.json](../features/i18n/locales/de.json) + [en.json](../features/i18n/locales/en.json)): `hw.error.notAuthenticated`/`staleReference`/`network`/`generic` liegen als Keys in den Catalogs, sind aber noch nicht in der designer-eigenen Copy-Deck-Tabelle erfasst. Vom Designer nachtragen, damit COPY.md Source of Truth bleibt (gleiche Baustelle wie `set.footer` und die Kalender-Keys).
```

- [ ] **Step 5: Volle Kette laufen lassen**

Run: `bun format:check && bun lint && bun run typecheck && bun test`

Expected: alle PASS. Schlägt `format:check` fehl: `bun format` laufen lassen und erneut prüfen.

- [ ] **Step 6: Committen**

```bash
git add features/tasks/mutations.ts features/tasks/index.ts docs/TODO.md
git commit -m "feat(tasks): Mutations mit optimistischem Cache-Update"
```

---

### Task 5: Verifikation und Review

**Files:** keine Änderungen erwartet — dieser Task ist das Gate.

- [ ] **Step 1: Volle CI-Kette lokal fahren**

Run: `bun format:check && bun lint && bun run typecheck && bun test`

Expected: alle vier PASS. `bun test` muss 26 neue Tests aus `features/tasks/optimistic.test.ts` (14) und `features/tasks/errors.test.ts` (12) enthalten.

- [ ] **Step 2: Web-Smoke-Build**

Run: `bunx expo export --platform web --output-dir /tmp/eltern-web`

Expected: Bundle wird ohne Fehler geschrieben. Das ist der letzte Step in `ci.yml` und fängt Import-Zyklen ab, die `typecheck` durchlässt — hier besonders relevant, weil `mutations.ts` und `queries.ts` sich über den Barrel begegnen könnten.

- [ ] **Step 3: Prüfen, dass der Layer kein `react-native` importiert**

Run: `grep -n "react-native" features/tasks/mutations.ts features/tasks/optimistic.ts features/tasks/errors.ts`

Expected: **keine Treffer.** Die Mutations dürfen keine UI-Abhängigkeit haben; `Alert` gehört in den Screen. (`queries.ts` importiert `AppState` und ist davon ausgenommen — das ist der Mitternachts-Refresh, kein UI.)

- [ ] **Step 4: CodeRabbit-Review**

Run: `coderabbit review --base main --agent`

Erwartete Antwort: Findings durcharbeiten — jedes entweder beheben oder mit Begründung bewusst verwerfen. Behebungen bekommen eigene Commits (`fix(tasks): …`).

- [ ] **Step 5: Verifikation nach etwaigen Fixes wiederholen**

Nur nötig, wenn Step 4 zu Codeänderungen geführt hat.

Run: `bun format:check && bun lint && bun run typecheck && bun test`

Expected: alle PASS.

---

## Was dieser Plan bewusst **nicht** tut

- Keine Tests für `mutations.ts` und `useTaskTypes`. Nach dem Auslagern der Logik nach `optimistic.ts` und `errors.ts` ist beides Verdrahtung, und es gibt im Repo keine React-Hook-Testinfrastruktur — dieselbe Begründung wie beim lesenden Layer.
- Kein `Alert` und kein Toast. Die Fehlerdarstellung ist Sache des Screens; `mapTaskError` liefert ihm den Key.
- Kein Screen-Rewire. `AufgabenScreen` bleibt auf `sample-data`, der TODO-Eintrag dazu bleibt stehen.
