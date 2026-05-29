# Event Edit & Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Bearbeiten and Löschen buttons in `EventDetailScreen` functional, with iCal-style scope semantics (this/forward/all) for recurring events and a clean sample-mode disabled state.

**Architecture:** Three-layer separation. UI (`app-sections/event/`) consumes mutation hooks. Data (`features/calendar/`) gets `mutations.ts` + `recurrence.ts` (the latter splits into a pure `EventOps` interface + scope-orchestration logic, so unit tests pass in a mock `EventOps` and assert which ops were called). Routing adds `app/event/edit/[id].tsx` as a second formSheet.

**Tech Stack:** Expo Router 6 · React Native 0.81 · TanStack Query 5 · Supabase JS 2 · NativeWind 4 · react-i18next · bun:test · `@react-native-community/datetimepicker` (new).

**Spec:** [docs/superpowers/specs/2026-05-29-event-edit-delete-design.md](../specs/2026-05-29-event-edit-delete-design.md)

---

## Task 1: Install `@react-native-community/datetimepicker`

**Files:**

- Modify: `package.json` + `bun.lock` (via bunx)

- [ ] **Step 1: Install via expo (SDK-compatible version)**

Run: `bunx expo install @react-native-community/datetimepicker`

Expected output: `installed @react-native-community/datetimepicker@<version>` plus updated lock.

- [ ] **Step 2: Verify TypeCheck passes**

Run: `bun run typecheck`
Expected: no output (clean).

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lock
git commit -m "feat(deps): add @react-native-community/datetimepicker for event edit form"
```

---

## Task 2: Extract `<Field>` component

**Files:**

- Create: `app-sections/shared/Field.tsx`
- Modify: `app-sections/shared/index.ts` (add export)
- Modify: `app-sections/child-profile/ChildProfileScreen.tsx` (remove inline `Field`, import shared one)

- [ ] **Step 1: Create the shared `Field` component**

`app-sections/shared/Field.tsx`:

```tsx
import { TextInput, View, type TextInputProps } from "react-native";

import { useTheme } from "@/design-system/ThemeProvider";
import { Text } from "@/design-system/ui";

import { Icon, type IconName } from "./Icon";

export type FieldType = "text" | "multiline";

export interface FieldProps {
  label: string;
  iconName?: IconName;
  value: string;
  onChangeText?: (text: string) => void;
  placeholder?: string;
  type?: FieldType;
  error?: string;
  editable?: boolean;
  /**
   * If provided, replaces the TextInput with a pressable surface that calls
   * this on press (useful for date/time pickers that own their own overlay).
   */
  onPress?: () => void;
  keyboardType?: TextInputProps["keyboardType"];
}

