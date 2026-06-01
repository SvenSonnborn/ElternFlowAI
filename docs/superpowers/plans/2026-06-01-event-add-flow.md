# Event Add-Flow Implementation Plan

**Goal:** Make new calendar events creatable from the UI. Two entry points (TopBar "+" and SectionHeader "+") on the Kalender screen open a typed form sheet with type/child pickers, datetime fields, all-day toggle, location/notes, simple recurrence radio, and live conflict detection. INSERT mutation persists to Supabase `events`.

**Architecture:** Two screens (Create + Edit stay separated; shared building blocks live in `app-sections/event/`). Data layer gains `useEventTypes` query and `useCreateEvent` mutation. A pure `recurrenceToRrule` helper maps the 5 UI options to DB `rrule_*` columns and is unit-tested in isolation.

**Tech Stack:** Expo Router 6 · React Native 0.81 · TanStack Query 5 · Supabase JS 2 · NativeWind 4 · react-i18next · bun:test · `@react-native-community/datetimepicker` (already installed).

**Design source:** [patterns/calendar.md](../../../patterns/calendar.md) (Add-event flow + Recurrence + Conflict detection sections).

**User decisions (from design conversation):**

- Entry points: TopBar trailing "+" AND SectionHeader trailing "+".
- Form scope: Pattern-doc-full = title, date, start/end, all-day toggle, type, child, location, notes, recurrence radio.
- Conflict detection: included now (yellow inline warning under time field).
- Edit/Create screens: kept separate.

---

## Task 1: i18n keys

**Files:**

- Modify: `features/i18n/locales/de.json`
- Modify: `features/i18n/locales/en.json`

- [ ] **Step 1: Extend `cal.add` and add `cal.create` + `cal.recur` to `de.json`.**

  Replace existing `cal.add` block:

  ```json
  "add": {
    "voice": "Termin per Sprache",
    "new": "Termin hinzufügen",
    "requiresAuth": "Melde dich an, um Termine hinzuzufügen."
  }
  ```

  Append (inside `cal`, alongside `edit`/`delete`/`scope`):

  ```json
  ,
  "create": {
    "title": "Termin hinzufügen",
    "fieldType": "Typ",
    "fieldChild": "Kind",
    "fieldAllDay": "Ganztägig",
    "fieldRecurrence": "Wiederholung",
    "noChild": "Niemand",
    "save": "Hinzufügen",
    "saving": "Speichere…",
    "conflict_one": "Kollision mit {{title}} · {{from}}–{{to}}",
    "conflict_other": "{{count}} Kollisionen — {{title}} · {{from}}–{{to}} u.a.",
    "error": {
      "typeRequired": "Bitte einen Typ wählen",
      "noFamily": "Familie noch nicht eingerichtet"
    }
  },
  "recur": {
    "none": "Keine",
    "daily": "Täglich",
    "weekdays": "Werktags",
    "weekly": "Wöchentlich",
    "monthly": "Monatlich"
  }
  ```

- [ ] **Step 2: Mirror to `en.json`** with English copy. Same keys; conflict messages use `"Conflicts with {{title}} · {{from}}–{{to}}"`.

- [ ] **Step 3: Validate JSON.**

  ```bash
  jq '.cal.add, .cal.create, .cal.recur' features/i18n/locales/de.json
  jq '.cal.add, .cal.create, .cal.recur' features/i18n/locales/en.json
  ```

- [ ] **Step 4: Commit.**

  ```bash
  git add features/i18n/locales/de.json features/i18n/locales/en.json
  git commit -m "feat(i18n): add cal.add/cal.create/cal.recur keys for event add-flow"
  ```

---

## Task 2: Extend shared TopBar + SectionHeader

**Files:**

- Modify: `app-sections/shared/TopBar.tsx`
- Modify: `app-sections/shared/SectionHeader.tsx`

- [ ] **Step 1: Add `onAdd` prop to TopBar.**

  Add `onAdd?: () => void` to the interface. When present, render a 36×36 pressable with `Icon name="plus"` and `theme.primaryStrong` color on a `theme.primarySoft` background, immediately before the settings button. Accessibility: `accessibilityLabel={t("cal.add.new")}` via prop callback context. Keep `hideSettings` working.

- [ ] **Step 2: Add `onPressAdd` prop to SectionHeader.**

  Add `onPressAdd?: () => void`. When present (and existing `action` not set), render a 32×32 ghost pressable with `Icon name="plus"` (theme.inkSecondary, hover-equivalent on press). Generalizing here is unnecessary — keep `action`/`onPressAction` path intact for other consumers.

- [ ] **Step 3: TypeCheck + Lint.**

  ```bash
  bun run typecheck && bun lint
  ```

