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
    timezone: "Europe/Berlin",
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
    // Explicit UTC timestamps, like `recurrence.test.ts` — these are absolute
    // instants; `rrule.ts` evaluates them against `row.timezone` (Europe/Berlin
    // from `makeRow`'s default), not against the runner's timezone.
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

describe("Serienanker", () => {
  test("die verankerte Fassung behält alle Vorkommen, die naive verliert sie", () => {
    // Wöchentliche Serie ab Montag, 01.06.2026, 18:00 Ortszeit.
    const series = makeRow({
      start_at: new Date(2026, 5, 1, 18, 0).toISOString(),
      end_at: new Date(2026, 5, 1, 19, 0).toISOString(),
      rrule_freq: "weekly",
    });
    const windowStart = new Date(2026, 5, 1);
    const windowEnd = new Date(2026, 7, 31, 23, 59, 59);

    const before = expandEvents([series], windowStart, windowEnd, lightTheme);

    // Was ein unbedingtes `updateMaster` geschrieben hätte: das Datum der am
    // 03.08. bearbeiteten Occurrence wandert in `start_at` und damit in dtstart.
    const naive = expandEvents(
      [
        {
          ...series,
          start_at: new Date(2026, 7, 3, 19, 0).toISOString(),
          end_at: new Date(2026, 7, 3, 20, 0).toISOString(),
        },
      ],
      windowStart,
      windowEnd,
      lightTheme,
    );

    // Was `anchoredChanges` schreibt: Datum des Masters, Uhrzeit der Eingabe.
    const anchored = expandEvents(
      [
        {
          ...series,
          start_at: new Date(2026, 5, 1, 19, 0).toISOString(),
          end_at: new Date(2026, 5, 1, 20, 0).toISOString(),
        },
      ],
      windowStart,
      windowEnd,
      lightTheme,
    );

    expect(naive.length).toBeLessThan(before.length);
    expect(anchored.length).toBe(before.length);
    // Und die neue Uhrzeit ist tatsächlich angekommen.
    expect(anchored[0].startAt.getHours()).toBe(19);
  });
});

describe("Dauer über eine Zeitumstellung", () => {
  test("ein mehrtägiges Vorkommen behält seine Wandzeit-Dauer", () => {
    // Wöchentlich ab Freitag 16.10.2026, 09:00 Berlin bis Montag 19.10., 14:00.
    // Das Vorkommen ab Freitag 23.10. läuft über die Umstellung am 25.10.
    const row = makeRow({
      start_at: "2026-10-16T07:00:00.000Z",
      end_at: "2026-10-19T12:00:00.000Z",
      rrule_freq: "weekly",
      timezone: "Europe/Berlin",
    });
    const out = expandEvents(
      [row],
      new Date("2026-10-20T00:00:00.000Z"),
      new Date("2026-10-27T00:00:00.000Z"),
      lightTheme,
    );
    expect(out).toHaveLength(1);
    // Start bleibt 09:00 Wandzeit (07:00Z, noch Sommerzeit), Ende 14:00 Wandzeit
    // — und das ist nach der Umstellung 13:00Z, nicht 12:00Z.
    expect(out[0].startAt.toISOString()).toBe("2026-10-23T07:00:00.000Z");
    expect(out[0].endAt.toISOString()).toBe("2026-10-26T13:00:00.000Z");
  });
});
