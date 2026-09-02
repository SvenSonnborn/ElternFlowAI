import type { QueryKey } from "@tanstack/react-query";

/**
 * Wie lange eingehende Änderungen gesammelt werden, bevor invalidiert wird.
 *
 * Der Gewinn ist nicht Kosmetik: Eine Scope-Löschung fasst mehrere Zeilen an
 * (Exception schreiben **und** Master-Zeile anfassen), jede davon erzeugt ein
 * eigenes Broadcast. Ohne Fenster wären das mehrere Refetches derselben
 * Range-Query. 300 ms liegen unter der Schwelle, ab der „sofort" nicht mehr
 * sofort wirkt.
 */
export const COALESCE_WINDOW_MS = 300;

/**
 * Dedupliziert Query-Keys eines Sammelfensters, Reihenfolge des ersten
 * Auftretens.
 *
 * `JSON.stringify` als Identität ist hier tragfähig, weil alle Kalender-Keys
 * aus Strings bestehen (`calendarKeys` in features/calendar/queries.ts). Käme je
 * ein Key mit Objekt-Segment dazu, müsste diese Funktion mitwachsen — deshalb
 * steht es hier und nicht nur im Test.
 */
export function mergeInvalidationKeys(keys: readonly QueryKey[]): QueryKey[] {
  const seen = new Set<string>();
  const out: QueryKey[] = [];
  for (const key of keys) {
    const id = JSON.stringify(key);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(key);
  }
  return out;
}
