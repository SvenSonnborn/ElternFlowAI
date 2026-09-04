import type { TaskChanges } from "./optimistic";
import type { TaskWithType } from "./types";

/** Die Felder, die `toTaskChanges` schreibt. */
export type TaskConflictField =
  "title" | "subject" | "description" | "due_date" | "due_time" | "child_id" | "type_id";

/** `""` und `null` heißen beide „nicht gesetzt" — dieselbe Toleranz wie im Kalender. */
function sameText(a: string | null, b: string | null): boolean {
  return (a ?? "") === (b ?? "");
}

/**
 * Postgres rendert `time` als `HH:mm:ss`, ein als `HH:mm` geschriebener Wert
 * erreicht den Client aber unverändert — `parseDueTime` in form.ts akzeptiert
 * deshalb beide Schreibweisen. Verglichen werden nur Stunde und Minute.
 */
function sameTime(a: string | null, b: string | null): boolean {
  const clock = (value: string | null) => (value ?? "").slice(0, 5);
  return clock(a) === clock(b);
}

/**
 * Welche Felder ein Speichern **fremde** Änderungen überschreiben würde.
 *
 * Drei Werte pro Feld, nicht zwei: `base` ist der Stand, aus dem `state`
 * hydriert wurde, `mine` das, was geschrieben würde, `theirs` das, was jetzt
 * auf dem Server steht. Ein Feld ist nur dann ein Konflikt, wenn **jemand
 * anderes** es geändert hat (`theirs ≠ base`) **und** mein Schreibvorgang es
 * überschriebe (`mine ≠ theirs`).
 *
 * Der zweiwertige Vergleich (nur `theirs` gegen `mine`) hat die eigenen
 * Änderungen des Nutzers mitgelistet — `toTaskChanges` schickt bewusst den
 * vollen editierbaren Feldsatz, kein Diff, ein geändertes Feld weicht also
 * zwangsläufig ab, auch wenn sonst niemand es angefasst hat. Damit war die
 * Liste nach **jedem** Versionssprung nicht-leer, die Regel „leere Liste →
 * durchspeichern" feuerte nie, und der Dialog erschien bei jeder fremden
 * Schreiboperation. Belegt in der Zwei-Client-Verifikation, Schritt 8
 * ([docs/superpowers/plans/2026-09-04-conflict-detection-verification.md](./2026-09-04-conflict-detection-verification.md)).
 *
 * Eine leere Liste heißt weiterhin: kein Dialog, der Schreibvorgang läuft
 * durch. Sie ist jetzt nur wieder das, was sie sein sollte — der Normalfall,
 * wenn niemand ins Gehege kommt (ADR-031).
 *
 * Jedes der sieben Felder prüft zuerst `mine.<feld> !== undefined`, bevor es
 * `theirs`/`base` überhaupt anfasst: `TaskChanges` lässt jedes seiner Felder
 * `undefined`, und ein `undefined`-Feld schreibt PostgREST gar nicht erst —
 * es kann also nie mit einer fremden Fassung kollidieren, unabhängig davon,
 * was `theirs` oder `base` tragen. Dieser Wächter sitzt an der Aufrufstelle,
 * nicht in `sameText`/`sameTime` selbst: `child_id` vergleicht roh über `??`
 * und benutzt keinen der beiden Helfer — eine Regel an sieben gleichen
 * Stellen ist ehrlicher als eine an sechs plus eine Ausnahme für `child_id`.
 * (Die Helfer trugen diese Toleranz früher zusätzlich selbst, per eigenem
 * `undefined`-Zweig — der war unerreichbar, weil der Aufrufer-Wächter jeden
 * Aufruf mit `b === undefined` bereits abfing, bevor der Helfer ihn sah;
 * inzwischen entfernt.)
 *
 * `child_id` und `type_id` sind Fremdschlüssel; der Vergleich läuft auf der
 * Id, die *Anzeige* löst der Screen aus den ohnehin geladenen Kind- und
 * Typ-Listen auf.
 */
export function differingTaskFields(
  theirs: TaskWithType,
  mine: TaskChanges,
  base: TaskWithType,
): TaskConflictField[] {
  const out: TaskConflictField[] = [];
  if (
    mine.title !== undefined &&
    !sameText(theirs.title, base.title) &&
    !sameText(theirs.title, mine.title)
  ) {
    out.push("title");
  }
  if (
    mine.subject !== undefined &&
    !sameText(theirs.subject, base.subject) &&
    !sameText(theirs.subject, mine.subject)
  ) {
    out.push("subject");
  }
  if (
    mine.description !== undefined &&
    !sameText(theirs.description, base.description) &&
    !sameText(theirs.description, mine.description)
  ) {
    out.push("description");
  }
  if (
    mine.due_date !== undefined &&
    !sameText(theirs.due_date, base.due_date) &&
    !sameText(theirs.due_date, mine.due_date)
  ) {
    out.push("due_date");
  }
  if (
    mine.due_time !== undefined &&
    !sameTime(theirs.due_time, base.due_time) &&
    !sameTime(theirs.due_time, mine.due_time)
  ) {
    out.push("due_time");
  }
  if (
    mine.child_id !== undefined &&
    (theirs.child_id ?? null) !== (base.child_id ?? null) &&
    (theirs.child_id ?? null) !== (mine.child_id ?? null)
  ) {
    out.push("child_id");
  }
  if (
    mine.type_id !== undefined &&
    !sameText(theirs.type_id, base.type_id) &&
    !sameText(theirs.type_id, mine.type_id)
  ) {
    out.push("type_id");
  }
  return out;
}
