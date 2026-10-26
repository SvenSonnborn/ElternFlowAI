/**
 * Integrationstests des Kalender-Schreibpfads gegen die lokale Supabase, mit
 * zwei angemeldeten Clients (A und B der Testfamilie, Spec §9). Sie laufen über
 * `bun run test:db`, nicht über `bun test` — die Endung `.db.ts` hält sie aus
 * dem Einsammeln heraus.
 *
 * Alles geht durch den echten Client-Pfad (`updateEvent`, `createEvent`,
 * `createSupabaseApplyEventChange`, `fetchEventById`), nur mit eingesetzten
 * Clients statt des Modul-Clients. Jeder Test legt seine Termine selbst an und
 * räumt sie in `afterEach` über den Service-Role-Client wieder ab; der Seed
 * bleibt unberührt, und der Lauf ist beliebig oft wiederholbar, weil Titel und
 * Kennungen jedes Mal frisch sind.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, setDefaultTimeout } from "bun:test";

import { createEvent, type CreateEventVars } from "@/features/calendar/createMutation";
import { EventConflictError } from "@/features/calendar/errors";
import { createSupabaseApplyEventChange } from "@/features/calendar/eventChange";
import { updateEvent, type UpdateEventDeps } from "@/features/calendar/mutations";
import { EVENT_SELECT, fetchEventById } from "@/features/calendar/queries";
import { occurrenceVersion, parseOccurrenceVersion } from "@/features/calendar/version";

import { adminClient, purgeBookings, SEED, signedInClient, type Client } from "./clients";

setDefaultTimeout(30_000);

/** Macht Titel dieses Laufs erkennbar, damit auch abgespaltene Hälften aufgeräumt werden. */
const RUN = `dbit-${crypto.randomUUID().slice(0, 8)}`;

let admin: Client;
let clientA: Client;
let clientB: Client;
let familyTypeId: string;
const created: string[] = [];

beforeAll(async () => {
  admin = adminClient();
  [clientA, clientB] = await Promise.all([
    signedInClient(SEED.emailA),
    signedInClient(SEED.emailB),
  ]);
  const { data, error } = await admin
    .from("event_types")
    .select("id")
    .eq("slug", "family")
    .is("family_id", null)
    .single();
  if (error) throw error;
  familyTypeId = data.id;
});

afterEach(async () => {
  // Exceptions hängen per Fremdschlüssel an den Terminen; die Titel fangen die
  // abgespaltenen Hälften, deren IDs der Server vergibt.
  await purgeBookings(created);
  const { error: byId } = await admin.from("events").delete().in("id", created);
  if (byId) throw byId;
  const { error: byTitle } = await admin.from("events").delete().like("title", `${RUN}%`);
  if (byTitle) throw byTitle;
  created.length = 0;
});

afterAll(async () => {
  await Promise.all([clientA.auth.signOut(), clientB.auth.signOut()]);
});

/** Dienstag 2026-11-03 08:00 Berlin; die Serie läuft dienstags. */
const START = "2026-11-03T07:00:00.000Z";
const END = "2026-11-03T08:00:00.000Z";

let counter = 0;

/** Legt als A einen eigenen Termin an und merkt ihn zum Aufräumen. */
async function seedEvent(
  extra: Partial<CreateEventVars> = {},
): Promise<{ id: string; title: string }> {
  const id = crypto.randomUUID();
  const title = `${RUN} ${(counter += 1)}`;
  created.push(id);
  await createEvent(
    {
      id,
      familyId: SEED.familyId,
      typeId: familyTypeId,
      childId: null,
      parentId: null,
      title,
      startAt: START,
      endAt: END,
      allDay: false,
      timezone: "Europe/Berlin",
      location: null,
      description: null,
      recurrence: "none",
      recurrenceCount: null,
      createdBy: SEED.parentA,
      ...extra,
    },
    clientA,
  );
  return { id, title };
}

/** Legt eine eigene Exception an, wie der Seed sie an e2 hat. */
async function seedException(eventId: string, occurrenceDate: string, title: string) {
  const { error } = await admin.from("event_exceptions").insert({
    event_id: eventId,
    occurrence_date: occurrenceDate,
    action: "modified",
    override: { title },
  });
  if (error) throw error;
}

async function load(client: Client, id: string) {
  const row = await fetchEventById(id, client);
  if (!row) throw new Error(`Termin ${id} nicht sichtbar`);
  return row;
}

