# Aufgaben anlegen und bearbeiten — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nutzer können Tasks über zwei neue Formular-Screens anlegen, bearbeiten und löschen.

**Architecture:** Reine Form-Logik (Validierung, Serialisierung) liegt getestet in `features/tasks/form.ts`. Zwei dünne Screens unter `app-sections/task/` teilen sich eine zustandslose `TaskForm`-Komponente und rufen die bestehenden Mutations. Drei Formular-Bausteine ziehen von `app-sections/event/` nach `app-sections/shared/`, damit beide Features sie nutzen, ohne sich gegenseitig zu importieren; der Datums-Picker bekommt dabei eine Web-Implementierung als Plattform-Datei.

**Tech Stack:** Expo Router 57 (typed routes), React 19.2, TypeScript 6 strict, TanStack Query, react-i18next, date-fns 4.4, NativeWind v4, `bun test` (Buns Runner, `bun:test`-Importe).

**Spec:** [docs/superpowers/specs/2026-08-11-tasks-create-edit-design.md](../specs/2026-08-11-tasks-create-edit-design.md)

## Global Constraints

- **Handoff-Bundle ist tabu.** `design-system/{colors,typography,spacing,themes,components,index}.ts`, `docs/{HANDOFF,COPY,ICONS,README}.md` und `patterns/*.md` werden **nicht** editiert. Fehlende Copy geht als TODO-Eintrag an den Designer.
- **Alle UI-Strings über i18n.** Keine Literale im JSX. DE ist kanonisch, EN spiegelt. Immer Du-Form, nie Sie.
- **Touch-Targets ≥ 44×44.**
- **Routing-Konvention:** Dateien unter `app/` sind Ein-Zeilen-Re-Exports; die Implementierung lebt in `app-sections/`.
- **Commits:** Conventional-Commits-Präfix mit Scope, **niemals** ein `Co-Authored-By: Claude`-Trailer, **niemals** `--no-verify`.
- **Datumsformate:** `due_date` ist Postgres `date` → `yyyy-MM-dd`, immer lokal formatiert, nie `toISOString()`. `due_time` ist Postgres `time` → `HH:mm:ss`. Datumsstrings werden mit `parseISO` gelesen, nie mit `new Date(string)`.
- **Fehler-Keys statt Fehlertexte** aus der Feature-Schicht: `features/tasks` gibt i18n-Keys zurück (`mapTaskError`-Muster), der Screen übersetzt.
- **Verifikation vor jedem Commit:** `bun run typecheck` und `bun lint` müssen grün sein.

---

## File Structure

**Neu:**

| Datei                                              | Verantwortung                                                                      |
| -------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `features/tasks/form.ts`                           | Reine Form-Helfer: State-Shape, Validierung, Serialisierung in Mutations-Argumente |
| `features/tasks/form.test.ts`                      | Tests dazu                                                                         |
| `app-sections/shared/DateTimePickerSheet.types.ts` | Props-Typ, den beide Plattform-Dateien teilen                                      |
| `app-sections/shared/DateTimePickerSheet.tsx`      | Picker für iOS/Android (aus `app-sections/event/` übernommen, entkoppelt)          |
| `app-sections/shared/DateTimePickerSheet.web.tsx`  | Picker für Web (`<input type="date"/"time">`)                                      |
| `app-sections/shared/TypePicker.tsx`               | Typ-Pills, generisch über `{id,label,color}`                                       |
| `app-sections/shared/MemberPicker.tsx`             | Personen-Auswahl (aus `app-sections/event/` verschoben)                            |
| `app-sections/shared/confirmDialog.ts`             | Plattform-bewusste Ja/Nein-Rückfrage                                               |
| `app-sections/task/TaskForm.tsx`                   | Alle Formularfelder, zustandslos bis auf „welcher Picker ist offen"                |
| `app-sections/task/TaskCreateScreen.tsx`           | Defaults + `useCreateTask`                                                         |
| `app-sections/task/TaskEditScreen.tsx`             | Hydration + `useUpdateTask` + `useDeleteTask`                                      |
| `app/task/new.tsx`                                 | Route → `TaskCreateScreen`                                                         |
| `app/task/edit/[id].tsx`                           | Route → `TaskEditScreen`                                                           |

**Geändert:** `features/tasks/{palette.ts,palette.test.ts,queries.ts,index.ts}`, `features/i18n/locales/{de,en}.json`, `app/_layout.tsx`, `app-sections/event/{EventCreateScreen,EventEditScreen}.tsx`, `app-sections/shared/index.ts`, `app-sections/(tabs)/aufgaben/{AufgabenScreen,TaskRow}.tsx`, `docs/{TODO.md,decision-log.md}`, `CLAUDE.md`.

**Gelöscht:** `app-sections/event/{DateTimePickerSheet,TypePicker,MemberPicker}.tsx`.

---

### Task 1: Form-Helfer und Typ-Label-Key

**Files:**

- Create: `features/tasks/form.ts`
- Create: `features/tasks/form.test.ts`
- Modify: `features/tasks/palette.ts` (Funktion `taskTypeLabelKey` anhängen)
- Modify: `features/tasks/palette.test.ts` (Tests anhängen)
- Modify: `features/tasks/index.ts` (Barrel-Exporte)

**Interfaces:**

- Consumes: `CreateTaskVars` aus `./mutations`, `TaskChanges` aus `./optimistic`, `TaskWithType` aus `./types`.
- Produces: `TaskFormState`, `TaskFormErrors`, `TaskFormErrorKey`, `emptyTaskForm(now: Date): TaskFormState`, `taskToForm(task: TaskWithType): TaskFormState`, `validateTaskForm(state): TaskFormErrors`, `hasTaskFormErrors(errors): boolean`, `toCreateVars(state): CreateTaskVars | null`, `toTaskChanges(state): TaskChanges | null`, `taskTypeLabelKey(slug: string): string`.

- [ ] **Step 1: Testdatei schreiben**

Create `features/tasks/form.test.ts`:

```ts
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
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `bun test features/tasks/form.test.ts`
Expected: FAIL — `Cannot find module './form'`.

- [ ] **Step 3: `features/tasks/form.ts` schreiben**

```ts
import { format, isValid, parse, parseISO } from "date-fns";

import type { CreateTaskVars } from "./mutations";
import type { TaskChanges } from "./optimistic";
import type { TaskWithType } from "./types";

/** Postgres `date`. */
const DATE_FORMAT = "yyyy-MM-dd";
/** Postgres `time`. */
const TIME_FORMAT = "HH:mm:ss";

/**
 * The editable shape of a task, as the create and edit forms hold it. Dates
 * live as `Date` here and only become strings on the way to the mutation —
 * the pickers speak `Date`, and one conversion point is easier to keep honest
 * than one per field.
 */
export interface TaskFormState {
  typeId: string | null;
  childId: string | null;
  title: string;
  subject: string;
  dueDate: Date;
  /** `null` means "no finer deadline than the day". */
  dueTime: Date | null;
  notes: string;
}

export type TaskFormErrorKey =
  | "hw.error.titleRequired"
  | "hw.error.typeRequired"
  | "hw.error.dateRequired";

export interface TaskFormErrors {
  title?: TaskFormErrorKey;
  typeId?: TaskFormErrorKey;
  dueDate?: TaskFormErrorKey;
}

export function emptyTaskForm(now: Date): TaskFormState {
  return {
    typeId: null,
    childId: null,
    title: "",
    subject: "",
    dueDate: now,
    dueTime: null,
    notes: "",
  };
}

/**
 * `due_time` is a bare Postgres `time` — no day, no zone. It is parsed against
 * the task's own due date so the resulting Date sits on the day the time
 * belongs to; only the clock part is ever read back out.
 */
function parseDueTime(value: string | null, reference: Date): Date | null {
  if (!value) return null;
  const base = isValid(reference) ? reference : new Date();
  // Postgres renders `time` as HH:mm:ss, but a value written as HH:mm reaches
  // the client unchanged, so both spellings are accepted.
  for (const pattern of [TIME_FORMAT, "HH:mm"]) {
    const parsed = parse(value, pattern, base);
    if (isValid(parsed)) return parsed;
  }
  return null;
}

export function taskToForm(task: TaskWithType): TaskFormState {
  // parseISO, never new Date(): `due_date` is a Postgres `date`, and
  // new Date("2026-08-14") would read UTC midnight and shift the day.
  const dueDate = parseISO(task.due_date);
  return {
    typeId: task.type_id,
    childId: task.child_id,
    title: task.title,
    subject: task.subject ?? "",
    dueDate,
    dueTime: parseDueTime(task.due_time, dueDate),
    notes: task.description ?? "",
  };
}

