import { addDays, format, parseISO } from "date-fns";

import type { Database } from "@/features/supabase/database.types";

import { allOccurrences } from "./rrule";
import { ruleOf, sameRule } from "./rule";
import {
  floatingToInstant,
  instantToFloating,
  mergeDateAndTimeOfDay,
  zonedDateKey,
  zonedDayBounds,
} from "./timezone";

type EventRow = Database["public"]["Tables"]["events"]["Row"];

export type EditScope = "this" | "forward" | "all";

export interface EventChanges {
  title: string;
  start_at: string;
  end_at: string;
  location: string | null;
  description: string | null;
}

/**
 * A series-level rule change. Separate from `EventChanges` because the latter
 * doubles as the per-occurrence override JSON, where rrule columns have no
 * meaning — a single occurrence cannot carry a recurrence rule.
 *
 * All five columns travel together so the write is total: partial updates could
 * leave a count and an until set at once, which the DB rejects
 * (`events_rrule_count_xor_until`).
 */
export interface RecurrenceChanges {
  rrule_freq: EventRow["rrule_freq"];
  rrule_interval: number;
  rrule_byweekday: number[] | null;
  rrule_count: number | null;
  rrule_until: string | null;
}

/**
 * Die Schreib-Operationen, aus denen `applyEditScope`/`applyDeleteScope` einen
 * Scope zusammensetzen. Seit Block 7 gibt es genau eine Implementierung, den
 * aufzeichnenden `createRecordingEventOps` (`eventChange.ts`): Die Ops
 * schreiben nichts mehr selbst, sondern werden zu Schritten für
 * `apply_event_change`, die alle in einer Transaktion laufen (Spec §5.4).
 */
export interface EventOps {
  /** `occurrenceKey` ist die Zeile in `event_exceptions.occurrence_date` (ADR-034). */
  cancelOccurrence: (eventId: string, occurrenceKey: string) => Promise<void>;
  modifyOccurrence: (
    eventId: string,
    occurrenceKey: string,
    override: Partial<EventChanges>,
  ) => Promise<void>;
  deleteMaster: (eventId: string) => Promise<void>;
  /**
   * Ohne eigenen Versions-Stempel: Das Compare-and-Swap, für das er da war
   * (ADR-031, ADR-037), prüft seit Block 7 `apply_event_change` gegen die
   * `baseVersion` des Formulars — in derselben Transaktion wie das Schreiben,
   * das Fenster zwischen Lesen und Schreiben gibt es also nicht mehr.
   */
  updateMaster: (
    eventId: string,
    changes: EventChanges,
    recurrence?: RecurrenceChanges,
  ) => Promise<void>;
  deleteAllExceptions: (eventId: string) => Promise<void>;
  /** `untilIso` ist ein **Instant**, kein Datumsstring — siehe `endOfDayInstant`. */
  setRruleUntil: (eventId: string, untilIso: string) => Promise<void>;
  setRruleCount: (eventId: string, count: number) => Promise<void>;
  deleteExceptionsFromDate: (eventId: string, fromDateInclusive: string) => Promise<void>;
  insertSplitEvent: (
    master: EventRow,
    changes: EventChanges,
    rruleCount: number | null,
  ) => Promise<void>;
}

export interface ApplyDeleteScopeArgs {
  ops: EventOps;
  scope: EditScope;
  eventId: string;
  /** Der Schlüssel der Occurrence, von der aus gelöscht wird (ADR-034). */
  occurrenceKey: string;
  isRecurring: boolean;
  master: EventRow;
}

export interface ApplyEditScopeArgs {
  ops: EventOps;
  scope: EditScope;
  eventId: string;
  /** Der Schlüssel der bearbeiteten Occurrence (ADR-034). */
  occurrenceKey: string;
  isRecurring: boolean;
  master: EventRow;
  changes: EventChanges;
  /**
   * Set only when the user edited the series rule. A rule change redefines the
   * whole series, so it is applied on the "all" path — the edit form forces
   * that scope whenever this is present.
   */
  recurrence?: RecurrenceChanges | null;
}

function dayBefore(occurrenceKey: string): string {
  return format(addDays(parseISO(occurrenceKey), -1), "yyyy-MM-dd");
}

