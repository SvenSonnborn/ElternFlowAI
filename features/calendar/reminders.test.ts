import { beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * `toggleReminder` has no logic worth testing apart from the query it builds —
 * which statement it picks, which columns it filters on, which conflict target
 * it upserts against. So this suite stubs the Supabase client and asserts on the
 * recorded call, rather than hiding the query behind an ops port the way
 * `recurrence.ts` does (a port would move the interesting part out of reach).
 */

interface QueryResult {
  data: unknown;
  error: unknown;
}

interface RecordedCall {
  table: string;
  op: "select" | "delete" | "upsert";
  payload?: unknown;
  options?: unknown;
  filters: [string, unknown][];
}

let calls: RecordedCall[] = [];
let result: QueryResult = { data: [], error: null };

/**
 * PostgREST builders are thenables, not promises — `await`ing one runs the
 * request. A `then` that resolves to the canned `result` is enough to stand in.
 */
function chain(call: RecordedCall) {
  const self = {
    eq(column: string, value: unknown) {
      call.filters.push([column, value]);
      return self;
    },
    then<T>(onFulfilled: (r: QueryResult) => T): Promise<T> {
      return Promise.resolve(result).then(onFulfilled);
    },
  };
  return self;
}

function record(call: RecordedCall) {
  calls.push(call);
  return chain(call);
}

const supabase = {
  from(table: string) {
    return {
      select: (columns: string) => record({ table, op: "select", payload: columns, filters: [] }),
      delete: () => record({ table, op: "delete", filters: [] }),
      upsert: (payload: unknown, options: unknown) =>
        record({ table, op: "upsert", payload, options, filters: [] }),
    };
  },
};

void mock.module("@/features/supabase", () => ({ supabase }));

// Imported after the module mock is installed: a static import would be hoisted
// above it and `reminders.ts` would capture the real client.
const { fetchEventReminderOffsets, toggleReminder, REMINDER_OFFSET_1H, REMINDER_OFFSET_24H } =
  await import("./reminders");

const EVENT_ID = "evt-1";
const FAMILY_ID = "fam-1";

function only(op: RecordedCall["op"]): RecordedCall {
  const matching = calls.filter((c) => c.op === op);
  expect(matching).toHaveLength(1);
  return matching[0];
}

beforeEach(() => {
  calls = [];
  result = { data: [], error: null };
});

describe("reminder offsets", () => {
  test("match the minutes the cron worker will read from offset_minutes", () => {
    expect(REMINDER_OFFSET_24H).toBe(1440);
    expect(REMINDER_OFFSET_1H).toBe(60);
  });
});

describe("toggleReminder — enabling", () => {
  test("upserts one row against the (event_id, offset_minutes) conflict target", async () => {
    await toggleReminder({
      eventId: EVENT_ID,
      familyId: FAMILY_ID,
      offsetMinutes: REMINDER_OFFSET_24H,
      enabled: true,
    });

    const call = only("upsert");
    expect(call.table).toBe("reminders");
    expect(call.payload).toEqual({
      event_id: EVENT_ID,
      family_id: FAMILY_ID,
      offset_minutes: REMINDER_OFFSET_24H,
    });
    // Must name both columns of `reminders_event_offset_uniq`; a mismatch makes
    // Postgres reject the upsert with 42P10 instead of merging.
    expect(call.options).toEqual({ onConflict: "event_id,offset_minutes" });
  });

  test("never deletes on the way in — a double-tap must not clear the row", async () => {
    await toggleReminder({
      eventId: EVENT_ID,
      familyId: FAMILY_ID,
      offsetMinutes: REMINDER_OFFSET_1H,
      enabled: true,
    });

    expect(calls.filter((c) => c.op === "delete")).toHaveLength(0);
  });

  test("rejects when the upsert fails, so the screen can revert the switch", () => {
    result = { data: null, error: new Error("42P10") };

    const promise = toggleReminder({
      eventId: EVENT_ID,
      familyId: FAMILY_ID,
      offsetMinutes: REMINDER_OFFSET_24H,
      enabled: true,
    });

    return expect(promise).rejects.toThrow("42P10");
  });
});

describe("toggleReminder — disabling", () => {
  test("filters the delete on the offset too, not just the event", async () => {
    await toggleReminder({
      eventId: EVENT_ID,
      familyId: FAMILY_ID,
      offsetMinutes: REMINDER_OFFSET_1H,
      enabled: false,
    });

    const call = only("delete");
    expect(call.table).toBe("reminders");
    // Dropping the offset filter would make switching off the 1 h reminder wipe
    // the 24 h one as well — the switches share one event.
    expect(call.filters).toEqual([
      ["event_id", EVENT_ID],
      ["offset_minutes", REMINDER_OFFSET_1H],
    ]);
  });

  test("never upserts on the way out", async () => {
    await toggleReminder({
      eventId: EVENT_ID,
      familyId: FAMILY_ID,
      offsetMinutes: REMINDER_OFFSET_24H,
      enabled: false,
    });

    expect(calls.filter((c) => c.op === "upsert")).toHaveLength(0);
  });

  test("rejects when the delete fails", () => {
    result = { data: null, error: new Error("delete failed") };

    const promise = toggleReminder({
      eventId: EVENT_ID,
      familyId: FAMILY_ID,
      offsetMinutes: REMINDER_OFFSET_1H,
      enabled: false,
    });

    return expect(promise).rejects.toThrow("delete failed");
  });
});

describe("fetchEventReminderOffsets", () => {
  test("selects the offsets of one event and flattens the rows", async () => {
    result = { data: [{ offset_minutes: 1440 }, { offset_minutes: 60 }], error: null };

    const offsets = await fetchEventReminderOffsets(EVENT_ID);

    expect(offsets).toEqual([1440, 60]);
    const call = only("select");
    expect(call.table).toBe("reminders");
    // Narrow on purpose: a widening to `*` would pull every column of every
    // reminder row across the wire for a list of two ints.
    expect(call.payload).toBe("offset_minutes");
    expect(call.filters).toEqual([["event_id", EVENT_ID]]);
  });

  test("treats a null payload as no reminders rather than crashing", async () => {
    result = { data: null, error: null };

    expect(await fetchEventReminderOffsets(EVENT_ID)).toEqual([]);
  });

  test("rejects on error instead of reporting 'no reminders'", () => {
    // The screen keys its locked state off this rejection; resolving to [] here
    // would render both switches as off and invite a toggle that overwrites
    // reminders the user actually has.
    result = { data: null, error: new Error("network") };

    return expect(fetchEventReminderOffsets(EVENT_ID)).rejects.toThrow("network");
  });
});
