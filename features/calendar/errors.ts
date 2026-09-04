import type { EventWithRelations } from "./expand";

/**
 * Fehler-Klassifizierung für den Kalender — das Gegenstück zu `mapTaskError`
 * in [features/tasks/errors.ts](../tasks/errors.ts), aus demselben Anlass und
 * nach demselben Muster.
 *
 * Gebraucht wird sie erst, seit das Löschen verzögert läuft ([ADR-026](../../docs/decision-log.md)):
 * Vorher meldete ein fehlgeschlagenes Löschen per `Alert` auf dem Screen, der
 * es ausgelöst hatte, und die rohe Meldung war wenigstens im Kontext. Jetzt
 * erscheint sie fünf Sekunden später in einem Toast auf einem anderen Screen —
 * und ein Toast mit Fehler-Variante läuft nie ab, die englische PostgREST-
 * Meldung stünde also unbegrenzt in einer deutschen Oberfläche.
 */

/**
 * Der Termin ist zwischen Auslösen und Ausführen verschwunden.
 *
 * Kein konstruierter Fall, sondern der wahrscheinlichste echte Fehler dieses
 * Features: Zwischen dem Tap und dem Ablauf des Undo-Fensters liegen fünf
 * Sekunden, in denen ein anderes Familienmitglied denselben Termin löschen
 * kann. Eine eigene Klasse statt einer Meldung zum Mitlesen — `mapEventError`
 * soll den Fall an `name` erkennen, nicht an einem String, der sich beim
 * nächsten Umformulieren verschiebt.
 */
export class EventNotFoundError extends Error {
  constructor(eventId: string) {
    super(`Event ${eventId} not found`);
    this.name = "EventNotFoundError";
  }
}

/**
 * Jemand anderes hat den Termin geändert, seit dieses Formular ihn geladen hat.
 *
 * Trägt die fremde Fassung mit, damit der Screen sie ohne zweiten Roundtrip
 * mit `expandEvents` auflösen und Feld für Feld gegen die eigene Eingabe
 * stellen kann — genau das, was der Vergleichs-Dialog zeigt (ADR-031).
 *
 * `row` ist `null`, wenn der Konflikt aus dem Compare-and-Swap in
 * `updateMaster` kommt statt aus dem Pre-Flight: Dort ist bekannt, *dass*
 * jemand dazwischengeschrieben hat, aber nicht *was*. Der Dialog erscheint dann
 * ohne Vergleichszeilen — stilles Durchwinken wäre genau der Fehler, gegen den
 * diese Klasse gebaut ist.
 */
export class EventConflictError extends Error {
  constructor(readonly row: EventWithRelations | null) {
    super("Event was modified by someone else");
    this.name = "EventConflictError";
  }
}

export type CalendarErrorKey =
  | "cal.error.notAuthenticated"
  | "cal.error.eventGone"
  | "cal.error.conflict"
  | "cal.error.network"
  | "cal.error.generic";

interface ErrorLike {
  message?: string;
  code?: string;
  name?: string;
}

function asErrorLike(input: unknown): ErrorLike | null {
  if (input == null) return null;
  if (typeof input !== "object") return null;
  return input;
}

/**
 * Klassifiziert die *Ursache*, nicht die Operation — welcher Titel darüber
 * steht, entscheidet der Screen. Spiegelt `mapTaskError`.
 */
export function mapEventError(input: unknown): CalendarErrorKey {
  const err = asErrorLike(input);
  if (!err) return "cal.error.generic";

  if (err.name === "EventNotFoundError") return "cal.error.eventGone";
  if (err.name === "EventConflictError") return "cal.error.conflict";

  // Postgres-SQLSTATE zuerst, weil spezifischer. 42501 ist RLS, die die Zeile
  // verweigert; 23503 heißt, dass eine referenzierte Zeile fehlt — beim
  // Löschen praktisch immer der Termin selbst.
  if (err.code === "42501") return "cal.error.notAuthenticated";
  if (err.code === "23503") return "cal.error.eventGone";

  const message = err.message ?? "";
  // Beide Wortstellungen mit Absicht: undici (nativ, Node) sagt „fetch
  // failed", Browser und react-native-web sagen „Failed to fetch".
  if (err.name === "AbortError" || /network|fetch failed|failed to fetch|aborted/i.test(message)) {
    return "cal.error.network";
  }

  // Nur unbedenkliche Primitive loggen — eine Supabase-Meldung kann die Payload
  // zurückwerfen, und Termin-Titel sind privat („Paartherapie 18:00").
  console.error("[mapEventError] unmapped error", {
    code: err.code ?? null,
    name: err.name ?? null,
    hasMessage: message.length > 0,
  });
  return "cal.error.generic";
}
