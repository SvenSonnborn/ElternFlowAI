import type { SupabaseClient } from "@supabase/supabase-js";

import { describe, expect, test } from "bun:test";

import type { Database } from "@/features/supabase/database.types";

import {
  createRecordingEventOps,
  createSupabaseApplyEventChange,
  type EventChangeStep,
} from "./eventChange";
import {
  applyDeleteScope,
  applyEditScope,
  type EventChanges,
  type RecurrenceChanges,
} from "./recurrence";

type EventRow = Database["public"]["Tables"]["events"]["Row"];

// Dieselbe Serie wie in `recurrence.test.ts`: 2026-05-04 ist ein Montag, die
// Wochenserie läuft 05-04, 05-11, 05-18, 05-25, 06-01, 06-08, 06-15, …
const MASTER_START = new Date("2026-05-04T16:30:00.000Z");

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
    created_at: "2026-04-20T00:00:00.000Z",
    updated_at: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

const CHANGES: EventChanges = {
  title: "Neuer Titel",
  start_at: "2026-06-15T15:00:00.000Z",
  end_at: "2026-06-15T16:00:00.000Z",
  location: "Sportplatz Nord",
  description: null,
};

/** `CHANGES` am Datum des Masters verankert — siehe `CHANGES_ANCHORED` in `recurrence.test.ts`. */
const CHANGES_ANCHORED: EventChanges = {
  ...CHANGES,
  start_at: "2026-05-04T15:00:00.000Z",
  end_at: "2026-05-04T16:00:00.000Z",
};

const NEW_RULE: RecurrenceChanges = {
  rrule_freq: "daily",
  rrule_interval: 1,
  rrule_byweekday: null,
  rrule_count: null,
  rrule_until: null,
};

/** Zeichnet den Edit-Pfad für eine Occurrence auf und gibt die Schritte zurück. */
async function recordEdit(args: {
  scope: "this" | "forward" | "all";
  occurrenceKey: string;
  isRecurring?: boolean;
  master?: EventRow;
  changes?: EventChanges;
  recurrence?: RecurrenceChanges | null;
}): Promise<EventChangeStep[]> {
  const { ops, steps } = createRecordingEventOps({
    eventId: "evt-1",
    occurrenceKey: args.occurrenceKey,
  });
  await applyEditScope({
    ops,
    scope: args.scope,
    eventId: "evt-1",
    occurrenceKey: args.occurrenceKey,
    isRecurring: args.isRecurring ?? true,
    master: args.master ?? makeMaster(),
    changes: args.changes ?? CHANGES,
    recurrence: args.recurrence,
  });
  return steps;
}

/** Wie `recordEdit`, für den Lösch-Pfad. */
async function recordDelete(args: {
  scope: "this" | "forward" | "all";
  occurrenceKey: string;
  isRecurring?: boolean;
  master?: EventRow;
}): Promise<EventChangeStep[]> {
  const { ops, steps } = createRecordingEventOps({
    eventId: "evt-1",
    occurrenceKey: args.occurrenceKey,
  });
  await applyDeleteScope({
    ops,
    scope: args.scope,
    eventId: "evt-1",
    occurrenceKey: args.occurrenceKey,
    isRecurring: args.isRecurring ?? true,
    master: args.master ?? makeMaster(),
  });
  return steps;
}

const SINGLE = { rrule_freq: null, rrule_byweekday: null } as const;

