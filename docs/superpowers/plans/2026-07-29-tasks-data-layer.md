# Tasks-Daten-Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein lesender Daten-Layer für `tasks` unter `features/tasks/`, den Screens über `useFamilyTasks`, `useTasksByChild` und `useTasksStats` konsumieren können.

**Architecture:** Eine einzige Supabase-Query lädt alle offenen plus die zuletzt erledigten Tasks der Familie (Isolation macht RLS, kein Client-Filter). `useTasksByChild` und `useTasksStats` leiten per `useMemo` aus demselben Cache-Eintrag ab — ein Roundtrip, Liste und Stats können nicht auseinanderlaufen. Die Ableitungslogik liegt als reine Funktionen mit injiziertem `now` in `stats.ts` und ist ohne React und ohne Netz testbar.

**Tech Stack:** TypeScript (strict), `@supabase/supabase-js`, `@tanstack/react-query`, `date-fns@4.4.0`, `bun:test`.

**Spec:** [docs/superpowers/specs/2026-07-29-tasks-data-layer-design.md](../specs/2026-07-29-tasks-data-layer-design.md)

## Global Constraints

- Branch ist `feat/tasks-data-layer`. Alle Commits landen dort.
- **Kein `Co-Authored-By: Claude`-Trailer** in Commit-Messages. Conventional-Commits-Präfix, gescoped (`feat(tasks): …`).
- **Pre-commit-Hooks niemals mit `--no-verify` umgehen.**
- Kein Eingriff ins Handoff-Bundle: `design-system/{colors,typography,spacing,themes,components,index}.ts`, `docs/{HANDOFF,COPY,ICONS,README}.md`, `patterns/*.md` bleiben unangetastet.
- Kein UI, keine neuen i18n-Keys, keine Migration, kein Types-Regen. `AufgabenScreen` wird **nicht** angefasst.
- Keine Mutations (`useCreateTask`/`useToggleTaskDone`/`useDeleteTask`) — der Layer ist lesend.
- Kein `.eq("family_id", …)` im Client. Die Isolation macht RLS (`force row level security` + `family_id = current_family_id()`).
- `due_date` ist ein Postgres-`date` und wird als **lokaler** Kalendertag gelesen — immer `parseISO("YYYY-MM-DD")`, **nie** `new Date("YYYY-MM-DD")` (letzteres interpretiert als UTC-Mitternacht und verschiebt den Tag westlich von Greenwich um eins).
- Wochengrenzen immer mit `{ weekStartsOn: 1 }` (ISO, Montag).
- Kein `Date.now()` / `new Date()` in `stats.ts` — `now` ist Parameter.
- Tests laufen mit `bun test` (Buns Runner), Imports aus `bun:test`. Nicht `npx jest`.
- Pfad-Alias `@/*` → Repo-Root.

## File Structure

| Datei                          | Verantwortung                                            | Task  |
| ------------------------------ | -------------------------------------------------------- | ----- |
| `features/tasks/types.ts`      | DB-abgeleitete Typen + die drei Rückgabetypen des Layers | 1     |
| `features/tasks/stats.ts`      | reine Ableitungen aus einer Task-Liste                   | 1 + 2 |
| `features/tasks/stats.test.ts` | `bun:test`-Suite gegen `stats.ts`                        | 1 + 2 |
| `features/tasks/queries.ts`    | Query-Key-Factory, Fetcher, die drei Hooks               | 3     |
| `features/tasks/index.ts`      | Barrel                                                   | 3     |
| `docs/TODO.md`                 | Follow-ups für die bewusst ausgelassenen Stücke          | 3     |

---

### Task 1: Typen + Gruppierung nach Kind

**Files:**

- Create: `features/tasks/types.ts`
- Create: `features/tasks/stats.ts`
- Create: `features/tasks/stats.test.ts`

**Interfaces:**

