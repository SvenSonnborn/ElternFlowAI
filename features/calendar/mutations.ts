import { useMutation, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/features/supabase";

import type { EventWithRelations } from "./expand";

import { EventConflictError, EventNotFoundError } from "./errors";
import {
  createRecordingEventOps,
  createSupabaseApplyEventChange,
  type ApplyEventChange,
  type EventChangeStep,
} from "./eventChange";
import { canApplyOptimistically, useOptimisticEventsStore } from "./optimisticEvents";
import { calendarKeys, fetchEventById } from "./queries";
import {
  applyDeleteScope,
  applyEditScope,
  type EditScope,
  type EventChanges,
  type RecurrenceChanges,
} from "./recurrence";
import { parseOccurrenceVersion } from "./version";

export {
  useCreateEvent,
  recurrenceToRrule,
  rruleToRecurrence,
  parseRecurrenceCount,
  type CreateEventVars,
  type RecurrenceOption,
  type RruleFields,
} from "./createMutation";

export interface DeleteEventVars {
  scope: EditScope;
  eventId: string;
  /** Der Schlüssel der betroffenen Occurrence — die Zeile in `event_exceptions` (ADR-034). */
  occurrenceKey: string;
  isRecurring: boolean;
  /**
   * Der Stand, den der Screen beim Laden gesehen hat (`CalendarOccurrence.version`).
   * Weicht er beim Schreiben ab, hat jemand anderes dazwischen geschrieben —
   * das prüft `apply_event_change` in derselben Transaktion wie das Schreiben.
   */
  baseVersion: string;
  /**
   * Die Kennung dieser Nutzer-Absicht, eine zufällige UUID (Spec §6). Erzeugt
   * wird sie dort, wo die `vars` entstehen (`newRequestId` in
   * `app-sections/shared`), nicht hier: Nur der Aufrufer weiß, ob ein Senden
   * eine neue Absicht ist oder dieselbe noch einmal. Dieselbe Absicht erneut zu
   * senden — „Erneut versuchen", das stille Nachspeichern nach einem Konflikt —
   * trägt dieselbe Kennung; der Server meldet dann `already_applied`, statt ein
   * zweites Mal zu schreiben. Nach einem Konflikt ist nichts verbucht, die
   * Kennung darf also mit neuer `baseVersion` wiederkommen.
   */
  requestId: string;
}

export interface UpdateEventVars extends DeleteEventVars {
  changes: EventChanges;
  recurrence?: RecurrenceChanges | null;
  /**
   * Die Zone des Termins (`events.timezone`), für `canApplyOptimistically`s
   * Datumsvergleich (Befund C, PR #121) — nicht für den eigentlichen
   * Schreibpfad: `updateEvent` liest die Zone dafür aus dem frisch
   * geladenen `master`, nicht aus `vars`. `onMutate` läuft aber vor diesem
   * Fetch, der Aufrufer muss die Zone also mitschicken.
   */
  timezone: string;
}

/**
 * Was `updateEvent`/`deleteEvent` von außen brauchen. `fetchMaster` lädt die
 * Zeile in der Form von `EVENT_SELECT` — dieselbe, die der Konflikt-Dialog aus
 * `EventConflictError.row` expandiert. `applyChange` ist im Betrieb
 * `createSupabaseApplyEventChange(supabase)`; die Tests setzen ihre eigenen ein.
 */
export interface UpdateEventDeps {
  fetchMaster: (eventId: string) => Promise<EventWithRelations | null>;
  applyChange: ApplyEventChange;
}

/**
 * Lädt den Master, zeichnet die Schritte des Scopes auf und schickt sie in
 * einem Aufruf an `apply_event_change` (Spec §5.4).
 *
 * Der Fetch bleibt, weil die Schritte aus dem Master berechnet werden (Anker,
 * verbrauchte Vorkommen, Zone). Den Versionsvergleich macht dagegen der Server,
 * gegen `vars.baseVersion` — also gegen das, was das Formular gesehen hat. Weil
 * `updated_at` nie zurückläuft, prüft das zugleich, dass die Schritte aus einem
 * unveränderten Master stammen: Hat sich der Master zwischen Formular und
 * Fetch geändert, weicht er auch von `baseVersion` ab.
 *
 * Ein fehlender Master endet ohne RPC als `EventNotFoundError` — es gäbe
 * nichts, woraus sich Schritte berechnen ließen.
 */
export async function updateEvent(vars: UpdateEventVars, deps: UpdateEventDeps): Promise<void> {
  const master = await deps.fetchMaster(vars.eventId);
  if (!master) {
    throw new EventNotFoundError(vars.eventId);
  }
  const { ops, steps } = createRecordingEventOps({
    eventId: vars.eventId,
    occurrenceKey: vars.occurrenceKey,
  });
  await applyEditScope({
    scope: vars.scope,
    eventId: vars.eventId,
    occurrenceKey: vars.occurrenceKey,
    isRecurring: vars.isRecurring,
    master,
    changes: vars.changes,
    recurrence: vars.recurrence,
    ops,
  });
  await applySteps(vars, steps, deps);
}

/** Derselbe Ablauf wie `updateEvent`, mit `applyDeleteScope` — siehe dort. */
export async function deleteEvent(vars: DeleteEventVars, deps: UpdateEventDeps): Promise<void> {
  const master = await deps.fetchMaster(vars.eventId);
  if (!master) {
    throw new EventNotFoundError(vars.eventId);
  }
  const { ops, steps } = createRecordingEventOps({
    eventId: vars.eventId,
    occurrenceKey: vars.occurrenceKey,
  });
  await applyDeleteScope({
    scope: vars.scope,
    eventId: vars.eventId,
    occurrenceKey: vars.occurrenceKey,
    isRecurring: vars.isRecurring,
    master,
    ops,
  });
  await applySteps(vars, steps, deps);
}

/** Ein Fehler mit SQLSTATE, wie PostgREST ihn liefert. */
function sqlState(err: unknown): string | null {
  if (typeof err !== "object" || err === null || !("code" in err)) return null;
  return typeof err.code === "string" ? err.code : null;
}

/**
 * Schickt die Schritte und bildet die Fehler der Funktion auf die bestehenden
 * Klassen ab — auf `code`, nie auf den HTTP-Status: PostgREST liefert `EF409`,
 * `EF404` und `22023` gleichermaßen als 400.
 *
 * - `EF409`: Der gesehene Stand weicht ab. Nachgelesen wird, weil der
 *   Konflikt-Dialog die fremde Fassung braucht und „Deine Fassung speichern"
 *   eine frische Basis-Version. Ist der Master inzwischen weg, ist das „nicht
 *   gefunden", nicht „geändert". Ein Fehler der Nachlese geht unverändert
 *   weiter, statt als Konflikt verkleidet zu werden.
 * - `EF404`: Termin gelöscht oder per RLS unsichtbar.
 * - `42501`: Kommt auf drei Wegen, und auf keinem bleibt etwas geschrieben.
 *   RLS lehnt einen Insert-Schritt ab (Exception-Upsert, Split), weil der
 *   Aufrufer seine Familie mitten im Aufruf verloren hat — die Transaktion
 *   rollt zurück. Oder das JWT trägt kein `sub`, und die Funktion bricht in
 *   ihrem ersten Schritt ab. Oder die Anfrage kommt ganz ohne Sitzung an
 *   (abgemeldet, Refresh gescheitert) und läuft als `anon`, das kein execute
 *   auf die Funktion hat. Jedes Mal erreicht dieser Aufrufer den Termin nicht
 *   mehr, und ein Fetch hätte ihn per RLS ebenso wenig gefunden — deshalb
 *   `EventNotFoundError` wie bei `EF404`. Ein abgelaufenes JWT landet nicht hier:
 *   supabase-js erneuert den Token vor der Anfrage, und ein trotzdem
 *   abgelaufenes weist PostgREST vor dem Funktionsaufruf mit `PGRST303`
 *   (HTTP 401) ab — das bleibt bei „Alles andere".
 * - Alles andere (`40P01` nach einem Deadlock, `22023` als Client-Fehler, ein
 *   Netzwerkfehler) bleibt unverändert und landet in `mapEventError`. Nach
 *   `40P01` hat der Server zurückgerollt, ein Retry mit derselben Kennung ist
 *   also sicher.
 */
async function applySteps(
  vars: DeleteEventVars,
  steps: EventChangeStep[],
  deps: UpdateEventDeps,
): Promise<void> {
  try {
    await deps.applyChange({
      requestId: vars.requestId,
      eventId: vars.eventId,
      occurrenceKey: vars.occurrenceKey,
      seen: parseOccurrenceVersion(vars.baseVersion),
      steps,
    });
  } catch (err) {
    const code = sqlState(err);
    if (code === "EF409") {
      const current = await deps.fetchMaster(vars.eventId);
      if (!current) throw new EventNotFoundError(vars.eventId);
      throw new EventConflictError(current);
    }
    if (code === "EF404" || code === "42501") {
      throw new EventNotFoundError(vars.eventId);
    }
    throw err;
  }
}

export function useDeleteEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: DeleteEventVars) => {
      await deleteEvent(vars, {
        fetchMaster: fetchEventById,
        applyChange: createSupabaseApplyEventChange(supabase),
      });
    },
    onSuccess: () => {
      // Zurückgegeben statt `void`: der Pending-Delete-Store gibt das Item erst
      // frei, wenn `mutateAsync` durch ist. Ohne das Warten blitzte es für einen
      // Frame zurück, bevor der Refetch es erneut entfernt.
      return qc.invalidateQueries({ queryKey: calendarKeys.all });
    },
  });
}

