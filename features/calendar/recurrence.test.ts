import { describe, expect, mock, test } from "bun:test";

import type { Database } from "@/features/supabase/database.types";

import { applyDeleteScope, applyEditScope, type EventChanges, type EventOps } from "./recurrence";

type EventRow = Database["public"]["Tables"]["events"]["Row"];

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

const MASTER_START = new Date("2026-05-04T16:30:00.000Z");

describe("applyDeleteScope", () => {
  test("scope=this on recurring → cancelOccurrence", async () => {
    const ops = makeOps();
    await applyDeleteScope({
      ops,
      scope: "this",
      eventId: "evt-1",
      occurrenceDate: "2026-05-11",
      isRecurring: true,
      masterStartAt: MASTER_START,
    });
    expect(ops.cancelOccurrence).toHaveBeenCalledWith("evt-1", "2026-05-11");
    expect(ops.deleteMaster).not.toHaveBeenCalled();
  });

  test("scope=this on single event → deleteMaster", async () => {
    const ops = makeOps();
    await applyDeleteScope({
      ops,
      scope: "this",
      eventId: "evt-1",
      occurrenceDate: "2026-05-04",
      isRecurring: false,
      masterStartAt: MASTER_START,
    });
    expect(ops.deleteMaster).toHaveBeenCalledWith("evt-1");
    expect(ops.cancelOccurrence).not.toHaveBeenCalled();
  });

  test("scope=forward → setRruleUntil(day-before) + deleteExceptionsFromDate", async () => {
    const ops = makeOps();
    await applyDeleteScope({
      ops,
      scope: "forward",
      eventId: "evt-1",
      occurrenceDate: "2026-06-15",
      isRecurring: true,
      masterStartAt: MASTER_START,
    });
    expect(ops.setRruleUntil).toHaveBeenCalledWith("evt-1", "2026-06-14");
    expect(ops.deleteExceptionsFromDate).toHaveBeenCalledWith("evt-1", "2026-06-15");
    expect(ops.deleteMaster).not.toHaveBeenCalled();
  });

  test("scope=forward with cutoff < dtstart → behaves like all (deleteMaster)", async () => {
    const ops = makeOps();
    await applyDeleteScope({
      ops,
      scope: "forward",
      eventId: "evt-1",
      occurrenceDate: "2026-05-01",
      isRecurring: true,
      masterStartAt: MASTER_START,
    });
    expect(ops.deleteMaster).toHaveBeenCalledWith("evt-1");
    expect(ops.setRruleUntil).not.toHaveBeenCalled();
  });

  test("scope=all → deleteMaster", async () => {
    const ops = makeOps();
    await applyDeleteScope({
      ops,
      scope: "all",
      eventId: "evt-1",
      occurrenceDate: "2026-05-11",
      isRecurring: true,
      masterStartAt: MASTER_START,
    });
    expect(ops.deleteMaster).toHaveBeenCalledWith("evt-1");
  });

  test("scope=forward on non-recurring event → deleteMaster (no rrule ops)", async () => {
    const ops = makeOps();
    await applyDeleteScope({
      ops,
      scope: "forward",
      eventId: "evt-1",
      occurrenceDate: "2026-05-11",
      isRecurring: false,
      masterStartAt: MASTER_START,
    });
    expect(ops.deleteMaster).toHaveBeenCalledWith("evt-1");
    expect(ops.setRruleUntil).not.toHaveBeenCalled();
    expect(ops.deleteExceptionsFromDate).not.toHaveBeenCalled();
  });
});

const CHANGES: EventChanges = {
  title: "Neuer Titel",
  start_at: "2026-06-15T15:00:00.000Z",
  end_at: "2026-06-15T16:00:00.000Z",
  location: "Sportplatz Nord",
  description: null,
};

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

describe("applyEditScope", () => {
  test("scope=this on recurring → modifyOccurrence with full override", async () => {
    const ops = makeOps();
    await applyEditScope({
      ops,
      scope: "this",
      eventId: "evt-1",
      occurrenceDate: "2026-06-15",
      isRecurring: true,
      master: makeMaster(),
      changes: CHANGES,
    });
    expect(ops.modifyOccurrence).toHaveBeenCalledWith("evt-1", "2026-06-15", CHANGES);
    expect(ops.updateMaster).not.toHaveBeenCalled();
  });

  test("scope=this on single → updateMaster", async () => {
    const ops = makeOps();
    await applyEditScope({
      ops,
      scope: "this",
      eventId: "evt-1",
      occurrenceDate: "2026-05-04",
      isRecurring: false,
      master: makeMaster({ rrule_freq: null }),
      changes: CHANGES,
    });
    expect(ops.updateMaster).toHaveBeenCalledWith("evt-1", CHANGES);
  });

  test("scope=all → updateMaster", async () => {
    const ops = makeOps();
    await applyEditScope({
      ops,
      scope: "all",
      eventId: "evt-1",
      occurrenceDate: "2026-06-15",
      isRecurring: true,
      master: makeMaster(),
      changes: CHANGES,
    });
    expect(ops.updateMaster).toHaveBeenCalledWith("evt-1", CHANGES);
    expect(ops.insertSplitEvent).not.toHaveBeenCalled();
  });

  test("scope=forward → setRruleUntil + insertSplitEvent + deleteExceptionsFromDate", async () => {
    const ops = makeOps();
    const master = makeMaster();
    await applyEditScope({
      ops,
      scope: "forward",
      eventId: "evt-1",
      occurrenceDate: "2026-06-15",
      isRecurring: true,
      master,
      changes: CHANGES,
    });
    expect(ops.setRruleUntil).toHaveBeenCalledWith("evt-1", "2026-06-14");
    expect(ops.insertSplitEvent).toHaveBeenCalledWith(master, CHANGES);
    expect(ops.deleteExceptionsFromDate).toHaveBeenCalledWith("evt-1", "2026-06-15");
    expect(ops.updateMaster).not.toHaveBeenCalled();
  });

  test("scope=forward with cutoff < dtstart → updateMaster (no split)", async () => {
    const ops = makeOps();
    await applyEditScope({
      ops,
      scope: "forward",
      eventId: "evt-1",
      occurrenceDate: "2026-05-01",
      isRecurring: true,
      master: makeMaster(),
      changes: CHANGES,
    });
    expect(ops.updateMaster).toHaveBeenCalledWith("evt-1", CHANGES);
    expect(ops.insertSplitEvent).not.toHaveBeenCalled();
  });

  test("scope=forward on non-recurring event → updateMaster (no split)", async () => {
    const ops = makeOps();
    await applyEditScope({
      ops,
      scope: "forward",
      eventId: "evt-1",
      occurrenceDate: "2026-06-15",
      isRecurring: false,
      master: makeMaster({ rrule_freq: null }),
      changes: CHANGES,
    });
    expect(ops.updateMaster).toHaveBeenCalledWith("evt-1", CHANGES);
    expect(ops.insertSplitEvent).not.toHaveBeenCalled();
    expect(ops.setRruleUntil).not.toHaveBeenCalled();
  });
});
