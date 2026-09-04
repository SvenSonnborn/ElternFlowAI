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
 * Der Schlüssel ist `occurrenceDate`, also das **aufgelöste** Datum, das auch
 * `modifyOccurrence` als Exception-Schlüssel benutzt. Bei einer per Override
 * auf einen anderen Tag verschobenen Occurrence fällt er mit dem
 * regelerzeugten Datum auseinander; das Token folgt dann dem, was der
 * Schreibvorgang tut. Siehe `docs/TODO.md`.
 */
export function occurrenceVersion(row: EventWithRelations, occurrenceDate: string): string {
  const exception = (row.event_exceptions ?? []).find(
    (ex) => ex.occurrence_date === occurrenceDate,
  );
  return `${row.updated_at}|${exception?.updated_at ?? NO_EXCEPTION}`;
}
