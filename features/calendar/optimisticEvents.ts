import type { QueryCache, QueryClient } from "@tanstack/react-query";

import { format } from "date-fns";
import { create } from "zustand";

import type { EventWithRelations } from "./expand";
import type { PendingEventDelete } from "./pendingDeletes";
import type { EditScope, EventChanges, RecurrenceChanges } from "./recurrence";
import type { CalendarOccurrence } from "./types";

import { hidesOccurrence } from "./pendingDeletes";
import { calendarKeys } from "./queries";
import { mergeDateAndTimeOfDay, zonedDateKey } from "./timezone";

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
 * Sie muss gut aussehen, nicht exakt sein — das erste Laden nach dem Speichern
 * korrigiert sie, online innerhalb einer Sekunde.
 */

/**
 * Ob dieser Update-Eintrag die gegebene Occurrence betrifft.
 *
 * Dieselben drei Scopes wie `hidesOccurrence` in [pendingDeletes.ts](./pendingDeletes.ts),
 * und aus demselben Grund derselbe String-Vergleich: `YYYY-MM-DD` ist
 * lexikographisch chronologisch, ein `Date` wäre hier nur eine Zeitzonenfalle.
 * `forward` schließt den Stichtag **ein** — geändert wird „ab diesem Termin".
 *
 * Verglichen wird `occurrenceKey`, nicht `occurrenceDate`: „ab diesem Termin"
 * meint den Ausschnitt, den der Server über die Regel bestimmt
 * (`consumedBefore`/`dayBefore` in `recurrence.ts`), und der rechnet in
 * Regel-Daten. Eine bereits verschobene Occurrence hätte mit dem aufgelösten
 * Datum verglichen den Ausschnitt verfehlen oder zu Unrecht treffen können
 * (ADR-034).
 */
export function patchesOccurrence(
  entry: { eventId: string; occurrenceKey: string; scope: EditScope },
  occurrence: { eventId: string; occurrenceKey: string },
): boolean {
  if (entry.eventId !== occurrence.eventId) return false;
  switch (entry.scope) {
    case "this":
      return entry.occurrenceKey === occurrence.occurrenceKey;
    case "forward":
      return occurrence.occurrenceKey >= entry.occurrenceKey;
    case "all":
      return true;
  }
}

