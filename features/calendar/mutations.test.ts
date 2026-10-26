import { describe, expect, mock, test } from "bun:test";

import type { Database } from "@/features/supabase/database.types";

import type { ApplyEventChange } from "./eventChange";
import type { EventWithRelations } from "./expand";
import type { EventChanges } from "./recurrence";

import { EventConflictError, EventNotFoundError } from "./errors";
import { deleteEvent, updateEvent, type DeleteEventVars, type UpdateEventVars } from "./mutations";

type EventRow = Database["public"]["Tables"]["events"]["Row"];

const MASTER_START = new Date("2026-05-04T16:30:00.000Z");

// Der Stempel, den `makeMaster` trägt. `occurrenceVersion` hängt "|-" an, weil
// die Fixture keine Exceptions führt.
const MASTER_UPDATED_AT = "2026-05-01T00:00:00.000Z";
const MASTER_VERSION = `${MASTER_UPDATED_AT}|-`;

const REQUEST_ID = "6f1c3c1e-0b7a-4a43-9d2a-7f5d0c9e1a11";

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
    updated_at: MASTER_UPDATED_AT,
    ...overrides,
  };
}

function makeRelations(overrides: Partial<EventRow> = {}): EventWithRelations {
  return { ...makeMaster(overrides), event_types: null, event_exceptions: null };
}

/**
 * Ein PostgREST-Fehler, wie `createSupabaseApplyEventChange` ihn weiterwirft —
 * ein `Error` mit SQLSTATE in `code`, wie `PostgrestError` aus supabase-js.
 */
function pgError(code: string, details: string | null = null) {
  return Object.assign(new Error(`apply_event_change: ${code}`), { code, details, hint: null });
}

/** `applyChange`, der antwortet wie die RPC — oder mit dem übergebenen Fehler. */
function makeApply(outcome: "applied" | "already_applied" | Error = "applied") {
  return mock<ApplyEventChange>(() =>
    typeof outcome === "string" ? Promise.resolve(outcome) : Promise.reject(outcome),
  );
}

/** `fetchMaster`, der der Reihe nach die übergebenen Zeilen liefert. */
function makeFetch(...rows: (EventWithRelations | null)[]) {
  let call = 0;
  return mock((_id: string) => {
    const row = rows[Math.min(call, rows.length - 1)];
    call += 1;
    return Promise.resolve(row);
  });
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
  occurrenceKey: "2026-06-15",
  isRecurring: true,
  // Nur für `canApplyOptimistically` relevant (Befund C, PR #121) --
  // `updateEvent` selbst liest die Zone aus dem frisch geladenen Master, nicht
  // aus `vars`.
  timezone: "Europe/Berlin",
  changes: CHANGES,
  baseVersion: MASTER_VERSION,
  requestId: REQUEST_ID,
};

