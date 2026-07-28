import { describe, expect, mock, test } from "bun:test";

import type { Database } from "@/features/supabase/database.types";

import type { EventChanges, EventOps } from "./recurrence";

import { deleteEvent, updateEvent, type DeleteEventVars, type UpdateEventVars } from "./mutations";

type EventRow = Database["public"]["Tables"]["events"]["Row"];

const MASTER_START = new Date("2026-05-04T16:30:00.000Z");

function makeOps(): EventOps {
  return {
    cancelOccurrence: mock(() => Promise.resolve()),
    modifyOccurrence: mock(() => Promise.resolve()),
    deleteMaster: mock(() => Promise.resolve()),
    updateMaster: mock(() => Promise.resolve()),
    setRruleUntil: mock(() => Promise.resolve()),
    setRruleCount: mock(() => Promise.resolve()),
    deleteExceptionsFromDate: mock(() => Promise.resolve()),
    insertSplitEvent: mock(() => Promise.resolve()),
  };
}

function makeMaster(overrides: Partial<EventRow> = {}): EventRow {
  return {
    id: "evt-1",
    family_id: "fam-1",
    type_id: "type-1",
    child_id: null,
    parent_id: null,
    title: "Original",
    description: null,
    location: null,
    start_at: MASTER_START.toISOString(),
    end_at: new Date(MASTER_START.getTime() + 3600_000).toISOString(),
    all_day: false,
    rrule_freq: "weekly",
    rrule_interval: 1,
    rrule_byweekday: [1],
    rrule_until: null,
    rrule_count: null,
    created_by: null,
    created_at: "2026-05-01T00:00:00.000Z",
    updated_at: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

const CHANGES: EventChanges = {
  title: "Neuer Titel",
  start_at: "2026-06-15T15:00:00.000Z",
  end_at: "2026-06-15T16:00:00.000Z",
  location: null,
  description: null,
};

const BASE_VARS: UpdateEventVars = {
  scope: "all",
  eventId: "evt-1",
  occurrenceDate: "2026-06-15",
  isRecurring: true,
  changes: CHANGES,
};

describe("updateEvent", () => {
  test("scope=forward on recurring → uses refetched master for insertSplitEvent", async () => {
    const master = makeMaster();
    const fetchMaster = mock((_id: string) => Promise.resolve(master));
    const ops = makeOps();

    await updateEvent({ ...BASE_VARS, scope: "forward" }, { fetchMaster, ops });

    expect(fetchMaster).toHaveBeenCalledWith("evt-1");
    expect(ops.setRruleUntil).toHaveBeenCalledWith("evt-1", "2026-06-14");
    expect(ops.insertSplitEvent).toHaveBeenCalledWith(master, CHANGES, null);
    expect(ops.deleteExceptionsFromDate).toHaveBeenCalledWith("evt-1", "2026-06-15");
  });

  test("scope=forward on a count-series uses the refetched count for the split", async () => {
    const master = makeMaster({ rrule_count: 10 });
    const fetchMaster = mock((_id: string) => Promise.resolve(master));
    const ops = makeOps();

    await updateEvent({ ...BASE_VARS, scope: "forward" }, { fetchMaster, ops });

    expect(ops.setRruleCount).toHaveBeenCalledWith("evt-1", 6);
    expect(ops.insertSplitEvent).toHaveBeenCalledWith(master, CHANGES, 4);
    expect(ops.setRruleUntil).not.toHaveBeenCalled();
  });

  test("throws when fetchMaster returns null", async () => {
    const fetchMaster = mock((_id: string) => Promise.resolve(null));
    const ops = makeOps();

    // eslint-disable-next-line @typescript-eslint/await-thenable -- bun:test .rejects chain is not typed as Promise in @types/bun
    await expect(updateEvent(BASE_VARS, { fetchMaster, ops })).rejects.toThrow(
      /Event evt-1 not found/,
    );
    expect(ops.updateMaster).not.toHaveBeenCalled();
  });
});

const DELETE_VARS: DeleteEventVars = {
  scope: "all",
  eventId: "evt-1",
  occurrenceDate: "2026-06-15",
  isRecurring: true,
};

describe("deleteEvent", () => {
  test("scope=forward on a count-series shrinks the count instead of writing until", async () => {
    const fetchMaster = mock((_id: string) => Promise.resolve(makeMaster({ rrule_count: 10 })));
    const ops = makeOps();

    await deleteEvent({ ...DELETE_VARS, scope: "forward" }, { fetchMaster, ops });

    expect(fetchMaster).toHaveBeenCalledWith("evt-1");
    expect(ops.setRruleCount).toHaveBeenCalledWith("evt-1", 6);
    expect(ops.setRruleUntil).not.toHaveBeenCalled();
    expect(ops.deleteMaster).not.toHaveBeenCalled();
  });

  test("scope=forward on an unbounded series still writes until", async () => {
    const fetchMaster = mock((_id: string) => Promise.resolve(makeMaster()));
    const ops = makeOps();

    await deleteEvent({ ...DELETE_VARS, scope: "forward" }, { fetchMaster, ops });

    expect(ops.setRruleUntil).toHaveBeenCalledWith("evt-1", "2026-06-14");
    expect(ops.setRruleCount).not.toHaveBeenCalled();
  });

  test("throws when fetchMaster returns null", async () => {
    const fetchMaster = mock((_id: string) => Promise.resolve(null));
    const ops = makeOps();

    // eslint-disable-next-line @typescript-eslint/await-thenable -- bun:test .rejects chain is not typed as Promise in @types/bun
    await expect(deleteEvent(DELETE_VARS, { fetchMaster, ops })).rejects.toThrow(
      /Event evt-1 not found/,
    );
    expect(ops.deleteMaster).not.toHaveBeenCalled();
  });
});
