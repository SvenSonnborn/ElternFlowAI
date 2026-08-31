import { describe, expect, test } from "bun:test";

import type { TaskWithType } from "./types";

import { withoutPendingTaskDeletes } from "./pendingDeletes";

function task(id: string = "task-1"): TaskWithType {
  return {
    id,
    family_id: "family-1",
    title: "Test Task",
    description: null,
    subject: null,
    due_date: "2026-09-10",
    due_time: null,
    is_done: false,
    completed_at: null,
    completed_by: null,
    type_id: "type-1",
    child_id: null,
    created_by: null,
    created_at: "2026-08-31T00:00:00Z",
    updated_at: "2026-08-31T00:00:00Z",
    task_types: null,
  };
}

describe("withoutPendingTaskDeletes", () => {
  test("bei leeren pendingIds kommt dieselbe Array-Referenz zurück", () => {
    const input = [task("task-1"), task("task-2"), task("task-3")];
    const result = withoutPendingTaskDeletes(input, new Set());
    expect(result).toBe(input);
  });

  test("eine passende Id entfernt genau diese Aufgabe", () => {
    const input = [task("task-1"), task("task-2"), task("task-3")];
    const result = withoutPendingTaskDeletes(input, new Set(["task-2"]));
    expect(result).toEqual([task("task-1"), task("task-3")]);
  });

  test("eine Id, die nicht in der Liste vorkommt, ändert nichts", () => {
    const input = [task("task-1"), task("task-2"), task("task-3")];
    const result = withoutPendingTaskDeletes(input, new Set(["task-99"]));
    expect(result).toEqual(input);
  });
});
