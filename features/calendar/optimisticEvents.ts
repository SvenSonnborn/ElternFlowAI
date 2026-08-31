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

/**
 * Ob eine Änderung überhaupt optimistisch angezeigt werden **darf**.
 *
 * Der Grenzfall ist `all`/`forward` mit geändertem **Datumsanteil**. Dort
 * schreibt der Server `changes.start_at` per `updateMaster` in `events.start_at`
 * — und das ist `dtstart` der RRULE, die ganze Serie wandert also mit. Das
 * Overlay dagegen kann nur die Tageszeit neu verankern (siehe
 * `applyOptimisticChanges`) und lässt jedes Occurrence-Datum stehen.
 * Nachgerechnet an einer monatlichen Serie am 5., verschoben auf den 7.10.:
 * Das Overlay zeigt `[09-05, 10-05, 11-05]`, der Refetch liefert
 * `[10-07, 11-07, 12-07]`.
 *
 * Das ist nicht mehr die Näherung aus Decision 3 des ADR — ein sichtbares
 * Zurechtrücken —, sondern die Anzeige der **Nicht-Änderung genau der
 * Eigenschaft, die der Nutzer gerade geändert hat**: Er verschiebt den
 * Elternabend auf den 7., der Kalender zeigt alles unverändert, er hält das
 * Speichern für fehlgeschlagen, und eine Sekunde später springt die ganze
 * Serie. Lieber gar kein optimistischer Eintrag — dieselbe Enthaltsamkeit, die
 * `useUpdateEvent` bei `vars.recurrence` übt.
 *
 * Eine eigene reine Funktion statt einer Bedingung im Hook, damit die
 * Fallunterscheidung ohne React testbar ist.
 *
 * Der Vergleich läuft gegen `occurrenceDate` statt gegen die alte Startzeit,
 * weil genau dieser Wert die Identität der bearbeiteten Occurrence trägt und
 * `EventEditScreen` ihn unverändert aus `useEvent` durchreicht.
 */