- [ ] **Step 4: Commit.**

  ```bash
  git add app-sections/shared/TopBar.tsx app-sections/shared/SectionHeader.tsx
  git commit -m "feat(shared): add onAdd to TopBar and onPressAdd to SectionHeader"
  ```

---

## Task 3: `useEventTypes` query

**Files:**

- Modify: `features/calendar/queries.ts`
- Modify: `features/calendar/hooks.ts`
- Modify: `features/calendar/index.ts`

- [ ] **Step 1: Add `fetchEventTypes` to `queries.ts`.**

  ```ts
  export async function fetchEventTypes(): Promise<EventTypeRow[]> {
    const { data, error } = await supabase.from("event_types").select("*").order("slug");
    if (error) throw error;
    return data ?? [];
  }
  ```

  Add `calendarKeys.types: ["calendar", "types"] as const`.

  Import `EventTypeRow` from `@/features/supabase/database.types`.

- [ ] **Step 2: Add `useEventTypes` hook to `hooks.ts`** with `staleTime: 5 * 60_000` (types rarely change).

- [ ] **Step 3: Export from barrel** (`index.ts` adds `useEventTypes`).

- [ ] **Step 4: TypeCheck + Lint + Commit.**

  ```bash
  git add features/calendar/queries.ts features/calendar/hooks.ts features/calendar/index.ts
  git commit -m "feat(calendar): add useEventTypes query with 5min staleTime"
  ```

---

## Task 4: `recurrenceToRrule` helper + `useCreateEvent` mutation (TDD)

**Files:**

- Create: `features/calendar/createMutation.ts`
- Create: `features/calendar/createMutation.test.ts`
- Modify: `features/calendar/mutations.ts` (re-export)
- Modify: `features/calendar/index.ts`

- [ ] **Step 1: Write test scaffold and first failing test for `recurrenceToRrule`.**

  `features/calendar/createMutation.test.ts`:

  ```ts
  import { describe, expect, test } from "bun:test";

  import { recurrenceToRrule } from "./createMutation";

  describe("recurrenceToRrule", () => {
    test("none → all null", () => {
      const r = recurrenceToRrule("none", new Date("2026-06-03T16:00:00Z"));
      expect(r.rrule_freq).toBeNull();
      expect(r.rrule_byweekday).toBeNull();
    });
  });
  ```

  Stub: `export type RecurrenceOption = "none" | "daily" | "weekdays" | "weekly" | "monthly"; export function recurrenceToRrule(_opt: RecurrenceOption, _start: Date) { throw new Error("not implemented"); }`

  Run `bun test features/calendar/createMutation.test.ts` → 1 failing.

- [ ] **Step 2: Implement `recurrenceToRrule` covering all 5 cases.**

  ```ts
  import type { Database } from "@/features/supabase/database.types";
  type EventRow = Database["public"]["Tables"]["events"]["Row"];

  export type RecurrenceOption = "none" | "daily" | "weekdays" | "weekly" | "monthly";

  export interface RruleFields {
    rrule_freq: EventRow["rrule_freq"];
    rrule_interval: number;
    rrule_byweekday: number[] | null;
  }

  export function recurrenceToRrule(opt: RecurrenceOption, startAt: Date): RruleFields {
    switch (opt) {
      case "none":
        return { rrule_freq: null, rrule_interval: 1, rrule_byweekday: null };
      case "daily":
        return { rrule_freq: "daily", rrule_interval: 1, rrule_byweekday: null };
      case "weekdays":
        return { rrule_freq: "weekly", rrule_interval: 1, rrule_byweekday: [1, 2, 3, 4, 5] };
      case "weekly": {
        const isoWeekday = ((startAt.getDay() + 6) % 7) + 1; // 1=Mon … 7=Sun
        return { rrule_freq: "weekly", rrule_interval: 1, rrule_byweekday: [isoWeekday] };
      }
      case "monthly":
        return { rrule_freq: "monthly", rrule_interval: 1, rrule_byweekday: null };
    }
  }
  ```

- [ ] **Step 3: Add tests for daily, weekdays, weekly (verify ISO day calc), monthly.** All 5 pass.

