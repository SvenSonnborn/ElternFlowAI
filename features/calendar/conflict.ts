import type { EventChanges } from "./recurrence";
import type { CalendarOccurrence } from "./types";

/** Die fünf Felder, die das Bearbeiten-Formular schreibt (`EventChanges`). */
export type EventConflictField = "title" | "start_at" | "end_at" | "location" | "description";

/** `""` und `null` heißen beide „nicht gesetzt" — das Formular schickt `trim() || null`. */
function sameText(a: string | null, b: string | null): boolean {
  return (a ?? "") === (b ?? "");
}

/**
 * Als Zeitpunkt vergleichen, nicht als Zeichenkette: Der Server liefert
 * PostgREST-Zeitstempel (`2026-06-15T17:00:00+00:00`), das Formular
 * `toISOString()` (`…Z`). Ein Stringvergleich meldete jedes Speichern als
 * Konflikt.
 */
function sameInstant(a: Date, b: string): boolean {
  return a.getTime() === new Date(b).getTime();
}

/**
 * Welche Felder die fremde Fassung anders trägt als die eigene Eingabe.
 *
 * **Eine leere Liste heißt: kein Dialog, der Schreibvorgang läuft durch.** Das
 * ist kein Sonderfall, sondern was den Mechanismus benutzbar macht — ein
 * Versionssprung ohne inhaltliche Abweichung (jemand hat dasselbe geändert,
 * oder etwas, das ich gar nicht anfasse) darf niemanden anhalten. Ein Guard,
 * der bei jedem Versionssprung meldet, wird weggeklickt (ADR-031).
 *
 * Gibt Schlüssel zurück, keine Zeichenketten: Formatiert wird im Screen, der
 * Locale, Datumsformat und die geladenen Nachschlagelisten hat.
 */
export function differingEventFields(
  theirs: CalendarOccurrence,
  mine: EventChanges,
): EventConflictField[] {
  const out: EventConflictField[] = [];
  if (theirs.title !== mine.title) out.push("title");
  if (!sameInstant(theirs.startAt, mine.start_at)) out.push("start_at");
  if (!sameInstant(theirs.endAt, mine.end_at)) out.push("end_at");
  if (!sameText(theirs.location, mine.location)) out.push("location");
  if (!sameText(theirs.description, mine.description)) out.push("description");
  return out;
}