async function exceptionsOf(eventId: string) {
  const { data, error } = await admin
    .from("event_exceptions")
    .select("*")
    .eq("event_id", eventId)
    .order("occurrence_date");
  if (error) throw error;
  return data;
}

function depsFor(client: Client): UpdateEventDeps {
  return {
    fetchMaster: (id) => fetchEventById(id, client),
    applyChange: createSupabaseApplyEventChange(client),
  };
}

const changes = (title: string, start = START, end = END) => ({
  title,
  start_at: start,
  end_at: end,
  location: null,
  description: null,
});

describe("apply_event_change gegen die lokale Instanz", () => {
  it("A liest über EVENT_SELECT, baut das Token und schreibt zurück: applied, kein Konflikt", async () => {
    const { id } = await seedEvent({ recurrence: "weekly" });
    await seedException(id, "2026-11-10", "Ausnahme");

    // Mit Exception-Stempel im Token: Der Zeitstempel muss die Reise durch
    // PostgREST und zurück unverändert überstehen, sonst meldet der Server
    // einen Konflikt gegen A's eigenen, frisch gelesenen Stand.
    const row = await load(clientA, id);
    expect(EVENT_SELECT).toContain("event_exceptions");
    const token = occurrenceVersion(row, "2026-11-10");
    expect(parseOccurrenceVersion(token).exceptionUpdatedAt).not.toBeNull();

    const result = await createSupabaseApplyEventChange(clientA)({
      requestId: crypto.randomUUID(),
      eventId: id,
      occurrenceKey: "2026-11-10",
      seen: parseOccurrenceVersion(token),
      steps: [{ op: "modify_occurrence", override: { title: `${RUN} geändert` } }],
    });
    expect(result).toBe("applied");
    const [exception] = await exceptionsOf(id);
    expect(exception.override).toMatchObject({ title: `${RUN} geändert` });
  });

  it("A und B schicken mit derselben Basis gleichzeitig: genau ein applied, einmal EF409", async () => {
    const { id } = await seedEvent();
    const token = occurrenceVersion(await load(clientA, id), "2026-11-03");
    const send = (client: Client, title: string) =>
      createSupabaseApplyEventChange(client)({
        requestId: crypto.randomUUID(),
        eventId: id,
        occurrenceKey: "2026-11-03",
        seen: parseOccurrenceVersion(token),
        steps: [{ op: "update_master", changes: changes(title) }],
      });

    const results = await Promise.allSettled([
      send(clientA, `${RUN} von A`),
      send(clientB, `${RUN} von B`),
    ]);

    const applied = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(applied.map((r) => r.value)).toEqual(["applied"]);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ code: "EF409", details: "master" });
  });

  it("dieselbe request_id zweimal gleichzeitig: applied + already_applied, Wirkung einmal", async () => {
    const { id } = await seedEvent({ recurrence: "weekly" });
    const token = occurrenceVersion(await load(clientA, id), "2026-11-10");
    const requestId = crypto.randomUUID();
    const send = () =>
      createSupabaseApplyEventChange(clientA)({
        requestId,
        eventId: id,
        occurrenceKey: "2026-11-10",
        seen: parseOccurrenceVersion(token),
        steps: [{ op: "cancel_occurrence" }],
      });

    const results = await Promise.allSettled([send(), send()]);

    expect(
      results.map((r) => (r.status === "fulfilled" ? r.value : (r.reason as unknown))).sort(),
    ).toEqual(["already_applied", "applied"]);
    expect(await exceptionsOf(id)).toHaveLength(1);
  });

  it("Forward-Split auf einer Zählserie, danach dieselben vars (verlorene Antwort): genau eine abgespaltene Serie", async () => {
    const { id } = await seedEvent({ recurrence: "weekly", recurrenceCount: 10 });
    const key = "2026-11-17";
    const vars = {
      scope: "forward" as const,
      eventId: id,
      occurrenceKey: key,
      isRecurring: true,
      baseVersion: occurrenceVersion(await load(clientA, id), key),
      requestId: crypto.randomUUID(),
      changes: changes(`${RUN} Split`, "2026-11-17T07:00:00.000Z", "2026-11-17T08:00:00.000Z"),
      timezone: "Europe/Berlin",
    };
    const splitCount = async () => {
      const { data, error } = await admin.from("events").select("id").eq("title", `${RUN} Split`);
      if (error) throw error;
      return data.length;
    };

    await updateEvent(vars, depsFor(clientA));
    expect(await splitCount()).toBe(1);

    // Die Antwort ging verloren, der Nutzer tippt „Erneut versuchen": dieselben
    // vars, dieselbe Kennung, aber der Master hat sich inzwischen verändert.
    await updateEvent(vars, depsFor(clientA));
    expect(await splitCount()).toBe(1);
  });

  it("Regelwechsel durch A, während B dieselbe Occurrence geändert hat: EventConflictError, Exceptions unverändert", async () => {
    const { id } = await seedEvent({ recurrence: "weekly" });
    await seedException(id, "2026-11-17", "Andere Occurrence");
    const key = "2026-11-10";
    const occurrence = changes(`${RUN} B`, "2026-11-10T07:00:00.000Z", "2026-11-10T08:00:00.000Z");

    // Beide laden dieselbe Occurrence und halten damit dieselbe Basis.
    const baseA = occurrenceVersion(await load(clientA, id), key);
    const baseB = occurrenceVersion(await load(clientB, id), key);
    expect(baseA).toBe(baseB);

    await updateEvent(
      {
        scope: "this",
        eventId: id,
        occurrenceKey: key,
        isRecurring: true,
        baseVersion: baseB,
        requestId: crypto.randomUUID(),
        changes: occurrence,
        timezone: "Europe/Berlin",
      },
      depsFor(clientB),
    );
    const afterB = await exceptionsOf(id);
    expect(afterB).toHaveLength(2);

    const conflict = await updateEvent(
      {
        scope: "all",
        eventId: id,
        occurrenceKey: key,
        isRecurring: true,
        baseVersion: baseA,
        requestId: crypto.randomUUID(),
        changes: { ...occurrence, title: `${RUN} A` },
        recurrence: {
          rrule_freq: "daily",
          rrule_interval: 1,
          rrule_byweekday: null,
          rrule_count: null,
          rrule_until: null,
        },
        timezone: "Europe/Berlin",
      },
      depsFor(clientA),
    ).catch((err: unknown) => err);
    expect(conflict).toBeInstanceOf(EventConflictError);

    expect(await exceptionsOf(id)).toEqual(afterB);
    expect((await load(clientA, id)).rrule_freq).toBe("weekly");
  });
});

