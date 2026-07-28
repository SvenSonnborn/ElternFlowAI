import { describe, expect, test } from "bun:test";

import type { Database } from "@/features/supabase/database.types";

import { lightTheme } from "@/design-system/themes";

import type { EventWithRelations } from "./expand";

import { expandEvents } from "./expand";

type EventRow = Database["public"]["Tables"]["events"]["Row"];

function makeRow(overrides: Partial<EventRow> = {}): EventWithRelations {
  const row: EventRow = {
    id: "evt-1",
    family_id: "fam-1",
    type_id: "type-1",
    child_id: null,
    parent_id: null,
    title: "Sommerurlaub",
    description: null,
    location: null,
    start_at: new Date("2026-06-10T09:00:00").toISOString(),
    end_at: new Date("2026-06-10T10:00:00").toISOString(),
    all_day: false,
    rrule_freq: null,
    rrule_interval: 1,
    rrule_byweekday: null,
    rrule_count: null,
    rrule_until: null,
    created_at: new Date("2026-01-01T00:00:00").toISOString(),
    created_by: null,
    updated_at: new Date("2026-01-01T00:00:00").toISOString(),
    ...overrides,
  };
  return { ...row, event_types: null, event_exceptions: [] };
}

const WINDOW_START = new Date("2026-06-01T00:00:00");
const WINDOW_END = new Date("2026-06-30T23:59:59");

describe("expandEvents window", () => {
  test("keeps an event that starts before the window but runs into it", () => {
    const row = makeRow({
      start_at: new Date("2026-05-20T09:00:00").toISOString(),
      end_at: new Date("2026-06-05T14:00:00").toISOString(),
    });
    const out = expandEvents([row], WINDOW_START, WINDOW_END, lightTheme);
    expect(out).toHaveLength(1);
    expect(out[0].occurrenceDate).toBe("2026-05-20");
  });

  test("drops an event whose span ends before the window", () => {
    const row = makeRow({
      start_at: new Date("2026-04-01T09:00:00").toISOString(),
      end_at: new Date("2026-04-03T14:00:00").toISOString(),
    });
    expect(expandEvents([row], WINDOW_START, WINDOW_END, lightTheme)).toEqual([]);
  });

  test("keeps a recurring occurrence that started before the window and runs into it", () => {
    // Weekly series from Mon 2026-05-25, each occurrence lasting three days.
    // Explicit UTC timestamps, like `recurrence.test.ts` — rrule computes in
    // UTC, so a local-time fixture would drift with the runner's timezone.
    const row = makeRow({
      start_at: "2026-05-25T09:00:00.000Z",
      end_at: "2026-05-27T14:00:00.000Z",
      rrule_freq: "weekly",
    });
    const out = expandEvents(
      [row],
      new Date("2026-06-02T00:00:00.000Z"),
      new Date("2026-06-30T23:59:59.000Z"),
      lightTheme,
    );
    // 06-01 → 06-03 straddles the window start and must survive.
    expect(out.map((o) => o.occurrenceDate)).toContain("2026-06-01");
  });

  test("a plain in-window event is unaffected", () => {
    const out = expandEvents([makeRow()], WINDOW_START, WINDOW_END, lightTheme);
    expect(out).toHaveLength(1);
    expect(out[0].occurrenceDate).toBe("2026-06-10");
  });
});
