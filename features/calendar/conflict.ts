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
 *
 * Ein unparsbares `b` wird über `new Date(b).getTime()` zu `NaN`, und
 * `NaN !== NaN` meldet das Feld dann immer als abweichend — bewusst so: bei
 * einem kaputten Datum ist „melden" die sichere Richtung, nicht stillschweigend
 * durchwinken. `EventChanges` hat keine optionalen Felder und die Werte
 * stammen aus `Date.toISOString()`, dieser Pfad ist nach Design also nicht
 * erreichbar.
 */
function sameInstant(a: Date, b: string): boolean {
  return a.getTime() === new Date(b).getTime();
}

/**
 * Welche Felder ein Speichern **fremde** Änderungen überschreiben würde.
 *
 * Drei Werte pro Feld, nicht zwei: `base` ist der Stand, aus dem das Formular
 * hydriert wurde, `mine` das, was geschrieben würde, `theirs` das, was jetzt
 * auf dem Server steht. Ein Feld ist nur dann ein Konflikt, wenn **jemand
 * anderes** es geändert hat (`theirs ≠ base`) **und** mein Schreibvorgang es
 * überschriebe (`mine ≠ theirs`).
 *
 * Der zweiwertige Vergleich (nur `theirs` gegen `mine`) hat die eigenen
 * Änderungen des Nutzers mitgelistet — das Formular schickt immer den vollen
 * Feldsatz, ein geänderter Titel weicht also zwangsläufig ab, auch wenn ihn
 * sonst niemand angefasst hat. Damit war die Liste nach **jedem**
 * Versionssprung nicht-leer, die Regel „leere Liste → durchspeichern" feuerte
 * nie, und der Dialog erschien bei jeder fremden Schreiboperation. Belegt in
 * der Zwei-Client-Verifikation, Schritt 6
 * ([docs/superpowers/plans/2026-09-04-conflict-detection-verification.md](./2026-09-04-conflict-detection-verification.md)).
 *
 * Eine leere Liste heißt weiterhin: kein Dialog, der Schreibvorgang läuft
 * durch. Sie ist jetzt nur wieder das, was sie sein sollte — der Normalfall,
 * wenn niemand ins Gehege kommt.
 */
export function differingEventFields(
  theirs: CalendarOccurrence,
  mine: EventChanges,
  base: CalendarOccurrence,
): EventConflictField[] {
  const out: EventConflictField[] = [];
  if (!sameText(theirs.title, base.title) && !sameText(theirs.title, mine.title)) {
    out.push("title");
  }
  if (
    theirs.startAt.getTime() !== base.startAt.getTime() &&
    !sameInstant(theirs.startAt, mine.start_at)
  ) {
    out.push("start_at");
  }
  if (theirs.endAt.getTime() !== base.endAt.getTime() && !sameInstant(theirs.endAt, mine.end_at)) {
    out.push("end_at");
  }
  if (!sameText(theirs.location, base.location) && !sameText(theirs.location, mine.location)) {
    out.push("location");
  }
  if (
    !sameText(theirs.description, base.description) &&
    !sameText(theirs.description, mine.description)
  ) {
    out.push("description");
  }
  return out;
}
