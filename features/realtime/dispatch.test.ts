import { describe, expect, test } from "bun:test";

import { calendarKeys } from "@/features/calendar/queries";

import type { FamilyChange } from "./normalize";

import { invalidationKeysFor, reconnectInvalidationKeys } from "./dispatch";

function change(table: string, id: string, eventId?: string): FamilyChange {
  return {
    table,
    type: "UPDATE",
    rowId: id,
    record: eventId ? { id, event_id: eventId } : { id },
    oldRecord: null,
    receivedAt: 0,
  };
}

describe("invalidationKeysFor", () => {
  test("ein leeres Fenster invalidiert nichts", () => {
    expect(invalidationKeysFor([])).toEqual([]);
  });

  test("bündelt ein Fenster aus Master-Zeile und zwei Exceptions auf zwei Schlüssel", () => {
    const keys = invalidationKeysFor([
      change("events", "evt-1"),
      change("event_exceptions", "exc-1", "evt-1"),
      change("event_exceptions", "exc-2", "evt-1"),
    ]);
    expect(keys).toEqual([calendarKeys.eventsRoot, calendarKeys.one("evt-1")]);
  });

  test("zwei verschiedene Events behalten ihre eigenen Schlüssel", () => {
    const keys = invalidationKeysFor([change("events", "evt-1"), change("events", "evt-2")]);
    expect(keys).toHaveLength(3);
  });

  test("Änderungen fremder Tabellen fallen heraus", () => {
    expect(invalidationKeysFor([change("tasks", "task-1")])).toEqual([]);
  });
});

describe("reconnectInvalidationKeys", () => {
  test("deckt beide Kalender-Wurzeln ab, aber nicht types oder reminders", () => {
    const keys = reconnectInvalidationKeys();
    expect(keys).toEqual([calendarKeys.eventsRoot, calendarKeys.oneRoot]);
  });
});