describe("createRecordingEventOps — Löschen", () => {
  test("scope=this auf einer Serie → cancel_occurrence", async () => {
    expect(await recordDelete({ scope: "this", occurrenceKey: "2026-05-11" })).toEqual([
      { op: "cancel_occurrence" },
    ]);
  });

  test("scope=this auf einem Einzeltermin → delete_master", async () => {
    const steps = await recordDelete({
      scope: "this",
      occurrenceKey: "2026-05-04",
      isRecurring: false,
      master: makeMaster(SINGLE),
    });
    expect(steps).toEqual([{ op: "delete_master" }]);
  });

  test("scope=forward auf unbegrenzter Serie → set_rrule_until, dann delete_exceptions_from", async () => {
    expect(await recordDelete({ scope: "forward", occurrenceKey: "2026-06-15" })).toEqual([
      { op: "set_rrule_until", until: "2026-06-14T21:59:59.999Z" },
      { op: "delete_exceptions_from" },
    ]);
  });

  test("scope=forward vor dem Serienanfang → delete_master", async () => {
    expect(await recordDelete({ scope: "forward", occurrenceKey: "2026-05-01" })).toEqual([
      { op: "delete_master" },
    ]);
  });

  test("scope=all → delete_master", async () => {
    expect(await recordDelete({ scope: "all", occurrenceKey: "2026-05-11" })).toEqual([
      { op: "delete_master" },
    ]);
  });

  test("scope=forward auf einem Einzeltermin → delete_master", async () => {
    const steps = await recordDelete({
      scope: "forward",
      occurrenceKey: "2026-05-11",
      isRecurring: false,
      master: makeMaster(SINGLE),
    });
    expect(steps).toEqual([{ op: "delete_master" }]);
  });

  test("scope=forward auf Zählserie → set_rrule_count(verbraucht), dann delete_exceptions_from", async () => {
    const steps = await recordDelete({
      scope: "forward",
      occurrenceKey: "2026-06-15",
      master: makeMaster({ rrule_count: 10 }),
    });
    expect(steps).toEqual([{ op: "set_rrule_count", count: 6 }, { op: "delete_exceptions_from" }]);
  });

  test("scope=forward auf Zählserie ab dem ersten Vorkommen → delete_master", async () => {
    const steps = await recordDelete({
      scope: "forward",
      occurrenceKey: "2026-05-04",
      master: makeMaster({ rrule_count: 10 }),
    });
    expect(steps).toEqual([{ op: "delete_master" }]);
  });
});

