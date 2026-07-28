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
  occurrenceDate: string;
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

export type MarkedDates = Record<
  string,
  {
    dots?: MarkedDot[];
    marked?: boolean;
    selected?: boolean;
    selectedColor?: string;
  }
>;
