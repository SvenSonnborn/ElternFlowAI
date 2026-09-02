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
 *
 * `staleChannel: true` legt einen Kanal mit demselben `subTopic` vor, den
 * `client.getChannels()` schon findet, bevor `subscribeToFamilyChanges`
 * überhaupt läuft — der Fall, den es beim erneuten Effekt-Lauf gegen den noch
 * abmeldenden Vorgänger-Kanal abzusichern gilt (siehe Kommentar in
 * `subscribe.ts`). Ohne die Option ist `getChannels()` leer, der reguläre
 * Fall ohne Altkanal.
 */
function fakeClient({ staleChannel = false }: { staleChannel?: boolean } = {}) {
  const handlers = new Map<string, Handler>();
  const calls = {
    setAuth: 0,
    removed: 0,
    topic: "",
    config: undefined as unknown,
    subscribeCallbacks: [] as ((state: string) => void)[],
    // Aufruf-Protokoll für die Reihenfolge-Assertion: Zählwerte und
    // Endzustände allein belegen nicht, dass `setAuth()` vor `channel()`
    // lief — nur die Sequenz tut das. `getChannels()` selbst taucht hier
    // bewusst nicht auf: Es ist ein passives Nachschlagen, kein Schritt in
    // der Sequenz, die diese Tests belegen sollen.
    order: [] as string[],
  };

  const channel = {
    subTopic: familyTopic(FAMILY_ID),
    on(_type: "broadcast", filter: { event: string }, handler: Handler) {
      handlers.set(filter.event, handler);
      return channel;
    },
    subscribe(cb: (state: string) => void) {
      calls.subscribeCallbacks.push(cb);
      return channel;
    },
  };

  const stale = { subTopic: familyTopic(FAMILY_ID) };
  let channels: { subTopic: string }[] = staleChannel ? [stale] : [];

  const client = {
    realtime: {
      setAuth: () => {
        calls.setAuth += 1;
        calls.order.push("setAuth");
        return Promise.resolve();
      },
    },
    getChannels: () => channels,
    channel(topic: string, config?: unknown) {
      calls.topic = topic;
      calls.config = config;
      calls.order.push("channel");
      channels = [channel];
      return channel;
    },
    removeChannel: (removedChannel: { subTopic: string }) => {
      calls.removed += 1;
      calls.order.push("removeChannel");
      channels = channels.filter((c) => c !== removedChannel);
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

describe("subscribeToFamilyChanges — Altkanal desselben Topics", () => {
  // `client.channel(topic)` dedupliziert selbst nach Topic (siehe Kommentar in
  // `subscribe.ts`): Läuft dieser Effekt neu, während der vorige Kanal noch im
  // Zustand "leaving" ist, gäbe `client.channel(topic)` ohne diese Absicherung
  // denselben, absterbenden Kanal zurück — `subscribe()` wäre darauf ein
  // stiller No-Op. Die Aufrufsequenz, nicht nur ein Zählwert, belegt, dass der
  // Altkanal vor dem neuen `channel()`-Aufruf entfernt **und** dessen Leave-Ack
  // abgewartet wird.
  test("mit Altkanal: entfernt ihn zuerst und wartet das Leave-Ack ab", async () => {
    const { client, calls } = fakeClient({ staleChannel: true });
    await subscribeToFamilyChanges({ client, familyId: FAMILY_ID, onChange: () => {} });
    expect(calls.order).toEqual(["setAuth", "removeChannel", "channel"]);
  });

  test("ohne Altkanal: kein removeChannel-Aufruf vor dem neuen Kanal", async () => {
    const { client, calls } = fakeClient({ staleChannel: false });
    await subscribeToFamilyChanges({ client, familyId: FAMILY_ID, onChange: () => {} });
    expect(calls.order).toEqual(["setAuth", "channel"]);
  });
});
