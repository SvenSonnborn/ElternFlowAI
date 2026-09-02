import { describe, expect, test } from "bun:test";

import { normalizeBroadcast, type FamilyChangeType } from "./normalize";

const AT = 1_700_000_000_000;
const now = () => AT;

function message(
  type: FamilyChangeType,
  table: string,
  record: Record<string, unknown> | null,
  oldRecord: Record<string, unknown> | null,
) {
  return {
    type: "broadcast",
    event: type,
    payload: { schema: "public", table, operation: type, record, old_record: oldRecord },
  };
}

describe("normalizeBroadcast", () => {
  test("INSERT: Tabelle, Typ und Row-Id aus record", () => {
    const change = normalizeBroadcast(
      "INSERT",
      message("INSERT", "events", { id: "evt-1", family_id: "fam-1" }, null),
      now,
    );
    expect(change).toEqual({
      table: "events",
      type: "INSERT",
      rowId: "evt-1",
      record: { id: "evt-1", family_id: "fam-1" },
      oldRecord: null,
      receivedAt: AT,
    });
  });

  test("DELETE: Row-Id kommt aus old_record", () => {
    const change = normalizeBroadcast(
      "DELETE",
      message("DELETE", "events", null, { id: "evt-2", family_id: "fam-1" }),
      now,
    );
    expect(change.rowId).toBe("evt-2");
    expect(change.oldRecord).toEqual({ id: "evt-2", family_id: "fam-1" });
    expect(change.record).toBeNull();
  });

  test("UPDATE: record gewinnt, old_record bleibt erhalten", () => {
    const change = normalizeBroadcast(
      "UPDATE",
      message("UPDATE", "event_exceptions", { id: "exc-1", event_id: "evt-3" }, { id: "exc-1" }),
      now,
    );
    expect(change.table).toBe("event_exceptions");
    expect(change.rowId).toBe("exc-1");
    expect(change.record).toEqual({ id: "exc-1", event_id: "evt-3" });
  });

  test("kaputte Nachricht wirft nicht, sondern liefert leere Felder", () => {
    const change = normalizeBroadcast("INSERT", { nonsense: true }, now);
    expect(change).toEqual({
      table: "",
      type: "INSERT",
      rowId: null,
      record: null,
      oldRecord: null,
      receivedAt: AT,
    });
  });

  test("nicht-string Ids zählen nicht als Row-Id", () => {
    const change = normalizeBroadcast("INSERT", message("INSERT", "events", { id: 7 }, null), now);
    expect(change.rowId).toBeNull();
  });
});
