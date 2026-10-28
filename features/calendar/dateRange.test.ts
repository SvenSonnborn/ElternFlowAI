import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { set, startOfDay } from "date-fns";

import {
  applyRangePick,
  isDateRangeInvalid,
  isMultiDay,
  isTimeRangeInvalid,
  rangeFieldLabelKey,
  toAllDayRange,
  type DateRange,
} from "./dateRange";

/** 2026-06-03 is a Wednesday. Local times — the pickers hand back local Dates. */
function makeRange(startIso: string, endIso: string): DateRange {
  return { startAt: new Date(startIso), endAt: new Date(endIso) };
}

describe("applyRangePick", () => {
  test("startDate keeps the start time and drags the end date by the same span", () => {
    const range = makeRange("2026-06-03T09:00:00", "2026-06-05T17:00:00");
    const next = applyRangePick(range, "startDate", new Date("2026-06-10T00:00:00"));
    expect(next.startAt.toISOString()).toBe(new Date("2026-06-10T09:00:00").toISOString());
    // 2-day span survives the move.
    expect(next.endAt.toISOString()).toBe(new Date("2026-06-12T17:00:00").toISOString());
  });

  test("startDate on a same-day range leaves the end date on the new day", () => {
    const range = makeRange("2026-06-03T09:00:00", "2026-06-03T10:00:00");
    const next = applyRangePick(range, "startDate", new Date("2026-06-10T00:00:00"));
    expect(next.endAt.toISOString()).toBe(new Date("2026-06-10T10:00:00").toISOString());
  });

  test("endDate moves only the end, keeping its time", () => {
    const range = makeRange("2026-06-03T09:00:00", "2026-06-03T10:00:00");
    const next = applyRangePick(range, "endDate", new Date("2026-06-06T23:12:00"));
    expect(next.startAt).toEqual(range.startAt);
    expect(next.endAt.toISOString()).toBe(new Date("2026-06-06T10:00:00").toISOString());
  });

  test("startTime keeps the start date", () => {
    const range = makeRange("2026-06-03T09:00:00", "2026-06-05T17:00:00");
    const next = applyRangePick(range, "startTime", new Date("2000-01-01T07:30:00"));
    expect(next.startAt.toISOString()).toBe(new Date("2026-06-03T07:30:00").toISOString());
    expect(next.endAt).toEqual(range.endAt);
  });

  test("endTime keeps the end date", () => {
    const range = makeRange("2026-06-03T09:00:00", "2026-06-05T17:00:00");
    const next = applyRangePick(range, "endTime", new Date("2000-01-01T18:45:00"));
    expect(next.endAt.toISOString()).toBe(new Date("2026-06-05T18:45:00").toISOString());
    expect(next.startAt).toEqual(range.startAt);
  });
});

describe("range validation", () => {
  test("end day before start day is a date error", () => {
    expect(isDateRangeInvalid(makeRange("2026-06-03T09:00:00", "2026-06-02T23:00:00"))).toBe(true);
    expect(isDateRangeInvalid(makeRange("2026-06-03T09:00:00", "2026-06-03T08:00:00"))).toBe(false);
  });

  test("timed range must end after it starts", () => {
    expect(isTimeRangeInvalid(makeRange("2026-06-03T09:00:00", "2026-06-03T09:00:00"), false)).toBe(
      true,
    );
    expect(isTimeRangeInvalid(makeRange("2026-06-03T09:00:00", "2026-06-05T08:00:00"), false)).toBe(
      false,
    );
  });

  test("all-day ranges skip the time check — their times are synthetic", () => {
    expect(isTimeRangeInvalid(makeRange("2026-06-03T00:00:00", "2026-06-03T00:00:00"), true)).toBe(
      false,
    );
  });
});

