import type { SupabaseClient } from "@supabase/supabase-js";

import { describe, expect, mock, test } from "bun:test";

import type { Database } from "@/features/supabase/database.types";

import { EventConflictError } from "./errors";
import {
  applyDeleteScope,
  applyEditScope,
  createSupabaseEventOps,
  type EventChanges,
  type EventOps,
  type RecurrenceChanges,
} from "./recurrence";
import { allOccurrences } from "./rrule";

type EventRow = Database["public"]["Tables"]["events"]["Row"];

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

/** Ops that record the order calls were made in, for the split-durability tests. */
function makeRecordingOps(): { ops: EventOps; calls: string[] } {
  const calls: string[] = [];
  const base = makeOps();
  const ops = {} as Record<string, unknown>;
  for (const key of Object.keys(base) as (keyof EventOps)[]) {
    ops[key] = (...args: unknown[]) => {
      calls.push(key);
      return (base[key] as (...a: unknown[]) => Promise<void>)(...args);
    };
  }
  return { ops: ops as unknown as EventOps, calls };
}

// 2026-05-04 is a Monday. A weekly/byweekday=[Mo] series from here runs
// 05-04, 05-11, 05-18, 05-25, 06-01, 06-08, 06-15, 06-22, 06-29, 07-06.
const MASTER_START = new Date("2026-05-04T16:30:00.000Z");
const MASTER_UPDATED_AT = "2026-05-01T00:00:00.000Z";

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
    // Bewusst ungleich `updated_at`: Die neun CAS-Assertions unten prüfen, dass
    // `updateMaster` genau den Stempel von `updated_at` durchreicht — mit
    // identischen Werten hätte ein `master.created_at`-Vertipper unbemerkt
    // durchgehen können.
    created_at: "2026-04-20T00:00:00.000Z",
    updated_at: MASTER_UPDATED_AT,
    ...overrides,
  };
}

describe("applyDeleteScope", () => {
  test("scope=this on recurring → cancelOccurrence", async () => {
    const ops = makeOps();
    await applyDeleteScope({
      ops,
      scope: "this",
      eventId: "evt-1",
      occurrenceDate: "2026-05-11",
      isRecurring: true,
      master: makeMaster(),
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
      master: makeMaster({ rrule_freq: null, rrule_byweekday: null }),
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
      master: makeMaster(),
    });
    expect(ops.setRruleUntil).toHaveBeenCalledWith("evt-1", "2026-06-14T21:59:59.999Z");
    expect(ops.deleteExceptionsFromDate).toHaveBeenCalledWith("evt-1", "2026-06-15");
    expect(ops.deleteMaster).not.toHaveBeenCalled();
    expect(ops.setRruleCount).not.toHaveBeenCalled();
  });

  test("scope=forward with cutoff < dtstart → behaves like all (deleteMaster)", async () => {
    const ops = makeOps();
    await applyDeleteScope({
      ops,
      scope: "forward",
      eventId: "evt-1",
      occurrenceDate: "2026-05-01",
      isRecurring: true,
      master: makeMaster(),
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
      master: makeMaster(),
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
      master: makeMaster({ rrule_freq: null, rrule_byweekday: null }),
    });
    expect(ops.deleteMaster).toHaveBeenCalledWith("evt-1");
    expect(ops.setRruleUntil).not.toHaveBeenCalled();
    expect(ops.deleteExceptionsFromDate).not.toHaveBeenCalled();
  });

  // ── count-bounded series ──────────────────────────────────────────────────
  // `rrule_until` and `rrule_count` are mutually exclusive in the DB
  // (constraint events_rrule_count_xor_until), so a count-series must be
  // truncated by shrinking its count — never by writing an until.

  test("scope=forward on count-series → setRruleCount(consumed), never setRruleUntil", async () => {
    const ops = makeOps();
    await applyDeleteScope({
      ops,
      scope: "forward",
      eventId: "evt-1",
      occurrenceDate: "2026-06-15",
      isRecurring: true,
      master: makeMaster({ rrule_count: 10 }),
    });
    // 6 occurrences (05-04 … 06-08) survive before the cutoff.
    expect(ops.setRruleCount).toHaveBeenCalledWith("evt-1", 6);
    expect(ops.setRruleUntil).not.toHaveBeenCalled();
    expect(ops.deleteExceptionsFromDate).toHaveBeenCalledWith("evt-1", "2026-06-15");
    expect(ops.deleteMaster).not.toHaveBeenCalled();
  });

  test("scope=forward on count-series from the first occurrence → deleteMaster", async () => {
    const ops = makeOps();
    await applyDeleteScope({
      ops,
      scope: "forward",
      eventId: "evt-1",
      occurrenceDate: "2026-05-04",
      isRecurring: true,
      master: makeMaster({ rrule_count: 10 }),
    });
    // Nothing is consumed before the cutoff → the whole series goes.
    expect(ops.deleteMaster).toHaveBeenCalledWith("evt-1");
    expect(ops.setRruleCount).not.toHaveBeenCalled();
    expect(ops.setRruleUntil).not.toHaveBeenCalled();
  });
});

