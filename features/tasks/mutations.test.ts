import type { SupabaseClient } from "@supabase/supabase-js";

import { describe, expect, mock, test } from "bun:test";

import type { Database } from "@/features/supabase/database.types";

import type { DeleteTaskVars, TaskOps, UpdateTaskVars } from "./mutations";
import type { TaskChanges } from "./optimistic";
import type { TaskWithType } from "./types";

import { TaskConflictError, mapTaskError } from "./errors";

/**
 * `mutations.ts` imports `useCurrentParent` from `@/features/auth` for
 * `useCreateTask`/`useToggleTaskDone` — neither hook runs in this suite, but a
 * static import still evaluates the whole barrel, and `@/features/auth`
 * re-exports `AuthGate.tsx`, which pulls in `design-system/ThemeProvider` and
 * therefore `nativewind`. That crashes at *module load* under `bun test`
 * (`react-native-css-interop` fails deeper than a missing native method — a
 * Bun-internal CJS/ESM interop error — so no `bun.test.preload.ts` addition
 * fixes it, unlike the `AppState`/`NativeModules` gaps stubbed there for
 * `react-native` itself). Mocking the barrel locally follows the same pattern
 * as `@/features/supabase` in features/meals/queries.test.ts and
 * features/calendar/reminders.test.ts, keeping the fix scoped to this file
 * instead of risking every other suite.
 *
 * The mock itself is not file-scoped, though: bun's `mock.module` replaces
 * the module process-wide for the rest of the test run, and this stub
 * defines exactly one of the barrel's exports. Today that is harmless — this
 * is the only suite that reaches `@/features/auth` at all, directly or
 * transitively — but a later suite that loads after this one and happens to
 * touch the barrel would get `undefined` for every export but
 * `useCurrentParent`, i.e. a load-time crash rather than a readable
 * assertion failure. Whoever hits that should look here first.
 */
void mock.module("@/features/auth", () => ({ useCurrentParent: () => ({ data: null }) }));

// Imported after the module mock is installed: a static import would be
// hoisted above it and `mutations.ts` would capture the real barrel.
const { createSupabaseTaskOps, deleteTask, updateTask } = await import("./mutations");

const BASE_VERSION = "2026-06-01T00:00:00.000Z";
const THEIR_VERSION = "2026-06-01T09:30:00.000Z";

function makeTask(overrides: Partial<TaskWithType> = {}): TaskWithType {
  return {
    id: "task-1",
    family_id: "fam-1",
    type_id: "type-1",
    child_id: null,
    title: "Mathe Seite 42",
    description: null,
    subject: "Mathe",
    due_date: "2026-06-15",
    due_time: null,
    is_done: false,
    completed_at: null,
    completed_by: null,
    created_by: null,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: BASE_VERSION,
    task_types: null,
    ...overrides,
  };
}

function makeOps(overrides: Partial<TaskOps> = {}): TaskOps {
  return {
    fetchRow: mock(() => Promise.resolve(null)),
    updateRow: mock(() => Promise.resolve(true)),
    deleteRow: mock(() => Promise.resolve(true)),
    ...overrides,
  };
}

const CHANGES: TaskChanges = {
  title: "Mathe Seite 43",
  description: null,
  subject: "Mathe",
  due_date: "2026-06-15",
  due_time: null,
  child_id: null,
  type_id: "type-1",
};

const UPDATE_VARS: UpdateTaskVars = {
  taskId: "task-1",
  changes: CHANGES,
  baseVersion: BASE_VERSION,
};