- [ ] **Step 4: Add `CreateEventVars` type + `useCreateEvent` hook to `createMutation.ts`.**

  ```ts
  export interface CreateEventVars {
    familyId: string;
    typeId: string;
    childId: string | null;
    title: string;
    startAt: string; // ISO
    endAt: string; // ISO
    allDay: boolean;
    location: string | null;
    description: string | null;
    recurrence: RecurrenceOption;
    createdBy: string | null;
  }

  export async function createEvent(vars: CreateEventVars): Promise<void> {
    const rrule = recurrenceToRrule(vars.recurrence, new Date(vars.startAt));
    const { error } = await supabase.from("events").insert({
      family_id: vars.familyId,
      type_id: vars.typeId,
      child_id: vars.childId,
      title: vars.title,
      description: vars.description,
      location: vars.location,
      start_at: vars.startAt,
      end_at: vars.endAt,
      all_day: vars.allDay,
      rrule_freq: rrule.rrule_freq,
      rrule_interval: rrule.rrule_interval,
      rrule_byweekday: rrule.rrule_byweekday,
      created_by: vars.createdBy,
    });
    if (error) throw error;
  }

  export function useCreateEvent() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: createEvent,
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: calendarKeys.all });
      },
    });
  }
  ```

- [ ] **Step 5: Re-export from `mutations.ts` and `index.ts`.**

- [ ] **Step 6: TypeCheck + bun test + Commit.**

  ```bash
  git add features/calendar/
  git commit -m "feat(calendar): useCreateEvent + recurrenceToRrule with TDD coverage (5 cases)"
  ```

---

## Task 5: Form sub-components

**Files:**

- Create: `app-sections/event/TypePicker.tsx`
- Create: `app-sections/event/ChildPicker.tsx`
- Create: `app-sections/event/RecurrenceRadio.tsx`

- [ ] **Step 1: `TypePicker.tsx` — horizontal chip strip.**

  Props: `{ types: EventTypeRow[]; selectedTypeId: string | null; onSelect: (typeId: string) => void; error?: string }`. Layout: flex-row wrap, gap-2. Each chip: 32px height, `eventColorFor(slug, ...)` 7px dot + `typeLabelsForSlug(slug)[lang]` label. Selected: bg = dot-color @ 26% alpha (`${color}26`), text = dot-color. Unselected: bg `theme.cardSubtle`, text `theme.inkSecondary`, border `theme.line`. Uppercase label "TYP" eyebrow above.

- [ ] **Step 2: `ChildPicker.tsx` — avatar row + clear pill.**

  Props: `{ children: Pick<ChildRow, "id" | "name" | "color">[]; selectedChildId: string | null; onSelect: (id: string | null) => void }`. Layout: flex-row gap-2. Each child: pressable wrapping `<ChildAvatar size="md">` + small caption below. "Niemand" pill at end (matches `<Pill>` baseline) — selecting it sets `selectedChildId=null`. Selected: 2px ring `theme.primaryStrong` around avatar via outer `View` with border. If `children.length === 0`, render nothing.

- [ ] **Step 3: `RecurrenceRadio.tsx` — vertical radio list.**

  Props: `{ value: RecurrenceOption; onChange: (v: RecurrenceOption) => void }`. Renders 5 rows, each 40px height: 18px radio circle (selected = filled `theme.primaryStrong`, ring `theme.line`) + label from `t("cal.recur.<key>")`. Border-bottom between rows except last.

- [ ] **Step 4: TypeCheck + Lint + Commit.**

  ```bash
  git add app-sections/event/TypePicker.tsx app-sections/event/ChildPicker.tsx app-sections/event/RecurrenceRadio.tsx
  git commit -m "feat(event): TypePicker, ChildPicker, RecurrenceRadio form sub-components"
  ```

---

## Task 6: `EventCreateScreen` + route + Stack entry

**Files:**

- Create: `app-sections/event/EventCreateScreen.tsx`
- Create: `app/event/new.tsx`
- Modify: `app/_layout.tsx`

- [ ] **Step 1: Implement `EventCreateScreen.tsx`** (≈250 lines):
  - Read optional `date` URL param via `useLocalSearchParams<{ date?: string }>`. Default to today.
  - State: title, startAt (Date), endAt (Date), allDay (bool), location, notes, typeId, childId, recurrence.
  - Compute defaults on mount: date = param or today; start = next half-hour; end = +60min; type = `family` (after types load); child = null; allDay = false; recurrence = `none`.
  - Validation: titleError if empty; typeError if no typeId; timeError if `endAt <= startAt && !allDay`.
  - Conflict detection: pull `useFamilyEvents(startAt)`. Compute `conflicts = occurrences.filter(o => o.occurrenceDate === format(startAt, "yyyy-MM-dd") && (childId === null || o.childId === childId) && rangesOverlap(o.startAt, o.endAt, startAt, endAt))`. Show yellow warning chip under time row.
  - Layout (ScrollView): h2 "Termin hinzufügen" → TypePicker → ChildPicker → Title field → Date field → Start/End row → all-day Switch row → Location → Notes → RecurrenceRadio → error text.
  - Footer (sticky): Cancel | Hinzufügen.
  - Save: read `useCurrentParent().data.family_id`, `useCurrentParent().data.id` for `created_by`. If null → set general error.

