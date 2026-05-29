import { describe, expect, mock, test } from "bun:test";

import { applyDeleteScope, type EventOps } from "./recurrence";

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
});
