import type { TaskChanges } from "./optimistic";
import type { TaskWithType } from "./types";

/** Die Felder, die `toTaskChanges` schreibt. */
export type TaskConflictField =
  "title" | "subject" | "description" | "due_date" | "due_time" | "child_id" | "type_id";

/** `""` und `null` heißen beide „nicht gesetzt". */
function sameText(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? "") === (b ?? "");
}

/**
 * Postgres rendert `time` als `HH:mm:ss`, ein als `HH:mm` geschriebener Wert
 * erreicht den Client aber unverändert — `parseDueTime` in form.ts akzeptiert
 * deshalb beide Schreibweisen. Verglichen werden nur Stunde und Minute.
 */
function sameTime(a: string | null | undefined, b: string | null | undefined): boolean {
  const clock = (value: string | null | undefined) => (value ?? "").slice(0, 5);
  return clock(a) === clock(b);
}

/**
 * Welche Felder die fremde Fassung anders trägt als die eigene Eingabe.
 *
 * Leere Liste heißt: kein Dialog, der Schreibvorgang läuft durch — dieselbe
 * Regel und dieselbe Begründung wie bei `differingEventFields` im Kalender
 * (ADR-031).
 *
 * `child_id` und `type_id` sind Fremdschlüssel; der Vergleich läuft auf der
 * Id, die *Anzeige* löst der Screen aus den ohnehin geladenen Kind- und
 * Typ-Listen auf.
 */
export function differingTaskFields(theirs: TaskWithType, mine: TaskChanges): TaskConflictField[] {
  const out: TaskConflictField[] = [];
  if (theirs.title !== mine.title) out.push("title");
  if (!sameText(theirs.subject, mine.subject)) out.push("subject");
  if (!sameText(theirs.description, mine.description)) out.push("description");
  if (theirs.due_date !== mine.due_date) out.push("due_date");
  if (!sameTime(theirs.due_time, mine.due_time)) out.push("due_time");
  if ((theirs.child_id ?? null) !== (mine.child_id ?? null)) out.push("child_id");
  if (theirs.type_id !== mine.type_id) out.push("type_id");
  return out;
}
