import type { RecurrenceOption } from "@/features/calendar/createMutation";

/** Die Eingaben des Termin-Formulars, soweit sie für „geändert?" zählen. */
export type EventFormValues = {
  title: string;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  location: string;
  notes: string;
  typeId: string | null;
  memberId: string | null;
  recurrence: RecurrenceOption;
  countText: string;
};

/**
 * Weicht das Formular vom Ausgangsstand ab? Entscheidet, ob Wegwischen und
 * „Abbrechen" nachfragen (`useDiscardGuard`).
 *
 * Datumsfelder vergleicht `getTime()`, weil dieselbe Zeit als andere
 * `Date`-Instanz kein Unterschied ist. Strings bleiben ungetrimmt: Ein
 * eingetipptes Leerzeichen ist eine Eingabe, die verloren ginge. Der
 * Ausgangsstand ist Sache des Aufrufers — beim Anlegen zählt der automatisch
 * gesetzte Termin-Typ nicht als Änderung, beim Bearbeiten nicht die Hydration.
 * Der Zähler zählt nur bei aktiver Wiederholung, weil das Feld sonst
 * ausgeblendet ist und das Speichern ihn ignoriert.
 */
export function eventFormChanged(current: EventFormValues, pristine: EventFormValues): boolean {
  return (
    current.title !== pristine.title ||
    current.startAt.getTime() !== pristine.startAt.getTime() ||
    current.endAt.getTime() !== pristine.endAt.getTime() ||
    current.allDay !== pristine.allDay ||
    current.location !== pristine.location ||
    current.notes !== pristine.notes ||
    current.typeId !== pristine.typeId ||
    current.memberId !== pristine.memberId ||
    current.recurrence !== pristine.recurrence ||
    (current.recurrence !== "none" && current.countText !== pristine.countText)
  );
}
