import type { SupabaseClient } from "@supabase/supabase-js";

import { describe, expect, test } from "bun:test";

import type { Database } from "@/features/supabase/database.types";

import { createEvent, optimisticEventRow } from "./createMutation";

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
 * Spalten, die ein Insert bewusst dem Server überlässt: `created_at` hat
 * `default now()`, und `updated_at` gehört seit ADR-031 dem
 * `set_updated_at`-Trigger. Sie hier zu setzen wäre falsch, nicht nur
 * überflüssig. `id` gehört seit Block 7 **nicht** mehr dazu: Die App vergibt
 * sie selbst, damit ein Retry nach verlorener Antwort keinen zweiten Termin
 * anlegt (Spec §6).
 */
const SERVER_OWNED: readonly (keyof EventRow)[] = ["created_at", "updated_at"];

/** Jede Spalte, die ein Schreiber selbst füllen muss. Sortiert, damit der Vergleich stabil ist. */
function requiredInsertColumns(): string[] {
  return Object.keys(EVENT_ROW_COLUMNS)
    .filter((column) => !SERVER_OWNED.includes(column as keyof EventRow))
    .sort();
}

/**
 * Doppelgänger des Query-Builders, den `createEvent` beim Anlegen durchläuft
 * (`.from().upsert().select()`). Die Antwort trägt die Zeile, die Sichtbarkeits-
 * prüfung für eine leere Antwort wird also nie erreicht.
 */
function fakeUpsertClient() {
  const calls = { table: "", payload: undefined as Record<string, unknown> | undefined };
  const client = {
    from(table: string) {
      calls.table = table;
      return {
        upsert(payload: Record<string, unknown>) {
          calls.payload = payload;
          return {
            select: () => Promise.resolve({ data: [{ id: payload.id }], error: null }),
          };
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, calls };
}

type EventTypeRow = Database["public"]["Tables"]["event_types"]["Row"];

function createVars(): Parameters<typeof createEvent>[0] {
  return {
    id: "3c0f6e2a-8b1d-4f5e-9a7c-1d2e3f4a5b6c",
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

// Der dritte Schreiber, die abgespaltene Hälfte eines Forward-Splits, lebt seit
// Block 7 im Server (`insert_split_event` in `apply_event_change`): Er übernimmt
// alle Spalten außer `changes` und `rrule_count` aus dem gesperrten Master. Dass
// keine davon verloren geht, prüft Fall 10 in
// supabase/tests/database/apply_event_change.test.sql.
describe("createEvent und optimisticEventRow — dieselbe Spaltenmenge", () => {
  test("createEvent schreibt jede Spalte, die der Server nicht selbst füllt", async () => {
    const { client, calls } = fakeUpsertClient();

    await createEvent(createVars(), client);

    expect(calls.table).toBe("events");
    expect(Object.keys(calls.payload ?? {}).sort()).toEqual(requiredInsertColumns());
  });

  test("optimisticEventRow deckt jede Spalte von EventRow ab", () => {
    // Die synthetische Zeile geht durch dasselbe `expandEvents` wie die echten
    // und muss deshalb eine vollständige `EventRow` sein — inklusive der beiden
    // servergefüllten Spalten, die `createEvent` bewusst auslässt.
    const row = optimisticEventRow(createVars(), eventType());
    const columns = Object.keys(row).filter(
      (key) => key !== "event_types" && key !== "event_exceptions",
    );

    expect(columns.sort()).toEqual(Object.keys(EVENT_ROW_COLUMNS).sort());
  });
});
