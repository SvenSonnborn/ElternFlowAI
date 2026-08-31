import { useMemo } from "react";

import { usePendingDeletes } from "@/features/shared";

import type { EditScope } from "./recurrence";
import type { CalendarOccurrence } from "./types";

/**
 * Welche Occurrences eine noch nicht ausgeführte Löschung verdeckt.
 *
 * Die drei Fälle sind dieselben, die `applyDeleteScope` serverseitig
 * unterscheidet — nur dass hier nichts geschrieben wird, sondern nur
 * ausgeblendet, solange das Undo-Fenster offen ist (Decision 1 der Spec).
 */
export interface PendingEventDelete {
  eventId: string;
  /** `YYYY-MM-DD` der Occurrence, von der aus gelöscht wurde. */
  occurrenceDate: string;
  scope: EditScope;
}

/**
 * Reiner Vergleich, damit alle drei Scopes ohne React prüfbar sind.
 *
 * Der Datumsvergleich läuft direkt auf den Strings: `YYYY-MM-DD` ist
 * lexikographisch genau chronologisch, ein `Date` wäre hier nur eine
 * Zeitzonenfalle. `forward` schließt den Stichtag **ein** — gelöscht wird „ab
 * diesem Termin", nicht „nach ihm".
 *
 * Ein Einzeltermin braucht keinen Sonderfall: er hat nur eine Occurrence, auf
 * die alle drei Scopes gleich zutreffen.
 */
export function hidesOccurrence(
  pending: PendingEventDelete,
  occurrence: { eventId: string; occurrenceDate: string },
): boolean {
  if (pending.eventId !== occurrence.eventId) return false;
  switch (pending.scope) {
    case "this":
      return pending.occurrenceDate === occurrence.occurrenceDate;
    case "forward":
      return occurrence.occurrenceDate >= pending.occurrenceDate;
    case "all":
      return true;
  }
}

/**
 * Filtert die offenen Löschungen aus einer expandierten Liste.
 *
 * Gibt im Normalfall — nichts offen — die Eingabe **unverändert** zurück, statt
 * eine Kopie: `useFamilyEvents` reicht das Ergebnis an `toDaySegments` weiter,
 * und ein bei jedem Render neues Array machte dessen `useMemo` wertlos.
 */
export function withoutPendingDeletes(
  occurrences: CalendarOccurrence[],
  pending: readonly PendingEventDelete[],
): CalendarOccurrence[] {
  if (pending.length === 0) return occurrences;
  return occurrences.filter((o) => !pending.some((p) => hidesOccurrence(p, o)));
}

/**
 * Die offenen Termin-Löschungen aus dem geteilten Store.
 *
 * Hier steht der **einzige** Cast dieses Features: der Store hält `target` als
 * `unknown`, weil `features/shared` nichts aus `features/calendar` importieren
 * darf, ohne die Abhängigkeitsrichtung umzudrehen. `kind: "event"` ist der
 * Diskriminator, der ihn absichert — nur `useUndoableDelete`-Aufrufe mit
 * diesem `kind` legen hier etwas ab (Decision 2 der Spec).
 */
export function usePendingEventDeletes(): PendingEventDelete[] {
  const entries = usePendingDeletes("event");
  return useMemo(() => entries.map((entry) => entry.target as PendingEventDelete), [entries]);
}
