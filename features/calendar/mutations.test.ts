import { describe, expect, mock, test } from "bun:test";

import type { Database } from "@/features/supabase/database.types";

import type { EventWithRelations } from "./expand";
import type { EventChanges, EventOps } from "./recurrence";

import { EventConflictError } from "./errors";
import { deleteEvent, updateEvent, type DeleteEventVars, type UpdateEventVars } from "./mutations";

type EventRow = Database["public"]["Tables"]["events"]["Row"];

const MASTER_START = new Date("2026-05-04T16:30:00.000Z");

// Der Stempel, den `makeMaster` trägt. `occurrenceVersion` hängt "|-" an, weil
// die Fixture keine Exceptions führt.
const MASTER_UPDATED_AT = "2026-05-01T00:00:00.000Z";
const MASTER_VERSION = `${MASTER_UPDATED_AT}|-`;

function makeOps(): EventOps {
  return {
    cancelOccurrence: mock(() => Promise.resolve()),
    modifyOccurrence: mock(() => Promise.resolve()),
    deleteMaster: mock(() => Promise.resolve()),
    updateMaster: mock(() => Promise.resolve()),
    setRruleUntil: mock(() => Promise.resolve()),
    setRruleCount: mock(() => Promise.resolve()),
    deleteExceptionsFromDate: mock(() => Promise.resolve()),
    deleteAllExceptions: mock(() => Promise.resolve()),
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
    timezone: "Europe/Berlin",
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

function makeRelations(overrides: Partial<EventRow> = {}): EventWithRelations {
  return { ...makeMaster(overrides), event_types: null, event_exceptions: null };
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
  baseVersion: MASTER_VERSION,
};

describe("updateEvent", () => {
  test("scope=forward on recurring → uses refetched master for insertSplitEvent", async () => {
    const master = makeRelations();
    const fetchMaster = mock((_id: string) => Promise.resolve(master));
    const ops = makeOps();

    await updateEvent({ ...BASE_VARS, scope: "forward" }, { fetchMaster, ops });

    expect(fetchMaster).toHaveBeenCalledWith("evt-1");
    expect(ops.setRruleUntil).toHaveBeenCalledWith("evt-1", "2026-06-14T21:59:59.999Z");
    expect(ops.insertSplitEvent).toHaveBeenCalledWith(master, CHANGES, null);
    expect(ops.deleteExceptionsFromDate).toHaveBeenCalledWith("evt-1", "2026-06-15");
  });

  test("scope=forward on a count-series uses the refetched count for the split", async () => {
    const master = makeRelations({ rrule_count: 10 });
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

  test("wirft EventConflictError, wenn die Version abweicht", async () => {
    const master = makeRelations({ updated_at: "2026-05-02T00:00:00.000Z" });
    const fetchMaster = mock((_id: string) => Promise.resolve(master));
    const ops = makeOps();

    // eslint-disable-next-line @typescript-eslint/await-thenable -- bun:test .rejects chain is not typed as Promise in @types/bun
    await expect(updateEvent(BASE_VARS, { fetchMaster, ops })).rejects.toBeInstanceOf(
      EventConflictError,
    );
    expect(ops.updateMaster).not.toHaveBeenCalled();
  });

  test("der Konflikt trägt die fremde Fassung mit", async () => {
    const master = makeRelations({ updated_at: "2026-05-02T00:00:00.000Z", title: "Fremd" });
    const fetchMaster = mock((_id: string) => Promise.resolve(master));

    const error = await updateEvent(BASE_VARS, { fetchMaster, ops: makeOps() }).catch(
      (err: unknown) => err,
    );

    expect(error).toBeInstanceOf(EventConflictError);
    expect((error as EventConflictError).row?.title).toBe("Fremd");
  });

  test("eine fremde Exception an DIESEM Datum ist ein Konflikt", async () => {
    const master = makeRelations();
    master.event_exceptions = [
      {
        id: "ex-1",
        event_id: "evt-1",
        occurrence_date: "2026-06-15",
        action: "modified",
        override: null,
        created_at: "2026-05-01T00:00:00.000Z",
        updated_at: "2026-05-03T00:00:00.000Z",
      },
    ];
    const fetchMaster = mock((_id: string) => Promise.resolve(master));
    const ops = makeOps();

    // eslint-disable-next-line @typescript-eslint/await-thenable -- bun:test .rejects chain is not typed as Promise in @types/bun
    await expect(updateEvent(BASE_VARS, { fetchMaster, ops })).rejects.toBeInstanceOf(
      EventConflictError,
    );
  });

  test("der Existenz-Check kommt vor dem Versions-Check", async () => {
    // Ein gelöschter Termin ist „weg", nicht „geändert" — die Meldungen sind
    // verschieden, und eine fehlende Zeile hat gar keine Version.
    const fetchMaster = mock((_id: string) => Promise.resolve(null));

    // eslint-disable-next-line @typescript-eslint/await-thenable -- bun:test .rejects chain is not typed as Promise in @types/bun
    await expect(updateEvent(BASE_VARS, { fetchMaster, ops: makeOps() })).rejects.toThrow(
      /Event evt-1 not found/,
    );
  });
});

const DELETE_VARS: DeleteEventVars = {
  scope: "all",
  eventId: "evt-1",
  occurrenceDate: "2026-06-15",
  isRecurring: true,
  baseVersion: MASTER_VERSION,
};

describe("deleteEvent", () => {
  test("scope=forward on a count-series shrinks the count instead of writing until", async () => {
    const fetchMaster = mock((_id: string) => Promise.resolve(makeRelations({ rrule_count: 10 })));
    const ops = makeOps();

    await deleteEvent({ ...DELETE_VARS, scope: "forward" }, { fetchMaster, ops });

    expect(fetchMaster).toHaveBeenCalledWith("evt-1");
    expect(ops.setRruleCount).toHaveBeenCalledWith("evt-1", 6);
    expect(ops.setRruleUntil).not.toHaveBeenCalled();
    expect(ops.deleteMaster).not.toHaveBeenCalled();
  });

  test("scope=forward on an unbounded series still writes until", async () => {
    const fetchMaster = mock((_id: string) => Promise.resolve(makeRelations()));
    const ops = makeOps();

    await deleteEvent({ ...DELETE_VARS, scope: "forward" }, { fetchMaster, ops });

    expect(ops.setRruleUntil).toHaveBeenCalledWith("evt-1", "2026-06-14T21:59:59.999Z");
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

  test("wirft EventConflictError, wenn die Version abweicht", async () => {
    const fetchMaster = mock((_id: string) =>
      Promise.resolve(makeRelations({ updated_at: "2026-05-02T00:00:00.000Z" })),
    );
    const ops = makeOps();

    // eslint-disable-next-line @typescript-eslint/await-thenable -- bun:test .rejects chain is not typed as Promise in @types/bun
    await expect(deleteEvent(DELETE_VARS, { fetchMaster, ops })).rejects.toBeInstanceOf(
      EventConflictError,
    );
    expect(ops.deleteMaster).not.toHaveBeenCalled();
  });
});
