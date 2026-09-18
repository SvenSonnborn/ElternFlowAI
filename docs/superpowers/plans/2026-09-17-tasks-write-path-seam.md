# Aufgaben-Schreibpfad: Deps-Schnitt, Lösch-CAS, Testsuite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `features/tasks/mutations.ts` bekommt denselben injizierbaren Schnitt wie der Kalender, das Löschen bekommt ein Compare-and-Swap samt 0-Zeilen-Guard, und der Aufgaben-Schreibpfad ist zum ersten Mal ohne Netz testbar.

**Architecture:** Ein `TaskOps`-Interface kapselt die drei PostgREST-Aufrufe (`fetchRow`/`updateRow`/`deleteRow`); `createSupabaseTaskOps(client)` ist der einzige Ort, der `supabase` für diese beiden Pfade kennt — `useCreateTask` und `useToggleTaskDone` bleiben bewusst daneben. Darüber liegen zwei reine Funktionen `updateTask(vars, deps)` und `deleteTask(vars, deps)`, die aus „null Zeilen getroffen" per Nachlese einen `TaskConflictError` oder — beim Löschen — einen stillen Erfolg machen. Die Hooks werden dünne Hüllen; ihre optimistischen `onMutate`/`onError`/`onSettled`-Zweige bleiben unverändert.

**Tech Stack:** TypeScript ~6.0 strict · `@supabase/supabase-js` · `@tanstack/react-query` · Bun-Testrunner (`bun:test`, nicht Jest)

**Spec:** [docs/superpowers/specs/2026-09-17-tasks-delete-path-conflict-gaps-design.md](../specs/2026-09-17-tasks-delete-path-conflict-gaps-design.md) — **§3** ist dieser Plan, §1.2 trägt die Begründung für Decision 5.

## Global Constraints

- **Kein `Co-Authored-By: Claude`-Trailer** an irgendeinem Commit. Repo-Policy, gilt ausnahmslos.
- **Pre-Commit-Hooks (`lint-staged`) nie mit `--no-verify` umgehen.**
- **Das Handoff-Bundle ist off-limits:** `design-system/{colors,typography,spacing,themes,components,index}.ts`, `docs/{HANDOFF,COPY,ICONS,README}.md`, `patterns/*.md`. Dieser Plan braucht **keinen neuen Copy-Key** — `conflict.deleteAnyway`, `hw.delete.error`, `hw.error.conflict` und `hw.error.generic` existieren alle. Wer einen neuen zu brauchen glaubt, hat sich verlaufen: melden statt erfinden.
- **Ältere ADRs werden nie umgeschrieben**, nur ergänzt oder abgelöst. Rein redaktionelle Reparaturen (tote Links, falsche Pfade, Tippfehler) werden an Ort und Stelle korrigiert.
- **Tests laufen mit `bun test`**, nicht `npx jest`. Testdateien importieren aus `bun:test`.
- **Jede neue exportierte Funktion, jeder neue Typ bekommt einen JSDoc-Block im selben Commit** (CLAUDE.md → Docstrings). Inhalt ist das Nicht-Offensichtliche — warum es so gebaut ist, welcher Grenzfall die Form bestimmt hat, welcher ADR dahintersteht. Was der Name schon sagt, wird nicht wiederholt. Ausgenommen: lokale Helfer in Testdateien (`makeOps()`, `makeTask()`).
- **Vor jedem Commit grün:** `bun run typecheck`, `bun lint`, `bun test`, `bun format:check`.
- **Die Aufgaben-Suite läuft unter drei Runner-Zonen mit identischem Ergebnis:** `TZ=Europe/Berlin`, `TZ=UTC`, `TZ=America/New_York`. Block 1 hat fünf Befunde geliefert, die nur unter einer fremden Zone sichtbar waren.
- **Keine Verhaltensänderung in Task 1.** Task 1 ist reiner Umzug; wer dort etwas „nebenbei verbessert", macht den Charakterisierungstest wertlos.

---

## Dateien

| Datei                                  | Rolle                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `features/tasks/mutations.ts`          | **Modify** — `TaskOps`, `createSupabaseTaskOps`, `updateTask`, `deleteTask`; Hooks werden Hüllen |
| `features/tasks/mutations.test.ts`     | **Create** — die erste Testsuite des Aufgaben-Schreibpfads                                       |
| `features/tasks/queries.ts`            | **Modify** — `SELECT` wird als `TASK_SELECT` exportiert                                          |
| `features/tasks/index.ts`              | **Modify** — die neuen Symbole aus dem Barrel reichen                                            |
| `app-sections/task/TaskEditScreen.tsx` | **Modify** — `onDelete` schickt `baseVersion` und bekommt `errorAction`                          |
| `docs/TODO.md`                         | **Modify** — drei Einträge gelöscht, einer angelegt                                              |
| `docs/decision-log.md`                 | **Modify** — ADR-036 angehängt                                                                   |
| `CLAUDE.md` · `docs/roadmap.md`        | **Modify** — Conflict-Detection-Absatz und Block 2 nachgezogen                                   |

---

## Task 1: Deps-Schnitt für `updateTask` — verhaltensgleich

**Files:**

- Modify: `features/tasks/queries.ts:15` (`const SELECT` → `export const TASK_SELECT`)
- Modify: `features/tasks/mutations.ts` (Imports; `TaskOps`; `createSupabaseTaskOps`; `updateTask`; `useUpdateTask:113-155`)
- Modify: `features/tasks/index.ts:14-22` (Barrel)
- Test: `features/tasks/mutations.test.ts` (neu)

**Interfaces:**

- Consumes: `TaskChanges` aus `./optimistic`, `TaskWithType` aus `./types`, `TaskConflictError` aus `./errors`, `UpdateTaskVars` (unverändert, existiert bereits).
- Produces: `TaskOps` (**zwei** Member: `fetchRow` · `updateRow`), `createSupabaseTaskOps(client: SupabaseClient<Database>): TaskOps`, `updateTask(vars: UpdateTaskVars, deps: TaskOps): Promise<void>`, `TASK_SELECT: string`.
- **`deleteRow` gehört ausdrücklich NICHT in diesen Task.** Task 2 fügt es dem Interface, `createSupabaseTaskOps` und dem Test-Helfer `makeOps()` hinzu — zusammen mit seinem Aufrufer `deleteTask`, seinem Ops-Test und der Screen-Verdrahtung. Hier angelegt wäre es eine Methode ohne Aufrufer und ohne Test in einem Commit, dessen erklärter Zweck „verhaltensgleicher Umzug" ist; das Interface wächst lieber einmal in dem Commit, der es benutzt, als einmal auf Vorrat.

