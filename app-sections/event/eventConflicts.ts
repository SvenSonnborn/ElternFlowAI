import type { CalendarOccurrence } from "@/features/calendar";

/** Wem ein Termin gehört; beide `null` heißt familienweit. */
export interface ConflictPerson {
  childId: string | null;
  parentId: string | null;
}

/**
 * Die Kollisionsprüfung für Anlegen und Bearbeiten — eine Funktion für beide
 * Formulare, damit die Regel nicht zweimal gepflegt wird (Spec „stille
 * Fehler", C: keine doppelte Konfliktlogik).
 *
 * Kollision heißt: echte Überlappung (sich berührende Kanten zählen nicht) und
 * dieselbe Person. Die `null`-Wächter sind Absicht: Ein familienweiter Termin
 * kollidiert mit jedem, und ein bloßes `o.childId === person.childId` hielte
 * zwei `null` für „gleiche Person" — ein Elternteil-Termin kollidierte dann
 * mit jedem Kind-Termin.
 *
 * `self` schließt genau eine Occurrence aus (`eventId` **und** `occurrenceKey`):
 * Beim Bearbeiten ist der Termin sonst sein eigener Konflikt, die
 * Geschwister-Occurrences derselben Serie bleiben aber echte Treffer.
 */
export function findConflicts(
  occurrences: readonly CalendarOccurrence[],
  checked: { startAt: Date; endAt: Date },
  person: ConflictPerson,
  self?: { eventId: string; occurrenceKey: string },
): CalendarOccurrence[] {
  const familyWide = person.childId === null && person.parentId === null;
  return occurrences.filter((o) => {
    if (self && o.eventId === self.eventId && o.occurrenceKey === self.occurrenceKey) return false;
    const samePerson =
      familyWide ||
      (o.childId === null && o.parentId === null) ||
      (person.childId !== null && o.childId === person.childId) ||
      (person.parentId !== null && o.parentId === person.parentId);
    return (
      samePerson &&
      o.startAt.getTime() < checked.endAt.getTime() &&
      checked.startAt.getTime() < o.endAt.getTime()
    );
  });
}
