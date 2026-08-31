import { format } from "date-fns";
import { create } from "zustand";

import type { EventWithRelations } from "./expand";
import type { PendingEventDelete } from "./pendingDeletes";
import type { EditScope, EventChanges } from "./recurrence";
import type { CalendarOccurrence } from "./types";

import { withoutPendingDeletes } from "./pendingDeletes";

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

export interface OptimisticCreate {
  kind: "create";
  /**
   * Eine **synthetische** Master-Zeile in der Form, die `fetchEventsInRange`
   * liefert. Sie geht durch dasselbe `expandEvents` wie die echten Zeilen —
   * Wiederverwendung statt Nachbildung, und ein neu angelegter Serientermin
   * erscheint dadurch mit allen seinen Occurrences statt nur der ersten.
   */
  row: EventWithRelations;
}

/**
 * Ein Update einer bereits expandierten Occurrence — der Eintrag beschreibt
 * eine Änderung, die der Store puffert, bis der Server antwortet.
 */
export interface OptimisticUpdate {
  kind: "update";
  eventId: string;
  occurrenceDate: string;
  scope: EditScope;
  changes: EventChanges;
}

/**
 * Ein Eintrag aus dem Optimistic-Store — entweder ein neu angelegter Serientermin
 * (Create) oder eine Änderung an einer bestehenden Occurrence (Update).
 *
 * Die `id` wird vom Store verwaltet und kommt dort von außen nicht rein — daher
 * die Intersection-Struktur statt eines Feldes in den Basistypen. Sie wird
 * benötigt, um den Eintrag später aus dem Store zu entfernen (Callback in
 * `onSuccess`).
 */
export type OptimisticEvent =
  ({ id: string } & OptimisticCreate) | ({ id: string } & OptimisticUpdate);

interface OptimisticEventsState {
  entries: OptimisticEvent[];
  /** Legt einen Eintrag an und gibt seine Id zurück — `onMutate` reicht sie als Kontext weiter. */
  add: (payload: OptimisticCreate | OptimisticUpdate) => string;
  remove: (id: string) => void;
}

// Laufende Nummer statt Zufalls-Id: Der Eintrag lebt Sekundenbruchteile, eine
// Kollision über einen App-Lauf hinweg gibt es nicht, und Tests bleiben lesbar.
let sequence = 0;

export const useOptimisticEventsStore = create<OptimisticEventsState>((set) => ({
  entries: [],
  add: (payload) => {
    sequence += 1;
    const id = `optimistic-${sequence}`;
    set((state) => ({ entries: [...state.entries, { id, ...payload }] }));
    return id;
  },
  remove: (id) => set((state) => ({ entries: state.entries.filter((entry) => entry.id !== id) })),
}));

/** Die offenen optimistischen Änderungen. Referenzstabil, solange sich nichts ändert. */
export function useOptimisticEvents(): OptimisticEvent[] {
  return useOptimisticEventsStore((state) => state.entries);
}

/**
 * Legt die optimistischen Änderungen auf den expandierten Occurrence-Strom.
 *
 * `expand` wird **injiziert** statt importiert: `expandEvents` braucht
 * `rangeStart`, `rangeEnd` und `theme`, die alle im Hook liegen. So bleibt diese
 * Funktion rein und ein Test kann sie mit einem Stub bedienen. Die Range-Grenze
 * für neu angelegte Termine fällt dabei gratis ab — `expandEvents` wendet sie
 * ohnehin an.
 *
 * Gibt bei leerer Liste die Eingabe **unverändert** zurück. Das spart im
 * Normalfall einen Durchlauf und eine Allokation; für die Referenzstabilität des
 * Aufrufers tut es nichts, denn der Aufruf steht innerhalb desselben `useMemo`.
 */
export function withOptimistic(
  occurrences: CalendarOccurrence[],
  entries: readonly OptimisticEvent[],
  expand: (rows: EventWithRelations[]) => CalendarOccurrence[],
): CalendarOccurrence[] {
  if (entries.length === 0) return occurrences;

  const updates = entries.filter(
    (entry): entry is { id: string } & OptimisticUpdate => entry.kind === "update",
  );
  const patched =
    updates.length === 0
      ? occurrences
      : occurrences.map((occurrence) => {
          let next = occurrence;
          for (const update of updates) {
            if (patchesOccurrence(update, next)) {
              next = applyOptimisticChanges(next, update.scope, update.changes);
            }
          }
          return next;
        });

  const created = entries
    .filter((entry): entry is { id: string } & OptimisticCreate => entry.kind === "create")
    .map((entry) => entry.row);
  if (created.length === 0) return patched;
  return [...patched, ...expand(created)];
}

/**
 * Die Anzeige-Pipeline hinter `useFamilyEvents`: erst der Löschfilter, dann das
 * optimistische Overlay.
 *
 * Als eigene Funktion, nicht inline im Hook — damit die **Reihenfolge** testbar
 * ist. Stünde sie im Hook, könnte ein Test sie nur nachbauen, und ein
 * nachgebauter Test bliebe grün, wenn jemand den Hook zurückdreht. Genau das
 * ist bei der ersten Fassung passiert.
 *
 * Warum die Reihenfolge so herum: Ein Update mit Scope `this`, das den Termin
 * verschiebt, schreibt `occurrenceDate` neu. Liefe der Filter danach, vergliche
 * er das neue Datum gegen das alte, das die offene Löschung trägt — die
 * Löschung griffe nicht mehr.
 */
export function visibleOccurrences(args: {
  expanded: CalendarOccurrence[];
  pending: readonly PendingEventDelete[];
  optimistic: readonly OptimisticEvent[];
  expand: (rows: EventWithRelations[]) => CalendarOccurrence[];
}): CalendarOccurrence[] {
  return withOptimistic(
    withoutPendingDeletes(args.expanded, args.pending),
    args.optimistic,
    args.expand,
  );
}
