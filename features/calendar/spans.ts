import { addDays, differenceInCalendarDays, format, startOfDay } from "date-fns";

import type { CalendarOccurrence } from "./types";

/**
 * One calendar day covered by an occurrence. A single-day event yields exactly
 * one segment, a three-day event yields three.
 *
 * `occurrence.occurrenceDate` stays the series anchor — it is the key behind
 * `event_exceptions.occurrence_date`, so routing and mutations must keep using
 * it. `date` is only the day this segment paints on.
 */
export interface DaySegment {
  occurrence: CalendarOccurrence;
  /** yyyy-MM-dd of the day this segment covers. */
  date: string;
  /** 0-based position inside the full span — absolute, not clipped to the window. */
  index: number;
  /** Length of the full span in calendar days. Always >= 1. */
  total: number;
  isStart: boolean;
  isEnd: boolean;
}

function isMidnight(d: Date): boolean {
  return (
    d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0
  );
}

/**
 * The last instant an occurrence actually occupies. Midnight is exclusive: an
 * event running 20:00–00:00 belongs to the day it started on, not to the next
 * one. All-day ranges end at 23:59 (see `toAllDayRange`) and never hit this.
 */
function lastCoveredInstant(startAt: Date, endAt: Date): Date {
  if (endAt.getTime() <= startAt.getTime()) return startAt;
  return isMidnight(endAt) ? new Date(endAt.getTime() - 1) : endAt;
}

/**
 * Fans occurrences out into one segment per covered calendar day, clipped to
 * `[rangeStart, rangeEnd]`.
 *
 * Clipping happens on the loop, not on the arithmetic: `index` and `total` stay
 * absolute so a partially visible span can still say "day 8 of 10", and a
 * mistyped end date in 2099 cannot flood the result.
 */
export function toDaySegments(
  occurrences: CalendarOccurrence[],
  rangeStart: Date,
  rangeEnd: Date,
): DaySegment[] {
  const windowStart = startOfDay(rangeStart);
  const windowEnd = startOfDay(rangeEnd);
  const out: DaySegment[] = [];

  for (const occurrence of occurrences) {
    const spanStart = startOfDay(occurrence.startAt);
    const spanEnd = startOfDay(lastCoveredInstant(occurrence.startAt, occurrence.endAt));
    const total = differenceInCalendarDays(spanEnd, spanStart) + 1;

    const from = spanStart < windowStart ? windowStart : spanStart;
    const to = spanEnd > windowEnd ? windowEnd : spanEnd;
    if (to < from) continue;

    const firstIndex = differenceInCalendarDays(from, spanStart);
    const lastIndex = differenceInCalendarDays(to, spanStart);
    for (let i = firstIndex; i <= lastIndex; i++) {
      out.push({
        occurrence,
        date: format(addDays(spanStart, i), "yyyy-MM-dd"),
        index: i,
        total,
        isStart: i === 0,
        isEnd: i === total - 1,
      });
    }
  }
  return out;
}