/**
 * Returns i18n keys, not sentences — the layer classifies, the screen
 * translates. Same split as `mapTaskError`.
 */
export function validateTaskForm(state: TaskFormState): TaskFormErrors {
  const errors: TaskFormErrors = {};
  if (!state.title.trim()) errors.title = "hw.error.titleRequired";
  if (!state.typeId) errors.typeId = "hw.error.typeRequired";
  // The picker cannot clear the date, so this only fires for a row whose
  // stored `due_date` did not parse — without the guard it would reach
  // `format()` as an Invalid Date and throw.
  if (!isValid(state.dueDate)) errors.dueDate = "hw.error.dateRequired";
  return errors;
}

export function hasTaskFormErrors(errors: TaskFormErrors): boolean {
  return Object.keys(errors).length > 0;
}

/** Local formatting on purpose: `toISOString()` would move a late-evening due date to the previous day. */
function toDueDate(value: Date): string {
  return format(value, DATE_FORMAT);
}

function toDueTime(value: Date | null): string | null {
  return value ? format(value, TIME_FORMAT) : null;
}

/**
 * `null` when the state does not validate. The screens guard on
 * `validateTaskForm` first; this is the type-level backstop that keeps a
 * missing type id out of an insert the NOT NULL constraint would reject.
 */
export function toCreateVars(state: TaskFormState): CreateTaskVars | null {
  if (!state.typeId || hasTaskFormErrors(validateTaskForm(state))) return null;
  return {
    typeId: state.typeId,
    title: state.title.trim(),
    dueDate: toDueDate(state.dueDate),
    childId: state.childId,
    description: state.notes.trim() || null,
    subject: state.subject.trim() || null,
    dueTime: toDueTime(state.dueTime),
  };
}

/**
 * The full editable field set, not a diff. `applyUpdate` merges anyway, and
 * the set is small enough that a complete UPDATE costs nothing — a diff would
 * only add a way to get it wrong.
 */
export function toTaskChanges(state: TaskFormState): TaskChanges | null {
  if (!state.typeId || hasTaskFormErrors(validateTaskForm(state))) return null;
  return {
    type_id: state.typeId,
    child_id: state.childId,
    title: state.title.trim(),
    subject: state.subject.trim() || null,
    due_date: toDueDate(state.dueDate),
    due_time: toDueTime(state.dueTime),
    description: state.notes.trim() || null,
  };
}
```

- [ ] **Step 4: Test laufen lassen, grün bestätigen**

Run: `bun test features/tasks/form.test.ts`
Expected: PASS, alle Tests.

- [ ] **Step 5: Test für `taskTypeLabelKey` schreiben**

An `features/tasks/palette.test.ts` anhängen (den bestehenden Import um `taskTypeLabelKey` erweitern):

```ts
describe("taskTypeLabelKey", () => {
  test("builds a catalog key from a slug", () => {
    expect(taskTypeLabelKey("hausaufgaben")).toBe("hw.type.hausaufgaben");
    expect(taskTypeLabelKey("besorgung")).toBe("hw.type.besorgung");
  });

  test("camel-cases a hyphenated slug", () => {
    expect(taskTypeLabelKey("eltern-aufgabe")).toBe("hw.type.elternAufgabe");
  });
});
```

- [ ] **Step 6: Test laufen lassen, Fehlschlag bestätigen**

Run: `bun test features/tasks/palette.test.ts`
Expected: FAIL — `taskTypeLabelKey is not a function` bzw. Import-Fehler.

- [ ] **Step 7: `taskTypeLabelKey` implementieren**

An `features/tasks/palette.ts` anhängen:

```ts
/**
 * The catalog key for a task type's label. `task_types.label` is jsonb seeded
 * with German only (`20260529091455_type_lookups.sql`), so a label read from
 * there would show up in German inside the English UI — the catalogs own this
 * copy, exactly as `typeLabelsForSlug` does for the calendar.
 *
 * Hyphenated slugs become camelCase so the key path stays a plain identifier.
 */
export function taskTypeLabelKey(slug: string): string {
  const camel = slug.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
  return `hw.type.${camel}`;
}
```

- [ ] **Step 8: Test laufen lassen, grün bestätigen**

Run: `bun test features/tasks/`
Expected: PASS, alle Suiten der Tasks-Schicht.

- [ ] **Step 9: Barrel erweitern**

In `features/tasks/index.ts` ergänzen (alphabetisch einsortiert wie die bestehenden Blöcke):

```ts
export {
  emptyTaskForm,
  hasTaskFormErrors,
  taskToForm,
  toCreateVars,
  toTaskChanges,
  validateTaskForm,
  type TaskFormErrorKey,
  type TaskFormErrors,
  type TaskFormState,
} from "./form";
export { taskTypeColorFor, taskTypeLabelKey } from "./palette";
```

(Die bestehende `export { taskTypeColorFor } from "./palette";`-Zeile wird durch die obige ersetzt, nicht dupliziert.)

- [ ] **Step 10: Verifizieren und committen**

```bash
bun run typecheck && bun lint && bun test features/tasks/
git add features/tasks/
git commit -m "feat(tasks): Form-Helfer für Validierung und Serialisierung"
```

---

### Task 2: i18n-Keys für die Formulare

**Files:**

- Modify: `features/i18n/locales/de.json` (Block `hw`)
- Modify: `features/i18n/locales/en.json` (Block `hw`)

**Interfaces:**

- Produces: die Keys, die Tasks 6–9 verwenden. Kein Code.

- [ ] **Step 1: DE-Keys ergänzen**

In `features/i18n/locales/de.json`, im bestehenden `"hw"`-Objekt. `add` neben `addVoice`, dann die neuen Unterobjekte; der bestehende `error`-Block wird um drei Keys erweitert, nicht ersetzt:

```json
"add": "Neue Aufgabe",
"notFound": "Aufgabe nicht gefunden",
"create": {
  "title": "Aufgabe hinzufügen",
  "save": "Hinzufügen",
  "saving": "Speichere…"
},
"edit": {
  "title": "Aufgabe bearbeiten",
  "save": "Speichern",
  "saving": "Speichere…"
},
"form": {
  "fieldType": "Typ",
  "fieldChild": "Kind",
  "noChild": "Ohne Kind",
  "fieldTitle": "Titel",
  "fieldSubject": "Fach",
  "fieldDue": "Fällig am",
  "fieldDueTime": "Uhrzeit",
  "clearTime": "Uhrzeit entfernen",
  "fieldNotes": "Notizen"
},
"delete": {
  "confirmTitle": "Aufgabe löschen?",
  "confirmBody": "Diese Aktion kann nicht rückgängig gemacht werden.",
  "confirmOk": "Löschen",
  "deleting": "Lösche…",
  "error": "Löschen fehlgeschlagen"
},
"type": {
  "hausaufgaben": "Hausaufgaben",
  "besorgung": "Besorgung",
  "elternAufgabe": "Eltern-Aufgabe"
},
"error": {
  "notAuthenticated": "Bitte erneut anmelden.",
  "staleReference": "Kind oder Aufgabentyp existiert nicht mehr.",
  "network": "Verbindung fehlgeschlagen. Bitte später erneut versuchen.",
  "generic": "Etwas ist schiefgelaufen. Bitte später erneut versuchen.",
  "titleRequired": "Bitte einen Titel eingeben",
  "typeRequired": "Bitte einen Typ wählen",
  "dateRequired": "Bitte ein Fälligkeitsdatum wählen"
}
```

- [ ] **Step 2: EN-Keys ergänzen**

Analog in `features/i18n/locales/en.json`:

```json
"add": "New task",
"notFound": "Task not found",
"create": {
  "title": "Add task",
  "save": "Add",
  "saving": "Saving…"
},
"edit": {
  "title": "Edit task",
  "save": "Save",
  "saving": "Saving…"
},
"form": {
  "fieldType": "Type",
  "fieldChild": "Child",
  "noChild": "No child",
  "fieldTitle": "Title",
  "fieldSubject": "Subject",
  "fieldDue": "Due date",
  "fieldDueTime": "Time",
  "clearTime": "Remove time",
  "fieldNotes": "Notes"
},
"delete": {
  "confirmTitle": "Delete task?",
  "confirmBody": "This cannot be undone.",
  "confirmOk": "Delete",
  "deleting": "Deleting…",
  "error": "Delete failed"
},
"type": {
  "hausaufgaben": "Homework",
  "besorgung": "Errand",
  "elternAufgabe": "Parent task"
},
"error": {
  "notAuthenticated": "Please sign in again.",
  "staleReference": "That child or task type no longer exists.",
  "network": "Connection failed. Please try again later.",
  "generic": "Something went wrong. Please try again later.",
  "titleRequired": "Please enter a title",
  "typeRequired": "Please pick a type",
  "dateRequired": "Please pick a due date"
}
```

- [ ] **Step 3: Key-Parität prüfen**

```bash
bun -e '
const de = await Bun.file("features/i18n/locales/de.json").json();
const en = await Bun.file("features/i18n/locales/en.json").json();
const flat = (obj, prefix = "") =>
  Object.entries(obj).flatMap(([k, v]) =>
    v !== null && typeof v === "object" ? flat(v, prefix + k + ".") : [prefix + k],
  );
