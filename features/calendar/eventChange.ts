import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/features/supabase/database.types";

import type { EventChanges, EventOps, RecurrenceChanges } from "./recurrence";

/**
 * Der Schreibpfad für Termine seit Block 7: Welche Schritte ein Scope braucht,
 * rechnen weiter `applyEditScope`/`applyDeleteScope` aus — aber gegen einen
 * **aufzeichnenden** `EventOps`, der nichts schreibt. Die gesammelten Schritte
 * gehen danach in **einem** Aufruf an `public.apply_event_change`, die sie in
 * einer Transaktion ausführt und dabei gegen den Stand prüft, den das Formular
 * gesehen hat (Spec §5, `supabase/migrations/20261026120000_calendar_transaction_rpc.sql`).
 *
 * Vorher waren das bis zu drei unabhängige PostgREST-Aufrufe: Scheiterte der
 * zweite, blieb der erste stehen, und der Versionsvergleich lief im Client,
 * einen Roundtrip vor dem Schreiben statt in derselben Transaktion.
 */

/**
 * Ein Schritt, wie ihn `apply_event_change` in `p_steps` erwartet (Spec §5.3).
 * Ein Glied je `op`, Feldnamen in snake_case wie im JSON.
 *
 * **Kein Schritt trägt eine Event-ID oder einen Occurrence-Schlüssel.** Alle
 * wirken auf `p_event_id`, und `modify_occurrence`, `cancel_occurrence` und
 * `delete_exceptions_from` nehmen `p_occurrence_key` — so kann ein Aufruf
 * weder einen zweiten Termin noch eine ungeprüfte Exception erreichen.
 */
export type EventChangeStep =
  | { op: "update_master"; changes: EventChanges; recurrence?: RecurrenceChanges }
  | { op: "modify_occurrence"; override: Partial<EventChanges> }
  | { op: "cancel_occurrence" }
  | { op: "delete_master" }
  | { op: "delete_all_exceptions" }
  | { op: "delete_exceptions_from" }
  | { op: "set_rrule_until"; until: string }
  | { op: "set_rrule_count"; count: number }
  // Familie, Typ, Kind, Elternteil, Zone und Regel nimmt der Server aus dem
  // gesperrten Master. `rrule_count` ist Pflicht, auch als null — siehe
  // `createRecordingEventOps`.
  | { op: "insert_split_event"; changes: EventChanges; rrule_count: number | null };

/**
 * Ein `EventOps`, der aufzeichnet statt zu schreiben.
 *
 * `target` ist die Occurrence, für die `updateEvent`/`deleteEvent` die Version
 * prüfen lässt. Jede Op mit anderer `eventId` — oder, bei den drei
 * schlüsselgebundenen Ops, anderem Schlüssel — wirft, statt still auf das Ziel
 * umgebogen zu werden: Der Server wendet jeden Schritt auf `p_event_id` und
 * `p_occurrence_key` an, ein abweichender Aufruf schriebe also woanders hin,
 * als `applyEditScope` gemeint hat. Heute rufen die Scope-Funktionen diese Ops
 * ohnehin nur mit dem Schlüssel der bearbeiteten Occurrence auf; der Wurf hält
 * das fest, falls sich das einmal ändert.
 *
 * Ein Wurf kommt als abgelehnte Promise an, wie bei jedem anderen `EventOps`.
 *
 * **Explizite `null`s.** `JSON.stringify` lässt `undefined`-Schlüssel weg, der
 * Server verlangt aber manche Schlüssel auch dann, wenn ihr Wert leer ist —
 * `insert_split_event.rrule_count` vor allem —, und antwortet sonst mit 22023.
 * Deshalb wird `rruleCount ?? null` geschrieben, nicht `rruleCount`.
 * `recurrence` dagegen ist optional und fehlt im Schritt ganz, wenn die Regel
 * sich nicht ändert.
 */
