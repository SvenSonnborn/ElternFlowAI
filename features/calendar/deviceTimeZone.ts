import { getCalendars } from "expo-localization";

/** Letzter Ausweg, wenn weder Expo noch `Intl` eine Zone nennen. DE-primäre App. */
const FALLBACK = "Europe/Berlin";

/**
 * Die IANA-Zone des Geräts — die Zone, in der ein neu angelegter Termin
 * verankert wird.
 *
 * Drei Stufen, weil jede für sich ausfallen kann: `expo-localization` liefert
 * `timeZone` als `string | null`, und `Intl.DateTimeFormat().resolvedOptions()`
 * kann in einer ICU-losen Umgebung einen leeren Wert melden. V1 nimmt an, dass
 * der Anlegende in der Zone lebt, in der der Termin stattfindet — ein
 * Zonen-Picker wäre ein eigenes Feature (siehe `docs/TODO.md`).
 *
 * Eigenes Modul statt eines Exports aus `timezone.ts`: `expo-localization` ist
 * ein natives Modul, und `timezone.test.ts` soll unter `bun test` ohne
 * Modul-Mock laufen.
 */
export function deviceTimeZone(): string {
  const fromExpo = getCalendars()[0]?.timeZone;
  if (fromExpo) return fromExpo;
  const fromIntl = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return fromIntl || FALLBACK;
}
