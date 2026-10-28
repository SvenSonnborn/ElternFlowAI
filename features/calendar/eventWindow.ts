import { addDays, max as dateMax, min as dateMin } from "date-fns";

import type { EventWithRelations } from "./expand";
import type { CalendarOccurrence } from "./types";

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
 * Zukunft liegenden Occurrence (>366 Tage) leer, und `pickOccurrence` findet
 * sie nicht.
 *
 * Die Tagesgrenzen kommen aus `zonedDayBounds` ([timezone.ts](./timezone.ts))
 * und entstehen dort in `timeZone`, nicht in der Zone des Lesers (ADR-034,
 * Befund B aus PR #121): Ein Berliner Termin um 23:30 liegt für einen Leser in
 * `America/New_York` schon am Vortag, das Fenster verfehlte sonst die
 * Occurrence. Ein Schlüssel, der nicht der Form `yyyy-MM-dd` entspricht,
 * liefert dort `null` und fällt auf das Standardfenster zurück — das macht die
 * Funktion total; den kaputten Link meldet `pickOccurrence`.
 *
 * Seit ADR-035 deckt das Fenster zusätzlich das Intervall ab, das ein
 * `modified`-Override der angeforderten Occurrence beansprucht — in **beide**
 * Richtungen. Dabei zählt **nur** der Override der angeforderten Occurrence,
 * sonst zöge eine einzige weit verschobene Exception das Fenster jedes
 * Detail-Aufrufs derselben Serie mit, und `expandEvents` expandierte Jahre
 * statt Tage.
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

  // Ein Override kann genau diese Occurrence aus dem um ihr Regel-Datum
  // gebauten Fenster schieben; `expandEvents` erzeugt sie, der Fensterfilter
  // verwirft sie wieder. Nur der Override DIESER Occurrence weitet (siehe
  // JSDoc).
  //
  // Beide Grenzen bekommen beide Werte, weil `overrideInterval` ein
  // invertiertes Intervall nicht abfängt (`end_at` vor `start_at`): Ein
  // fehlendes `end_at` wird per `?? start` aufgefüllt, ein vorhandenes, aber
  // zu frühes `end_at` nicht geprüft. Bekäme nur `starts` `interval.start`
  // und nur `ends` `interval.end`, verfehlte ein solches Intervall im
  // invertierten Fall beide Extreme — `dateMin`/`dateMax` laufen ohnehin über
  // die ganzen Arrays und decken die Richtung des Overrides damit schon ab.
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

/**
 * Wählt aus den expandierten Occurrences eines einzelnen Masters die, die der
 * Routen-Parameter `occ` benennt.
 *
 * Ohne `occurrenceKey` ist es die erste. Ein Einzeltermin ignoriert den
 * `occurrenceKey`: Ein verschobener Einzeltermin trägt in der Route noch seinen
 * alten Schlüssel. Bei einer Serie zählt nur der exakte Treffer auf
 * `occurrenceKey` (ADR-034) — ein unbekannter oder unparsbarer Schlüssel liefert
 * `null`, nie eine andere Occurrence der Serie, denn darauf könnte ein
 * anschließendes „Nur diesen" die falsche Exception schreiben oder löschen.
 *
 * `null` führt in `cal.error.eventGone` bzw. in den `!occurrence`-Zweig von
 * `EventEditScreen`; das ist die richtige Meldung für einen kaputten Link.
 */
export function pickOccurrence(
  expanded: readonly CalendarOccurrence[],
  occurrenceKey?: string,
): CalendarOccurrence | null {
  const first = expanded[0] ?? null;
  if (!occurrenceKey || first?.isRecurring === false) return first;
  return expanded.find((o) => o.occurrenceKey === occurrenceKey) ?? null;
}
