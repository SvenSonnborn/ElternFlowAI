# Aufgaben filtern und sortieren — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der AufgabenScreen bekommt eine Filterleiste über Status, Fälligkeit und Kind sowie eine stabile dreistufige Sortierung; überfällige Aufgaben werden erstmals als solche sichtbar.

**Architecture:** Gefiltert wird client-seitig im bereits geladenen React-Query-Cache — `useFamilyTasks()` holt ohnehin alle offenen Aufgaben plus sieben Tage Erledigtes in einen Eintrag. Der Filter ist eine reine Funktion (`features/tasks/filter.ts`), sein Zustand liegt in einem Zustand-Store ohne Persistenz (`features/tasks/filterStore.ts`), und ein Selektor-Hook verkettet beides mit der bestehenden Sektions-Ableitung. Die UI besteht aus einem neuen generischen Chip-Reihen-Primitive, dreimal instanziiert.

**Tech Stack:** Expo SDK 57 · React Native 0.86 · React 19.2 · TypeScript ~6.0 (strict) · NativeWind v4 · Zustand · TanStack Query · react-i18next · `bun test` (Buns Runner, `bun:test`-Importe) · date-fns

**Spec:** [docs/superpowers/specs/2026-08-12-task-filter-sort-design.md](../specs/2026-08-12-task-filter-sort-design.md)

**Branch:** `feat/task-filter-sort` (existiert bereits, enthält den Spec-Commit)

## Global Constraints

- **Handoff-Bundle ist tabu.** `design-system/{colors,typography,spacing,themes,components,index}.ts`, `docs/{HANDOFF,COPY,ICONS,README}.md` und `patterns/*.md` werden in diesem Plan **nicht** editiert. Fehlende Copy-Deck-Einträge und Pattern-Ergänzungen wandern nach `docs/TODO.md`.
- **Kein UI-String im Code.** Jeder sichtbare Text kommt aus `features/i18n/locales/de.json` / `en.json`. DE ist kanonisch, EN spiegelt.
- **Du-Form, nie Sie.** Markenstimme: warm, ruhig, modern. Niemals kindlich.
- **Touch-Targets ≥ 44×44.** Chips sind 36px hoch und erreichen 44 per `hitSlop={{ top: 4, bottom: 4 }}` — derselbe Kniff wie in `TypePicker`. `Button size="sm"` (h-9) ist verboten, `md` (h-11) ist der Default.
- **Commits:** Conventional-Commits-Präfix mit Scope, **niemals** ein `Co-Authored-By: Claude`-Trailer, **niemals** `--no-verify`.
- **`bun test`, nicht `npx jest`.** Testdateien importieren aus `bun:test`.
- **`parseISO`, nie `new Date("YYYY-MM-DD")`.** `tasks.due_date` ist ein Postgres-`date`; `new Date()` läse UTC-Mitternacht und verschöbe den Tag.
- **`app/` bleibt dünn.** Keine neuen Routen in diesem Plan.
- **Gate-Kommandos:** `bun run typecheck` · `bun lint` · `bun run test` · `bun format:check`.

---

### Task 1: Dreistufige Sortierung und zwei neue Sektionen

Der Comparator sortiert bislang nur nach `due_date`; bei gleichem Datum ist die Reihenfolge das, was Postgres zufällig liefert. Und `groupTasksByDue` klappt Überfälliges in „heute" hinein, wodurch es unsichtbar wird. Beides wird hier behoben — rein im Layer, ohne UI.

**Files:**

- Modify: `features/tasks/types.ts` (Interface `TaskSections`)
- Modify: `features/tasks/stats.ts` (`byDueDateAsc` → `byDueAsc`, `groupTasksByDue`)
- Test: `features/tasks/stats.test.ts`

**Interfaces:**

- Consumes: nichts aus früheren Tasks.
- Produces:
  - `interface TaskSections { overdue: TaskWithType[]; today: TaskWithType[]; upcoming: TaskWithType[]; doneToday: TaskWithType[]; doneRecent: TaskWithType[] }`
  - `groupTasksByDue(tasks: TaskWithType[], now: Date): TaskSections` — Signatur unverändert, Rückgabe um zwei Felder erweitert.

- [ ] **Step 1: Bestehende `groupTasksByDue`-Tests auf fünf Sektionen umschreiben**

In `features/tasks/stats.test.ts` im `describe("groupTasksByDue", …)`-Block **vier Stellen ersetzen** — drei ganze Tests und zwei Zeilen im vierten.

Ersetze

```ts
test("empty input yields three empty sections", () => {
  expect(groupTasksByDue([], NOW)).toEqual({ today: [], upcoming: [], doneToday: [] });
});

test("overdue tasks land in today, not upcoming", () => {
  const sections = groupTasksByDue([makeTask({ id: "overdue", due_date: "2026-07-27" })], NOW);

  expect(sections.today.map((t) => t.id)).toEqual(["overdue"]);
  expect(sections.upcoming).toHaveLength(0);
});
```

durch

```ts
test("empty input yields five empty sections", () => {
  expect(groupTasksByDue([], NOW)).toEqual({
    overdue: [],
    today: [],
    upcoming: [],
    doneToday: [],
    doneRecent: [],
  });
});

test("overdue tasks land in their own section, not in today", () => {
  const sections = groupTasksByDue(
    [
      makeTask({ id: "overdue", due_date: "2026-07-27" }),
      makeTask({ id: "today", due_date: "2026-07-29" }),
    ],
    NOW,
  );

  expect(sections.overdue.map((t) => t.id)).toEqual(["overdue"]);
  expect(sections.today.map((t) => t.id)).toEqual(["today"]);
  expect(sections.upcoming).toHaveLength(0);
});
```

Ersetze

```ts
test("done today lands in doneToday, done yesterday in no section", () => {
  const sections = groupTasksByDue(
    [makeDone("today", localNoon(29)), makeDone("yesterday", localNoon(28))],
    NOW,
  );

  expect(sections.doneToday.map((t) => t.id)).toEqual(["today"]);
  expect(sections.today).toHaveLength(0);
  expect(sections.upcoming).toHaveLength(0);
});
```

durch

```ts
test("done today lands in doneToday, everything older in doneRecent, newest first", () => {
  const sections = groupTasksByDue(
    [
      makeDone("today", localNoon(29)),
      makeDone("two-days-ago", localNoon(27)),
      makeDone("yesterday", localNoon(28)),
    ],
    NOW,
  );

  expect(sections.doneToday.map((t) => t.id)).toEqual(["today"]);
  expect(sections.doneRecent.map((t) => t.id)).toEqual(["yesterday", "two-days-ago"]);
  expect(sections.today).toHaveLength(0);
  expect(sections.upcoming).toHaveLength(0);
});
```

Ersetze

```ts
test("today and upcoming sort by due date ascending", () => {
  const sections = groupTasksByDue(
    [
      makeTask({ id: "late", due_date: "2026-08-20" }),
      makeTask({ id: "overdue", due_date: "2026-07-20" }),
      makeTask({ id: "soon", due_date: "2026-08-01" }),
      makeTask({ id: "today", due_date: "2026-07-29" }),
    ],
    NOW,
  );

  expect(sections.today.map((t) => t.id)).toEqual(["overdue", "today"]);
  expect(sections.upcoming.map((t) => t.id)).toEqual(["soon", "late"]);
});
```

durch

```ts
test("every section sorts by due date ascending", () => {
  const sections = groupTasksByDue(
    [
      makeTask({ id: "late", due_date: "2026-08-20" }),
      makeTask({ id: "long-overdue", due_date: "2026-07-20" }),
      makeTask({ id: "soon", due_date: "2026-08-01" }),
      makeTask({ id: "today", due_date: "2026-07-29" }),
      makeTask({ id: "overdue", due_date: "2026-07-28" }),
    ],
    NOW,
  );

  expect(sections.overdue.map((t) => t.id)).toEqual(["long-overdue", "overdue"]);
  expect(sections.today.map((t) => t.id)).toEqual(["today"]);
  expect(sections.upcoming.map((t) => t.id)).toEqual(["soon", "late"]);
});
```

