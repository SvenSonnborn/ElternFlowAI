import { isAfter, isValid, parse, startOfDay } from "date-fns";

import type { DateTimePickerMode } from "./DateTimePickerSheet.types";

/**
 * Wertet den Roh-String eines `<input type="date|time">` zu einem `Date` aus —
 * oder `null`, wenn er leer, unvollständig oder kein gültiges Datum ist.
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
 * `maximumDate` gilt nur im **Datums-Modus** — wie das `max`-Attribut am Input,
 * das es dort nur gibt — und wird **pro Kalendertag** verglichen, nicht als
 * Zeitpunkt: `new Date()` trägt die aktuelle Uhrzeit, und die übernommene
 * Uhrzeit von `base` kann später liegen — ein Instant-Vergleich würde den
 * heutigen Tag dann fälschlich ablehnen. Im Zeit-Modus wird es ignoriert.
 *
 * Ein Tag hinter dem Maximum wird auf den Tag des Maximums **geklemmt** (Jahr,
 * Monat, Tag vom Maximum, die übernommene Uhrzeit bleibt) statt verworfen: Das
 * `max`-Attribut begrenzt nur die Auswahl im Picker des Browsers, nicht das
 * Tippen, und Chrome meldet bei einem kontrollierten Datumsfeld `change` pro
 * Ziffer des Jahressegments. Wer `2031` tippt, durchläuft `0002` → `0020` →
 * `0203` (alles gültige Vergangenheit, wird übernommen) → `2031`. Würde der
 * letzte Schritt verworfen, bliebe das Feld auf `0203` stehen und das würde
 * gespeichert; geklemmt landet es sichtbar auf dem Maximum.
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

  if (isDateMode && maximumDate && isAfter(startOfDay(result), startOfDay(maximumDate))) {
    result.setFullYear(maximumDate.getFullYear(), maximumDate.getMonth(), maximumDate.getDate());
  }
  return result;
}