const a = new Set(flat(de.hw));
const b = new Set(flat(en.hw));
const diff = [...a].filter((k) => !b.has(k)).concat([...b].filter((k) => !a.has(k)));
console.log(diff.length === 0 ? "hw keys in sync" : "MISMATCH: " + diff.join(", "));
'
```

Expected: `hw keys in sync`.

- [ ] **Step 4: Committen**

```bash
bun format:check || bun format
git add features/i18n/locales/
git commit -m "feat(tasks): i18n-Keys für Aufgaben-Formular und Löschdialog"
```

---

### Task 3: `DateTimePickerSheet` nach `shared/`, ohne Kalender-Kopplung

**Files:**

- Create: `app-sections/shared/DateTimePickerSheet.types.ts`
- Create: `app-sections/shared/DateTimePickerSheet.tsx`
- Delete: `app-sections/event/DateTimePickerSheet.tsx`
- Modify: `app-sections/shared/index.ts`
- Modify: `app-sections/event/EventCreateScreen.tsx` (Import + Render-Stelle)
- Modify: `app-sections/event/EventEditScreen.tsx` (Import + Render-Stelle)

**Interfaces:**

- Produces: `DateTimePickerMode = "date" | "time"`, `DateTimePickerSheetProps { mode: DateTimePickerMode | null; value: Date; onPick: (selected: Date) => void; onClose: () => void }`, Komponente `DateTimePickerSheet`.

- [ ] **Step 1: Props-Typ in eigene Datei**

Create `app-sections/shared/DateTimePickerSheet.types.ts`:

```ts
export type DateTimePickerMode = "date" | "time";

export interface DateTimePickerSheetProps {
  /** `null` renders nothing — the caller's "no picker open" state. */
  mode: DateTimePickerMode | null;
  /** The value the picker opens on. */
  value: Date;
  onPick: (selected: Date) => void;
  onClose: () => void;
}
```

Eigene Datei, weil `DateTimePickerSheet.web.tsx` denselben Typ braucht: Ein Import aus `./DateTimePickerSheet` würde auf Web auf die Web-Datei selbst auflösen.

- [ ] **Step 2: Native Implementierung anlegen**

Create `app-sections/shared/DateTimePickerSheet.tsx` — inhaltlich die bisherige Datei, nur ohne `DateRange`/`RangeField`:

```tsx
import DateTimePicker from "@react-native-community/datetimepicker";
import { useTranslation } from "react-i18next";
import { Modal, Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { DateTimePickerSheetProps } from "./DateTimePickerSheet.types";

import { useTheme } from "@/design-system/ThemeProvider";
import { Button } from "@/design-system/ui";

/**
 * Platform-native date/time picker: a bottom sheet on iOS, the system dialog
 * on Android, a `<input type="date">` on web (see the .web.tsx sibling).
 *
 * It knows nothing about what the value means — a range's start, a task's due
 * date. The caller maps its own state onto `mode` + `value`.
 */
export function DateTimePickerSheet({ mode, value, onPick, onClose }: DateTimePickerSheetProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const isDateMode = mode === "date";

  const onChange = (event: { type: string }, selected?: Date) => {
    if (!mode) return;
    if (Platform.OS === "android") onClose();
    if (event.type === "dismissed" || !selected) {
      if (Platform.OS === "ios") onClose();
      return;
    }
    onPick(selected);
    // The inline iOS calendar has no confirm affordance of its own, so picking
    // a date closes the sheet. The time spinners stay open until "Fertig".
    if (Platform.OS === "ios" && isDateMode) onClose();
  };

  if (Platform.OS !== "ios") {
    if (!mode) return null;
    return (
      <DateTimePicker
        value={value}
        mode={isDateMode ? "date" : "time"}
        display="default"
        onChange={onChange}
      />
    );
  }

  return (
    <Modal visible={mode !== null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: theme.overlay, justifyContent: "flex-end" }}
        onPress={onClose}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: theme.card,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: 16 + insets.bottom,
          }}
        >
          <View style={{ alignItems: "center", marginBottom: 8 }}>
            <View
              style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: theme.lineStrong }}
            />
          </View>
          {mode ? (
            <DateTimePicker
              value={value}
              mode={mode}
              display={isDateMode ? "inline" : "spinner"}
              onChange={onChange}
              themeVariant={theme.card === "#FFFFFF" ? "light" : "dark"}
            />
          ) : null}
          <View style={{ marginTop: 8 }}>
            <Button block label={t("action.done")} tone="primary" onPress={onClose} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
```

- [ ] **Step 3: Alte Datei löschen und Barrel erweitern**

```bash
git rm app-sections/event/DateTimePickerSheet.tsx
```

In `app-sections/shared/index.ts` ergänzen (alphabetisch):

```ts
export { DateTimePickerSheet } from "./DateTimePickerSheet";
export type { DateTimePickerMode, DateTimePickerSheetProps } from "./DateTimePickerSheet.types";
```

- [ ] **Step 4: `EventCreateScreen` umstellen**

Import ersetzen — `import { DateTimePickerSheet } from "./DateTimePickerSheet";` entfällt, stattdessen wandert `DateTimePickerSheet` in den bestehenden `@/app-sections/shared`-Import:

```tsx
import { DateTimePickerSheet, Field, Icon } from "@/app-sections/shared";
```

Vor dem `return` die Zuordnung von Range-Feld auf Picker ergänzen:

```tsx
// The sheet is range-agnostic now: which end of the range is being edited is
// calendar knowledge and stays here.
const pickerMode = picker === null ? null : picker.endsWith("Date") ? "date" : "time";
const pickerValue = picker === "endDate" || picker === "endTime" ? endAt : startAt;
```

Und die Render-Stelle am Dateiende:

```tsx
<DateTimePickerSheet
  mode={pickerMode}
  value={pickerValue}
  onPick={(selected) => {
    if (picker) setRange((prev) => applyRangePick(prev, picker, selected));
  }}
  onClose={() => setPicker(null)}
/>
```

- [ ] **Step 5: `EventEditScreen` umstellen**

Identisch: Import auf `import { DateTimePickerSheet, Field } from "@/app-sections/shared";`, dieselben zwei `pickerMode`/`pickerValue`-Zeilen vor dem `return`, dieselbe Render-Stelle.

- [ ] **Step 6: Verifizieren und committen**

```bash
bun run typecheck && bun lint && bun test
git add -A app-sections/
git commit -m "refactor(forms): DateTimePickerSheet nach shared, ohne Kalender-Typen"
```

Expected: typecheck und lint grün, Tests unverändert grün (keine Testdatei betroffen).

---

### Task 4: Web-Implementierung des Pickers

**Files:**

- Create: `app-sections/shared/DateTimePickerSheet.web.tsx`

**Interfaces:**

- Consumes: `DateTimePickerSheetProps` aus Task 3.
- Produces: dieselbe Komponente unter demselben Namen; Metro wählt sie auf Web automatisch.

- [ ] **Step 1: Web-Datei schreiben**

```tsx
import { format, isValid, parse } from "date-fns";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, View } from "react-native";

import type { DateTimePickerSheetProps } from "./DateTimePickerSheet.types";

import { useTheme } from "@/design-system/ThemeProvider";
import { Button } from "@/design-system/ui";

/**
 * Web counterpart of DateTimePickerSheet. `@react-native-community/datetimepicker`
 * has no web implementation — rendering it there opens nothing and floods the
 * console with "Maximum update depth exceeded" — so this file takes over on web
 * and the native module never enters the web bundle at all.
 *
 * Raw `<input>` is legitimate here: on web the renderer is react-dom.
 */
