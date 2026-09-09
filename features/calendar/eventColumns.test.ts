import type { SupabaseClient } from "@supabase/supabase-js";

import { describe, expect, mock, test } from "bun:test";

import type { Database } from "@/features/supabase/database.types";

import type { EventChanges } from "./recurrence";

import { createSupabaseEventOps } from "./recurrence";

let inserted: { table: string; payload: Record<string, unknown> | undefined } = {
  table: "",
  payload: undefined,
};

const supabase = {
  from(table: string) {
    inserted.table = table;
    return {
      insert(payload: Record<string, unknown>) {
        inserted.payload = payload;
        return Promise.resolve({ error: null });
      },
    };
  },
};

void mock.module("@/features/supabase", () => ({ supabase }));

// Nach dem Modul-Mock importiert: ein statischer Import würde darüber
// hochgezogen und `createMutation.ts` griffe den echten Client ab.
// Gleiches Muster wie in `reminders.test.ts`.
const { createEvent, optimisticEventRow } = await import("./createMutation");

type EventRow = Database["public"]["Tables"]["events"]["Row"];

/**
 * Die Spalten von `EventRow`, zur Laufzeit lesbar.
 *
 * TypeScript löscht Typen, eine handgeführte Liste im Test wäre also eine
 * zweite Wahrheit, die still veraltet — genau der Zustand, der `parent_id`
 * jahrelang hat durchrutschen lassen. `Record<keyof EventRow, true>` bindet die
 * Liste an den generierten Datenbank-Typ: Kommt eine Spalte dazu, schlägt
 * `bun run typecheck` hier fehl, bevor überhaupt ein Test läuft.
 */
const EVENT_ROW_COLUMNS: Record<keyof EventRow, true> = {
  id: true,
  family_id: true,
  type_id: true,
  child_id: true,
  parent_id: true,
  title: true,
  description: true,
  location: true,
  start_at: true,
  end_at: true,
  all_day: true,
  timezone: true,
  rrule_freq: true,
  rrule_interval: true,
  rrule_byweekday: true,
  rrule_until: true,
  rrule_count: true,
  created_by: true,
  created_at: true,
  updated_at: true,
};

/**
 * Spalten, die ein Insert bewusst dem Server überlässt:
 * `id` hat `default gen_random_uuid()`, `created_at` hat `default now()`, und
 * `updated_at` gehört seit ADR-031 dem `set_updated_at`-Trigger. Sie hier zu
 * setzen wäre falsch, nicht nur überflüssig.
 */
const SERVER_OWNED: readonly (keyof EventRow)[] = ["id", "created_at", "updated_at"];

/** Jede Spalte, die ein Schreiber selbst füllen muss. Sortiert, damit der Vergleich stabil ist. */
function requiredInsertColumns(): string[] {
  return Object.keys(EVENT_ROW_COLUMNS)
    .filter((column) => !SERVER_OWNED.includes(column as keyof EventRow))
    .sort();
}

/**
 * Doppelgänger des Query-Builders, den `insertSplitEvent` durchläuft
 * (`.from().insert()`). Der echte Aufruf wird direkt `await`-ed, das Fake gibt
 * deshalb eine Promise zurück, kein Builder.
 */
function fakeInsertClient() {
  const calls = { table: "", payload: undefined as Record<string, unknown> | undefined };
  const client = {
    from(table: string) {
      calls.table = table;
      return {
        insert(payload: Record<string, unknown>) {
          calls.payload = payload;
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, calls };
}

function master(overrides: Partial<EventRow> = {}): EventRow {
  return {
    id: "evt-1",
    family_id: "fam-1",
    type_id: "type-1",
    child_id: null,
    parent_id: null,
    title: "Papas Sportkurs",
    description: "Turnhalle West",
    location: "Sportplatz Nord",
    start_at: "2026-05-04T16:30:00.000Z",
    end_at: "2026-05-04T17:30:00.000Z",
    all_day: false,
    timezone: "Europe/Berlin",
    rrule_freq: "weekly",
    rrule_interval: 1,
    rrule_byweekday: [1],
    rrule_until: null,
    rrule_count: null,
    created_by: "par-1",
    created_at: "2026-04-20T00:00:00.000Z",
    updated_at: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

const CHANGES: EventChanges = {
  title: "Neuer Titel",
  start_at: "2026-06-15T15:00:00.000Z",
  end_at: "2026-06-15T16:00:00.000Z",
  location: "Sportplatz Süd",
  description: null,
};

describe("insertSplitEvent — Spaltenvollzähligkeit", () => {
  test("schreibt jede Spalte, die der Server nicht selbst füllt", async () => {
    const { client, calls } = fakeInsertClient();

    await createSupabaseEventOps(client).insertSplitEvent(master(), CHANGES, null);

    expect(calls.table).toBe("events");
    expect(Object.keys(calls.payload ?? {}).sort()).toEqual(requiredInsertColumns());
  });

  test("die abgespaltene Hälfte behält die Personenzuordnung des Masters", async () => {
    // Die Vollzähligkeitsprüfung allein wäre mit einem hartkodierten
    // `parent_id: null` zufrieden. Dieser Test hält den Wert dagegen.
    const { client, calls } = fakeInsertClient();

    await createSupabaseEventOps(client).insertSplitEvent(
      master({ parent_id: "par-7" }),
      CHANGES,
      null,
    );

    expect(calls.payload?.parent_id).toBe("par-7");
  });
});

type EventTypeRow = Database["public"]["Tables"]["event_types"]["Row"];

function createVars(): Parameters<typeof createEvent>[0] {
  return {
    familyId: "fam-1",
    typeId: "type-1",
    childId: "child-1",
    parentId: null,
    title: "Elternabend",
    startAt: "2026-10-01T19:00:00.000Z",
    endAt: "2026-10-01T20:30:00.000Z",
    allDay: false,
    timezone: "Europe/Berlin",
    location: "Schule",
    description: "Raum 12",
    recurrence: "weekly",
    recurrenceCount: 5,
    createdBy: "par-1",
  };
}

/** Die sieben Spalten von `event_types.Row`, Stand `database.types.ts`. */
function eventType(): EventTypeRow {
  return {
    id: "type-1",
    family_id: "fam-1",
    slug: "family",
    color: "primary",
    icon: "users",
    label: { de: "Familie", en: "Family" },
    created_at: "2026-01-01T00:00:00.000Z",
  };
}

describe("createEvent und optimisticEventRow — dieselbe Spaltenmenge", () => {
  test("createEvent schreibt jede Spalte, die der Server nicht selbst füllt", async () => {
    inserted = { table: "", payload: undefined };

    await createEvent(createVars());

    expect(inserted.table).toBe("events");
    expect(Object.keys(inserted.payload ?? {}).sort()).toEqual(requiredInsertColumns());
  });

  test("optimisticEventRow deckt jede Spalte von EventRow ab", () => {
    // Die synthetische Zeile geht durch dasselbe `expandEvents` wie die echten
    // und muss deshalb eine vollständige `EventRow` sein — inklusive der drei
    // servergefüllten Spalten, die `createEvent` bewusst auslässt.
    const row = optimisticEventRow(createVars(), eventType());
    const columns = Object.keys(row).filter(
      (key) => key !== "event_types" && key !== "event_exceptions",
    );

    expect(columns.sort()).toEqual(Object.keys(EVENT_ROW_COLUMNS).sort());
  });
});
