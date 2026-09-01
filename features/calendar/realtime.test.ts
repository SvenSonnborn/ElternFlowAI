import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

import { describe, expect, test } from "bun:test";

import {
  CALENDAR_CHANNEL_PREFIX,
  calendarBindings,
  calendarChannelTopic,
  normalizeChange,
  toRealtimeStatus,
  type CalendarRealtimeTable,
} from "./realtime";

const FAMILY_ID = "fam-1";
const AT = 1_700_000_000_000;
const now = () => AT;

function payload(
  table: CalendarRealtimeTable,
  eventType: "INSERT" | "UPDATE" | "DELETE",
  row: Record<string, unknown>,
): RealtimePostgresChangesPayload<Record<string, unknown>> {
  const base = { schema: "public", table, commit_timestamp: "2026-09-01T09:30:00Z", errors: [] };
  if (eventType === "DELETE") return { ...base, eventType, new: {}, old: row };
  if (eventType === "UPDATE") return { ...base, eventType, new: row, old: {} };
  return { ...base, eventType, new: row, old: {} };
}

describe("calendarChannelTopic", () => {
  test("bildet ein Topic pro Familie", () => {
    expect(calendarChannelTopic(FAMILY_ID)).toBe(`${CALENDAR_CHANNEL_PREFIX}:${FAMILY_ID}`);
  });

  test("trennt zwei Familien", () => {
    expect(calendarChannelTopic("a")).not.toBe(calendarChannelTopic("b"));
  });
});

describe("calendarBindings", () => {
  test("bindet genau zwei Tabellen im public-Schema an alle Event-Typen", () => {
    const bindings = calendarBindings(FAMILY_ID);
    expect(bindings).toHaveLength(2);
    expect(bindings.map((b) => b.table)).toEqual(["events", "event_exceptions"]);
    for (const b of bindings) {
      expect(b.event).toBe("*");
      expect(b.schema).toBe("public");
    }
  });

  test("filtert events serverseitig auf die Familie", () => {
    const [events] = calendarBindings(FAMILY_ID);
    expect(events.filter).toBe(`family_id=eq.${FAMILY_ID}`);
  });

  test("lässt event_exceptions ungefiltert — die Tabelle hat keine family_id", () => {
    const [, exceptions] = calendarBindings(FAMILY_ID);
    expect(exceptions.filter).toBeUndefined();
  });
});

describe("toRealtimeStatus", () => {
  test("bildet alle vier Subscribe-States ab", () => {
    expect(toRealtimeStatus("SUBSCRIBED")).toBe("subscribed");
    expect(toRealtimeStatus("TIMED_OUT")).toBe("timedOut");
    expect(toRealtimeStatus("CLOSED")).toBe("closed");
    expect(toRealtimeStatus("CHANNEL_ERROR")).toBe("error");
  });
});

describe("normalizeChange — events", () => {
  test("INSERT: eventId ist die eigene Id", () => {
    const change = normalizeChange(
      "events",
      payload("events", "INSERT", { id: "evt-1", family_id: FAMILY_ID }),
      now,
    );
    expect(change).toEqual({
      table: "events",
      type: "INSERT",
      rowId: "evt-1",
      eventId: "evt-1",
      receivedAt: AT,
    });
  });

  test("UPDATE: eventId ist die eigene Id", () => {
    const change = normalizeChange("events", payload("events", "UPDATE", { id: "evt-2" }), now);
    expect(change.rowId).toBe("evt-2");
    expect(change.eventId).toBe("evt-2");
  });

  test("DELETE: rowId kommt aus old, eventId bleibt null", () => {
    const change = normalizeChange("events", payload("events", "DELETE", { id: "evt-3" }), now);
    expect(change.rowId).toBe("evt-3");
    expect(change.eventId).toBeNull();
  });
});

describe("normalizeChange — event_exceptions", () => {
  test("INSERT: eventId kommt aus event_id, nicht aus id", () => {
    const change = normalizeChange(
      "event_exceptions",
      payload("event_exceptions", "INSERT", { id: "exc-1", event_id: "evt-9" }),
      now,
    );
    expect(change.rowId).toBe("exc-1");
    expect(change.eventId).toBe("evt-9");
  });

  test("UPDATE: eventId kommt aus event_id", () => {
    const change = normalizeChange(
      "event_exceptions",
      payload("event_exceptions", "UPDATE", { id: "exc-2", event_id: "evt-8" }),
      now,
    );
    expect(change.eventId).toBe("evt-8");
  });

  test("DELETE: die Exception ist ihrem Event nicht zuzuordnen", () => {
    const change = normalizeChange(
      "event_exceptions",
      payload("event_exceptions", "DELETE", { id: "exc-3" }),
      now,
    );
    expect(change.rowId).toBe("exc-3");
    expect(change.eventId).toBeNull();
  });
});

describe("normalizeChange — fehlende Felder", () => {
  test("ein Payload ohne id liefert null statt undefined oder einer Ausnahme", () => {
    const change = normalizeChange("events", payload("events", "INSERT", {}), now);
    expect(change.rowId).toBeNull();
    expect(change.eventId).toBeNull();
  });

  test("ein nicht-string id-Feld wird verworfen", () => {
    const change = normalizeChange("events", payload("events", "INSERT", { id: 42 }), now);
    expect(change.rowId).toBeNull();
  });
});