/**
 * Ob eine Änderung überhaupt optimistisch angezeigt werden **darf**.
 *
 * Der Grenzfall ist `all`/`forward` mit geändertem **Datumsanteil**, und seit
 * [ADR-032](../../docs/decision-log.md) unterscheiden sich die beiden Scopes:
 *
 * - Bei `all` verwirft `updateMaster` (`anchoredChanges` in `recurrence.ts`)
 *   die Datumsänderung still und schreibt nur die neue Tageszeit auf die
 *   Master-Zeile — das Datum bleibt das des Masters. Das Overlay darf diese
 *   verworfene Änderung also nicht zeigen.
 * - Bei `forward` verankert die Serie tatsächlich neu: `insertSplitEvent`
 *   schreibt `changes.start_at` weiterhin wörtlich als `dtstart` der
 *   Schwanzhälfte, jede Occurrence ab dem Schnitt wandert also mit.
 *   Nachgerechnet an einer monatlichen Serie am 5., ab dem Schnitt verschoben
 *   auf den 7.10.: Das Overlay zeigt `[09-05, 10-05, 11-05]`, der Refetch
 *   liefert `[10-07, 11-07, 12-07]`.
 *
 * Bei `forward` wäre die Alternative die Anzeige der **Nicht-Änderung genau
 * der Eigenschaft, die der Nutzer gerade geändert hat**: Er verschiebt den
 * Elternabend auf den 7., der Kalender zeigt alles unverändert, er hält das
 * Speichern für fehlgeschlagen, und eine Sekunde später springt die
 * Schwanzhälfte doch auf die neuen Daten. Bei `all` gibt es diesen Sprung
 * nicht — dort wird schlicht eine Eingabe verworfen, die der Nutzer nicht
 * sieht. In beiden Fällen gilt: lieber gar kein optimistischer Eintrag als
 * einer, der von einer Annahme abhängt, die der Server so nicht (mehr)
 * einlöst.
 *
 * Derselbe Fehler droht bei einer **Regeländerung** (`recurrence`, z. B.
 * wöchentlich → zweiwöchentlich): Der Server schreibt die neue RRULE, das
 * Overlay kann aber nur Felder auf dem **bestehenden** Occurrence-Satz patchen
 * — welche Termine nach der neuen Regel überhaupt existieren, wüsste nur eine
 * clientseitige RRULE-Expansion für eine noch ungespeicherte Regel. Bleibt der
 * alte Satz stehen, zeigt der Kalender bis zum Refetch die **alten**
 * Occurrence-Termine mit den **neuen** Feldern — der Nutzer ändert den
 * Rhythmus, sieht aber weiterhin die alten Termine. Nur eine tatsächlich
 * mitgeschickte Regeländerung blockt: `recurrence` ist optional und `null`
 * bedeutet „Regel unverändert", beides muss weiterhin durchgehen.
 *
 * Eine eigene reine Funktion statt einer Bedingung im Hook, damit die
 * Fallunterscheidung ohne React testbar ist.
 *
 * Der Vergleich läuft gegen `occurrenceKey` statt gegen die alte Startzeit,
 * weil genau dieser Wert die Identität der bearbeiteten Occurrence trägt
 * (ADR-034) und `EventEditScreen` ihn unverändert aus `useEvent` durchreicht.
 *
 * Der Vergleich läuft in `timezone` — der Zone des **Termins**, nicht des
 * Geräts (Befund C, PR #121): `zonedDateKey(new Date(args.changes.start_at),
 * args.timezone)` liest denselben Kalendertag, den auch `anchoredChanges`
 * (`recurrence.ts`) beim Schreiben verankert. Vor diesem Fix las der Vergleich
 * mit `format(…, "yyyy-MM-dd")` in der Zone des Geräts — vor ADR-034 folgenlos,
 * weil `anchoredChanges` dieselbe Geräte-Zone benutzte und beide Seiten daher
 * gleich falsch waren. Seit `anchoredChanges` zonenkorrekt rechnet, hätte der
 * Gerätezonen-Vergleich bei einem Termin nahe Mitternacht in einer anderen
 * Zone als der des Geräts falsch entscheiden können — der Aufrufer hat die
 * Zone ohnehin zur Hand (`EventEditScreen` reicht sie bereits an
 * `recurrenceToRrule` durch), eine Interface-Änderung war also nicht nötig.
 *
 * **Einordnung, keine offene Grenze mehr:** Selbst ein falsches Ergebnis hier
 * träfe nur die **Anzeige** bis zum ersten Laden nach dem Speichern — nie den
 * gespeicherten Wert, den `anchoredChanges` unabhängig davon korrekt schreibt.
 */
export function canApplyOptimistically(args: {
  scope: EditScope;
  isRecurring: boolean;
  occurrenceKey: string;
  timezone: string;
  changes: EventChanges;
  recurrence?: RecurrenceChanges | null;
}): boolean {
  // Eine mitgeschickte Regeländerung redefiniert die Serie unabhängig vom
  // Scope — siehe Docstring oben.
  if (args.recurrence) return false;
  // Einzeltermin und `this` auf einer Serie schreiben Literalzeiten — dort
  // verschiebt eine Datumsänderung den Termin tatsächlich, und das Overlay
  // bildet sie korrekt ab.
  if (!args.isRecurring || args.scope === "this") return true;
  return zonedDateKey(new Date(args.changes.start_at), args.timezone) === args.occurrenceKey;
}