- Consumes: `Database` aus `@/features/supabase/database.types` (die `tasks`- und `task_types`-Einträge sind dort bereits generiert).
- Produces:
  - `TaskRow`, `TaskInsert`, `TaskUpdate`, `TaskTypeRow` — Aliase auf `Database["public"]["Tables"][…]`
  - `TaskWithType = TaskRow & { task_types: TaskTypeRow | null }`
  - `interface TaskGroup { childId: string | null; tasks: TaskWithType[]; openCount: number }`
  - `interface TaskStats { dueToday: number; thisWeek: number; donePct: number; open: number; doneToday: number }`
  - `groupTasksByChild(tasks: TaskWithType[]): TaskGroup[]`
  - `makeTask(overrides?: Partial<TaskWithType>): TaskWithType` (Test-Fixture, bleibt in `stats.test.ts`)

- [ ] **Step 1: Typen anlegen**

Create `features/tasks/types.ts`:

```ts
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
```

- [ ] **Step 2: Failing test für die Gruppierung schreiben**

Create `features/tasks/stats.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import type { TaskWithType } from "./types";

import { groupTasksByChild } from "./stats";

/**
 * Only the columns the derivations read carry meaning; the rest is filler so
 * the fixture satisfies TaskWithType.
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

describe("groupTasksByChild", () => {
  test("groups by child_id, earliest due date first, no-child group last", () => {
    const groups = groupTasksByChild([
      makeTask({ id: "a", child_id: "child-1", due_date: "2026-07-30" }),
      makeTask({ id: "b", child_id: "child-2", due_date: "2026-07-29" }),
      makeTask({ id: "c", child_id: null, due_date: "2026-07-28" }),
    ]);

    expect(groups.map((g) => g.childId)).toEqual(["child-2", "child-1", null]);
  });

  test("sorts open tasks by due date before done tasks by completion, newest first", () => {
    const groups = groupTasksByChild([
      makeTask({
        id: "done-old",
        child_id: "child-1",
        due_date: "2026-07-20",
        is_done: true,
        completed_at: "2026-07-20T12:00:00.000Z",
      }),
      makeTask({ id: "open-late", child_id: "child-1", due_date: "2026-08-05" }),
      makeTask({
        id: "done-new",
        child_id: "child-1",
        due_date: "2026-07-22",
        is_done: true,
        completed_at: "2026-07-22T12:00:00.000Z",
      }),
      makeTask({ id: "open-early", child_id: "child-1", due_date: "2026-07-29" }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].tasks.map((t) => t.id)).toEqual([
      "open-early",
      "open-late",
      "done-new",
      "done-old",
    ]);
  });

  test("openCount counts only unfinished tasks", () => {
    const groups = groupTasksByChild([
      makeTask({ id: "a", child_id: "child-1" }),
      makeTask({ id: "b", child_id: "child-1" }),
      makeTask({
        id: "c",
        child_id: "child-1",
        is_done: true,
        completed_at: "2026-07-28T12:00:00.000Z",
      }),
    ]);

    expect(groups[0].openCount).toBe(2);
    expect(groups[0].tasks).toHaveLength(3);
  });

  test("returns an empty array for no tasks", () => {
    expect(groupTasksByChild([])).toEqual([]);
  });

  test("does not mutate the input array", () => {
    const tasks = [
      makeTask({ id: "a", due_date: "2026-08-05" }),
      makeTask({ id: "b", due_date: "2026-07-29" }),
    ];
    groupTasksByChild(tasks);
    expect(tasks.map((t) => t.id)).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 3: Test laufen lassen und Fehlschlag bestätigen**

Run: `bun test features/tasks/stats.test.ts`

Expected: FAIL — `Cannot find module './stats'` (die Datei existiert noch nicht).

- [ ] **Step 4: Minimale Implementierung schreiben**

Create `features/tasks/stats.ts`:

```ts
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
```

- [ ] **Step 5: Test laufen lassen und Erfolg bestätigen**

Run: `bun test features/tasks/stats.test.ts`

Expected: PASS — 5 Tests grün.

- [ ] **Step 6: Committen**

```bash
git add features/tasks/types.ts features/tasks/stats.ts features/tasks/stats.test.ts
git commit -m "feat(tasks): Typen und Gruppierung nach Kind"
```

---

### Task 2: Statistiken ableiten

**Files:**

- Modify: `features/tasks/stats.ts` (Funktion ergänzen)
- Modify: `features/tasks/stats.test.ts` (Suite ergänzen)

**Interfaces:**

- Consumes: `TaskWithType`, `TaskStats` aus `./types`; `makeTask` aus derselben Testdatei (in Task 1 angelegt).
- Produces: `computeTaskStats(tasks: TaskWithType[], now: Date): TaskStats`

**Referenzdaten für die Tests** — `now` ist Mittwoch, **2026-07-29**. Die ISO-Woche läuft von Montag **2026-07-27** bis Sonntag **2026-08-02**; Montag **2026-08-03** liegt außerhalb.

- [ ] **Step 1: Failing tests für die Statistiken schreiben**

Add to `features/tasks/stats.test.ts` — den Import auf `import { computeTaskStats, groupTasksByChild } from "./stats";` erweitern und folgenden Block ans Dateiende hängen:

```ts
/** Wednesday, 2026-07-29. ISO week: Mon 2026-07-27 … Sun 2026-08-02. */
const NOW = new Date(2026, 6, 29, 10, 0, 0);