- [ ] **Step 1: `SELECT` exportierbar machen**

In `features/tasks/queries.ts` die Konstante umbenennen und exportieren. Es gibt genau **zwei** Vorkommen: die Deklaration in Zeile 15 und die Verwendung in `fetchFamilyTasks` (Zeile 53). Nachgezählt beim Planen — mit `rg 'SELECT' features/tasks/queries.ts` gegenprüfen, dass keines übrig bleibt.

```ts
/**
 * Die Spaltenliste, mit der eine Aufgabe überall gelesen wird — Listen wie
 * Einzelzeile. Exportiert, weil `createSupabaseTaskOps.fetchRow`
 * (`mutations.ts`) dieselbe Form braucht: `TaskConflictError` trägt eine
 * `TaskWithType`, und der Screen zeigt daraus den Aufgabentyp. Zwei
 * Spaltenlisten für dieselbe Zeile liefen auseinander, sobald eine Spalte
 * dazukommt.
 */
export const TASK_SELECT = "*, task_types(*)";
```

- [ ] **Step 2: `TaskOps` und `createSupabaseTaskOps` schreiben**

In `features/tasks/mutations.ts`, oberhalb von `useCreateTask`. Zwei neue Imports oben: `import type { SupabaseClient } from "@supabase/supabase-js";` und `import type { Database } from "@/features/supabase/database.types";`, dazu `TASK_SELECT` aus `./queries` (dort steht schon `import { taskKeys } from "./queries";` — erweitern, keinen zweiten Import anlegen).

```ts
/**
 * Der Schnitt, an dem der Schreibpfad die Datenbank berührt — das Gegenstück
 * zu `EventOps` in [features/calendar/recurrence.ts](../calendar/recurrence.ts).
 * Ohne ihn spricht die Mutation direkt mit dem Modul-`supabase`, und ihr
 * Compare-and-Swap ist allein durch einen beobachteten Zwei-Client-Lauf
 * belegt statt durch einen Test.
 *
 * **Die Ops melden, die reine Funktion urteilt.** `updateRow`/`deleteRow`
 * geben `true`/`false` zurück, statt bei null Zeilen selbst zu werfen: Das
 * Klassifizieren („fremde Änderung" gegen „Zeile weg") braucht einen zweiten
 * Aufruf (`fetchRow`), und eine Op, die eine andere Op ruft, ist keine Op
 * mehr. Der Kalender hat den Wurf **in** `updateMaster` — genau deshalb muss
 * ein Fix dort in den Supabase-Adapter hineingreifen statt in die reine
 * Funktion.
 *
 * Nur `useUpdateTask` und `useDeleteTask` laufen hierüber. `useCreateTask`
 * und `useToggleTaskDone` bleiben bewusst beim direkten Client: Beide haben
 * kein Compare-and-Swap, das zu prüfen wäre, und sie ohne Anlass umzubauen
 * hieße, zwei Pfade anzufassen, für die niemand einen Testfall genannt hat.
 * Die Datei trägt dafür vorerst zwei Idiome.
 */
export interface TaskOps {
  /** Die Zeile samt `task_types`-Join — die Form, die `TaskConflictError` trägt. */
  fetchRow: (taskId: string) => Promise<TaskWithType | null>;
  /** `true`, wenn das Compare-and-Swap die Zeile getroffen hat. */
  updateRow: (taskId: string, changes: TaskChanges, seenUpdatedAt: string) => Promise<boolean>;
}

/**
 * Kapselt die PostgREST-Aufrufe von `updateTask` und `deleteTask` — und zwar
 * nur deren: `useCreateTask` und `useToggleTaskDone` sprechen weiterhin direkt
 * mit dem Modul-`supabase` (siehe {@link TaskOps}).
 *
 * `.eq("updated_at", …)` macht aus Update und Delete je ein Compare-and-Swap:
 * Sie treffen die Zeile nur, solange niemand anderes sie seit dem Laden des
 * Formulars angefasst hat. `.select("id").maybeSingle()` ist die andere
 * Hälfte davon — **ohne sie meldet PostgREST auch dann `error: null`, wenn
 * null Zeilen getroffen wurden**, und der Aufrufer könnte „gelungen" nicht von
 * „nichts passiert" unterscheiden. Beides zusammen ist das CAS; einzeln ist
 * keines davon etwas wert (ADR-031).
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
  };
}
```

- [ ] **Step 3: `updateTask` als reine Funktion**

Direkt unter `createSupabaseTaskOps`. Der Rumpf ist der bisherige `mutationFn`-Inhalt von `useUpdateTask` — **die Kommentare wandern mit, sie tragen die Entscheidungen.**

```ts
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
```

- [ ] **Step 4: `useUpdateTask` auf die Hülle reduzieren**

Nur der `mutationFn` ändert sich. `onMutate`, `onError`, `onSettled` bleiben **Zeichen für Zeichen** stehen.

```ts
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
```

- [ ] **Step 5: Barrel erweitern**

In `features/tasks/index.ts` den `./mutations`-Block ergänzen — `createSupabaseTaskOps`, `updateTask` und `type TaskOps`, alphabetisch einsortiert. `TASK_SELECT` wird **nicht** exportiert: Es ist ein Implementierungsdetail zweier Nachbardateien, kein Feature-API.

- [ ] **Step 6: Testsuite anlegen**

Neu: `features/tasks/mutations.test.ts`.

