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

  // Der Kanal wird bei jedem Aufruf frisch erzeugt und in der Abmeldung
  // entsorgt, nie über Renders hinweg wiederverwendet: React hängt im
  // StrictMode jeden Effekt einmal ab und wieder an, und ein zweites
  // `subscribe()` auf demselben Kanal wirft „tried to subscribe multiple times".
  const channel = client.channel(familyTopic(familyId), { config: { private: true } });

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