function makeDone(id: string, completedAt: string): TaskWithType {
  return makeTask({ id, is_done: true, completed_at: completedAt, due_date: "2026-07-27" });
}

describe("computeTaskStats", () => {
  test("returns zeroes for no tasks", () => {
    expect(computeTaskStats([], NOW)).toEqual({
      dueToday: 0,
      thisWeek: 0,
      donePct: 0,
      open: 0,
      doneToday: 0,
    });
  });

  test("dueToday counts overdue tasks too, tomorrow does not count", () => {
    const stats = computeTaskStats(
      [
        makeTask({ id: "overdue", due_date: "2026-07-27" }),
        makeTask({ id: "today", due_date: "2026-07-29" }),
        makeTask({ id: "tomorrow", due_date: "2026-07-30" }),
      ],
      NOW,
    );

    expect(stats.dueToday).toBe(2);
    expect(stats.open).toBe(3);
  });

  test("thisWeek includes today and ends on Sunday", () => {
    const stats = computeTaskStats(
      [
        makeTask({ id: "today", due_date: "2026-07-29" }),
        makeTask({ id: "sunday", due_date: "2026-08-02" }),
        makeTask({ id: "next-monday", due_date: "2026-08-03" }),
      ],
      NOW,
    );

    expect(stats.thisWeek).toBe(2);
  });

  test("doneToday counts only tasks completed on the reference day", () => {
    const stats = computeTaskStats(
      [
        makeDone("today", "2026-07-29T12:00:00.000Z"),
        makeDone("yesterday", "2026-07-28T12:00:00.000Z"),
      ],
      NOW,
    );

    expect(stats.doneToday).toBe(1);
    expect(stats.open).toBe(0);
  });

  test("donePct is done over done-plus-open within the running week", () => {
    const stats = computeTaskStats(
      [
        makeDone("d1", "2026-07-28T12:00:00.000Z"),
        makeDone("d2", "2026-07-29T12:00:00.000Z"),
        makeDone("d3", "2026-07-29T13:00:00.000Z"),
        makeTask({ id: "open-this-week", due_date: "2026-07-30" }),
      ],
      NOW,
    );

    expect(stats.donePct).toBe(75);
  });

  test("tasks completed before the running week do not raise donePct", () => {
    const stats = computeTaskStats(
      [
        makeDone("last-week", "2026-07-24T12:00:00.000Z"),
        makeTask({ id: "open-this-week", due_date: "2026-07-30" }),
      ],
      NOW,
    );

    expect(stats.donePct).toBe(0);
  });

  test("donePct is 0 rather than NaN when nothing is due or done this week", () => {
    const stats = computeTaskStats([makeTask({ id: "far-off", due_date: "2026-09-01" })], NOW);

    expect(stats.donePct).toBe(0);
  });

  test("only the calendar day of `now` matters, not the time of day", () => {
    const tasks = [
      makeTask({ id: "today", due_date: "2026-07-29" }),
      makeTask({ id: "sunday", due_date: "2026-08-02" }),
      makeDone("done", "2026-07-29T12:00:00.000Z"),
    ];

    expect(computeTaskStats(tasks, new Date(2026, 6, 29, 0, 0, 0))).toEqual(
      computeTaskStats(tasks, new Date(2026, 6, 29, 23, 59, 59)),
    );
  });
});
```

- [ ] **Step 2: Tests laufen lassen und Fehlschlag bestätigen**

Run: `bun test features/tasks/stats.test.ts`

Expected: FAIL — `computeTaskStats is not a function` bzw. ein Import-Fehler. Die fünf Tests aus Task 1 bleiben grün.

- [ ] **Step 3: Implementierung schreiben**

Add to `features/tasks/stats.ts` — Import-Zeile oben ergänzen und die Funktion ans Dateiende hängen:

```ts
import { endOfDay, endOfWeek, isSameDay, parseISO, startOfWeek } from "date-fns";