```ts
import { describe, expect, mock, test } from "bun:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/features/supabase/database.types";

import type { TaskChanges } from "./optimistic";
import type { TaskWithType } from "./types";

import { TaskConflictError, mapTaskError } from "./errors";
import { createSupabaseTaskOps, updateTask, type TaskOps, type UpdateTaskVars } from "./mutations";

const BASE_VERSION = "2026-06-01T00:00:00.000Z";
const THEIR_VERSION = "2026-06-01T09:30:00.000Z";

function makeTask(overrides: Partial<TaskWithType> = {}): TaskWithType {
  return {
    id: "task-1",
    family_id: "fam-1",
    type_id: "type-1",
    child_id: null,
    title: "Mathe Seite 42",
    description: null,
    subject: "Mathe",
    due_date: "2026-06-15",
    due_time: null,
    is_done: false,
    completed_at: null,
    completed_by: null,
    created_by: null,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: BASE_VERSION,
    task_types: null,
    ...overrides,
  };
}

function makeOps(overrides: Partial<TaskOps> = {}): TaskOps {
  return {
    fetchRow: mock(() => Promise.resolve(null)),
    updateRow: mock(() => Promise.resolve(true)),
    ...overrides,
  };
}

const CHANGES: TaskChanges = {
  title: "Mathe Seite 43",
  description: null,
  subject: "Mathe",
  due_date: "2026-06-15",
  due_time: null,
  child_id: null,
  type_id: "type-1",
};

const UPDATE_VARS: UpdateTaskVars = {
  taskId: "task-1",
  changes: CHANGES,
  baseVersion: BASE_VERSION,
};

describe("updateTask", () => {
  test("das CAS trifft: kein Wurf und keine Nachlese", async () => {
    // Der Roundtrip-Vertrag: Im Normalfall — niemand kommt ins Gehege — kostet
    // der Konflikt-Guard keinen zusaetzlichen Lesevorgang.
    const ops = makeOps();
    await updateTask(UPDATE_VARS, ops);
    expect(ops.updateRow).toHaveBeenCalledWith("task-1", CHANGES, BASE_VERSION);
    expect(ops.fetchRow).not.toHaveBeenCalled();
  });

  test("das CAS verfehlt und die Zeile steht noch: TaskConflictError mit der fremden Fassung", async () => {
    const theirs = makeTask({ title: "Mathe Seite 44", updated_at: THEIR_VERSION });
    const ops = makeOps({
      updateRow: mock(() => Promise.resolve(false)),
      fetchRow: mock(() => Promise.resolve(theirs)),
    });

    // Kein `.rejects`: dieselbe `@typescript-eslint/await-thenable`-Luecke in
    // @types/bun wie in den Kalender-Suiten.
    const error = await updateTask(UPDATE_VARS, ops).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(TaskConflictError);
    // Die *nachgelesene* Zeile, nicht irgendeine — daran haengt, dass der
    // Dialog eine frische Basis-Version anbieten kann.
    expect((error as TaskConflictError).row).toBe(theirs);
  });

  test("das CAS verfehlt und die Zeile ist weg: Wurf, der auf hw.error.generic mappt", async () => {
    const ops = makeOps({
      updateRow: mock(() => Promise.resolve(false)),
      fetchRow: mock(() => Promise.resolve(null)),
    });

    const error = await updateTask(UPDATE_VARS, ops).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(TaskConflictError);
    // Bewusst nicht `hw.error.staleReference` — der Key benennt ein totes Kind
    // oder einen toten Aufgabentyp, nicht die verschwundene Zeile selbst.
    expect(mapTaskError(error)).toBe("hw.error.generic");
  });
});
```

- [ ] **Step 7: Den Supabase-Adapter selbst prüfen**

An dieselbe Datei anhängen. Der Fake-Client ist der Doppelgänger aus [features/calendar/recurrence.test.ts:630-659](../../../features/calendar/recurrence.test.ts) — dort steht die Begründung, warum `createSupabaseTaskOps` den Client als Parameter nimmt statt `mock.module` zu brauchen.

```ts
// ── createSupabaseTaskOps ─────────────────────────────────────────────────
// Ohne diese Suite blieben alle Aufgaben-Tests gruen, wuerde jemand
// `.eq("updated_at", …)` oder `.select("id")` entfernen — also genau die
// Haelften, die zusammen das Compare-and-Swap ausmachen.

/**
 * Doppelgaenger des Query-Builders, den `updateRow` durchlaeuft
 * (`.from().update().eq().eq().select().maybeSingle()`).
 */
function fakeUpdateClient(result: { data: { id: string } | null; error: unknown }) {
  const calls = {
    table: "",
    payload: undefined as unknown,
    eqCalls: [] as [string, unknown][],
    selectColumns: "",
  };
  const builder = {
    eq(column: string, value: unknown) {
      calls.eqCalls.push([column, value]);
      return builder;
    },
    select(columns: string) {
      calls.selectColumns = columns;
      return builder;
    },
    maybeSingle: () => Promise.resolve(result),
  };
  const client = {
    from(table: string) {
      calls.table = table;
      return {
        update(payload: unknown) {
          calls.payload = payload;
          return builder;
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, calls };
}

describe("createSupabaseTaskOps.updateRow", () => {
  test("filtert auf id UND den gesehenen Stempel und liest die id zurueck", async () => {
    const { client, calls } = fakeUpdateClient({ data: { id: "task-1" }, error: null });

    const hit = await createSupabaseTaskOps(client).updateRow("task-1", CHANGES, BASE_VERSION);

    expect(hit).toBe(true);
    expect(calls.table).toBe("tasks");
    expect(calls.payload).toEqual(CHANGES);
    expect(calls.eqCalls).toEqual([
      ["id", "task-1"],
      ["updated_at", BASE_VERSION],
    ]);
    // Ohne `.select(…)` meldet PostgREST auch bei null Zeilen `error: null`.
    expect(calls.selectColumns).toBe("id");
  });

  test("null Zeilen ergeben false, nicht einen Wurf", async () => {
    const { client } = fakeUpdateClient({ data: null, error: null });
    expect(await createSupabaseTaskOps(client).updateRow("task-1", CHANGES, BASE_VERSION)).toBe(
      false,
    );
  });

  test("ein PostgREST-Fehler wird durchgereicht, nicht als Konflikt maskiert", async () => {
    const pgError = { message: "connection reset", code: "08006" };
    const { client } = fakeUpdateClient({ data: null, error: pgError });

    const error = await createSupabaseTaskOps(client)
      .updateRow("task-1", CHANGES, BASE_VERSION)
      .catch((err: unknown) => err);

    expect(error).toBe(pgError);
  });
});
```

- [ ] **Step 8: Tests laufen lassen**

Run: `bun test features/tasks/mutations.test.ts`
Expected: **6 pass, 0 fail.**

- [ ] **Step 9: Mutationsprobe — beweisen, dass die Suite fallen kann**

Task 1 ändert kein Verhalten, die Tests sind also **Charakterisierung**, nicht Rot-vor-Grün. Damit sie mehr sind als sechs grüne Häkchen, wird jede der drei tragenden Zeilen einmal weggenommen und geprüft, dass die Suite **rot** wird. Nach jeder Probe die Zeile wiederherstellen.

1. In `createSupabaseTaskOps.updateRow` `.eq("updated_at", seenUpdatedAt)` entfernen → `bun test features/tasks/mutations.test.ts` muss fehlschlagen.
2. `.select("id")` entfernen → muss fehlschlagen.
3. In `updateTask` das `if (!current) throw new Error(...)` durch `return` ersetzen → muss fehlschlagen.

