import type { TFunction } from "i18next";

import type { IconName } from "@/app-sections/shared";
import type { Theme } from "@/design-system/themes";
import type { DaySegment } from "@/features/calendar/spans";
import type { TaskWithType } from "@/features/tasks/types";

// Bewusst an den Modulen vorbei am Barrel: `@/features/calendar` zieht über
// `hooks.ts` den ThemeProvider und damit NativeWind herein, `@/features/tasks`
// über `queries.ts` den Supabase-Client — beides Laufzeit-Ballast, den eine
// reine Funktion nicht braucht und ihr Test nicht laden kann.
import { segmentsForDay, segmentTimeLabel } from "@/features/calendar/day";
import { taskIconFor, taskTypeColorFor, taskTypeLabelKey } from "@/features/tasks/palette";

/**
 * Baut die „Morgen vorbereiten"-Karte aus den beiden Quellen, die morgen etwas
 * zu sagen haben: offene Aufgaben mit `due_date` von morgen und die Termine,
 * die auf den morgigen Tag malen.
 *
 * Rein und außerhalb des Screens, aus demselben Grund wie `buildAvatarRow`
 * nebenan: gedeckelt wird auf drei Zeilen, und beim Schnitt entscheidet die
 * Reihenfolge, was aus der Karte fällt — eine Regel, die man testen können
 * muss, statt sie im JSX zu vergraben.
 */

/** Ein Familienmitglied, wie die Meta-Zeile es braucht — Kind oder Elternteil. */
export interface PrepPerson {
  id: string;
  name: string;
}

interface PrepEntryBase {
  /** Stabil über Aufgaben *und* Termin-Occurrences hinweg. */
  key: string;
  /** Aufgaben- bzw. Termin-Id — das Ziel des Deep-Links. */
  id: string;
  title: string;
  /** „16:30 · Mia · Besorgung" — Zeit, Person und Typ, soweit vorhanden. */
  meta: string;
  iconName: IconName;
  color: string;
}

export interface PrepTaskEntry extends PrepEntryBase {
  kind: "task";
}

export interface PrepEventEntry extends PrepEntryBase {
  kind: "event";
  /** Der Serien-Anker für `/event/[id]?occ=…`, nicht der Tag des Segments. */
  occurrenceDate: string;
}

/**
 * Union statt eines optionalen `occurrenceDate`: der Termin-Zweig gibt den
 * Anker damit als *garantiert* an den Deep-Link weiter, statt ein `undefined`
 * in die Route-Parameter zu lassen, das dort nichts zu suchen hat.
 */
export type PrepEntry = PrepTaskEntry | PrepEventEntry;

export type PrepOverflowTarget = "/aufgaben" | "/kalender";

export interface TomorrowPrep {
  visible: PrepEntry[];
  overflow: number;
  /** Wohin die „+X weitere"-Zeile führt — `null`, solange es keine gibt. */
  overflowTarget: PrepOverflowTarget | null;
}

export interface TomorrowPrepArgs {
  tasks: readonly TaskWithType[];
  segments: readonly DaySegment[];
  /** yyyy-MM-dd des Tages, um den es geht. */
  date: string;
  /** Eltern und Kinder der Familie in einem Topf — die Meta-Zeile fragt nur nach Namen. */
  people: readonly PrepPerson[];
  theme: Theme;
  lang: "de" | "en";
  t: TFunction;
  limit?: number;
}

export const TOMORROW_PREP_LIMIT = 3;

/**
 * Eine Zeile plus ihre Sortierschlüssel. Getrennt gehalten, damit die Regel
 * lesbar bleibt und `PrepEntry` nichts trägt, was nur zum Sortieren dient.
 */
interface RankedEntry {
  entry: PrepEntry;
  /** 0 = ohne Uhrzeit, 1 = mit. Ganztägiges gehört über die Termine des Tages. */
  rank: number;
  /** Minuten seit Mitternacht; für zeitlose Einträge belanglos. */
  minutes: number;
  /** Termin vor Aufgabe bei gleicher Uhrzeit — der Termin ist der feste Punkt. */
  kindRank: number;
}

/** „16:30:00" → 990. Postgres `time` kommt mit Sekunden, die Anzeige nicht. */
function minutesOfDay(dueTime: string): number {
  const [hours, minutes] = dueTime.split(":");
  return Number(hours) * 60 + Number(minutes);
}