/**
 * Wendet eine Änderung auf eine Occurrence an — so, wie `expandEvents` sie nach
 * dem Refetch **anzeigen** wird, nicht wie der Server sie schreibt.
 *
 * **Eine Unterscheidung trägt die Funktion: literale Zeiten oder neu
 * verankerte?** Trifft die Änderung die Master-Zeile *einer Serie* (`all`,
 * `forward`), schreibt der Server dort `start_at`/`end_at`, und `expandEvents`
 * trägt deren **Tageszeit** in jede Occurrence, während jede ihr eigenes Datum
 * behält. Ein stumpfes Übernehmen zöge die Serie auf einen Tag zusammen. Beim
 * Einzeltermin und bei einer Exception (`this` auf einer Serie) gelten dagegen
 * die Literalwerte — dort verschiebt eine Datumsänderung den Termin
 * tatsächlich.
 *
 * `description` war bis ADR-035 eine zweite Unterscheidung: `applyOverride`
 * kannte den Key nicht, `expandEvents` las das Feld immer von der Master-Zeile,
 * und eine per Exception geänderte Beschreibung hier zu zeigen hieß, sie eine
 * Sekunde später vom Refetch wegnehmen zu lassen — genau das Flackern, gegen
 * das dieses Feature antritt. Seit der Override-Vertrag das Feld führt, zeigt
 * der Refetch denselben Wert, und die Eingabe gilt in beiden Fällen.
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

  const startAt = literalTimes
    ? newStart
    : mergeDateAndTimeOfDay(occurrence.startAt, newStart, occurrence.timezone);
  const endAt = literalTimes
    ? newEnd
    : new Date(startAt.getTime() + (newEnd.getTime() - newStart.getTime()));

  return {
    ...occurrence,
    title: changes.title,
    location: changes.location,
    description: changes.description,
    startAt,
    endAt,
    // `expandEvents` leitet das Datum aus dem aufgelösten Start ab, nicht aus
    // der Regel — eine verschobene Occurrence wandert also mit.
    occurrenceDate: format(startAt, "yyyy-MM-dd"),
    // `occurrenceKey` wird bewusst NICHT neu berechnet, obwohl `startAt` sich
    // gerade verschoben haben kann: Er kommt unverändert über den Spread oben
    // und bleibt, was er war — dieselbe Zeile in `event_exceptions`, nur mit
    // neuem Inhalt. Ihn hier aus dem neuen `startAt` abzuleiten würde eine
    // optimistisch verschobene Occurrence beim zweiten Bearbeiten oder Löschen
    // auf die falsche (oder eine nicht existierende) Exception-Zeile schicken
    // — genau der Fehler, den ADR-034 behebt.
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
  /**
   * Die Id, unter der der Server den Termin anlegt (`vars.id`). Angezeigt wird
   * weiter `row.id` (`optimistic-<n>`), damit der Termin nicht antippbar ist
   * (`isOptimisticEventId`); zugeordnet wird über diese hier (§3.2 der
   * [Kalender-Spec](../../docs/superpowers/specs/2026-10-29-kalender-cache-design.md)): Trägt
   * eine Ansicht schon die Serverzeile, gilt dort der Server, und ein späteres
   * Update oder Delete mit dieser `eventId` trifft auch die Overlay-Zeile.
   */
  serverId: string;
}

/**
 * Ein Update einer bereits expandierten Occurrence — der Eintrag beschreibt
 * eine Änderung, die der Store hält, bis keine Ansicht mehr Daten von vor dem
 * Speichern zeigt (§3.3 der
 * [Kalender-Spec](../../docs/superpowers/specs/2026-10-29-kalender-cache-design.md)).
 */
export interface OptimisticUpdate {
  kind: "update";
  eventId: string;
  /** Der Schlüssel der bearbeiteten Occurrence (ADR-034), aus `UpdateEventVars.occurrenceKey`. */
  occurrenceKey: string;
  scope: EditScope;
  changes: EventChanges;
}

/**
 * Eine ausgeführte Löschung, die eine Ansicht mit Daten von vor dem Löschen
 * weiter ausblendet (§3.4 der
 * [Kalender-Spec](../../docs/superpowers/specs/2026-10-29-kalender-cache-design.md)).
 * Dasselbe Ziel wie im Undo-Fenster, darum dieselbe Form und dasselbe
 * `hidesOccurrence`.
 *
 * Kommt nie über `add` in den Store, sondern erst mit dem Erfolg über
 * `confirm`: Eine Löschung hat keine Phase „unterwegs", bis zum Erfolg des
 * DELETE blendet sie der Pending-Delete-Store aus.
 */