Ersetze

```ts
const sections = groupTasksByDue(tasks, NOW);
const placed = [...sections.today, ...sections.upcoming].map((t) => t.id).sort();
```

durch

```ts
const sections = groupTasksByDue(tasks, NOW);
const placed = [...sections.overdue, ...sections.today, ...sections.upcoming]
  .map((t) => t.id)
  .sort();
```

- [ ] **Step 2: Die neuen Sortier-Tests schreiben**

Ans Ende des `describe("groupTasksByDue", …)`-Blocks anhängen:

```ts
test("same due date sorts by due_time, tasks without a time last", () => {
  const sections = groupTasksByDue(
    [
      makeTask({ id: "no-time", due_date: "2026-07-29", due_time: null, title: "Aaa" }),
      makeTask({ id: "late", due_date: "2026-07-29", due_time: "16:00:00", title: "Bbb" }),
      makeTask({ id: "early", due_date: "2026-07-29", due_time: "07:30:00", title: "Ccc" }),
    ],
    NOW,
  );

  expect(sections.today.map((t) => t.id)).toEqual(["early", "late", "no-time"]);
});

test("same due date and no time sorts by title", () => {
  const sections = groupTasksByDue(
    [
      makeTask({ id: "z", due_date: "2026-07-29", title: "Zimmer aufräumen" }),
      makeTask({ id: "a", due_date: "2026-07-29", title: "Anziehsachen rauslegen" }),
    ],
    NOW,
  );

  expect(sections.today.map((t) => t.id)).toEqual(["a", "z"]);
});
```

Und ans Ende des `describe("groupTasksByChild", …)`-Blocks (damit belegt ist, dass beide Ableitungen denselben Comparator erben):

```ts
test("inherits the due_time tiebreaker", () => {
  const groups = groupTasksByChild([
    makeTask({ id: "no-time", child_id: "child-1", due_date: "2026-07-29", due_time: null }),
    makeTask({ id: "timed", child_id: "child-1", due_date: "2026-07-29", due_time: "09:00:00" }),
  ]);

  expect(groups[0].tasks.map((t) => t.id)).toEqual(["timed", "no-time"]);
});
```

- [ ] **Step 3: Tests laufen lassen und Fehlschlag bestätigen**

Run: `bun test features/tasks/stats.test.ts`
Expected: FAIL — u. a. `expect(received).toEqual(expected)` mit `overdue`/`doneRecent` als `undefined` und falscher Reihenfolge bei den `due_time`-Tests.

- [ ] **Step 4: `TaskSections` um zwei Felder erweitern**

In `features/tasks/types.ts` das Interface ersetzen:

```ts
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
```

- [ ] **Step 5: Comparator und Gruppierung implementieren**

In `features/tasks/stats.ts` — Importzeile um `startOfDay` erweitern:

```ts
import { endOfDay, endOfWeek, isSameDay, parseISO, startOfDay, startOfWeek } from "date-fns";
```

`byDueDateAsc` ersetzen durch:

```ts
/**
 * `due_date` ist ein `YYYY-MM-DD`-String und `due_time` ein `HH:MM:SS` — für
 * beide ist die lexikalische Ordnung die chronologische, es wird also nichts
 * geparst.
 *
 * Eine Aufgabe ohne Uhrzeit ist der vageste Termin ihres Tages und sortiert
 * hinter die terminierten; der Titel bricht den Rest der Gleichstände, damit
 * die Reihenfolge stabil ist statt „was Postgres gerade lieferte".
 */
function byDueAsc(a: TaskWithType, b: TaskWithType): number {
  const byDate = a.due_date.localeCompare(b.due_date);
  if (byDate !== 0) return byDate;

  if (a.due_time !== b.due_time) {
    if (a.due_time === null) return 1;
    if (b.due_time === null) return -1;
    return a.due_time.localeCompare(b.due_time);
  }

  return a.title.localeCompare(b.title);
}
```

Beide Aufrufstellen in `groupTasksByChild` (`[...tasks].sort(byDueDateAsc)` und `bucket.filter((t) => !t.is_done).sort(byDueDateAsc)`) auf `byDueAsc` umstellen.

`groupTasksByDue` samt Doc-Comment ersetzen durch:

```ts
/**
 * Die Sektionen des Aufgaben-Screens.
 *
 * `upcoming` nimmt bewusst *alles* Offene nach heute auf, nicht nur die
 * laufende Woche: eine „diese Woche"-Sektion ließe langfristige Aufgaben aus
 * jeder Liste fallen. Die Wochenzahl steht stattdessen in der Stat-Leiste.
 * Zusammen mit `overdue` und `today` sitzt damit jede offene Aufgabe in genau
 * einer Sektion.
 *
 * Überfälliges bekommt seit der Filter-Iteration eine eigene Sektion, statt in
 * `today` zu verschwinden — eine drei Tage überfällige Aufgabe sah sonst aus
 * wie eine, die heute Abend fällig ist. Die Kachel „Heute fällig" zählt
 * weiterhin beides zusammen (siehe `computeTaskStats`).
 */
export function groupTasksByDue(tasks: TaskWithType[], now: Date): TaskSections {
  const dayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  const overdue: TaskWithType[] = [];
  const today: TaskWithType[] = [];
  const upcoming: TaskWithType[] = [];
  const doneToday: TaskWithType[] = [];
  const doneRecent: TaskWithType[] = [];

  for (const task of tasks) {
    if (task.is_done) {
      // Der tasks_completed_consistency-CHECK garantiert completed_at, sobald
      // is_done — die Prüfung fängt Zeilen aus einem veralteten Cache ab.
      if (!task.completed_at) continue;
      if (isSameDay(new Date(task.completed_at), now)) doneToday.push(task);
      else doneRecent.push(task);
      continue;
    }

    const dueAt = parseISO(task.due_date);
    if (dueAt < dayStart) overdue.push(task);
    else if (dueAt <= todayEnd) today.push(task);
    else upcoming.push(task);
  }

  return {
    overdue: overdue.sort(byDueAsc),
    today: today.sort(byDueAsc),
    upcoming: upcoming.sort(byDueAsc),
    doneToday: doneToday.sort(byCompletedAtDesc),
    doneRecent: doneRecent.sort(byCompletedAtDesc),
  };
}
```

- [ ] **Step 6: Tests laufen lassen und Erfolg bestätigen**

Run: `bun test features/tasks/stats.test.ts`
Expected: PASS, alle Tests grün.

- [ ] **Step 7: Typecheck und Lint**

Run: `bun run typecheck && bun lint`
Expected: beide ohne Fehler. `AufgabenScreen` konsumiert `TaskSections` nur lesend über drei Felder — zwei zusätzliche Felder brechen den Screen nicht.

- [ ] **Step 8: Commit**

```bash
git add features/tasks/types.ts features/tasks/stats.ts features/tasks/stats.test.ts
git commit -m "feat(tasks): Ueberfaellig- und DoneRecent-Sektion plus stabile Sortierung"
```

---

### Task 2: Überfällige Aufgaben im Screen sichtbar machen

Task 1 hat den `overdue`-Eimer erzeugt, aber niemand rendert ihn — überfällige Aufgaben sind gerade komplett unsichtbar. Diese Task schließt die Lücke sofort und stellt dabei `TaskRow` von `urgent: boolean` auf ein dreiwertiges `urgency` um, weil eine überfällige Zeile sonst die Pille „Heute fällig" trüge.

