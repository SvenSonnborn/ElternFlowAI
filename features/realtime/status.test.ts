import { beforeEach, describe, expect, test } from "bun:test";

import { toRealtimeStatus, useRealtimeStatusStore } from "./status";

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
    useRealtimeStatusStore.setState({ status: "idle", degraded: false });
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
});