export interface OptimisticDelete extends PendingEventDelete {
  kind: "delete";
}

/** Was ein Aufrufer über einen Eintrag sagt; `id` und `savedAt` führt der Store. */
export type OptimisticPayload = OptimisticCreate | OptimisticUpdate | OptimisticDelete;

/**
 * Ein Eintrag aus dem Optimistic-Store, in einer von zwei Phasen (§3.1 der
 * [Kalender-Spec](../../docs/superpowers/specs/2026-10-29-kalender-cache-design.md)).
 *
 * Die `id` wird vom Store verwaltet und kommt dort von außen nicht rein — daher
 * die Intersection-Struktur statt eines Feldes in den Basistypen. Sie wird
 * benötigt, um den Eintrag später aus dem Store zu entfernen.
 */
export type OptimisticEvent = OptimisticPayload & {
  id: string;
  /**
   * `null` = „unterwegs": Die Mutation läuft, der Eintrag gilt in jeder
   * Ansicht. Eine Zahl = „gespeichert" um diesen `Date.now()`; ab dann gilt er
   * nur noch in Ansichten mit älteren Daten (`appliesToView`).
   */
  savedAt: number | null;
};

/**
 * Der Datenstand einer Ansicht, also einer Range-Query: ihr `dataUpdatedAt`
 * und ihre `data`. `rows: undefined` heißt „noch nie Daten" (neuer Monat,
 * erstes Laden gescheitert).
 */
export interface EventsView {
  dataUpdatedAt: number;
  rows: readonly EventWithRelations[] | undefined;
}

/**
 * Ob ein Eintrag in dieser Ansicht gilt (§3.2 der
 * [Kalender-Spec](../../docs/superpowers/specs/2026-10-29-kalender-cache-design.md)).
 * Die Prüfungen laufen in dieser Reihenfolge:
 *
 * 1. Ein Create, dessen Serverzeile (`serverId`) die Ansicht schon trägt, gilt
 *    nie, auch „unterwegs" nicht. Das deckt ein Laden ab, das den Termin
 *    bringt, aber vor dem Speichern ankam (etwa über das eigene
 *    Realtime-Echo), und hält die Overlay-Zeile neben der echten heraus.
 * 2. „Unterwegs" gilt er in jeder Ansicht (§3.1).
 * 3. Ohne Serverdaten gilt er: Eine solche Ansicht ist „älter".
 * 4. Sonst nur, solange die Daten nicht neuer sind als das Speichern.
 *    Gleichstand zählt als „älter": Daten, die in derselben Millisekunde
 *    landen, stammen aus einem Laden, das vorher begann.
 *
 * Für Update und Delete gibt es kein Gegenstück zu 1: Ihre Serverzeile gab es
 * schon vorher, ihr Vorhandensein sagt nichts darüber, ob die Änderung darin
 * steckt. Ab 4 gilt deshalb allein der Server, auch wenn danach jemand anderes
 * den Termin geändert oder gelöscht hat (Anti-Ziel in §2 der Kalender-Spec).
 */