export function canApplyOptimistically(args: {
  scope: EditScope;
  isRecurring: boolean;
  occurrenceDate: string;
  changes: EventChanges;
}): boolean {
  // Einzeltermin und `this` auf einer Serie schreiben Literalzeiten — dort
  // verschiebt eine Datumsänderung den Termin tatsächlich, und das Overlay
  // bildet sie korrekt ab.
  if (!args.isRecurring || args.scope === "this") return true;
  return format(new Date(args.changes.start_at), "yyyy-MM-dd") === args.occurrenceDate;
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

/**
 * Präfix der **synthetischen Event-Id**, die ein optimistischer Create trägt.
 *
 * Als Konstante statt als Literal, weil zwei Stellen darauf angewiesen sind:
 * `optimisticEventRow` in [createMutation.ts](./createMutation.ts) prägt sie,
 * und `isOptimisticEventId` erkennt sie wieder. Fielen die beiden auseinander,
 * wäre der Guard in den Listen still wirkungslos.
 */
export const OPTIMISTIC_EVENT_ID_PREFIX = "optimistic-";

/**
 * Ob diese Event-Id zu einem Termin gehört, den der Server noch nicht kennt.
 *
 * Gebraucht von `KalenderScreen` und `DashboardScreen`: Beide machen jede
 * Occurrence zu einem `Pressable`, der `/event/[id]` mit `occ.eventId` öffnet.
 * Für einen optimistischen Create ist das `"optimistic-7"` — `fetchEventById`
 * schickte das gegen eine `uuid`-Spalte, PostgREST antwortete `22P02 invalid
 * input syntax for type uuid`, und der Detail-Screen zeigte einen englischen
 * Datenbankfehler in einer deutschen Oberfläche. Das Fenster ist bei Mobilfunk
 * gern zwei Sekunden lang, und der Nutzer schaut in genau diesem Moment
 * dorthin, weil sein Termin gerade erschienen ist.
 */
export function isOptimisticEventId(eventId: string): boolean {
  return eventId.startsWith(OPTIMISTIC_EVENT_ID_PREFIX);
}

/**
 * Wie lange ein optimistischer Eintrag höchstens stehen bleibt, wenn die
 * Mutation ihn nicht selbst abräumt.
 *
 * Die Spec begründete den fehlenden Watchdog damit, der Eintrag lebe „genau so
 * lange wie die Mutation". Genau diese Annahme hat
 * [ADR-026](../../docs/decision-log.md) für den Pending-Delete-Store bereits
 * geprüft und verworfen (siehe `COMMIT_TIMEOUT_MS` in
 * [pendingDeletes.ts](../shared/pendingDeletes.ts)): [client.ts](../supabase/client.ts)
 * setzt dem `fetch` kein Timeout, hinter einem Captive Portal settelt eine
 * Anfrage weder, noch lehnt sie ab. Hier kommt erschwerend hinzu, dass
 * `onSettled` zusätzlich auf den Refetch wartet.
 *
 * Ohne Obergrenze liefe `onSettled` nie, `remove(id)` liefe nie, und ein nie
 * gespeicherter Termin stünde für den Rest der Sitzung im Kalender **und** im
 * Dashboard — ohne Toast, ohne Log. Der Nutzer verließe sich auf einen Termin,
 * den es nicht gibt.
 *
 * Dieselben 30 Sekunden wie beim Löschen, aus demselben Grund.
 */
export const OPTIMISTIC_TIMEOUT_MS = 30_000;

interface OptimisticEventsState {
  entries: OptimisticEvent[];
  /**
   * Legt einen Eintrag an und gibt seine Id zurück — `onMutate` reicht sie als
   * Kontext weiter. `timeoutMs` liegt am Aufruf statt an einer festen Konstante,
   * damit Tests den Watchdog kurz stellen können; wie `timeoutMs` am
   * Pending-Delete-Eintrag.
   */
  add: (payload: OptimisticCreate | OptimisticUpdate, timeoutMs?: number) => string;
  remove: (id: string) => void;
  /**
   * Verwirft alle offenen Einträge samt ihrer Watchdogs. Für das Abmelden:
   * `useSignOut` räumt bereits den Query-Cache und die Pending-Deletes ab; ohne
   * diesen dritten Store stünde der optimistische Termin des Vorgängers im
   * Kalender des nächsten Familienmitglieds, das sich auf demselben Gerät
   * anmeldet — mit Titel, Ort und Kind-Zuordnung.
   */
  clear: () => void;
}

// Timer gehören nicht in den Store — genau wie bei den Pending-Deletes: Sie
// lösen kein Rendern aus, und ein `setTimeout`-Handle im State schlüge bei
// jedem Abonnenten als Änderung durch.
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function clearTimer(id: string): void {
  const handle = timers.get(id);
  if (handle !== undefined) {
    clearTimeout(handle);
    timers.delete(id);
  }
}

// Laufende Nummer statt Zufalls-Id: Der Eintrag lebt Sekundenbruchteile, eine
// Kollision über einen App-Lauf hinweg gibt es nicht, und Tests bleiben lesbar.
let sequence = 0;

/**
 * Der Store der offenen optimistischen Einträge.
 *
 * Kalender-eigen statt in `features/shared`: Aufgaben brauchen ihn nicht, und
 * dadurch entfällt der `target: unknown`-Kniff samt Cast, den der geteilte
 * Pending-Delete-Store braucht — hier ist alles durchtypisiert.
 *
 * Ein Modul-Store, kein React-State: Beide Listen (`KalenderScreen`,
 * `DashboardScreen`) lesen ihn über denselben `useFamilyEvents`-Hook, und der
 * Eintrag muss den Unmount des Sheets überleben, das ihn angelegt hat — die
 * Screens navigieren weg, bevor die Mutation settlet.
 *
 * Jeder Eintrag bekommt beim Anlegen einen **Watchdog** (siehe
 * `OPTIMISTIC_TIMEOUT_MS`), den `remove` im Normalfall wieder abräumt. Die
 * Mutation wird dabei ausdrücklich nicht abgebrochen.
 */
export const useOptimisticEventsStore = create<OptimisticEventsState>((set) => ({
  entries: [],
  add: (payload, timeoutMs = OPTIMISTIC_TIMEOUT_MS) => {
    sequence += 1;
    const id = `optimistic-${sequence}`;
    set((state) => ({ entries: [...state.entries, { id, ...payload }] }));
    timers.set(
      id,
      setTimeout(() => {
        // Die Mutation wird **nicht** abgebrochen — sie darf ruhig noch
        // ankommen; wir hören nur auf, auf sie zu warten. Danach bestimmen
        // wieder die Serverdaten, was der Kalender zeigt: sichtbar und
        // selbstheilend statt unsichtbar falsch bis zum App-Neustart. Geloggt
        // wie in `pendingDeletes.commit`, damit der Fall nicht spurlos bleibt.
        console.error("[optimisticEvents] Eintrag abgelaufen", { id, timeoutMs });
        useOptimisticEventsStore.getState().remove(id);
      }, timeoutMs),
    );
    return id;
  },
  remove: (id) => {
    clearTimer(id);
    set((state) => ({ entries: state.entries.filter((entry) => entry.id !== id) }));
  },
  clear: () => {
    for (const id of [...timers.keys()]) clearTimer(id);
    set({ entries: [] });
  },
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
 *
 * **Was die Reihenfolge kostet:** Die Occurrences eines optimistischen
 * **Creates** umgehen den Löschfilter strukturell — sie entstehen erst hinter
 * ihm, `withOptimistic` hängt sie an. Folgenlos, weil eine synthetische
 * `optimistic-`-Id keine Löschung adressieren kann (siehe
 * `isOptimisticEventId`); der Fall ist damit unerreichbar, nicht bloß
 * unwahrscheinlich. Der ADR sagt das, die Funktion sagte es bisher nicht.
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
