import type { EventWithRelations } from "./expand";

/** Steht für „an diesem Datum liegt keine Exception". */
const NO_EXCEPTION = "-";

/**
 * Der Stand einer Occurrence, als ein vergleichbarer String.
 *
 * Das Token deckt **genau die Zeilen ab, die ein Speichern dieser Occurrence
 * anfassen wird**: die Master-Zeile und die Exception an diesem Datum. Beide
 * Nachbar-Zuschnitte wären falsch (ADR-031):
 *
 * - Nur `events.updated_at` übersieht jede fremde Änderung am Scope „Nur
 *   diesen Termin" — bei Serien der häufigste Pfad.
 * - Die ganze Serie (`max` über alle Exceptions) übersieht nichts, meldet aber
 *   einen Konflikt, wenn jemand eine *andere* Occurrence ändert. Dieser
 *   Fehlalarm wäre häufiger als der echte Fall, und der Feldvergleich fängt ihn
 *   nicht ab: Die fremde Änderung am 22. ändert nichts an der Auflösung des
 *   15., wohl aber die eigene Eingabe — verglichen würde also sehr wohl eine
 *   Abweichung.
 *
 * Der Schlüssel ist `occurrenceKey`, also das **regelerzeugte** Datum — dieselbe
 * Zeile in `event_exceptions`, auf die auch `modifyOccurrence` schreibt. Bei
 * einer per Override auf einen anderen Tag verschobenen Occurrence trifft das
 * Token damit weiterhin die Exception, die eine fremde Änderung angefasst hätte
 * — nicht mehr das aufgelöste Anzeigedatum, an dem keine Exception-Zeile liegt
 * (ADR-034).
 */
export function occurrenceVersion(row: EventWithRelations, occurrenceKey: string): string {
  const exception = (row.event_exceptions ?? []).find((ex) => ex.occurrence_date === occurrenceKey);
  return `${row.updated_at}|${exception?.updated_at ?? NO_EXCEPTION}`;
}

/**
 * Zerlegt ein `occurrenceVersion`-Token in die beiden Stempel, die
 * `apply_event_change` als `p_seen_master_updated_at` und
 * `p_seen_exception_updated_at` prüft (Spec §5.4). Liegt neben
 * `occurrenceVersion`, damit das Format genau eine Heimat hat.
 *
 * `exceptionUpdatedAt: null` heißt „an diesem Schlüssel lag keine Exception" —
 * genau die Bedeutung, die der Server einem null gibt.
 *
 * Wirft `RangeError` statt zu raten: Ein Token, das nicht aus
 * `occurrenceVersion` stammt, ist ein Fehler im Aufrufer. Ein still
 * zurechtgebogener Stand ergäbe einen Konflikt, den niemand verursacht hat —
 * oder, schlimmer, keinen, wo einer war.
 */
export function parseOccurrenceVersion(token: string): {
  masterUpdatedAt: string;
  exceptionUpdatedAt: string | null;
} {
  const parts = token.split("|");
  if (parts.length !== 2 || parts[0] === "" || parts[1] === "") {
    throw new RangeError(`parseOccurrenceVersion: kein Versions-Token — "${token}"`);
  }
  const [masterUpdatedAt, exception] = parts;
  return {
    masterUpdatedAt,
    exceptionUpdatedAt: exception === NO_EXCEPTION ? null : exception,
  };
}