- [ ] **Step 2: Add route re-export.**

  `app/event/new.tsx`:

  ```tsx
  export { EventCreateScreen as default } from "@/app-sections/event/EventCreateScreen";
  ```

- [ ] **Step 3: Add Stack.Screen entry in `app/_layout.tsx`** mirroring `event/edit/[id]` with `sheetAllowedDetents: [0.9]` (more vertical room for recurrence section).

- [ ] **Step 4: TypeCheck + Lint + Commit.**

  ```bash
  git add app-sections/event/EventCreateScreen.tsx app/event/new.tsx app/_layout.tsx
  git commit -m "feat(event): EventCreateScreen with type/child pickers, all-day, recurrence, conflict warning"
  ```

---

## Task 7: Wire KalenderScreen "+" handlers

**Files:**

- Modify: `app-sections/(tabs)/kalender/KalenderScreen.tsx`
- Modify: `docs/TODO.md` (remove the resolved Add-Flow line)

- [ ] **Step 1: Add `useSessionStore` import + open-add handler.**

  ```tsx
  function openAdd(date?: string) {
    if (!session) {
      Alert.alert(t("cal.add.requiresAuth"));
      return;
    }
    router.push({ pathname: "/event/new", params: date ? { date } : {} });
  }
  ```

- [ ] **Step 2: Wire `<TopBar onAdd={() => openAdd()}>` and `<SectionHeader onPressAdd={() => openAdd(selectedDate)}>`.**

- [ ] **Step 3: Remove the resolved bullet** "Add-Event-Flow existiert noch nicht…" from [docs/TODO.md](../../TODO.md). Add new bullet for the recurrence-editor symmetry follow-up if not yet there (Edit form still misses recurrence editing while Create supports it).

- [ ] **Step 4: TypeCheck + Lint + Commit.**

  ```bash
  git add app-sections/\(tabs\)/kalender/KalenderScreen.tsx docs/TODO.md
  git commit -m "feat(calendar): wire + buttons in TopBar and SectionHeader for event add"
  ```

---

## Task 8: Final verification

- [ ] **Step 1:** `bun test` — all tests pass (existing + new recurrence-mapping).
- [ ] **Step 2:** `bun run typecheck` — clean.
- [ ] **Step 3:** `bun lint` — same pre-existing warnings, no new.
- [ ] **Step 4:** `rm -rf /tmp/eltern-web && bunx expo export --platform web --output-dir /tmp/eltern-web` — new route `/event/new` builds; no SSR errors.
- [ ] **Step 5:** Manual web smoke at `bun run web`:
  - Tab Kalender. "+" visible in TopBar (next to ⚙) AND SectionHeader.
  - Tap TopBar "+": form opens, date defaults today.
  - Tap SectionHeader "+": form opens, date defaults to selected day.
  - Select different types: chip color animation; Speichern-button enables once title set.
  - All-day toggle: time pickers disappear; saving creates 00:00–23:59 event.
  - Add overlapping event on same date: yellow conflict warning appears under BIS.
  - Recurrence radio: pick "Wöchentlich" → save → grid shows dots on subsequent same-weekday cells.
- [ ] **Step 6:** Sample-mode (no auth): "+" Alert "Melde dich an, …" appears. Dismiss.

---

## Self-Review

**Spec coverage:**

- ✅ TopBar + SectionHeader "+" entry points → patterns/calendar.md L46
- ✅ Form fields (title/date/start/end/location/notes/recurrence) → patterns/calendar.md L62
- ✅ Recurrence radio (none/daily/weekdays/weekly/monthly) → patterns/calendar.md L62
- ✅ Conflict detection inline warning → patterns/calendar.md L66
- ✅ All-day toggle → DB column exists; pattern allows
- ✅ Sample-mode disabled state via Alert → mirrors EventDetailScreen pattern
- ✅ Type picker + Child picker with handoff palette → palette.event.\*

**What's deferred (logged in TODO.md):**

- Voice-FAB → form flow (depends on STT/LLM provider).
- Recurrence editing in `EventEditScreen` (Create supports it, Edit doesn't; documented asymmetry).
- Recurrence end-date / count (only `none`/freq, no `rrule_until` UI yet).
- Multi-day-event creation (multiDay validation blocks like Edit does).

**Pure-function discipline:**

- `recurrenceToRrule` is pure → unit-tested in `createMutation.test.ts`.
- `rangesOverlap` likewise pure.

**Mutation invalidation:**

- `onSuccess` → `invalidateQueries({ queryKey: calendarKeys.all })`. Grid refetches; new event appears in same selectedDate view.