export function createRecordingEventOps(target: { eventId: string; occurrenceKey: string }): {
  ops: EventOps;
  steps: EventChangeStep[];
} {
  const steps: EventChangeStep[] = [];

  function sameEvent(op: string, eventId: string): void {
    if (eventId !== target.eventId) {
      throw new Error(
        `createRecordingEventOps: ${op} für Termin ${eventId}, aufgezeichnet wird ${target.eventId}`,
      );
    }
  }

  function sameOccurrence(op: string, eventId: string, occurrenceKey: string): void {
    sameEvent(op, eventId);
    if (occurrenceKey !== target.occurrenceKey) {
      throw new Error(
        `createRecordingEventOps: ${op} für Occurrence ${occurrenceKey}, aufgezeichnet wird ${target.occurrenceKey}`,
      );
    }
  }

  /**
   * Prüft, dann zeichnet auf. Über den Executor einer Promise statt `async`:
   * Ein Wurf der Prüfung kommt so als abgelehnte Promise an, wie bei jedem
   * anderen `EventOps`, ohne dass eine Funktion ohne `await` `async` heißt.
   */
  function record(check: () => void, step: EventChangeStep): Promise<void> {
    return new Promise((resolve) => {
      check();
      steps.push(step);
      resolve();
    });
  }

  const ops: EventOps = {
    cancelOccurrence: (eventId, occurrenceKey) =>
      record(() => sameOccurrence("cancelOccurrence", eventId, occurrenceKey), {
        op: "cancel_occurrence",
      }),
    modifyOccurrence: (eventId, occurrenceKey, override) =>
      record(() => sameOccurrence("modifyOccurrence", eventId, occurrenceKey), {
        op: "modify_occurrence",
        override,
      }),
    deleteMaster: (eventId) =>
      record(() => sameEvent("deleteMaster", eventId), { op: "delete_master" }),
    updateMaster: (eventId, changes, recurrence) =>
      record(
        () => sameEvent("updateMaster", eventId),
        recurrence
          ? { op: "update_master", changes, recurrence }
          : { op: "update_master", changes },
      ),
    deleteAllExceptions: (eventId) =>
      record(() => sameEvent("deleteAllExceptions", eventId), { op: "delete_all_exceptions" }),
    setRruleUntil: (eventId, untilIso) =>
      record(() => sameEvent("setRruleUntil", eventId), { op: "set_rrule_until", until: untilIso }),
    setRruleCount: (eventId, count) =>
      record(() => sameEvent("setRruleCount", eventId), { op: "set_rrule_count", count }),
    // Der Server löscht ab `p_occurrence_key`, das Datum steht also nicht im
    // Schritt. Ein anderes als der Schlüssel löschte einen anderen Ausschnitt.
    deleteExceptionsFromDate: (eventId, fromDateInclusive) =>
      record(() => sameOccurrence("deleteExceptionsFromDate", eventId, fromDateInclusive), {
        op: "delete_exceptions_from",
      }),
    insertSplitEvent: (master, changes, rruleCount) =>
      record(() => sameEvent("insertSplitEvent", master.id), {
        op: "insert_split_event",
        changes,
        rrule_count: rruleCount ?? null,
      }),
  };

  return { ops, steps };
}

/**
 * Wendet die aufgezeichneten Schritte einer Nutzer-Absicht an.
 *
 * `requestId` ist die Kennung der Absicht (Spec §6): Ein erneutes Senden
 * derselben Absicht trägt dieselbe Kennung und bekommt `already_applied`,
 * statt ein zweites Mal zu schreiben. `seen` ist der Stand, den das Formular
 * gesehen hat (`parseOccurrenceVersion(vars.baseVersion)`).
 *
 * Als Typ statt als Funktion, damit `updateEvent`/`deleteEvent` ohne Netz
 * testbar bleiben und die Integrationstests einen eigenen Client einsetzen.
 */
export type ApplyEventChange = (args: {
  requestId: string;
  eventId: string;
  occurrenceKey: string;
  seen: { masterUpdatedAt: string; exceptionUpdatedAt: string | null };
  steps: EventChangeStep[];
}) => Promise<"applied" | "already_applied">;

/**
 * `ApplyEventChange` über `client.rpc("apply_event_change", …)`.
 *
 * Der PostgREST-Fehler geht **unverändert** weiter: `EF409`, `EF404` und
 * `22023` kommen als HTTP 400 mit dem SQLSTATE in `error.code`, und erst
 * `updateEvent`/`deleteEvent` wissen, welche davon eine Nachlese brauchen.
 * Eine Antwort außer `applied`/`already_applied` ist ein Fehler — ein stiller
 * Erfolg wäre die Schadensklasse, gegen die dieser Pfad antritt.
 */
export function createSupabaseApplyEventChange(client: SupabaseClient<Database>): ApplyEventChange {
  return async ({ requestId, eventId, occurrenceKey, seen, steps }) => {
    const { data, error } = await client.rpc("apply_event_change", {
      p_request_id: requestId,
      p_event_id: eventId,
      p_occurrence_key: occurrenceKey,
      p_seen_master_updated_at: seen.masterUpdatedAt,
      // Der Generator typisiert jeden Funktionsparameter als nicht-null, weil
      // Postgres dafür keine Nullbarkeit kennt. null ist hier aber Absicht:
      // „an diesem Schlüssel lag keine Exception".
      p_seen_exception_updated_at: seen.exceptionUpdatedAt as string,
      // `EventChanges` und `RecurrenceChanges` sind Interfaces, und Interfaces
      // bekommen in TypeScript keine implizite Index-Signatur — der Compiler
      // sieht deshalb kein `Json`, obwohl jeder Wert JSON ist.
      p_steps: steps as unknown as Json,
    });
    if (error) throw error;
    if (data !== "applied" && data !== "already_applied") {
      throw new Error(`apply_event_change: unerwartete Antwort "${String(data)}"`);
    }
    return data;
  };
}