/**
 * Das Ende des Tages `isoDate` **in der Zone des Termins**, als ISO-Instant.
 *
 * `setRruleUntil` schrieb früher den nackten Datumsstring in eine
 * `timestamptz`-Spalte; Postgres castet ihn in der Session-Zone (UTC) zu
 * Mitternacht. Seit die Regel in Wandzeit ausgewertet wird (ADR-033), schnitte
 * das die Serie um 02:00 Ortszeit statt am Tagesende — bei einer täglichen
 * Serie verschwände das Vorkommen des Cutoff-Tages.
 */
function endOfDayInstant(isoDate: string, timeZone: string): string {
  const bounds = zonedDayBounds(isoDate, timeZone);
  // Hier wird bewusst geworfen statt zurückgefallen — anders als in
  // `eventLookupWindow`, das denselben Schlüssel bei ungültiger Eingabe (falsch
  // geformt oder ein Kalenderüberlauf, PR #122) auf sein Standardfenster
  // abbildet: Ein aus Müll abgeleitetes `until` kürzte
  // eine Serie still am falschen Datum, und das ist die Schadensklasse, gegen
  // die dieser ganze Block antritt. Vor ADR-035 warf die Rechnung an dieser
  // Stelle ebenfalls, nur mit einer nichtssagenden Meldung aus `Intl`.
  if (!bounds) throw new RangeError(`endOfDayInstant: kein Datumsschlüssel — "${isoDate}"`);
  return bounds.end.toISOString();
}

/**
 * How many occurrences of a series fall strictly before `occurrenceKey`.
 *
 * iCal COUNT is relative to dtstart, so a bounded series cannot be truncated by
 * writing an UNTIL (the DB even forbids it — `events_rrule_count_xor_until`).
 * Splitting one means re-deriving both halves: the head keeps what it has
 * already consumed, the tail gets `count - consumed`.
 *
 * Occurrences are compared as `yyyy-MM-dd` keys **in the event's own zone**
 * (`zonedDateKey(d, master.timezone)`), not the caller's local zone — that is
 * exactly how `expand.ts` derives the `occurrenceKey` this function receives
 * (`zonedDateKey(occurrenceStart, row.timezone)`, ADR-034). A local-getter
 * comparison compares two different date spaces the moment the reader's
 * device zone differs from the event's: an occurrence near local midnight in
 * one of the two zones could be counted as consumed on one device and not on
 * another, purely because of where the phone is set.
 */
function consumedBefore(master: EventRow, occurrenceKey: string): number {
  if (!master.rrule_freq) return 0;
  // `allOccurrences` ist hier sicher: nur für zählbegrenzte Serien aufgerufen.
  return allOccurrences(master).filter((d) => zonedDateKey(d, master.timezone) < occurrenceKey)
    .length;
}

export async function applyDeleteScope(args: ApplyDeleteScopeArgs): Promise<void> {
  const { ops, scope, eventId, occurrenceKey, isRecurring, master } = args;

  if (scope === "this") {
    if (isRecurring) {
      await ops.cancelOccurrence(eventId, occurrenceKey);
      return;
    }
    await ops.deleteMaster(eventId);
    return;
  }

  if (scope === "forward" && isRecurring) {
    if (master.rrule_count != null) {
      const consumed = consumedBefore(master, occurrenceKey);
      if (consumed === 0) {
        await ops.deleteMaster(eventId);
        return;
      }
      await ops.setRruleCount(eventId, consumed);
      await ops.deleteExceptionsFromDate(eventId, occurrenceKey);
      return;
    }
    const cutoff = dayBefore(occurrenceKey);
    if (cutoff < zonedDateKey(new Date(master.start_at), master.timezone)) {
      await ops.deleteMaster(eventId);
      return;
    }
    await ops.setRruleUntil(eventId, endOfDayInstant(cutoff, master.timezone));
    await ops.deleteExceptionsFromDate(eventId, occurrenceKey);
    return;
  }

  // scope === "all" (or "forward" on a non-recurring event — same outcome)
  await ops.deleteMaster(eventId);
}

/**
 * Ob das Speichern die Regel wirklich ändert — ein unverändert zurückgeschickter
 * Rhythmus soll die Exceptions der Serie nicht löschen. Der Vergleich selbst
 * liegt in `rule.ts`: derselbe, mit dem der Konflikt-Dialog eine fremde
 * Regeländerung erkennt (ADR-038).
 */
function ruleDiffers(master: EventRow, next: RecurrenceChanges): boolean {
  return !sameRule(ruleOf(master), ruleOf(next));
}

