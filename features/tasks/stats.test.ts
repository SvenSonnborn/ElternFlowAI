import { describe, expect, test } from "bun:test";

import type { TaskWithType } from "./types";

import { computeTaskStats, groupTasksByChild } from "./stats";

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