export function DateTimePickerSheet({ mode, value, onPick, onClose }: DateTimePickerSheetProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();

  if (!mode) return null;

  const isDateMode = mode === "date";
  const pattern = isDateMode ? "yyyy-MM-dd" : "HH:mm";

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{
          flex: 1,
          backgroundColor: theme.overlay,
          justifyContent: "center",
          alignItems: "center",
        }}
        onPress={onClose}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: theme.card,
            borderRadius: 20,
            padding: 16,
            gap: 12,
            minWidth: 260,
          }}
        >
          <View>
            <input
              type={isDateMode ? "date" : "time"}
              value={isValid(value) ? format(value, pattern) : ""}
              onChange={(event) => {
                // Parsing against `value` keeps the part the input does not
                // edit: the date picker leaves the clock alone and vice versa.
                const next = parse(event.target.value, pattern, value);
                if (isValid(next)) onPick(next);
              }}
              style={{
                fontFamily: "Inter",
                fontSize: 16,
                padding: 12,
                width: "100%",
                boxSizing: "border-box",
                borderRadius: 12,
                border: `1px solid ${theme.line}`,
                background: theme.card,
                color: theme.ink,
              }}
            />
          </View>
          <Button block label={t("action.done")} tone="primary" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
```

- [ ] **Step 2: Verifizieren**

```bash
bun run typecheck && bun lint && bunx expo export --platform web --output-dir /tmp/eltern-web
```

Expected: alle drei grün. Der Export beweist, dass die Web-Datei bündelt; dass sie _rendert_, prüft der manuelle Durchlauf in Task 10.

- [ ] **Step 3: Committen**

```bash
git add app-sections/shared/DateTimePickerSheet.web.tsx
git commit -m "fix(forms): Datums- und Zeitauswahl rendert auf Web"
```

---

### Task 5: `TypePicker` und `MemberPicker` nach `shared/`

**Files:**

- Create: `app-sections/shared/TypePicker.tsx`
- Create: `app-sections/shared/MemberPicker.tsx`
- Delete: `app-sections/event/TypePicker.tsx`, `app-sections/event/MemberPicker.tsx`
- Modify: `app-sections/shared/index.ts`
- Modify: `app-sections/event/EventCreateScreen.tsx`

**Interfaces:**

- Produces: `TypePickerItem { id: string; label: string; color: string }`, Komponente `TypePicker` mit Props `{ label, items, selectedId, onSelect, error? }`; `MemberOption`, `SelectedMember`, `MemberKind` und Komponente `MemberPicker` unverändert aus der bisherigen Datei.

- [ ] **Step 1: `TypePicker` generalisiert anlegen**

Create `app-sections/shared/TypePicker.tsx`:

```tsx
import { Pressable, View } from "react-native";

import { useTheme } from "@/design-system/ThemeProvider";
import { Text } from "@/design-system/ui";

export interface TypePickerItem {
  id: string;
  /** Already translated — slug-to-label resolution differs per feature. */
  label: string;
  /** Already resolved to a hex value. */
  color: string;
}

interface TypePickerProps {
  label: string;
  items: TypePickerItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  error?: string;
}

export function TypePicker({ label, items, selectedId, onSelect, error }: TypePickerProps) {
  const { theme } = useTheme();

  return (
    <View>
      <Text
        variant="caption"
        tone="inkSecondary"
        style={{ textTransform: "uppercase", fontWeight: "700", letterSpacing: 1.2 }}
      >
        {label}
      </Text>
      <View className="mt-1.5 flex-row flex-wrap gap-2">
        {items.map((item) => {
          const isSelected = item.id === selectedId;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: isSelected }}
              onPress={() => onSelect(item.id)}
              // The pill is 36 px tall by design; hitSlop takes the touch
              // target to 44 without touching the visual spec.
              hitSlop={{ top: 4, bottom: 4 }}
              className="h-9 flex-row items-center gap-1.5 rounded-pill border px-3 active:opacity-70"
              style={{
                backgroundColor: isSelected ? `${item.color}26` : theme.cardSubtle,
                borderColor: isSelected ? item.color : theme.line,
              }}
            >
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.color }} />
              <Text variant="pill" style={{ color: isSelected ? item.color : theme.inkSecondary }}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {error ? (
        <Text variant="caption" tone="danger" className="mt-1">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
```

- [ ] **Step 2: `MemberPicker` verschieben**

```bash
git mv app-sections/event/MemberPicker.tsx app-sections/shared/MemberPicker.tsx
```

Inhalt bleibt unverändert bis auf denselben `hitSlop`-Zusatz am „Ohne Kind"/„Niemand"-Chip (die einzige `h-9`-Fläche der Komponente):

```tsx
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={noMemberLabel}
          accessibilityState={{ selected: selected === null }}
          onPress={() => onSelect(null)}
          hitSlop={{ top: 4, bottom: 4 }}
          className="h-9 flex-row items-center rounded-pill border px-3 active:opacity-70"
```

- [ ] **Step 3: Alte `TypePicker`-Datei löschen und Barrel erweitern**

```bash
git rm app-sections/event/TypePicker.tsx
```

In `app-sections/shared/index.ts`:

```ts
export {
  MemberPicker,
  type MemberKind,
  type MemberOption,
  type SelectedMember,
} from "./MemberPicker";
export { TypePicker, type TypePickerItem } from "./TypePicker";
```

- [ ] **Step 4: `EventCreateScreen` auf die neuen Signaturen bringen**

Imports: `MemberPicker`/`SelectedMember`/`MemberOption`/`TypePicker` kommen jetzt aus `@/app-sections/shared`, die beiden lokalen Import-Zeilen entfallen:

```tsx
import {
  DateTimePickerSheet,
  Field,
  Icon,
  MemberPicker,
  TypePicker,
  type MemberOption,
  type SelectedMember,
  type TypePickerItem,
} from "@/app-sections/shared";
```

Die Typ-Auflösung zieht in den Screen — direkt neben `memberOptions`:

```tsx
const typeItems: TypePickerItem[] = useMemo(
  () =>
    (eventTypes.data ?? []).map((type) => {
      const labels = typeLabelsForSlug(type.slug);
      return {
        id: type.id,
        label: lang === "de" ? labels.de : labels.en,
        color: eventColorFor(type.slug, type.color, theme),
      };
    }),
  [eventTypes.data, lang, theme],
);
```

`eventColorFor` und `typeLabelsForSlug` zum bestehenden `@/features/calendar`-Import hinzufügen. Die Render-Stelle:

```tsx
<TypePicker
  label={t("cal.create.fieldType")}
  items={typeItems}
  selectedId={typeId}
  onSelect={setTypeId}
  error={typeError}
/>
```

- [ ] **Step 5: Verifizieren und committen**

```bash
bun run typecheck && bun lint && bun test
git add -A app-sections/
git commit -m "refactor(forms): TypePicker und MemberPicker nach shared"
```

---

### Task 6: `TaskForm`

**Files:**

- Create: `app-sections/task/TaskForm.tsx`

**Interfaces:**

- Consumes: `TaskFormState` (Task 1), `TypePickerItem`, `MemberOption`, `SelectedMember`, `DateTimePickerMode`, `DateTimePickerSheet`, `TypePicker`, `MemberPicker`, `Field` (Tasks 3–5), i18n-Keys (Task 2).
- Produces: `TaskFormErrorText { title?: string; typeId?: string; dueDate?: string }` und die Komponente `TaskForm` mit Props `{ state, onChange, types, childOptions, errors }`, wobei `onChange<K extends keyof TaskFormState>(key: K, value: TaskFormState[K]): void`.

- [ ] **Step 1: Datei schreiben**

```tsx
import { format, isValid } from "date-fns";
import { de as deLocale, enUS as enLocale } from "date-fns/locale";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import type { DateTimePickerMode, MemberOption, TypePickerItem } from "@/app-sections/shared";
import type { TaskFormState } from "@/features/tasks";

import { DateTimePickerSheet, Field, MemberPicker, TypePicker } from "@/app-sections/shared";
import { Text } from "@/design-system/ui";

/** Field errors as already-translated text — the screens own the t() call. */
export interface TaskFormErrorText {
  title?: string;
  typeId?: string;
  dueDate?: string;
}

interface TaskFormProps {
  state: TaskFormState;
  onChange: <K extends keyof TaskFormState>(key: K, value: TaskFormState[K]) => void;
  types: TypePickerItem[];
  /** Named `childOptions`, not `children` — that prop name belongs to React. */
  childOptions: MemberOption[];
  errors: TaskFormErrorText;
}

/**
 * Every field of a task, for both the create and the edit screen. Holds no
 * data state and calls no mutation; the only thing it owns is which picker is
 * currently open, which never leaves this file.
 */
export function TaskForm({ state, onChange, types, childOptions, errors }: TaskFormProps) {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language.startsWith("de") ? deLocale : enLocale;
  const [picker, setPicker] = useState<DateTimePickerMode | null>(null);

  // A row with an unparsable due_date must not reach format() — date-fns
  // throws on an Invalid Date, which would take the screen down before the
  // dueDate error could render.
  const dueDateValid = isValid(state.dueDate);
  const pickerBase = dueDateValid ? state.dueDate : new Date();
  const pickerValue = picker === "time" ? (state.dueTime ?? pickerBase) : pickerBase;

  return (
    <>
      <TypePicker
        label={t("hw.form.fieldType")}
        items={types}
        selectedId={state.typeId}
        onSelect={(id) => onChange("typeId", id)}
        error={errors.typeId}
      />

      <MemberPicker
        label={t("hw.form.fieldChild")}
        noMemberLabel={t("hw.form.noChild")}
        options={childOptions}
        selected={state.childId ? { id: state.childId, kind: "child" } : null}
        onSelect={(next) => onChange("childId", next?.id ?? null)}
      />

      <Field
        label={t("hw.form.fieldTitle")}
        value={state.title}
        onChangeText={(text) => onChange("title", text)}
        error={errors.title}
      />

      <Field
        label={t("hw.form.fieldSubject")}
        value={state.subject}
        onChangeText={(text) => onChange("subject", text)}
        placeholder="—"
      />

      <View className="flex-row gap-3">
        <View className="flex-1">
          <Field
            label={t("hw.form.fieldDue")}
            iconName="calendar"
            value={
              dueDateValid ? format(state.dueDate, "E, d. MMM yyyy", { locale: dateLocale }) : "—"
            }
            onPress={() => setPicker("date")}
            error={errors.dueDate}
          />
        </View>
        <View className="flex-1">
          <Field
            label={t("hw.form.fieldDueTime")}
            iconName="clock"
            value={state.dueTime ? format(state.dueTime, "HH:mm") : "—"}
            onPress={() => setPicker("time")}
          />
        </View>
      </View>

      {state.dueTime ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("hw.form.clearTime")}
          onPress={() => onChange("dueTime", null)}
          // Without this there is no way back to "no time" once one is set.
          className="h-11 justify-center self-start px-1 active:opacity-70"
        >
          <Text variant="caption" tone="primaryStrong">
            {t("hw.form.clearTime")}
          </Text>
        </Pressable>
      ) : null}

      <Field
        label={t("hw.form.fieldNotes")}
        value={state.notes}
        onChangeText={(text) => onChange("notes", text)}
        type="multiline"
        placeholder="—"
      />

      <DateTimePickerSheet
        mode={picker}
        value={pickerValue}
        onPick={(selected) => onChange(picker === "time" ? "dueTime" : "dueDate", selected)}
        onClose={() => setPicker(null)}
      />
    </>
  );
}
```

- [ ] **Step 2: Verifizieren und committen**

```bash
bun run typecheck && bun lint
git add app-sections/task/TaskForm.tsx
git commit -m "feat(tasks): TaskForm mit allen Formularfeldern"
```

Expected: beide grün. (`TaskForm` hat noch keinen Konsumenten — das ist in Ordnung, Task 7 hängt sie ein.)

---

### Task 7: Anlegen — Screen, Route, Einstieg

**Files:**

- Create: `app-sections/task/TaskCreateScreen.tsx`
- Create: `app/task/new.tsx`
- Modify: `app/_layout.tsx`
- Modify: `app-sections/(tabs)/aufgaben/AufgabenScreen.tsx`

**Interfaces:**

- Consumes: `TaskForm` + `TaskFormErrorText` (Task 6), `emptyTaskForm`/`validateTaskForm`/`hasTaskFormErrors`/`toCreateVars`/`taskTypeLabelKey`/`taskTypeColorFor`/`useCreateTask`/`useTaskTypes`/`mapTaskError` (Tasks 1 und Bestand).
- Produces: Route `/task/new`, Komponente `TaskCreateScreen`.

- [ ] **Step 1: `TaskCreateScreen` schreiben**

```tsx
import { router, Stack } from "expo-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { MemberOption, TypePickerItem } from "@/app-sections/shared";
import type { TaskFormState } from "@/features/tasks";

import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Text } from "@/design-system/ui";
import { useCurrentParent, useFamilyChildren } from "@/features/auth";
import {
  emptyTaskForm,
  hasTaskFormErrors,
  mapTaskError,
  taskTypeColorFor,
  taskTypeLabelKey,
  toCreateVars,
  useCreateTask,
  useTaskTypes,
  validateTaskForm,
} from "@/features/tasks";

