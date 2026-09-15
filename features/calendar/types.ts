import type { IconName } from "@/app-sections/shared";
import type { Database } from "@/features/supabase/database.types";

/**
 * The master event's recurrence rule, carried on every occurrence so the edit
 * form can hydrate its editor without a second fetch. Identical for all
 * occurrences of a series — it describes the series, not the occurrence.
 */
export interface OccurrenceRrule {
  freq: Database["public"]["Enums"]["rrule_freq_enum"] | null;
  interval: number;
  byweekday: number[] | null;
  count: number | null;
  until: string | null;
}

export interface CalendarOccurrence {
  eventId: string;
  /**
   * Das Datum, das die **Regel** erzeugt hat, gebildet in `timezone` — der
   * Schlüssel von `event_exceptions.occurrence_date`.
   *
   * Ohne Override derselbe Instant wie `occurrenceDate`, aber nicht
   * zwangsläufig dasselbe Datum: Dieser Wert entsteht in `timezone`,
   * `occurrenceDate` in der Zone des Lesers, und beide sind nur gleich,
   * solange beide Zonen denselben Kalendertag sehen — fällt die Tagesgrenze
   * dazwischen, laufen sie trotz fehlenden Overrides auseinander (ADR-034
   * Decision 4). Verschiebt eine Exception die Occurrence zusätzlich auf
   * einen anderen Tag, fallen beide erst recht auseinander, und **dieser**
   * Wert benennt weiterhin die Zeile, die den Inhalt bestimmt. Alles, was
   * schreibt oder eine Exception meint, schlüsselt hierauf (ADR-034).
   */
  occurrenceKey: string;
  /**
   * Das **aufgelöste** Datum, in der Zone des Lesers — an welchem Tag dieser
   * Termin für ihn im Raster erscheint. Für Anzeige und Rasterplatzierung, nie
   * als Schlüssel.
   */
  occurrenceDate: string;
  /** Die Zone, in der die Wanduhrzeit dieses Termins gilt (`events.timezone`). */
  timezone: string;
  startAt: Date;
  endAt: Date;
  title: string;
  description: string | null;
  location: string | null;
  allDay: boolean;
  childId: string | null;
  parentId: string | null;
  isException: boolean;
  isRecurring: boolean;
  /**
   * Der Stand dieser Occurrence beim Laden — siehe `occurrenceVersion`. Das
   * Bearbeiten-Formular schickt ihn als `baseVersion` zurück, damit die
   * Mutation erkennt, ob jemand zwischenzeitlich geschrieben hat (ADR-031).
   */
  version: string;
  rrule: OccurrenceRrule;
  type: {
    slug: string;
    color: string;
    iconName: IconName;
    labelDe: string;
    labelEn: string;
  };
}

export interface MarkedDot {
  key: string;
  color: string;
}

/**
 * A multi-day event's slice on one day of the month grid. `isStart`/`isEnd`
 * round the matching edge; a bar that is neither reaches both cell edges flush
 * and therefore reads as "continues".
 */
export interface SpanBar {
  key: string;
  color: string;
  isStart: boolean;
  isEnd: boolean;
}

export type MarkedDates = Record<
  string,
  {
    dots?: MarkedDot[];
    /** Index is the lane: a `null` hole keeps the lanes below it aligned. */
    bars?: (SpanBar | null)[];
    marked?: boolean;
    selected?: boolean;
    selectedColor?: string;
  }
>;