describe("updateTask", () => {
  test("das CAS trifft: kein Wurf und keine Nachlese", async () => {
    // Der Roundtrip-Vertrag: Im Normalfall — niemand kommt ins Gehege — kostet
    // der Konflikt-Guard keinen zusaetzlichen Lesevorgang.
    const ops = makeOps();
    await updateTask(UPDATE_VARS, ops);
    expect(ops.updateRow).toHaveBeenCalledWith("task-1", CHANGES, BASE_VERSION);
    expect(ops.fetchRow).not.toHaveBeenCalled();
  });

  test("das CAS verfehlt und die Zeile steht noch: TaskConflictError mit der fremden Fassung", async () => {
    const theirs = makeTask({ title: "Mathe Seite 44", updated_at: THEIR_VERSION });
    const ops = makeOps({
      updateRow: mock(() => Promise.resolve(false)),
      fetchRow: mock(() => Promise.resolve(theirs)),
    });

    // Kein `.rejects`: dieselbe `@typescript-eslint/await-thenable`-Luecke in
    // @types/bun wie in den Kalender-Suiten.
    const error = await updateTask(UPDATE_VARS, ops).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(TaskConflictError);
    // Die *nachgelesene* Zeile, nicht irgendeine — daran haengt, dass der
    // Dialog eine frische Basis-Version anbieten kann.
    expect((error as TaskConflictError).row).toBe(theirs);
  });

  test("das CAS verfehlt und die Zeile ist weg: Wurf, der auf hw.error.generic mappt", async () => {
    const ops = makeOps({
      updateRow: mock(() => Promise.resolve(false)),
      fetchRow: mock(() => Promise.resolve(null)),
    });

    const error = await updateTask(UPDATE_VARS, ops).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(TaskConflictError);
    // Bewusst nicht `hw.error.staleReference` — der Key benennt ein totes Kind
    // oder einen toten Aufgabentyp, nicht die verschwundene Zeile selbst.
    expect(mapTaskError(error)).toBe("hw.error.generic");
  });
});

const DELETE_VARS: DeleteTaskVars = { taskId: "task-1", baseVersion: BASE_VERSION };

describe("deleteTask", () => {
  test("das CAS trifft: kein Wurf und keine Nachlese", async () => {
    const ops = makeOps();
    await deleteTask(DELETE_VARS, ops);
    expect(ops.deleteRow).toHaveBeenCalledWith("task-1", BASE_VERSION);
    expect(ops.fetchRow).not.toHaveBeenCalled();
  });

  test("das CAS verfehlt und die Zeile steht noch: TaskConflictError mit der fremden Fassung", async () => {
    // Der beobachtete Zwei-Client-Lauf, jetzt automatisiert: A plant eine
    // Loeschung, B aendert dieselbe Zeile im Undo-Fenster und speichert.
    // Vorher lief das DELETE durch, ohne dass B ein Wort davon erfuhr.
    const theirs = makeTask({ title: "Mathe Seite 44", updated_at: THEIR_VERSION });
    const ops = makeOps({
      deleteRow: mock(() => Promise.resolve(false)),
      fetchRow: mock(() => Promise.resolve(theirs)),
    });

    const error = await deleteTask(DELETE_VARS, ops).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(TaskConflictError);
    expect((error as TaskConflictError).row).toBe(theirs);
  });

  test("GRENZWAECHTER: das CAS verfehlt und die Zeile ist weg: kein Wurf", async () => {
    // Die Absicht ist erfuellt — die Aufgabe ist weg, gleich wessen DELETE sie
    // erwischt hat. Ein Toast „Loeschen fehlgeschlagen" ueber einer Aufgabe,
    // die nicht mehr existiert, waere schlicht falsch (Spec Decision 4).
    // Beim Speichern ist derselbe Fall ein Fehler, weil dort *Inhalt*
    // verlorengeht — siehe den Test darueber.
    const ops = makeOps({
      deleteRow: mock(() => Promise.resolve(false)),
      fetchRow: mock(() => Promise.resolve(null)),
    });

    // Kein `expect(...).resolves` — ein Wurf laesst den Test hier von selbst
    // fehlschlagen, und das ist die Aussage.
    await deleteTask(DELETE_VARS, ops);
    expect(ops.fetchRow).toHaveBeenCalledWith("task-1");
  });

  test("GRENZWAECHTER: die uebergebene baseVersion geht unveraendert an das CAS", async () => {
    // Der Waechter gegen ein spaeteres „wir nehmen doch die frische Version":
    // Mit `task.updated_at` aus der lebenden Query traefe das CAS anstandslos
    // und pruefte damit genau die Fremdaenderung nicht mehr, gegen die es
    // gebaut ist (ADR-031 Decision 6).
    const ops = makeOps();
    await deleteTask({ taskId: "task-7", baseVersion: "2026-01-02T03:04:05.000Z" }, ops);
    expect(ops.deleteRow).toHaveBeenCalledWith("task-7", "2026-01-02T03:04:05.000Z");
  });
});

