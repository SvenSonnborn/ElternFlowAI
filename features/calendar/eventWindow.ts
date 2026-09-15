import { addDays, max as dateMax, min as dateMin } from "date-fns";

import { zonedDayBounds } from "./timezone";

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
 * Die Tagesgrenzen kommen aus `zonedDayBounds` ([timezone.ts](./timezone.ts))
 * und entstehen dort in `timeZone`, nicht in der Zone des Lesers (ADR-034,
 * Befund B aus PR #121): Ein Leser westlich der Terminzone verpasste sonst den
 * frühen Teil des angeforderten Tages — ein Berliner Termin um 23:30 liegt für
 * einen Leser in `America/New_York` schon am Vortag —, das Fenster verfehlte
 * die Occurrence, und `find` liefe ins Leere. Ein Schlüssel, der nicht der Form
 * `yyyy-MM-dd` entspricht, liefert dort `null` und fällt hier auf dasselbe
 * Standardfenster zurück wie gar kein Schlüssel. Das ist **keine**
 * Eingabe-Validierung, sondern nur Totalität: Die eigentliche Validierung —
 * einen kaputten `occ`-Link als solchen melden, statt still eine andere
 * Occurrence zu zeigen — gehört an die Route und bleibt offen, siehe
 * `docs/TODO.md`.
 *
 * Als eigenes Modul statt inline in `hooks.ts`: `hooks.ts` importiert über
 * `design-system/ThemeProvider` transitiv `nativewind`, das beim Laden
 * `Appearance` liest — außerhalb eines echten RN/Web-Runtimes wirft das unter
 * `bun test` (`react-native-css-interop`). Diese reine Funktion bleibt davon
 * getrennt und ist ohne Hook-Render-Pfad testbar.
 */
export function eventLookupWindow(
  masterStart: Date,
  occurrenceKey: string | undefined,
  timeZone: string,
): { start: Date; end: Date } {
  const bounds = occurrenceKey ? zonedDayBounds(occurrenceKey, timeZone) : null;
  if (!bounds) {
    return { start: addDays(masterStart, -1), end: addDays(masterStart, 366) };
  }
  return {
    start: dateMin([addDays(masterStart, -1), bounds.start]),
    end: dateMax([addDays(masterStart, 366), bounds.end]),
  };
}
