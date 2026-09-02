import type { QueryKey } from "@tanstack/react-query";

import type { FamilyChange } from "@/features/realtime/normalize";

import { calendarKeys } from "./queries";

/**
 * Welche Query-Keys eine eingehende Änderung veraltet.
 *
 * Der Import ist `import type` und damit zur Laufzeit nicht vorhanden — dieses
 * Modul hängt an keinem Teil der Sync-Schicht, nur an ihrer Form. Andersherum
 * kennt `features/realtime/dispatch.ts` diese Datei sehr wohl: Die Sync-Schicht
 * steht über den Features (ADR-030 Decision 9).
 *
 * Bewusst **nicht** `calendarKeys.all`: Das ist der Präfix `["calendar"]` und
 * zöge `types` (eine Nachschlagetabelle) und `reminders` (eine eigene Tabelle
 * ohne Trigger) mit, die von einer Termin-Änderung nie betroffen sind.
 *
 * Ist keine Event-Id zuordenbar (etwa bei einer Exception ohne `event_id`-Feld),
 * fällt die Funktion auf `[calendarKeys.eventsRoot]` zurück: Die Range hat sich
 * dennoch geändert, auch wenn die Einzeltermin-Query unbekannt bleibt.
 */
export function calendarInvalidationKeys(change: FamilyChange): QueryKey[] {
  if (change.table !== "events" && change.table !== "event_exceptions") return [];

  const eventId =
    change.table === "events" ? change.rowId : eventIdOf(change.record ?? change.oldRecord);

  return eventId ? [calendarKeys.eventsRoot, calendarKeys.one(eventId)] : [calendarKeys.eventsRoot];
}

function eventIdOf(row: Record<string, unknown> | null): string | null {
  const value = row?.event_id;
  return typeof value === "string" ? value : null;
}