export function appliesToView(entry: OptimisticEvent, view: EventsView): boolean {
  if (entry.kind === "create" && view.rows?.some((row) => row.id === entry.serverId)) {
    return false;
  }
  if (entry.savedAt === null) return true;
  if (view.rows === undefined) return true;
  return view.dataUpdatedAt <= entry.savedAt;
}

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
 * Wie lange ein Eintrag in der Phase „unterwegs" höchstens stehen bleibt, wenn
 * die Mutation sich nicht meldet.
 *
 * Die Spec begründete den fehlenden Watchdog damit, der Eintrag lebe „genau so
 * lange wie die Mutation". Genau diese Annahme hat
 * [ADR-026](../../docs/decision-log.md) für den Pending-Delete-Store bereits
 * geprüft und verworfen (siehe `COMMIT_TIMEOUT_MS` in
 * [pendingDeletes.ts](../shared/pendingDeletes.ts)): [client.ts](../supabase/client.ts)
 * setzt dem `fetch` kein Timeout, hinter einem Captive Portal settelt eine
 * Anfrage weder, noch lehnt sie ab.
 *
 * Ohne Obergrenze käme weder Erfolg noch Fehler an, `remove(id)` liefe nie, und
 * ein nie gespeicherter Termin stünde für den Rest der Sitzung im Kalender
 * **und** im Dashboard — ohne Toast, ohne Log. Der Nutzer verließe sich auf
 * einen Termin, den es nicht gibt.
 *
 * In der Phase „gespeichert" gibt es keinen Watchdog (§3.1 der
 * [Kalender-Spec](../../docs/superpowers/specs/2026-10-29-kalender-cache-design.md)):
 * Dort zeigt der Eintrag, was gespeichert ist, auch offline über Stunden.
 * Meldet der Server nach dem Ablauf doch noch Erfolg, legt `confirm` den
 * Eintrag gespeichert wieder an.
 *
 * Dieselben 30 Sekunden wie beim Löschen, aus demselben Grund.
 */
export const OPTIMISTIC_TIMEOUT_MS = 30_000;

interface OptimisticEventsState {
  entries: OptimisticEvent[];
  /**
   * Legt einen Eintrag „unterwegs" an und gibt seine Id zurück — `onMutate`
   * reicht sie als Kontext weiter. `timeoutMs` liegt am Aufruf statt an einer
   * festen Konstante, damit Tests den Watchdog kurz stellen können; wie
   * `timeoutMs` am Pending-Delete-Eintrag.
   */
  add: (payload: OptimisticCreate | OptimisticUpdate, timeoutMs?: number) => string;
  /**
   * Überführt einen Eintrag in die Phase „gespeichert" (§3.1 der
   * [Kalender-Spec](../../docs/superpowers/specs/2026-10-29-kalender-cache-design.md)):
   * `savedAt` wird jetzt gesetzt, der Watchdog endet. Steht `id` noch im
   * Store, bleibt der Eintrag an seiner Stelle. Sonst kommt er neu dazu, aber
   * nur in zwei Fällen: der späte Erfolg, nachdem der **Watchdog** die `id`
   * entfernt hat, und jedes `delete`, das ohne `id` nie „unterwegs" war. Hat
   * dagegen `remove(id)` oder `clear()` den Eintrag verworfen, legt ein später
   * Erfolg nichts an und abonniert nichts: Nach dem Abmelden stünde sonst der
   * Termin des Vorgängers im Kalender des nächsten Kontos, denn `useSignOut`
   * wartet nicht auf laufende Mutationen, und die Range-Keys tragen keine
   * Familie.
   *
   * Danach hält ein Abo auf `cache` den Eintrag genau so lange, wie ihn eine
   * Range-Query noch braucht (§3.3): geprüft sofort und bei jedem
   * Cache-Ereignis. Inaktive Queries und solche ohne Daten zählen mit, bis
   * TanStack sie nach `gcTime` verwirft. Ein Abo statt einer Prüfung beim
   * Rendern, weil jede Ansicht nur ihre eigene Query kennt und der Store sonst
   * über die Sitzung wüchse.
   */
  confirm: (payload: OptimisticPayload, cache: QueryCache, id?: string) => void;
  /**
   * Nimmt einen Eintrag heraus, samt Watchdog und Cache-Abo. Eine unbekannte Id
   * ist kein Fehler. Ein späteres `confirm` mit dieser Id legt nichts mehr an.
   */
  remove: (id: string) => void;
  /**
   * Verwirft alle Einträge samt Watchdogs und Cache-Abos. Für das Abmelden:
   * `useSignOut` räumt bereits den Query-Cache und die Pending-Deletes ab; ohne
   * diesen dritten Store stünde der optimistische Termin des Vorgängers im
   * Kalender des nächsten Familienmitglieds, das sich auf demselben Gerät
   * anmeldet — mit Titel, Ort und Kind-Zuordnung. Ohne das Ende der Abos liefe
   * die Prüfung jedes verworfenen Eintrags bei jedem Cache-Ereignis weiter.
   * Ein später Erfolg einer Mutation von vor dem Leeren legt nichts neu an,
   * auch nicht nach dem Watchdog (siehe `confirm`).
   */
  clear: () => void;
}

