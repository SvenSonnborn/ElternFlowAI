import { describe, expect, mock, test } from "bun:test";

import type { Database } from "@/features/supabase/database.types";

import type { EventChanges, EventOps } from "./recurrence";

import { updateEvent, type UpdateEventDeps, type UpdateEventVars } from "./mutations";

type EventRow = Database["public"]["Tables"]["events"]["Row"];

const MASTER_START = new Date("2026-05-04T16:30:00.000Z");

function makeOps(): EventOps {
  return {
    cancelOccurrence: mock(() => Promise.resolve()),
    modifyOccurrence: mock(() => Promise.resolve()),
    deleteMaster: mock(() => Promise.resolve()),
    updateMaster: mock(() => Promise.resolve()),
    setRruleUntil: mock(() => Promise.resolve()),
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
  test("scope=all → fetches master and calls updateMaster", async () => {
    const master = makeMaster();
    const fetchMaster = mock((_id: string) => Promise.resolve(master));
    const ops = makeOps();
    const deps: UpdateEventDeps = { fetchMaster, ops };

    await updateEvent(BASE_VARS, deps);

    expect(fetchMaster).toHaveBeenCalledWith("evt-1");
    expect(ops.updateMaster).toHaveBeenCalledWith("evt-1", CHANGES);
  });

  test("scope=forward on recurring → uses refetched master for insertSplitEvent", async () => {
    const master = makeMaster();
    const fetchMaster = mock((_id: string) => Promise.resolve(master));
    const ops = makeOps();

    await updateEvent({ ...BASE_VARS, scope: "forward" }, { fetchMaster, ops });

    expect(fetchMaster).toHaveBeenCalledWith("evt-1");
    expect(ops.setRruleUntil).toHaveBeenCalledWith("evt-1", "2026-06-14");
    expect(ops.insertSplitEvent).toHaveBeenCalledWith(master, CHANGES);
    expect(ops.deleteExceptionsFromDate).toHaveBeenCalledWith("evt-1", "2026-06-15");
  });

  test("throws when fetchMaster returns null", async () => {
    const fetchMaster = mock((_id: string) => Promise.resolve(null));
    const ops = makeOps();

    await expect(updateEvent(BASE_VARS, { fetchMaster, ops })).rejects.toThrow(
      /Event evt-1 not found/,
    );
    expect(ops.updateMaster).not.toHaveBeenCalled();
  });

  test("scope=this on non-recurring → still refetches master then updateMaster", async () => {
    const master = makeMaster({ rrule_freq: null });
    const fetchMaster = mock((_id: string) => Promise.resolve(master));
    const ops = makeOps();

    await updateEvent({ ...BASE_VARS, scope: "this", isRecurring: false }, { fetchMaster, ops });

    expect(fetchMaster).toHaveBeenCalledWith("evt-1");
    expect(ops.updateMaster).toHaveBeenCalledWith("evt-1", CHANGES);
  });
});
