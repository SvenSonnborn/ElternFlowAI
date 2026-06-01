# Calendar Update — Master-Row Refetch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `forward`-scope edits on recurring events work against real Supabase data by refetching the canonical master row inside `useUpdateEvent` instead of reconstructing it from a `CalendarOccurrence`.

**Architecture:** Today `EventEditScreen.onSave()` hand-builds a fake `master: EventRow` with empty `family_id` / `type_id` and a hardcoded `rrule_freq: "weekly"`, then passes it to `useUpdateEvent.mutate()`. A defensive throw in `mutations.ts` blocks the FK-violation that this fake row would cause on the `forward` path. The fix removes `master` from the hook's public API and refetches it inside the mutation via the existing `fetchEventById(eventId)`. The pure `applyEditScope` function stays untouched — DI keeps it testable without a DB.

**Tech Stack:** React 19 + TanStack Query, Supabase JS, Bun test runner (`bun:test`), TypeScript strict.

---

## Task 1: Add `updateEvent` orchestrator with DI

Extract the master-refetch + apply-scope logic into a plain async function that takes its dependencies via parameter. Lets us test the refetch behavior without React or a real Supabase client. The existing `useUpdateEvent` hook becomes a thin wrapper that wires real deps.

**Files:**

- Modify: `features/calendar/mutations.ts` (full rewrite — small file)
- Create: `features/calendar/mutations.test.ts`

- [ ] **Step 1: Write the failing test**

Create `features/calendar/mutations.test.ts` with:

```ts
import { describe, expect, mock, test } from "bun:test";

import type { Database } from "@/features/supabase/database.types";

import { updateEvent, type UpdateEventDeps, type UpdateEventVars } from "./mutations";
import type { EventChanges, EventOps } from "./recurrence";

type EventRow = Database["public"]["Tables"]["events"]["Row"];

const MASTER_START = new Date("2026-05-04T16:30:00.000Z");

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

const CHANGES: EventChanges = {
  title: "Neuer Titel",
  start_at: "2026-06-15T15:00:00.000Z",
  end_at: "2026-06-15T16:00:00.000Z",
  location: null,
  description: null,
};

const BASE_VARS: UpdateEventVars = {
  scope: "all",
  eventId: "evt-1",
  occurrenceDate: "2026-06-15",
  isRecurring: true,
  changes: CHANGES,
};

describe("updateEvent", () => {
  test("scope=all → fetches master and calls updateMaster", async () => {
    const master = makeMaster();
    const fetchMaster = mock((_id: string) => Promise.resolve(master));
    const ops = makeOps();
    const deps: UpdateEventDeps = { fetchMaster, ops };

    await updateEvent(BASE_VARS, deps);

    expect(fetchMaster).toHaveBeenCalledWith("evt-1");
    expect(ops.updateMaster).toHaveBeenCalledWith("evt-1", CHANGES);
  });

  test("scope=forward on recurring → uses refetched master for insertSplitEvent", async () => {
    const master = makeMaster();
    const fetchMaster = mock((_id: string) => Promise.resolve(master));
    const ops = makeOps();

    await updateEvent({ ...BASE_VARS, scope: "forward" }, { fetchMaster, ops });

    expect(fetchMaster).toHaveBeenCalledWith("evt-1");
    expect(ops.setRruleUntil).toHaveBeenCalledWith("evt-1", "2026-06-14");
    expect(ops.insertSplitEvent).toHaveBeenCalledWith(master, CHANGES);
    expect(ops.deleteExceptionsFromDate).toHaveBeenCalledWith("evt-1", "2026-06-15");
  });

  test("throws when fetchMaster returns null", async () => {
    const fetchMaster = mock((_id: string) => Promise.resolve(null));
    const ops = makeOps();

    await expect(updateEvent(BASE_VARS, { fetchMaster, ops })).rejects.toThrow(
      /Event evt-1 not found/,
    );
    expect(ops.updateMaster).not.toHaveBeenCalled();
  });

  test("scope=this on non-recurring → still refetches master then updateMaster", async () => {
    const master = makeMaster({ rrule_freq: null });
    const fetchMaster = mock((_id: string) => Promise.resolve(master));
    const ops = makeOps();

    await updateEvent({ ...BASE_VARS, scope: "this", isRecurring: false }, { fetchMaster, ops });

    expect(fetchMaster).toHaveBeenCalledWith("evt-1");
    expect(ops.updateMaster).toHaveBeenCalledWith("evt-1", CHANGES);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test features/calendar/mutations.test.ts`
Expected: FAIL — module exports `updateEvent` / `UpdateEventDeps` / `UpdateEventVars` don't exist yet.

- [ ] **Step 3: Rewrite `features/calendar/mutations.ts`**

Replace the file with:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { Database } from "@/features/supabase/database.types";
import { supabase } from "@/features/supabase";

import { calendarKeys, fetchEventById } from "./queries";
import {
  applyDeleteScope,
  applyEditScope,
  createSupabaseEventOps,
  type ApplyDeleteScopeArgs,
  type EditScope,
  type EventChanges,
  type EventOps,
} from "./recurrence";

type EventRow = Database["public"]["Tables"]["events"]["Row"];

type DeleteVars = Omit<ApplyDeleteScopeArgs, "ops">;

export interface UpdateEventVars {
  scope: EditScope;
  eventId: string;
  occurrenceDate: string;
  isRecurring: boolean;
  changes: EventChanges;
}

export interface UpdateEventDeps {
  fetchMaster: (eventId: string) => Promise<EventRow | null>;
  ops: EventOps;
}