// Timer und Cache-Abos gehören nicht in den Store — genau wie bei den
// Pending-Deletes: Sie lösen kein Rendern aus, und ein Handle im State schlüge
// bei jedem Abonnenten als Änderung durch.
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const subscriptions = new Map<string, () => void>();
// Ids, die der Watchdog entfernt hat und deren Mutation noch Erfolg melden
// darf. Nur sie legt `confirm` neu an; `remove` und `clear` streichen sie.
const expired = new Set<string>();

/** Beendet Watchdog und Cache-Abo eines Eintrags, soweit vorhanden. */
function release(id: string): void {
  const handle = timers.get(id);
  if (handle !== undefined) clearTimeout(handle);
  timers.delete(id);
  subscriptions.get(id)?.();
  subscriptions.delete(id);
}

/**
 * Ob noch eine Range-Query im Cache den Eintrag braucht (§3.3), aktiv oder
 * nicht. Der Query-Cache ist untypisiert; unter `eventsRoot` liegen nur die
 * Zeilen aus `fetchEventsInRange`.
 */
function neededByAnyView(entry: OptimisticEvent, cache: QueryCache): boolean {
  return cache.findAll({ queryKey: calendarKeys.eventsRoot }).some((query) =>
    appliesToView(entry, {
      dataUpdatedAt: query.state.dataUpdatedAt,
      rows: query.state.data as EventWithRelations[] | undefined,
    }),
  );
}

// Laufende Nummer statt Zufalls-Id: Eine Kollision über einen App-Lauf hinweg
// gibt es nicht, und Tests bleiben lesbar.
let sequence = 0;

function nextId(): string {
  sequence += 1;
  return `optimistic-${sequence}`;
}

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
 * `OPTIMISTIC_TIMEOUT_MS`), den `confirm` oder `remove` im Normalfall wieder
 * abräumt. Die Mutation wird dabei ausdrücklich nicht abgebrochen. Gespeichert
 * verlässt ein Eintrag den Store über sein Cache-Abo (`confirm`).
 *
 * Die vom Store geführten Felder `id` und `savedAt` stehen beim Bauen eines
 * Eintrags hinter dem Spread: Ein strukturell breiteres Objekt als Payload
 * überschriebe sie sonst, und der Watchdog hinge an einer anderen Id.
 */
export const useOptimisticEventsStore = create<OptimisticEventsState>((set, get) => ({
  entries: [],
  add: (payload, timeoutMs = OPTIMISTIC_TIMEOUT_MS) => {
    const id = nextId();
    set((state) => ({ entries: [...state.entries, { ...payload, id, savedAt: null }] }));
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
        // Nach `remove`, das die Marke sonst gleich wieder striche.
        expired.add(id);
      }, timeoutMs),
    );
    return id;
  },
  confirm: (payload, cache, id) => {
    if (
      id !== undefined &&
      !expired.delete(id) &&
      !get().entries.some((existing) => existing.id === id)
    ) {
      return;
    }
    const entryId = id ?? nextId();
    release(entryId);
    const entry: OptimisticEvent = { ...payload, id: entryId, savedAt: Date.now() };
    set((state) => ({
      entries: state.entries.some((existing) => existing.id === entryId)
        ? state.entries.map((existing) => (existing.id === entryId ? entry : existing))
        : [...state.entries, entry],
    }));
    const check = () => {
      if (!neededByAnyView(entry, cache)) useOptimisticEventsStore.getState().remove(entryId);
    };
    // Erst abonnieren, dann prüfen: Räumt schon die erste Prüfung ab, beendet
    // `remove` das Abo gleich mit, statt es hängen zu lassen.
    subscriptions.set(entryId, cache.subscribe(check));
    check();
  },
  remove: (id) => {
    release(id);
    expired.delete(id);
    set((state) => ({ entries: state.entries.filter((entry) => entry.id !== id) }));
  },
  clear: () => {
    for (const id of [...timers.keys(), ...subscriptions.keys()]) release(id);
    expired.clear();
    set({ entries: [] });
  },
}));

