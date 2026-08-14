import { isAllergenKey, type AllergenKey } from "./keys";

/**
 * Alles, was Allergien tragen kann — `children` und `parents` führen beide
 * dieselbe `allergies text[]`-Spalte. Strukturell getypt, damit dieses Modul
 * ohne die generierte Datenbank-Typdatei auskommt.
 */
export interface AllergyBearer {
  readonly allergies: string[] | null;
}

/**
 * Die Vereinigung der Allergien mehrerer Familienmitglieder, normalisiert und
 * sortiert.
 *
 * Unbekannte Werte fliegen raus: `allergies` ist ein freies `text[]`, und
 * `ChildProfileScreen` rendert Nicht-Key-Werte bewusst roh durch (Altdaten vor
 * dem Backfill von 2026-06-04). Der Klassifizierer bekommt nur, was er kennt.
 *
 * Sortiert, damit der `useMemo`-Vergleich im Hook greift und die Reihenfolge
 * der Query-Ergebnisse keinen neuen Cache-Eintrag erzeugt.
 *
 * Liegt hier statt neben dem Hook, weil sie rein ist: `allergens/` importiert
 * weder React noch Supabase, und nur deshalb lässt sie sich im Bun-Runner
 * testen — ein Import über den `@/features/auth`-Barrel zöge `AuthGate` und
 * damit NativeWind herein, das ohne React-Native-Runtime nicht initialisiert.
 */
export function mergeAllergies(rows: readonly AllergyBearer[]): AllergenKey[] {
  const keys = new Set<AllergenKey>();
  for (const row of rows) {
    for (const value of row.allergies ?? []) {
      if (isAllergenKey(value)) keys.add(value);
    }
  }
  return [...keys].sort();
}