Nach der dritten Probe `git diff` prüfen: Der Baum muss wieder exakt dem Stand nach Step 7 entsprechen.

Das Ergebnis dieser drei Proben gehört **wörtlich in den Task-Report** (welche Probe, welcher Test fiel). Eine Probe, die grün bleibt, ist ein Befund — dann meldet der Task das, statt weiterzumachen.

- [ ] **Step 10: Den erledigten TODO-Eintrag löschen**

In `docs/TODO.md` den Eintrag **„`useUpdateTask` hat keine eigene Testsuite"** (Sektion Conflict-Detection, eine Zeile) **vollständig entfernen** — nicht abhaken, nicht umformulieren. `docs/TODO.md` ist der aktive Backlog, keine Historie (CLAUDE.md → Out-of-scope TODOs).

Das gehört in **denselben** Commit wie der Code, nicht in einen eigenen: CLAUDE.md verlangt, den Eintrag in dem Commit zu löschen, der ihn auflöst — und das ist der, der die Testsuite mitbringt.

- [ ] **Step 11: Gates und Commit**

```bash
bun run typecheck && bun lint && bun format:check
bun test
TZ=UTC bun test features/tasks/
TZ=America/New_York bun test features/tasks/
```

Alle vier Läufe grün und die drei Zonen identisch. Dann:

```bash
git add features/tasks/mutations.ts features/tasks/mutations.test.ts \
        features/tasks/queries.ts features/tasks/index.ts docs/TODO.md
git commit -m "refactor(tasks): injizierbarer Deps-Schnitt fuer den Schreibpfad"
```

---

## Task 2: Lösch-CAS und 0-Zeilen-Guard

**Files:**

- Modify: `features/tasks/mutations.ts` (`DeleteTaskVars`; neue Funktion `deleteTask`; `useDeleteTask`)
- Modify: `features/tasks/index.ts` (Barrel um `deleteTask`)
- Modify: `app-sections/task/TaskEditScreen.tsx` — `onDelete`
- Modify: `docs/TODO.md`
- Test: `features/tasks/mutations.test.ts` (erweitern)

**Interfaces:**

- Consumes: `TaskOps` und `createSupabaseTaskOps` aus Task 1 — dort mit **zwei** Membern (`fetchRow`, `updateRow`) und der Testhelfer `makeOps()` entsprechend.
- Produces: **`deleteRow` als drittes Member** von `TaskOps`, samt Implementierung in `createSupabaseTaskOps` und Eintrag in `makeOps()`; `deleteTask(vars: DeleteTaskVars, deps: TaskOps): Promise<void>`; `DeleteTaskVars` trägt jetzt `{ taskId: string; baseVersion: string }`. **Task 3 hängt sich an genau diese Signatur** und ruft sie mit `baseVersion: err.row.updated_at` erneut.

> **`deleteRow` entsteht hier, nicht in Task 1.** Es kommt zusammen mit seinem Aufrufer, seinem Test und der Screen-Verdrahtung in einen Commit. In Task 1 angelegt wäre es eine Methode ohne Aufrufer und ohne Test gewesen.

- [ ] **Step 0: `deleteRow` an `TaskOps` und `createSupabaseTaskOps` ergänzen**

Interface-Member (hinter `updateRow`):

```ts
/** `true`, wenn das Compare-and-Swap die Zeile getroffen hat. */
deleteRow: (taskId: string, seenUpdatedAt: string) => Promise<boolean>;
```

Implementierung in `createSupabaseTaskOps` (hinter `updateRow`):

```ts
    deleteRow: async (taskId, seenUpdatedAt) => {
      const { data, error } = await client
        .from("tasks")
        .delete()
        .eq("id", taskId)
        .eq("updated_at", seenUpdatedAt)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      return data !== null;
    },
```

Und im Testhelfer `makeOps()` in `features/tasks/mutations.test.ts` die Zeile `deleteRow: mock(() => Promise.resolve(true)),` hinter `updateRow` ergänzen.

> **Warum Feature-Schicht und Screen in einem Commit:** `DeleteTaskVars` bekommt ein Pflichtfeld. `TaskEditScreen` ist der einzige Aufrufer (`rg 'useDeleteTask' --type ts --type tsx`) und bricht ohne die Anpassung im Typecheck. Ein Commit, der nicht typecheckt, ist kein grüner Commit — die beiden gehören zusammen. Der Toast-Teil ist davon unabhängig und steht in Task 3.

- [ ] **Step 1: Den roten Test schreiben**

An `features/tasks/mutations.test.ts` anhängen, oberhalb des `createSupabaseTaskOps`-Blocks. Import-Zeile erweitern um `deleteTask` und `type DeleteTaskVars`.

```ts
const DELETE_VARS: DeleteTaskVars = { taskId: "task-1", baseVersion: BASE_VERSION };

describe("deleteTask", () => {
  test("das CAS trifft: kein Wurf und keine Nachlese", async () => {
    const ops = makeOps();
    await deleteTask(DELETE_VARS, ops);
    expect(ops.deleteRow).toHaveBeenCalledWith("task-1", BASE_VERSION);
    expect(ops.fetchRow).not.toHaveBeenCalled();
  });

  test("das CAS verfehlt und die Zeile steht noch: TaskConflictError mit der fremden Fassung", async () => {
    // Der beobachtete Zwei-Client-Lauf, jetzt automatisiert: A plant eine
    // Loeschung, B aendert dieselbe Zeile im Undo-Fenster und speichert.
    // Vorher lief das DELETE durch, ohne dass B ein Wort davon erfuhr.
    const theirs = makeTask({ title: "Mathe Seite 44", updated_at: THEIR_VERSION });
    const ops = makeOps({
      deleteRow: mock(() => Promise.resolve(false)),
      fetchRow: mock(() => Promise.resolve(theirs)),
    });

    const error = await deleteTask(DELETE_VARS, ops).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(TaskConflictError);
    expect((error as TaskConflictError).row).toBe(theirs);
  });

  test("GRENZWAECHTER: das CAS verfehlt und die Zeile ist weg: kein Wurf", async () => {
    // Die Absicht ist erfuellt — die Aufgabe ist weg, gleich wessen DELETE sie
    // erwischt hat. Ein Toast „Loeschen fehlgeschlagen" ueber einer Aufgabe,
    // die nicht mehr existiert, waere schlicht falsch (Spec Decision 4).
    // Beim Speichern ist derselbe Fall ein Fehler, weil dort *Inhalt*
    // verlorengeht — siehe den Test darueber.
    const ops = makeOps({
      deleteRow: mock(() => Promise.resolve(false)),
      fetchRow: mock(() => Promise.resolve(null)),
    });

    // Kein `expect(...).resolves` — ein Wurf laesst den Test hier von selbst
    // fehlschlagen, und das ist die Aussage.
    await deleteTask(DELETE_VARS, ops);
    expect(ops.fetchRow).toHaveBeenCalledWith("task-1");
  });

  test("GRENZWAECHTER: die uebergebene baseVersion geht unveraendert an das CAS", async () => {
    // Der Waechter gegen ein spaeteres „wir nehmen doch die frische Version":
    // Mit `task.updated_at` aus der lebenden Query traefe das CAS anstandslos
    // und pruefte damit genau die Fremdaenderung nicht mehr, gegen die es
    // gebaut ist (ADR-031 Decision 6).
    const ops = makeOps();
    await deleteTask({ taskId: "task-7", baseVersion: "2026-01-02T03:04:05.000Z" }, ops);
    expect(ops.deleteRow).toHaveBeenCalledWith("task-7", "2026-01-02T03:04:05.000Z");
  });
});
```