import type { TaskGroup, TaskStats, TaskWithType } from "./types";
```

```ts
/**
 * All counters read `now` at day granularity only — the caller may pass any
 * time of day. `now` is a parameter so the tests stay deterministic.
 */
export function computeTaskStats(tasks: TaskWithType[], now: Date): TaskStats {
  const todayEnd = endOfDay(now);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

  let dueToday = 0;
  let thisWeek = 0;
  let open = 0;
  let doneToday = 0;
  let doneThisWeek = 0;

  for (const task of tasks) {
    if (task.is_done) {
      // The tasks_completed_consistency CHECK guarantees completed_at is set
      // whenever is_done — the guard is for rows read through a stale cache.
      if (!task.completed_at) continue;
      const completedAt = new Date(task.completed_at);
      if (isSameDay(completedAt, now)) doneToday += 1;
      if (completedAt >= weekStart && completedAt <= weekEnd) doneThisWeek += 1;
      continue;
    }

    open += 1;
    // `due_date` is a Postgres `date`: parseISO reads it as local midnight,
    // new Date() would read it as UTC midnight and shift the day.
    const dueAt = parseISO(task.due_date);
    // Overdue folds into "today" — patterns/homework.md derives urgency as
    // `today` if `due <= end of today`.
    if (dueAt <= todayEnd) dueToday += 1;
    if (dueAt <= weekEnd) thisWeek += 1;
  }

  const weekTotal = doneThisWeek + thisWeek;
  const donePct = weekTotal === 0 ? 0 : Math.round((doneThisWeek / weekTotal) * 100);

  return { dueToday, thisWeek, donePct, open, doneToday };
}
```

- [ ] **Step 4: Tests laufen lassen und Erfolg bestätigen**

Run: `bun test features/tasks/stats.test.ts`

Expected: PASS — 13 Tests grün (5 aus Task 1, 8 neue).

- [ ] **Step 5: Committen**

```bash
git add features/tasks/stats.ts features/tasks/stats.test.ts
git commit -m "feat(tasks): Statistiken aus der Task-Liste ableiten"
```

---

### Task 3: Query-Layer, Barrel und Follow-ups

**Files:**

- Create: `features/tasks/queries.ts`
- Create: `features/tasks/index.ts`
- Modify: `docs/TODO.md`

**Interfaces:**

- Consumes: `groupTasksByChild`, `computeTaskStats` aus `./stats`; `TaskGroup`, `TaskStats`, `TaskWithType` aus `./types`; `supabase` aus `@/features/supabase`.
- Produces (öffentliche Oberfläche des Layers):
  - `taskKeys.all` / `taskKeys.family(doneSince: string)`
  - `fetchFamilyTasks(doneSince: string): Promise<TaskWithType[]>`
  - `useFamilyTasks(): { data: TaskWithType[]; isLoading: boolean; error: unknown }`
  - `useTasksByChild(): TaskGroup[]`
  - `useTasksStats(): TaskStats`

- [ ] **Step 1: Query-Layer schreiben**

Create `features/tasks/queries.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { format, parseISO, subDays } from "date-fns";
import { useMemo } from "react";

