import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/features/supabase/database.types";

import type { FamilyChange, FamilyChangeType } from "./normalize";
import type { RealtimeStatus } from "./status";

import { normalizeBroadcast } from "./normalize";
import { toRealtimeStatus } from "./status";
import { familyTopic } from "./topic";

/**
 * Die drei Broadcast-Events, auf die der Trigger
 * `broadcast_family_change()` sendet — dieselbe Reihenfolge wie
 * `FamilyChangeType`, hier als iterierbare Liste, weil `subscribeToFamilyChanges`
 * für jede einzeln `channel.on("broadcast", …)` aufrufen muss.
 */
const OPERATIONS: FamilyChangeType[] = ["INSERT", "UPDATE", "DELETE"];

/**
 * Parameter für `subscribeToFamilyChanges`. `onStatus` und `now` sind optional:
 * ein Aufrufer, der nur an Datenänderungen interessiert ist, braucht keinen
 * Status-Callback, und die meisten Aufrufer wollen die echte Systemzeit statt
 * einer injizierten (die ist für Tests da, siehe `subscribe.test.ts`).
 */
export interface SubscribeToFamilyChangesArgs {
  client: SupabaseClient<Database>;
  familyId: string;
  onChange: (change: FamilyChange) => void;
  onStatus?: (status: RealtimeStatus) => void;
  now?: () => number;
}

/**
 * Baut den privaten Familien-Kanal auf und gibt seine Abmeldung zurück.
 *
 * React-frei: Der Client kommt als Parameter, damit ein Test ihn ohne
 * `mock.module` ersetzen kann — dieselbe Form wie `createSupabaseEventOps` in
 * features/calendar/recurrence.ts, und die einzige, in der das Modul hier
 * prüfbar ist (es gibt im Repo keinen Pfad, auf dem RN-Komponenten unter
 * `bun test` rendern).
 *
 * **`async` wegen `setAuth()`.** Realtime Authorization ist für private Kanäle
 * Pflicht: Ohne den Zugriffstoken am Socket lehnt die RLS-Policy auf
 * `realtime.messages` den Join ab. Das korrigiert die Notiz in ADR-028, ein
 * `setAuth()` sei verzichtbar — für `postgres_changes` stimmte sie, hier nicht.
 * Der Aufrufer muss deshalb damit rechnen, dass das `await` erst nach seinem
 * Unmount durchläuft (siehe `useFamilyRealtime`).
 */
export async function subscribeToFamilyChanges({
  client,
  familyId,
  onChange,
  onStatus,
  now,
}: SubscribeToFamilyChangesArgs): Promise<() => void> {
  await client.realtime.setAuth();

  const topic = familyTopic(familyId);

  // `client.channel(topic)` dedupliziert selbst nach Topic: `RealtimeClient.channel`
  // durchsucht seine eigene Kanalliste und gibt bei einem Treffer denselben
  // Kanal zurück, statt einen neuen anzulegen (realtime-js, `RealtimeClient.ts`).
  // Ein Kanal verlässt diese Liste aber erst in seinem eigenen Leave-Ack
  // (`RealtimeClient._remove`, an das `close`-Event des Kanals gebunden) — nicht
  // schon beim Aufruf von `removeChannel()`, der genau darauf wartet. Läuft
  // dieser Effekt neu, während der vorige Kanal noch im Zustand "leaving" steht
  // (React StrictMode, Fast Refresh, ein schneller Familienwechsel), gäbe
  // `client.channel(topic)` also denselben, absterbenden Kanal zurück —
  // `subscribe()` joint aber nur aus dem Zustand "closed" heraus (vendored
  // Phoenix, `Channel.leave()`/`isClosed()`-Guard) und wäre auf ihm ein
  // stiller No-Op; das nachfolgende Leave-Ack würfe die eben gesetzten
  // Bindings gleich wieder weg. Deshalb: einen etwaigen Altkanal desselben
  // Topics zuerst entfernen und das Leave-Ack abwarten — `removeChannel()`
  // löst erst danach auf —, bevor der neue Kanal angelegt wird. Verglichen
  // wird über `subTopic`, nicht über das SDK-intern vorangestellte
  // "realtime:"-Präfix (`RealtimeChannel.topic`): dieser Code soll das Präfix
  // nicht kennen müssen.
  const stale = client.getChannels().find((existing) => existing.subTopic === topic);
  if (stale) {
    // `removeChannel()` lehnt nicht ab, es **meldet**: "ok" | "timed out" |
    // "error". Bei allem außer "ok" kann der Kanal in der Liste des Clients
    // stehen bleiben — dann gäbe `client.channel(topic)` gleich wieder ihn
    // zurück, und der Join wäre erneut der stille No-Op, gegen den dieser Block
    // gebaut ist. Erzwingen lässt sich das Entfernen nicht (das SDK kennt dafür
    // keinen Weg); den Ausfall benennen schon — sonst ist er von außen von
    // einem funktionierenden Kanal nicht zu unterscheiden.
    const removal = await client.removeChannel(stale);
    if (removal !== "ok") {
      console.error("[realtime] Altkanal nicht sauber entfernt", { topic, removal });
    }
  }

  const channel = client.channel(topic, { config: { private: true } });

  for (const operation of OPERATIONS) {
    channel.on("broadcast", { event: operation }, (message) => {
      // Die Operation kommt aus dem Binding, nicht aus dem Payload: Das Binding
      // ist typisiert, `payload.operation` ist ein `string` und bräuchte eine
      // Behauptung, die nichts prüft.
      onChange(normalizeBroadcast(operation, message, now));
    });
  }

  onStatus?.("subscribing");
  channel.subscribe((state) => {
    onStatus?.(toRealtimeStatus(state));
  });

  return () => {
    void client.removeChannel(channel);
  };
}
