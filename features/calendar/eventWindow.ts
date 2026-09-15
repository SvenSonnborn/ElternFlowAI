import { addDays, max as dateMax, min as dateMin } from "date-fns";

import type { EventWithRelations } from "./expand";

import { overrideInterval } from "./override";
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
 * Seit ADR-035 deckt das Fenster zusätzlich das Intervall ab, das ein
 * `modified`-Override der angeforderten Occurrence beansprucht: Ein Override
 * kann eine Occurrence aus dem um ihr Regel-Datum gebauten Fenster hinaus
 * verschieben — `expandEvents` erzeugt sie dann zwar, der Fensterfilter
 * verwirft sie aber wieder, `find` läuft leer, und der `expanded[0]`-Fallback
 * zeigt stillschweigend eine **andere** Occurrence derselben Serie
 * (nachgemessen, Spec §6.9 Nr. 2) — dieselbe Klasse wie Befund B aus PR #121,
 * nur für den verschobenen statt den unverschobenen Fall. Dabei zählt **nur**
 * der Override der angeforderten Occurrence, sonst zöge eine einzige weit
 * verschobene Exception das Fenster jedes Detail-Aufrufs derselben Serie mit,
 * und `expandEvents` expandierte Jahre statt Tage. Und die Weitung wirkt in
 * **beide** Richtungen, weil ein Override ebenso in die Vergangenheit wie in
 * die Zukunft verschieben kann.
 *
 * Als eigenes Modul statt inline in `hooks.ts`: `hooks.ts` importiert über
 * `design-system/ThemeProvider` transitiv `nativewind`, das beim Laden
 * `Appearance` liest — außerhalb eines echten RN/Web-Runtimes wirft das unter
 * `bun test` (`react-native-css-interop`). Diese reine Funktion bleibt davon
 * getrennt und ist ohne Hook-Render-Pfad testbar.
 */
export function eventLookupWindow(
  row: EventWithRelations,
  occurrenceKey?: string,
): { start: Date; end: Date } {
  const masterStart = new Date(row.start_at);
  const bounds = occurrenceKey ? zonedDayBounds(occurrenceKey, row.timezone) : null;
  if (!bounds) {
    return { start: addDays(masterStart, -1), end: addDays(masterStart, 366) };
  }

  const starts = [addDays(masterStart, -1), bounds.start];
  const ends = [addDays(masterStart, 366), bounds.end];

  // Ein Override kann genau diese Occurrence aus dem Fenster schieben, das um
  // ihr Regel-Datum gebaut wurde. `expandEvents` erzeugt sie dann zwar, der
  // Fensterfilter verwirft sie aber wieder, `find` läuft leer, und der
  // `expanded[0]`-Fallback zeigt stillschweigend eine ANDERE Occurrence
  // derselben Serie (nachgemessen, Spec §6.9 Nr. 2) — dieselbe Klasse wie
  // Befund B aus PR #121, nur für den verschobenen Fall.
  //
  // Nur der Override DIESER Occurrence weitet: Sonst zöge eine einzige weit
  // verschobene Exception das Fenster jedes Detail-Aufrufs derselben Serie mit
  // sich, und `expandEvents` expandierte Jahre statt Tage.
  //
  // Beide Grenzen bekommen beide Werte, weil ein Override in jede Richtung
  // verschieben kann — `dateMin`/`dateMax` greifen sich das jeweilige Extrem.
  const interval = overrideInterval(
    (row.event_exceptions ?? []).find(
      (ex) => ex.occurrence_date === occurrenceKey && ex.action === "modified",
    )?.override ?? null,
  );
  if (interval) {
    starts.push(interval.start, interval.end);
    ends.push(interval.start, interval.end);
  }

  return { start: dateMin(starts), end: dateMax(ends) };
}