`doneRecent` bleibt hier bewusst ungerendert — es erscheint erst mit dem Status-Filter in Task 6.

**Files:**

- Modify: `features/i18n/locales/de.json`, `features/i18n/locales/en.json`
- Modify: `app-sections/(tabs)/aufgaben/TaskRow.tsx`
- Modify: `app-sections/(tabs)/aufgaben/AufgabenScreen.tsx` (nur das `groups`-Array und der `TaskRow`-Aufruf)

**Interfaces:**

- Consumes: `TaskSections.overdue` aus Task 1.
- Produces:
  - `export type TaskUrgency = "none" | "today" | "overdue"` aus `TaskRow.tsx`
  - `TaskRowProps` trägt jetzt `urgency: TaskUrgency` statt `urgent: boolean`
  - i18n-Key `hw.overdue`

- [ ] **Step 1: Den `hw.overdue`-Key in beide Kataloge legen**

In `features/i18n/locales/de.json` innerhalb des `hw`-Blocks direkt **nach** der `"longTerm"`-Zeile einfügen:

```json
    "overdue": "Überfällig",
```

In `features/i18n/locales/en.json` an derselben Stelle:

```json
    "overdue": "Overdue",
```

Kein neuer Key sonst — `hw.dueToday` existiert bereits und bleibt für die Heute-Pille.

- [ ] **Step 2: `TaskRow` auf `urgency` umstellen**

In `app-sections/(tabs)/aufgaben/TaskRow.tsx` das Props-Interface ersetzen:

```tsx
/** Steuert Card-Tönung und Dringlichkeits-Pille der Zeile. */
export type TaskUrgency = "none" | "today" | "overdue";

interface TaskRowProps {
  task: TaskWithType;
  /** Fehlt bei Eltern-Besorgungen, die an keinem Kind hängen. */
  child?: ChildRow;
  urgency: TaskUrgency;
}

export function TaskRow({ task, child, urgency }: TaskRowProps) {
```

Direkt vor dem `return` ergänzen:

```tsx
const isUrgent = urgency !== "none";
```

Die `Card`-Zeile ersetzen:

```tsx
    <Card
      variant={isUrgent ? "tinted" : "base"}
      tint="warning"
      className="flex-row items-center gap-2.5"
    >
```

Den Pillen-Block ersetzen — `task.subject || urgent` wird zu `task.subject || isUrgent`, und die Pille verzweigt:

```tsx
{
  task.subject || isUrgent ? (
    <View className="mb-1 flex-row items-center gap-1.5">
      {task.subject ? (
        <View className="rounded-pill px-2 py-0.5" style={{ backgroundColor: `${badgeColor}22` }}>
          <Text variant="pill" style={{ color: badgeColor }}>
            {task.subject}
          </Text>
        </View>
      ) : null}
      {/* Beide dringenden Zustände tönen die Card `warning` — `Card`s
                TintTone kennt kein `danger`, und design-system/ui folgt darin
                dem Handoff-Bundle. Die Unterscheidung trägt die Pille. */}
      {urgency === "overdue" ? <Pill label={t("hw.overdue")} tone="danger" /> : null}
      {urgency === "today" ? <Pill label={t("hw.dueToday")} tone="warn" /> : null}
    </View>
  ) : null;
}
```

- [ ] **Step 3: Screen auf die neue Prop und die neue Sektion umstellen**

In `app-sections/(tabs)/aufgaben/AufgabenScreen.tsx` das `groups`-Array ersetzen:

```tsx
const groups = [
  {
    key: "overdue",
    label: t("hw.overdue"),
    items: sections.overdue,
    urgency: "overdue" as const,
  },
  { key: "today", label: t("hw.dueToday"), items: sections.today, urgency: "today" as const },
  { key: "upcoming", label: t("hw.upcoming"), items: sections.upcoming, urgency: "none" as const },
  {
    key: "doneToday",
    label: t("hw.doneToday"),
    items: sections.doneToday,
    urgency: "none" as const,
  },
].filter((group) => group.items.length > 0);
```

Und im Render den `TaskRow`-Aufruf:

```tsx
<TaskRow
  key={task.id}
  task={task}
  child={task.child_id ? childById.get(task.child_id) : undefined}
  urgency={group.urgency}
/>
```

- [ ] **Step 4: Typecheck, Lint, Tests**

Run: `bun run typecheck && bun lint && bun run test`
Expected: alle drei ohne Fehler. `TaskRow` hat keinen Unit-Test — das Repo rendert keine RN-Komponenten in `bun test`; die Absicherung sind Typecheck, Lint und der Web-Smoke-Build in Task 7.

- [ ] **Step 5: Commit**

```bash
git add features/i18n/locales/de.json features/i18n/locales/en.json \
  "app-sections/(tabs)/aufgaben/TaskRow.tsx" "app-sections/(tabs)/aufgaben/AufgabenScreen.tsx"
git commit -m "feat(tasks): Ueberfaellige Aufgaben als eigene Sektion mit eigener Pille"
```

---

### Task 3: Filter-Prädikate

Die reine Logik, ohne React und ohne Store. Drei Dimensionen, UND-verknüpft, jede mit einem Default, der alles durchlässt.

**Files:**

- Create: `features/tasks/filter.ts`
- Test: `features/tasks/filter.test.ts`

**Interfaces:**

- Consumes: `TaskWithType` aus `features/tasks/types.ts`.
- Produces:
  - `type StatusFilter = "all" | "open" | "done"`
  - `type DueFilter = "all" | "overdue" | "today" | "week" | "longTerm"`
  - `const CHILD_ALL = "all"` · `const CHILD_NONE = "none"`
  - `interface TaskFilter { status: StatusFilter; due: DueFilter; childId: string }`
  - `const DEFAULT_TASK_FILTER: TaskFilter`
  - `filterTasks(rows: TaskWithType[], f: TaskFilter, now: Date): TaskWithType[]`
  - `isFiltered(f: TaskFilter): boolean`

- [ ] **Step 1: Den Test schreiben**

