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

  test("an unknown id returns the very same array instance", () => {
    const tasks = [makeTask({ id: "a" })];
    const result = applyToggle(tasks, "nope", true, DONE_AT, "parent-1");

    // toBe, not toEqual: React Query skips a re-render only when the reference
    // is unchanged, so identity is the contract here — not deep equality.
    expect(result).toBe(tasks);
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

  test("an unknown id returns the very same array instance", () => {
    const tasks = [makeTask({ id: "a" })];

    expect(applyUpdate(tasks, "nope", { title: "Neu" })).toBe(tasks);
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

  test("an unknown id returns the very same array instance", () => {
    const tasks = [makeTask({ id: "a" })];

    expect(applyDelete(tasks, "nope")).toBe(tasks);
  });

  test("does not mutate the input array", () => {
    const tasks = [makeTask({ id: "a" }), makeTask({ id: "b" })];
    applyDelete(tasks, "a");

    expect(tasks).toHaveLength(2);
  });
});