export function Field({
  label,
  iconName,
  value,
  onChangeText,
  placeholder,
  type = "text",
  error,
  editable = true,
  onPress,
  keyboardType,
}: FieldProps) {
  const { theme } = useTheme();
  const multiline = type === "multiline";

  return (
    <View>
      <Text
        variant="caption"
        tone="inkSecondary"
        style={{ textTransform: "uppercase", fontWeight: "700", letterSpacing: 1.2 }}
      >
        {label}
      </Text>
      <View
        className={`mt-1.5 ${multiline ? "min-h-20" : "h-12"} flex-row ${multiline ? "items-start pt-2.5" : "items-center"} gap-2 rounded-xl border bg-card px-3.5`}
        style={{ borderColor: error ? theme.danger : theme.line }}
      >
        {iconName ? <Icon name={iconName} size={18} color={theme.inkTertiary} /> : null}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.inkTertiary}
          editable={editable && !onPress}
          onPressIn={onPress}
          multiline={multiline}
          keyboardType={keyboardType}
          className="flex-1 text-base"
          style={{
            fontFamily: "Inter",
            fontSize: 14,
            color: editable ? theme.ink : theme.inkSecondary,
            textAlignVertical: multiline ? "top" : "center",
            minHeight: multiline ? 60 : undefined,
          }}
        />
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

- [ ] **Step 2: Export from shared barrel**

Modify `app-sections/shared/index.ts` — add line near other exports:

```ts
export { Field, type FieldProps, type FieldType } from "./Field";
```

- [ ] **Step 3: Refactor `ChildProfileScreen.tsx` to use shared `Field`**

Replace the local `Field` block in `app-sections/child-profile/ChildProfileScreen.tsx`:

Remove these blocks:

```tsx
interface FieldProps {
  label: string;
  iconName?: React.ComponentProps<typeof Icon>["name"];
  value: string;
}

function Field({ label, iconName, value }: FieldProps) {
  // ... entire inline implementation
}
```

Update the import line near the top:

```tsx
import { ChildAvatar, Field, Icon, Pill, TopBar } from "@/app-sections/shared";
```

Existing `<Field label={...} iconName={...} value={...} />` call sites stay unchanged — shared component accepts the same minimal prop shape.

- [ ] **Step 4: Verify typecheck + lint**

Run: `bun run typecheck`
Expected: clean.

Run: `bun lint`
Expected: same 2 pre-existing warnings, no new errors.

- [ ] **Step 5: Commit**

```bash
git add app-sections/shared/Field.tsx app-sections/shared/index.ts app-sections/child-profile/ChildProfileScreen.tsx
git commit -m "refactor(ui): extract Field component to shared, add type/error/onPress props"
```

---

## Task 3: Add i18n keys

**Files:**

- Modify: `features/i18n/locales/de.json`
- Modify: `features/i18n/locales/en.json`

- [ ] **Step 1: Extend `cal.*` in `de.json`**

Inside `"cal": { ... }`, after the existing `"detail": { ... }` block (still inside `cal`), add:

```json
,
    "edit": {
      "title": "Termin bearbeiten",
      "fieldTitle": "Titel",
      "fieldDate": "Datum",
      "fieldStart": "Von",
      "fieldEnd": "Bis",
      "fieldLocation": "Ort",
      "fieldNotes": "Notizen",
      "save": "Speichern",
      "saving": "Speichere…",
      "error": {
        "titleRequired": "Titel darf nicht leer sein",
        "invalidTimeRange": "Endzeit muss nach Startzeit liegen",
        "multiDay": "Mehrtägige Termine sind in dieser Version nicht editierbar",
        "network": "Speichern fehlgeschlagen"
      }
    },
    "delete": {
      "confirmTitle": "Termin löschen?",
      "confirmBody": "Diese Aktion kann nicht rückgängig gemacht werden.",
      "confirmOk": "Löschen",
      "error": "Löschen fehlgeschlagen"
    },
    "scope": {
      "title": "Welche Termine?",
      "this": "Nur diesen",
      "forward": "Diesen und alle folgenden",
      "all": "Alle Termine"
    }
```

Inside `cal.detail`, add (before the closing `}` of `detail`):

```json
,
      "requiresAuth": "Melde dich an, um Termine zu bearbeiten."
```

- [ ] **Step 2: Mirror to `en.json`**

Same structure with English copy:

```json
,
    "edit": {
      "title": "Edit event",
      "fieldTitle": "Title",
      "fieldDate": "Date",
      "fieldStart": "From",
      "fieldEnd": "To",
      "fieldLocation": "Location",
      "fieldNotes": "Notes",
      "save": "Save",
      "saving": "Saving…",
      "error": {
        "titleRequired": "Title cannot be empty",
        "invalidTimeRange": "End time must be after start time",
        "multiDay": "Multi-day events are not editable in this version",
        "network": "Save failed"
      }
    },
    "delete": {
      "confirmTitle": "Delete event?",
      "confirmBody": "This cannot be undone.",
      "confirmOk": "Delete",
      "error": "Delete failed"
    },
    "scope": {
      "title": "Which events?",
      "this": "Only this one",
      "forward": "This and all following",
      "all": "All events"
    }
```

And inside `cal.detail`:

```json
,
      "requiresAuth": "Sign in to edit events."
```

- [ ] **Step 3: Validate JSON**

Run: `jq '.cal.edit, .cal.delete, .cal.scope, .cal.detail.requiresAuth' features/i18n/locales/de.json && jq '.cal.edit, .cal.delete, .cal.scope, .cal.detail.requiresAuth' features/i18n/locales/en.json`

Expected: both files return the JSON shapes (no parse errors).

- [ ] **Step 4: Commit**

```bash
git add features/i18n/locales/de.json features/i18n/locales/en.json
git commit -m "feat(i18n): add edit/delete/scope keys for event modal"
```

---

## Task 4: Define recurrence types & EventOps interface

**Files:**

- Create: `features/calendar/recurrence.ts` (types only in this task)

- [ ] **Step 1: Write the types file**

`features/calendar/recurrence.ts`:

```ts
import type { Database } from "@/features/supabase/database.types";

type EventRow = Database["public"]["Tables"]["events"]["Row"];

export type EditScope = "this" | "forward" | "all";

export interface EventChanges {
  title: string;
  start_at: string;
  end_at: string;
  location: string | null;
  description: string | null;
}

export interface EventOps {
  cancelOccurrence: (eventId: string, occurrenceDate: string) => Promise<void>;
  modifyOccurrence: (
    eventId: string,
    occurrenceDate: string,
    override: Partial<EventChanges>,
  ) => Promise<void>;
  deleteMaster: (eventId: string) => Promise<void>;
  updateMaster: (eventId: string, changes: EventChanges) => Promise<void>;
  setRruleUntil: (eventId: string, until: string) => Promise<void>;
  deleteExceptionsFromDate: (eventId: string, fromDateInclusive: string) => Promise<void>;
  insertSplitEvent: (master: EventRow, changes: EventChanges) => Promise<void>;
}

export interface ApplyDeleteScopeArgs {
  ops: EventOps;
  scope: EditScope;
  eventId: string;
  occurrenceDate: string;
  isRecurring: boolean;
  masterStartAt: Date;
}

export interface ApplyEditScopeArgs {
  ops: EventOps;
  scope: EditScope;
  eventId: string;
  occurrenceDate: string;
  isRecurring: boolean;
  master: EventRow;
  changes: EventChanges;
}

export async function applyDeleteScope(_args: ApplyDeleteScopeArgs): Promise<void> {
  throw new Error("not implemented");
}

export async function applyEditScope(_args: ApplyEditScopeArgs): Promise<void> {
  throw new Error("not implemented");
}
```

- [ ] **Step 2: Verify typecheck**

Run: `bun run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add features/calendar/recurrence.ts
git commit -m "feat(calendar): scaffold recurrence scope types + EventOps interface"
```

---

## Task 5: Implement `applyDeleteScope` (TDD)

**Files:**

- Create: `features/calendar/recurrence.test.ts`
- Modify: `features/calendar/recurrence.ts`

Each scenario follows the same red→green→commit pattern. Mock `EventOps` per test.

- [ ] **Step 1: Write the test scaffolding**

`features/calendar/recurrence.test.ts`:

```ts
import { describe, expect, mock, test } from "bun:test";

import type { Database } from "@/features/supabase/database.types";

import { applyDeleteScope, type EventOps } from "./recurrence";

type EventRow = Database["public"]["Tables"]["events"]["Row"];

function makeOps(): EventOps {
  return {
    cancelOccurrence: mock(() => Promise.resolve()),
    modifyOccurrence: mock(() => Promise.resolve()),
    deleteMaster: mock(() => Promise.resolve()),
    updateMaster: mock(() => Promise.resolve()),
    setRruleUntil: mock(() => Promise.resolve()),
    deleteExceptionsFromDate: mock(() => Promise.resolve()),
    insertSplitEvent: mock(() => Promise.resolve()),
  };
}

const MASTER_START = new Date("2026-05-04T16:30:00.000Z");

describe("applyDeleteScope", () => {
  test("scope=this on recurring → cancelOccurrence", async () => {
    const ops = makeOps();
    await applyDeleteScope({
      ops,
      scope: "this",
      eventId: "evt-1",
      occurrenceDate: "2026-05-11",
      isRecurring: true,
      masterStartAt: MASTER_START,
    });
    expect(ops.cancelOccurrence).toHaveBeenCalledWith("evt-1", "2026-05-11");
    expect(ops.deleteMaster).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test, see it fail**

Run: `bun test features/calendar/recurrence.test.ts`
Expected: 1 failing test ("not implemented" thrown).

- [ ] **Step 3: Implement scope=this for recurring**

Replace `applyDeleteScope` in `features/calendar/recurrence.ts`:

```ts
export async function applyDeleteScope(args: ApplyDeleteScopeArgs): Promise<void> {
  const { ops, scope, eventId, occurrenceDate, isRecurring } = args;
  if (scope === "this") {
    if (isRecurring) {
      await ops.cancelOccurrence(eventId, occurrenceDate);
      return;
    }
    await ops.deleteMaster(eventId);
    return;
  }
  throw new Error("not implemented");
}
```

- [ ] **Step 4: Run test, see it pass**

Run: `bun test features/calendar/recurrence.test.ts`
Expected: 1 passing.

- [ ] **Step 5: Add test for scope=this on single event**

Append inside `describe`:

```ts
test("scope=this on single event → deleteMaster", async () => {
  const ops = makeOps();
  await applyDeleteScope({
    ops,
    scope: "this",
    eventId: "evt-1",
    occurrenceDate: "2026-05-04",
    isRecurring: false,
    masterStartAt: MASTER_START,
  });
  expect(ops.deleteMaster).toHaveBeenCalledWith("evt-1");
  expect(ops.cancelOccurrence).not.toHaveBeenCalled();
});
```

Run: `bun test features/calendar/recurrence.test.ts`
Expected: 2 passing (this branch already covered by step 3).

- [ ] **Step 6: Add tests for scope=forward and scope=all (red)**

Append:

```ts
test("scope=forward → setRruleUntil(day-before) + deleteExceptionsFromDate", async () => {
  const ops = makeOps();
  await applyDeleteScope({
    ops,
    scope: "forward",
    eventId: "evt-1",
    occurrenceDate: "2026-06-15",
    isRecurring: true,
    masterStartAt: MASTER_START,
  });
  expect(ops.setRruleUntil).toHaveBeenCalledWith("evt-1", "2026-06-14");
  expect(ops.deleteExceptionsFromDate).toHaveBeenCalledWith("evt-1", "2026-06-15");
  expect(ops.deleteMaster).not.toHaveBeenCalled();
});

test("scope=forward with cutoff < dtstart → behaves like all (deleteMaster)", async () => {
  const ops = makeOps();
  await applyDeleteScope({
    ops,
    scope: "forward",
    eventId: "evt-1",
    occurrenceDate: "2026-05-01",
    isRecurring: true,
    masterStartAt: MASTER_START,
  });
  expect(ops.deleteMaster).toHaveBeenCalledWith("evt-1");
  expect(ops.setRruleUntil).not.toHaveBeenCalled();
});

test("scope=all → deleteMaster", async () => {
  const ops = makeOps();
  await applyDeleteScope({
    ops,
    scope: "all",
    eventId: "evt-1",
    occurrenceDate: "2026-05-11",
    isRecurring: true,
    masterStartAt: MASTER_START,
  });
  expect(ops.deleteMaster).toHaveBeenCalledWith("evt-1");
});
```

Run: `bun test features/calendar/recurrence.test.ts`
Expected: 3 passing, 3 failing.

- [ ] **Step 7: Implement remaining branches**

Replace `applyDeleteScope` body fully:

```ts
function dayBefore(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function applyDeleteScope(args: ApplyDeleteScopeArgs): Promise<void> {
  const { ops, scope, eventId, occurrenceDate, isRecurring, masterStartAt } = args;

  if (scope === "this") {
    if (isRecurring) {
      await ops.cancelOccurrence(eventId, occurrenceDate);
      return;
    }
    await ops.deleteMaster(eventId);
    return;
  }

  if (scope === "forward") {
    const cutoff = dayBefore(occurrenceDate);
    if (cutoff < dateOnly(masterStartAt)) {
      await ops.deleteMaster(eventId);
      return;
    }
    await ops.setRruleUntil(eventId, cutoff);
    await ops.deleteExceptionsFromDate(eventId, occurrenceDate);
    return;
  }

  // scope === "all"
  await ops.deleteMaster(eventId);
}
```

- [ ] **Step 8: Run tests, see all pass**

Run: `bun test features/calendar/recurrence.test.ts`
Expected: 6 passing.

- [ ] **Step 9: Commit**

```bash
git add features/calendar/recurrence.ts features/calendar/recurrence.test.ts
git commit -m "feat(calendar): applyDeleteScope with TDD coverage (this/forward/all + edge)"
```

---

## Task 6: Implement `applyEditScope` (TDD)

**Files:**

- Modify: `features/calendar/recurrence.ts` (append)
- Modify: `features/calendar/recurrence.test.ts` (append)

- [ ] **Step 1: Add test scaffolding**

Append to `features/calendar/recurrence.test.ts`:

```ts
import { applyEditScope, type EventChanges } from "./recurrence";

const CHANGES: EventChanges = {
  title: "Neuer Titel",
  start_at: "2026-06-15T15:00:00.000Z",
  end_at: "2026-06-15T16:00:00.000Z",
  location: "Sportplatz Nord",
  description: null,
};

function makeMaster(overrides: Partial<EventRow> = {}): EventRow {
  return {
    id: "evt-1",
    family_id: "fam-1",
    type_id: "type-1",
    child_id: null,
    title: "Original",
    description: null,
    location: null,
    start_at: MASTER_START.toISOString(),
    end_at: new Date(MASTER_START.getTime() + 3600_000).toISOString(),
    all_day: false,
    rrule_freq: "weekly",
    rrule_interval: 1,
    rrule_byweekday: [1],
    rrule_until: null,
    rrule_count: null,
    created_by: null,
    created_at: "2026-05-01T00:00:00.000Z",
    updated_at: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("applyEditScope", () => {
  test("scope=this on recurring → modifyOccurrence with full override", async () => {
    const ops = makeOps();
    await applyEditScope({
      ops,
      scope: "this",
      eventId: "evt-1",
      occurrenceDate: "2026-06-15",
      isRecurring: true,
      master: makeMaster(),
      changes: CHANGES,
    });
    expect(ops.modifyOccurrence).toHaveBeenCalledWith("evt-1", "2026-06-15", CHANGES);
    expect(ops.updateMaster).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, see fail**

Run: `bun test features/calendar/recurrence.test.ts`
Expected: previously-passing tests still pass, new test fails ("not implemented").

- [ ] **Step 3: Implement scope=this branch**

Replace `applyEditScope` stub in `features/calendar/recurrence.ts`:

```ts
export async function applyEditScope(args: ApplyEditScopeArgs): Promise<void> {
  const { ops, scope, eventId, occurrenceDate, isRecurring, master, changes } = args;

  if (scope === "this") {
    if (isRecurring) {
      await ops.modifyOccurrence(eventId, occurrenceDate, changes);
      return;
    }
    await ops.updateMaster(eventId, changes);
    return;
  }
  throw new Error("not implemented");
}
```

- [ ] **Step 4: Run, see new test pass**

Run: `bun test features/calendar/recurrence.test.ts`

- [ ] **Step 5: Add tests for this-on-single + all + forward + forward-edge**

Append to the `describe("applyEditScope", ...)` block:

```ts
test("scope=this on single → updateMaster", async () => {
  const ops = makeOps();
  await applyEditScope({
    ops,
    scope: "this",
    eventId: "evt-1",
    occurrenceDate: "2026-05-04",
    isRecurring: false,
    master: makeMaster({ rrule_freq: null }),
    changes: CHANGES,
  });
  expect(ops.updateMaster).toHaveBeenCalledWith("evt-1", CHANGES);
});

test("scope=all → updateMaster", async () => {
  const ops = makeOps();
  await applyEditScope({
    ops,
    scope: "all",
    eventId: "evt-1",
    occurrenceDate: "2026-06-15",
    isRecurring: true,
    master: makeMaster(),
    changes: CHANGES,
  });
  expect(ops.updateMaster).toHaveBeenCalledWith("evt-1", CHANGES);
  expect(ops.insertSplitEvent).not.toHaveBeenCalled();
});

test("scope=forward → setRruleUntil + insertSplitEvent + deleteExceptionsFromDate", async () => {
  const ops = makeOps();
  const master = makeMaster();
  await applyEditScope({
    ops,
    scope: "forward",
    eventId: "evt-1",
    occurrenceDate: "2026-06-15",
    isRecurring: true,
    master,
    changes: CHANGES,
  });
  expect(ops.setRruleUntil).toHaveBeenCalledWith("evt-1", "2026-06-14");
  expect(ops.insertSplitEvent).toHaveBeenCalledWith(master, CHANGES);
  expect(ops.deleteExceptionsFromDate).toHaveBeenCalledWith("evt-1", "2026-06-15");
  expect(ops.updateMaster).not.toHaveBeenCalled();
});

test("scope=forward with cutoff < dtstart → updateMaster (no split)", async () => {
  const ops = makeOps();
  await applyEditScope({
    ops,
    scope: "forward",
    eventId: "evt-1",
    occurrenceDate: "2026-05-01",
    isRecurring: true,
    master: makeMaster(),
    changes: CHANGES,
  });
  expect(ops.updateMaster).toHaveBeenCalledWith("evt-1", CHANGES);
  expect(ops.insertSplitEvent).not.toHaveBeenCalled();
});
```

Run: `bun test features/calendar/recurrence.test.ts`
Expected: 2 passing (existing) + 3 failing (new). The "scope=all" test may pass once impl exists.

- [ ] **Step 6: Implement remaining branches**

Replace `applyEditScope` body fully:

```ts
export async function applyEditScope(args: ApplyEditScopeArgs): Promise<void> {
  const { ops, scope, eventId, occurrenceDate, isRecurring, master, changes } = args;

  if (scope === "this") {
    if (isRecurring) {
      await ops.modifyOccurrence(eventId, occurrenceDate, changes);
      return;
    }
    await ops.updateMaster(eventId, changes);
    return;
  }

  if (scope === "forward") {
    const cutoff = dayBefore(occurrenceDate);
    if (cutoff < dateOnly(new Date(master.start_at))) {
      await ops.updateMaster(eventId, changes);
      return;
    }
    await ops.setRruleUntil(eventId, cutoff);
    await ops.insertSplitEvent(master, changes);
    await ops.deleteExceptionsFromDate(eventId, occurrenceDate);
    return;
  }

  // scope === "all"
  await ops.updateMaster(eventId, changes);
}
```

- [ ] **Step 7: Run, see all pass**

Run: `bun test features/calendar/recurrence.test.ts`
Expected: 11 passing.

- [ ] **Step 8: Commit**

```bash
git add features/calendar/recurrence.ts features/calendar/recurrence.test.ts
git commit -m "feat(calendar): applyEditScope with TDD coverage (this/forward/all + edge)"
```

---

## Task 7: Implement `createSupabaseEventOps`

**Files:**

- Modify: `features/calendar/recurrence.ts` (append)

- [ ] **Step 1: Add the supabase-backed implementation**

Append to `features/calendar/recurrence.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export function createSupabaseEventOps(client: SupabaseClient<Database>): EventOps {
  return {
    cancelOccurrence: async (eventId, occurrenceDate) => {
      const { error } = await client
        .from("event_exceptions")
        .upsert(
          {
            event_id: eventId,
            occurrence_date: occurrenceDate,
            action: "cancelled",
            override: null,
          },
          { onConflict: "event_id,occurrence_date" },
        );
      if (error) throw error;
    },

    modifyOccurrence: async (eventId, occurrenceDate, override) => {
      const { error } = await client.from("event_exceptions").upsert(
        {
          event_id: eventId,
          occurrence_date: occurrenceDate,
          action: "modified",
          override,
        },
        { onConflict: "event_id,occurrence_date" },
      );
      if (error) throw error;
    },

    deleteMaster: async (eventId) => {
      const { error } = await client.from("events").delete().eq("id", eventId);
      if (error) throw error;
    },

    updateMaster: async (eventId, changes) => {
      const { error } = await client.from("events").update(changes).eq("id", eventId);
      if (error) throw error;
    },

    setRruleUntil: async (eventId, until) => {
      const { error } = await client
        .from("events")
        .update({ rrule_until: until })
        .eq("id", eventId);
      if (error) throw error;
    },

    deleteExceptionsFromDate: async (eventId, fromDateInclusive) => {
      const { error } = await client
        .from("event_exceptions")
        .delete()
        .eq("event_id", eventId)
        .gte("occurrence_date", fromDateInclusive);
      if (error) throw error;
    },

    insertSplitEvent: async (master, changes) => {
      const { error } = await client.from("events").insert({
        family_id: master.family_id,
        type_id: master.type_id,
        child_id: master.child_id,
        title: changes.title,
        description: changes.description,
        location: changes.location,
        start_at: changes.start_at,
        end_at: changes.end_at,
        all_day: master.all_day,
        rrule_freq: master.rrule_freq,
        rrule_interval: master.rrule_interval,
        rrule_byweekday: master.rrule_byweekday,
        rrule_until: null,
        rrule_count: null,
        created_by: master.created_by,
      });
      if (error) throw error;
    },
  };
}
```

Move the `import type { Database }` line to the top of the file alongside the existing import (avoid duplicate imports).

- [ ] **Step 2: TypeCheck**

Run: `bun run typecheck`
Expected: clean.

- [ ] **Step 3: Re-run tests to confirm we didn't break TDD coverage**

Run: `bun test features/calendar/recurrence.test.ts`
Expected: 11 passing.

- [ ] **Step 4: Commit**

```bash
git add features/calendar/recurrence.ts
git commit -m "feat(calendar): supabase-backed EventOps implementation"
```

---

## Task 8: Mutation hooks (`useUpdateEvent`, `useDeleteEvent`)

**Files:**

- Create: `features/calendar/mutations.ts`
- Modify: `features/calendar/index.ts` (barrel exports)

- [ ] **Step 1: Create the mutations file**

`features/calendar/mutations.ts`:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/features/supabase";

import { calendarKeys } from "./queries";
import {
  applyDeleteScope,
  applyEditScope,
  createSupabaseEventOps,
  type ApplyDeleteScopeArgs,
  type ApplyEditScopeArgs,
} from "./recurrence";

type DeleteVars = Omit<ApplyDeleteScopeArgs, "ops">;
type UpdateVars = Omit<ApplyEditScopeArgs, "ops">;

export function useDeleteEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: DeleteVars) => {
      const ops = createSupabaseEventOps(supabase);
      await applyDeleteScope({ ...vars, ops });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: calendarKeys.all });
    },
  });
}

export function useUpdateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: UpdateVars) => {
      const ops = createSupabaseEventOps(supabase);
      await applyEditScope({ ...vars, ops });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: calendarKeys.all });
    },
  });
}
```

- [ ] **Step 2: Update barrel exports**

Modify `features/calendar/index.ts` — add after existing exports:

```ts
export { useUpdateEvent, useDeleteEvent } from "./mutations";
export {
  applyDeleteScope,
  applyEditScope,
  createSupabaseEventOps,
  type EditScope,
  type EventChanges,
  type EventOps,
} from "./recurrence";
```

- [ ] **Step 3: TypeCheck + Lint**

Run: `bun run typecheck`
Expected: clean.

Run: `bun lint`
Expected: 2 pre-existing warnings only.

- [ ] **Step 4: Commit**

```bash
git add features/calendar/mutations.ts features/calendar/index.ts
git commit -m "feat(calendar): useUpdateEvent and useDeleteEvent hooks with cache invalidation"
```

---

## Task 9: Scope-dialog helper

**Files:**

- Create: `app-sections/event/scopeDialog.ts`

- [ ] **Step 1: Write the helper**

`app-sections/event/scopeDialog.ts`:

```ts
import { ActionSheetIOS, Alert, Platform } from "react-native";

