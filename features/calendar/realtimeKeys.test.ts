import { describe, expect, test } from "bun:test";

import type { FamilyChange, FamilyChangeType } from "@/features/realtime/normalize";

import { calendarKeys } from "./queries";
import { calendarInvalidationKeys } from "./realtimeKeys";

function change(
  table: string,
  type: FamilyChangeType,
  record: Record<string, unknown> | null,
  oldRecord: Record<string, unknown> | null = null,
): FamilyChange {
  const rowId = typeof record?.id === "string" ? record.id : null;
  const oldId = typeof oldRecord?.id === "string" ? oldRecord.id : null;
  return { table, type, rowId: rowId ?? oldId, record, oldRecord, receivedAt: 0 };
}

describe("calendarInvalidationKeys", () => {
  test("ein Event-INSERT trifft die Ranges und den Einzeltermin", () => {
    expect(calendarInvalidationKeys(change("events", "INSERT", { id: "evt-1" }))).toEqual([
      calendarKeys.eventsRoot,
      calendarKeys.one("evt-1"),
    ]);
  });

  test("ein Event-DELETE ist genauso zuzuordnen — der Trigger schickt die alte Zeile", () => {
    expect(calendarInvalidationKeys(change("events", "DELETE", null, { id: "evt-2" }))).toEqual([
      calendarKeys.eventsRoot,
      calendarKeys.one("evt-2"),
    ]);
  });

  test("eine Exception hängt am Event, nicht an sich selbst", () => {
    const keys = calendarInvalidationKeys(
      change("event_exceptions", "INSERT", { id: "exc-1", event_id: "evt-3" }),
    );
    expect(keys).toEqual([calendarKeys.eventsRoot, calendarKeys.one("evt-3")]);
  });

  test("eine gelöschte Exception zieht ihre event_id aus old_record", () => {
    const keys = calendarInvalidationKeys(
      change("event_exceptions", "DELETE", null, { id: "exc-2", event_id: "evt-4" }),
    );
    expect(keys).toEqual([calendarKeys.eventsRoot, calendarKeys.one("evt-4")]);
  });

  test("ohne zuordenbare Event-Id bleiben die Ranges übrig", () => {
    expect(calendarInvalidationKeys(change("event_exceptions", "INSERT", { id: "exc-3" }))).toEqual(
      [calendarKeys.eventsRoot],
    );
  });

  test("fremde Tabellen gehen den Kalender nichts an", () => {
    expect(calendarInvalidationKeys(change("tasks", "INSERT", { id: "task-1" }))).toEqual([]);
  });

  test("types und reminders werden nie invalidiert", () => {
    const keys = calendarInvalidationKeys(change("events", "UPDATE", { id: "evt-5" }));
    expect(keys).not.toContainEqual(calendarKeys.types);
    expect(keys).not.toContainEqual(calendarKeys.reminders("evt-5"));
  });
});

describe("calendarKeys-Präfixe", () => {
  // Gegen Literale statt gegen die Konstanten selbst: Ein Tippfehler in
  // eventsRoot/oneRoot beträfe sonst Implementierung und Test gleichzeitig
  // und bliebe unsichtbar — und ein nicht mehr passendes Präfix invalidiert
  // stumm gar nichts.
  test("eventsRoot ist Präfix jeder Range-Query", () => {
    expect(calendarKeys.eventsRoot).toEqual(["calendar", "events"]);
    const range = calendarKeys.range("2026-01-01", "2026-02-01");
    expect(range.slice(0, 2)).toEqual(["calendar", "events"]);
  });

  test("oneRoot ist Präfix jeder Einzeltermin-Query und kollidiert nicht mit eventsRoot", () => {
    expect(calendarKeys.oneRoot).toEqual(["calendar", "event"]);
    expect(calendarKeys.one("evt-1").slice(0, 2)).toEqual(["calendar", "event"]);
    expect(calendarKeys.oneRoot).not.toEqual(calendarKeys.eventsRoot);
  });
});
