import { describe, expect, test } from "bun:test";

import type { DueFilter, TaskFilter } from "./filter";
import type { TaskWithType } from "./types";

import { CHILD_ALL, CHILD_NONE, DEFAULT_TASK_FILTER, filterTasks, isFiltered } from "./filter";
import { computeTaskStats } from "./stats";

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

describe("filterTasks · Drilldown-Treue zu computeTaskStats", () => {
  /**
   * `matchesDue` (hier) und `computeTaskStats` (stats.ts) schreiben ihre
   * `today`/`week`-Grenzen unabhängig voneinander hin — beide bauen
   * `startOfDay`/`endOfDay`/`endOfWeek(now, { weekStartsOn: 1 })` selbst auf.
   * Nichts zwingt sie, in Zukunft übereinzustimmen: würde z. B. `weekStartsOn`
   * nur in einer der beiden Dateien geändert oder `computeTaskStats` hörte auf,
   * Überfälliges in `dueToday` zu falten, bliebe jeder bestehende Test hier
   * grün — dieser Test würde als einziger rot, weil er die Chip-Zählung direkt
   * gegen die Kachel-Zählung prüft. Das ist das Versprechen des Designs: „Diese
   * Woche" antippen zeigt exakt die Zeilen, die die gleichnamige Kachel zählt.
   */
  test("'today'- und 'week'-Chip liefern exakt so viele Zeilen wie die gleichnamigen Stat-Kacheln", () => {
    const stats = computeTaskStats(SPREAD, NOW);

    expect(
      filterTasks(SPREAD, { ...DEFAULT_TASK_FILTER, status: "open", due: "week" }, NOW),
    ).toHaveLength(stats.thisWeek);
    expect(
      filterTasks(SPREAD, { ...DEFAULT_TASK_FILTER, status: "open", due: "today" }, NOW),
    ).toHaveLength(stats.dueToday);
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