Dazu an den `createSupabaseTaskOps`-Block anhängen — mit einem eigenen Fake, weil der Builder hier an `.delete()` statt an `.update(payload)` hängt:

```ts
/** Wie `fakeUpdateClient`, nur fuer die Kette `.from().delete().eq().eq().select().maybeSingle()`. */
function fakeDeleteClient(result: { data: { id: string } | null; error: unknown }) {
  const calls = { table: "", eqCalls: [] as [string, unknown][], selectColumns: "" };
  const builder = {
    eq(column: string, value: unknown) {
      calls.eqCalls.push([column, value]);
      return builder;
    },
    select(columns: string) {
      calls.selectColumns = columns;
      return builder;
    },
    maybeSingle: () => Promise.resolve(result),
  };
  const client = {
    from(table: string) {
      calls.table = table;
      return { delete: () => builder };
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, calls };
}

describe("createSupabaseTaskOps.deleteRow", () => {
  test("filtert auf id UND den gesehenen Stempel und liest die id zurueck", async () => {
    const { client, calls } = fakeDeleteClient({ data: { id: "task-1" }, error: null });

    const hit = await createSupabaseTaskOps(client).deleteRow("task-1", BASE_VERSION);

    expect(hit).toBe(true);
    expect(calls.table).toBe("tasks");
    expect(calls.eqCalls).toEqual([
      ["id", "task-1"],
      ["updated_at", BASE_VERSION],
    ]);
    // Der Kern des 0-Zeilen-Guards: Ein DELETE ohne `.select(…)` meldet auch
    // dann Erfolg, wenn es unter RLS oder nach einer Fremdloeschung keine
    // einzige Zeile getroffen hat.
    expect(calls.selectColumns).toBe("id");
  });

  test("null Zeilen ergeben false, nicht einen Wurf", async () => {
    const { client } = fakeDeleteClient({ data: null, error: null });
    expect(await createSupabaseTaskOps(client).deleteRow("task-1", BASE_VERSION)).toBe(false);
  });
});
```

- [ ] **Step 2: Tests laufen lassen, Rot bestätigen**

Run: `bun test features/tasks/mutations.test.ts`
Expected: **FAIL** — `deleteTask` existiert nicht (`SyntaxError: export 'deleteTask' not found in './mutations'` oder `undefined is not a function`, je nach Bun-Version). Alle sechs neuen Tests rot, die sechs aus Task 1 unberührt.

Das Rot **im Report festhalten**, mit der tatsächlichen Fehlermeldung. „War rot" ohne Ausgabe ist keine Vorführung.

- [ ] **Step 3: `DeleteTaskVars` erweitern**

```ts
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
```

- [ ] **Step 4: `deleteTask` schreiben**

Direkt unter `updateTask`.

```ts
/**
 * Löscht die Aufgabe, solange niemand anderes sie seit dem Laden des
 * Formulars angefasst hat — dasselbe Compare-and-Swap wie
 * {@link updateTask}, mit einem Unterschied am Ende.
 *
 * **Eine bereits verschwundene Zeile ist hier ein Erfolg, beim Speichern ein
 * Fehler.** Beim Speichern geht *Inhalt* verloren: Der Nutzer hat etwas
 * getippt, das nirgendwo mehr ankommt. Beim Löschen ist die *Absicht*
 * erfüllt — die Aufgabe ist weg, gleich wessen DELETE sie erwischt hat, und
 * eine Fehlermeldung darüber wäre schlicht falsch.
 *
 * Die Grenze davon: Eine RLS-Ablehnung **ohne** Abmeldung (der Elternteil
 * wurde aus der Familie entfernt, während der Undo-Timer lief) ist vom
 * Client aus von „schon gelöscht" nicht zu unterscheiden — beide liefern null
 * Zeilen ohne Fehler und eine leere Nachlese. Sie nimmt hier denselben
 * stillen Weg; siehe `docs/TODO.md`. Der *Abmelde*-Fall ist davon nicht
 * betroffen: `useSignOut` ruft `flush()` vor `signOut`, das DELETE läuft also
 * noch angemeldet.
 */
export async function deleteTask(vars: DeleteTaskVars, deps: TaskOps): Promise<void> {
  const hit = await deps.deleteRow(vars.taskId, vars.baseVersion);
  if (hit) return;

  const current = await deps.fetchRow(vars.taskId);
  if (!current) return;
  throw new TaskConflictError(current);
}
```

- [ ] **Step 5: `useDeleteTask` auf die Hülle reduzieren**

```ts
export function useDeleteTask() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (vars: DeleteTaskVars) => deleteTask(vars, createSupabaseTaskOps(supabase)),
    onMutate: (vars) => patchTaskCaches(qc, (tasks) => applyDelete(tasks, vars.taskId)),
    onError: (_err, _vars, snapshot) => restoreTaskCaches(qc, snapshot),
    onSettled: () => invalidateTasks(qc),
  });
}
```

`deleteTask` in `features/tasks/index.ts` mit exportieren.

- [ ] **Step 6: Den Aufrufer nachziehen**

In `app-sections/task/TaskEditScreen.tsx`, Funktion `onDelete`. Zwei Zeilen: der Guard und die Vars.

