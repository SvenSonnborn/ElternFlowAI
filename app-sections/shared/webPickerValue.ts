import { isAfter, isValid, parse, startOfDay } from "date-fns";

import type { DateTimePickerMode } from "./DateTimePickerSheet.types";

/**
 * Wertet den Roh-String eines `<input type="date|time">` zu einem `Date` aus —
 * oder `null`, wenn der Wert nicht übernommen werden soll.
 *
 * Eigene Datei, weil `DateTimePickerSheet.web.tsx` über `useTheme` nativewind
 * lädt und unter `bun test` nicht importierbar ist; die Logik, die dort
 * tatsächlich Fehler machen kann, steht hier und ist testbar.
 *
 * Die Uhrzeit wird im Datums-Modus bewusst vom Basiswert übernommen: date-fns
 * `parse()` füllt nur Einheiten aus dem Referenzdatum auf, die das Pattern
 * auslässt. Bei `"yyyy-MM-dd"` fehlt die Uhr, `parse` setzt sie auf 00:00:00.000
 * zurück und der Termin verlöre seine Uhrzeit. Bei `"HH:mm"` fehlt das Datum,
 * und `parse` übernimmt es korrekt aus dem Referenzwert (Sekunden und
 * Millisekunden setzt es dabei auf 0). Ist `base` ungültig, dient die Epoche als
 * Referenz.
 *
 * `maximumDate` wird **pro Kalendertag** verglichen, nicht als Zeitpunkt:
 * `new Date()` trägt die aktuelle Uhrzeit, und die übernommene Uhrzeit von
 * `base` kann später liegen — ein Instant-Vergleich würde den heutigen Tag dann
 * fälschlich ablehnen. Ein Wert hinter dem Maximum wird verworfen statt auf das
 * Maximum geklemmt: das `max`-Attribut begrenzt nur die Auswahl im Picker des
 * Browsers, nicht das Tippen, und ein stilles Umbiegen auf einen anderen Tag
 * wäre eine Eingabe, die niemand gemacht hat.
 */
export function parseWebPickerValue(
  raw: string,
  mode: DateTimePickerMode,
  base: Date,
  maximumDate?: Date,
): Date | null {
  const isDateMode = mode === "date";
  const pattern = isDateMode ? "yyyy-MM-dd" : "HH:mm";
  const ref = isValid(base) ? base : new Date(0);

  const parsed = parse(raw, pattern, ref);
  if (!isValid(parsed)) return null;

  let result = parsed;
  if (isDateMode) {
    result = new Date(parsed);
    result.setHours(ref.getHours(), ref.getMinutes(), ref.getSeconds(), ref.getMilliseconds());
  }

  if (maximumDate && isAfter(startOfDay(result), startOfDay(maximumDate))) return null;
  return result;
}