/**
 * `changes`, so umgeschrieben, dass der **Serienanker stehen bleibt**.
 *
 * `events.start_at` ist doppelt belegt: Startzeit des Termins *und* `dtstart`
 * der Serie (`buildFloatingRule` in `rrule.ts`). Das Bearbeiten-Formular hydriert aus
 * der angetippten Occurrence, `changes.start_at` trägt also deren Datum.
 * Unbedingt geschrieben, wandert `dtstart` dorthin, und jedes Vorkommen davor
 * fällt aus `rule.between()` — serverseitig, ohne Fehler oder Meldung.
 * Nachgemessen: eine Serie ab 01.06., bearbeitet am 03.08., verliert 9 von 14
 * Vorkommen. Trägt sie ein `rrule_count`, verschiebt sich zusätzlich das ganze
 * Zählfenster, weil COUNT relativ zu `dtstart` läuft.
 *
 * Übernommen wird deshalb nur die **Tageszeit**; das Datum bleibt das des
 * Masters, die Dauer kommt aus der Eingabe. Das ist Zeile für Zeile, was
 * `applyOptimisticChanges` (`optimisticEvents.ts`) für die Anzeige längst tut —
 * Anzeige und Schreibpfad sagen damit dasselbe, was sie vorher nicht taten.
 *
 * Zwei bewusste Grenzen (ADR-032):
 *
 * - Eine **Datumsänderung** unter Scope „alle" wird verworfen. Eine Angabe
 *   stumm fallen zu lassen ist ungleich billiger als stumm neun Vorkommen zu
 *   löschen, und die Anzeige verspricht das Verworfene ohnehin schon. Ein
 *   sichtbarer Hinweis bräuchte einen Copy-Key — siehe `docs/TODO.md`.
 * - Wird eine Serie zum **Einzeltermin** (`recurrence.rrule_freq === null`),
 *   wendet der `recurrence`-Zweig in `applyEditScope` diese Funktion gar nicht
 *   erst an — die Eingabe gilt literal, landet also auf dem Datum der
 *   bearbeiteten Occurrence. Ohne Regel gibt es kein `dtstart` mehr zu
 *   schützen, verloren gehen kann also nichts; `isRecurring` allein reicht
 *   dafür nicht, weil es den Master *vor* dem Schreiben beschreibt und bei
 *   „Keine Wiederholung" noch `true` ist.
 *
 * `events` trägt eine eigene Zone (`events.timezone`, ADR-033), und seit
 * ADR-034 rechnet auch dieser Schreibpfad darin statt mit lokalen Gettern
 * (der Zone des **Lesers**): `mergeDateAndTimeOfDay` ([timezone.ts](./timezone.ts))
 * übernimmt Datum und Tageszeit im Floating-Raum von `master.timezone`. Ohne
 * das verschöbe ein reines Öffnen-und-Speichern mit Scope „alle" von einem
 * Gerät, dessen Zone von `events.timezone` abweicht, die ganze Serie
 * dauerhaft um eine Stunde — genau der Fehler, den derselbe Helfer für
 * `applyOptimisticChanges` (`optimisticEvents.ts`) auf der Anzeigeseite und
 * `recurrenceToRrule` (`createMutation.ts`) für den Wochentag behebt.
 *
 * Die **Dauer** zwischen `changes.start_at` und `changes.end_at` muss aus
 * demselben Grund in Wandzeit gerechnet werden, nicht absolut (Befund D,
 * PR #121): Der Start wird über `mergeDateAndTimeOfDay` korrekt in
 * `master.timezone` verankert, eine absolute Millisekunden-Differenz kennt
 * diese Zone aber nicht. Überquert die **bearbeitete** Spanne eine
 * Zeitumstellung, die verankerte Spanne (an einem meist ganz anderen Datum)
 * aber nicht — oder umgekehrt —, weichen Wandzeit- und absolute Dauer um den
 * DST-Offset voneinander ab, und eine absolute Addition auf den Anker
 * verschiebt die vom Nutzer gewählte End-Uhrzeit. Dasselbe Muster wie
 * `floatingDurationMs` in [expand.ts](./expand.ts) (ADR-033), dort für die
 * Occurrence-Dauer bereits gelöst.
 */
function anchoredChanges(master: EventRow, changes: EventChanges): EventChanges {
  const newStart = new Date(changes.start_at);
  const newEnd = new Date(changes.end_at);
  const start = mergeDateAndTimeOfDay(new Date(master.start_at), newStart, master.timezone);
  const floatingDurationMs =
    instantToFloating(newEnd, master.timezone).getTime() -
    instantToFloating(newStart, master.timezone).getTime();
  const end = floatingToInstant(
    new Date(instantToFloating(start, master.timezone).getTime() + floatingDurationMs),
    master.timezone,
  );
  return {
    ...changes,
    start_at: start.toISOString(),
    end_at: end.toISOString(),
  };
}