describe("toAllDayRange", () => {
  test("widens to 00:00 on the first day and 23:59 on the last", () => {
    const next = toAllDayRange(makeRange("2026-06-03T09:00:00", "2026-06-05T17:00:00"), "Etc/UTC");
    expect(next.startAt.toISOString()).toBe(new Date("2026-06-03T00:00:00").toISOString());
    expect(next.endAt.toISOString()).toBe(new Date("2026-06-05T23:59:00").toISOString());
  });

  const cases: [string, [string, string], string, [string, string]][] = [
    [
      "unverändert gespeichert bleibt bit-genau",
      ["2026-06-14T22:00:00.000Z", "2026-06-15T21:59:00.000Z"],
      "Europe/Berlin",
      ["2026-06-14T22:00:00.000Z", "2026-06-15T21:59:00.000Z"],
    ],
    [
      "aus Uhrzeiten wird der Tag in der Zone des Termins",
      ["2026-06-15T07:30:00.000Z", "2026-06-15T09:00:00.000Z"],
      "Europe/Berlin",
      ["2026-06-14T22:00:00.000Z", "2026-06-15T21:59:00.000Z"],
    ],
    [
      "Tokio",
      ["2026-06-14T20:00:00.000Z", "2026-06-14T21:00:00.000Z"],
      "Asia/Tokyo",
      ["2026-06-14T15:00:00.000Z", "2026-06-15T14:59:00.000Z"],
    ],
    [
      "Sommerzeit um Mitternacht",
      ["2026-09-06T15:00:00.000Z", "2026-09-06T16:00:00.000Z"],
      "America/Santiago",
      ["2026-09-06T04:00:00.000Z", "2026-09-07T02:59:00.000Z"],
    ],
    [
      "um 6 Tage verschoben bleibt 6 Tage verschoben",
      ["2026-06-20T22:00:00.000Z", "2026-06-21T21:59:00.000Z"],
      "Europe/Berlin",
      ["2026-06-20T22:00:00.000Z", "2026-06-21T21:59:00.000Z"],
    ],
  ];
  test.each(cases)("%s", (_name, [start, end], zone, [wantStart, wantEnd]) => {
    const next = toAllDayRange({ startAt: new Date(start), endAt: new Date(end) }, zone);
    expect(next.startAt.toISOString()).toBe(wantStart);
    expect(next.endAt.toISOString()).toBe(wantEnd);
  });
});

describe("toAllDayRange auf einem Gerät in Europe/Berlin", () => {
  const previousTZ = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "Europe/Berlin";
  });
  afterAll(() => {
    process.env.TZ = previousTZ ?? "Etc/UTC";
  });

  test("Gerätezone wie bisher", () => {
    const r = { startAt: new Date(2026, 5, 15, 9, 30), endAt: new Date(2026, 5, 15, 11, 0) };
    const next = toAllDayRange(r, "Europe/Berlin");
    expect(next.startAt.toISOString()).toBe(startOfDay(r.startAt).toISOString());
    expect(next.endAt.toISOString()).toBe(
      set(r.endAt, { hours: 23, minutes: 59, seconds: 0, milliseconds: 0 }).toISOString(),
    );
  });
});

describe("isMultiDay", () => {
  test("true only once the end falls on a later calendar day", () => {
    expect(isMultiDay(makeRange("2026-06-03T09:00:00", "2026-06-03T23:59:00"))).toBe(false);
    expect(isMultiDay(makeRange("2026-06-03T23:00:00", "2026-06-04T01:00:00"))).toBe(true);
  });
});

describe("rangeFieldLabelKey", () => {
  test("names each of the four pickers distinctly", () => {
    const keys = (["startDate", "endDate", "startTime", "endTime"] as const).map(
      rangeFieldLabelKey,
    );
    expect(keys).toEqual([
      "cal.edit.fieldStartDate",
      "cal.edit.fieldEndDate",
      "cal.edit.fieldStart",
      "cal.edit.fieldEnd",
    ]);
    // A screen reader can only tell the four pickers apart if the keys do.
    expect(new Set(keys).size).toBe(4);
  });
});