```ts
  async function onDelete() {
    // `baseVersion` statt `task.updated_at`: dieselbe Invariante wie in
    // `onSave`. Ein Refetch, der Millisekunden nach der Hydration landet,
    // schiebt `task.updated_at` weiter, ohne dass der Nutzer etwas davon
    // sieht — das CAS träfe dann anstandslos und prüfte genau die
    // Fremdänderung nicht, gegen die es gebaut ist.
    if (!taskId || !task || baseVersion == null) return;
```

und im `undoableDelete`-Aufruf:

```ts
      run: () => deleteMutation.mutateAsync({ taskId, baseVersion }),
```

- [ ] **Step 7: Tests laufen lassen, Grün bestätigen**

Run: `bun test features/tasks/mutations.test.ts`
Expected: **12 pass, 0 fail.**

- [ ] **Step 8: Mutationsprobe am Grenzwächter**

Den `if (!current) return;` in `deleteTask` zu `if (!current) throw new Error("gone");` ändern → der Test „das CAS verfehlt und die Zeile ist weg" muss **rot** werden. Danach zurücksetzen und `git diff` prüfen.

Ergebnis in den Report.

- [ ] **Step 9: Die neue Grenze als TODO-Eintrag anlegen**

In `docs/TODO.md`, Sektion **Aufgaben / Tasks**, eine Zeile anhängen:

```markdown
- **Eine RLS-Ablehnung beim Löschen ist nicht von „schon gelöscht" zu unterscheiden** ([features/tasks/mutations.ts](../features/tasks/mutations.ts) — `deleteTask`): Trifft das DELETE null Zeilen, liest `deleteTask` die Zeile nach; kommt auch dort nichts zurück, gilt die Löschung als erfolgreich (die Absicht ist erfüllt). Unter RLS ist dieser Zustand jedoch mehrdeutig: Wurde der Elternteil aus der Familie entfernt, während der 5-s-Undo-Timer lief, liefert **sowohl** das DELETE **als auch** die Nachlese leer — die verweigerte Löschung nimmt denselben stillen Weg wie die bereits erledigte. Der Abmelde-Fall ist davon nicht betroffen (`useSignOut` ruft `flush()` vor `signOut`, [features/auth/mutations.ts](../features/auth/mutations.ts)). Ein Fix bräuchte eine serverseitige Auskunft, die beide Fälle trennt — etwa eine RPC, die `deleted`/`forbidden`/`missing` meldet —, und damit eine Migration; nicht Teil dieser Iteration. Vertagt bis Block 7 (Transaktions-RPC), wo derselbe Schnitt ohnehin ansteht.
```

- [ ] **Step 10: Den erledigten TODO-Eintrag löschen**

Den Eintrag **„`useDeleteTask` hat keinen 0-Zeilen-Guard"** (Sektion Aufgaben / Tasks) vollständig entfernen.

Der zweite Eintrag — **„`useDeleteTask` prüft keine `baseVersion`"** — bleibt vorerst stehen: Er verlangt ausdrücklich „beides zusammen — `.eq("updated_at", …)` plus Nachlese **und** ein `errorAction` am Aufrufer". Die zweite Hälfte kommt in Task 3, und dort wird er gelöscht.

- [ ] **Step 11: Gates und Commit**

```bash
bun run typecheck && bun lint && bun format:check
bun test
TZ=UTC bun test features/tasks/
TZ=America/New_York bun test features/tasks/
```

```bash
git add features/tasks/mutations.ts features/tasks/mutations.test.ts features/tasks/index.ts \
        app-sections/task/TaskEditScreen.tsx docs/TODO.md
git commit -m "fix(tasks): Loeschen prueft die gesehene Version und null getroffene Zeilen"
```

---

## Task 3: „Trotzdem löschen" am Fehler-Toast

**Files:**

- Modify: `app-sections/task/TaskEditScreen.tsx` — `onDelete`
- Modify: `docs/TODO.md`

**Interfaces:**

- Consumes: `deleteTask`/`DeleteTaskVars` aus Task 2 (`{ taskId, baseVersion }`), `TaskConflictError` mit nicht-nullbarem `row: TaskWithType`, `useUndoableDelete`s optionales `errorAction?: (err: unknown) => ToastAction | undefined`.
- Produces: nichts, was ein späterer Task konsumiert. Letzter Task des PRs vor den Dokumenten.

> **Dieser Task hat keinen Unit-Test, und das ist kein Versäumnis.** Es gibt im Repo keinen Pfad, React-Komponenten im Test zu rendern — `features/calendar/hooks.ts` und damit jeder Screen ist unter `bun test` nicht ladbar (`nativewind` → `react-native-css-interop` scheitert beim Modul-Laden). Das ist Block 5 der Roadmap, ein eigener Spike. Das Gegenstück im Kalender ([EventDetailScreen.tsx:190-220](../../../app-sections/event/EventDetailScreen.tsx)) ist aus demselben Grund ebenfalls ungetestet. Die Absicherung hier ist: identische Form zum bewährten Kalender-Pfad, Typecheck, Lint — und die Sichtprüfung aus der Definition of Done. Wer hier einen Test erfindet, der nur die eigene Konstruktion prüft, macht die Suite größer und nicht sicherer.

- [ ] **Step 1: `errorAction` ergänzen**

In `app-sections/task/TaskEditScreen.tsx`, im `undoableDelete({ … })`-Aufruf in `onDelete`, hinter `formatError`. `useToast`s `show` ist im Screen bereits als `const { show } = useToast();` vorhanden.

```ts
      // „Trotzdem löschen" statt eines Dialogs: Das Löschen läuft seit ADR-026
      // fünf Sekunden verzögert, der Nutzer ist längst auf einem anderen
      // Screen und hat die Aufgabe nicht mehr vor sich — ein Feldvergleich
      // hätte dort nichts zu vergleichen (ADR-031). Wort für Wort dieselbe
      // Überlegung wie im Termin-Pfad (`EventDetailScreen.tsx`).
      //
      // Die frische Basis-Version kommt aus der Fassung, die der Fehler
      // mitträgt; ein `force`-Flag braucht es dafür nicht. Der Retry läuft
      // ohne eigenes Undo-Fenster — der Nutzer hat gerade ausdrücklich
      // entschieden, ein zweites „bist du sicher?" wäre eine Rückfrage auf
      // eine Antwort, die schon gegeben ist.
      errorAction: (err) => {
        if (!(err instanceof TaskConflictError)) return undefined;
        const fresh = err.row.updated_at;
        return {
          label: t("conflict.deleteAnyway"),
          onPress: () => {
            // `useDeleteTask` hat kein `onError` — ohne dieses `.catch()`
            // verschwände ein zweiter Kollisions- oder Netzwerkfehler
            // lautlos: Es gibt weder einen `unhandledrejection`-Handler noch
            // eine ErrorBoundary im Repo. Bewusst ohne eine zweite
            // „Trotzdem löschen"-Aktion — eine Aktion, die sich selbst
            // nachreicht, baute eine Kette, die nur wächst. Die Aufgabe steht
            // ja noch; der Nutzer kann sie regulär erneut löschen, dann mit
            // vollem Undo-Fenster.
            deleteMutation
              .mutateAsync({ taskId, baseVersion: fresh })
              .catch((retryErr: unknown) => {
                show({
                  title: t("hw.delete.error"),
                  message: t(mapTaskError(retryErr)),
                  variant: "error",
                  position: "bottom",
                });
              });
          },
        };
      },
```