const CHANGES: EventChanges = {
  title: "Neuer Titel",
  start_at: "2026-06-15T15:00:00.000Z",
  end_at: "2026-06-15T16:00:00.000Z",
  location: "Sportplatz Nord",
  description: null,
};

/**
 * `CHANGES`, verankert am Datum von `MASTER_START` — was `applyEditScope` seit
 * ADR-032 bei Scope „alle" auf einer Serie schreibt.
 *
 * Die UTC-Werte sind offsetunabhängig: Anker und Eingabe liegen beide in der
 * Sommerzeit, die Umrechnung „Datum des Masters + Tageszeit der Eingabe" kürzt
 * den Offset dann heraus. Deshalb stimmt die Erwartung unter `Europe/Berlin`
 * (lokal) wie unter `UTC` (CI).
 */
const CHANGES_ANCHORED: EventChanges = {
  ...CHANGES,
  start_at: "2026-05-04T15:00:00.000Z",
  end_at: "2026-05-04T16:00:00.000Z",
};

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
      master: makeMaster({ rrule_freq: null, rrule_byweekday: null }),
      changes: CHANGES,
    });
    expect(ops.updateMaster).toHaveBeenCalledWith("evt-1", CHANGES, MASTER_UPDATED_AT);
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
    expect(ops.updateMaster).toHaveBeenCalledWith("evt-1", CHANGES_ANCHORED, MASTER_UPDATED_AT);
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
    expect(ops.setRruleUntil).toHaveBeenCalledWith("evt-1", "2026-06-14T21:59:59.999Z");
    // Unbounded series → the tail stays unbounded.
    expect(ops.insertSplitEvent).toHaveBeenCalledWith(master, CHANGES, null);
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
    // Bleibt literal: „ab diesem Termin" verankert die Serie absichtlich neu —
    // hier liegt der Schnitt am oder vor dem Serienanfang, die „Schwanzhälfte"
    // ist die ganze Serie. Siehe `anchoredChanges` in `recurrence.ts`.
    expect(ops.updateMaster).toHaveBeenCalledWith("evt-1", CHANGES, MASTER_UPDATED_AT);
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
      master: makeMaster({ rrule_freq: null, rrule_byweekday: null }),
      changes: CHANGES,
    });
    // Bleibt literal: Hier gibt es weder Serie noch Serienanfang — der Grund
    // ist schlicht `isRecurring === false`, nicht der Anker aus `anchoredChanges`.
    expect(ops.updateMaster).toHaveBeenCalledWith("evt-1", CHANGES, MASTER_UPDATED_AT);
    expect(ops.insertSplitEvent).not.toHaveBeenCalled();
    expect(ops.setRruleUntil).not.toHaveBeenCalled();
  });

  // ── count-bounded series ──────────────────────────────────────────────────

  test("scope=forward on count-series → count split across head and tail", async () => {
    const ops = makeOps();
    const master = makeMaster({ rrule_count: 10 });
    await applyEditScope({
      ops,
      scope: "forward",
      eventId: "evt-1",
      occurrenceDate: "2026-06-15",
      isRecurring: true,
      master,
      changes: CHANGES,
    });
    // Head keeps the 6 consumed occurrences, tail carries the remaining 4.
    expect(ops.setRruleCount).toHaveBeenCalledWith("evt-1", 6);
    expect(ops.setRruleUntil).not.toHaveBeenCalled();
    expect(ops.insertSplitEvent).toHaveBeenCalledWith(master, CHANGES, 4);
    expect(ops.deleteExceptionsFromDate).toHaveBeenCalledWith("evt-1", "2026-06-15");
    expect(ops.updateMaster).not.toHaveBeenCalled();
  });

  test("scope=forward on count-series from the first occurrence → updateMaster (no split)", async () => {
    const ops = makeOps();
    await applyEditScope({
      ops,
      scope: "forward",
      eventId: "evt-1",
      occurrenceDate: "2026-05-04",
      isRecurring: true,
      master: makeMaster({ rrule_count: 10 }),
      changes: CHANGES,
    });
    // Bleibt literal: „ab diesem Termin" verankert die Serie absichtlich neu —
    // hier liegt der Schnitt am oder vor dem Serienanfang, die „Schwanzhälfte"
    // ist die ganze Serie. Siehe `anchoredChanges` in `recurrence.ts`.
    expect(ops.updateMaster).toHaveBeenCalledWith("evt-1", CHANGES, MASTER_UPDATED_AT);
    expect(ops.insertSplitEvent).not.toHaveBeenCalled();
    expect(ops.setRruleCount).not.toHaveBeenCalled();
  });

  test("scope=forward on a daily count-series splits on the exact occurrence count", async () => {
    const ops = makeOps();
    const master = makeMaster({
      rrule_freq: "daily",
      rrule_byweekday: null,
      rrule_count: 5,
    });
    await applyEditScope({
      ops,
      scope: "forward",
      eventId: "evt-1",
      occurrenceDate: "2026-05-07",
      isRecurring: true,
      master,
      changes: CHANGES,
    });
    // 05-04, 05-05, 05-06 consumed → 05-07 and 05-08 remain.
    expect(ops.setRruleCount).toHaveBeenCalledWith("evt-1", 3);
    expect(ops.insertSplitEvent).toHaveBeenCalledWith(master, CHANGES, 2);
  });

  // The split is several non-transactional calls. Creating the tail before
  // shortening the head means a mid-way failure leaves a visible duplicate
  // rather than silently dropping every occurrence after the cutoff.

  test("scope=forward creates the split event before shortening the count", async () => {
    const { ops, calls } = makeRecordingOps();
    await applyEditScope({
      ops,
      scope: "forward",
      eventId: "evt-1",
      occurrenceDate: "2026-06-15",
      isRecurring: true,
      master: makeMaster({ rrule_count: 10 }),
      changes: CHANGES,
    });
    expect(calls).toEqual(["insertSplitEvent", "setRruleCount", "deleteExceptionsFromDate"]);
  });

  test("scope=forward creates the split event before setting until", async () => {
    const { ops, calls } = makeRecordingOps();
    await applyEditScope({
      ops,
      scope: "forward",
      eventId: "evt-1",
      occurrenceDate: "2026-06-15",
      isRecurring: true,
      master: makeMaster(),
      changes: CHANGES,
    });
    expect(calls).toEqual(["insertSplitEvent", "setRruleUntil", "deleteExceptionsFromDate"]);
  });

  // ── series rule edits ─────────────────────────────────────────────────────
  // A rule change redefines the whole series, so it goes to the master no
  // matter which scope the caller passes, and takes the now-orphaned
  // per-occurrence exceptions with it.

  const NEW_RULE: RecurrenceChanges = {
    rrule_freq: "daily",
    rrule_interval: 1,
    rrule_byweekday: null,
    rrule_count: null,
    rrule_until: null,
  };

  test("exceptions are cleared before the rule moves, not after", async () => {
    // Non-transactional calls: failing here must leave the old rule with its own
    // exceptions, never a new rule with stale ones.
    const { ops, calls } = makeRecordingOps();
    await applyEditScope({
      ops,
      scope: "all",
      eventId: "evt-1",
      occurrenceDate: "2026-06-15",
      isRecurring: true,
      master: makeMaster(),
      changes: CHANGES,
      recurrence: NEW_RULE,
    });
    expect(calls).toEqual(["deleteAllExceptions", "updateMaster"]);
  });

  test("recurrence change → updateMaster carries the rule and exceptions are cleared", async () => {
    const ops = makeOps();
    await applyEditScope({
      ops,
      scope: "all",
      eventId: "evt-1",
      occurrenceDate: "2026-06-15",
      isRecurring: true,
      master: makeMaster(),
      changes: CHANGES,
      recurrence: NEW_RULE,
    });
    expect(ops.updateMaster).toHaveBeenCalledWith(
      "evt-1",
      CHANGES_ANCHORED,
      MASTER_UPDATED_AT,
      NEW_RULE,
    );
    expect(ops.deleteAllExceptions).toHaveBeenCalledWith("evt-1");
    expect(ops.insertSplitEvent).not.toHaveBeenCalled();
  });

  test("recurrence change wins over scope=forward — no split is attempted", async () => {
    const ops = makeOps();
    await applyEditScope({
      ops,
      scope: "forward",
      eventId: "evt-1",
      occurrenceDate: "2026-06-15",
      isRecurring: true,
      master: makeMaster(),
      changes: CHANGES,
      recurrence: NEW_RULE,
    });
    expect(ops.updateMaster).toHaveBeenCalledWith(
      "evt-1",
      CHANGES_ANCHORED,
      MASTER_UPDATED_AT,
      NEW_RULE,
    );
    expect(ops.insertSplitEvent).not.toHaveBeenCalled();
    expect(ops.setRruleUntil).not.toHaveBeenCalled();
  });

  test("recurrence identical to the master → exceptions survive", async () => {
    const ops = makeOps();
    const unchanged: RecurrenceChanges = {
      rrule_freq: "weekly",
      rrule_interval: 1,
      rrule_byweekday: [1],
      rrule_count: null,
      rrule_until: null,
    };
    await applyEditScope({
      ops,
      scope: "all",
      eventId: "evt-1",
      occurrenceDate: "2026-06-15",
      isRecurring: true,
      master: makeMaster(),
      changes: CHANGES,
      recurrence: unchanged,
    });
    expect(ops.updateMaster).toHaveBeenCalledWith(
      "evt-1",
      CHANGES_ANCHORED,
      MASTER_UPDATED_AT,
      unchanged,
    );
    expect(ops.deleteAllExceptions).not.toHaveBeenCalled();
  });

  test("a changed count alone counts as a rule change", async () => {
    const ops = makeOps();
    const bounded: RecurrenceChanges = {
      rrule_freq: "weekly",
      rrule_interval: 1,
      rrule_byweekday: [1],
      rrule_count: 8,
      rrule_until: null,
    };
    await applyEditScope({
      ops,
      scope: "all",
      eventId: "evt-1",
      occurrenceDate: "2026-06-15",
      isRecurring: true,
      master: makeMaster(),
      changes: CHANGES,
      recurrence: bounded,
    });
    expect(ops.deleteAllExceptions).toHaveBeenCalledWith("evt-1");
  });

  test("turning a series into a single event nulls every rrule column", async () => {
    const ops = makeOps();
    const none: RecurrenceChanges = {
      rrule_freq: null,
      rrule_interval: 1,
      rrule_byweekday: null,
      rrule_count: null,
      rrule_until: null,
    };
    await applyEditScope({
      ops,
      scope: "all",
      eventId: "evt-1",
      occurrenceDate: "2026-06-15",
      isRecurring: true,
      master: makeMaster(),
      changes: CHANGES,
      recurrence: none,
    });
    // rrule_freq: null heißt keine Regel mehr und damit kein `dtstart` zu
    // schützen — die Eingabe gilt literal, nicht verankert (ADR-032 Decision 3).
    expect(ops.updateMaster).toHaveBeenCalledWith("evt-1", CHANGES, MASTER_UPDATED_AT, none);
    expect(ops.deleteAllExceptions).toHaveBeenCalledWith("evt-1");
  });

  test("scope=forward past the end of a count-series → truncate head, no tail", async () => {
    const ops = makeOps();
    await applyEditScope({
      ops,
      scope: "forward",
      eventId: "evt-1",
      occurrenceDate: "2026-08-31",
      isRecurring: true,
      master: makeMaster({ rrule_count: 10 }),
      changes: CHANGES,
    });
    // All 10 occurrences are before the cutoff → nothing left to split off.
    expect(ops.setRruleCount).toHaveBeenCalledWith("evt-1", 10);
    expect(ops.insertSplitEvent).not.toHaveBeenCalled();
  });

  test("updateMaster bekommt den Stempel des gelesenen Masters, nicht den des Formulars", async () => {
    // Das CAS soll das Fenster zwischen *diesem* Lesen und *diesem* Schreiben
    // schließen — nicht dasselbe prüfen wie der Pre-Flight.
    const master = makeMaster({ updated_at: "2026-05-09T08:00:00.000Z" });
    const ops = makeOps();

    await applyEditScope({
      ops,
      scope: "all",
      eventId: "evt-1",
      occurrenceDate: "2026-06-15",
      isRecurring: true,
      master,
      changes: CHANGES,
    });

    expect(ops.updateMaster).toHaveBeenCalledWith(
      "evt-1",
      CHANGES_ANCHORED,
      "2026-05-09T08:00:00.000Z",
    );
  });
});

