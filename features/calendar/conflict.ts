import type { EventChanges, RecurrenceChanges } from "./recurrence";
import type { CalendarOccurrence, OccurrenceRrule } from "./types";

import { ruleOf, sameRule } from "./rule";

/**
 * Was das Bearbeiten-Formular schreibt und ein Konflikt sein kann: die fünf
 * Felder aus `EventChanges` — und seit ADR-038 die Regel, die nicht in
 * `EventChanges` steckt, sondern daneben in `RecurrenceChanges`.
 */
export type EventConflictField =
  "title" | "start_at" | "end_at" | "location" | "description" | "recurrence";

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
 * Ob die Regel ein Konflikt ist — dreiwertig wie die fünf Felder: jemand
 * anderes hat sie geändert (`theirs ≠ base`), und mein Schreibvorgang würde
 * sie überschreiben (`mine ≠ theirs`). Ohne Regel im Schreibvorgang
 * (`mineRecurrence == null`) nie: Die `rrule_*`-Spalten stehen dann nicht im
 * UPDATE (ADR-038 Decision 2).
 *
 * Eine eigene Funktion statt eines Zweigs in `differingEventFields`, weil der
 * Konflikt-Dialog sie auch **ohne** fremde Occurrence braucht: Erzeugt die
 * fremde Regel die bearbeitete Occurrence nicht mehr (monatlich statt
 * wöchentlich, eine kleinere Anzahl, ein Schnitt per „ab hier löschen"), gibt
 * es kein `theirs` — die fremde Regel ist über `err.row` aber bekannt.
 */
export function ruleConflicts(
  theirsRule: OccurrenceRrule,
  baseRule: OccurrenceRrule,
  mineRecurrence: RecurrenceChanges | null | undefined,
): boolean {
  return (
    mineRecurrence != null &&
    !sameRule(theirsRule, baseRule) &&
    !sameRule(theirsRule, ruleOf(mineRecurrence))
  );
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
 * ([docs/superpowers/plans/2026-09-04-conflict-detection-verification.md](../../docs/superpowers/plans/2026-09-04-conflict-detection-verification.md)).
 *
 * Eine leere Liste heißt weiterhin: kein Dialog, der Schreibvorgang läuft
 * durch. Sie ist jetzt nur wieder das, was sie sein sollte — der Normalfall,
 * wenn niemand ins Gehege kommt (ADR-031).
 *
 * `mineRecurrence` ist die Regel, die dieser Schreibvorgang mitführt
 * (`vars.recurrence`). Fehlt sie, stehen die `rrule_*`-Spalten gar nicht im
 * UPDATE (`updateMaster` schreibt sie nur mit, wenn sie da ist) — eine fremde
 * Regeländerung kann dann nicht überschrieben werden, dieselbe Begründung, mit
 * der `differingTaskFields` seine `undefined`-Felder überspringt. Bis ADR-038
 * floss die Regel gar nicht ein: Änderten zwei Eltern denselben Termin nur am
 * Rhythmus, war die Liste leer, der Screen speicherte still durch, und
 * `applyEditScope` löschte dabei vorher alle Exceptions der Serie.
 */
export function differingEventFields(
  theirs: CalendarOccurrence,
  mine: EventChanges,
  base: CalendarOccurrence,
  mineRecurrence?: RecurrenceChanges | null,
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
  if (ruleConflicts(theirs.rrule, base.rrule, mineRecurrence)) {
    out.push("recurrence");
  }
  return out;
}