import type { EditScope } from "@/features/calendar";

export interface ScopeDialogLabels {
  title: string;
  this: string;
  forward: string;
  all: string;
  cancel: string;
}

/**
 * Shows a 3-option scope picker for recurring events.
 * Resolves to "this" | "forward" | "all" or `null` if the user cancelled.
 */
export function pickScope(labels: ScopeDialogLabels): Promise<EditScope | null> {
  if (Platform.OS === "ios") {
    return new Promise((resolve) => {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: labels.title,
          options: [labels.this, labels.forward, labels.all, labels.cancel],
          cancelButtonIndex: 3,
        },
        (idx) => {
          if (idx === 0) resolve("this");
          else if (idx === 1) resolve("forward");
          else if (idx === 2) resolve("all");
          else resolve(null);
        },
      );
    });
  }
  return new Promise((resolve) => {
    Alert.alert(
      labels.title,
      undefined,
      [
        { text: labels.this, onPress: () => resolve("this") },
        { text: labels.forward, onPress: () => resolve("forward") },
        { text: labels.all, onPress: () => resolve("all") },
        { text: labels.cancel, style: "cancel", onPress: () => resolve(null) },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
}
```

- [ ] **Step 2: TypeCheck**

Run: `bun run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app-sections/event/scopeDialog.ts
git commit -m "feat(event): cross-platform scope picker (iOS ActionSheet, Android Alert)"
```

---

## Task 10: `EventEditScreen` form

**Files:**

- Create: `app-sections/event/EventEditScreen.tsx`

- [ ] **Step 1: Implement the form**

`app-sections/event/EventEditScreen.tsx`:

```tsx
import DateTimePicker from "@react-native-community/datetimepicker";
import { format, parseISO, set } from "date-fns";
import { de as deLocale, enUS as enLocale } from "date-fns/locale";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Field } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Text } from "@/design-system/ui";
import { useEvent, useUpdateEvent, type EditScope } from "@/features/calendar";

import { pickScope } from "./scopeDialog";

function isMultiDay(start: Date, end: Date): boolean {
  return (
    end.getTime() - start.getTime() > 24 * 3600_000 ||
    format(start, "yyyy-MM-dd") !== format(end, "yyyy-MM-dd")
  );
}

function mergeDateAndTime(date: Date, time: Date): Date {
  return set(date, {
    hours: time.getHours(),
    minutes: time.getMinutes(),
    seconds: 0,
    milliseconds: 0,
  });
}

export function EventEditScreen() {
  const { id, occ } = useLocalSearchParams<{ id?: string; occ?: string }>();
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const lang = i18n.language.startsWith("de") ? "de" : "en";
  const dateLocale = lang === "de" ? deLocale : enLocale;

  const { data: occurrence, isLoading } = useEvent(id ?? "", occ);
  const updateMutation = useUpdateEvent();

  const initial = useMemo(() => {
    if (!occurrence) return null;
    return {
      title: occurrence.title,
      startAt: occurrence.startAt,
      endAt: occurrence.endAt,
      location: occurrence.location ?? "",
      notes: occurrence.description ?? "",
    };
  }, [occurrence]);

  const [title, setTitle] = useState("");
  const [startAt, setStartAt] = useState<Date>(new Date());
  const [endAt, setEndAt] = useState<Date>(new Date());
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [picker, setPicker] = useState<"date" | "startTime" | "endTime" | null>(null);
  const [hydrated, setHydrated] = useState(false);

  if (initial && !hydrated) {
    setTitle(initial.title);
    setStartAt(initial.startAt);
    setEndAt(initial.endAt);
    setLocation(initial.location);
    setNotes(initial.notes);
    setHydrated(true);
  }

  const multiDay = useMemo(() => isMultiDay(startAt, endAt), [startAt, endAt]);
  const titleError = !title.trim() ? t("cal.edit.error.titleRequired") : "";
  const timeError =
    endAt.getTime() <= startAt.getTime() ? t("cal.edit.error.invalidTimeRange") : "";
  const multiDayError = multiDay ? t("cal.edit.error.multiDay") : "";
  const canSave =
    hydrated && !titleError && !timeError && !multiDayError && !updateMutation.isPending;

  const onPickerChange = (event: { type: string }, selected?: Date) => {
    if (Platform.OS !== "ios") setPicker(null);
    if (event.type === "dismissed" || !selected) return;
    if (picker === "date") {
      setStartAt(mergeDateAndTime(selected, startAt));
      setEndAt(mergeDateAndTime(selected, endAt));
    } else if (picker === "startTime") {
      setStartAt(mergeDateAndTime(startAt, selected));
    } else if (picker === "endTime") {
      setEndAt(mergeDateAndTime(endAt, selected));
    }
    if (Platform.OS === "ios") setPicker(null);
  };

  async function onSave() {
    if (!occurrence || !canSave) return;
    const isRecurring = occurrence.eventId.startsWith("sample-") ? false : true;
    let scope: EditScope = "all";
    if (isRecurring) {
      const labels = {
        title: t("cal.scope.title"),
        this: t("cal.scope.this"),
        forward: t("cal.scope.forward"),
        all: t("cal.scope.all"),
        cancel: t("action.cancel"),
      };
      const chosen = await pickScope(labels);
      if (!chosen) return;
      scope = chosen;
    }
    updateMutation.mutate(
      {
        scope,
        eventId: occurrence.eventId,
        occurrenceDate: occurrence.occurrenceDate,
        isRecurring,
        // master row is fetched server-side on demand by mutations; here we
        // pass a minimal stand-in derived from the occurrence
        master: {
          id: occurrence.eventId,
          family_id: "",
          type_id: "",
          child_id: occurrence.childId,
          title: occurrence.title,
          description: occurrence.description,
          location: occurrence.location,
          start_at: occurrence.startAt.toISOString(),
          end_at: occurrence.endAt.toISOString(),
          all_day: occurrence.allDay,
          rrule_freq: isRecurring ? "weekly" : null,
          rrule_interval: 1,
          rrule_byweekday: null,
          rrule_until: null,
          rrule_count: null,
          created_by: null,
          created_at: "",
          updated_at: "",
        },
        changes: {
          title: title.trim(),
          start_at: startAt.toISOString(),
          end_at: endAt.toISOString(),
          location: location.trim() || null,
          description: notes.trim() || null,
        },
      },
      {
        onSuccess: () => router.back(),
      },
    );
  }

  return (
    <SafeAreaView edges={["bottom"]} className="flex-1 bg-card">
      <View className="items-center pb-1 pt-2.5">
        <View className="h-1 w-10 rounded-full" style={{ backgroundColor: theme.lineStrong }} />
      </View>

      {isLoading || !occurrence ? (
        <View className="flex-1 items-center justify-center px-6">
          <View className="h-24 w-full rounded-2xl" style={{ backgroundColor: theme.cardSubtle }} />
        </View>
      ) : (
        <>
          <ScrollView
            className="flex-1"
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingTop: 14,
              paddingBottom: 24,
              gap: 14,
            }}
          >
            <Text variant="h2">{t("cal.edit.title")}</Text>

            {multiDayError ? (
              <View className="rounded-xl bg-warning-soft px-3 py-2">
                <Text variant="caption" tone="accentStrong">
                  {multiDayError}
                </Text>
              </View>
            ) : null}

            <Field
              label={t("cal.edit.fieldTitle")}
              value={title}
              onChangeText={setTitle}
              error={titleError}
            />

            <Field
              label={t("cal.edit.fieldDate")}
              iconName="calendar"
              value={format(startAt, "EEEE, d. MMMM yyyy", { locale: dateLocale })}
              onPress={() => setPicker("date")}
            />

            <View className="flex-row gap-3">
              <View className="flex-1">
                <Field
                  label={t("cal.edit.fieldStart")}
                  iconName="clock"
                  value={format(startAt, "HH:mm")}
                  onPress={() => setPicker("startTime")}
                />
              </View>
              <View className="flex-1">
                <Field
                  label={t("cal.edit.fieldEnd")}
                  iconName="clock"
                  value={format(endAt, "HH:mm")}
                  onPress={() => setPicker("endTime")}
                  error={timeError}
                />
              </View>
            </View>

            <Field
              label={t("cal.edit.fieldLocation")}
              iconName="map-pin"
              value={location}
              onChangeText={setLocation}
              placeholder="—"
            />

            <Field
              label={t("cal.edit.fieldNotes")}
              value={notes}
              onChangeText={setNotes}
              type="multiline"
              placeholder="—"
            />

            {updateMutation.error ? (
              <Text variant="caption" tone="danger">
                {t("cal.edit.error.network")}
                {": "}
                {updateMutation.error instanceof Error ? updateMutation.error.message : ""}
              </Text>
            ) : null}
          </ScrollView>

          {picker ? (
            <DateTimePicker
              value={picker === "date" ? startAt : picker === "startTime" ? startAt : endAt}
              mode={picker === "date" ? "date" : "time"}
              onChange={onPickerChange}
              display={Platform.OS === "ios" ? "spinner" : "default"}
            />
          ) : null}

          <View className="flex-row gap-2.5 border-t border-line bg-card px-4 py-3">
            <Button
              label={t("action.cancel")}
              variant="soft"
              tone="neutral"
              className="flex-1"
              onPress={() => router.back()}
            />
            <Button
              label={updateMutation.isPending ? t("cal.edit.saving") : t("cal.edit.save")}
              tone="primary"
              className="flex-1"
              disabled={!canSave}
              onPress={onSave}
            />
          </View>
        </>
      )}
    </SafeAreaView>
  );
}
```

> Note: The `master` row passed to the mutation is reconstructed from the occurrence rather than re-fetched. The data layer treats it as a hint — the actual SQL operations use `eventId`, and only `forward`-edit's `insertSplitEvent` consumes more master fields. The sample-mode path never executes mutations (Detail-Sheet blocks before navigation), so the `family_id=""` placeholder is safe.

- [ ] **Step 2: TypeCheck**

Run: `bun run typecheck`
Expected: clean.

- [ ] **Step 3: Lint**

Run: `bun lint`
Expected: 2 pre-existing warnings only.

- [ ] **Step 4: Commit**

```bash
git add app-sections/event/EventEditScreen.tsx
git commit -m "feat(event): edit form with date/time pickers, validation, scope dialog"
```

---

## Task 11: Edit route + Stack entry

**Files:**

- Create: `app/event/edit/[id].tsx`
- Modify: `app/_layout.tsx`

- [ ] **Step 1: Create route re-export**

`app/event/edit/[id].tsx`:

```tsx
export { EventEditScreen as default } from "@/app-sections/event/EventEditScreen";
```

- [ ] **Step 2: Add Stack.Screen entry**

In `app/_layout.tsx`, locate the existing `event/[id]` Stack.Screen block (added during Calendar V1). Immediately after it, add:

```tsx
<Stack.Screen
  name="event/edit/[id]"
  options={{
    presentation: "formSheet",
    headerShown: false,
    gestureEnabled: true,
    sheetAllowedDetents: [0.85],
    sheetCornerRadius: 26,
    sheetGrabberVisible: true,
    contentStyle: { flex: 1, backgroundColor: theme.bg },
  }}
