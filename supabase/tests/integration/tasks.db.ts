/**
 * Integrationstests von `delete_task` gegen die lokale Supabase (Spec §7, §9),
 * über den echten Aufgaben-Pfad (`createSupabaseTaskOps`, `deleteTask`) mit
 * eingesetzten Clients. Siehe `calendar.db.ts` zu Isolation und Aufräumen.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  mock,
  setDefaultTimeout,
} from "bun:test";

import { TaskConflictError, TaskForbiddenError } from "@/features/tasks/errors";

import { adminClient, SEED, signedInClient, type Client } from "./clients";

// `mutations.ts` zieht über `@/features/auth` nativewind herein, das unter Bun
// schon beim Laden abstürzt. Dieselbe Umgehung wie in
// `features/tasks/mutations.test.ts` (dort die ausführliche Begründung): Die
// Hooks laufen hier nie, nur `createSupabaseTaskOps` und `deleteTask`. Der Mock
// gilt prozessweit, ist aber in einem eigenen `bun test`-Lauf für diese Datei
// unschädlich.
void mock.module("@/features/auth", () => ({
  useCurrentParent: () => ({ data: null }),
  useFamilyChildren: () => ({ data: undefined }),
}));

// Nach dem Mock geladen: Ein statischer Import würde über ihn hinausgehoben.
const { createSupabaseTaskOps, deleteTask } = await import("@/features/tasks/mutations");

setDefaultTimeout(30_000);

const RUN = `dbit-${crypto.randomUUID().slice(0, 8)}`;

let admin: Client;
let clientA: Client;
let clientB: Client;
let taskTypeId: string;
const createdTasks: string[] = [];
const createdUsers: string[] = [];

beforeAll(async () => {
  admin = adminClient();
  [clientA, clientB] = await Promise.all([
    signedInClient(SEED.emailA),
    signedInClient(SEED.emailB),
  ]);
  const { data, error } = await admin
    .from("task_types")
    .select("id")
    .eq("slug", "besorgung")
    .is("family_id", null)
    .single();
  if (error) throw error;
  taskTypeId = data.id;
});

afterEach(async () => {
  const { error } = await admin.from("tasks").delete().in("id", createdTasks);
  if (error) throw error;
  createdTasks.length = 0;
  for (const userId of createdUsers.splice(0)) {
    const { error: userError } = await admin.auth.admin.deleteUser(userId);
    if (userError) throw userError;
  }
});

afterAll(async () => {
  await Promise.all([clientA.auth.signOut(), clientB.auth.signOut()]);
});

/** Legt eine Aufgabe der Testfamilie an (Service-Role) und liefert ihren Stand. */
async function seedTask() {
  const { data, error } = await admin
    .from("tasks")
    .insert({
      family_id: SEED.familyId,
      type_id: taskTypeId,
      title: `${RUN} Aufgabe`,
      due_date: "2026-11-20",
      created_by: SEED.parentA,
    })
    .select("id, updated_at")
    .single();
  if (error) throw error;
  createdTasks.push(data.id);
  return data;
}

async function exists(id: string) {
  const { data, error } = await admin.from("tasks").select("id").eq("id", id).maybeSingle();
  if (error) throw error;
  return data !== null;
}

describe("delete_task gegen die lokale Instanz", () => {
  it("löscht mit passendem Stand: deleted, danach missing", async () => {
    const task = await seedTask();
    const ops = createSupabaseTaskOps(clientA);

    expect(await ops.deleteRow(task.id, task.updated_at)).toBe("deleted");
    expect(await exists(task.id)).toBe(false);
    expect(await ops.deleteRow(task.id, task.updated_at)).toBe("missing");
  });

  it("hat B die Aufgabe inzwischen geändert: deleteTask wirft TaskConflictError, die Zeile bleibt", async () => {
    const task = await seedTask();
    const { error } = await clientB
      .from("tasks")
      .update({ title: `${RUN} von B` })
      .eq("id", task.id);
    if (error) throw error;

    // Kein `.rejects`: `@typescript-eslint/await-thenable` kennt es bei @types/bun nicht.
    const failure = await deleteTask(
      { taskId: task.id, baseVersion: task.updated_at },
      createSupabaseTaskOps(clientA),
    ).catch((err: unknown) => err);
    expect(failure).toBeInstanceOf(TaskConflictError);
    expect(await exists(task.id)).toBe(true);
  });

  it("eine Aufgabe der Fremdfamilie ist für A unsichtbar: missing, die Zeile bleibt", async () => {
    const { data, error } = await admin
      .from("tasks")
      .select("updated_at")
      .eq("id", SEED.foreignTask)
      .single();
    if (error) throw error;

    const outcome = await createSupabaseTaskOps(clientA).deleteRow(
      SEED.foreignTask,
      data.updated_at,
    );
    expect(outcome).toBe("missing");
    expect(await exists(SEED.foreignTask)).toBe(true);
  });

  it("ohne Familienzugehörigkeit: forbidden, deleteTask wirft TaskForbiddenError, die Zeile bleibt", async () => {
    // Derselbe Serverzustand wie bei einem aus der Familie entfernten Elternteil:
    // Es gibt keine `parents`-Zeile. B's Zeile zu löschen und wiederherzustellen
    // wäre falsch — `created_by`/`completed_by` hängen mit `on delete set null`
    // daran, die Wiederherstellung brächte den Seed also nicht zurück. Deshalb
    // ein Wegwerf-Nutzer, der nie ein Elternteil war.
    const task = await seedTask();
    const email = `${RUN}-ohne-familie@test.local`;
    const password = "lokal-test-1";
    const { data: user, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    createdUsers.push(user.user.id);
    const outsider = await signedInClient(email, password);
    const ops = createSupabaseTaskOps(outsider);

    expect(await ops.deleteRow(task.id, task.updated_at)).toBe("forbidden");
    const failure = await deleteTask({ taskId: task.id, baseVersion: task.updated_at }, ops).catch(
      (err: unknown) => err,
    );
    expect(failure).toBeInstanceOf(TaskForbiddenError);
    expect(await exists(task.id)).toBe(true);
    await outsider.auth.signOut();
  });
});