Neue Datei `features/tasks/filter.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import type { DueFilter, TaskFilter } from "./filter";
import type { TaskWithType } from "./types";

import { CHILD_ALL, CHILD_NONE, DEFAULT_TASK_FILTER, filterTasks, isFiltered } from "./filter";

/**
 * Eigene Fixture statt eines geteilten Helpers — stats.test.ts und form.test.ts
 * halten es genauso, und die Tests sollen für sich lesbar bleiben.
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

/** Mittwoch, 2026-07-29. ISO-Woche: Mo 2026-07-27 … So 2026-08-02. */
const NOW = new Date(2026, 6, 29, 10, 0, 0);

/** Ein offener Task je Fälligkeits-Fenster. */
const SPREAD: TaskWithType[] = [
  makeTask({ id: "overdue", due_date: "2026-07-27" }),
  makeTask({ id: "today", due_date: "2026-07-29" }),
  makeTask({ id: "friday", due_date: "2026-07-31" }),
  makeTask({ id: "sunday", due_date: "2026-08-02" }),
  makeTask({ id: "next-week", due_date: "2026-08-03" }),
];

function ids(rows: TaskWithType[]): string[] {
  return rows.map((row) => row.id);
}

function withDue(due: DueFilter): TaskFilter {
  return { ...DEFAULT_TASK_FILTER, due };
}

describe("filterTasks · Default", () => {
  test("der Default lässt alles durch", () => {
    expect(ids(filterTasks(SPREAD, DEFAULT_TASK_FILTER, NOW))).toEqual(ids(SPREAD));
  });

  test("gibt bei leerer Eingabe ein leeres Array zurück", () => {
    expect(filterTasks([], DEFAULT_TASK_FILTER, NOW)).toEqual([]);
  });

  test("mutiert die Eingabe nicht", () => {
    const rows = [...SPREAD];
    filterTasks(rows, { ...DEFAULT_TASK_FILTER, due: "today" }, NOW);
    expect(ids(rows)).toEqual(ids(SPREAD));
  });
});

describe("filterTasks · Status", () => {
  const rows = [
    makeTask({ id: "open" }),
    makeTask({ id: "done", is_done: true, completed_at: "2026-07-29T09:00:00.000Z" }),
  ];

  test("'open' behält nur unerledigte", () => {
    expect(ids(filterTasks(rows, { ...DEFAULT_TASK_FILTER, status: "open" }, NOW))).toEqual([
      "open",
    ]);
  });

  test("'done' behält nur erledigte", () => {
    expect(ids(filterTasks(rows, { ...DEFAULT_TASK_FILTER, status: "done" }, NOW))).toEqual([
      "done",
    ]);
  });
});

describe("filterTasks · Kind", () => {
  const rows = [
    makeTask({ id: "ben", child_id: "child-1" }),
    makeTask({ id: "mia", child_id: "child-2" }),
    makeTask({ id: "errand", child_id: null }),
  ];

  test("CHILD_ALL behält alles", () => {
    expect(ids(filterTasks(rows, { ...DEFAULT_TASK_FILTER, childId: CHILD_ALL }, NOW))).toEqual([
      "ben",
      "mia",
      "errand",
    ]);
  });

  test("eine child_id behält nur die Aufgaben dieses Kindes", () => {
    expect(ids(filterTasks(rows, { ...DEFAULT_TASK_FILTER, childId: "child-2" }, NOW))).toEqual([
      "mia",
    ]);
  });

  test("CHILD_NONE behält nur Aufgaben ohne Kind", () => {
    expect(ids(filterTasks(rows, { ...DEFAULT_TASK_FILTER, childId: CHILD_NONE }, NOW))).toEqual([
      "errand",
    ]);
  });
});

describe("filterTasks · Fälligkeit", () => {
  test("'overdue' nimmt nur, was vor heute fällig war", () => {
    expect(ids(filterTasks(SPREAD, withDue("overdue"), NOW))).toEqual(["overdue"]);
  });

  test("'today' schließt Überfälliges ein, morgen aber nicht", () => {
    expect(ids(filterTasks(SPREAD, withDue("today"), NOW))).toEqual(["overdue", "today"]);
  });

  test("'week' reicht bis einschließlich Sonntag", () => {
    expect(ids(filterTasks(SPREAD, withDue("week"), NOW))).toEqual([
      "overdue",
      "today",
      "friday",
      "sunday",
    ]);
  });

  test("'longTerm' ist genau das Komplement zu 'week'", () => {
    expect(ids(filterTasks(SPREAD, withDue("longTerm"), NOW))).toEqual(["next-week"]);
  });

  test("die Fenster sind ineinander geschachtelt: overdue ⊆ today ⊆ week", () => {
    const overdue = new Set(ids(filterTasks(SPREAD, withDue("overdue"), NOW)));
    const today = new Set(ids(filterTasks(SPREAD, withDue("today"), NOW)));
    const week = ids(filterTasks(SPREAD, withDue("week"), NOW));

    expect([...overdue].every((id) => today.has(id))).toBe(true);
    expect([...today].every((id) => week.includes(id))).toBe(true);
  });

  test("'week' und 'longTerm' zusammen ergeben wieder alles", () => {
    const union = [
      ...ids(filterTasks(SPREAD, withDue("week"), NOW)),
      ...ids(filterTasks(SPREAD, withDue("longTerm"), NOW)),
    ].sort();

    expect(union).toEqual([...ids(SPREAD)].sort());
  });

  test("das Fälligkeits-Fenster liest nur due_date, nicht is_done", () => {
    const rows = [
      makeTask({
        id: "done-but-overdue",
        due_date: "2026-07-27",
        is_done: true,
        completed_at: "2026-07-28T09:00:00.000Z",
      }),
    ];

    expect(ids(filterTasks(rows, withDue("overdue"), NOW))).toEqual(["done-but-overdue"]);
  });

  test("nur der Kalendertag von `now` zählt, nicht die Uhrzeit", () => {
    const early = filterTasks(SPREAD, withDue("today"), new Date(2026, 6, 29, 0, 0, 0));
    const late = filterTasks(SPREAD, withDue("today"), new Date(2026, 6, 29, 23, 59, 59));

    expect(ids(early)).toEqual(ids(late));
  });
});

describe("filterTasks · Kombination", () => {
  test("die drei Dimensionen sind UND-verknüpft", () => {
    const rows = [
      makeTask({ id: "hit", child_id: "child-1", due_date: "2026-07-29" }),
      makeTask({ id: "wrong-child", child_id: "child-2", due_date: "2026-07-29" }),
      makeTask({ id: "wrong-due", child_id: "child-1", due_date: "2026-08-20" }),
      makeTask({
        id: "wrong-status",
        child_id: "child-1",
        due_date: "2026-07-29",
        is_done: true,
        completed_at: "2026-07-29T09:00:00.000Z",
      }),
    ];

    const result = filterTasks(rows, { status: "open", due: "today", childId: "child-1" }, NOW);

    expect(ids(result)).toEqual(["hit"]);
  });
});

describe("isFiltered", () => {
  test("der Default gilt als ungefiltert", () => {
    expect(isFiltered(DEFAULT_TASK_FILTER)).toBe(false);
  });

  test("jede einzelne Abweichung gilt als gefiltert", () => {
    expect(isFiltered({ ...DEFAULT_TASK_FILTER, status: "open" })).toBe(true);
    expect(isFiltered({ ...DEFAULT_TASK_FILTER, due: "overdue" })).toBe(true);
    expect(isFiltered({ ...DEFAULT_TASK_FILTER, childId: CHILD_NONE })).toBe(true);
    expect(isFiltered({ ...DEFAULT_TASK_FILTER, childId: "child-1" })).toBe(true);
  });
});
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `bun test features/tasks/filter.test.ts`
Expected: FAIL mit `Cannot find module './filter'`.

- [ ] **Step 3: `filter.ts` implementieren**

Neue Datei `features/tasks/filter.ts`:

```ts
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
```

- [ ] **Step 4: Test laufen lassen und Erfolg bestätigen**

Run: `bun test features/tasks/filter.test.ts`
Expected: PASS, alle Tests grün.

- [ ] **Step 5: Typecheck und Lint**

Run: `bun run typecheck && bun lint`
Expected: keine Fehler.

- [ ] **Step 6: Commit**

```bash
git add features/tasks/filter.ts features/tasks/filter.test.ts
git commit -m "feat(tasks): Filter-Praedikate fuer Status, Faelligkeit und Kind"
```

---

### Task 4: Filter-Store und Selektor-Hook

Der Zustand des Filters plus die Verkettung mit der bestehenden Query. Nach diesem Task ist der Layer komplett; es fehlt nur noch die UI.

**Files:**

- Create: `features/tasks/filterStore.ts`
- Test: `features/tasks/filterStore.test.ts`
- Modify: `features/tasks/queries.ts`
- Modify: `features/tasks/index.ts`

**Interfaces:**

- Consumes: `DEFAULT_TASK_FILTER`, `TaskFilter`, `StatusFilter`, `DueFilter`, `filterTasks` aus Task 3; `groupTasksByDue` und `TaskSections` aus Task 1.
- Produces:
  - `useTaskFilterStore` — Zustand-Store mit `status`, `due`, `childId`, `setStatus(s)`, `setDue(d)`, `setChild(id)`, `reset()`
  - `useTaskFilter(): TaskFilter` — stabiler Snapshot der drei Dimensionen
  - `useFilteredTaskSections(): TaskSections` (in `queries.ts`)
  - Alle drei plus die Task-3-Exporte über den Barrel `@/features/tasks`

- [ ] **Step 1: Den Store-Test schreiben**

Neue Datei `features/tasks/filterStore.test.ts`:

```ts
import { beforeEach, describe, expect, test } from "bun:test";