- [ ] **Step 2: Typecheck und Lint**

Run: `bun run typecheck && bun lint`
Expected: keine Fehler. Eine bestehende Warnung in `app/+not-found.tsx` ist Altbestand und bleibt.

Falls `TaskConflictError` oder `mapTaskError` im Screen noch nicht importiert sind: Beide stehen bereits im großen `@/features/tasks`-Import-Block oben (`mapTaskError`, `TaskConflictError`) — prüfen statt blind ergänzen.

- [ ] **Step 3: Die Kette von Hand durchdenken und im Report belegen**

Kein Testlauf, sondern eine Ablaufprüfung am Code — drei Fragen, jede mit Datei und Zeile im Report beantwortet:

1. Erreicht ein `TaskConflictError` aus `deleteTask` überhaupt `errorAction`? (Weg: `deleteTask` wirft → `mutateAsync` lehnt ab → `useUndoableDelete`s `catch` → `show({ action: args.errorAction?.(err) })`.)
2. Überlebt die Closure den Screenwechsel? (`onDelete` navigiert direkt nach `undoableDelete(...)`; der Timer läuft im Modul-Store.)
3. Was passiert, wenn der Retry erneut kollidiert? (Erwartung: Fehler-Toast ohne Aktion — **keine** zweite „Trotzdem löschen"-Kette.)

- [ ] **Step 4: Den erledigten TODO-Eintrag löschen**

Den Eintrag **„`useDeleteTask` prüft keine `baseVersion`"** (Sektion Conflict-Detection) vollständig entfernen — jetzt sind beide von ihm verlangten Hälften da.

- [ ] **Step 5: Gates und Commit**

```bash
bun run typecheck && bun lint && bun format:check && bun test
```

```bash
git add app-sections/task/TaskEditScreen.tsx docs/TODO.md
git commit -m "feat(tasks): Loeschkonflikt bietet \"Trotzdem loeschen\" am Fehler-Toast"
```

---

## Task 4: ADR-036 und die Dokumente nachziehen

**Files:**

- Modify: `docs/decision-log.md` (ADR-036 **anhängen**)
- Modify: `CLAUDE.md` (Conflict-Detection-Satz; Ordnerübersicht `features/tasks/`)
- Modify: `docs/roadmap.md` (2.1 als erledigt markieren)

**Interfaces:** keine — reine Dokumentation.

- [ ] **Step 1: ADR-036 anhängen**

Ans **Ende** von `docs/decision-log.md`, hinter ADR-035. Ältere ADRs bleiben unberührt.

```markdown
## ADR-036 — Der Aufgaben-Schreibpfad bekommt den Schnitt des Kalenders (2026-09-17)

**Status:** Accepted
**Kontext:** [Block 2](./roadmap.md#block-2--aufgaben-löschpfad--konfliktlücken) · [Spec §3](./superpowers/specs/2026-09-17-tasks-delete-path-conflict-gaps-design.md) · ergänzt [ADR-031](#adr-031--conflict-detection-updated_at-beleben-dreiwertig-vergleichen-ein-dialog-im-root-layout-2026-09-04), löst nichts ab

ADR-031 hat den Aufgaben-Pfad mit einem Compare-and-Swap versehen, aber ohne Schnitt, an dem er ohne Netz zu prüfen wäre — belegt war er allein durch einen beobachteten Zwei-Client-Lauf. Und das _Löschen_ hatte gar keinen: Ein DELETE, das unter RLS oder nach einer Fremdlöschung null Zeilen trifft, meldet `error: null`, die Mutation „gelingt", gelöscht wurde nichts. Im Zwei-Client-Lauf beobachtet: A plant eine Löschung, B ändert dieselbe Aufgabe im 5-Sekunden-Undo-Fenster und speichert erfolgreich; nach Ablauf ist sie weg, ohne dass B ein Wort davon erfährt.

### Decisions

1. **`TaskOps` kapselt die drei PostgREST-Aufrufe** von `updateTask` und `deleteTask`; `createSupabaseTaskOps(client)` ist der einzige Ort, der für diese beiden Pfade den Client kennt. Gegenstück zu `EventOps`. Für die anderen beiden Mutationen gilt das ausdrücklich nicht — siehe Decision 3.

2. **Die Ops melden `true`/`false`, die reine Funktion urteilt.** Anders als `updateMaster` im Kalender wirft keine Op selbst: Das Klassifizieren braucht einen zweiten Aufruf (`fetchRow`), und eine Op, die eine andere ruft, ist keine mehr. Genau diese Verschränkung macht denselben Fix im Kalender teurer.

3. **Nur `update` und `delete` laufen über den Schnitt.** `useCreateTask` und `useToggleTaskDone` haben kein CAS und werden ohne Anlass nicht umgebaut; die Datei trägt dafür zwei Idiome.

4. **Das Löschen bekommt `baseVersion` und damit dasselbe CAS wie das Speichern** — plus `.select("id").maybeSingle()`, ohne das PostgREST null getroffene Zeilen als Erfolg meldet. Der 0-Zeilen-Guard und der Konflikt-Detektor sind dieselbe Zeile.

5. **Eine bereits verschwundene Zeile ist beim Löschen ein Erfolg, beim Speichern ein Fehler.** Beim Speichern geht Inhalt verloren; beim Löschen ist die Absicht erfüllt.

6. **Kein Parent-Guard in `useDeleteTask`.** `useCurrentParent` ist eine Query; ihr Wert wird beim Rendern in die Closure gefangen, und das DELETE läuft fünf Sekunden nach dem Unmount. Der Guard sähe den Stand von vorher und wäre blind für genau den Fall, für den er gebaut wäre. Der Abmelde-Fall ist über `flush()` in `useSignOut` bereits abgedeckt.

7. **`TaskEditScreen` schickt die eingefrorene `baseVersion`, nicht `task.updated_at` aus der lebenden Query** — dieselbe Invariante wie beim Speichern (ADR-031 Decision 6).

8. **Der Konflikt beim Löschen meldet sich als Toast-Aktion, nicht als Dialog** (`conflict.deleteAnyway`), ohne eigenes Undo-Fenster und ohne zweite Aktion am Retry. Wort für Wort die Regeln des Termin-Pfads.

### Konsequenzen

`features/tasks/mutations.ts` hat eine Testsuite; der Zwei-Client-Lauf ist nicht mehr der einzige Beleg für das Task-CAS. Der Adapter selbst wird mitgeprüft — ohne diese Fälle blieben alle Aufgaben-Tests grün, würde jemand `.eq("updated_at", …)` oder `.select("id")` entfernen.

Offen bleibt eine Mehrdeutigkeit: Eine RLS-Ablehnung **ohne** Abmeldung liefert dasselbe Bild wie „schon gelöscht" — null Zeilen, leere Nachlese — und nimmt denselben stillen Weg. Sie zu trennen bräuchte eine serverseitige Auskunft und damit eine Migration; als Eintrag in [docs/TODO.md](./TODO.md) bis Block 7 vertagt.
```

- [ ] **Step 2: `CLAUDE.md` nachziehen**

Zwei Stellen, beide exakt benannt.

**Erstens** in Zeile 71 (der große Tech-Stack-Absatz zu Supabase), im Conflict-Detection-Teil. Dieser Wortlaut steht dort heute:

> … der Kalender prüft die Version im Pre-Flight und sichert `updateMaster` per Compare-and-Swap ab, Aufgaben genau umgekehrt; weicht ein Feld ab, …

Für das Löschen stimmt das nicht mehr. Ersetzen durch:

> … der Kalender prüft die Version im Pre-Flight und sichert `updateMaster` per Compare-and-Swap ab, Aufgaben genau umgekehrt — dort gilt das seit [ADR-036](docs/decision-log.md) für **beide** Schreibwege: Speichern wie Löschen laufen über ein Compare-and-Swap mit Nachlese, hinter dem injizierbaren `TaskOps`-Schnitt in [features/tasks/mutations.ts](features/tasks/mutations.ts), und ein Löschkonflikt meldet sich als Toast mit „Trotzdem löschen"; weicht ein Feld ab, …

**Zweitens** die Ordnerübersicht, Zeilen 142–143. Heute:

```text
├─ tasks/                Queries · Mutations · Filter · Stats · Pending-Deletes
│                        · conflict.ts (Feldvergleich, ADR-031)
```

Danach:

```text
├─ tasks/                Queries · Mutations · Filter · Stats · Pending-Deletes
│                        · mutations.ts (TaskOps-Schnitt, reine updateTask/deleteTask, CAS
│                          auch beim Löschen, ADR-036)
│                        · conflict.ts (Feldvergleich, ADR-031)
```

- [ ] **Step 3: `docs/roadmap.md` nachziehen**

In Block 2 die Überschrift `### 2.1 features/tasks/mutations.ts umbauen — **M, ein PR für drei Einträge**` auf „— **erledigt**" ändern und am Ende des Abschnitts einen Absatz in der Form der erledigten Punkte aus Block 1 anhängen. Dieser Entwurf trägt die Substanz; beim Schreiben gegen den tatsächlichen Verlauf prüfen und abweichen, wo er abweicht:

```markdown
**Umgesetzt als [ADR-036](./decision-log.md).** `features/tasks/mutations.ts` hat jetzt
denselben injizierbaren Schnitt wie der Kalender — `TaskOps` mit `fetchRow`/`updateRow`/
`deleteRow`, darüber die reinen `updateTask`/`deleteTask` —, und das Löschen prüft die
gesehene Version per Compare-and-Swap statt gar nicht. Der 0-Zeilen-Guard und der
Konflikt-Detektor sind dabei dieselbe Zeile: Ohne `.select("id")` meldet PostgREST auch
dann Erfolg, wenn null Zeilen getroffen wurden. Ein Löschkonflikt zeigt seither denselben
Fehler-Toast mit „Trotzdem löschen" wie der Termin-Pfad. Die Reihenfolge des Blocks —
erst der Schnitt, dann die Fixes — hat sich bestätigt: Die beiden Korrekturen waren vom
ersten Testlauf an prüfbar. Eine Grenze blieb und steht als eigener Eintrag in
[TODO.md](./TODO.md): Eine **RLS-Ablehnung ohne Abmeldung** liefert dasselbe Bild wie
„schon gelöscht" — null Zeilen, leere Nachlese — und nimmt denselben stillen Weg. Sie zu
trennen bräuchte eine serverseitige Auskunft und damit eine Migration; vertagt bis
Block 7.
```

Die Block-Überschrift selbst bleibt **ohne** Haken: 2.2 steht noch aus.

- [ ] **Step 4: Gates und Commit**

```bash
bun format:check
```

```bash
git add docs/decision-log.md CLAUDE.md docs/roadmap.md
git commit -m "docs(tasks): ADR-036 zum Aufgaben-Schreibpfad, Roadmap 2.1 abschliessen"
```

---

## Definition of Done (dieser PR)

- `bun run typecheck` · `bun lint` · `bun test` · `bun format:check` grün.
- Die Aufgaben-Suite unter `TZ=Europe/Berlin`, `TZ=UTC` und `TZ=America/New_York` mit **identischem** Ergebnis.
- Task 2 hat sein Rot **vorgeführt** (Ausgabe im Report), Task 1 und Task 2 ihre Mutationsproben.
- `docs/TODO.md`: drei Einträge gelöscht, einer angelegt.
- Lokaler CodeRabbit-Durchlauf (`coderabbit review --base main`) vor dem Öffnen des PRs; jeder Befund behoben oder mit Begründung verworfen.
- Sichtprüfung am Simulator, zwei Durchgänge: eine Aufgabe löschen (Normalfall — Toast mit „Rückgängig", nach fünf Sekunden ist sie weg) und eine Aufgabe löschen, die ein zweiter Client im Undo-Fenster ändert (Fehler-Toast mit „Trotzdem löschen", der Tap räumt sie weg). Web genügt für diesen Pfad — `confirmDestructive` und die Toasts funktionieren dort, anders als beim Termin-Löschpfad.
