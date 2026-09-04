import { describe, expect, test } from "bun:test";

import type { TaskChanges } from "./optimistic";
import type { TaskWithType } from "./types";

import { differingTaskFields } from "./conflict";

function theirs(overrides: Partial<TaskWithType> = {}): TaskWithType {
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
    updated_at: "2026-06-01T00:00:00.000Z",
    task_types: null,
    ...overrides,
  };
}

function mine(overrides: Partial<TaskChanges> = {}): TaskChanges {
  return {
    title: "Mathe Seite 42",
    description: null,
    subject: "Mathe",
    due_date: "2026-06-15",
    due_time: null,
    child_id: null,
    type_id: "type-1",
    ...overrides,
  };
}

describe("differingTaskFields", () => {
  test("identische Fassungen ergeben keine Abweichung", () => {
    expect(differingTaskFields(theirs(), mine())).toEqual([]);
  });

  test("ein abweichender Titel", () => {
    expect(differingTaskFields(theirs(), mine({ title: "Mathe Seite 43" }))).toEqual(["title"]);
  });

  test("ein abweichendes Fälligkeitsdatum", () => {
    expect(differingTaskFields(theirs(), mine({ due_date: "2026-06-16" }))).toEqual(["due_date"]);
  });

  test("die Uhrzeit vergleicht HH:mm, nicht die Postgres-Schreibweise", () => {
    // Postgres rendert `time` als HH:mm:ss, ein Wert kann aber als HH:mm
    // ankommen — `parseDueTime` in form.ts akzeptiert deshalb beide.
    expect(
      differingTaskFields(theirs({ due_time: "16:30:00" }), mine({ due_time: "16:30" })),
    ).toEqual([]);
  });

  test("ein Wechsel des Kindes", () => {
    expect(differingTaskFields(theirs(), mine({ child_id: "child-2" }))).toEqual(["child_id"]);
  });

  test("leerer Text und null gelten als dasselbe", () => {
    expect(differingTaskFields(theirs({ subject: "" }), mine({ subject: null }))).toEqual([]);
  });

  test("mehrere Abweichungen kommen in fester Reihenfolge", () => {
    expect(differingTaskFields(theirs(), mine({ type_id: "type-2", title: "Neu" }))).toEqual([
      "title",
      "type_id",
    ]);
  });
});