import { CHILD_ALL, DEFAULT_TASK_FILTER } from "./filter";
import { useTaskFilterStore } from "./filterStore";

/** Der Store ist ein Modul-Singleton — ohne Reset färben Tests aufeinander ab. */
beforeEach(() => {
  useTaskFilterStore.getState().reset();
});

function snapshot() {
  const { status, due, childId } = useTaskFilterStore.getState();
  return { status, due, childId };
}

describe("useTaskFilterStore", () => {
  test("startet auf dem Default-Filter", () => {
    expect(snapshot()).toEqual(DEFAULT_TASK_FILTER);
  });

  test("jeder Setter fasst nur seine eigene Dimension an", () => {
    useTaskFilterStore.getState().setStatus("done");
    useTaskFilterStore.getState().setDue("longTerm");

    expect(snapshot()).toEqual({ status: "done", due: "longTerm", childId: CHILD_ALL });
  });

  test("setChild nimmt sowohl eine child_id als auch die Sentinels", () => {
    useTaskFilterStore.getState().setChild("child-1");
    expect(snapshot().childId).toBe("child-1");

    useTaskFilterStore.getState().setChild("none");
    expect(snapshot().childId).toBe("none");
  });

  test("reset setzt jede Dimension zurück", () => {
    useTaskFilterStore.getState().setStatus("open");
    useTaskFilterStore.getState().setDue("overdue");
    useTaskFilterStore.getState().setChild("child-1");

    useTaskFilterStore.getState().reset();

    expect(snapshot()).toEqual(DEFAULT_TASK_FILTER);
  });
});
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `bun test features/tasks/filterStore.test.ts`
Expected: FAIL mit `Cannot find module './filterStore'`.

- [ ] **Step 3: Den Store implementieren**

Neue Datei `features/tasks/filterStore.ts`:

```ts
import { useMemo } from "react";
import { create } from "zustand";

import type { DueFilter, StatusFilter, TaskFilter } from "./filter";

import { DEFAULT_TASK_FILTER } from "./filter";

interface TaskFilterState extends TaskFilter {
  setStatus: (status: StatusFilter) => void;
  setDue: (due: DueFilter) => void;
  /** Eine `child_id`, `CHILD_ALL` oder `CHILD_NONE`. */
  setChild: (childId: string) => void;
  reset: () => void;
}

/**
 * Der aktive Filter des Aufgaben-Screens. Bewusst ohne `persist`-Middleware:
 * der Filter soll den Tab-Wechsel überleben, aber nicht den App-Neustart — ein
 * vor einer Woche gesetzter Kind-Filter würde sonst eine unvollständige Liste
 * zeigen, ohne dass erkennbar wäre, warum. Gleiches Muster wie `themeStore`.
 */
export const useTaskFilterStore = create<TaskFilterState>((set) => ({
  ...DEFAULT_TASK_FILTER,
  setStatus: (status) => set({ status }),
  setDue: (due) => set({ due }),
  setChild: (childId) => set({ childId }),
  reset: () => set({ ...DEFAULT_TASK_FILTER }),
}));

/**
 * Die drei Dimensionen als ein Objekt.
 *
 * Drei Einzel-Selektoren statt eines Objekt-Selektors: `useSyncExternalStore`
 * verlangt einen referenzstabilen Snapshot, und `(s) => ({ status, due, childId })`
 * gäbe bei jedem Render ein neues Objekt zurück — das endet in einer
 * Render-Schleife statt in einem Filter.
 */
export function useTaskFilter(): TaskFilter {
  const status = useTaskFilterStore((s) => s.status);
  const due = useTaskFilterStore((s) => s.due);
  const childId = useTaskFilterStore((s) => s.childId);

  return useMemo(() => ({ status, due, childId }), [status, due, childId]);
}
```

- [ ] **Step 4: Test laufen lassen und Erfolg bestätigen**

Run: `bun test features/tasks/filterStore.test.ts`
Expected: PASS, vier Tests grün.

- [ ] **Step 5: Den Selektor-Hook in `queries.ts` ergänzen**

In `features/tasks/queries.ts` die Importe erweitern:

```ts
import { filterTasks } from "./filter";
import { useTaskFilter } from "./filterStore";
```

(Die bestehenden Importe aus `./stats` und `./types` bleiben; `groupTasksByDue` ist bereits importiert.)

Direkt **nach** `useTasksSections` einfügen:

```ts
/**
 * Die Sektionen für den Screen: dieselbe Ableitung wie `useTasksSections`, aber
 * durch den aktiven Filter hindurch.
 *
 * Gefiltert wird im Cache, nicht in der Query — `useFamilyTasks` lädt ohnehin
 * alles, und ein Filter im Query-Key würde pro Chip-Tap einen Roundtrip kosten
 * und jede Mutation zwingen, statt eines Eintrags alle Varianten zu patchen.
 */
export function useFilteredTaskSections(): TaskSections {
  const { data } = useFamilyTasks();
  const today = useToday();
  const filter = useTaskFilter();

  return useMemo(
    () => groupTasksByDue(filterTasks(data, filter, today), today),
    [data, filter, today],
  );
}
```

- [ ] **Step 6: Den Barrel erweitern**

In `features/tasks/index.ts` — nach dem `./errors`-Export einfügen:

```ts
export {
  CHILD_ALL,
  CHILD_NONE,
  DEFAULT_TASK_FILTER,
  filterTasks,
  isFiltered,
  type DueFilter,
  type StatusFilter,
  type TaskFilter,
} from "./filter";
export { useTaskFilter, useTaskFilterStore } from "./filterStore";
```

Und den `./queries`-Export-Block um den neuen Hook ergänzen (alphabetisch vor `useTask`):

```ts
export {
  fetchFamilyTasks,
  fetchTaskTypes,
  taskKeys,
  useFamilyTasks,
  useFilteredTaskSections,
  useTask,
  useTaskTypes,
  useTasksByChild,
  useTasksSections,
  useTasksStats,
} from "./queries";
```

- [ ] **Step 7: Volle Prüfung**

Run: `bun run typecheck && bun lint && bun run test`
Expected: alle drei ohne Fehler.

- [ ] **Step 8: Commit**

```bash
git add features/tasks/filterStore.ts features/tasks/filterStore.test.ts \
  features/tasks/queries.ts features/tasks/index.ts
git commit -m "feat(tasks): Filter-Store und gefilterte Sektionen-Ableitung"
```

---

### Task 5: `FilterChipRow`-Primitive

Eine generische Einfachauswahl-Chipreihe in `app-sections/shared/`. Generisch über den Options-Typ, damit die Aufrufer ohne `as`-Cast auskommen: `options: { id: StatusFilter … }[]` verengt `onSelect` automatisch auf `(id: StatusFilter) => void`.

**Files:**

- Create: `app-sections/shared/FilterChipRow.tsx`
- Modify: `app-sections/shared/index.ts`

**Interfaces:**

- Consumes: `useTheme` aus `@/design-system/ThemeProvider`, `Text` aus `@/design-system/ui`.
- Produces:
  - `FilterChipRow<T extends string>` mit Props `{ accessibilityLabel: string; options: FilterChipOption<T>[]; selectedId: T; onSelect: (id: T) => void }`
  - `interface FilterChipOption<T extends string> { id: T; label: string; dotColor?: string }`

- [ ] **Step 1: Die Komponente schreiben**

Neue Datei `app-sections/shared/FilterChipRow.tsx`:

```tsx
import { Pressable, View } from "react-native";

import { useTheme } from "@/design-system/ThemeProvider";
import { Text } from "@/design-system/ui";

export interface FilterChipOption<T extends string> {
  id: T;
  /** Bereits übersetzt — der Katalog-Key unterscheidet sich pro Reihe. */
  label: string;
  /** Bereits zu einem Hex-Wert aufgelöst. Nur die Kind-Reihe setzt ihn. */
  dotColor?: string;
}

interface FilterChipRowProps<T extends string> {
  /** Gruppenname für Screenreader; bewusst nicht sichtbar gerendert. */
  accessibilityLabel: string;
  options: FilterChipOption<T>[];
  selectedId: T;
  onSelect: (id: T) => void;
}

/**
 * Einfachauswahl-Chipreihe. Generisch über die Option-ID, damit ein Aufrufer
 * mit einem engen Union-Typ (`StatusFilter`, `DueFilter`) einen ebenso eng
 * typisierten `onSelect` bekommt statt eines `string`, den er zurückcasten
 * müsste.
 */
export function FilterChipRow<T extends string>({
  accessibilityLabel,
  options,
  selectedId,
  onSelect,
}: FilterChipRowProps<T>) {
  const { theme } = useTheme();

  return (
    // Container-Rolle statt `accessible`: ein accessible-Container würde die
    // Chips für den Screenreader verschlucken, die Rolle benennt die Gruppe,
    // ohne sie unerreichbar zu machen.
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      className="flex-row flex-wrap gap-2"
    >
      {options.map((option) => {
        const active = option.id === selectedId;
        return (
          <Pressable
            key={option.id}
            accessibilityRole="button"
            accessibilityLabel={option.label}
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(option.id)}
            // Der Chip ist per Design 36px hoch; hitSlop bringt das
            // Touch-Target auf 44, ohne die Optik anzufassen — wie in
            // TypePicker.
            hitSlop={{ top: 4, bottom: 4 }}
            className="h-9 flex-row items-center gap-1.5 rounded-pill border px-3 active:opacity-70"
            style={{
              backgroundColor: active ? theme.primarySoft : theme.cardSubtle,
              borderColor: active ? theme.primary : theme.line,
            }}
          >
            {option.dotColor ? (
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: option.dotColor,
                }}
              />
            ) : null}
            <Text
              variant="pill"
              style={{ color: active ? theme.primaryStrong : theme.inkSecondary }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
```

- [ ] **Step 2: Den Barrel erweitern**

In `app-sections/shared/index.ts` — alphabetisch zwischen dem `EventRow`- und dem `Field`-Export einfügen:

```ts
export { FilterChipRow, type FilterChipOption } from "./FilterChipRow";
```

- [ ] **Step 3: Typecheck und Lint**

Run: `bun run typecheck && bun lint`
Expected: keine Fehler. Kein Unit-Test — das Repo rendert keine RN-Komponenten unter `bun test`; die Absicherung sind Typecheck, Lint und der Web-Smoke-Build in Task 7.

- [ ] **Step 4: Commit**

```bash
git add app-sections/shared/FilterChipRow.tsx app-sections/shared/index.ts
git commit -m "feat(shared): generische FilterChipRow fuer Einfachauswahl-Filter"
```

---

### Task 6: Filterleiste im AufgabenScreen verdrahten

Alles zusammenführen: drei Chip-Reihen, der Reset, die `doneRecent`-Sektion und der zweite Leerzustand — plus die elf restlichen i18n-Keys.

**Files:**

- Modify: `features/i18n/locales/de.json`, `features/i18n/locales/en.json`
- Modify: `app-sections/(tabs)/aufgaben/AufgabenScreen.tsx`

**Interfaces:**

- Consumes: `useFilteredTaskSections`, `useTaskFilter`, `useTaskFilterStore`, `isFiltered`, `CHILD_ALL`, `CHILD_NONE`, `StatusFilter`, `DueFilter` aus Task 3/4; `FilterChipRow` aus Task 5; `TaskUrgency` aus Task 2.
- Produces: keine neuen Exporte.

- [ ] **Step 1: Die restlichen Keys in `de.json` legen**

In `features/i18n/locales/de.json` im `hw`-Block direkt **nach** der `"doneToday"`-Zeile:

```json
    "doneRecent": "Zuletzt erledigt",
```

Und **zwischen** dem `"type"`-Block und dem `"error"`-Block:

```json
    "filter": {
      "all": "Alle",
      "open": "Offen",
      "done": "Erledigt",
      "today": "Heute",
      "reset": "Filter zurücksetzen",
      "empty": {
        "title": "Keine Treffer",
        "sub": "Für diese Filter gibt es gerade keine Aufgaben."
      },
      "a11y": {
        "status": "Status filtern",
        "due": "Fälligkeit filtern",
        "child": "Nach Kind filtern"
      }
    },
```

- [ ] **Step 2: Dieselben Keys in `en.json` spiegeln**

Nach `"doneToday"`:

```json
    "doneRecent": "Recently done",
```

Zwischen `"type"` und `"error"`:

```json
    "filter": {
      "all": "All",
      "open": "Open",
      "done": "Done",
      "today": "Today",
      "reset": "Clear filters",
      "empty": {
        "title": "No matches",
        "sub": "No tasks match these filters right now."
      },
      "a11y": {
        "status": "Filter by status",
        "due": "Filter by due date",
        "child": "Filter by child"
      }
    },
```

- [ ] **Step 3: Prüfen, dass beide Kataloge gültiges JSON sind und dieselbe Key-Menge haben**

Run:

```bash
bun -e 'const flat=(o,p="")=>Object.entries(o).flatMap(([k,v])=>typeof v==="object"&&v!==null?flat(v,p+k+"."):[p+k]);const de=await Bun.file("features/i18n/locales/de.json").json();const en=await Bun.file("features/i18n/locales/en.json").json();const a=flat(de.hw).sort(),b=flat(en.hw).sort();console.log(JSON.stringify(a)===JSON.stringify(b)?`hw keys match (${a.length})`:`MISMATCH\nonly de: ${a.filter(k=>!b.includes(k))}\nonly en: ${b.filter(k=>!a.includes(k))}`);'
```

Expected: `hw keys match (59)` — 47 Keys vor dieser Iteration plus die zwölf neuen. Ein `MISMATCH` listet die Seite auf, der ein Key fehlt.

- [ ] **Step 4: Die Importe im Screen erweitern**

In `app-sections/(tabs)/aufgaben/AufgabenScreen.tsx`:

```tsx
import { FilterChipRow, TopBar, type FilterChipOption } from "@/app-sections/shared";
```

und

```tsx
import {
  CHILD_ALL,
  CHILD_NONE,
  isFiltered,
  mapTaskError,
  useFamilyTasks,
  useFilteredTaskSections,
  useTaskFilter,
  useTaskFilterStore,
  useTasksStats,
  type DueFilter,
  type StatusFilter,
} from "@/features/tasks";
```

`useTasksSections` fällt aus dem Import — die Stat-Kacheln bleiben über `useTasksStats` ungefiltert, die Liste kommt jetzt aus `useFilteredTaskSections`.

- [ ] **Step 5: Filter-Zustand und Optionen im Screen aufbauen**

Die Zeile `const sections = useTasksSections();` ersetzen durch:

```tsx
const sections = useFilteredTaskSections();

const filter = useTaskFilter();
const setStatus = useTaskFilterStore((s) => s.setStatus);
const setDue = useTaskFilterStore((s) => s.setDue);
const setChild = useTaskFilterStore((s) => s.setChild);
const resetFilter = useTaskFilterStore((s) => s.reset);
const filterActive = isFiltered(filter);
```

Direkt **nach** dem bestehenden `childById`-`useMemo` einfügen:

```tsx
const statusOptions: FilterChipOption<StatusFilter>[] = [
  { id: "all", label: t("hw.filter.all") },
  { id: "open", label: t("hw.filter.open") },
  { id: "done", label: t("hw.filter.done") },
];

// Die Fenster spiegeln die Stat-Kacheln: „Diese Woche" liefert genau die
// Zeilen, die die gleichnamige Kachel zählt.
const dueOptions: FilterChipOption<DueFilter>[] = [
  { id: "all", label: t("hw.filter.all") },
  { id: "overdue", label: t("hw.overdue") },
  { id: "today", label: t("hw.filter.today") },
  { id: "week", label: t("hw.thisWeek") },
  { id: "longTerm", label: t("hw.longTerm") },
];

const childOptions: FilterChipOption<string>[] = [
  { id: CHILD_ALL, label: t("hw.filter.all") },
  ...(children ?? []).map((child) => ({
    id: child.id,
    label: child.name,
    dotColor: child.color,
  })),
  { id: CHILD_NONE, label: t("hw.form.noChild") },
];
```

- [ ] **Step 6: Die `doneRecent`-Sektion ans `groups`-Array hängen**

Das `groups`-Array aus Task 2 ersetzen durch:

```tsx
const groups = [
  {
    key: "overdue",
    label: t("hw.overdue"),
    items: sections.overdue,
    urgency: "overdue" as const,
  },
  { key: "today", label: t("hw.dueToday"), items: sections.today, urgency: "today" as const },
  { key: "upcoming", label: t("hw.upcoming"), items: sections.upcoming, urgency: "none" as const },
  {
    key: "doneToday",
    label: t("hw.doneToday"),
    items: sections.doneToday,
    urgency: "none" as const,
  },
  // Nur unter dem Erledigt-Filter: unter „Alle" würde die Default-Ansicht
  // sonst um eine Woche Historie wachsen.
  ...(filter.status === "done"
    ? [
        {
          key: "doneRecent",
          label: t("hw.doneRecent"),
          items: sections.doneRecent,
          urgency: "none" as const,
        },
      ]
    : []),
].filter((group) => group.items.length > 0);
```

- [ ] **Step 7: Die Leiste rendern**

Im Erfolgs-Zweig direkt **nach** dem `View` mit den Stat-Kacheln (also nach dessen schließendem `</View>`) und **vor** der `groups.length === 0`-Verzweigung einfügen:

```tsx
<View className="mt-4 gap-2">
  <FilterChipRow
    accessibilityLabel={t("hw.filter.a11y.status")}
    options={statusOptions}
    selectedId={filter.status}
    onSelect={setStatus}
  />
  <FilterChipRow
    accessibilityLabel={t("hw.filter.a11y.due")}
    options={dueOptions}
    selectedId={filter.due}
    onSelect={setDue}
  />
  {/* Ohne Kinder in der Familie hat weder „Alle" noch „Ohne Kind"
                eine Bedeutung — dieselbe Logik wie MemberPickers Early-Return. */}
  {(children ?? []).length > 0 ? (
    <FilterChipRow
      accessibilityLabel={t("hw.filter.a11y.child")}
      options={childOptions}
      selectedId={filter.childId}
      onSelect={setChild}
    />
  ) : null}
  {filterActive ? (
    <View className="items-end">
      <Button label={t("hw.filter.reset")} variant="ghost" tone="neutral" onPress={resetFilter} />
    </View>
  ) : null}
</View>
```

- [ ] **Step 8: Den zweiten Leerzustand einbauen**

Die `groups.length === 0`-Card ersetzen durch:

```tsx
<Card className="mt-5 items-start gap-1">
  <Text variant="bodyEmph">{filterActive ? t("hw.filter.empty.title") : t("hw.empty.title")}</Text>
  <Text variant="caption" tone="inkSecondary">
    {filterActive ? t("hw.filter.empty.sub") : t("hw.empty.sub")}
  </Text>
  {/* Im Card `soft` statt `ghost` wie in der Leiste: ein
                  transparenter Button wäre hier der einzige Ausweg und dürfte
                  nicht der unauffälligste sein. Gleiche Wahl wie die
                  Retry-Aktion der Fehler-Card. */}
  {filterActive ? (
    <Button label={t("hw.filter.reset")} variant="soft" onPress={resetFilter} className="mt-2" />
  ) : null}
</Card>
```

- [ ] **Step 9: Volle Prüfung**

Run: `bun run typecheck && bun lint && bun run test && bun format:check`
Expected: alle vier ohne Fehler.

- [ ] **Step 10: Sichtprüfung im Web-Preview**

Run: `bun run web`

Im Browser auf den Aufgaben-Tab gehen und durchklicken:

1. Drei Chip-Reihen stehen zwischen Stat-Kacheln und Liste, jede mit „Alle" vorausgewählt.
2. „Offen" blendet die Erledigt-Sektionen aus, „Erledigt" die offenen — und bringt „Zuletzt erledigt" hervor, sofern es älteres Erledigtes gibt.
3. „Überfällig" lässt nur die Überfällig-Sektion stehen; deren Zeilen tragen die rote Pille.
4. „Diese Woche" zeigt so viele offene Aufgaben, wie die gleichnamige Stat-Kachel behauptet.
5. Ein Kind-Chip reduziert auf dessen Aufgaben, „Ohne Kind" auf die elternlosen.
6. Der Reset-Button erscheint erst bei aktivem Filter und setzt alle drei Reihen zurück.
7. Eine Filterkombination ohne Treffer zeigt „Keine Treffer" mit Reset, nicht „Nichts zu tun".
8. Ein Wechsel auf einen anderen Tab und zurück lässt den Filter stehen.

Danach den Dev-Server beenden.

- [ ] **Step 11: Commit**

```bash
git add features/i18n/locales/de.json features/i18n/locales/en.json \
  "app-sections/(tabs)/aufgaben/AufgabenScreen.tsx"
git commit -m "feat(tasks): Filterleiste fuer Status, Faelligkeit und Kind im Aufgaben-Screen"
```

---

### Task 7: Dokumentation und Abschluss-Verifikation

ADR und Backlog nachziehen, dann die volle CI-Gate-Runde inklusive Web-Export.

**Files:**

- Modify: `docs/decision-log.md`
- Modify: `docs/TODO.md`

**Interfaces:**

- Consumes: die Entscheidungen aus allen vorigen Tasks.
- Produces: nichts, was Code konsumiert.

- [ ] **Step 1: ADR-011 anhängen**

Ans Ende von `docs/decision-log.md` anhängen (ältere ADRs **nicht** anfassen):