// ── createSupabaseEventOps ────────────────────────────────────────────────
// Bisher die einzige Suite, die den Supabase-Adapter selbst anfasst: Ohne sie
// blieben alle Kalender-Tests grün, würde man `.eq("updated_at", …)` oder das
// `if (!data) throw` aus `updateMaster` entfernen — genau die Hälfte des CAS,
// die dem Task seinen Namen gibt.

const SEEN_UPDATED_AT = "2026-05-01T00:00:00.000Z";

/**
 * Doppelgänger des Query-Builders, den `updateMaster` durchläuft
 * (`.from().update().eq().eq().select().maybeSingle()`). Kein `mock.module`:
 * `createSupabaseEventOps` nimmt den Client als Parameter, genau damit ein
 * Test ihn ersetzen kann — gleiches Muster wie `fakeClient` in
 * `features/realtime/subscribe.test.ts`.
 */
function fakeUpdateClient(result: { data: { id: string } | null; error: unknown }) {
  const calls = {
    table: "",
    updatePayload: undefined as unknown,
    eqCalls: [] as [string, unknown][],
    selectColumns: "",
  };
  const builder = {
    eq(column: string, value: unknown) {
      calls.eqCalls.push([column, value]);
      return builder;
    },
    select(columns: string) {
      calls.selectColumns = columns;
      return builder;
    },
    maybeSingle: () => Promise.resolve(result),
  };
  const client = {
    from(table: string) {
      calls.table = table;
      return {
        update(payload: unknown) {
          calls.updatePayload = payload;
          return builder;
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, calls };
}

describe("createSupabaseEventOps", () => {
  test("updateMaster filtert auf id UND den gerade gelesenen Stempel", async () => {
    const { client, calls } = fakeUpdateClient({ data: { id: "evt-1" }, error: null });
    const ops = createSupabaseEventOps(client);

    await ops.updateMaster("evt-1", CHANGES, SEEN_UPDATED_AT);

    expect(calls.table).toBe("events");
    expect(calls.updatePayload).toEqual(CHANGES);
    expect(calls.eqCalls).toEqual([
      ["id", "evt-1"],
      ["updated_at", SEEN_UPDATED_AT],
    ]);
  });

  test("maybeSingle liefert keine Zeile → EventConflictError, nicht die fremde Fassung", async () => {
    const { client } = fakeUpdateClient({ data: null, error: null });
    const ops = createSupabaseEventOps(client);

    const error = await ops
      .updateMaster("evt-1", CHANGES, SEEN_UPDATED_AT)
      .catch((err: unknown) => err);

    // `null` statt der fremden Fassung: Hier ist nur bekannt, *dass* jemand
    // dazwischengeschrieben hat, nicht *was* — siehe Docstring in errors.ts.
    expect(error).toBeInstanceOf(EventConflictError);
    expect((error as EventConflictError).row).toBeNull();
  });

  test("maybeSingle liefert eine Zeile → kein Wurf", async () => {
    const { client } = fakeUpdateClient({ data: { id: "evt-1" }, error: null });
    const ops = createSupabaseEventOps(client);

    // Kein `.resolves`: dieselbe `@typescript-eslint/await-thenable`-Lücke in
    // @types/bun wie bei `.rejects` (siehe die anderen Suiten). Ein Wurf hier
    // ließe den Test selbst fehlschlagen.
    await ops.updateMaster("evt-1", CHANGES, SEEN_UPDATED_AT);
  });

  test("ein PostgREST-Fehler wird durchgereicht, nicht als Konflikt maskiert", async () => {
    const pgError = { message: "connection reset", code: "08006" };
    const { client } = fakeUpdateClient({ data: null, error: pgError });
    const ops = createSupabaseEventOps(client);

    const error = await ops
      .updateMaster("evt-1", CHANGES, SEEN_UPDATED_AT)
      .catch((err: unknown) => err);

    expect(error).toBe(pgError);
  });
});

// ── Serienanker ───────────────────────────────────────────────────────────
// Aus lokalen Komponenten gebaut, nicht aus UTC-Strings: Die Anker-Regel
// rechnet mit lokalen Gettern (wie `withTimeOfDay` in `optimisticEvents.ts`),
// eine UTC-Fixture ließe die Erwartung mit der Runner-Zone wandern. 04.05. und
// 15.06. liegen in jeder gängigen Zone im selben Sommerzeit-Regime — genau die
// Bedingung, unter der die Umrechnung offsetunabhängig ist.

/** Montag, 04.05.2026, 18:30 Ortszeit. */
const ANCHOR_MASTER_START = new Date(2026, 4, 4, 18, 30);

function anchorMaster(overrides: Partial<EventRow> = {}): EventRow {
  return makeMaster({
    start_at: ANCHOR_MASTER_START.toISOString(),
    end_at: new Date(2026, 4, 4, 19, 30).toISOString(),
    ...overrides,
  });
}

/** Der Nutzer bearbeitet die Occurrence vom 15.06. und stellt sie auf 17:00–18:00. */
const ANCHOR_CHANGES: EventChanges = {
  title: "Neuer Titel",
  start_at: new Date(2026, 5, 15, 17, 0).toISOString(),
  end_at: new Date(2026, 5, 15, 18, 0).toISOString(),
  location: "Sportplatz Nord",
  description: null,
};

/** Datum des Masters, Uhrzeit aus der Eingabe, Dauer aus der Eingabe. */
const ANCHOR_EXPECTED: EventChanges = {
  ...ANCHOR_CHANGES,
  start_at: new Date(2026, 4, 4, 17, 0).toISOString(),
  end_at: new Date(2026, 4, 4, 18, 0).toISOString(),
};

describe("applyEditScope — Serienanker", () => {
  test("scope=all auf einer Serie behält das Datum des Masters und übernimmt nur die Uhrzeit", async () => {
    const ops = makeOps();

    await applyEditScope({
      ops,
      scope: "all",
      eventId: "evt-1",
      occurrenceDate: "2026-06-15",
      isRecurring: true,
      master: anchorMaster(),
      changes: ANCHOR_CHANGES,
    });

    expect(ops.updateMaster).toHaveBeenCalledWith("evt-1", ANCHOR_EXPECTED, MASTER_UPDATED_AT);
  });

  test("die Dauer aus der Eingabe gewinnt, nicht die des Masters", async () => {
    const ops = makeOps();
    // Master läuft eine Stunde, die Eingabe zweieinhalb.
    const longer: EventChanges = {
      ...ANCHOR_CHANGES,
      end_at: new Date(2026, 5, 15, 19, 30).toISOString(),
    };

    await applyEditScope({
      ops,
      scope: "all",
      eventId: "evt-1",
      occurrenceDate: "2026-06-15",
      isRecurring: true,
      master: anchorMaster(),
      changes: longer,
    });

    expect(ops.updateMaster).toHaveBeenCalledWith(
      "evt-1",
      {
        ...longer,
        start_at: new Date(2026, 4, 4, 17, 0).toISOString(),
        end_at: new Date(2026, 4, 4, 19, 30).toISOString(),
      },
      MASTER_UPDATED_AT,
    );
  });

  test("scope=all auf einem Einzeltermin schreibt die Eingabe literal", async () => {
    // Dort verschiebt eine Datumsänderung den Termin tatsächlich — es gibt
    // keine Serie, die dabei etwas verlieren könnte.
    const ops = makeOps();

    await applyEditScope({
      ops,
      scope: "all",
      eventId: "evt-1",
      occurrenceDate: "2026-05-04",
      isRecurring: false,
      master: anchorMaster({ rrule_freq: null, rrule_byweekday: null }),
      changes: ANCHOR_CHANGES,
    });

    expect(ops.updateMaster).toHaveBeenCalledWith("evt-1", ANCHOR_CHANGES, MASTER_UPDATED_AT);
  });

  test("recurrence → Einzeltermin (rrule_freq null) auf einer Serie schreibt die Eingabe literal", async () => {
    // „Keine Wiederholung" wählen erzwingt Scope `all` und schickt eine
    // RecurrenceChanges mit rrule_freq: null. isRecurring beschreibt den Master
    // *vor* dem Schreiben und ist hier noch true — der Anker darf trotzdem
    // nicht greifen, denn ohne Regel gibt es kein `dtstart` mehr zu schützen.
    const ops = makeOps();
    const none: RecurrenceChanges = {
      rrule_freq: null,
      rrule_interval: 1,
      rrule_byweekday: null,
      rrule_count: null,
      rrule_until: null,
    };

    await applyEditScope({
      ops,
      scope: "all",
      eventId: "evt-1",
      occurrenceDate: "2026-06-15",
      isRecurring: true,
      master: anchorMaster(),
      changes: ANCHOR_CHANGES,
      recurrence: none,
    });

    expect(ops.updateMaster).toHaveBeenCalledWith("evt-1", ANCHOR_CHANGES, MASTER_UPDATED_AT, none);
  });
});

describe("setRruleUntil bekommt einen Tagesende-Instant", () => {
  test("tägliche Serie, forward gelöscht ab dem 15.06. → der 14.06. bleibt vollständig", async () => {
    const ops = makeOps();
    const master = makeMaster({
      rrule_freq: "daily",
      rrule_byweekday: null,
      // 01.06.2026, 18:00 Berlin.
      start_at: "2026-06-01T16:00:00.000Z",
      end_at: "2026-06-01T17:00:00.000Z",
      timezone: "Europe/Berlin",
    });

    await applyDeleteScope({
      ops,
      scope: "forward",
      eventId: "evt-1",
      occurrenceDate: "2026-06-15",
      isRecurring: true,
      master,
    });

    // 14.06. 23:59:59.999 Berlin = 21:59:59.999 UTC — nicht 2026-06-14T00:00:00Z,
    // und erst recht nicht der nackte Datumsstring.
    expect(ops.setRruleUntil).toHaveBeenCalledWith("evt-1", "2026-06-14T21:59:59.999Z");
  });

  test("das Vorkommen am Cutoff-Tag überlebt die Grenze", () => {
    // Gegenprobe auf der Auswertungsseite: mit dem Tagesende-UNTIL liefert die
    // Regel den 14.06. noch, mit Mitternacht-UTC nicht.
    const truncated = {
      ...makeMaster({
        rrule_freq: "daily",
        rrule_byweekday: null,
        start_at: "2026-06-01T16:00:00.000Z",
        end_at: "2026-06-01T17:00:00.000Z",
        timezone: "Europe/Berlin",
      }),
      rrule_until: "2026-06-14T21:59:59.999Z",
    };
    const last = allOccurrences(truncated).at(-1);
    expect(last?.toISOString()).toBe("2026-06-14T16:00:00.000Z");
  });
});