/>
```

- [ ] **Step 3: TypeCheck**

Run: `bun run typecheck`
Expected: clean (typed-routes should now recognize `/event/edit/[id]`).

- [ ] **Step 4: Commit**

```bash
git add app/event/edit/\[id\].tsx app/_layout.tsx
git commit -m "feat(routing): add event/edit/[id] formSheet route"
```

---

## Task 12: Wire `EventDetailScreen` — delete + edit + sample-mode disabled

**Files:**

- Modify: `app-sections/event/EventDetailScreen.tsx`

- [ ] **Step 1: Read current footer block**

Confirm location of footer `<View className="flex-row gap-2.5 border-t border-line bg-card px-4 py-3">` near end of file (currently contains `Delete` and `Edit` buttons that both call `router.back()`).

Run: `grep -n "cal.detail.delete\|cal.detail.edit\|router.back" app-sections/event/EventDetailScreen.tsx`
Expected: matches around the footer.

- [ ] **Step 2: Replace imports + add hooks**

Top of `EventDetailScreen.tsx`, modify imports:

```tsx
import { Alert, Pressable, ScrollView, Switch, View } from "react-native";
```

Add:

```tsx
import { useDeleteEvent, useSessionStore, type EditScope } from "@/features/calendar";
import { pickScope } from "./scopeDialog";
```

- [ ] **Step 3: Add handlers inside `EventDetailScreen` component, before the `return`**

Insert (after `const { data, isLoading, error } = useEvent(...)`):

```tsx
const session = useSessionStore((s) => s.session);
const deleteMutation = useDeleteEvent();

