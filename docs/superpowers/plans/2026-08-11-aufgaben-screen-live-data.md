# AufgabenScreen auf Live-Daten Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `AufgabenScreen` zeigt echte Tasks aus `features/tasks` statt `features/sample-data` — nach Fälligkeit gruppiert, mit funktionierender Checkbox, Pull-to-Refresh und Empty-States.

**Architecture:** Die Ableitung nach Fälligkeit kommt als reine Funktion in `stats.ts` und als Hook `useTasksSections` daneben — dieselbe Form wie `useTasksByChild`/`useTasksStats`. Die Farbauflösung spiegelt `features/calendar/palette.ts`, weil `task_types.color` Theme-Rollennamen statt Hex-Werte enthält. Der Screen wird in zwei Dateien geteilt: Datenverdrahtung plus Zustände im Screen, eine Zeile in `TaskRow.tsx`.

**Tech Stack:** TypeScript (strict), React Native, NativeWind, `@tanstack/react-query`, `date-fns@4.4.0` (inkl. `date-fns/locale`), `bun:test`.

**Spec:** [docs/superpowers/specs/2026-08-11-aufgaben-screen-live-data-design.md](../specs/2026-08-11-aufgaben-screen-live-data-design.md)

## Global Constraints

- Branch ist `feat/aufgaben-live-data`. Alle Commits landen dort.
- **Kein `Co-Authored-By: Claude`-Trailer.** Conventional-Commits-Präfix, gescoped (`feat(tasks): …`).
- **Pre-commit-Hooks niemals mit `--no-verify` umgehen.**
- **Handoff-Bundle bleibt unangetastet:** `design-system/{colors,typography,spacing,themes,components,index}.ts`, `docs/{HANDOFF,COPY,ICONS,README}.md`, `patterns/*.md`. `design-system/ui/` ist dagegen Claude-owned und darf erweitert werden.
- **Alle UI-Strings über i18n.** Keine Literale im JSX — die ESLint-Regel `i18next/no-literal-string` prüft das. DE ist kanonisch, EN spiegelt. Immer **Du**, nie Sie; keine Ausrufezeichen; nie kindlich-süß.
- **Touch-Targets ≥ 44×44** (CLAUDE.md-Non-negotiable #4). Betrifft hier die Checkbox.
- Der Voice-FAB muss auf diesem Tab erreichbar bleiben — der Screen darf nichts über ihn legen.
- `due_date` ist ein Postgres-`date`: immer `parseISO("YYYY-MM-DD")`, **nie** `new Date("YYYY-MM-DD")` (letzteres liest UTC-Mitternacht und verschiebt den Tag westlich von Greenwich).
- Kein `Date.now()` / `new Date()` in `stats.ts` — `now` ist Parameter.
- Tests laufen mit `bun test`, Imports aus `bun:test`. Nicht `npx jest`.
- Pfad-Alias `@/*` → Repo-Root.

## File Structure

| Datei                                                  | Verantwortung                                              | Task |
| ------------------------------------------------------ | ---------------------------------------------------------- | ---- |
| `features/tasks/stats.ts`                              | **Änderung:** `groupTasksByDue` + `TaskSections`           | 1    |
| `features/tasks/stats.test.ts`                         | **Änderung:** Tests dagegen                                | 1    |
| `features/tasks/palette.ts`                            | `taskTypeColorFor` — Theme-Rolle → Farbe                   | 2    |
| `features/tasks/palette.test.ts`                       | Tests dagegen                                              | 2    |
| `features/tasks/queries.ts`                            | **Änderung:** `useTasksSections`, `refetch`/`isRefetching` | 3    |
| `design-system/ui/Screen.tsx`                          | **Änderung:** `refreshControl`-Prop                        | 3    |
| `features/tasks/index.ts`                              | **Änderung:** Barrel                                       | 3    |
| `app-sections/(tabs)/aufgaben/TaskRow.tsx`             | eine Aufgabenzeile                                         | 4    |
| `app-sections/(tabs)/aufgaben/AufgabenScreen.tsx`      | **Änderung:** Daten, Sektionen, Zustände                   | 4    |
| `features/i18n/locales/{de,en}.json`                   | **Änderung:** 3 neue Keys, `hw.sub` umgeformt              | 4    |
| `features/sample-data/{homework.ts,types.ts,index.ts}` | **Löschung** des toten Mocks                               | 4    |
| `docs/TODO.md`                                         | **Änderung:** Backlog-Pflege                               | 4    |

**Warum `palette.ts` in `features/tasks` und nicht im Screen-Ordner:** `features/calendar/palette.ts` macht exakt dasselbe für Events und liegt dort. Der Import ist `@/design-system/themes` (reine Tokens), kein `react-native` — die Schichtgrenze aus der Mutations-Iteration bleibt intakt.

---

### Task 1: `groupTasksByDue`

**Files:**

- Modify: `features/tasks/stats.ts` (Funktion + Interface ergänzen)
- Modify: `features/tasks/stats.test.ts` (Suite ergänzen)

**Interfaces:**

- Consumes: `TaskWithType` aus `./types`; `makeTask` aus derselben Testdatei (existiert bereits).
- Produces:
  - `interface TaskSections { today: TaskWithType[]; upcoming: TaskWithType[]; doneToday: TaskWithType[] }`
  - `groupTasksByDue(tasks: TaskWithType[], now: Date): TaskSections`

**Referenzdatum für die Tests:** `NOW` existiert bereits in `stats.test.ts` als Mittwoch **2026-07-29**, ebenso die Helfer `makeTask` und `localNoon(day)`. Beide werden wiederverwendet.

- [ ] **Step 1: Failing tests schreiben**

Ans Ende von `features/tasks/stats.test.ts` anhängen und den Import auf
`import { computeTaskStats, groupTasksByChild, groupTasksByDue } from "./stats";` erweitern:

```ts
describe("groupTasksByDue", () => {
  test("empty input yields three empty sections", () => {
    expect(groupTasksByDue([], NOW)).toEqual({ today: [], upcoming: [], doneToday: [] });
  });

  test("overdue tasks land in today, not upcoming", () => {
    const sections = groupTasksByDue([makeTask({ id: "overdue", due_date: "2026-07-27" })], NOW);

    expect(sections.today.map((t) => t.id)).toEqual(["overdue"]);
    expect(sections.upcoming).toHaveLength(0);
  });

  test("today goes to today, tomorrow goes to upcoming", () => {
    const sections = groupTasksByDue(
      [
        makeTask({ id: "today", due_date: "2026-07-29" }),
        makeTask({ id: "tomorrow", due_date: "2026-07-30" }),
      ],
      NOW,
    );

    expect(sections.today.map((t) => t.id)).toEqual(["today"]);
    expect(sections.upcoming.map((t) => t.id)).toEqual(["tomorrow"]);
  });

  test("a long-term task stays visible in upcoming rather than vanishing", () => {
    const sections = groupTasksByDue([makeTask({ id: "far", due_date: "2026-12-24" })], NOW);

    expect(sections.upcoming.map((t) => t.id)).toEqual(["far"]);
  });

  test("done today lands in doneToday, done yesterday in no section", () => {
    const sections = groupTasksByDue(
      [makeDone("today", localNoon(29)), makeDone("yesterday", localNoon(28))],
      NOW,
    );

    expect(sections.doneToday.map((t) => t.id)).toEqual(["today"]);
    expect(sections.today).toHaveLength(0);
    expect(sections.upcoming).toHaveLength(0);
  });

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

  test("doneToday sorts by completion, newest first", () => {
    const sections = groupTasksByDue(
      [
        makeDone("morning", new Date(2026, 6, 29, 8, 0, 0)),
        makeDone("evening", new Date(2026, 6, 29, 20, 0, 0)),
      ],
      NOW,
    );

    expect(sections.doneToday.map((t) => t.id)).toEqual(["evening", "morning"]);
  });

  test("every open task sits in exactly one section", () => {
    const tasks = [
      makeTask({ id: "overdue", due_date: "2026-07-01" }),
      makeTask({ id: "today", due_date: "2026-07-29" }),
      makeTask({ id: "tomorrow", due_date: "2026-07-30" }),
      makeTask({ id: "far", due_date: "2027-01-01" }),
    ];

    const sections = groupTasksByDue(tasks, NOW);
    const placed = [...sections.today, ...sections.upcoming].map((t) => t.id).sort();

    expect(placed).toEqual(["far", "overdue", "today", "tomorrow"]);
  });
});
```

- [ ] **Step 2: Tests laufen lassen und Fehlschlag bestätigen**

Run: `bun test features/tasks/stats.test.ts`

Expected: FAIL — `groupTasksByDue is not a function` bzw. ein Import-Fehler. Die 13 bestehenden Tests bleiben grün.

- [ ] **Step 3: Implementierung schreiben**

In `features/tasks/stats.ts` den Typ-Import auf
`import type { TaskGroup, TaskSections, TaskStats, TaskWithType } from "./types";` erweitern
und ans Dateiende hängen:

```ts
/**
 * The three sections of patterns/homework.md V2.
 *
 * `upcoming` deliberately takes *everything* open after today, not just the
 * running week: a "this week" section would drop long-term tasks out of every
 * list and make them invisible. The week's count lives in the stat strip
 * instead. Together with `today` that means every open task sits in exactly
 * one section.
 */
export function groupTasksByDue(tasks: TaskWithType[], now: Date): TaskSections {
  const todayEnd = endOfDay(now);

  const today: TaskWithType[] = [];
  const upcoming: TaskWithType[] = [];
  const doneToday: TaskWithType[] = [];

  for (const task of tasks) {
    if (task.is_done) {
      if (task.completed_at && isSameDay(new Date(task.completed_at), now)) doneToday.push(task);
      continue;
    }
    // Overdue folds into "today" — patterns/homework.md derives urgency as
    // `today` if `due <= end of today`, same rule as computeTaskStats.
    if (parseISO(task.due_date) <= todayEnd) today.push(task);
    else upcoming.push(task);
  }

  return {
    today: today.sort(byDueDateAsc),
    upcoming: upcoming.sort(byDueDateAsc),
    doneToday: doneToday.sort(byCompletedAtDesc),
  };
}
```

Und in `features/tasks/types.ts` ans Dateiende:

```ts
/** The three sections of patterns/homework.md V2, as `groupTasksByDue` returns them. */
export interface TaskSections {
  today: TaskWithType[];
  upcoming: TaskWithType[];
  doneToday: TaskWithType[];
}
```

- [ ] **Step 4: Tests laufen lassen und Erfolg bestätigen**

Run: `bun test features/tasks/stats.test.ts`

Expected: PASS — 21 Tests grün (13 bestehende + 8 neue).

- [ ] **Step 5: Committen**

```bash
git add features/tasks/stats.ts features/tasks/types.ts features/tasks/stats.test.ts
git commit -m "feat(tasks): Ableitung der Faelligkeits-Sektionen"
```

---

### Task 2: Farbauflösung für Task-Typen

**Files:**

- Create: `features/tasks/palette.ts`
- Create: `features/tasks/palette.test.ts`

**Interfaces:**

- Consumes: `Theme` aus `@/design-system/themes`.
- Produces: `taskTypeColorFor(colorRole: string | null | undefined, theme: Theme): string`

**Hintergrund:** `task_types.color` enthält **keine Hex-Werte**, sondern Namen semantischer Theme-Rollen — die Migration seedet `'accent'`, `'primary'` und `'primarySoft'`. `features/calendar/palette.ts` löst dasselbe Problem für Events mit `eventColorFor(slug, roleFallback, theme)`; diese Funktion ist die Task-Entsprechung, ohne den Slug-nach-Hex-Teil, weil es keine task-spezifische Palette gibt.

- [ ] **Step 1: Failing tests schreiben**

Create `features/tasks/palette.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { lightTheme } from "@/design-system/themes";

import { taskTypeColorFor } from "./palette";

describe("taskTypeColorFor", () => {
  test("resolves a semantic theme role to its colour", () => {
    expect(taskTypeColorFor("accent", lightTheme)).toBe(lightTheme.accent);
  });

  test("resolves the camelCase roles the migration seeds", () => {
    expect(taskTypeColorFor("primarySoft", lightTheme)).toBe(lightTheme.primarySoft);
  });

  test("falls back to primary for an unknown role", () => {
    expect(taskTypeColorFor("chartreuse", lightTheme)).toBe(lightTheme.primary);
  });

  test("falls back to primary for null and undefined", () => {
    expect(taskTypeColorFor(null, lightTheme)).toBe(lightTheme.primary);
    expect(taskTypeColorFor(undefined, lightTheme)).toBe(lightTheme.primary);
  });

  test("does not return a non-string theme member", () => {
    // Guards against a role name that collides with a nested/non-colour key.
    expect(typeof taskTypeColorFor("toString", lightTheme)).toBe("string");
    expect(taskTypeColorFor("toString", lightTheme)).toBe(lightTheme.primary);
  });
});
```

- [ ] **Step 2: Tests laufen lassen und Fehlschlag bestätigen**

Run: `bun test features/tasks/palette.test.ts`

Expected: FAIL — `Cannot find module './palette'`.

- [ ] **Step 3: Implementierung schreiben**

Create `features/tasks/palette.ts`:

```ts
import type { Theme } from "@/design-system/themes";

/**
 * `task_types.color` holds the *name* of a semantic theme role, not a hex
 * value — the migration seeds `accent`, `primary` and `primarySoft`. Same
 * mechanism as `eventColorFor` in features/calendar/palette.ts, minus the
 * slug-to-hex table: there is no task-specific palette.
 *
 * Anything that does not resolve to a *string* falls back to `primary`. That
 * single check is enough to keep inherited members out: `theme.toString` is a
 * function, not a string, and `Object.prototype` carries no string-valued
 * members at all.
 */
export function taskTypeColorFor(colorRole: string | null | undefined, theme: Theme): string {
  if (!colorRole) return theme.primary;
  const value = (theme as unknown as Record<string, unknown>)[colorRole];
  return typeof value === "string" ? value : theme.primary;
}
```

- [ ] **Step 4: Tests laufen lassen und Erfolg bestätigen**

Run: `bun test features/tasks/palette.test.ts`

Expected: PASS — 6 Tests grün.

- [ ] **Step 5: Committen**

```bash
git add features/tasks/palette.ts features/tasks/palette.test.ts
git commit -m "feat(tasks): Theme-Rolle aus task_types.color aufloesen"
```

---

### Task 3: `useTasksSections`, `refetch` und `Screen`-Prop

**Files:**

- Modify: `features/tasks/queries.ts`
- Modify: `design-system/ui/Screen.tsx`
- Modify: `features/tasks/index.ts`

**Interfaces:**

- Consumes: `groupTasksByDue` aus `./stats` (Task 1), `TaskSections` aus `./types` (Task 1), `taskTypeColorFor` aus `./palette` (Task 2).
- Produces:
  - `useFamilyTasks(): { data: TaskWithType[]; isLoading: boolean; isRefetching: boolean; error: unknown; refetch: () => void }`
  - `useTasksSections(): TaskSections`
  - `Screen` akzeptiert `refreshControl?: ScrollViewProps["refreshControl"]`

- [ ] **Step 1: `useFamilyTasks` erweitern**

In `features/tasks/queries.ts` das Interface und die Rückgabe ersetzen:

```ts
interface UseFamilyTasksResult {
  data: TaskWithType[];
  isLoading: boolean;
  /** True while a pull-to-refresh (or any background refetch) is in flight. */
  isRefetching: boolean;
  error: unknown;
  /** Narrowed to `() => void`: callers hand this straight to `onRefresh`. */
  refetch: () => void;
}
```

```ts
return {
  data: query.data ?? [],
  isLoading: query.isLoading,
  isRefetching: query.isRefetching,
  error: query.error,
  refetch: () => void query.refetch(),
};
```

- [ ] **Step 2: `useTasksSections` ergänzen**

Den Typ-Import in `features/tasks/queries.ts` auf
`import type { TaskGroup, TaskSections, TaskStats, TaskTypeRow, TaskWithType } from "./types";`
und den Wert-Import auf
`import { computeTaskStats, groupTasksByChild, groupTasksByDue } from "./stats";`
erweitern, dann hinter `useTasksByChild` einfügen:

```ts
export function useTasksSections(): TaskSections {
  const { data } = useFamilyTasks();
  const today = useToday();
  // groupTasksByDue only reads the calendar day off `now`, so local midnight is
  // as good as the wall clock — and it keeps the memo from re-running.
  return useMemo(() => groupTasksByDue(data, today), [data, today]);
}
```

- [ ] **Step 3: `Screen` um `refreshControl` erweitern**

In `design-system/ui/Screen.tsx` die Import-Zeile und das Interface ersetzen:

```tsx
import { ScrollView, View, type ScrollViewProps, type ViewProps } from "react-native";
```

```tsx
interface ScreenProps extends ViewProps {
  scroll?: boolean;
  /** Only honoured together with `scroll` — a non-scrolling screen has nothing to pull. */
  refreshControl?: ScrollViewProps["refreshControl"];
  className?: string;
  contentClassName?: string;
}
```

Die Destrukturierung um `refreshControl` erweitern und an die `ScrollView` durchreichen:

```tsx
export function Screen({
  scroll = false,
  refreshControl,
  className,
  contentClassName,
  children,
  ...rest
}: ScreenProps) {
```

```tsx
        <ScrollView
          className="flex-1"
          contentContainerClassName={`pb-32 ${contentClassName ?? ""}`.trim()}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
        >
```

- [ ] **Step 4: Barrel erweitern**

In `features/tasks/index.ts` den `./queries`-Block um `useTasksSections` ergänzen, eine `./palette`-Zeile hinzufügen, den `./stats`-Block um `groupTasksByDue` erweitern und `TaskSections` in den Typ-Export aufnehmen:

```ts
export { taskTypeColorFor } from "./palette";
export {
  fetchFamilyTasks,
  fetchTaskTypes,
  taskKeys,
  useFamilyTasks,
  useTaskTypes,
  useTasksByChild,
  useTasksSections,
  useTasksStats,
} from "./queries";
export { computeTaskStats, groupTasksByChild, groupTasksByDue } from "./stats";
export type {
  TaskGroup,
  TaskInsert,
  TaskRow,
  TaskSections,
  TaskStats,
  TaskTypeRow,
  TaskUpdate,
  TaskWithType,
} from "./types";
```

- [ ] **Step 5: Typecheck, Lint und Tests laufen lassen**

Run: `bun run typecheck && bun lint && bun test`

Expected: alle PASS. Lint meldet weiterhin genau eine vorbestehende Warnung in `app/+not-found.tsx` und 0 Fehler.

- [ ] **Step 6: Committen**

```bash
git add features/tasks/queries.ts features/tasks/index.ts design-system/ui/Screen.tsx
git commit -m "feat(tasks): useTasksSections und Pull-to-Refresh-Faehigkeit"
```

---

### Task 4: Der Screen

**Files:**

- Create: `app-sections/(tabs)/aufgaben/TaskRow.tsx`
- Modify: `app-sections/(tabs)/aufgaben/AufgabenScreen.tsx` (vollständig ersetzt)
- Modify: `features/i18n/locales/de.json`, `features/i18n/locales/en.json`
- Delete: `features/sample-data/homework.ts`
- Modify: `features/sample-data/index.ts`, `features/sample-data/types.ts`
- Modify: `docs/TODO.md`

**Interfaces:**

- Consumes:
  - `useFamilyTasks`, `useTasksSections`, `useTasksStats`, `useToggleTaskDone`, `mapTaskError`, `taskTypeColorFor`, `type TaskWithType` aus `@/features/tasks`
  - `useCurrentParent`, `useFamilyChildren`, `type ChildRow` aus `@/features/auth`
  - `ChildAvatar`, `Icon`, `Pill`, `TopBar` aus `@/app-sections/shared`
  - `Button`, `Card`, `Screen`, `Text` aus `@/design-system/ui`
- Produces: `TaskRow` (nur intern verwendet), `AufgabenScreen`

- [ ] **Step 1: i18n-Keys ergänzen und `hw.sub` umformen**

In `features/i18n/locales/de.json`, im `hw`-Block: `"sub"` ersetzen und `"empty"`/`"loadError"` ergänzen.

```json
"sub": "{{weekday}} · {{open}} offen · {{done}} erledigt",
```

```json
"loadError": "Aufgaben konnten nicht geladen werden.",
"empty": {
  "title": "Nichts zu tun",
  "sub": "Sobald Aufgaben anstehen, findest du sie hier."
},
```

In `features/i18n/locales/en.json` analog:

```json
"sub": "{{weekday}} · {{open}} open · {{done}} done",
```

```json
"loadError": "Tasks could not be loaded.",
"empty": {
  "title": "Nothing to do",
  "sub": "Tasks will show up here once there are any."
},
```

Der Wochentag stand bisher **hartcodiert** im Katalog (`"Mittwoch · …"` / `"Wed · …"`). Mit Mock-Daten fiel das nie auf; live stünde dort dauerhaft Mittwoch.

- [ ] **Step 2: `TaskRow` schreiben**

Create `app-sections/(tabs)/aufgaben/TaskRow.tsx`:

```tsx
import { format, parseISO } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import type { ChildRow } from "@/features/auth";
import type { TaskWithType } from "@/features/tasks";

import { ChildAvatar, Icon, Pill } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card, Text } from "@/design-system/ui";
import { taskTypeColorFor } from "@/features/tasks";

interface TaskRowProps {
  task: TaskWithType;
  /** Absent for parent errands and chores, which hang on no child. */
  child?: ChildRow;
  /** Set for the "today" section: tints the card and shows the urgent pill. */
  urgent: boolean;
  onToggle: () => void;
}

export function TaskRow({ task, child, urgent, onToggle }: TaskRowProps) {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();

  const locale = i18n.language.startsWith("de") ? de : enUS;
  // parseISO, never new Date(): `due_date` is a Postgres `date`, and
  // new Date("2026-08-11") would read UTC midnight and shift the day.
  const due = format(parseISO(task.due_date), "d. MMM", { locale });
  const badgeColor = taskTypeColorFor(task.task_types?.color, theme);

  return (
    <Card
      variant={urgent ? "tinted" : "base"}
      tint="warning"
      className="flex-row items-center gap-2.5"
    >
      <Pressable
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: task.is_done }}
        accessibilityLabel={task.title}
        className="h-11 w-11 items-center justify-center"
      >
        <View
          className="h-5 w-5 items-center justify-center rounded-md"
          style={{
            backgroundColor: task.is_done ? theme.success : "transparent",
            borderWidth: task.is_done ? 0 : 1.5,
            borderColor: theme.lineStrong,
          }}
        >
          {task.is_done ? <Icon name="check" size={13} color="#FFFFFF" /> : null}
        </View>
      </Pressable>

      <View className="flex-1">
        {task.subject || urgent ? (
          <View className="mb-1 flex-row items-center gap-1.5">
            {task.subject ? (
              <View
                className="rounded-pill px-2 py-0.5"
                style={{ backgroundColor: `${badgeColor}22` }}
              >
                <Text variant="pill" style={{ color: badgeColor }}>
                  {task.subject}
                </Text>
              </View>
            ) : null}
            {urgent ? <Pill label={t("hw.dueToday")} tone="warn" /> : null}
          </View>
        ) : null}

        <Text
          variant="listTitle"
          tone={task.is_done ? "inkTertiary" : "ink"}
          style={task.is_done ? { textDecorationLine: "line-through" } : undefined}
        >
          {task.title}
        </Text>
        <Text variant="caption" tone="inkSecondary" className="mt-0.5">
          {t("hw.due", { when: due })}
        </Text>
      </View>

      {child ? <ChildAvatar name={child.name} color={child.color} size="sm" /> : null}
    </Card>
  );
}
```

Die Checkbox sitzt in einem 44×44-`Pressable` (CLAUDE.md-Non-negotiable #4), das Kästchen bleibt optisch 20 px. Das Glocken-Icon der alten Zeile entfällt: es war dekorativ und versprach eine Erinnerungsfunktion, die für Tasks nirgends verdrahtet ist.

- [ ] **Step 3: `AufgabenScreen` ersetzen**

Replace `app-sections/(tabs)/aufgaben/AufgabenScreen.tsx` with:

```tsx
import { format } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Alert, RefreshControl, View } from "react-native";

import type { TaskWithType } from "@/features/tasks";

import { TopBar } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Card, Screen, Text } from "@/design-system/ui";
import { useCurrentParent, useFamilyChildren } from "@/features/auth";
import {
  mapTaskError,
  useFamilyTasks,
  useTasksSections,
  useTasksStats,
  useToggleTaskDone,
} from "@/features/tasks";

import { TaskRow } from "./TaskRow";

export function AufgabenScreen() {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();

  const { isLoading, isRefetching, error, refetch } = useFamilyTasks();
  const sections = useTasksSections();
  const stats = useTasksStats();
  const toggle = useToggleTaskDone();

  const { data: parent } = useCurrentParent();
  const { data: children } = useFamilyChildren(parent?.family_id);

  const childById = useMemo(
    () => new Map((children ?? []).map((child) => [child.id, child])),
    [children],
  );

  const locale = i18n.language.startsWith("de") ? de : enUS;

  const statTiles = [
    {
      n: String(stats.dueToday),
      label: t("hw.dueToday"),
      bg: "bg-warning-soft",
      tone: theme.warning,
    },
    {
      n: String(stats.thisWeek),
      label: t("hw.thisWeek"),
      bg: "bg-primary-soft",
      tone: theme.primaryStrong,
    },
    {
      n: `${stats.donePct}%`,
      label: t("hw.doneRate"),
      bg: "bg-success-soft",
      tone: theme.success,
    },
  ];

  const groups = [
    { key: "today", label: t("hw.dueToday"), items: sections.today, urgent: true },
    { key: "upcoming", label: t("hw.upcoming"), items: sections.upcoming, urgent: false },
    { key: "doneToday", label: t("hw.doneToday"), items: sections.doneToday, urgent: false },
  ].filter((group) => group.items.length > 0);

  function handleToggle(task: TaskWithType) {
    toggle.mutate(
      { taskId: task.id, done: !task.is_done },
      // The layer classifies, the screen presents — that is what mapTaskError
      // is for.
      { onError: (err) => Alert.alert(t(mapTaskError(err))) },
    );
  }

  return (
    <Screen
      scroll
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetch}
          tintColor={theme.inkTertiary}
        />
      }
    >
      <TopBar
        title={t("hw.title")}
        sub={t("hw.sub", {
          weekday: format(new Date(), "EEEE", { locale }),
          open: stats.open,
          done: stats.doneToday,
        })}
      />

      {isLoading ? (
        <View className="mt-10 items-center">
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : error ? (
        <Card className="items-start gap-2">
          <Text variant="bodyEmph">{t("hw.loadError")}</Text>
          <Text variant="caption" tone="inkSecondary">
            {t(mapTaskError(error))}
          </Text>
          <Button label={t("action.retry")} variant="soft" size="sm" onPress={refetch} />
        </Card>
      ) : (
        <>
          <View className="flex-row gap-2">
            {statTiles.map((s) => (
              <View key={s.label} className={`flex-1 rounded-2xl p-3 ${s.bg}`}>
                <Text variant="h2" style={{ color: s.tone, fontSize: 22 }}>
                  {s.n}
                </Text>
                <Text variant="caption" tone="inkSecondary" className="mt-0.5">
                  {s.label}
                </Text>
              </View>
            ))}
          </View>

          {groups.length === 0 ? (
            <Card className="mt-5 gap-1">
              <Text variant="bodyEmph">{t("hw.empty.title")}</Text>
              <Text variant="caption" tone="inkSecondary">
                {t("hw.empty.sub")}
              </Text>
            </Card>
          ) : (
            groups.map((group) => (
              <View key={group.key} className="mt-5">
                <Text variant="bodyEmph" className="mb-2">
                  {group.label}
                </Text>
                <View className="gap-2">
                  {group.items.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      child={task.child_id ? childById.get(task.child_id) : undefined}
                      urgent={group.urgent}
                      onToggle={() => handleToggle(task)}
                    />
                  ))}
                </View>
              </View>
            ))
          )}
        </>
      )}

      <Button label={t("hw.addVoice")} variant="soft" tone="accent" block className="mt-5" />
    </Screen>
  );
}
```

Die Fehler-Card zeigt **zwei** Zeilen: `hw.loadError` benennt die Operation, `mapTaskError` die Ursache. Genau die Arbeitsteilung, für die `mapTaskError` gebaut wurde — es klassifiziert die Ursache, der Titel darüber ist die Entscheidung des Screens.

- [ ] **Step 4: Toten Mock löschen**

```bash
rm features/sample-data/homework.ts
```

In `features/sample-data/index.ts` die Zeile `export * from "./homework";` entfernen.

In `features/sample-data/types.ts` die Interfaces `HomeworkItem` und `HomeworkByChild` entfernen.

- [ ] **Step 5: Prüfen, dass wirklich nichts mehr auf den Mock zeigt**

Run: `grep -rn "homeworkByChild\|homeworkStats\|HomeworkItem\|HomeworkByChild" --include="*.ts" --include="*.tsx" . | grep -v node_modules`

Expected: **keine Treffer.** Gibt es welche, gehören sie mitentfernt — der Typecheck im nächsten Step fängt sie sonst.

- [ ] **Step 6: Backlog pflegen**

In `docs/TODO.md`, Abschnitt `## Aufgaben / Tasks (Daten-Layer V1)`:

**Entfernen** — die Zeile, die mit `- **\`AufgabenScreen\` hängt weiter an \`sample-data\`\*\*` beginnt.

**Ergänzen** am Ende des Abschnitts:

```markdown
- **Aufgaben lassen sich nicht anlegen, bearbeiten oder löschen** ([app-sections/(tabs)/aufgaben/AufgabenScreen.tsx](<../app-sections/(tabs)/aufgaben/AufgabenScreen.tsx>)): Der Screen hakt ab, mehr nicht — `useCreateTask`, `useUpdateTask` und `useDeleteTask` sind verdrahtungsbereit, aber ungenutzt. Anlegen braucht ein Formular mit Typ-, Kind- und Datumsauswahl (`useTaskTypes` liefert die Typen), Bearbeiten und Löschen ein Detail-Sheet. Beides eigene Iterationen.
- **Task-Zeilen haben keine Erinnerungs-Aktion mehr** ([app-sections/(tabs)/aufgaben/TaskRow.tsx](<../app-sections/(tabs)/aufgaben/TaskRow.tsx>)): Das Glocken-Icon der alten Mock-Zeile ist entfallen, weil es dekorativ war. Die `reminders`-Tabelle kennt `task_id`, aber es gibt keinen Zusteller — kommt mit der Expo-Notifications-Iteration, zusammen mit den Event-Remindern.
- **Neue Aufgaben-Keys fehlen in `docs/COPY.md`** ([features/i18n/locales/de.json](../features/i18n/locales/de.json) + [en.json](../features/i18n/locales/en.json)): Neu sind `hw.loadError`, `hw.empty.title` und `hw.empty.sub`. **Geändert** ist `hw.sub`: der Wochentag stand als Literal im Katalog („Mittwoch · …") und wird jetzt als `{{weekday}}` interpoliert — mit echten Daten hätte dort dauerhaft Mittwoch gestanden. Vom Designer nachtragen, damit COPY.md Source of Truth bleibt (gleiche Baustelle wie `set.footer`, die Kalender-Keys und `hw.error.*`).
- **`patterns/homework.md` beschreibt einen V1/V2-Umschalter, den es nicht gibt** ([patterns/homework.md](../patterns/homework.md), Goal-Abschnitt: „browse by child or by status, switchable"): Der Screen rendert nur V2 (nach Fälligkeit). `useTasksByChild` liegt fertig im Layer und bedient V1 — es fehlt der zweite Renderpfad plus Segmented-Control und dessen Copy. Mit dem Designer abstimmen, bevor das gebaut wird.
```

- [ ] **Step 7: Volle Kette laufen lassen**

Run: `bun format:check && bun lint && bun run typecheck && bun test`

Expected: alle PASS. Schlägt `format:check` fehl: `bun format` laufen lassen und erneut prüfen. Lint muss **0 Fehler** melden — insbesondere darf `i18next/no-literal-string` im neuen JSX nicht anschlagen.

- [ ] **Step 8: Committen**

```bash
git add -A
git commit -m "feat(tasks): AufgabenScreen auf Live-Daten umstellen"
```

---

### Task 5: Verifikation und Review

**Files:** keine Änderungen erwartet — dieser Task ist das Gate.

- [ ] **Step 1: Volle CI-Kette lokal fahren**

Run: `bun format:check && bun lint && bun run typecheck && bun test`

Expected: alle vier PASS. `bun test` muss die 14 neuen Tests aus Task 1 (8) und Task 2 (6) enthalten.

- [ ] **Step 2: Web-Smoke-Build**

Run: `bunx expo export --platform web --output-dir /tmp/eltern-web`

Expected: Bundle wird ohne Fehler geschrieben. Hier besonders relevant, weil `date-fns/locale` ein neues Import-Muster ist und `RefreshControl` erstmals im Repo verwendet wird — beides muss unter react-native-web auflösen.

- [ ] **Step 3: Schichtgrenze prüfen**

Run: `grep -n "react-native" features/tasks/mutations.ts features/tasks/optimistic.ts features/tasks/errors.ts features/tasks/palette.ts features/tasks/stats.ts`

Expected: **keine Treffer.** Der Daten-Layer bleibt frei von UI-Abhängigkeiten; `queries.ts` ist ausgenommen (es nutzt `AppState` für den Mitternachts-Refresh).

- [ ] **Step 4: CodeRabbit-Review**

Run: `coderabbit review --base main --agent`

Erwartete Antwort: Findings durcharbeiten — jedes entweder beheben oder mit Begründung bewusst verwerfen. Behebungen bekommen eigene Commits (`fix(tasks): …`).

- [ ] **Step 5: Verifikation nach etwaigen Fixes wiederholen**

Nur nötig, wenn Step 4 zu Codeänderungen geführt hat.

Run: `bun format:check && bun lint && bun run typecheck && bun test`

Expected: alle PASS.

---

## Was dieser Plan bewusst **nicht** tut

- **Keine Tests für den Screen und `TaskRow`.** Es gibt keine verlässlich laufende RN-Komponenten-Testinfrastruktur: `bun test` fährt reine Funktionen, und der `jest-expo`-Pfad ist laut CLAUDE.md über SDK-Bumps hinweg wiederholt gebrochen. Verifiziert sind sie über Typecheck, Lint und den Web-Build — nicht über ihr Laufzeitverhalten. Deshalb liegt jede Regel, die eine Entscheidung trifft (Sektionszuordnung, Farbauflösung), in einer getesteten reinen Funktion und nicht im JSX.
- **Kein Typ-Label in der Zeile.** `patterns/homework.md` sieht in der V2-Zeile nur ein Subject-Pill vor. `task_types.label` ist jsonb mit ausschließlich `{"de": …}` — ein Label daraus stünde im englischen UI auf Deutsch. Der Typ steuert nur die Farbe.
- **Kein V1/V2-Umschalter**, kein Anlegen, kein Bearbeiten, keine Task-Reminder. Alles vier als Backlog-Einträge festgehalten.
