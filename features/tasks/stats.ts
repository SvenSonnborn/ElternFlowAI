import { endOfDay, endOfWeek, isSameDay, parseISO, startOfDay, startOfWeek } from "date-fns";

import type { TaskGroup, TaskSections, TaskStats, TaskWithType } from "./types";

/**
 * `due_date` ist ein `YYYY-MM-DD`-String und `due_time` ein `HH:MM:SS` — für
 * beide ist die lexikalische Ordnung die chronologische, es wird also nichts
 * geparst.
 *
 * Eine Aufgabe ohne Uhrzeit ist der vageste Termin ihres Tages und sortiert
 * hinter die terminierten; Titel und zuletzt `id` brechen den Rest der
 * Gleichstände, damit die Reihenfolge stabil ist statt „was Postgres gerade
 * lieferte".
 */
function byDueAsc(a: TaskWithType, b: TaskWithType): number {
  const byDate = a.due_date.localeCompare(b.due_date);
  if (byDate !== 0) return byDate;

  if (a.due_time !== b.due_time) {
    if (a.due_time === null) return 1;
    if (b.due_time === null) return -1;
    return a.due_time.localeCompare(b.due_time);
  }

  const byTitle = a.title.localeCompare(b.title);
  if (byTitle !== 0) return byTitle;

  // Ohne diesen letzten Vergleich gäbe der Comparator bei gleichem Termin und
  // gleichem Titel 0 zurück. `Array.sort` ist stabil, übernähme also die
  // Reihenfolge der Query — und die ist bei Gleichstand nicht festgelegt, zwei
  // gleichnamige Aufgaben könnten zwischen zwei Refetches die Plätze tauschen.
  return a.id.localeCompare(b.id);
}

function byCompletedAtDesc(a: TaskWithType, b: TaskWithType): number {
  const byCompleted = (b.completed_at ?? "").localeCompare(a.completed_at ?? "");
  if (byCompleted !== 0) return byCompleted;

  // Zwei Aufgaben mit demselben Zeitstempel — derselbe Gleichstandsbrecher wie
  // in `byDueAsc`, damit auch die Erledigt-Sektionen nicht von der Reihenfolge
  // der Query abhängen. Aufsteigend, also entgegen der Sortierrichtung: die
  // Richtung ist hier beliebig, nur die Stabilität zählt.
  return a.id.localeCompare(b.id);
}

export function groupTasksByChild(tasks: TaskWithType[]): TaskGroup[] {
  // Sorting first makes the Map's insertion order the "earliest due date
  // first" order the caller sees.
  const buckets = new Map<string | null, TaskWithType[]>();
  for (const task of [...tasks].sort(byDueAsc)) {
    const bucket = buckets.get(task.child_id);
    if (bucket) bucket.push(task);
    else buckets.set(task.child_id, [task]);
  }

  const groups: TaskGroup[] = [];
  for (const [childId, bucket] of buckets) {
    const open = bucket.filter((t) => !t.is_done).sort(byDueAsc);
    const done = bucket.filter((t) => t.is_done).sort(byCompletedAtDesc);
    groups.push({ childId, tasks: [...open, ...done], openCount: open.length });
  }

  // Parent errands and chores sort to the end. Array.sort is stable, so the
  // child groups keep their due-date order.
  return groups.sort((a, b) => Number(a.childId === null) - Number(b.childId === null));
}

/**
 * All counters read `now` at day granularity only — the caller may pass any
 * time of day. `now` is a parameter so the tests stay deterministic.
 */
export function computeTaskStats(tasks: TaskWithType[], now: Date): TaskStats {
  const todayEnd = endOfDay(now);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

  let dueToday = 0;
  let thisWeek = 0;
  let open = 0;
  let doneToday = 0;
  let doneThisWeek = 0;

  for (const task of tasks) {
    if (task.is_done) {
      // The tasks_completed_consistency CHECK guarantees completed_at is set
      // whenever is_done — the guard is for rows read through a stale cache.
      if (!task.completed_at) continue;
      const completedAt = new Date(task.completed_at);
      if (isSameDay(completedAt, now)) doneToday += 1;
      if (completedAt >= weekStart && completedAt <= weekEnd) doneThisWeek += 1;
      continue;
    }

    open += 1;
    // `due_date` is a Postgres `date`: parseISO reads it as local midnight,
    // new Date() would read it as UTC midnight and shift the day.
    const dueAt = parseISO(task.due_date);
    // Overdue folds into "today" — patterns/homework.md derives urgency as
    // `today` if `due <= end of today`.
    if (dueAt <= todayEnd) dueToday += 1;
    if (dueAt <= weekEnd) thisWeek += 1;
  }

  const weekTotal = doneThisWeek + thisWeek;
  const donePct = weekTotal === 0 ? 0 : Math.round((doneThisWeek / weekTotal) * 100);

  return { dueToday, thisWeek, donePct, open, doneToday };
}

/**
 * Die Sektionen des Aufgaben-Screens.
 *
 * `upcoming` nimmt bewusst *alles* Offene nach heute auf, nicht nur die
 * laufende Woche: eine „diese Woche"-Sektion ließe langfristige Aufgaben aus
 * jeder Liste fallen. Die Wochenzahl steht stattdessen in der Stat-Leiste.
 * Zusammen mit `overdue` und `today` sitzt damit jede offene Aufgabe in genau
 * einer Sektion.
 *
 * Überfälliges bekommt seit der Filter-Iteration eine eigene Sektion, statt in
 * `today` zu verschwinden — eine drei Tage überfällige Aufgabe sah sonst aus
 * wie eine, die heute Abend fällig ist. Die Kachel „Heute fällig" zählt
 * weiterhin beides zusammen (siehe `computeTaskStats`).
 */
export function groupTasksByDue(tasks: TaskWithType[], now: Date): TaskSections {
  const dayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  const overdue: TaskWithType[] = [];
  const today: TaskWithType[] = [];
  const upcoming: TaskWithType[] = [];
  const doneToday: TaskWithType[] = [];
  const doneRecent: TaskWithType[] = [];

  for (const task of tasks) {
    if (task.is_done) {
      // Der tasks_completed_consistency-CHECK garantiert completed_at, sobald
      // is_done — die Prüfung fängt Zeilen aus einem veralteten Cache ab.
      if (!task.completed_at) continue;
      if (isSameDay(new Date(task.completed_at), now)) doneToday.push(task);
      else doneRecent.push(task);
      continue;
    }

    const dueAt = parseISO(task.due_date);
    if (dueAt < dayStart) overdue.push(task);
    else if (dueAt <= todayEnd) today.push(task);
    else upcoming.push(task);
  }

  return {
    overdue: overdue.sort(byDueAsc),
    today: today.sort(byDueAsc),
    upcoming: upcoming.sort(byDueAsc),
    doneToday: doneToday.sort(byCompletedAtDesc),
    doneRecent: doneRecent.sort(byCompletedAtDesc),
  };
}