describe("createRecordingEventOps — Bearbeiten", () => {
  test("scope=this auf einer Serie → modify_occurrence mit vollem Override", async () => {
    expect(await recordEdit({ scope: "this", occurrenceKey: "2026-06-15" })).toEqual([
      { op: "modify_occurrence", override: CHANGES },
    ]);
  });

  test("scope=this auf einem Einzeltermin → update_master ohne recurrence", async () => {
    const steps = await recordEdit({
      scope: "this",
      occurrenceKey: "2026-05-04",
      isRecurring: false,
      master: makeMaster(SINGLE),
    });
    expect(steps).toEqual([{ op: "update_master", changes: CHANGES }]);
    // Ohne Regeländerung steht der Schlüssel gar nicht erst im Schritt.
    expect(Object.keys(steps[0])).toEqual(["op", "changes"]);
  });

  test("scope=all auf einer Serie → update_master mit verankerten Änderungen", async () => {
    expect(await recordEdit({ scope: "all", occurrenceKey: "2026-06-15" })).toEqual([
      { op: "update_master", changes: CHANGES_ANCHORED },
    ]);
  });

  test("scope=forward auf unbegrenzter Serie → Split, set_rrule_until, delete_exceptions_from", async () => {
    expect(await recordEdit({ scope: "forward", occurrenceKey: "2026-06-15" })).toEqual([
      { op: "insert_split_event", changes: CHANGES, rrule_count: null },
      { op: "set_rrule_until", until: "2026-06-14T21:59:59.999Z" },
      { op: "delete_exceptions_from" },
    ]);
  });

  test("scope=forward auf Zählserie → Split mit Restzahl, set_rrule_count, delete_exceptions_from", async () => {
    const steps = await recordEdit({
      scope: "forward",
      occurrenceKey: "2026-06-15",
      master: makeMaster({ rrule_count: 10 }),
    });
    expect(steps).toEqual([
      { op: "insert_split_event", changes: CHANGES, rrule_count: 4 },
      { op: "set_rrule_count", count: 6 },
      { op: "delete_exceptions_from" },
    ]);
  });

  test("scope=forward auf täglicher Zählserie zählt genau", async () => {
    const steps = await recordEdit({
      scope: "forward",
      occurrenceKey: "2026-05-07",
      master: makeMaster({ rrule_freq: "daily", rrule_byweekday: null, rrule_count: 5 }),
    });
    expect(steps).toEqual([
      { op: "insert_split_event", changes: CHANGES, rrule_count: 2 },
      { op: "set_rrule_count", count: 3 },
      { op: "delete_exceptions_from" },
    ]);
  });

  test("scope=forward ab dem ersten Vorkommen einer Zählserie → update_master, kein Split", async () => {
    const steps = await recordEdit({
      scope: "forward",
      occurrenceKey: "2026-05-04",
      master: makeMaster({ rrule_count: 10 }),
    });
    expect(steps).toEqual([{ op: "update_master", changes: CHANGES }]);
  });

  test("scope=forward vor dem Serienanfang → update_master, kein Split", async () => {
    expect(await recordEdit({ scope: "forward", occurrenceKey: "2026-05-01" })).toEqual([
      { op: "update_master", changes: CHANGES },
    ]);
  });

  test("scope=forward auf einem Einzeltermin → update_master", async () => {
    const steps = await recordEdit({
      scope: "forward",
      occurrenceKey: "2026-06-15",
      isRecurring: false,
      master: makeMaster(SINGLE),
    });
    expect(steps).toEqual([{ op: "update_master", changes: CHANGES }]);
  });

  test("scope=forward hinter dem Ende einer Zählserie → Kopf kürzen, kein Split", async () => {
    const steps = await recordEdit({
      scope: "forward",
      occurrenceKey: "2026-08-31",
      master: makeMaster({ rrule_count: 10 }),
    });
    expect(steps).toEqual([{ op: "set_rrule_count", count: 10 }, { op: "delete_exceptions_from" }]);
  });

  test("Regelwechsel: delete_all_exceptions vor update_master mit recurrence", async () => {
    const steps = await recordEdit({
      scope: "all",
      occurrenceKey: "2026-06-15",
      recurrence: NEW_RULE,
    });
    expect(steps).toEqual([
      { op: "delete_all_exceptions" },
      { op: "update_master", changes: CHANGES_ANCHORED, recurrence: NEW_RULE },
    ]);
  });

  test("Regelwechsel gewinnt über scope=forward — kein Split", async () => {
    const steps = await recordEdit({
      scope: "forward",
      occurrenceKey: "2026-06-15",
      recurrence: NEW_RULE,
    });
    expect(steps.map((step) => step.op)).toEqual(["delete_all_exceptions", "update_master"]);
  });

  test("unveränderte Regel → kein delete_all_exceptions", async () => {
    const unchanged: RecurrenceChanges = {
      rrule_freq: "weekly",
      rrule_interval: 1,
      rrule_byweekday: [1],
      rrule_count: null,
      rrule_until: null,
    };
    const steps = await recordEdit({
      scope: "all",
      occurrenceKey: "2026-06-15",
      recurrence: unchanged,
    });
    expect(steps).toEqual([
      { op: "update_master", changes: CHANGES_ANCHORED, recurrence: unchanged },
    ]);
  });

  test("Serie wird Einzeltermin → Eingabe literal, alle Regelfelder null", async () => {
    const none: RecurrenceChanges = {
      rrule_freq: null,
      rrule_interval: 1,
      rrule_byweekday: null,
      rrule_count: null,
      rrule_until: null,
    };
    const steps = await recordEdit({
      scope: "all",
      occurrenceKey: "2026-06-15",
      recurrence: none,
    });
    expect(steps).toEqual([
      { op: "delete_all_exceptions" },
      { op: "update_master", changes: CHANGES, recurrence: none },
    ]);
  });

  test("insert_split_event trägt nur changes und rrule_count", async () => {
    // Familie, Typ, Kind, Elternteil, Zone und Regel nimmt der Server aus dem
    // gesperrten Master (Spec §5.3); ein zusätzlicher Schlüssel wäre ein 22023.
    const steps = await recordEdit({
      scope: "forward",
      occurrenceKey: "2026-06-15",
      master: makeMaster({ parent_id: "par-7", child_id: null }),
    });
    const split = steps.find((step) => step.op === "insert_split_event");
    expect(Object.keys(split ?? {}).sort()).toEqual(["changes", "op", "rrule_count"]);
  });
});