/**
 * Bearbeitet einen Termin und zeigt die Änderungen sofort im Kalender, statt auf
 * die Server-Antwort zu warten. `onMutate` schreibt einen Overlay-Eintrag
 * (`kind: "update"`) in den Store, der die geänderten Felder anwendet — es sei
 * denn, `canApplyOptimistically` verneint (siehe dort). `onSettled` invalidiert
 * die Kalender-Queries **nur bei Erfolg** und gibt den Store-Eintrag erst danach
 * frei: andersherum blitzte der optimistische Stand für einen Frame durch, bevor
 * der Refetch ihn ersetzt — dieselbe Lehre, die `useDeleteEvent` in ADR-026
 * gezogen hat. Warum der Fehlerfall nicht invalidiert, steht am `if` selbst.
 *
 * **Zwei Grenzen, dieselbe Konsequenz.** `all`/`forward` **mit geändertem
 * Datum** bekommt gar keinen Eintrag, weil das Overlay dort die Nicht-Änderung
 * zeigte — die Begründung steht bei `canApplyOptimistically`. Und eine
 * mitgeschickte `vars.recurrence` (eine Änderung der Wiederholungsregel)
 * bekommt seit derselben Prüfung ebenfalls **gar keinen** Eintrag: Ändert der
 * Nutzer den Rhythmus einer Serie, ändert sich der gesamte Occurrence-Satz,
 * das vorherzusagen hieße, die RRULE-Expansion für eine ungespeicherte Regel
 * zu fahren. Ein Eintrag zeigte dann die alten Occurrence-Termine mit den
 * neuen Feldern — derselbe Fehler wie bei der Datumsänderung, nur an der Regel
 * statt am Datum. Der Refetch bringt eine Sekunde später die korrekten
 * Termine.
 */
