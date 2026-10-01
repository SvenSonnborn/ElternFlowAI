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

/**
 * Was eine `change`-Meldung des Inputs bewirkt: `pick` geht an `onPick`, `draft`
 * ist der Text, den das Input anzeigen soll, solange kein gültiger Wert vorliegt.
 */
export interface WebPickerChange {
  /** An `onPick` weiterreichen, wenn gesetzt. */
  pick: Date | null;
  /** Anzuzeigender Rohwert; `null` heißt: den Wert des Aufrufers zeigen. */
  draft: string | null;
}

/**
 * Übersetzt den Roh-String einer `change`-Meldung in Übernahme und Entwurf.
 * Ein gültiger Wert wird über `parseWebPickerValue` übernommen (samt Klemmen auf
 * `maximumDate`) und braucht keinen Entwurf — das Input zeigt dann den Wert des
 * Aufrufers, bei einem geklemmten Tag also den geklemmten, nicht den Rohwert.
 * Alles andere bleibt als `draft` stehen.
 *
 * Der Entwurf ist nötig, weil das Input kontrolliert läuft: Meldet es einen
 * unparsbaren Rohwert und die Komponente tut nichts, stellt React den alten Wert
 * wieder her. Chrome meldet `""` bei Backspace auf einem Segment — das Segment
 * sprang sofort zurück — und bei einer ungültigen Kombination wie 29.02. in einem
 * Nicht-Schaltjahr. Letzteres ist eine Sackgasse: Von 15.10.2026 aus ist
 * 29.02.2028 in Feldreihenfolge unerreichbar, beim Monat sprang das Feld auf
 * 29.10.2026 zurück. Mit Entwurf bleibt der Zwischenstand sichtbar, bis das nächste
 * Segment ihn zu einem gültigen Wert vervollständigt (Spec Web-Parität PR B, §1.2).
 *
 * Reine Funktion neben `parseWebPickerValue`, weil die Web-Komponente nativewind
 * lädt und unter `bun test` nicht importierbar ist.
 */
export function webPickerChange(
  raw: string,
  mode: DateTimePickerMode,
  base: Date,
  maximumDate?: Date,
): WebPickerChange {
  const pick = parseWebPickerValue(raw, mode, base, maximumDate);
  return pick ? { pick, draft: null } : { pick: null, draft: raw };
}
