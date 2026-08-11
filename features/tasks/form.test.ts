import { describe, expect, test } from "bun:test";

import type { TaskWithType } from "./types";

import {
  emptyTaskForm,
  hasTaskFormErrors,
  taskToForm,
  toCreateVars,
  toTaskChanges,
  validateTaskForm,
} from "./form";

function makeTask(overrides: Partial<TaskWithType> = {}): TaskWithType {
  return {
    id: "task-1",
    family_id: "fam-1",
    type_id: "type-1",
    child_id: "child-1",
    title: "Mathe Übungsblatt",
    description: "Seite 42",
    subject: "Mathe",
    due_date: "2026-08-14",
    due_time: "16:30:00",
    is_done: false,
    completed_at: null,
    completed_by: null,
    created_by: null,
    created_at: "2026-08-01T08:00:00.000Z",
    updated_at: "2026-08-01T08:00:00.000Z",
    task_types: null,
    ...overrides,
  };
}

/** A valid state, so each test can break exactly one thing. */
function validState() {
  return {
    ...emptyTaskForm(new Date(2026, 7, 11, 9, 0)),
    typeId: "type-1",
    title: "Vokabeln lernen",
  };
}

describe("validateTaskForm", () => {
  test("accepts a filled-in form", () => {
    const errors = validateTaskForm(validState());
    expect(errors).toEqual({});
    expect(hasTaskFormErrors(errors)).toBe(false);
  });

  test("flags an empty title", () => {
    expect(validateTaskForm({ ...validState(), title: "" }).title).toBe("hw.error.titleRequired");
  });

  test("flags a whitespace-only title", () => {
    expect(validateTaskForm({ ...validState(), title: "   " }).title).toBe(
      "hw.error.titleRequired",
    );
  });

  test("flags a missing type", () => {
    expect(validateTaskForm({ ...validState(), typeId: null }).typeId).toBe(
      "hw.error.typeRequired",
    );
  });

  test("flags an unparsable due date", () => {
    const errors = validateTaskForm({ ...validState(), dueDate: new Date("nonsense") });
    expect(errors.dueDate).toBe("hw.error.dateRequired");
    expect(hasTaskFormErrors(errors)).toBe(true);
  });
});

describe("taskToForm", () => {
  test("reads the due date as a local calendar day", () => {
    const form = taskToForm(makeTask({ due_date: "2026-08-14" }));
    expect(form.dueDate.getFullYear()).toBe(2026);
    expect(form.dueDate.getMonth()).toBe(7);
    expect(form.dueDate.getDate()).toBe(14);
  });

  test("reads the due time onto the due date", () => {
    const form = taskToForm(makeTask({ due_time: "16:30:00" }));
    expect(form.dueTime?.getHours()).toBe(16);
    expect(form.dueTime?.getMinutes()).toBe(30);
    expect(form.dueTime?.getDate()).toBe(14);
  });

  test("accepts a due time without seconds", () => {
    const form = taskToForm(makeTask({ due_time: "07:05" }));
    expect(form.dueTime?.getHours()).toBe(7);
    expect(form.dueTime?.getMinutes()).toBe(5);
  });

  test("maps a missing due time to null and null text columns to empty strings", () => {
    const form = taskToForm(makeTask({ due_time: null, subject: null, description: null }));
    expect(form.dueTime).toBeNull();
    expect(form.subject).toBe("");
    expect(form.notes).toBe("");
  });
});

describe("toCreateVars", () => {
  test("serialises the due date as a local yyyy-MM-dd", () => {
    const vars = toCreateVars({ ...validState(), dueDate: new Date(2026, 7, 14, 23, 30) });
    expect(vars?.dueDate).toBe("2026-08-14");
  });

  test("serialises a due time as HH:mm:ss and trims the title", () => {
    const vars = toCreateVars({
      ...validState(),
      title: "  Vokabeln lernen  ",
      dueTime: new Date(2026, 7, 14, 16, 30),
    });
    expect(vars?.title).toBe("Vokabeln lernen");
    expect(vars?.dueTime).toBe("16:30:00");
  });

  test("maps blank free-text fields to null", () => {
    const vars = toCreateVars({ ...validState(), subject: "   ", notes: "" });
    expect(vars?.subject).toBeNull();
    expect(vars?.description).toBeNull();
    expect(vars?.dueTime).toBeNull();
  });

  test("returns null for an invalid state", () => {
    expect(toCreateVars({ ...validState(), title: "" })).toBeNull();
    expect(toCreateVars({ ...validState(), typeId: null })).toBeNull();
  });
});

describe("toTaskChanges", () => {
  test("sends the full editable field set", () => {
    const changes = toTaskChanges({ ...validState(), childId: "child-1", subject: "Mathe" });
    expect(changes).toEqual({
      type_id: "type-1",
      child_id: "child-1",
      title: "Vokabeln lernen",
      subject: "Mathe",
      due_date: "2026-08-11",
      due_time: null,
      description: null,
    });
  });

  test("keeps a cleared child as null", () => {
    expect(toTaskChanges({ ...validState(), childId: null })?.child_id).toBeNull();
  });

  test("round-trips a task through the form unchanged", () => {
    const task = makeTask();
    const changes = toTaskChanges(taskToForm(task));
    expect(changes).toEqual({
      type_id: task.type_id,
      child_id: task.child_id,
      title: task.title,
      subject: task.subject,
      due_date: task.due_date,
      due_time: task.due_time,
      description: task.description,
    });
  });
});