describe("createEvent gegen die lokale Instanz", () => {
  it("zweimal mit derselben id legt genau einen Termin an", async () => {
    const { id } = await seedEvent();
    await seedEventAgain(id);

    const { data, error } = await admin.from("events").select("id").eq("id", id);
    if (error) throw error;
    expect(data).toHaveLength(1);
  });

  it("mit der id eines Termins der Fremdfamilie: Fehler, der Fremdtermin bleibt unberührt", async () => {
    const before = await admin.from("events").select("*").eq("id", SEED.foreignEvent).single();
    if (before.error) throw before.error;

    // Kein `.rejects`: `@typescript-eslint/await-thenable` kennt es bei @types/bun nicht.
    const failure = await createEvent(
      {
        id: SEED.foreignEvent,
        familyId: SEED.familyId,
        typeId: familyTypeId,
        childId: null,
        parentId: null,
        title: `${RUN} Übernahme`,
        startAt: START,
        endAt: END,
        allDay: false,
        timezone: "Europe/Berlin",
        location: null,
        description: null,
        recurrence: "none",
        recurrenceCount: null,
        createdBy: SEED.parentA,
      },
      clientA,
    ).catch((err: unknown) => err);
    expect(failure).toBeInstanceOf(Error);

    const after = await admin.from("events").select("*").eq("id", SEED.foreignEvent).single();
    if (after.error) throw after.error;
    expect(after.data).toEqual(before.data);
    const { data: stray } = await admin.from("events").select("id").like("title", `${RUN}%`);
    expect(stray).toHaveLength(0);
  });
});

/** Sendet den Anlege-Aufruf zu `id` ein zweites Mal, mit sonst gleichen Werten. */
async function seedEventAgain(id: string) {
  const row = await load(clientA, id);
  await createEvent(
    {
      id,
      familyId: SEED.familyId,
      typeId: familyTypeId,
      childId: null,
      parentId: null,
      title: row.title,
      startAt: START,
      endAt: END,
      allDay: false,
      timezone: "Europe/Berlin",
      location: null,
      description: null,
      recurrence: "none",
      recurrenceCount: null,
      createdBy: SEED.parentA,
    },
    clientA,
  );
}