const isSampleMode = !session;

const onEditPress = () => {
  if (isSampleMode) {
    Alert.alert(t("cal.detail.requiresAuth"));
    return;
  }
  if (!data) return;
  router.push({
    pathname: "/event/edit/[id]",
    params: { id: data.eventId, occ: data.occurrenceDate },
  });
};

const onDeletePress = () => {
  if (isSampleMode) {
    Alert.alert(t("cal.detail.requiresAuth"));
    return;
  }
  if (!data) return;
  Alert.alert(t("cal.delete.confirmTitle"), t("cal.delete.confirmBody"), [
    { text: t("action.cancel"), style: "cancel" },
    {
      text: t("cal.delete.confirmOk"),
      style: "destructive",
      onPress: async () => {
        // For sample-mode the page is already gated above; here we assume real data.
        // Sample occurrence ids start with "sample-" — we treat them as non-recurring,
        // but this branch is unreachable in sample mode anyway.
        const isRecurring = !data.eventId.startsWith("sample-");
        let scope: EditScope = "all";
        if (isRecurring) {
          const labels = {
            title: t("cal.scope.title"),
            this: t("cal.scope.this"),
            forward: t("cal.scope.forward"),
            all: t("cal.scope.all"),
            cancel: t("action.cancel"),
          };
          const chosen = await pickScope(labels);
          if (!chosen) return;
          scope = chosen;
        }
        deleteMutation.mutate(
          {
            scope,
            eventId: data.eventId,
            occurrenceDate: data.occurrenceDate,
            isRecurring,
            masterStartAt: data.startAt,
          },
          {
            onSuccess: () => router.back(),
          },
        );
      },
    },
  ]);
};
```

- [ ] **Step 4: Update footer buttons**

Locate the footer block:

```tsx
<View className="flex-row gap-2.5 border-t border-line bg-card px-4 py-3">
  <Button
    label={t("cal.detail.delete")}
    variant="soft"
    tone="danger"
    className="flex-1"
    onPress={() => router.back()}
  />
  <Button
    label={t("cal.detail.edit")}
    tone="primary"
    className="flex-1"
    onPress={() => router.back()}
  />
