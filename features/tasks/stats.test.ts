import { describe, expect, test } from "bun:test";

import type { TaskWithType } from "./types";

import { computeTaskStats, groupTasksByChild, groupTasksByDue } from "./stats";

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

  test("inherits the due_time tiebreaker", () => {
    const groups = groupTasksByChild([
      makeTask({ id: "no-time", child_id: "child-1", due_date: "2026-07-29", due_time: null }),
      makeTask({ id: "timed", child_id: "child-1", due_date: "2026-07-29", due_time: "09:00:00" }),
    ]);

    expect(groups[0].tasks.map((t) => t.id)).toEqual(["timed", "no-time"]);
  });
});

/** Wednesday, 2026-07-29. ISO week: Mon 2026-07-27 … Sun 2026-08-02. */
const NOW = new Date(2026, 6, 29, 10, 0, 0);

/**
 * Local noon on a July 2026 day. A hardcoded UTC instant would land on a
 * different calendar day in far-eastern zones — at UTC+14, `…-07-29T12:00Z`
 * is already the 30th locally, which silently swaps the "today" and
 * "yesterday" fixtures below.
 */
function localNoon(day: number): Date {
  return new Date(2026, 6, day, 12, 0, 0);
}

function makeDone(id: string, completedAt: Date): TaskWithType {
  return makeTask({
    id,
    is_done: true,
    completed_at: completedAt.toISOString(),
    due_date: "2026-07-27",
  });
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
    // Two on the reference day, one the day before: a fixture that slipped a
    // calendar day would change the count, not just relabel it.
    const stats = computeTaskStats(
      [
        makeDone("today-morning", new Date(2026, 6, 29, 8, 0, 0)),
        makeDone("today-evening", new Date(2026, 6, 29, 20, 0, 0)),
        makeDone("yesterday", localNoon(28)),
      ],
      NOW,
    );

    expect(stats.doneToday).toBe(2);
    expect(stats.open).toBe(0);
  });

  test("donePct is done over done-plus-open within the running week", () => {
    const stats = computeTaskStats(
      [
        makeDone("d1", localNoon(28)),
        makeDone("d2", localNoon(29)),
        makeDone("d3", new Date(2026, 6, 29, 13, 0, 0)),
        makeTask({ id: "open-this-week", due_date: "2026-07-30" }),
      ],
      NOW,
    );

    expect(stats.donePct).toBe(75);
  });

  test("tasks completed before the running week do not raise donePct", () => {
    const stats = computeTaskStats(
      [
        makeDone("last-week", localNoon(24)),
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
      makeDone("done", localNoon(29)),
    ];

    expect(computeTaskStats(tasks, new Date(2026, 6, 29, 0, 0, 0))).toEqual(
      computeTaskStats(tasks, new Date(2026, 6, 29, 23, 59, 59)),
    );
  });
});

describe("groupTasksByDue", () => {
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
    const placed = [...sections.overdue, ...sections.today, ...sections.upcoming]
      .map((t) => t.id)
      .sort();

    expect(placed).toEqual(["far", "overdue", "today", "tomorrow"]);
  });

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
});
