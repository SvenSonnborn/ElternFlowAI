import { addDays, max as dateMax, min as dateMin } from "date-fns";

import { floatingToInstant } from "./timezone";

/**
 * Das Suchfenster, mit dem ein einzelner Master expandiert wird, um eine
 * angeforderte Occurrence zu finden — gebraucht von `useEvent`
 * ([hooks.ts](./hooks.ts)) für den Routen-Parameter `occ` und von
 * `EventEditScreen`s Konflikt-Dialog für die fremde Fassung.
 *
 * Ohne `occurrenceKey` genügt ein Jahr um den Serienstart. Mit einem
 * `occurrenceKey` muss das Fenster zusätzlich sicher den angeforderten
 * Regel-Tag abdecken — sonst läuft `expandEvents` bei einer weit in der
 * Zukunft liegenden Occurrence (>366 Tage) leer, `find` schlägt fehl, und der
 * `expanded[0]`-Fallback zeigt eine **andere** Occurrence derselben Serie.
 *
 * `occurrenceKey` ist ein Regel-Datum in `timeZone` (ADR-034), keine lokale
 * Wanduhrzeit des Lesers: Tagesanfang und -ende werden deshalb als floating in
 * `timeZone` gebildet und über `floatingToInstant` zurückgerechnet, statt mit
 * `parseISO`/`endOfDay` lokal ausgewertet (Befund B, PR #121). Ein früherer
 * Kommentar an einer der beiden Aufrufstellen behauptete, dieser Fensterrand
 * brauche keine zonen-genaue Behandlung — das stimmt nicht: Ein Leser westlich
 * der Terminzone verpasst sonst den frühen Teil des angeforderten Tages (ein
 * Berliner Termin um 23:30 liegt für einen Leser in `America/New_York` schon
 * am Vortag), das Fenster verfehlt die Occurrence, und `find` liefe ins Leere.
 *
 * Als eigenes Modul statt inline in `hooks.ts`: `hooks.ts` importiert über
 * `design-system/ThemeProvider` transitiv `nativewind`, das beim Laden
 * `Appearance` liest — außerhalb eines echten RN/Web-Runtimes wirft das unter
 * `bun test` (`react-native-css-interop`). Diese reine Funktion bleibt davon
 * getrennt und ist ohne Hook-Render-Pfad testbar — `bun test` hat für Hooks
 * keinen tragfähigen Render-Pfad, siehe `docs/TODO.md`.
 */
export function eventLookupWindow(
  masterStart: Date,
  occurrenceKey: string | undefined,
  timeZone: string,
): { start: Date; end: Date } {
  if (!occurrenceKey) {
    return { start: addDays(masterStart, -1), end: addDays(masterStart, 366) };
  }
  const [year, month, day] = occurrenceKey.split("-").map(Number);
  const dayStart = floatingToInstant(
    new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0)),
    timeZone,
  );
  const dayEnd = floatingToInstant(
    new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999)),
    timeZone,
  );
  return {
    start: dateMin([addDays(masterStart, -1), dayStart]),
    end: dateMax([addDays(masterStart, 366), dayEnd]),
  };
}