export async function applyEditScope(args: ApplyEditScopeArgs): Promise<void> {
  const { ops, scope, eventId, occurrenceKey, isRecurring, master, changes, recurrence } = args;

  if (recurrence) {
    // Exceptions are keyed by the occurrence dates the *old* rule produced, so a
    // real rule change clears them — before the rule moves, not after. Die
    // Reihenfolge stammt aus der Zeit getrennter Aufrufe, als ein Abbruch
    // dazwischen sonst eine neue Regel mit alten Exceptions hinterlassen hätte.
    // Seit Block 7 laufen beide Schritte in einer Transaktion
    // (`apply_event_change`), halb geschrieben bleibt also nichts mehr; die
    // Reihenfolge bleibt, weil sie die Absicht lesbar macht.
    if (ruleDiffers(master, recurrence)) {
      await ops.deleteAllExceptions(eventId);
    }
    // Derselbe Anker wie unten: Dass die Serie ohnehin neu definiert wird,
    // rettet die Vorkommen vor der bearbeiteten Occurrence nicht — sie
    // verschwinden mit dem wandernden `dtstart` genauso. Ausnahme: `isRecurring`
    // beschreibt den Master *vor* diesem Schreiben und ist bei „Keine
    // Wiederholung" noch true, obwohl `recurrence.rrule_freq` bereits null ist.
    // Ohne Regel gibt es kein `dtstart` mehr zu schützen, also gilt die
    // Eingabe literal (ADR-032 Decision 3).
    await ops.updateMaster(
      eventId,
      isRecurring && recurrence.rrule_freq !== null ? anchoredChanges(master, changes) : changes,
      recurrence,
    );
    return;
  }

  if (scope === "this") {
    if (isRecurring) {
      await ops.modifyOccurrence(eventId, occurrenceKey, changes);
      return;
    }
    await ops.updateMaster(eventId, changes);
    return;
  }

  if (scope === "forward" && isRecurring) {
    if (master.rrule_count != null) {
      const consumed = consumedBefore(master, occurrenceKey);
      if (consumed === 0) {
        await ops.updateMaster(eventId, changes);
        return;
      }
      const remaining = master.rrule_count - consumed;
      // Create the tail before shortening the head. Das war Schadensbegrenzung,
      // solange die Schritte getrennte Aufrufe waren: Scheiterte der Insert nach
      // dem Kürzen, waren die Vorkommen ab dem Schnitt verloren. Seit Block 7
      // läuft alles in einer Transaktion, und `insert_split_event` liest den
      // Master, wie der Server ihn vor allen Schritten gesperrt hat — die
      // Reihenfolge ändert am Ergebnis nichts mehr und bleibt der Lesbarkeit
      // wegen.
      // remaining === 0 → the cutoff sits past the end of the series, so there
      // is nothing left to carry over into a split event.
      if (remaining > 0) {
        await ops.insertSplitEvent(master, changes, remaining);
      }
      await ops.setRruleCount(eventId, consumed);
      await ops.deleteExceptionsFromDate(eventId, occurrenceKey);
      return;
    }
    const cutoff = dayBefore(occurrenceKey);
    if (cutoff < zonedDateKey(new Date(master.start_at), master.timezone)) {
      await ops.updateMaster(eventId, changes);
      return;
    }
    // Tail first — wie im Zählpfad oben.
    await ops.insertSplitEvent(master, changes, null);
    await ops.setRruleUntil(eventId, endOfDayInstant(cutoff, master.timezone));
    await ops.deleteExceptionsFromDate(eventId, occurrenceKey);
    return;
  }

  // scope === "all" (or "forward" on a non-recurring event — same outcome).
  // Der Anker greift nur bei einer Serie; beim Einzeltermin verschiebt eine
  // Datumsänderung den Termin tatsächlich (siehe `anchoredChanges`). Auf
  // `isRecurring` allein zu prüfen genügt: „forward" auf einer Serie kehrt in
  // jedem seiner Zweige oben zurück und erreicht diese Zeile nie.
  await ops.updateMaster(eventId, isRecurring ? anchoredChanges(master, changes) : changes);
}
