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
    // dort steht. `base` trägt bewusst einen anderen Titel als `theirs`, damit
    // wirklich der `undefined`-Wächter greift (er kommt zuerst) und nicht nur
    // zufällig `base == theirs` das Ergebnis erklärt.
    expect(
      differingTaskFields(theirs(), mine({ title: undefined }), theirs({ title: "Fremd" })),
    ).toEqual([]);
  });

  test("undefined im type_id meldet ebenfalls keine Abweichung", () => {
    expect(
      differingTaskFields(theirs(), mine({ type_id: undefined }), theirs({ type_id: "type-9" })),
    ).toEqual([]);
  });

  test("undefined im Fach meldet keine Abweichung", () => {
    expect(
      differingTaskFields(theirs(), mine({ subject: undefined }), theirs({ subject: "Fremd" })),
    ).toEqual([]);
  });

  test("undefined in der Notiz meldet keine Abweichung", () => {
    // `theirs` trägt bewusst eine eigene (nicht-leere) Notiz statt des
    // `null`-Standards: `sameText` normalisiert `null` und `undefined` beide
    // zu `""`, ein `theirs`-Standard von `null` hätte den Wächter-Wegfall
    // nicht von einem echten Toleranzfall unterscheidbar gemacht.
    expect(
      differingTaskFields(
        theirs({ description: "Woanders notiert" }),
        mine({ description: undefined }),
        theirs({ description: "Fremd" }),
      ),
    ).toEqual([]);
  });

  test("undefined im Fälligkeitsdatum meldet keine Abweichung", () => {
    expect(
      differingTaskFields(
        theirs(),
        mine({ due_date: undefined }),
        theirs({ due_date: "2026-06-20" }),
      ),
    ).toEqual([]);
  });

  test("undefined in der Uhrzeit meldet keine Abweichung", () => {
    // Dieselbe Begründung wie bei der Notiz: `theirs` braucht eine
    // nicht-leere Uhrzeit, sonst normalisiert `sameTime` sie wie `undefined`
    // zu `""` und der Test unterscheidet nicht mehr, ob der Wächter greift.
    expect(
      differingTaskFields(
        theirs({ due_time: "16:00:00" }),
        mine({ due_time: undefined }),
        theirs({ due_time: "14:00:00" }),
      ),
    ).toEqual([]);
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

  test("ein fremd geändertes Fälligkeitsdatum ist ein Konflikt", () => {
    // Positive Erkennung für due_date: theirs weicht vom eingefrorenen `base`
    // ab, mein Formular trägt noch den alten Wert.
    const fremd = theirs({ due_date: "2026-06-20" });
    expect(differingTaskFields(fremd, mine(), theirs())).toEqual(["due_date"]);
  });

  test("ein fremder Kind-Wechsel ist ein Konflikt", () => {
    // Positive Erkennung für child_id — der einzige Fremdschlüssel-Vergleich,
    // der nicht über `sameText` läuft, sondern roh über `??`.
    const fremd = theirs({ child_id: "child-9" });
    expect(differingTaskFields(fremd, mine(), theirs())).toEqual(["child_id"]);
  });

  test("eine fremd geänderte Notiz ist ein Konflikt", () => {
    // Positive Erkennung für description — vorbestehende Lücke (weder
    // `81ce04a` noch `2a05966` hatten dafür einen Test), hier geschlossen.
    const fremd = theirs({ description: "Bitte Taschenrechner mitbringen" });
    expect(differingTaskFields(fremd, mine(), theirs())).toEqual(["description"]);
  });

  test("eine fremd geänderte Uhrzeit ist ein Konflikt", () => {
    // Positive Erkennung für due_time — dieselbe vorbestehende Lücke wie bei
    // description, hier geschlossen.
    const fremd = theirs({ due_time: "14:00:00" });
    expect(differingTaskFields(fremd, mine(), theirs())).toEqual(["due_time"]);
  });

  test("undefined im child_id meldet keine Abweichung, obwohl theirs von base abweicht", () => {
    // `child_id` ist der einzige der sieben Felder, dessen `undefined`-Wächter
    // nicht redundant zu einem Toleranz-Helfer ist: `sameText`/`sameTime`
    // fangen ihr eigenes `undefined` intern ab, der rohe `??`-Vergleich von
    // `child_id` nicht — ohne `mine.child_id !== undefined` als eigene erste
    // Bedingung meldete ein nicht geschriebenes `child_id` hier fälschlich
    // einen Konflikt.
    const fremd = theirs({ child_id: "child-5" });
    expect(differingTaskFields(fremd, mine({ child_id: undefined }), theirs())).toEqual([]);
  });
});
