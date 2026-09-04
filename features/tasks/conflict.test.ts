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
    expect(differingTaskFields(theirs(), mine(), theirs())).toEqual([]);
  });

  test("ein abweichender Titel ohne fremde Änderung ist meine eigene Bearbeitung", () => {
    // base == theirs (unverändert): Niemand sonst hat den Titel angefasst,
    // der Unterschied zu `mine` ist ausschließlich meine eigene Eingabe —
    // unter der Drei-Wege-Regel kein Konflikt.
    expect(differingTaskFields(theirs(), mine({ title: "Mathe Seite 43" }), theirs())).toEqual([]);
  });

  test("ein abweichendes Fälligkeitsdatum ohne fremde Änderung ist meine eigene Bearbeitung", () => {
    expect(differingTaskFields(theirs(), mine({ due_date: "2026-06-16" }), theirs())).toEqual([]);
  });

  test("die Uhrzeit vergleicht HH:mm, nicht die Postgres-Schreibweise", () => {
    // Postgres rendert `time` als HH:mm:ss, ein Wert kann aber als HH:mm
    // ankommen — `parseDueTime` in form.ts akzeptiert deshalb beide.
    expect(
      differingTaskFields(theirs({ due_time: "16:30:00" }), mine({ due_time: "16:30" }), theirs()),
    ).toEqual([]);
  });

  test("ein Wechsel des Kindes ohne fremde Änderung ist meine eigene Bearbeitung", () => {
    expect(differingTaskFields(theirs(), mine({ child_id: "child-2" }), theirs())).toEqual([]);
  });

  test("leerer Text und null gelten als dasselbe", () => {
    expect(differingTaskFields(theirs({ subject: "" }), mine({ subject: null }), theirs())).toEqual(
      [],
    );
  });

  test("mehrere fremd geänderte Felder kommen in fester Reihenfolge", () => {
    // Zwei echte Konflikte (theirs weicht von base ab, mein Formular trägt
    // noch die alten Werte) — die Liste muss der Prüfreihenfolge im Code
    // folgen (title → subject → description → due_date → due_time →
    // child_id → type_id).
    const fremd = theirs({ type_id: "type-2", title: "Neu" });
    expect(differingTaskFields(fremd, mine(), theirs())).toEqual(["title", "type_id"]);
  });

  test("undefined im Titel meldet keine Abweichung — die Spalte wird nicht geschrieben", () => {
    // Reproduziert den vorher falsch anschlagenden Fall: `mine.title` fehlt
    // im Update, kann also nicht mit `theirs.title` kollidieren, egal was
    // dort steht.
    expect(differingTaskFields(theirs(), mine({ title: undefined }), theirs())).toEqual([]);
  });

  test("undefined im type_id meldet ebenfalls keine Abweichung", () => {
    expect(differingTaskFields(theirs(), mine({ type_id: undefined }), theirs())).toEqual([]);
  });
});

describe("differingTaskFields — Drei-Wege", () => {
  test("die eigene Änderung ist kein Konflikt", () => {
    // base == theirs: niemand sonst hat den Titel angefasst.
    expect(differingTaskFields(theirs(), mine({ title: "Neu" }), theirs())).toEqual([]);
  });

  test("ein fremd geändertes Feld, das ich zurückdrehen würde, ist einer", () => {
    // Ich habe das Fach nicht angefasst — aber mein Formular trägt den alten
    // Wert, und Speichern würde die fremde Änderung verwerfen. Der Fall aus
    // Schritt 8 der Zwei-Client-Verifikation.
    const fremd = theirs({ subject: "Deutsch" });
    expect(differingTaskFields(fremd, mine(), theirs())).toEqual(["subject"]);
  });

  test("beide Seiten haben dasselbe Feld verschieden geändert", () => {
    const fremd = theirs({ type_id: "type-2" });
    expect(differingTaskFields(fremd, mine({ type_id: "type-3" }), theirs())).toEqual(["type_id"]);
  });

  test("beide Seiten haben dasselbe Feld gleich geändert — kein Konflikt", () => {
    const fremd = theirs({ type_id: "type-2" });
    expect(differingTaskFields(fremd, mine({ type_id: "type-2" }), theirs())).toEqual([]);
  });

  test("meine Änderung und eine fremde an einem anderen Feld: nur das fremde", () => {
    const fremd = theirs({ subject: "Deutsch" });
    expect(differingTaskFields(fremd, mine({ title: "Neu" }), theirs())).toEqual(["subject"]);
  });
});
