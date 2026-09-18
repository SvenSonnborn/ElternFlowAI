import type { Database } from "@/features/supabase/database.types";

import type { OccurrenceRrule } from "./types";

type EventRow = Database["public"]["Tables"]["events"]["Row"];

/**
 * Die fünf `rrule_*`-Spalten — einer `events`-Zeile ebenso wie
 * `RecurrenceChanges`, das genau diese Spalten schreibt.
 */
type RuleColumns = Pick<
  EventRow,
  "rrule_freq" | "rrule_interval" | "rrule_byweekday" | "rrule_count" | "rrule_until"
>;

/**
 * Die Regel aus den fünf `rrule_*`-Spalten, in der Form, die jede
 * `CalendarOccurrence` schon als `occ.rrule` trägt (gebaut in `expand.ts`).
 *
 * Eine Funktion für beide Quellen, weil beide dieselben Spalten haben: den
 * gelesenen Master (`ruleDiffers`) und das, was das Formular schreiben will
 * (`RecurrenceChanges`, im Konflikt-Vergleich). Eine Occurrence braucht keinen
 * Umwandler — `occ.rrule` ist bereits diese Form.
 */
export function ruleOf(columns: RuleColumns): OccurrenceRrule {
  return {
    freq: columns.rrule_freq,
    interval: columns.rrule_interval,
    byweekday: columns.rrule_byweekday,
    count: columns.rrule_count,
    until: columns.rrule_until,
  };
}

/** Wochentage als Menge: Die Reihenfolge ist keine Information, `null` und `[]` heißen beide „keine". */
function sameDays(a: number[] | null, b: number[] | null): boolean {
  const left = new Set(a ?? []);
  const right = new Set(b ?? []);
  return left.size === right.size && [...left].every((day) => right.has(day));
}

/**
 * Das Serienende als Zeitpunkt, nicht als Zeichenkette — wie `sameInstant` in
 * `conflict.ts` für Start und Ende. Der Server liefert PostgREST-Zeitstempel
 * (`…+00:00`), `toISOString()` schreibt `…Z`.
 *
 * Eine Absicherung, kein Bugfix: Heute bringt kein Pfad beide Schreibweisen in
 * denselben Vergleich, weil das Formular `until` als Server-String durchreicht
 * (ADR-038). Der Stringvergleich hing aber an genau dieser ungeprüften Annahme.
 *
 * Gleiche Zeichenketten gelten als gleich, bevor geparst wird — die Umstellung
 * macht also nur Paare gleich, die vorher verschieden waren, nie umgekehrt.
 * `null` wird vor dem Parsen abgefangen: `new Date(null)` ist die Epoche, nicht
 * `NaN`. Ein unparsbarer Wert wird `NaN` und damit ungleich — bei einem kaputten
 * Datum ist „verschieden" die sichere Richtung.
 */
function sameUntil(a: string | null, b: string | null): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  return new Date(a).getTime() === new Date(b).getTime();
}

/**
 * Ob zwei Regeln übereinstimmen — Spalte für Spalte, mit zwei Ausnahmen von der
 * wörtlichen Gleichheit: Wochentage als Menge, das Serienende als Zeitpunkt.
 *
 * Der **eine** Regel-Vergleich des Kalenders (ADR-038). Zwei Leser urteilen
 * über dieselbe Frage: `ruleDiffers` in `recurrence.ts` entscheidet, ob ein
 * Speichern die Exceptions der Serie löscht, `differingEventFields` in
 * `conflict.ts`, ob eine fremde Regeländerung ein Konflikt ist. Zwei leicht
 * verschiedene Vergleiche würden dieselbe Frage an beiden Stellen verschieden
 * beantworten.
 *
 * Zwei Regeln, die dieselben Termine auf verschiedenem Weg beschreiben
 * (wöchentlich ohne Wochentag gegen wöchentlich am Wochentag des Serienstarts),
 * gelten als verschieden — wie schon im alten `ruleDiffers`.
 */
export function sameRule(a: OccurrenceRrule, b: OccurrenceRrule): boolean {
  return (
    a.freq === b.freq &&
    a.interval === b.interval &&
    sameDays(a.byweekday, b.byweekday) &&
    a.count === b.count &&
    sameUntil(a.until, b.until)
  );
}