import { TaskForm } from "./TaskForm";

export function TaskCreateScreen() {
  const { t } = useTranslation();
  const { theme, nativeVars } = useTheme();

  const types = useTaskTypes();
  const { data: parent } = useCurrentParent();
  const { data: children } = useFamilyChildren(parent?.family_id);
  const createMutation = useCreateTask();

  const [state, setState] = useState<TaskFormState>(() => emptyTaskForm(new Date()));
  const [typeHydrated, setTypeHydrated] = useState(false);

  // Render-phase hydration, same as EventCreateScreen: the default type is
  // only knowable once the lookup has loaded, and an effect would render one
  // frame with nothing selected.
  if (types.data && !typeHydrated) {
    const preferred = types.data.find((type) => type.slug === "hausaufgaben") ?? types.data[0];
    setState((prev) => ({ ...prev, typeId: preferred?.id ?? null }));
    setTypeHydrated(true);
  }

  // Written as a copy-then-assign rather than `{ ...prev, [key]: value }`:
  // a computed key with a generic type widens the spread's inferred type and
  // TypeScript stops seeing it as a TaskFormState.
  function handleChange<K extends keyof TaskFormState>(key: K, value: TaskFormState[K]) {
    setState((prev) => {
      const next: TaskFormState = { ...prev };
      next[key] = value;
      return next;
    });
  }

  const typeItems: TypePickerItem[] = useMemo(
    () =>
      (types.data ?? []).map((type) => ({
        id: type.id,
        label: t(taskTypeLabelKey(type.slug), { defaultValue: type.slug }),
        color: taskTypeColorFor(type.color, theme),
      })),
    [types.data, t, theme],
  );

  const childOptions: MemberOption[] = useMemo(
    () =>
      (children ?? []).map((child) => ({
        id: child.id,
        name: child.name,
        color: child.color,
        kind: "child" as const,
      })),
    [children],
  );

  const errors = validateTaskForm(state);
  const canSave = !hasTaskFormErrors(errors) && !createMutation.isPending;

  function onSave() {
    const vars = toCreateVars(state);
    if (!vars || createMutation.isPending) return;
    createMutation.mutate(vars, { onSuccess: () => router.back() });
  }

  return (
    <SafeAreaView
      edges={["bottom"]}
      style={[{ flex: 1, backgroundColor: theme.card }, nativeVars]}
      className="flex-1 bg-card"
    >
      <Stack.Screen options={{ contentStyle: { flex: 1, backgroundColor: theme.card } }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.card }}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 4,
          paddingBottom: 24,
          gap: 14,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-row items-center justify-between pb-3 pt-4">
          <Text variant="h2">{t("hw.create.title")}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("action.cancel")}
            onPress={() => router.back()}
            className="px-2 py-1 active:opacity-70"
            hitSlop={12}
          >
            <Text variant="bodyEmph" tone="inkSecondary">
              {t("action.cancel")}
            </Text>
          </Pressable>
        </View>

        <TaskForm
          state={state}
          onChange={handleChange}
          types={typeItems}
          childOptions={childOptions}
          errors={{
            title: errors.title ? t(errors.title) : undefined,
            typeId: errors.typeId ? t(errors.typeId) : undefined,
            dueDate: errors.dueDate ? t(errors.dueDate) : undefined,
          }}
        />

        {createMutation.error ? (
          <Text variant="caption" tone="danger">
            {t(mapTaskError(createMutation.error))}
          </Text>
        ) : null}

        <View
          style={{ marginTop: 12, paddingTop: 18, borderTopWidth: 1, borderTopColor: theme.line }}
        >
          <Button
            block
            label={createMutation.isPending ? t("hw.create.saving") : t("hw.create.save")}
            tone="primary"
            disabled={!canSave}
            onPress={onSave}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Route anlegen**

Create `app/task/new.tsx`:

```tsx
export { TaskCreateScreen as default } from "@/app-sections/task/TaskCreateScreen";
```

- [ ] **Step 3: Screen im Root-Stack registrieren**

In `app/_layout.tsx`, direkt nach dem `event/new`-Block:

