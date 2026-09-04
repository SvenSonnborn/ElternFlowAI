import type { TaskChanges } from "./optimistic";
import type { TaskWithType } from "./types";

/** Die Felder, die `toTaskChanges` schreibt. */
export type TaskConflictField =
  "title" | "subject" | "description" | "due_date" | "due_time" | "child_id" | "type_id";

/**
 * `""` und `null` heißen beide „nicht gesetzt". `undefined` ist ein dritter,
 * stärkerer Fall und deshalb ein eigener früher Ausstieg: In einem
 * PostgREST-Update heißt eine fehlende Spalte „dieser Request schreibt sie
 * nicht" — ein Feld, das gar nicht geschrieben wird, kann per Definition
 * nicht mit einer fremden Fassung kollidieren, unabhängig davon, was
 * `theirs` trägt.
 */
function sameText(a: string | null | undefined, b: string | null | undefined): boolean {
  if (b === undefined) return true;
  return (a ?? "") === (b ?? "");
}

/**
 * Postgres rendert `time` als `HH:mm:ss`, ein als `HH:mm` geschriebener Wert
 * erreicht den Client aber unverändert — `parseDueTime` in form.ts akzeptiert
 * deshalb beide Schreibweisen. Verglichen werden nur Stunde und Minute;
 * `undefined` ist wie bei `sameText` „nicht geschrieben" und damit immer
 * gleich.
 */
function sameTime(a: string | null | undefined, b: string | null | undefined): boolean {
  if (b === undefined) return true;
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
 * Alle sieben Felder vergleichen `undefined` tolerant: `TaskChanges` lässt
 * jedes seiner Felder `undefined`, und ein `undefined`-Feld schreibt
 * PostgREST gar nicht erst — es kann also nie mit einer fremden Fassung
 * kollidieren, egal was `theirs` trägt.
 *
 * `child_id` und `type_id` sind Fremdschlüssel; der Vergleich läuft auf der
 * Id, die *Anzeige* löst der Screen aus den ohnehin geladenen Kind- und
 * Typ-Listen auf.
 */
export function differingTaskFields(theirs: TaskWithType, mine: TaskChanges): TaskConflictField[] {
  const out: TaskConflictField[] = [];
  if (!sameText(theirs.title, mine.title)) out.push("title");
  if (!sameText(theirs.subject, mine.subject)) out.push("subject");
  if (!sameText(theirs.description, mine.description)) out.push("description");
  if (!sameText(theirs.due_date, mine.due_date)) out.push("due_date");
  if (!sameTime(theirs.due_time, mine.due_time)) out.push("due_time");
  if (mine.child_id !== undefined && (theirs.child_id ?? null) !== (mine.child_id ?? null)) {
    out.push("child_id");
  }
  if (!sameText(theirs.type_id, mine.type_id)) out.push("type_id");
  return out;
}