function joinMeta(parts: (string | null | undefined)[]): string {
  return parts.filter((part): part is string => !!part).join(" · ");
}

function nameOf(people: readonly PrepPerson[], id: string | null): string | null {
  if (!id) return null;
  return people.find((person) => person.id === id)?.name ?? null;
}

function taskEntry(
  task: TaskWithType,
  { people, theme, t }: Pick<TomorrowPrepArgs, "people" | "theme" | "t">,
): RankedEntry {
  const type = task.task_types;
  return {
    entry: {
      key: `task-${task.id}`,
      kind: "task",
      id: task.id,
      title: task.title,
      meta: joinMeta([
        // Nur Stunde und Minute: die Sekunden aus dem Postgres-`time` sagen
        // über eine Fälligkeit nichts, und die Zeile ist schmal.
        task.due_time ? task.due_time.slice(0, 5) : null,
        nameOf(people, task.child_id),
        type ? t(taskTypeLabelKey(type.slug)) : null,
      ]),
      iconName: type ? taskIconFor(type.slug, type.icon) : "check-square",
      color: taskTypeColorFor(type?.color, theme),
    },
    rank: task.due_time ? 1 : 0,
    minutes: task.due_time ? minutesOfDay(task.due_time) : 0,
    kindRank: 1,
  };
}

function eventEntry(
  segment: DaySegment,
  { people, lang, t }: Pick<TomorrowPrepArgs, "people" | "lang" | "t">,
): RankedEntry {
  const { occurrence } = segment;
  // Dieselbe Regel wie in der Terminliste darüber: was durchläuft oder
  // ganztägig ist, hat keine Uhrzeit für *diesen* Tag und steht deshalb oben.
  const untimed = occurrence.allDay || !segment.isStart;
  return {
    entry: {
      key: `event-${occurrence.eventId}-${occurrence.occurrenceDate}`,
      kind: "event",
      id: occurrence.eventId,
      occurrenceDate: occurrence.occurrenceDate,
      title: occurrence.title,
      meta: joinMeta([
        segmentTimeLabel(segment, t),
        nameOf(people, occurrence.childId ?? occurrence.parentId),
        lang === "de" ? occurrence.type.labelDe : occurrence.type.labelEn,
      ]),
      iconName: occurrence.type.iconName,
      color: occurrence.type.color,
    },
    rank: untimed ? 0 : 1,
    minutes: untimed ? 0 : occurrence.startAt.getHours() * 60 + occurrence.startAt.getMinutes(),
    kindRank: 0,
  };
}

export function buildTomorrowPrep(args: TomorrowPrepArgs): TomorrowPrep {
  const { tasks, segments, date, limit = TOMORROW_PREP_LIMIT } = args;

  const ranked: RankedEntry[] = [
    ...tasks
      .filter((task) => !task.is_done && task.due_date === date)
      .map((task) => taskEntry(task, args)),
    ...segmentsForDay([...segments], date).map((segment) => eventEntry(segment, args)),
  ];

  ranked.sort(
    (a, b) =>
      a.rank - b.rank ||
      a.minutes - b.minutes ||
      a.kindRank - b.kindRank ||
      // Titel und Key brechen den Gleichstand, damit die Karte zwischen zwei
      // Renders nicht die Reihenfolge tauscht: weder die Aufgaben-Query noch
      // die Termin-Expansion garantiert eine, und beim Schnitt auf `limit`
      // entscheidet sie, welche Zeile verschwindet.
      a.entry.title.localeCompare(b.entry.title) ||
      a.entry.key.localeCompare(b.entry.key),
  );

  const hidden = ranked.slice(limit);
  return {
    visible: ranked.slice(0, limit).map((r) => r.entry),
    overflow: hidden.length,
    // Steckt im Rest eine Aufgabe, führt die Zeile in den Aufgaben-Tab: eine
    // Aufgabe ist das, was man abhaken kann, ein Termin nur das, was
    // stattfindet. Ohne Rest gibt es keine Zeile und damit kein Ziel — `null`
    // statt eines Vorgabewerts, den niemand je anspringt.
    overflowTarget: hidden.length
      ? hidden.some((r) => r.entry.kind === "task")
        ? "/aufgaben"
        : "/kalender"
      : null,
  };
}