/** Die offenen optimistischen Änderungen. Referenzstabil, solange sich nichts ändert. */
export function useOptimisticEvents(): OptimisticEvent[] {
  return useOptimisticEventsStore((state) => state.entries);
}

/**
 * Was `onMutate` als Kontext weiterreicht. Neben der Id auch der Payload:
 * Hat der Watchdog den Eintrag schon entfernt, legt `confirm` ihn daraus
 * gespeichert neu an (§3.1 der
 * [Kalender-Spec](../../docs/superpowers/specs/2026-10-29-kalender-cache-design.md)).
 * Nach `remove` oder `clear` bleibt der Payload ungenutzt.
 */
export interface OptimisticContext {
  id: string;
  payload: OptimisticCreate | OptimisticUpdate;
}

/**
 * Der gemeinsame Erfolgsweg der Kalender-Mutationen (§3.1 bis §3.3 und §3.5
 * der [Kalender-Spec](../../docs/superpowers/specs/2026-10-29-kalender-cache-design.md)).
 * Die Reihenfolge ist fest:
 *
 * 1. `confirm` setzt `savedAt`, **bevor** irgendetwas neu lädt. Erst damit
 *    steht fest, welche Daten einer Ansicht „neuer" sind als das Speichern.
 * 2. `cancelQueries` bricht jedes laufende Laden unter `eventsRoot` ab, auch
 *    ein erstes Laden ohne Daten und das eines inaktiven Monats. Es begann vor
 *    dem Speichern und kann den Stand davor tragen, zählte nach dem Landen
 *    aber als „neuer" und wegen der Standard-`staleTime` 30 s lang als frisch.
 *    `invalidateQueries` allein reicht nicht: Sein `cancelRefetch` greift nur
 *    bei Queries mit Daten, und es lädt nur aktive neu.
 * 3. `invalidateQueries` für `eventsRoot` und `oneRoot`, nicht `all`, wie der
 *    Realtime-Pfad (ADR-030): `types` und `reminders` hängen an keiner
 *    Termin-Änderung. In TanStack 5.105 bricht `Query.cancel` synchron ab
 *    (`retryer.cancel` → `reject`, der Revert setzt `fetchStatus: "idle"`),
 *    darum startet dieses Invalidieren ein neues Laden, statt das abgebrochene
 *    Promise zurückzugeben. Vertauscht bräche `cancelQueries` genau das Laden
 *    ab, das `invalidateQueries` gerade für die aktive Ansicht gestartet hat,
 *    und sie bliebe bis zum nächsten Fokus oder Mount auf dem alten Stand.
 *
 * Nichts wird erwartet, die Rückgabe ist `void`: Über die Sichtbarkeit
 * entscheidet die Overlay-Regel, und ein hängender Refetch hielte sonst die
 * Mutation und mit ihr das Abmelden auf. Beide Promises lehnen nie ab.
 *
 * `saved` fehlt, wenn `onMutate` keinen Eintrag angelegt hat (Event-Typ nicht
 * im Cache, `canApplyOptimistically` falsch); dann wird nur neu geladen.
 */
export function confirmEventSave(
  qc: QueryClient,
  saved: { payload: OptimisticPayload; id?: string } | undefined,
): void {
  if (saved) {
    useOptimisticEventsStore.getState().confirm(saved.payload, qc.getQueryCache(), saved.id);
  }
  void qc.cancelQueries({ queryKey: calendarKeys.eventsRoot });
  void qc.invalidateQueries({ queryKey: calendarKeys.eventsRoot });
  void qc.invalidateQueries({ queryKey: calendarKeys.oneRoot });
}

