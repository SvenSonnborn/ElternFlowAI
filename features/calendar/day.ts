import type { TFunction } from "i18next";

import { format } from "date-fns";

import type { DaySegment } from "./spans";

/**
 * Something running all day belongs above the day's appointments, not at the
 * position of a start time that may be days in the past.
 */
function rank(segment: DaySegment): number {
  return segment.occurrence.allDay || !segment.isStart ? 0 : 1;
}

/**
 * The segments painting on one day, in reading order.
 *
 * Filter before sort, so the caller's memoized array keeps its own order — the
 * month grid reads the same instance.
 */
export function segmentsForDay(segments: DaySegment[], date: string): DaySegment[] {
  return segments
    .filter((segment) => segment.date === date)
    .sort(
      (a, b) =>
        rank(a) - rank(b) || a.occurrence.startAt.getTime() - b.occurrence.startAt.getTime(),
    );
}

/**
 * What the time column says for one segment.
 *
 * It answers "what happens on THIS day", not "when did the series start" — a
 * continuation day showing 09:00 would simply be wrong.
 *
 * `t` comes in as a parameter rather than from a hook, so the rule stays pure
 * and testable and both screens read it from here instead of restating it.
 */
export function segmentTimeLabel(segment: DaySegment, t: TFunction): string {
  const { occurrence, isStart, isEnd } = segment;
  if (occurrence.allDay) return t("cal.span.allDay");
  if (isStart && isEnd) return format(occurrence.startAt, "HH:mm");
  if (isStart) return t("cal.span.from", { time: format(occurrence.startAt, "HH:mm") });
  if (isEnd) return t("cal.span.until", { time: format(occurrence.endAt, "HH:mm") });
  return t("cal.span.through");
}