describe("createRecordingEventOps — explizite null im JSON", () => {
  // `JSON.stringify` lässt `undefined`-Schlüssel weg. Der Server verlangt
  // `rrule_count` aber als Pflichtschlüssel und antwortet sonst mit 22023 —
  // ein Fehler, den nur die echte Serialisierung zeigt, nicht `toEqual`.
  test("rrule_count: null überlebt die Serialisierung als Schlüssel", async () => {
    const steps = await recordEdit({ scope: "forward", occurrenceKey: "2026-06-15" });
    const wire = JSON.parse(JSON.stringify(steps)) as Record<string, unknown>[];
    const split = wire.find((step) => step.op === "insert_split_event");
    expect(split).toBeDefined();
    expect(Object.hasOwn(split ?? {}, "rrule_count")).toBe(true);
    expect(split?.rrule_count).toBeNull();
  });

  test("nullbare Felder in changes und recurrence bleiben als null stehen", async () => {
    const steps = await recordEdit({
      scope: "all",
      occurrenceKey: "2026-06-15",
      recurrence: NEW_RULE,
    });
    const wire = JSON.parse(JSON.stringify(steps)) as {
      op: string;
      changes?: Record<string, unknown>;
      recurrence?: Record<string, unknown>;
    }[];
    const update = wire.find((step) => step.op === "update_master");
    expect(update?.changes?.description).toBeNull();
    expect(Object.hasOwn(update?.recurrence ?? {}, "rrule_count")).toBe(true);
    expect(Object.hasOwn(update?.recurrence ?? {}, "rrule_until")).toBe(true);
    expect(Object.hasOwn(update?.recurrence ?? {}, "rrule_byweekday")).toBe(true);
  });
});

describe("createRecordingEventOps — fremder Termin oder fremder Schlüssel", () => {
  const target = { eventId: "evt-1", occurrenceKey: "2026-06-15" };

  test("cancelOccurrence mit anderem Schlüssel wirft", async () => {
    const { ops, steps } = createRecordingEventOps(target);
    // eslint-disable-next-line @typescript-eslint/await-thenable -- bun:test .rejects chain is not typed as Promise in @types/bun
    await expect(ops.cancelOccurrence("evt-1", "2026-06-22")).rejects.toThrow(/2026-06-22/);
    expect(steps).toEqual([]);
  });

  test("modifyOccurrence mit anderem Schlüssel wirft", async () => {
    const { ops } = createRecordingEventOps(target);
    // eslint-disable-next-line @typescript-eslint/await-thenable -- bun:test .rejects chain is not typed as Promise in @types/bun
    await expect(ops.modifyOccurrence("evt-1", "2026-06-22", CHANGES)).rejects.toThrow(Error);
  });

  test("deleteExceptionsFromDate mit anderem Datum wirft", async () => {
    // Der Server löscht ab `p_occurrence_key` — ein anderes Datum still durch
    // den Schlüssel zu ersetzen, löschte einen anderen Ausschnitt.
    const { ops } = createRecordingEventOps(target);
    // eslint-disable-next-line @typescript-eslint/await-thenable -- bun:test .rejects chain is not typed as Promise in @types/bun
    await expect(ops.deleteExceptionsFromDate("evt-1", "2026-06-08")).rejects.toThrow(Error);
  });

  test("eine Op auf einem anderen Termin wirft", async () => {
    const { ops, steps } = createRecordingEventOps(target);
    // eslint-disable-next-line @typescript-eslint/await-thenable -- bun:test .rejects chain is not typed as Promise in @types/bun
    await expect(ops.deleteMaster("evt-2")).rejects.toThrow(/evt-2/);
    // eslint-disable-next-line @typescript-eslint/await-thenable -- bun:test .rejects chain is not typed as Promise in @types/bun
    await expect(ops.updateMaster("evt-2", CHANGES)).rejects.toThrow(Error);
    // eslint-disable-next-line @typescript-eslint/await-thenable -- bun:test .rejects chain is not typed as Promise in @types/bun
    await expect(ops.setRruleCount("evt-2", 3)).rejects.toThrow(Error);
    // eslint-disable-next-line @typescript-eslint/await-thenable -- bun:test .rejects chain is not typed as Promise in @types/bun
    await expect(ops.insertSplitEvent(makeMaster({ id: "evt-2" }), CHANGES, null)).rejects.toThrow(
      Error,
    );
    expect(steps).toEqual([]);
  });
});

