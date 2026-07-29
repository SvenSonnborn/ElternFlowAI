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