/**
 * Die Anzeige-Pipeline hinter `useFamilyEvents`, für genau eine Ansicht (§3.2
 * der [Kalender-Spec](../../docs/superpowers/specs/2026-10-29-kalender-cache-design.md)):
 *
 * 1. Es zählen nur die Einträge, die in `view` gelten (`appliesToView`).
 * 2. Zu den Server-Occurrences kommen die der gültigen Creates.
 * 3. Weg ist, was eine offene Löschung im Undo-Fenster oder ein gültiges
 *    Delete trifft (`hidesOccurrence`).
 * 4. Gültige Updates patchen in Store-Reihenfolge.
 *
 * Als eigene Funktion, nicht inline im Hook — damit die Pipeline testbar ist.
 * Stünde sie im Hook, könnte ein Test sie nur nachbauen, und ein nachgebauter
 * Test bliebe grün, wenn jemand den Hook zurückdreht. Genau das ist bei der
 * ersten Fassung passiert.
 *
 * `expand` wird **injiziert** statt importiert: `expandEvents` braucht
 * `rangeStart`, `rangeEnd` und `theme`, die alle im Hook liegen. So bleibt diese
 * Funktion rein und ein Test kann sie mit einem Stub bedienen. Die Range-Grenze
 * für neu angelegte Termine fällt dabei gratis ab — `expandEvents` wendet sie
 * ohnehin an.
 *
 * **Overlay-Zeilen laufen durch Filter und Patch.** Zum Abgleich gilt für sie
 * die `serverId` ihres Creates als `eventId`, angezeigt wird weiter
 * `optimistic-<n>`. Ohne die Zuordnung brächte eine Ansicht mit alten Daten
 * einen Termin zurück, den der Nutzer anderswo schon gelöscht oder geändert
 * hat: in der Überlappung zweier Monate angelegt, vom November aus gelöscht,
 * zurück auf den Oktober.
 *
 * **Erst filtern, dann patchen:** Eine Löschung gewinnt gegen ein
 * gleichzeitiges Update (ADR-027 Decision 9). Seit `hidesOccurrence` und
 * `patchesOccurrence` beide gegen `occurrenceKey` vergleichen, das
 * `applyOptimisticChanges` nie neu berechnet, kommutieren die beiden Schritte;
 * die Reihenfolge bleibt als Gürtel und Hosenträger.
 *
 * Gilt kein Eintrag und ist keine Löschung offen, kommt `expanded`
 * **unverändert** zurück. Das spart im Normalfall einen Durchlauf und eine
 * Allokation; für die Referenzstabilität des Aufrufers tut es nichts, denn der
 * Aufruf steht innerhalb seines `useMemo`.
 */
export function visibleOccurrences(args: {
  expanded: CalendarOccurrence[];
  view: EventsView;
  pending: readonly PendingEventDelete[];
  optimistic: readonly OptimisticEvent[];
  expand: (rows: EventWithRelations[]) => CalendarOccurrence[];
}): CalendarOccurrence[] {
  const active = args.optimistic.filter((entry) => appliesToView(entry, args.view));
  if (active.length === 0 && args.pending.length === 0) return args.expanded;

  // Jede Occurrence mit der Id, unter der der Server sie kennt.
  const candidates = [
    ...args.expanded.map((occurrence) => ({ occurrence, eventId: occurrence.eventId })),
    ...active.flatMap((entry) =>
      entry.kind === "create"
        ? args.expand([entry.row]).map((occurrence) => ({ occurrence, eventId: entry.serverId }))
        : [],
    ),
  ];
  const hiding = [...args.pending, ...active.filter((entry) => entry.kind === "delete")];
  const updates = active.filter((entry) => entry.kind === "update");

  return candidates.flatMap(({ occurrence, eventId }) => {
    const target = { eventId, occurrenceKey: occurrence.occurrenceKey };
    if (hiding.some((entry) => hidesOccurrence(entry, target))) return [];
    let next = occurrence;
    for (const update of updates) {
      if (patchesOccurrence(update, target)) {
        next = applyOptimisticChanges(next, update.scope, update.changes);
      }
    }
    return [next];
  });
}