```tsx
<Stack.Screen
  name="task/new"
  options={{
    presentation: "formSheet",
    headerShown: false,
    gestureEnabled: true,
    sheetAllowedDetents: [0.9],
    sheetCornerRadius: 26,
    sheetGrabberVisible: true,
    sheetExpandsWhenScrolledToEdge: false,
    contentStyle: { flex: 1, backgroundColor: theme.card },
  }}
/>
```

- [ ] **Step 4: Einstieg auf dem AufgabenScreen**

In `app-sections/(tabs)/aufgaben/AufgabenScreen.tsx` `router` importieren (`import { router } from "expo-router";`) und den bestehenden Voice-Button ersetzen durch:

```tsx
      {/* Outside the loading/error branch on purpose: adding a task must work
          even when the list itself is unavailable. */}
      <Button
        label={t("hw.add")}
        tone="primary"
        block
        className="mt-5"
        onPress={() => router.push("/task/new")}
      />
      <Button label={t("hw.addVoice")} variant="soft" tone="accent" block className="mt-2" />
```

- [ ] **Step 5: Verifizieren**

```bash
bun run typecheck && bun lint && bun test
```

Expected: alle grün.

- [ ] **Step 6: Manuell prüfen**

```bash
bun run web
```

Auf `/aufgaben`: „Neue Aufgabe" öffnet das Sheet, Typ-Pills sind sichtbar und `Hausaufgaben` ist vorausgewählt, ein leerer Titel zeigt „Bitte einen Titel eingeben" und der Speichern-Button ist grau. Titel eintragen, Datum wählen → speichern, Sheet schließt, die Zeile erscheint in der passenden Sektion.

- [ ] **Step 7: Committen**

```bash
git add -A app/ app-sections/
git commit -m "feat(tasks): Aufgaben anlegen über Formular-Screen"
```

---

### Task 8: Bearbeiten — Selektor, Screen, Route, Zeilentap

**Files:**

- Modify: `features/tasks/queries.ts` (Hook `useTask`)
- Modify: `features/tasks/index.ts` (Export)
- Create: `app-sections/task/TaskEditScreen.tsx`
- Create: `app/task/edit/[id].tsx`
- Modify: `app/_layout.tsx`
- Modify: `app-sections/(tabs)/aufgaben/TaskRow.tsx`

**Interfaces:**

- Consumes: `useFamilyTasks` (Bestand), `taskToForm`/`toTaskChanges` (Task 1), `TaskForm` (Task 6), `useUpdateTask` (Bestand).
- Produces: `useTask(taskId: string): { data: TaskWithType | undefined; isLoading: boolean }`, Route `/task/edit/[id]`, Komponente `TaskEditScreen`.

- [ ] **Step 1: `useTask` ergänzen**

An `features/tasks/queries.ts` anhängen, direkt nach `useFamilyTasks`:

```ts
interface UseTaskResult {
  data: TaskWithType | undefined;
  isLoading: boolean;
}

/**
 * One task out of the family list — a selector, not a second query. The list
 * is the only cache entry the mutations patch; a `taskKeys.detail(id)` entry
 * would be a second copy of the same row that nothing invalidates.
 *
 * Consequence: a task outside the list's window (open, or completed less than
 * DONE_WINDOW_DAYS ago) resolves to `undefined`, and the edit screen renders
 * its not-found state. Reachable only by deep link — every row the list shows
 * is in the cache by definition.
 */
export function useTask(taskId: string): UseTaskResult {
  const { data, isLoading } = useFamilyTasks();
  const task = useMemo(() => data.find((row) => row.id === taskId), [data, taskId]);
  return { data: task, isLoading };
}
```

In `features/tasks/index.ts` den `./queries`-Export um `useTask` erweitern.

- [ ] **Step 2: `TaskEditScreen` schreiben**

```tsx
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { MemberOption, TypePickerItem } from "@/app-sections/shared";
import type { TaskFormState } from "@/features/tasks";

import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Text } from "@/design-system/ui";
import { useCurrentParent, useFamilyChildren } from "@/features/auth";
import {
  emptyTaskForm,
  hasTaskFormErrors,
  mapTaskError,
  taskToForm,
  taskTypeColorFor,
  taskTypeLabelKey,
  toTaskChanges,
  useTask,
  useTaskTypes,
  useUpdateTask,
  validateTaskForm,
} from "@/features/tasks";

import { TaskForm } from "./TaskForm";

export function TaskEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const taskId = id ?? "";
  const { t } = useTranslation();
  const { theme, nativeVars } = useTheme();

  const { data: task, isLoading } = useTask(taskId);
  const types = useTaskTypes();
  const { data: parent } = useCurrentParent();
  const { data: children } = useFamilyChildren(parent?.family_id);
  const updateMutation = useUpdateTask();

  const [state, setState] = useState<TaskFormState>(() => emptyTaskForm(new Date()));
  const [hydrated, setHydrated] = useState(false);

  if (task && !hydrated) {
    setState(taskToForm(task));
    setHydrated(true);
  }

  // Written as a copy-then-assign rather than `{ ...prev, [key]: value }`:
  // a computed key with a generic type widens the spread's inferred type and
  // TypeScript stops seeing it as a TaskFormState.
  function handleChange<K extends keyof TaskFormState>(key: K, value: TaskFormState[K]) {
    setState((prev) => {
      const next: TaskFormState = { ...prev };
      next[key] = value;
      return next;
    });
  }

  const typeItems: TypePickerItem[] = useMemo(
    () =>
      (types.data ?? []).map((type) => ({
        id: type.id,
        label: t(taskTypeLabelKey(type.slug), { defaultValue: type.slug }),
        color: taskTypeColorFor(type.color, theme),
      })),
    [types.data, t, theme],
  );

  const childOptions: MemberOption[] = useMemo(
    () =>
      (children ?? []).map((child) => ({
        id: child.id,
        name: child.name,
        color: child.color,
        kind: "child" as const,
      })),
    [children],
  );

  const errors = validateTaskForm(state);
  const canSave = hydrated && !hasTaskFormErrors(errors) && !updateMutation.isPending;

  function onSave() {
    const changes = toTaskChanges(state);
    if (!changes || !task || updateMutation.isPending) return;
    updateMutation.mutate({ taskId: task.id, changes }, { onSuccess: () => router.back() });
  }

  return (
    <SafeAreaView
      edges={["bottom"]}
      style={[{ flex: 1, backgroundColor: theme.card }, nativeVars]}
      className="flex-1 bg-card"
    >
      <Stack.Screen options={{ contentStyle: { flex: 1, backgroundColor: theme.card } }} />

      {isLoading ? (
        <View className="flex-1 items-center justify-center px-6">
          <View className="h-24 w-full rounded-2xl" style={{ backgroundColor: theme.cardSubtle }} />
        </View>
      ) : !task ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text variant="listTitle" tone="danger">
            {t("hw.notFound")}
          </Text>
          <View className="mt-4">
            <Button label={t("action.back")} variant="soft" onPress={() => router.back()} />
          </View>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1, backgroundColor: theme.card }}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 4,
            paddingBottom: 24,
            gap: 14,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="flex-row items-center justify-between pb-3 pt-4">
            <Text variant="h2">{t("hw.edit.title")}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("action.cancel")}
              onPress={() => router.back()}
              className="px-2 py-1 active:opacity-70"
              hitSlop={12}
            >
              <Text variant="bodyEmph" tone="inkSecondary">
                {t("action.cancel")}
              </Text>
            </Pressable>
          </View>

          <TaskForm
            state={state}
            onChange={handleChange}
            types={typeItems}
            childOptions={childOptions}
            errors={{
              title: errors.title ? t(errors.title) : undefined,
              typeId: errors.typeId ? t(errors.typeId) : undefined,
              dueDate: errors.dueDate ? t(errors.dueDate) : undefined,
            }}
          />

          {updateMutation.error ? (
            <Text variant="caption" tone="danger">
              {t(mapTaskError(updateMutation.error))}
            </Text>
          ) : null}

          <View
            style={{ marginTop: 12, paddingTop: 18, borderTopWidth: 1, borderTopColor: theme.line }}
          >
            <Button
              block
              label={updateMutation.isPending ? t("hw.edit.saving") : t("hw.edit.save")}
              tone="primary"
              disabled={!canSave}
              onPress={onSave}
            />
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
```

- [ ] **Step 3: Route anlegen**

Create `app/task/edit/[id].tsx`:

```tsx
export { TaskEditScreen as default } from "@/app-sections/task/TaskEditScreen";
```

- [ ] **Step 4: Screen im Root-Stack registrieren**

In `app/_layout.tsx`, nach dem `task/new`-Block:

```tsx
<Stack.Screen
  name="task/edit/[id]"
  options={{
    presentation: "formSheet",
    headerShown: false,
    gestureEnabled: true,
    sheetAllowedDetents: [0.85],
    sheetCornerRadius: 26,
    sheetGrabberVisible: true,
    sheetExpandsWhenScrolledToEdge: false,
    contentStyle: { flex: 1, backgroundColor: theme.card },
  }}
/>
```

- [ ] **Step 5: Zeilenkörper pressbar machen**

In `app-sections/(tabs)/aufgaben/TaskRow.tsx` `router` importieren (`import { router } from "expo-router";`) und das `<View className="flex-1">` — den Block mit Subject-Pill, Titel und Fälligkeit — durch eine `Pressable` ersetzen. Der Inhalt bleibt Zeichen für Zeichen derselbe, nur das umschließende Element wechselt:

```tsx
<Pressable
  onPress={() => router.push({ pathname: "/task/edit/[id]", params: { id: task.id } })}
  accessibilityRole="button"
  accessibilityLabel={task.title}
  className="flex-1 active:opacity-70"
>
  {task.subject || urgent ? (
    <View className="mb-1 flex-row items-center gap-1.5">
      {task.subject ? (
        <View className="rounded-pill px-2 py-0.5" style={{ backgroundColor: `${badgeColor}22` }}>
          <Text variant="pill" style={{ color: badgeColor }}>
            {task.subject}
          </Text>
        </View>
      ) : null}
      {urgent ? <Pill label={t("hw.dueToday")} tone="warn" /> : null}
    </View>
  ) : null}

  <Text
    variant="listTitle"
    tone={task.is_done ? "inkTertiary" : "ink"}
    style={task.is_done ? { textDecorationLine: "line-through" } : undefined}
  >
    {task.title}
  </Text>
  <Text variant="caption" tone="inkSecondary" className="mt-0.5">
    {t("hw.due", { when: due })}
  </Text>
</Pressable>
```

Die Checkbox-`Pressable` davor bleibt unangetastet: Sie fängt ihre Taps selbst ab, behält `accessibilityRole="checkbox"` und ihre 44×44-Fläche.

- [ ] **Step 6: Verifizieren**

```bash
bun run typecheck && bun lint && bun test
```

- [ ] **Step 7: Manuell prüfen**

Auf `bun run web`: Tap auf eine Zeile öffnet das Edit-Sheet mit allen Werten vorbelegt (Typ, Kind, Titel, Fach, Datum, ggf. Uhrzeit, Notizen). Titel ändern → speichern → die Liste zeigt den neuen Titel. Uhrzeit setzen, dann „Uhrzeit entfernen" → speichern → beim erneuten Öffnen steht dort „—". Tap auf die Checkbox öffnet **nicht** das Sheet.

- [ ] **Step 8: Committen**

```bash
git add -A features/tasks app/ app-sections/
git commit -m "feat(tasks): Aufgaben bearbeiten über Formular-Screen"
```

---

### Task 9: Löschen

**Files:**

- Create: `app-sections/shared/confirmDialog.ts`
- Modify: `app-sections/shared/index.ts`
- Modify: `app-sections/task/TaskEditScreen.tsx`

**Interfaces:**

- Produces: `confirmDestructive(labels: ConfirmLabels): Promise<boolean>` mit `ConfirmLabels { title: string; body: string; confirm: string; cancel: string }`.

- [ ] **Step 1: Bestätigungsdialog schreiben**

Create `app-sections/shared/confirmDialog.ts`:

```ts
import { Alert, Platform } from "react-native";

export interface ConfirmLabels {
  title: string;
  body: string;
  confirm: string;
  cancel: string;
}

/**
 * A yes/no question for a destructive action, resolved as a promise — same
 * shape as `pickScope` in app-sections/event/scopeDialog.ts.
 *
 * The web branch exists because react-native-web has no `Alert`
 * implementation: on web the call is a no-op, so a delete guarded by Alert
 * would silently never happen.
 */
export function confirmDestructive(labels: ConfirmLabels): Promise<boolean> {
  if (Platform.OS === "web") {
    return Promise.resolve(window.confirm(`${labels.title}\n\n${labels.body}`));
  }
  return new Promise((resolve) => {
    Alert.alert(
      labels.title,
      labels.body,
      [
        { text: labels.cancel, style: "cancel", onPress: () => resolve(false) },
        { text: labels.confirm, style: "destructive", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
```

Kein `eslint-disable` nötig: `no-alert` ist in [eslint.config.js](../../../eslint.config.js) nicht aktiviert, und ESLint 9 meldet unbenutzte Disable-Direktiven als Warnung. `window` ist typisiert, weil `expo/tsconfig.base` die DOM-Lib führt.

In `app-sections/shared/index.ts`:

```ts
export { confirmDestructive, type ConfirmLabels } from "./confirmDialog";
```

- [ ] **Step 2: Löschen im Edit-Screen verdrahten**

In `app-sections/task/TaskEditScreen.tsx`: `confirmDestructive` aus `@/app-sections/shared` und `useDeleteTask` aus `@/features/tasks` importieren, dazu `Alert` aus `react-native`. Nach `updateMutation`:

```tsx
const deleteMutation = useDeleteTask();
```

Und neben `onSave`:

```tsx
async function onDelete() {
  if (!task || deleteMutation.isPending) return;
  const confirmed = await confirmDestructive({
    title: t("hw.delete.confirmTitle"),
    body: t("hw.delete.confirmBody"),
    confirm: t("hw.delete.confirmOk"),
    cancel: t("action.cancel"),
  });
  if (!confirmed) return;
  deleteMutation.mutate(
    { taskId: task.id },
    {
      onSuccess: () => router.back(),
      onError: (err) => Alert.alert(t("hw.delete.error"), t(mapTaskError(err))),
    },
  );
}
```

Der Button unter dem Speichern-Block, im selben `View` mit der Trennlinie:

```tsx
<View className="mt-3">
  <Button
    block
    variant="soft"
    tone="danger"
    label={deleteMutation.isPending ? t("hw.delete.deleting") : t("hw.delete.confirmOk")}
    disabled={deleteMutation.isPending || updateMutation.isPending}
    onPress={() => void onDelete()}
  />
</View>
```

- [ ] **Step 3: Verifizieren**

```bash
bun run typecheck && bun lint && bun test
```

- [ ] **Step 4: Manuell prüfen**

Auf `bun run web`: Edit-Sheet öffnen → „Löschen" → Rückfrage erscheint → Abbrechen lässt die Aufgabe stehen, Bestätigen schließt das Sheet und die Zeile ist aus der Liste verschwunden.

- [ ] **Step 5: Committen**

```bash
git add -A app-sections/
git commit -m "feat(tasks): Aufgaben löschen mit Rückfrage"
```

---

### Task 10: Dokumentation und Abnahme

**Files:**

- Modify: `docs/decision-log.md` (ADR-010 anhängen)
- Modify: `docs/TODO.md`
- Modify: `CLAUDE.md`

**Interfaces:** keine.

- [ ] **Step 1: ADR-010 anhängen**

Ans Ende von `docs/decision-log.md`:

```markdown
## ADR-010 — Formular-Bausteine nach `app-sections/shared/`, Web-Zweig per Plattform-Datei (2026-08-11)

### Status

Accepted. Ergänzt die Kalender-Formularentscheidungen aus [ADR-008](#adr-008--kalender-v1-abgeschlossen-reminder-recurrence-editor-multi-day-2026-07-28), Decision 5 (geteiltes Picker-Sheet), und schließt die Tasks-Reihe ab.

### Context

Die Aufgaben-Formulare brauchen dieselben Bausteine, die bisher unter `app-sections/event/` lagen: Datums-/Zeit-Picker, Personen-Auswahl, Typ-Pills. Ein Import von `app-sections/task/` nach `app-sections/event/` würde zwei Features aneinanderkoppeln, die fachlich nichts teilen. Zusätzlich rendert `@react-native-community/datetimepicker` auf Web gar nicht (`Maximum update depth exceeded`, offener TODO-Eintrag seit der Multi-Day-Iteration) — damit wäre das neue Formular auf Web weder bedienbar noch per `bun run web` prüfbar.

### Decisions

1. **Drei Komponenten wandern nach `app-sections/shared/`.** `DateTimePickerSheet` verliert dabei seine Kalender-Typen und nimmt statt `RangeField`/`DateRange` ein `mode` plus `value`; die Range-Logik (welches Ende wird bearbeitet) bleibt als zwei Zeilen in den beiden Event-Screens, wo sie hingehört. `TypePicker` nimmt fertige `{id,label,color}`-Items entgegen, statt Slug-zu-Farbe und Slug-zu-Label selbst aufzulösen — die Auflösung ist pro Feature verschieden, die Pill-Darstellung nicht. `MemberPicker` zieht unverändert um.
2. **Der Web-Picker ist eine Plattform-Datei, kein `Platform.OS`-Zweig.** `DateTimePickerSheet.web.tsx` rendert `<input type="date">`/`type="time"` in derselben Modal-Hülle; Metro wählt sie automatisch, und das native Modul landet gar nicht erst im Web-Bundle. Der geteilte Props-Typ liegt in `DateTimePickerSheet.types.ts` — ein Import aus `./DateTimePickerSheet` würde auf Web auf die Web-Datei selbst auflösen.
3. **Kein Dringlichkeits- oder Status-Feld im Formular.** Die `tasks`-Tabelle hat für beides keine Spalte: Dringlichkeit wird in `features/tasks/stats.ts` aus `due_date` abgeleitet, Status ist `is_done` und gehört der Zeilen-Checkbox mit ihrer symmetrischen Drei-Spalten-Invariante. Ein Override wie in `patterns/homework.md` angedeutet bräuchte Migration plus zweite Wahrheitsquelle in der Sektionierung — nicht auf Verdacht.
4. **Ein `TaskForm` für beide Screens** statt der Kalender-Duplikation. Bei Terminen unterscheiden sich Create und Edit inhaltlich (Ganztägig-Switch, Kollisionshinweis, Scope-Dialog); bei Aufgaben ist der Feldsatz identisch, und zwei Kopien würden auseinanderdriften.
5. **`useTask` ist ein Selektor auf `useFamilyTasks`,** keine eigene Query. Ein `taskKeys.detail(id)`-Eintrag wäre eine zweite Kopie derselben Zeile, die keine der vier Mutations patcht.
6. **Bestätigung destruktiver Aktionen über `confirmDestructive`.** `Alert` ist auf react-native-web ein No-op; ein Löschen hinter einem Alert-Callback würde dort still nie passieren. Der Helfer folgt der Promise-Form von `pickScope`.

### Consequences

- `app-sections/event/{DateTimePickerSheet,TypePicker,MemberPicker}.tsx` existieren nicht mehr; beide Event-Screens importieren aus `@/app-sections/shared`.
- Datums- und Zeitauswahl funktionieren auf Web erstmals — für Aufgaben **und** Kalender. Der entsprechende TODO-Eintrag entfällt.
- Die Typ-Pills bekommen `hitSlop`, um bei 36 px Höhe auf 44 px Trefferfläche zu kommen, ohne die Optik des Handoff-Bundles anzufassen.
- Neue Catalog-Keys (`hw.add`, `hw.notFound`, `hw.create.*`, `hw.edit.*`, `hw.form.*`, `hw.delete.*`, `hw.type.*`, drei neue `hw.error.*`). Nachtrag in der designer-eigenen [docs/COPY.md](./COPY.md) steht aus → [docs/TODO.md](./TODO.md).
- `patterns/homework.md` beschreibt weiterhin kein Formular; die Screens folgen dem Kalender-Formularmuster. Abstimmung mit dem Designer steht aus → [docs/TODO.md](./TODO.md).

---
```

- [ ] **Step 2: `docs/TODO.md` pflegen**

**Entfernen** (Abschnitt „Aufgaben / Tasks"): den Eintrag „Aufgaben lassen sich nicht anlegen, bearbeiten oder löschen".
**Entfernen** (Abschnitt „Calendar (V1)"): den Eintrag „Datums-/Zeit-Picker rendert auf Web nicht" — durch die Plattform-Datei erledigt.

**Ergänzen** im Abschnitt „Aufgaben / Tasks":

```markdown
- **Neue Formular-Keys fehlen in `docs/COPY.md`** ([features/i18n/locales/de.json](../features/i18n/locales/de.json) + [en.json](../features/i18n/locales/en.json)): `hw.add`, `hw.notFound`, `hw.create.*`, `hw.edit.*`, `hw.form.*`, `hw.delete.*`, `hw.type.*` sowie `hw.error.titleRequired`/`typeRequired`/`dateRequired`. Vom Designer in der Copy-Deck-Tabelle nachtragen (gleiche Baustelle wie die Kalender- und Settings-Keys).
- **`patterns/homework.md` kennt kein Anlege-Formular** ([patterns/homework.md](../patterns/homework.md)): Der Pattern-Doc beschreibt nur die drei Listen-Varianten und den Voice-Add-Flow. Die beiden Formular-Screens folgen deshalb dem Kalender-Formularmuster (Sheet, Pflichtfelder oben, Abbrechen in der Kopfzeile). Mit dem Designer abstimmen, damit der Pattern-Doc die Anatomie mitführt.
- **Kein Einstieg ins Anlegen vom Dashboard** ([app-sections/(tabs)/dashboard/DashboardScreen.tsx](<../app-sections/(tabs)/dashboard/DashboardScreen.tsx>)): Aufgaben lassen sich nur aus dem Aufgaben-Tab heraus anlegen. Ein Quick-Add auf dem Dashboard wäre naheliegend, ist aber eine Frage an das Dashboard-Pattern, nicht an diese Iteration.
```

- [ ] **Step 3: `CLAUDE.md` nachziehen**

Im Abschnitt „Folder structure" den `app/`-Block um die zwei Routen und `app-sections/` um den Task-Ordner ergänzen:

```
├─ task/new.tsx           → TaskCreateScreen
├─ task/edit/[id].tsx     → TaskEditScreen
```

```
app-sections/
├─ task/                  Anlegen/Bearbeiten von Aufgaben (Create · Edit · TaskForm)
└─ shared/                Geteilte Bausteine inkl. Formular-Primitives
   (DateTimePickerSheet · TypePicker · MemberPicker · Field · confirmDialog)
```

- [ ] **Step 4: Vollständiger Verifikationslauf**

```bash
bun format:check && bun lint && bun run typecheck && bun test && bunx expo export --platform web --output-dir /tmp/eltern-web
```

Expected: alle fünf grün. Bei `format:check`-Fehlern `bun format` laufen lassen und erneut prüfen.

- [ ] **Step 5: Manuelle Abnahme**

Auf `bun run web` der Reihe nach:

1. **Anlegen** — „Neue Aufgabe", Pflichtfeld-Fehler erscheinen und verschwinden, Datum und Uhrzeit wählbar, Zeile taucht in der richtigen Sektion auf.
2. **Bearbeiten** — Zeilentap, Formular vorbelegt, Änderung schlägt in der Liste durch, Uhrzeit entfernbar.
3. **Löschen** — Rückfrage erscheint, Zeile verschwindet.
4. **Abhaken** — Checkbox funktioniert weiter und öffnet **kein** Sheet.
5. **Gegenprobe Kalender** — Termin anlegen und bearbeiten funktioniert unverändert, Datums- und Zeitauswahl auf Web jetzt ebenfalls.
6. **Sprachumschaltung** — in den Einstellungen auf Englisch stellen, beide Screens durchsehen: keine deutschen Literale, Typ-Pills auf Englisch.

- [ ] **Step 6: Committen**

```bash
git add -A docs/ CLAUDE.md
git commit -m "docs(tasks): ADR-010, Backlog-Pflege und Ordnerstruktur"
```

- [ ] **Step 7: CodeRabbit-Durchlauf**

```bash
coderabbit review --base main
```

Findings abarbeiten oder mit Begründung verwerfen, dann den PR öffnen.

---

## Notizen für den Implementierenden

- **`bun test` ist Buns Runner, nicht Jest.** Testdateien importieren aus `bun:test`. `npx jest` scheitert an genau diesen Importen.
- **Render-Phase-`setState`** (`if (data && !hydrated) { setState(...); setHydrated(true); }`) ist in diesem Repo etabliert (`EventCreateScreen`, `EventEditScreen`) und von React ausdrücklich unterstützt, solange es den eigenen State betrifft. Nicht in einen `useEffect` „korrigieren" — das kostet einen Frame mit falschem Inhalt.
- **Typed Routes:** `.expo/types` wird von `expo start` erzeugt, nicht von `expo export`. Läuft lokal kein Dev-Server, kennt `tsc` die `Href`-Union nicht. Keine `as`-Casts auf Routen einbauen — lokal und CI divergieren sonst (siehe CLAUDE.md).
- **Nichts aus dem Handoff-Bundle editieren.** Fehlende Copy und fehlende Pattern-Anatomie gehen als TODO an den Designer.
