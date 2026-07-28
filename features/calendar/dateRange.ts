import { addDays, differenceInCalendarDays, set, startOfDay } from "date-fns";

/** The four pickers a start/end range exposes in the create and edit forms. */
export type RangeField = "startDate" | "endDate" | "startTime" | "endTime";

export interface DateRange {
  startAt: Date;
  endAt: Date;
}

function mergeDateAndTime(date: Date, time: Date): Date {
  return set(date, {
    hours: time.getHours(),
    minutes: time.getMinutes(),
    seconds: 0,
    milliseconds: 0,
  });
}

/**
 * Applies a single picker selection to a range.
 *
 * Moving the start date drags the end date along by the same number of calendar
 * days, so a multi-day event keeps its span when it is rescheduled instead of
 * silently collapsing back to a single day.
 */
export function applyRangePick(range: DateRange, field: RangeField, selected: Date): DateRange {
  switch (field) {
    case "startDate": {
      const startAt = mergeDateAndTime(selected, range.startAt);
      const shiftDays = differenceInCalendarDays(startAt, range.startAt);
      return { startAt, endAt: shiftDays === 0 ? range.endAt : addDays(range.endAt, shiftDays) };
    }
    case "endDate":
      return { ...range, endAt: mergeDateAndTime(selected, range.endAt) };
    case "startTime":
      return { ...range, startAt: mergeDateAndTime(range.startAt, selected) };
    case "endTime":
      return { ...range, endAt: mergeDateAndTime(range.endAt, selected) };
  }
}

/** The end day falls before the start day — invalid whatever the times say. */
export function isDateRangeInvalid(range: DateRange): boolean {
  return startOfDay(range.endAt) < startOfDay(range.startAt);
}

/**
 * A timed event that ends at or before it starts. All-day events carry
 * synthetic 00:00/23:59 times, so only `isDateRangeInvalid` applies to them.
 */
export function isTimeRangeInvalid(range: DateRange, allDay: boolean): boolean {
  if (allDay) return false;
  return range.endAt.getTime() <= range.startAt.getTime();
}

/** Widens a range to whole days, for events flagged all-day. */
export function toAllDayRange(range: DateRange): DateRange {
  return {
    startAt: startOfDay(range.startAt),
    endAt: set(range.endAt, { hours: 23, minutes: 59, seconds: 0, milliseconds: 0 }),
  };
}

/** True when the range covers more than the one calendar day it starts on. */
export function isMultiDay(range: DateRange): boolean {
  return differenceInCalendarDays(range.endAt, range.startAt) > 0;
}