import { supabase } from "@/features/supabase";

import type { TaskGroup, TaskStats, TaskWithType } from "./types";

import { computeTaskStats, groupTasksByChild } from "./stats";

const SELECT = "*, task_types(*)";

/**
 * How far back completed tasks stay in the window. Long enough to feed
 * "erledigt heute" and the running week's quota, short enough that the archive
 * never loads.
 */
const DONE_WINDOW_DAYS = 7;

export const taskKeys = {
  all: ["tasks"] as const,
  family: (doneSince: string) => ["tasks", "family", doneSince] as const,
};

/**
 * Every open task plus everything completed since `doneSince`.
 *
 * No `family_id` filter on purpose: `tasks` runs `force row level security`
 * with `family_id = current_family_id()` on all four commands, so the policy
 * is the single definition of "my family". A client-side filter would be a
 * second one, free to drift.
 */
export async function fetchFamilyTasks(doneSince: string): Promise<TaskWithType[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select(SELECT)
    .or(`is_done.eq.false,completed_at.gte.${doneSince}`)
    .order("due_date", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * Local midnight today. Recomputed each render but stable within a calendar
 * day, so the query key holds still — and rolls over if the app stays open
 * past midnight.
 */
function useToday(): Date {
  const dayKey = format(new Date(), "yyyy-MM-dd");
  return useMemo(() => parseISO(dayKey), [dayKey]);
}

interface UseFamilyTasksResult {
  data: TaskWithType[];
  isLoading: boolean;
  error: unknown;
}

export function useFamilyTasks(): UseFamilyTasksResult {
  const today = useToday();
  const doneSince = useMemo(() => subDays(today, DONE_WINDOW_DAYS).toISOString(), [today]);

  const query = useQuery({
    queryKey: taskKeys.family(doneSince),
    queryFn: () => fetchFamilyTasks(doneSince),
  });

  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}

export function useTasksByChild(): TaskGroup[] {
  const { data } = useFamilyTasks();
  return useMemo(() => groupTasksByChild(data), [data]);
}

export function useTasksStats(): TaskStats {
  const { data } = useFamilyTasks();
  const today = useToday();
  // computeTaskStats only reads the calendar day off `now`, so local midnight
  // is as good as the wall clock — and it keeps the memo from re-running.
  return useMemo(() => computeTaskStats(data, today), [data, today]);
}
```

- [ ] **Step 2: Barrel schreiben**

Create `features/tasks/index.ts`:

```ts
export {
  fetchFamilyTasks,
  taskKeys,
  useFamilyTasks,
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

Expected: PASS, keine Ausgabe. Schlägt es an `data` in `fetchFamilyTasks` fehl, stimmt die Join-Inferenz nicht mit `TaskWithType` überein — dann `TaskWithType` an die von Supabase inferierte Form angleichen, **nicht** casten.

- [ ] **Step 4: Lint und Tests laufen lassen**

Run: `bun lint && bun test`

Expected: beide PASS. Die 13 Tests aus Task 1+2 bleiben grün.

- [ ] **Step 5: Follow-ups in `docs/TODO.md` eintragen**

Neuen Abschnitt **vor** `## Weitere Out-of-Scope-Items` einfügen:

```markdown
## Aufgaben / Tasks (Daten-Layer V1)

- **`AufgabenScreen` hängt weiter an `sample-data`** ([app-sections/(tabs)/aufgaben/AufgabenScreen.tsx](<../app-sections/(tabs)/aufgaben/AufgabenScreen.tsx>)): Der Daten-Layer unter [features/tasks/](../features/tasks/) ist da und liefert mit `TaskStats` ein feldgleiches Gegenstück zu `homeworkStats`, der Screen rendert aber noch den Mock. Der Rewire braucht Loading-/Empty-/Error-States und einen Abgleich mit [patterns/homework.md](../patterns/homework.md) (Stat-Leiste, Kind-Header, Zeilen-Anatomie) — bewusst eigene Iteration, damit der Daten-Layer isoliert reviewbar bleibt.
- **Tasks-Layer ist lesend** ([features/tasks/queries.ts](../features/tasks/queries.ts)): Kein `useCreateTask`/`useToggleTaskDone`/`useUpdateTask`/`useDeleteTask`. Der Abhak-Flow ist der erste Bedarf; er muss `is_done`, `completed_at` und `completed_by` gemeinsam setzen, sonst schlägt der `tasks_completed_consistency`-CHECK zu ([20260529100841_pr3_review_fixes.sql](../supabase/migrations/20260529100841_pr3_review_fixes.sql)).
- **Erledigte Tasks sind nur 7 Tage weit sichtbar** ([features/tasks/queries.ts](../features/tasks/queries.ts) — `DONE_WINDOW_DAYS`): Das Fenster reicht für „Erledigt heute“ und die Wochenquote. Ein Verlauf/Archiv-Screen bräuchte eine eigene, paginierte Query — das ganze Archiv in die Live-Query zu ziehen würde bei jedem Screen-Öffnen mitwachsen.
```

- [ ] **Step 6: Formatierung prüfen**

Run: `bun format:check`

Expected: PASS. Schlägt es fehl: `bun format` laufen lassen und erneut prüfen.

- [ ] **Step 7: Committen**

```bash
git add features/tasks/queries.ts features/tasks/index.ts docs/TODO.md
git commit -m "feat(tasks): Query-Layer mit useFamilyTasks, useTasksByChild und useTasksStats"
```

---

### Task 4: Verifikation und Review

**Files:** keine Änderungen erwartet — dieser Task ist das Gate.

- [ ] **Step 1: Volle CI-Kette lokal fahren**

Run: `bun format:check && bun lint && bun run typecheck && bun test`

Expected: alle vier PASS. Die Ausgabe von `bun test` muss 13 bestandene Tests in `features/tasks/stats.test.ts` zeigen.

- [ ] **Step 2: Web-Smoke-Build**

Run: `bunx expo export --platform web --output-dir /tmp/eltern-web`

Expected: Bundle wird ohne Fehler geschrieben. Das ist der letzte Step in `ci.yml` und fängt Import-Zyklen und fehlende Module ab, die `typecheck` durchlässt.

- [ ] **Step 3: CodeRabbit-Review**

Run: `coderabbit review --base main --agent`

Erwartete Antwort: Findings durcharbeiten — jedes entweder beheben oder mit Begründung bewusst verwerfen. Behebungen bekommen eigene Commits (`fix(tasks): …`).

- [ ] **Step 4: Verifikation nach etwaigen Fixes wiederholen**

Nur nötig, wenn Step 3 zu Codeänderungen geführt hat.

Run: `bun format:check && bun lint && bun run typecheck && bun test`

Expected: alle PASS.

---

## Was dieser Plan bewusst **nicht** tut

- Keine Tests für `queries.ts`. Nach dem Auslagern der Logik nach `stats.ts` enthält die Datei nur noch Verdrahtung; ein Supabase-Mock würde vor allem den Mock testen.
- Kein RLS-Task. Der Check ist Teil der Spec und bereits read-only gegen das Remote-Projekt gefahren — Ergebnis: kein Finding. Nichts zu implementieren.
- Keine Änderung an `docs/architecture.md`. Der Layer folgt dem bestehenden Feature-Ordner-Muster und führt keine neue Konvention ein. (Der veraltete „What's not here yet"-Abschnitt dort steht bereits als eigener Eintrag in `docs/TODO.md`.)
