import { beforeEach, describe, expect, test } from "bun:test";

import type { FamilyChange } from "./normalize";

import { DEBUG_CHANGE_LOG_LIMIT, toRealtimeStatus, useRealtimeStatusStore } from "./status";

function change(rowId: string): FamilyChange {
  return { table: "events", type: "INSERT", rowId, record: null, oldRecord: null, receivedAt: 0 };
}

describe("toRealtimeStatus", () => {
  test("bildet alle vier Subscribe-States ab", () => {
    expect(toRealtimeStatus("SUBSCRIBED")).toBe("subscribed");
    expect(toRealtimeStatus("TIMED_OUT")).toBe("timedOut");
    expect(toRealtimeStatus("CLOSED")).toBe("closed");
    expect(toRealtimeStatus("CHANNEL_ERROR")).toBe("error");
  });
});

describe("useRealtimeStatusStore", () => {
  beforeEach(() => {
    // Store-Zustand zwischen Tests zurücksetzen: `bun test` teilt einen Prozess
    // und erlaubt damit Zustandsverschleppung über Dateigrenzen. Ohne Reset
    // würde der Store seinen Zustand vom letzten Test behalten und Tests könnten
    // nur in der deklarierten Reihenfolge grün sein.
    useRealtimeStatusStore.setState({ status: "idle", degraded: false, recentChanges: [] });
  });

  test("startet idle und nicht degradiert", () => {
    const state = useRealtimeStatusStore.getState();
    expect(state.status).toBe("idle");
    expect(state.degraded).toBe(false);
  });

  test("ein Wechsel auf subscribed räumt das Degraded-Flag mit ab", () => {
    useRealtimeStatusStore.getState().setDegraded(true);
    useRealtimeStatusStore.getState().setStatus("subscribed");
    expect(useRealtimeStatusStore.getState().degraded).toBe(false);
  });

  test("ein Wechsel auf error lässt das Flag unberührt — den Timer stellt der Hook", () => {
    useRealtimeStatusStore.getState().setStatus("subscribed");
    useRealtimeStatusStore.getState().setStatus("error");
    expect(useRealtimeStatusStore.getState().degraded).toBe(false);
    useRealtimeStatusStore.getState().setDegraded(true);
    useRealtimeStatusStore.getState().setStatus("closed");
    expect(useRealtimeStatusStore.getState().degraded).toBe(true);
  });

  test("pushChange fügt vorn ein und vergibt eine steigende seq", () => {
    useRealtimeStatusStore.getState().pushChange(change("row-1"));
    useRealtimeStatusStore.getState().pushChange(change("row-2"));
    const { recentChanges } = useRealtimeStatusStore.getState();
    expect(recentChanges.map((c) => c.rowId)).toEqual(["row-2", "row-1"]);
    expect(recentChanges[0]?.seq).toBeGreaterThan(recentChanges[1]?.seq ?? 0);
  });

  test("deckelt recentChanges auf DEBUG_CHANGE_LOG_LIMIT und wirft den ältesten Eintrag", () => {
    for (let i = 0; i < DEBUG_CHANGE_LOG_LIMIT + 5; i += 1) {
      useRealtimeStatusStore.getState().pushChange(change(`row-${String(i)}`));
    }
    const { recentChanges } = useRealtimeStatusStore.getState();
    expect(recentChanges.length).toBe(DEBUG_CHANGE_LOG_LIMIT);
    // Neuester zuerst (row-<limit+4>), ältester zuletzt — row-0..row-4 sind
    // über den Deckel hinaus verdrängt worden.
    expect(recentChanges[0]?.rowId).toBe(`row-${String(DEBUG_CHANGE_LOG_LIMIT + 4)}`);
    expect(recentChanges[recentChanges.length - 1]?.rowId).toBe("row-5");
  });

  test("clearChanges leert den Puffer, ohne den Verbindungsstatus zu berühren", () => {
    useRealtimeStatusStore.getState().pushChange(change("row-1"));
    useRealtimeStatusStore.getState().setStatus("subscribed");
    useRealtimeStatusStore.getState().clearChanges();
    const state = useRealtimeStatusStore.getState();
    expect(state.recentChanges).toEqual([]);
    expect(state.status).toBe("subscribed");
  });
});