describe("updateEvent", () => {
  test("applyChange bekommt Kennung, Termin, Schlüssel und seen aus baseVersion", async () => {
    const fetchMaster = makeFetch(makeRelations());
    const applyChange = makeApply();

    await updateEvent(
      { ...BASE_VARS, baseVersion: "2026-05-01T00:00:00.000Z|2026-05-03T08:00:00.000Z" },
      { fetchMaster, applyChange },
    );

    expect(fetchMaster).toHaveBeenCalledWith("evt-1");
    expect(applyChange).toHaveBeenCalledTimes(1);
    const args = applyChange.mock.calls[0][0];
    expect(args.requestId).toBe(REQUEST_ID);
    expect(args.eventId).toBe("evt-1");
    expect(args.occurrenceKey).toBe("2026-06-15");
    expect(args.seen).toEqual({
      masterUpdatedAt: "2026-05-01T00:00:00.000Z",
      exceptionUpdatedAt: "2026-05-03T08:00:00.000Z",
    });
  });

  test("ohne Exception in baseVersion ist exceptionUpdatedAt null", async () => {
    const applyChange = makeApply();

    await updateEvent(BASE_VARS, { fetchMaster: makeFetch(makeRelations()), applyChange });

    expect(applyChange.mock.calls[0][0].seen).toEqual({
      masterUpdatedAt: MASTER_UPDATED_AT,
      exceptionUpdatedAt: null,
    });
  });

  test("kein clientseitiger Versionsvergleich: ein neuerer Master geht trotzdem an den Server", async () => {
    // Den Vergleich macht seit Block 7 die Funktion, in derselben Transaktion
    // wie das Schreiben. `seen` bleibt das, was das Formular gesehen hat.
    const fetchMaster = makeFetch(makeRelations({ updated_at: "2026-05-02T00:00:00.000Z" }));
    const applyChange = makeApply();

    await updateEvent(BASE_VARS, { fetchMaster, applyChange });

    expect(applyChange.mock.calls[0][0].seen.masterUpdatedAt).toBe(MASTER_UPDATED_AT);
  });

  test("already_applied ist ein Erfolg", async () => {
    const applyChange = makeApply("already_applied");
    // eslint-disable-next-line @typescript-eslint/await-thenable -- bun:test .rejects chain is not typed as Promise in @types/bun
    await expect(
      updateEvent(BASE_VARS, { fetchMaster: makeFetch(makeRelations()), applyChange }),
    ).resolves.toBeUndefined();
  });

  test("scope=forward auf unbegrenzter Serie → Split-Schritte aus dem geladenen Master", async () => {
    const applyChange = makeApply();

    await updateEvent(
      { ...BASE_VARS, scope: "forward" },
      { fetchMaster: makeFetch(makeRelations()), applyChange },
    );

    expect(applyChange.mock.calls[0][0].steps).toEqual([
      { op: "insert_split_event", changes: CHANGES, rrule_count: null },
      { op: "set_rrule_until", until: "2026-06-14T21:59:59.999Z" },
      { op: "delete_exceptions_from" },
    ]);
  });

  test("scope=forward auf Zählserie nimmt die Zahl des geladenen Masters", async () => {
    const applyChange = makeApply();

    await updateEvent(
      { ...BASE_VARS, scope: "forward" },
      { fetchMaster: makeFetch(makeRelations({ rrule_count: 10 })), applyChange },
    );

    expect(applyChange.mock.calls[0][0].steps).toEqual([
      { op: "insert_split_event", changes: CHANGES, rrule_count: 4 },
      { op: "set_rrule_count", count: 6 },
      { op: "delete_exceptions_from" },
    ]);
  });

  test("fehlender Master → EventNotFoundError, kein applyChange", async () => {
    const applyChange = makeApply();

    // eslint-disable-next-line @typescript-eslint/await-thenable -- bun:test .rejects chain is not typed as Promise in @types/bun
    await expect(
      updateEvent(BASE_VARS, { fetchMaster: makeFetch(null), applyChange }),
    ).rejects.toBeInstanceOf(EventNotFoundError);
    expect(applyChange).not.toHaveBeenCalled();
  });

  test("EF409 → EventConflictError mit der frisch geladenen Zeile", async () => {
    const foreign = makeRelations({ title: "Fremd", updated_at: "2026-05-02T00:00:00.000Z" });
    const fetchMaster = makeFetch(makeRelations(), foreign);

    const error = await updateEvent(BASE_VARS, {
      fetchMaster,
      applyChange: makeApply(pgError("EF409", "master")),
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(EventConflictError);
    expect((error as EventConflictError).row).toBe(foreign);
    expect(fetchMaster).toHaveBeenCalledTimes(2);
  });

  test("EF409 und der Master ist danach weg → EventNotFoundError", async () => {
    const fetchMaster = makeFetch(makeRelations(), null);

    // eslint-disable-next-line @typescript-eslint/await-thenable -- bun:test .rejects chain is not typed as Promise in @types/bun
    await expect(
      updateEvent(BASE_VARS, {
        fetchMaster,
        applyChange: makeApply(pgError("EF409", "exception")),
      }),
    ).rejects.toBeInstanceOf(EventNotFoundError);
  });

  test("EF404 → EventNotFoundError ohne Nachlese", async () => {
    const fetchMaster = makeFetch(makeRelations());

    // eslint-disable-next-line @typescript-eslint/await-thenable -- bun:test .rejects chain is not typed as Promise in @types/bun
    await expect(
      updateEvent(BASE_VARS, { fetchMaster, applyChange: makeApply(pgError("EF404")) }),
    ).rejects.toBeInstanceOf(EventNotFoundError);
    expect(fetchMaster).toHaveBeenCalledTimes(1);
  });

  test("42501 mitten im Aufruf (Familie verloren) → EventNotFoundError", async () => {
    // eslint-disable-next-line @typescript-eslint/await-thenable -- bun:test .rejects chain is not typed as Promise in @types/bun
    await expect(
      updateEvent(BASE_VARS, {
        fetchMaster: makeFetch(makeRelations()),
        applyChange: makeApply(pgError("42501")),
      }),
    ).rejects.toBeInstanceOf(EventNotFoundError);
  });

  test("andere Codes (40P01, 22023) bleiben unverändert", async () => {
    // 40P01: Der Server hat zurückgerollt, ein Retry mit derselben Kennung ist
    // sicher. 22023: ein Client-Fehler, `mapEventError` loggt ihn als generic.
    for (const code of ["40P01", "22023"]) {
      const original = pgError(code);
      const error = await updateEvent(BASE_VARS, {
        fetchMaster: makeFetch(makeRelations()),
        applyChange: makeApply(original),
      }).catch((err: unknown) => err);
      expect(error).toBe(original);
    }
  });

  test("ein Fehler bei der Nachlese wird durchgereicht, nicht als Konflikt maskiert", async () => {
    const readError = new Error("Failed to fetch");
    let call = 0;
    const fetchMaster = mock((_id: string) => {
      call += 1;
      return call === 1 ? Promise.resolve(makeRelations()) : Promise.reject(readError);
    });

    const error = await updateEvent(BASE_VARS, {
      fetchMaster,
      applyChange: makeApply(pgError("EF409", "master")),
    }).catch((err: unknown) => err);

    expect(error).toBe(readError);
  });
});

const DELETE_VARS: DeleteEventVars = {
  scope: "all",
  eventId: "evt-1",
  occurrenceKey: "2026-06-15",
  isRecurring: true,
  baseVersion: MASTER_VERSION,
  requestId: REQUEST_ID,
};

describe("deleteEvent", () => {
  test("requestId und seen gehen unverändert an applyChange", async () => {
    const applyChange = makeApply();

    await deleteEvent(DELETE_VARS, { fetchMaster: makeFetch(makeRelations()), applyChange });

    const args = applyChange.mock.calls[0][0];
    expect(args.requestId).toBe(REQUEST_ID);
    expect(args.seen).toEqual({ masterUpdatedAt: MASTER_UPDATED_AT, exceptionUpdatedAt: null });
    expect(args.steps).toEqual([{ op: "delete_master" }]);
  });

  test("scope=forward auf Zählserie kürzt die Zahl statt until zu schreiben", async () => {
    const applyChange = makeApply();

    await deleteEvent(
      { ...DELETE_VARS, scope: "forward" },
      { fetchMaster: makeFetch(makeRelations({ rrule_count: 10 })), applyChange },
    );

    expect(applyChange.mock.calls[0][0].steps).toEqual([
      { op: "set_rrule_count", count: 6 },
      { op: "delete_exceptions_from" },
    ]);
  });

  test("scope=forward auf unbegrenzter Serie schreibt weiter until", async () => {
    const applyChange = makeApply();

    await deleteEvent(
      { ...DELETE_VARS, scope: "forward" },
      { fetchMaster: makeFetch(makeRelations()), applyChange },
    );

    expect(applyChange.mock.calls[0][0].steps).toEqual([
      { op: "set_rrule_until", until: "2026-06-14T21:59:59.999Z" },
      { op: "delete_exceptions_from" },
    ]);
  });

  test("fehlender Master → EventNotFoundError, kein applyChange", async () => {
    const applyChange = makeApply();

    // eslint-disable-next-line @typescript-eslint/await-thenable -- bun:test .rejects chain is not typed as Promise in @types/bun
    await expect(
      deleteEvent(DELETE_VARS, { fetchMaster: makeFetch(null), applyChange }),
    ).rejects.toBeInstanceOf(EventNotFoundError);
    expect(applyChange).not.toHaveBeenCalled();
  });

  test("EF409 → EventConflictError mit der frisch geladenen Zeile", async () => {
    const foreign = makeRelations({ updated_at: "2026-05-02T00:00:00.000Z" });

    const error = await deleteEvent(DELETE_VARS, {
      fetchMaster: makeFetch(makeRelations(), foreign),
      applyChange: makeApply(pgError("EF409", "master")),
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(EventConflictError);
    expect((error as EventConflictError).row).toBe(foreign);
  });

  test("EF404 → EventNotFoundError", async () => {
    // eslint-disable-next-line @typescript-eslint/await-thenable -- bun:test .rejects chain is not typed as Promise in @types/bun
    await expect(
      deleteEvent(DELETE_VARS, {
        fetchMaster: makeFetch(makeRelations()),
        applyChange: makeApply(pgError("EF404")),
      }),
    ).rejects.toBeInstanceOf(EventNotFoundError);
  });
});