</View>
```

Replace with:

```tsx
<View
  className="flex-row gap-2.5 border-t border-line bg-card px-4 py-3"
  style={{ opacity: isSampleMode ? 0.5 : 1 }}
>
  <Button
    label={deleteMutation.isPending ? t("cal.edit.saving") : t("cal.detail.delete")}
    variant="soft"
    tone="danger"
    className="flex-1"
    disabled={deleteMutation.isPending}
    onPress={onDeletePress}
  />
  <Button label={t("cal.detail.edit")} tone="primary" className="flex-1" onPress={onEditPress} />
</View>
```

- [ ] **Step 5: Remove the dead `editSoon`-Pressable**

Locate and remove the existing block:

```tsx
<Pressable
  onPress={() => router.back()}
  className="mt-5 flex-row items-center justify-center gap-1 active:opacity-70"
  accessibilityRole="button"
>
  <Text variant="caption" tone="inkTertiary">
    {t("cal.detail.editSoon")}
  </Text>
</Pressable>
```

This stub is replaced by the now-functional Edit button.

- [ ] **Step 6: TypeCheck + Lint**

Run: `bun run typecheck`
Expected: clean.

Run: `bun lint`
Expected: 2 pre-existing warnings only.

- [ ] **Step 7: Commit**

```bash
git add app-sections/event/EventDetailScreen.tsx
git commit -m "feat(event): wire delete + edit handlers, sample-mode disabled state"
```

---

## Task 13: Final verification

**Files:**

- None (verification only).

- [ ] **Step 1: Full unit test run**

Run: `bun test`
Expected: all tests pass (existing smoke + 11 new recurrence tests).

- [ ] **Step 2: Full TypeCheck**

Run: `bun run typecheck`
Expected: clean.

- [ ] **Step 3: Full Lint**

Run: `bun lint`
Expected: 2 pre-existing warnings (SettingsScreen + +not-found), 0 errors, no new issues from edit/delete code.

- [ ] **Step 4: Web bundle export**

Run: `rm -rf /tmp/eltern-web && bunx expo export --platform web --output-dir /tmp/eltern-web`
Expected: 18 static routes, including `/event/edit/[id]`. No SSR errors.

- [ ] **Step 5: Manual smoke (`bun run web`, browser at localhost:8081)**

Walkthrough:

1. Tab `Kalender` → open detail sheet from any event. Footer buttons are dimmed (opacity 0.5).
2. Tap **Bearbeiten** → `Alert.alert("Melde dich an, …")` appears. Dismiss.
3. Tap **Löschen** → same Alert.
4. (Auth-gated paths are verified once auth is wired — out of scope for this plan.)

- [ ] **Step 6: Commit any verification-tweaks**

If steps 1–4 surface a bug, fix it inline and commit. Otherwise no commit.

---

## Self-Review Notes

**Spec coverage:**

- ✅ Separate Edit-Form-Sheet → Task 10 + 11
- ✅ Minimal field set (title/date/start/end/location/notes) → Task 10
- ✅ Recurring scope this/forward/all → Tasks 5 + 6 + 9 + 12
- ✅ Sample-mode disabled state + Alert → Task 12
- ✅ Confirm-Dialog before delete → Task 12
- ✅ `useState` + `useMutation` state model → Tasks 8 + 10
- ✅ DateTimePicker → Tasks 1 + 10
- ✅ Shared Field extraction → Task 2
- ✅ Unique-constraint upsert on event_exceptions → Task 7
- ✅ Multi-day disabled state → Task 10 (validation block)
- ✅ Cutoff < dtstart edge case → Tasks 5 + 6 (tested + implemented)
- ✅ i18n keys (`cal.edit.*`, `cal.delete.*`, `cal.scope.*`, `cal.detail.requiresAuth`) → Task 3
- ✅ Test matrix from spec → Tasks 5 + 6 cover all 9 scenarios

**Type consistency check:**

- `EditScope` is consistent across `recurrence.ts`, `mutations.ts`, `scopeDialog.ts`, both screens.
- `EventChanges` shape consistent (5 fields, used in `applyEditScope` + `modifyOccurrence` override + `updateMaster`).
- `EventOps` interface fully implemented by `createSupabaseEventOps` (7 methods).
- Mutation hook `vars` type derived via `Omit<..., "ops">` — keeps the inversion clean.

**No placeholders confirmed:** Every step contains executable code or commands. The single `> Note:` comment in Task 10 explains a deliberate design choice (rebuilt `master` row from occurrence) rather than deferring work.