// ── createSupabaseTaskOps ─────────────────────────────────────────────────
// Ohne diese Suite blieben alle Aufgaben-Tests gruen, wuerde jemand
// `.eq("updated_at", …)` oder `.select("id")` entfernen — also genau die
// Haelften, die zusammen das Compare-and-Swap ausmachen.

/**
 * Doppelgaenger des Query-Builders, den `updateRow` durchlaeuft
 * (`.from().update().eq().eq().select().maybeSingle()`).
 */
function fakeUpdateClient(result: { data: { id: string } | null; error: unknown }) {
  const calls = {
    table: "",
    payload: undefined as unknown,
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
          calls.payload = payload;
          return builder;
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, calls };
}

describe("createSupabaseTaskOps.updateRow", () => {
  test("filtert auf id UND den gesehenen Stempel und liest die id zurueck", async () => {
    const { client, calls } = fakeUpdateClient({ data: { id: "task-1" }, error: null });

    const hit = await createSupabaseTaskOps(client).updateRow("task-1", CHANGES, BASE_VERSION);

    expect(hit).toBe(true);
    expect(calls.table).toBe("tasks");
    expect(calls.payload).toEqual(CHANGES);
    expect(calls.eqCalls).toEqual([
      ["id", "task-1"],
      ["updated_at", BASE_VERSION],
    ]);
    // Ohne `.select(…)` meldet PostgREST auch bei null Zeilen `error: null`.
    expect(calls.selectColumns).toBe("id");
  });

  test("null Zeilen ergeben false, nicht einen Wurf", async () => {
    const { client } = fakeUpdateClient({ data: null, error: null });
    expect(await createSupabaseTaskOps(client).updateRow("task-1", CHANGES, BASE_VERSION)).toBe(
      false,
    );
  });

  test("ein PostgREST-Fehler wird durchgereicht, nicht als Konflikt maskiert", async () => {
    const pgError = { message: "connection reset", code: "08006" };
    const { client } = fakeUpdateClient({ data: null, error: pgError });

    const error = await createSupabaseTaskOps(client)
      .updateRow("task-1", CHANGES, BASE_VERSION)
      .catch((err: unknown) => err);

    expect(error).toBe(pgError);
  });
});

/** Wie `fakeUpdateClient`, nur fuer die Kette `.from().delete().eq().eq().select().maybeSingle()`. */
function fakeDeleteClient(result: { data: { id: string } | null; error: unknown }) {
  const calls = { table: "", eqCalls: [] as [string, unknown][], selectColumns: "" };
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
      return { delete: () => builder };
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, calls };
}

describe("createSupabaseTaskOps.deleteRow", () => {
  test("filtert auf id UND den gesehenen Stempel und liest die id zurueck", async () => {
    const { client, calls } = fakeDeleteClient({ data: { id: "task-1" }, error: null });

    const hit = await createSupabaseTaskOps(client).deleteRow("task-1", BASE_VERSION);

    expect(hit).toBe(true);
    expect(calls.table).toBe("tasks");
    expect(calls.eqCalls).toEqual([
      ["id", "task-1"],
      ["updated_at", BASE_VERSION],
    ]);
    // Der Kern des 0-Zeilen-Guards: Ein DELETE ohne `.select(…)` meldet auch
    // dann Erfolg, wenn es unter RLS oder nach einer Fremdloeschung keine
    // einzige Zeile getroffen hat.
    expect(calls.selectColumns).toBe("id");
  });

  test("null Zeilen ergeben false, nicht einen Wurf", async () => {
    const { client } = fakeDeleteClient({ data: null, error: null });
    expect(await createSupabaseTaskOps(client).deleteRow("task-1", BASE_VERSION)).toBe(false);
  });

  test("ein PostgREST-Fehler wird durchgereicht, nicht als Erfolg maskiert", async () => {
    // Ohne den Wurf faellt `deleteRow` auf `false` zurueck, `deleteTask` liest
    // nach, und kommt die Nachlese leer zurueck — RLS oder eine echte
    // Race — meldet das Loeschen Erfolg ueber einem verschluckten Fehler.
    // Genau die Fehlerklasse, gegen die dieser Zweig gebaut ist.
    const pgError = { message: "connection reset", code: "08006" };
    const { client } = fakeDeleteClient({ data: null, error: pgError });

    const error = await createSupabaseTaskOps(client)
      .deleteRow("task-1", BASE_VERSION)
      .catch((err: unknown) => err);

    expect(error).toBe(pgError);
  });
});
