import type { SupabaseClient } from "@supabase/supabase-js";

import { describe, expect, test } from "bun:test";

import type { Database } from "@/features/supabase/database.types";

import type { FamilyChange } from "./normalize";
import type { RealtimeStatus } from "./status";

import { subscribeToFamilyChanges } from "./subscribe";
import { familyTopic } from "./topic";

const FAMILY_ID = "fam-1";

type Handler = (message: unknown) => void;

/**
 * Minimaler Doppelgänger des Supabase-Clients. Kein `mock.module`: Die
 * Kernfunktion nimmt den Client als Parameter, genau damit ein Test ihn
 * ersetzen kann.
 */
function fakeClient() {
  const handlers = new Map<string, Handler>();
  const calls = {
    setAuth: 0,
    removed: 0,
    topic: "",
    config: undefined as unknown,
    subscribeCallbacks: [] as ((state: string) => void)[],
    // Aufruf-Protokoll für die Reihenfolge-Assertion: Zählwerte und
    // Endzustände allein belegen nicht, dass `setAuth()` vor `channel()`
    // lief — nur die Sequenz tut das.
    order: [] as string[],
  };

  const channel = {
    on(_type: "broadcast", filter: { event: string }, handler: Handler) {
      handlers.set(filter.event, handler);
      return channel;
    },
    subscribe(cb: (state: string) => void) {
      calls.subscribeCallbacks.push(cb);
      return channel;
    },
  };

  const client = {
    realtime: {
      setAuth: () => {
        calls.setAuth += 1;
        calls.order.push("setAuth");
        return Promise.resolve();
      },
    },
    channel(topic: string, config?: unknown) {
      calls.topic = topic;
      calls.config = config;
      calls.order.push("channel");
      return channel;
    },
    removeChannel: () => {
      calls.removed += 1;
      return Promise.resolve("ok");
    },
  };

  return { client: client as unknown as SupabaseClient<Database>, calls, handlers };
}

function broadcast(table: string, id: string) {
  return {
    type: "broadcast",
    event: "INSERT",
    payload: { schema: "public", table, operation: "INSERT", record: { id }, old_record: null },
  };
}

describe("subscribeToFamilyChanges", () => {
  test("authentifiziert den Socket, bevor der private Kanal joint", async () => {
    const { client, calls } = fakeClient();
    await subscribeToFamilyChanges({ client, familyId: FAMILY_ID, onChange: () => {} });
    expect(calls.setAuth).toBe(1);
    expect(calls.topic).toBe(familyTopic(FAMILY_ID));
    expect(calls.config).toEqual({ config: { private: true } });
    // Reihenfolge, nicht nur Endzustand: Joint der Kanal, bevor `setAuth()`
    // den Zugriffstoken am Socket gesetzt hat, lehnt die RLS-Policy auf
    // `realtime.messages` den Beitritt ab, ohne dass irgendwo ein Fehler
    // entsteht — der Kanal bleibt einfach still. Zählwerte allein (`setAuth`
    // war 1x da, `channel` wurde mit dem richtigen Topic gerufen) belegen das
    // nicht: Ein vertauschtes `await` oder ein `Promise.all` wäre am Ende
    // genauso grün. Deshalb hier explizit die Sequenz prüfen.
    expect(calls.order).toEqual(["setAuth", "channel"]);
  });

  test("bindet genau die drei Operationen", async () => {
    const { client, handlers } = fakeClient();
    await subscribeToFamilyChanges({ client, familyId: FAMILY_ID, onChange: () => {} });
    expect([...handlers.keys()].sort()).toEqual(["DELETE", "INSERT", "UPDATE"]);
  });

  test("reicht normalisierte Änderungen durch", async () => {
    const { client, handlers } = fakeClient();
    const seen: FamilyChange[] = [];
    await subscribeToFamilyChanges({
      client,
      familyId: FAMILY_ID,
      onChange: (change) => seen.push(change),
      now: () => 42,
    });
    handlers.get("INSERT")?.(broadcast("events", "evt-1"));
    expect(seen).toEqual([
      {
        table: "events",
        type: "INSERT",
        rowId: "evt-1",
        record: { id: "evt-1" },
        oldRecord: null,
        receivedAt: 42,
      },
    ]);
  });

  test("meldet subscribing vor der Antwort und danach den Server-Status", async () => {
    const { client, calls } = fakeClient();
    const states: RealtimeStatus[] = [];
    await subscribeToFamilyChanges({
      client,
      familyId: FAMILY_ID,
      onChange: () => {},
      onStatus: (status) => states.push(status),
    });
    expect(states).toEqual(["subscribing"]);
    calls.subscribeCallbacks[0]?.("SUBSCRIBED");
    expect(states).toEqual(["subscribing", "subscribed"]);
  });

  test("der Rückgabewert entfernt den Kanal", async () => {
    const { client, calls } = fakeClient();
    const unsubscribe = await subscribeToFamilyChanges({
      client,
      familyId: FAMILY_ID,
      onChange: () => {},
    });
    expect(calls.removed).toBe(0);
    unsubscribe();
    expect(calls.removed).toBe(1);
  });
});