export function useUpdateEvent() {
  const qc = useQueryClient();
  const add = useOptimisticEventsStore((state) => state.add);
  const remove = useOptimisticEventsStore((state) => state.remove);

  return useMutation({
    mutationFn: async (vars: UpdateEventVars) => {
      await updateEvent(vars, {
        fetchMaster: fetchEventById,
        applyChange: createSupabaseApplyEventChange(supabase),
      });
    },
    onMutate: (vars) => {
      // Lieber gar nichts zeigen als die Nicht-Änderung dessen, was der Nutzer
      // gerade geändert hat — siehe `canApplyOptimistically`.
      if (!canApplyOptimistically(vars)) return undefined;
      return add({
        kind: "update",
        eventId: vars.eventId,
        occurrenceKey: vars.occurrenceKey,
        scope: vars.scope,
        changes: vars.changes,
      });
    },
    onError: (_err, _vars, id) => {
      if (id) remove(id);
    },
    onSettled: async (_data, error, _vars, id) => {
      // **Nur bei Erfolg invalidieren.** Bei einem Fehler ist serverseitig nichts
      // passiert, der Refetch brächte dieselben Daten zurück — und er kostet mehr
      // als nichts: TanStack ruft `onError` → `await onSettled` → **dann erst**
      // lehnt `mutateAsync` ab. Der Rollback (`remove`) läuft also sofort, der
      // Fehler-Toast wartete aber hinter einem Refetch, der bei toter Verbindung
      // mit `retry: 1` und Backoff ins Leere läuft. Im Funkloch sähe der Nutzer
      // seine Änderung kommen und wieder gehen, ohne ein Wort dazu. Das `if` ist
      // deshalb kein Sonderfall, den man „vereinfachen" darf.
      if (!error) {
        // Erst invalidieren, **dann** freigeben — sonst blitzt der alte Stand
        // für einen Frame durch.
        await qc.invalidateQueries({ queryKey: calendarKeys.all });
      }
      if (id) remove(id);
    },
  });
}