```markdown
## ADR-011 — Aufgaben-Filter client-seitig, Überfällig als eigene Sektion (2026-08-12)

**Kontext.** Der Aufgaben-Screen zeigte alles, was im Query-Fenster lag, ohne
Möglichkeit einzuengen. `useFamilyTasks` lädt alle offenen Aufgaben plus sieben
Tage Erledigtes in genau einen Cache-Eintrag. `tasks` hat keine
Prioritätsspalte; „Dringlichkeit" ist laut `patterns/homework.md` aus
`due_date` abgeleitet.

**Decision 1 — Gefiltert wird im Cache, nicht in der Query.** Der Filter ist
eine reine Funktion (`features/tasks/filter.ts`) über die bereits geladenen
Zeilen. Ein Filter im Query-Key hätte pro Chip-Tap einen Roundtrip gekostet,
die Cache-Einträge vervielfacht und jede Mutation gezwungen, statt eines
Eintrags alle Varianten zu patchen. Ein Hybrid (Status server-seitig) wurde
verworfen, weil er zwei Orte schafft, an denen „was ist sichtbar" definiert
ist.

**Decision 2 — Die Fälligkeits-Chips sind überlappende Fenster, keine
disjunkten Eimer.** `today` und `week` schließen Überfälliges ein, exakt wie
die gleichnamigen Stat-Kacheln in `computeTaskStats`. Damit wird die Chip-Reihe
zum Drilldown der Stat-Leiste, statt eine zweite Zählweise danebenzustellen.
Das Prädikat liest nur `due_date`, unabhängig von `is_done`, damit auch
„Erledigt + Diese Woche" definiert ist.

**Decision 3 — Überfällige Aufgaben bekommen eine eigene Sektion, auch
ungefiltert.** `groupTasksByDue` teilt offene Aufgaben jetzt in `overdue`,
`today` und `upcoming`. Konsequenz: die Kachel sagt „3 Heute fällig", während
die Liste „Überfällig 2" und „Heute fällig 1" zeigt. Bewusst in Kauf genommen —
die Kachel zählt, was heute zu tun ist, die Sektionen erklären, warum. Die
Alternative, die Überschrift nur bei aktivem Filter umzubenennen, hätte sie von
einer Beschreibung des Inhalts zu einer Funktion des UI-Zustands gemacht.
`TaskRow`s `urgent: boolean` wurde dafür zu `urgency: "none" | "today" |
"overdue"`; beide dringenden Zustände tönen die Card `warning`, weil `Card`s
`TintTone` kein `danger` kennt und `design-system/` Handoff-Bundle ist.

**Decision 4 — `due_time` ist der Dringlichkeits-Tiebreaker.** Sortiert wird
`due_date` asc → `due_time` asc (NULL ans Ende) → Titel. Ohne Prioritätsspalte
ist „bis 8 Uhr abgeben ist dringender als irgendwann heute" die Bedeutung, die
„dann Dringlichkeit" tragen kann. Nebeneffekt: die Reihenfolge bei gleichem
Datum ist erstmals deterministisch. Eine echte `tasks.priority`-Spalte
(Migration, zwei Formularfelder, Types-Regen) wäre eine eigene Iteration und
ohne Nutzersignal spekulativ.

**Decision 5 — Der Filter lebt in einem Zustand-Store ohne `persist`.** Er
überlebt Tab-Wechsel und den Weg ins Formular, wird beim App-Start
zurückgesetzt. `useState` im Screen wäre nicht isoliert testbar;
`zustand/middleware`-`persist` führt Hydration-Handling und einen Web-Zweig neu
im Repo ein — und ein vor einer Woche gesetzter Kind-Filter würde eine
unvollständige Liste zeigen, ohne dass erkennbar wäre, warum.

**Konsequenzen.** `patterns/homework.md` kennt weder die Filterleiste noch mehr
als drei Sektionen, und die zwölf neuen `hw.*`-Keys fehlen in `docs/COPY.md` —
beides als Designer-Abstimmung in `docs/TODO.md`. `useTasksByChild` bleibt
ungenutzt: ein Kind-_Filter_ ersetzt keine Kind-_Gruppierung_.
```

- [ ] **Step 2: Die zwei neuen TODO-Einträge anhängen**

In `docs/TODO.md` ans Ende des Abschnitts `## Aufgaben / Tasks (Daten-Layer V1)` anhängen:

```markdown
- **`patterns/homework.md` kennt keine Filterleiste und nennt drei Sektionen statt fünf** ([patterns/homework.md](../patterns/homework.md)): Der V2-Abschnitt beschreibt „Heute fällig / Demnächst / Erledigt heute". Seit ADR-011 rendert der Screen zusätzlich „Überfällig" (immer, sobald überfällige Aufgaben existieren) und „Zuletzt erledigt" (nur unter dem Erledigt-Filter), und darüber sitzen drei Chip-Reihen, die der Pattern-Doc überhaupt nicht führt. Mit dem Designer abstimmen, damit der Doc die Anatomie mitträgt — inklusive der Frage, ob die Stat-Kachel „Heute fällig" weiterhin Überfälliges mitzählen soll, während die Liste beides trennt.
- **Neue Filter-Keys fehlen in `docs/COPY.md`** ([features/i18n/locales/de.json](../features/i18n/locales/de.json) + [en.json](../features/i18n/locales/en.json)): `hw.overdue`, `hw.doneRecent` sowie `hw.filter.all`/`open`/`done`/`today`/`reset`, `hw.filter.empty.title`/`sub` und `hw.filter.a11y.status`/`due`/`child`. Vom Designer in der Copy-Deck-Tabelle nachtragen (gleiche Baustelle wie `set.footer` und die Kalender-Keys).
```

- [ ] **Step 3: Den bestehenden V1/V2-Umschalter-Eintrag ergänzen**

In `docs/TODO.md` den Eintrag mit dem Titel **`patterns/homework.md` beschreibt einen V1/V2-Umschalter, den es nicht gibt** um einen Satz am Ende erweitern:

```markdown
Seit ADR-011 gibt es einen Kind-_Filter_ in der Leiste — der ersetzt die Kind-_Gruppierung_ aber nicht: `useTasksByChild` liefert Avatar-Header samt Offen-Zähler pro Kind und bleibt weiterhin ungenutzt.
```

- [ ] **Step 4: Die volle Gate-Runde in CI-Reihenfolge**

Run:

```bash
bun format:check && bun lint && bun run typecheck && bun run test
```

Expected: alle vier ohne Fehler. Bei einem `format:check`-Fehler `bun format` laufen lassen und die Formatierung mitcommitten.

- [ ] **Step 5: Web-Smoke-Build**

Run: `bunx expo export --platform web --output-dir /tmp/eltern-web`
Expected: Bundle wird ohne Fehler geschrieben.

- [ ] **Step 6: Commit**

```bash
git add docs/decision-log.md docs/TODO.md
git commit -m "docs(tasks): ADR-011 und Backlog-Eintraege zur Filter-Iteration"
```

- [ ] **Step 7: CodeRabbit-Review vor dem PR**

Run: `coderabbit review --base main --agent`

Jeden Fund entweder beheben oder mit Begründung bewusst verwerfen. Rate-Limit beachten: etwa drei CLI-Reviews pro Stunde — nicht in Schleife laufen lassen.

---

## Verifikations-Zusammenfassung

| Kriterium (Spec)                                                      | Belegt durch                                                                      |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Drei Chip-Reihen, `Alle` als Default, Kind-Reihe entfällt ohne Kinder | Task 6 Step 7 · Sichtprüfung Punkt 1 und 5                                        |
| Chips erreichen 44×44                                                 | Task 5 Step 1 (`h-9` + `hitSlop`)                                                 |
| Chip-Tap ohne Request                                                 | Task 4 Step 5 (Filter im `useMemo`, kein Query-Key)                               |
| Filter überlebt Tab-Wechsel, nicht den Neustart                       | Task 4 Step 3 (Store ohne `persist`) · Sichtprüfung Punkt 8                       |
| „Diese Woche" == Stat-Kachel                                          | Task 3 Step 1 (`'week' reicht bis einschließlich Sonntag`) · Sichtprüfung Punkt 4 |
| `doneRecent` nur unter Status `Erledigt`                              | Task 6 Step 6 · Sichtprüfung Punkt 2                                              |
| Überfällig immer sichtbar, mit eigener Pille                          | Task 1 Step 2 · Task 2 Step 2 · Sichtprüfung Punkt 3                              |
| `due_time`-Tiebreaker, ohne Uhrzeit alphabetisch ans Ende             | Task 1 Step 2 (zwei Sortier-Tests)                                                |
| Gefilterter Leerzustand statt „Nichts zu tun"                         | Task 6 Step 8 · Sichtprüfung Punkt 7                                              |
| Kein hartcodierter String, alle Gates grün                            | Task 6 Step 3 (Key-Parität) · Task 7 Steps 4–5                                    |
