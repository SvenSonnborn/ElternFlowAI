import { format } from "date-fns";

import type { EditScope, EventChanges } from "./recurrence";
import type { CalendarOccurrence } from "./types";

/**
 * Das Occurrence-Overlay für optimistische Kalender-Änderungen.
 *
 * Es modelliert die **Anzeige**, nicht die Speicherung: Der Cache hält
 * Master-Zeilen, die UI zeigt Occurrences, und dazwischen liegt `expandEvents`.
 * Ein Patch auf Master-Ebene müsste `applyEditScope` im Client nachbauen —
 * inklusive der Serien-Aufspaltung bei `forward` —, und genau das hat
 * [ADR-026](../../docs/decision-log.md) für das Löschen bereits verworfen.
 *
 * Was hier steht, ist deshalb bewusst eine **Näherung** (Decision 3 der Spec):
 * Sie muss gut aussehen, nicht exakt sein — der Refetch korrigiert sie
 * innerhalb einer Sekunde.
 */

/**
 * Ob dieser Update-Eintrag die gegebene Occurrence betrifft.
 *
 * Dieselben drei Scopes wie `hidesOccurrence` in [pendingDeletes.ts](./pendingDeletes.ts),
 * und aus demselben Grund derselbe String-Vergleich: `YYYY-MM-DD` ist
 * lexikographisch chronologisch, ein `Date` wäre hier nur eine Zeitzonenfalle.
 * `forward` schließt den Stichtag **ein** — geändert wird „ab diesem Termin".
 */
export function patchesOccurrence(
  entry: { eventId: string; occurrenceDate: string; scope: EditScope },
  occurrence: { eventId: string; occurrenceDate: string },
): boolean {
  if (entry.eventId !== occurrence.eventId) return false;
  switch (entry.scope) {
    case "this":
      return entry.occurrenceDate === occurrence.occurrenceDate;
    case "forward":
      return occurrence.occurrenceDate >= entry.occurrenceDate;
    case "all":
      return true;
  }
}

/** Nimmt das Datum von `day` und die Uhrzeit von `time`. */
function withTimeOfDay(day: Date, time: Date): Date {
  const out = new Date(day);
  out.setHours(time.getHours(), time.getMinutes(), time.getSeconds(), time.getMilliseconds());
  return out;
}

/**
 * Wendet eine Änderung auf eine Occurrence an — so, wie `expandEvents` sie nach
 * dem Refetch **anzeigen** wird, nicht wie der Server sie schreibt.
 *
 * Zwei Unterscheidungen tragen die Funktion:
 *
 * 1. **Literale Zeiten oder neu verankerte?** Trifft die Änderung die
 *    Master-Zeile *einer Serie* (`all`, `forward`), schreibt der Server dort
 *    `start_at`/`end_at`, und `expandEvents` trägt deren **Tageszeit** in jede
 *    Occurrence, während jede ihr eigenes Datum behält. Ein stumpfes Übernehmen
 *    zöge die Serie auf einen Tag zusammen. Beim Einzeltermin und bei einer
 *    Exception (`this` auf einer Serie) gelten dagegen die Literalwerte — dort
 *    verschiebt eine Datumsänderung den Termin tatsächlich.
 * 2. **Überlebt `description` den Weg?** Nein, wenn eine Exception geschrieben
 *    wird: `expandEvents` liest das Feld **immer** von der Master-Zeile, und
 *    `applyOverride` kennt es nicht. Der Server legt eine geänderte Beschreibung
 *    zwar ins Override-JSON, die Anzeige übernimmt sie nie. Sie hier zu zeigen
 *    hieße, sie eine Sekunde später vom Refetch wegnehmen zu lassen — genau das
 *    Flackern, gegen das dieses Feature antritt.
 */
export function applyOptimisticChanges(
  occurrence: CalendarOccurrence,
  scope: EditScope,
  changes: EventChanges,
): CalendarOccurrence {
  const newStart = new Date(changes.start_at);
  const newEnd = new Date(changes.end_at);

  const viaException = occurrence.isRecurring && scope === "this";
  const literalTimes = !occurrence.isRecurring || viaException;

  const startAt = literalTimes ? newStart : withTimeOfDay(occurrence.startAt, newStart);
  const endAt = literalTimes
    ? newEnd
    : new Date(startAt.getTime() + (newEnd.getTime() - newStart.getTime()));

  return {
    ...occurrence,
    title: changes.title,
    location: changes.location,
    description: viaException ? occurrence.description : changes.description,
    startAt,
    endAt,
    // `expandEvents` leitet das Datum aus dem aufgelösten Start ab, nicht aus
    // der Regel — eine verschobene Occurrence wandert also mit.
    occurrenceDate: format(startAt, "yyyy-MM-dd"),
    isException: viaException ? true : occurrence.isException,
  };
}
