import { describe, expect, test } from "bun:test";

import type { Database } from "@/features/supabase/database.types";

import { allOccurrences, occurrencesBetween } from "./rrule";
import { instantToFloating } from "./timezone";

type EventRow = Database["public"]["Tables"]["events"]["Row"];

const BERLIN = "Europe/Berlin";

function row(overrides: Partial<EventRow> = {}): EventRow {
  return {
    id: "evt-1",
    family_id: "fam-1",
    type_id: "type-1",
    child_id: null,
    parent_id: null,
    title: "Sport",
    description: null,
    location: null,
    // 06.10.2026, 18:00 Berlin.
    start_at: "2026-10-06T16:00:00.000Z",
    end_at: "2026-10-06T17:00:00.000Z",
    all_day: false,
    rrule_freq: "weekly",
    rrule_interval: 1,
    rrule_byweekday: null,
    rrule_until: null,
    rrule_count: null,
    timezone: BERLIN,
    created_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Die Wandzeit einer Occurrence in der Zone des Termins, als `HH:mm`. */
function wallClock(instant: Date, timeZone: string): string {
  const floating = instantToFloating(instant, timeZone);
  return floating.toISOString().slice(11, 16);
}

describe("occurrencesBetween über die Umstellungen", () => {
  test("Oktober: die Uhrzeit bleibt 18:00, obwohl der Offset wechselt", () => {
    const out = occurrencesBetween(
      row(),
      new Date("2026-10-01T00:00:00.000Z"),
      new Date("2026-11-10T23:59:59.000Z"),
    );
    expect(out.map((d) => wallClock(d, BERLIN))).toEqual([
      "18:00",
      "18:00",
      "18:00",
      "18:00",
      "18:00",
      "18:00",
    ]);
    // Und der Instant zieht tatsächlich mit: vor der Umstellung 16:00Z, danach 17:00Z.
    expect(out[0].toISOString()).toBe("2026-10-06T16:00:00.000Z");
    expect(out[3].toISOString()).toBe("2026-10-27T17:00:00.000Z");
  });

  test("März: dieselbe Prüfung in der Gegenrichtung", () => {
    // 09.03.2026, 08:00 Berlin (Winterzeit, +1).
    const out = occurrencesBetween(
      row({ start_at: "2026-03-09T07:00:00.000Z", end_at: "2026-03-09T08:00:00.000Z" }),
      new Date("2026-03-01T00:00:00.000Z"),
      new Date("2026-04-15T23:59:59.000Z"),
    );
    expect(out.map((d) => wallClock(d, BERLIN))).toEqual([
      "08:00",
      "08:00",
      "08:00",
      "08:00",
      "08:00",
      "08:00",
    ]);
    expect(out[0].toISOString()).toBe("2026-03-09T07:00:00.000Z");
    expect(out[3].toISOString()).toBe("2026-03-30T06:00:00.000Z");
  });

  test("ein Einzeltermin liefert sich selbst, wenn er im Fenster liegt", () => {
    const single = row({ rrule_freq: null });
    expect(
      occurrencesBetween(
        single,
        new Date("2026-10-01T00:00:00.000Z"),
        new Date("2026-10-31T00:00:00.000Z"),
      ),
    ).toHaveLength(1);
    expect(
      occurrencesBetween(
        single,
        new Date("2026-11-01T00:00:00.000Z"),
        new Date("2026-11-30T00:00:00.000Z"),
      ),
    ).toHaveLength(0);
  });

  test("rrule_until begrenzt die Serie", () => {
    const out = occurrencesBetween(
      row({ rrule_until: "2026-10-20T23:59:59.000Z" }),
      new Date("2026-10-01T00:00:00.000Z"),
      new Date("2026-11-10T00:00:00.000Z"),
    );
    expect(out).toHaveLength(3);
  });
});

describe("allOccurrences", () => {
  test("eine gezählte Serie liefert genau count Vorkommen, alle mit derselben Uhrzeit", () => {
    const out = allOccurrences(row({ rrule_count: 6 }));
    expect(out).toHaveLength(6);
    expect(new Set(out.map((d) => wallClock(d, BERLIN)))).toEqual(new Set(["18:00"]));
  });

  test("ein Einzeltermin liefert genau sich selbst", () => {
    expect(allOccurrences(row({ rrule_freq: null })).map((d) => d.toISOString())).toEqual([
      "2026-10-06T16:00:00.000Z",
    ]);
  });
});

describe("Unabhängigkeit von der Zone des Termins", () => {
  test("dieselbe Wanduhrzeit in New York ergibt andere Instants, aber dieselbe Uhrzeit", () => {
    const ny = row({ timezone: "America/New_York", start_at: "2026-10-06T22:00:00.000Z" });
    const out = occurrencesBetween(
      ny,
      new Date("2026-10-01T00:00:00.000Z"),
      new Date("2026-11-30T23:59:59.000Z"),
    );
    expect(new Set(out.map((d) => wallClock(d, "America/New_York")))).toEqual(new Set(["18:00"]));
  });
});
