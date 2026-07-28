import { addDays, differenceInCalendarDays, format, startOfDay } from "date-fns";

import type { CalendarOccurrence, MarkedDates, MarkedDot, SpanBar } from "./types";

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

/** Bars per day before a span falls back into the dot row. */
const MAX_BARS = 2;
/** Dots per day, matching what `CalendarDay` renders. */
const MAX_DOTS = 3;

/**
 * Turns day segments into the marking objects the month grid consumes.
 *
 * Single-day events stay dots (deduplicated by type slug, as before), spans
 * become bars. The bar budget is deliberately small — beyond it a span drops
 * into the dot row rather than disappearing, so a busy day never silently
 * swallows an event.
 */
export function toDayMarkings(
  segments: DaySegment[],
  selectedDate: string,
  selectedColor: string,
): MarkedDates {
  const barsByDate = new Map<string, SpanBar[]>();
  const dotsByDate = new Map<string, Map<string, MarkedDot>>();

  const addDot = (date: string, occurrence: CalendarOccurrence) => {
    const forDay = dotsByDate.get(date) ?? new Map<string, MarkedDot>();
    if (!forDay.has(occurrence.type.slug)) {
      forDay.set(occurrence.type.slug, {
        key: occurrence.type.slug,
        color: occurrence.type.color,
      });
    }
    dotsByDate.set(date, forDay);
  };

  for (const segment of segments) {
    if (segment.total === 1) {
      addDot(segment.date, segment.occurrence);
      continue;
    }
    const forDay = barsByDate.get(segment.date) ?? [];
    if (forDay.length >= MAX_BARS) {
      addDot(segment.date, segment.occurrence);
      continue;
    }
    forDay.push({
      // Two occurrences of the same series can share a day once a span is
      // longer than its recurrence interval — the anchor date keeps keys unique.
      key: `${segment.occurrence.eventId}-${segment.occurrence.occurrenceDate}`,
      color: segment.occurrence.type.color,
      isStart: segment.isStart,
      isEnd: segment.isEnd,
    });
    barsByDate.set(segment.date, forDay);
  }

  const out: MarkedDates = {};
  const dates = new Set<string>();
  barsByDate.forEach((_, date) => dates.add(date));
  dotsByDate.forEach((_, date) => dates.add(date));
  dates.forEach((date) => {
    out[date] = {
      marked: true,
      bars: barsByDate.get(date),
      dots: Array.from(dotsByDate.get(date)?.values() ?? []).slice(0, MAX_DOTS),
    };
  });

  out[selectedDate] = { ...(out[selectedDate] ?? {}), selected: true, selectedColor };
  return out;
}