/**
 * Doppelgänger für `client.rpc`. Hält die Argumente in der Form fest, in der
 * sie über die Leitung gingen (`JSON.parse(JSON.stringify(…))`), damit ein
 * `undefined` statt `null` hier auffällt und nicht erst am Server.
 */
function fakeRpcClient(result: { data: unknown; error: unknown }) {
  const calls: { fn: string; wire: Record<string, unknown> }[] = [];
  const client = {
    rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, wire: JSON.parse(JSON.stringify(args)) as Record<string, unknown> });
      return Promise.resolve(result);
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, calls };
}

const APPLY_ARGS = {
  requestId: "11111111-1111-4111-8111-111111111111",
  eventId: "evt-1",
  occurrenceKey: "2026-06-15",
  seen: { masterUpdatedAt: "2026-05-01T00:00:00.000Z", exceptionUpdatedAt: null },
  steps: [{ op: "cancel_occurrence" }] as EventChangeStep[],
};

describe("createSupabaseApplyEventChange", () => {
  test("ruft apply_event_change mit allen sechs Parametern", async () => {
    const { client, calls } = fakeRpcClient({ data: "applied", error: null });

    const result = await createSupabaseApplyEventChange(client)(APPLY_ARGS);

    expect(result).toBe("applied");
    expect(calls).toEqual([
      {
        fn: "apply_event_change",
        wire: {
          p_request_id: APPLY_ARGS.requestId,
          p_event_id: "evt-1",
          p_occurrence_key: "2026-06-15",
          p_seen_master_updated_at: "2026-05-01T00:00:00.000Z",
          // Als Schlüssel mit null — „an diesem Schlüssel lag keine Exception".
          p_seen_exception_updated_at: null,
          p_steps: [{ op: "cancel_occurrence" }],
        },
      },
    ]);
  });

  test("already_applied wird durchgereicht", async () => {
    const { client } = fakeRpcClient({ data: "already_applied", error: null });
    expect(await createSupabaseApplyEventChange(client)(APPLY_ARGS)).toBe("already_applied");
  });

  test("der PostgREST-Fehler wird unverändert weitergeworfen", async () => {
    const pgError = { code: "EF409", details: "master", message: "apply_event_change: Konflikt" };
    const { client } = fakeRpcClient({ data: null, error: pgError });

    const thrown = await createSupabaseApplyEventChange(client)(APPLY_ARGS).catch(
      (err: unknown) => err,
    );

    expect(thrown).toBe(pgError);
  });

  test("eine unbekannte Antwort ist ein Fehler, kein stiller Erfolg", async () => {
    const { client } = fakeRpcClient({ data: "something", error: null });
    // eslint-disable-next-line @typescript-eslint/await-thenable -- bun:test .rejects chain is not typed as Promise in @types/bun
    await expect(createSupabaseApplyEventChange(client)(APPLY_ARGS)).rejects.toThrow(Error);
  });
});