export async function updateEvent(vars: UpdateEventVars, deps: UpdateEventDeps): Promise<void> {
  const master = await deps.fetchMaster(vars.eventId);
  if (!master) {
    throw new Error(`Event ${vars.eventId} not found`);
  }
  await applyEditScope({
    scope: vars.scope,
    eventId: vars.eventId,
    occurrenceDate: vars.occurrenceDate,
    isRecurring: vars.isRecurring,
    master,
    changes: vars.changes,
    ops: deps.ops,
  });
}

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
    mutationFn: async (vars: UpdateEventVars) => {
      const ops = createSupabaseEventOps(supabase);
      await updateEvent(vars, { fetchMaster: fetchEventById, ops });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: calendarKeys.all });
    },
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test features/calendar/`
Expected: PASS — 16 tests across 2 files (12 existing + 4 new).

- [ ] **Step 5: Commit**

```bash
git add features/calendar/mutations.ts features/calendar/mutations.test.ts
git commit -m "refactor(calendar): refetch master inside useUpdateEvent

The forward-edit path needed the canonical events row (family_id, type_id,
rrule_*) for insertSplitEvent. EventEditScreen used to hand-build a fake
master from CalendarOccurrence, which only worked because a defensive throw
in mutations.ts blocked the FK-violation in real usage.

Drop master from the hook's public API and refetch it inside the new
updateEvent orchestrator via fetchEventById. The pure applyEditScope stays
unchanged — DI keeps the orchestrator testable without React or Supabase."
```

---

## Task 2: Drop the fake-master construction in `EventEditScreen`

Now that `useUpdateEvent` no longer accepts a `master` field, the screen stops building one. Removes ~30 lines of dead state plus the inline comments warning about the workaround.

**Files:**

- Modify: `app-sections/event/EventEditScreen.tsx:109-149`

- [ ] **Step 1: Edit the mutation call**

Replace the existing `updateMutation.mutate({...})` call (the block spanning ~lines 109-153 in the current file) with:

```tsx
updateMutation.mutate(
  {
    scope,
    eventId: occurrence.eventId,
    occurrenceDate: occurrence.occurrenceDate,
    isRecurring,
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
```

The `master: { ... }` block disappears entirely along with its two inline comments.

- [ ] **Step 2: Verify typecheck passes**

Run: `bun run typecheck`
Expected: no errors. (The new `UpdateEventVars` no longer has `master`, so the screen now matches the hook's type.)

- [ ] **Step 3: Run lint**

Run: `bun lint`
Expected: no errors.

- [ ] **Step 4: Run all tests**

Run: `bun test`
Expected: all green — no test touches the removed code path.

- [ ] **Step 5: Commit**

```bash
git add app-sections/event/EventEditScreen.tsx
git commit -m "refactor(calendar): drop fake-master construction in EventEditScreen

useUpdateEvent now refetches the canonical events row internally, so the
screen no longer needs to hand-build a stub. Removes ~30 lines of dead
state plus the inline comments warning about the workaround."
```

---

## Task 3: Resolve `docs/TODO.md` entries

Two TODO bullets were explicitly blocked on this fix and are now resolved. Per CLAUDE.md, **delete** the entries — don't just check them off.

**Files:**

- Modify: `docs/TODO.md` (Calendar section — remove the first bullet about EventEditScreen reconstructing master; Auth section — remove the bullet "Sobald Auth lebt: EventEditScreen-Master-Row-Fix oben")

- [ ] **Step 1: Delete the Calendar bullet**

In `docs/TODO.md`, delete the entire bullet that starts with **EventEditScreen rekonstruiert `master`-Row aus der `CalendarOccurrence`** (it spans roughly line 7 in the current file, including its full multi-line body that ends with "den `master`-Parameter aus dem Screen entfernen.").

- [ ] **Step 2: Delete the Auth bullet**

In `docs/TODO.md`, delete the bullet `- Sobald Auth lebt: EventEditScreen-Master-Row-Fix oben (siehe Calendar-Sektion).` under the "Auth / Onboarding" section.

- [ ] **Step 3: Final verification — typecheck + lint + test**

Run sequentially:

```bash
bun run typecheck
bun lint
bun test
```

Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add docs/TODO.md
git commit -m "docs(todo): remove resolved calendar master-refetch entries"
```

- [ ] **Step 5: Show final state**

Run: `git log --oneline main..HEAD`
Expected: 3 commits.

```bash
git status
```

Expected: clean.

---

## Out of scope

These follow-up items intentionally stay in `docs/TODO.md` — they are independent of the master-refetch fix:

- `rrule_count`-aware forward-split (still unresolved, separate logic in `insertSplitEvent`).
- Recurrence editor (`rrule_freq`, `rrule_interval`, `rrule_byweekday` not editable from the form).
- Multi-day-event editor (still gated).
- Add-Event-Flow.
- Reminder-Switches persistence.

## Self-review notes

- **Spec coverage:** Task 1 implements the TODO fix exactly as written ("Im `useUpdateEvent`-Hook bei `scope === forward` den Master via `fetchEventById(eventId)` refetchen und dort übergeben"). Task 2 deletes the workaround from the screen. Task 3 prunes the resolved TODOs per CLAUDE.md workflow.
- **Always-refetch trade-off:** The new code refetches the master row on every save, not just `scope=forward`. Cost is one extra Supabase round-trip (~50ms) per save versus a complex branch. Worth it for a single uniform code path. Listed here so a reviewer doesn't need to ask.
- **Defensive throw removed:** The `if (vars.scope === "forward" && ... && !vars.master.family_id) throw …` guard in the old `mutations.ts` is gone — without a `master` field in `UpdateEventVars`, the bug it caught is now impossible to express.
- **No commit trailer:** Per CLAUDE.md, do NOT add `Co-Authored-By: Claude …`. Commit messages above already comply.
