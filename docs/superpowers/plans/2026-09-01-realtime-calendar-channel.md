# Realtime-Kanal für den Kalender — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Änderungen an `events` und `event_exceptions` verlassen die Datenbank über Supabase Realtime und laufen in einem Debug-Screen sichtbar ein — das Fundament, auf das Issue #51 den Live-Sync des Kalenders setzt.

**Architecture:** Eine Migration nimmt beide Tabellen in die Publikation `supabase_realtime` auf. `features/calendar/realtime.ts` bildet einen Kanal pro Familie (`calendar:<familyId>`) mit zwei `postgres_changes`-Bindings ab, zerlegt in reine Funktionen, eine React-freie Kernfunktion und einen dünnen Hook. Ein Dev-Screen unter `app/debug/realtime.tsx` zeigt den Strom roh an.

**Tech Stack:** Expo SDK 57 · React 19.2 / React Native 0.86 · TypeScript ~6.0 (strict) · `@supabase/supabase-js` 2.112.3 (Realtime) · NativeWind v4 · Zustand · TanStack Query · `bun test`

**Spec:** [docs/superpowers/specs/2026-09-01-realtime-calendar-channel-design.md](../specs/2026-09-01-realtime-calendar-channel-design.md)

## Global Constraints

- **Das Handoff-Bundle ist tabu.** `design-system/{colors,typography,spacing,themes,components,index}.ts`, `docs/{HANDOFF,COPY,ICONS,README}.md`, `patterns/*.md` werden in diesem Plan **nicht** angefasst. Tokens werden konsumiert, nie erfunden.
- **Routing-Konvention:** Dateien in `app/` sind dünne Re-Exporte; die Implementierung lebt in `app-sections/`.
- **Touch-Targets ≥ 44 × 44.** `Button size="md"` ist `h-11` (44 px) — `size="sm"` (`h-9`) ist hier **nicht** zulässig.
- **Du-Form, nie Sie.** Gilt auch für den Dev-Screen.
- **Keine `debug.*`-Keys in `features/i18n/locales/*.json`.** Der Debug-Screen trägt hartkodierte deutsche Copy hinter einem file-level `eslint-disable i18next/no-literal-string` (Spec Decision 8).
- **Kein `Co-Authored-By: Claude`-Trailer** in Commit-Messages. Conventional-Commit-Präfix, auf den Bereich gescoped.
- **`--no-verify` ist verboten.** Pre-commit-Hooks (`lint-staged`) laufen immer.
- **Tests importieren `features/calendar/realtime` direkt**, nie über das Barrel `@/features/calendar` — das Barrel exportiert aus `./hooks`, das über `useTheme` das nativewind-Runtime hereinzieht und unter `bun test` beim Modul-Laden scheitert.
- **Verifikationsbefehle:** `bun test`, `bun run typecheck`, `bun lint`, `bun run format:check` (zusammen: `bun run check`).

---

### Task 1: Migration — beide Tabellen in die Publikation aufnehmen

**Files:**

- Create: `supabase/migrations/20260901093000_realtime_calendar.sql`

**Interfaces:**

- Consumes: nichts.
- Produces: die serverseitige Voraussetzung dafür, dass die Bindings aus Task 3 überhaupt Ereignisse bekommen. Kein TypeScript-Vertrag.

Für SQL gibt es in diesem Repo keinen Testlauf — die Migrationen werden gegen die Cloud-DB gefahren, nicht in CI. Der Prüfschritt ist deshalb Lesbarkeit und Idempotenz, nicht ein roter Test.

- [ ] **Step 1: Migration schreiben**

```sql
-- Eltern Flow AI: Realtime für den Kalender
-- Spec: docs/superpowers/specs/2026-09-01-realtime-calendar-channel-design.md (§3)
--
-- Nimmt `events` und `event_exceptions` in die Publikation `supabase_realtime`
-- auf. Das ist derselbe Vorgang wie der Schalter unter Database → Replication
-- im Dashboard; Realtime selbst ist auf einem Supabase-Projekt bereits an.
--
-- Idempotent, weil Postgres kein `create publication if not exists` kennt und
-- `alter publication … add table` auf ein bereits aufgenommenes Ziel mit
-- 42710 (duplicate_object) fehlschlägt.

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'events'
  ) then
    alter publication supabase_realtime add table public.events;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'event_exceptions'
  ) then
    alter publication supabase_realtime add table public.event_exceptions;
  end if;
end $$;

-- Bewusst KEIN `replica identity full` auf beiden Tabellen.
--
-- Es würde `payload.old` mit den vorherigen Spaltenwerten füllen — aber nur bei
-- Tabellen ohne RLS. Beide Tabellen hier stehen auf `enable row level security`
-- UND `force row level security` (20260529091933_calendar.sql), `payload.old`
-- trägt deshalb so oder so ausschließlich den Primärschlüssel. Die Einstellung
-- erhöhte nur das WAL-Volumen.
--
-- Damit verbunden und ebenfalls nicht reparierbar: RLS greift bei
-- `postgres_changes` nicht auf DELETE — Postgres kann eine bereits gelöschte
-- Zeile nicht mehr gegen eine Policy prüfen. Lösch-Ereignisse erreichen also
-- jeden abonnierten Client, mit nichts als der Row-Id. Der Client bildet das in
-- `CalendarChange.eventId: string | null` ab (features/calendar/realtime.ts).
```

- [ ] **Step 2: Idempotenz gegenlesen**

Run: `grep -c "if not exists" supabase/migrations/20260901093000_realtime_calendar.sql`
Expected: `3` — eine Prüfung für die Publikation, je eine pro Tabelle.

- [ ] **Step 3: Format-Gate**

Run: `bun run format:check`
Expected: PASS. (Prettier formatiert `.sql` nicht — der Lauf beweist, dass die neue Datei nichts anderes bricht.)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260901093000_realtime_calendar.sql
git commit -m "feat(realtime): events und event_exceptions in die supabase_realtime-Publikation aufnehmen"
```

- [ ] **Step 5: Anwendungs-Hinweis notieren (kein Code)**

Die Migration wird in dieser Session **nicht** gefahren — der Supabase-MCP-Server ist nicht authentifiziert. Halte im Abschlussbericht fest: Nach `apply_migration` per MCP muss die lokale Datei auf die tatsächlich vergebene Version umbenannt werden (`list_migrations` zeigt sie), siehe [supabase/SETUP.md](../../../supabase/SETUP.md) §3. Bleibt die Divergenz stehen, hält die CLI die Migration für nicht angewendet und fährt bei `db push` die Basis-Migrationen erneut — die mit `drop table … cascade` beginnen.

---

### Task 2: Reiner Kern — Typen, Topic, Bindings, Status, Normalisierung

**Files:**

- Create: `features/calendar/realtime.ts`
- Test: `features/calendar/realtime.test.ts`

**Interfaces:**

- Consumes: `Database` aus `@/features/supabase/database.types` (nur in Task 3), Typen aus `@supabase/supabase-js`.
- Produces:
  - `type CalendarRealtimeTable = "events" | "event_exceptions"`
  - `type CalendarChangeType = "INSERT" | "UPDATE" | "DELETE"`
  - `type CalendarRealtimeStatus = "idle" | "subscribing" | "subscribed" | "timedOut" | "error" | "closed"`
  - `interface CalendarChange { table: CalendarRealtimeTable; type: CalendarChangeType; rowId: string | null; eventId: string | null; receivedAt: number }`
  - `interface CalendarBinding { event: "*"; schema: "public"; table: CalendarRealtimeTable; filter?: string }`
  - `const CALENDAR_CHANNEL_PREFIX = "calendar"`
  - `calendarChannelTopic(familyId: string): string`
  - `calendarBindings(familyId: string): CalendarBinding[]`
  - `toRealtimeStatus(state: \`${REALTIME_SUBSCRIBE_STATES}\`): CalendarRealtimeStatus`
  - `normalizeChange(table, payload, now?): CalendarChange`

- [ ] **Step 1: Die fehlschlagenden Tests schreiben**

Create `features/calendar/realtime.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

import {
  CALENDAR_CHANNEL_PREFIX,
  calendarBindings,
  calendarChannelTopic,
  normalizeChange,
  toRealtimeStatus,
  type CalendarRealtimeTable,
} from "./realtime";

const FAMILY_ID = "fam-1";
const AT = 1_700_000_000_000;
const now = () => AT;

/**
 * Baut einen `postgres_changes`-Payload in der Form, in der Supabase ihn
 * liefert: `new` trägt die Zeile bei INSERT/UPDATE, `old` bei DELETE nur den
 * Primärschlüssel (RLS läuft dort nicht).
 */
function payload(
  table: CalendarRealtimeTable,
  eventType: "INSERT" | "UPDATE" | "DELETE",
  row: Record<string, unknown>,
): RealtimePostgresChangesPayload<Record<string, unknown>> {
  const base = { schema: "public", table, commit_timestamp: "2026-09-01T09:30:00Z", errors: [] };
  if (eventType === "DELETE") return { ...base, eventType, new: {}, old: row };
  if (eventType === "UPDATE") return { ...base, eventType, new: row, old: {} };
  return { ...base, eventType, new: row, old: {} };
}

describe("calendarChannelTopic", () => {
  test("bildet ein Topic pro Familie", () => {
    expect(calendarChannelTopic(FAMILY_ID)).toBe(`${CALENDAR_CHANNEL_PREFIX}:${FAMILY_ID}`);
  });

  test("trennt zwei Familien", () => {
    expect(calendarChannelTopic("a")).not.toBe(calendarChannelTopic("b"));
  });
});

describe("calendarBindings", () => {
  test("bindet genau zwei Tabellen im public-Schema an alle Event-Typen", () => {
    const bindings = calendarBindings(FAMILY_ID);
    expect(bindings).toHaveLength(2);
    expect(bindings.map((b) => b.table)).toEqual(["events", "event_exceptions"]);
    for (const b of bindings) {
      expect(b.event).toBe("*");
      expect(b.schema).toBe("public");
    }
  });

  test("filtert events serverseitig auf die Familie", () => {
    const [events] = calendarBindings(FAMILY_ID);
    expect(events.filter).toBe(`family_id=eq.${FAMILY_ID}`);
  });

  test("lässt event_exceptions ungefiltert — die Tabelle hat keine family_id", () => {
    const [, exceptions] = calendarBindings(FAMILY_ID);
    expect(exceptions.filter).toBeUndefined();
  });
});

describe("toRealtimeStatus", () => {
  test("bildet alle vier Subscribe-States ab", () => {
    expect(toRealtimeStatus("SUBSCRIBED")).toBe("subscribed");
    expect(toRealtimeStatus("TIMED_OUT")).toBe("timedOut");
    expect(toRealtimeStatus("CLOSED")).toBe("closed");
    expect(toRealtimeStatus("CHANNEL_ERROR")).toBe("error");
  });
});

describe("normalizeChange — events", () => {
  test("INSERT: eventId ist die eigene Id", () => {
    const change = normalizeChange(
      "events",
      payload("events", "INSERT", { id: "evt-1", family_id: FAMILY_ID }),
      now,
    );
    expect(change).toEqual({
      table: "events",
      type: "INSERT",
      rowId: "evt-1",
      eventId: "evt-1",
      receivedAt: AT,
    });
  });

  test("UPDATE: eventId ist die eigene Id", () => {
    const change = normalizeChange("events", payload("events", "UPDATE", { id: "evt-2" }), now);
    expect(change.rowId).toBe("evt-2");
    expect(change.eventId).toBe("evt-2");
  });

  test("DELETE: rowId kommt aus old, eventId bleibt null", () => {
    const change = normalizeChange("events", payload("events", "DELETE", { id: "evt-3" }), now);
    expect(change.rowId).toBe("evt-3");
    expect(change.eventId).toBeNull();
  });
});

describe("normalizeChange — event_exceptions", () => {
  test("INSERT: eventId kommt aus event_id, nicht aus id", () => {
    const change = normalizeChange(
      "event_exceptions",
      payload("event_exceptions", "INSERT", { id: "exc-1", event_id: "evt-9" }),
      now,
    );
    expect(change.rowId).toBe("exc-1");
    expect(change.eventId).toBe("evt-9");
  });

  test("UPDATE: eventId kommt aus event_id", () => {
    const change = normalizeChange(
      "event_exceptions",
      payload("event_exceptions", "UPDATE", { id: "exc-2", event_id: "evt-8" }),
      now,
    );
    expect(change.eventId).toBe("evt-8");
  });

  test("DELETE: die Exception ist ihrem Event nicht zuzuordnen", () => {
    const change = normalizeChange(
      "event_exceptions",
      payload("event_exceptions", "DELETE", { id: "exc-3" }),
      now,
    );
    expect(change.rowId).toBe("exc-3");
    expect(change.eventId).toBeNull();
  });
});

describe("normalizeChange — fehlende Felder", () => {
  test("ein Payload ohne id liefert null statt undefined oder einer Ausnahme", () => {
    const change = normalizeChange("events", payload("events", "INSERT", {}), now);
    expect(change.rowId).toBeNull();
    expect(change.eventId).toBeNull();
  });

  test("ein nicht-string id-Feld wird verworfen", () => {
    const change = normalizeChange("events", payload("events", "INSERT", { id: 42 }), now);
    expect(change.rowId).toBeNull();
  });
});
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `bun test features/calendar/realtime.test.ts`
Expected: FAIL — `Cannot find module './realtime'`.

- [ ] **Step 3: Den reinen Kern implementieren**

Create `features/calendar/realtime.ts`:

```ts
import type {
  REALTIME_SUBSCRIBE_STATES,
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";

/**
 * Realtime-Kanal für den Kalender: ein Topic pro Familie, zwei
 * `postgres_changes`-Bindings auf `events` und `event_exceptions`.
 *
 * Der Schnitt in reine Funktionen, eine React-freie Kernfunktion und einen
 * dünnen Hook ist keine Stilfrage, sondern die einzige Form, in der das Modul
 * hier prüfbar ist: Im Repo gibt es keinen Pfad, auf dem React-Komponenten
 * unter `bun test` rendern, und `features/calendar/hooks.ts` ist über
 * `useTheme` → nativewind-Runtime nicht einmal ladbar (siehe docs/TODO.md).
 *
 * Spec: docs/superpowers/specs/2026-09-01-realtime-calendar-channel-design.md
 * Entscheidung: ADR-028.
 */

export type CalendarRealtimeTable = "events" | "event_exceptions";
export type CalendarChangeType = "INSERT" | "UPDATE" | "DELETE";

export type CalendarRealtimeStatus =
  /** Kein `familyId` — es gibt nichts zu abonnieren. */
  "idle" | "subscribing" | "subscribed" | "timedOut" | "error" | "closed";

export interface CalendarChange {
  table: CalendarRealtimeTable;
  type: CalendarChangeType;
  /** Primärschlüssel der geänderten Zeile. Bei DELETE das einzige belastbare Feld. */
  rowId: string | null;
  /**
   * Die Event-Id, an der eine Invalidierung hängen kann: bei `events` die eigene
   * `id`, bei `event_exceptions` die `event_id`.
   *
   * **Bei DELETE immer `null`.** RLS greift bei `postgres_changes` nicht auf
   * DELETE — Postgres kann eine gelöschte Zeile nicht mehr gegen eine Policy
   * prüfen —, der Payload trägt deshalb nur den Primärschlüssel, und der einer
   * Exception verrät ihre Event-Id nicht. Das steht im Typ und nicht in einem
   * Kommentar, damit ein Konsument die Fallunterscheidung nicht übersehen kann.
   */
  eventId: string | null;
  receivedAt: number;
}

export interface CalendarBinding {
  event: "*";
  schema: "public";
  table: CalendarRealtimeTable;
  /** PostgREST-Ausdruck. Fehlt, wo die Tabelle keine `family_id`-Spalte hat. */
  filter?: string;
}

export const CALENDAR_CHANNEL_PREFIX = "calendar";

export function calendarChannelTopic(familyId: string): string {
  return `${CALENDAR_CHANNEL_PREFIX}:${familyId}`;
}

/**
 * Ein Kanal trägt beide Bindings — zwei Topics kosteten zwei WebSocket-
 * Abonnements und zwei Zustände für etwas, das nur gemeinsam gebraucht wird.
 */
export function calendarBindings(familyId: string): CalendarBinding[] {
  return [
    { event: "*", schema: "public", table: "events", filter: `family_id=eq.${familyId}` },
    // Ohne Filter: `event_exceptions` hat keine `family_id`-Spalte, nur
    // `event_id`. RLS filtert INSERT und UPDATE über die
    // `exists (… events … current_family_id())`-Policy; DELETE bleibt
    // ungefiltert (siehe `CalendarChange.eventId`). Die Spalte zu
    // denormalisieren löste den DELETE-Fall nicht mit — verworfen in ADR-028.
    { event: "*", schema: "public", table: "event_exceptions" },
  ];
}

export function toRealtimeStatus(state: `${REALTIME_SUBSCRIBE_STATES}`): CalendarRealtimeStatus {
  switch (state) {
    case "SUBSCRIBED":
      return "subscribed";
    case "TIMED_OUT":
      return "timedOut";
    case "CLOSED":
      return "closed";
    case "CHANNEL_ERROR":
      return "error";
  }
}

/**
 * `unknown` statt `object` als Eingabe: Der Payload-Union trägt `new` bzw. `old`
 * je nach Variante als `{}`, und `{}` ist in TypeScript **nicht** `object`
 * zuweisbar (es schließt Primitive ein). Die Laufzeitprüfung hier kostet nichts
 * und erspart eine Behauptung, die nichts prüft.
 */
function stringField(row: unknown, key: string): string | null {
  if (typeof row !== "object" || row === null) return null;
  const value = (row as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

export function normalizeChange(
  table: CalendarRealtimeTable,
  payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
  now: () => number = Date.now,
): CalendarChange {
  const type = payload.eventType;
  // Bei DELETE steht die Zeile in `old` und trägt nur den Primärschlüssel.
  const row: unknown = type === "DELETE" ? payload.old : payload.new;
  const rowId = stringField(row, "id");
  const eventId =
    type === "DELETE" ? null : table === "events" ? rowId : stringField(row, "event_id");

  return { table, type, rowId, eventId, receivedAt: now() };
}
```

- [ ] **Step 4: Tests laufen lassen und Erfolg bestätigen**

Run: `bun test features/calendar/realtime.test.ts`
Expected: PASS, 14 Tests.

- [ ] **Step 5: Typecheck und Lint**

Run: `bun run typecheck && bun lint`
Expected: beide PASS.

- [ ] **Step 6: Commit**

```bash
git add features/calendar/realtime.ts features/calendar/realtime.test.ts
git commit -m "feat(realtime): reiner Kern für den Kalender-Kanal (Topic, Bindings, Normalisierung)"
```

---

### Task 3: Subscription und Hook

**Files:**

- Modify: `features/calendar/realtime.ts` (anhängen)
- Modify: `features/calendar/realtime.test.ts` (anhängen)
- Modify: `features/calendar/index.ts`

**Interfaces:**

- Consumes: alles aus Task 2, plus `supabase` aus `@/features/supabase` und `Database` aus `@/features/supabase/database.types`.
- Produces:
  - `interface SubscribeToCalendarChangesArgs { client: SupabaseClient<Database>; familyId: string; onChange: (change: CalendarChange) => void; onStatus?: (status: CalendarRealtimeStatus) => void; now?: () => number }`
  - `subscribeToCalendarChanges(args: SubscribeToCalendarChangesArgs): () => void`
  - `useCalendarRealtime(familyId: string | null, onChange: (change: CalendarChange) => void): { status: CalendarRealtimeStatus }`

- [ ] **Step 1: Die fehlschlagenden Tests schreiben**

An `features/calendar/realtime.test.ts` **anhängen**. Der Import oben in der Datei wird um `subscribeToCalendarChanges` erweitert, und diese Imports kommen dazu:

```ts
import type { Database } from "@/features/supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
```

Dann:

```ts
type SubscribeState = (state: "SUBSCRIBED" | "TIMED_OUT" | "CLOSED" | "CHANNEL_ERROR") => void;

interface RecordedBinding {
  type: string;
  filter: unknown;
  callback: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
}

interface FakeChannel {
  topic: string;
  bindings: RecordedBinding[];
  subscribeCalls: number;
  emitStatus: SubscribeState | null;
  on: (type: string, filter: unknown, callback: RecordedBinding["callback"]) => FakeChannel;
  subscribe: (cb: SubscribeState) => FakeChannel;
}

interface FakeClient {
  channels: FakeChannel[];
  removed: FakeChannel[];
  channel: (topic: string) => FakeChannel;
  removeChannel: (channel: FakeChannel) => Promise<"ok">;
}

/**
 * Minimaler Stand-in für den Supabase-Client. Der Cast am Ende ist bewusst und
 * bleibt im Test: `SupabaseClient` nachzubilden hieße, eine Klasse mit Dutzenden
 * Membern zu tippen, von denen dieses Modul genau zwei anfasst.
 */
function fakeClient(): FakeClient {
  const client: FakeClient = {
    channels: [],
    removed: [],
    channel(topic: string) {
      const channel: FakeChannel = {
        topic,
        bindings: [],
        subscribeCalls: 0,
        emitStatus: null,
        on(type, filter, callback) {
          channel.bindings.push({ type, filter, callback });
          return channel;
        },
        subscribe(cb) {
          channel.subscribeCalls += 1;
          channel.emitStatus = cb;
          return channel;
        },
      };
      client.channels.push(channel);
      return channel;
    },
    removeChannel(channel: FakeChannel) {
      client.removed.push(channel);
      return Promise.resolve("ok" as const);
    },
  };
  return client;
}

function asClient(client: FakeClient): SupabaseClient<Database> {
  return client as unknown as SupabaseClient<Database>;
}

describe("subscribeToCalendarChanges", () => {
  test("öffnet genau einen Kanal, benannt nach der Familie", () => {
    const client = fakeClient();
    subscribeToCalendarChanges({
      client: asClient(client),
      familyId: FAMILY_ID,
      onChange: () => {},
    });
    expect(client.channels).toHaveLength(1);
    expect(client.channels[0].topic).toBe(calendarChannelTopic(FAMILY_ID));
  });

  test("registriert beide Bindings als postgres_changes", () => {
    const client = fakeClient();
    subscribeToCalendarChanges({
      client: asClient(client),
      familyId: FAMILY_ID,
      onChange: () => {},
    });
    const [channel] = client.channels;
    expect(channel.bindings).toHaveLength(2);
    expect(channel.bindings.map((b) => b.type)).toEqual(["postgres_changes", "postgres_changes"]);
    expect(channel.bindings.map((b) => b.filter)).toEqual(calendarBindings(FAMILY_ID));
  });

  test("abonniert genau einmal", () => {
    const client = fakeClient();
    subscribeToCalendarChanges({
      client: asClient(client),
      familyId: FAMILY_ID,
      onChange: () => {},
    });
    expect(client.channels[0].subscribeCalls).toBe(1);
  });

  test("meldet 'subscribing', bevor der Server geantwortet hat", () => {
    const client = fakeClient();
    const seen: string[] = [];
    subscribeToCalendarChanges({
      client: asClient(client),
      familyId: FAMILY_ID,
      onChange: () => {},
      onStatus: (s) => seen.push(s),
    });
    expect(seen).toEqual(["subscribing"]);
  });

  test("reicht den Subscribe-State übersetzt weiter", () => {
    const client = fakeClient();
    const seen: string[] = [];
    subscribeToCalendarChanges({
      client: asClient(client),
      familyId: FAMILY_ID,
      onChange: () => {},
      onStatus: (s) => seen.push(s),
    });
    client.channels[0].emitStatus?.("SUBSCRIBED");
    client.channels[0].emitStatus?.("CHANNEL_ERROR");
    expect(seen).toEqual(["subscribing", "subscribed", "error"]);
  });

  test("normalisiert eingehende Payloads je nach Binding", () => {
    const client = fakeClient();
    const seen: CalendarChange[] = [];
    subscribeToCalendarChanges({
      client: asClient(client),
      familyId: FAMILY_ID,
      onChange: (c) => seen.push(c),
      now,
    });
    const [eventsBinding, exceptionsBinding] = client.channels[0].bindings;
    eventsBinding.callback(payload("events", "INSERT", { id: "evt-1" }));
    exceptionsBinding.callback(
      payload("event_exceptions", "INSERT", { id: "exc-1", event_id: "evt-1" }),
    );
    expect(seen).toEqual([
      { table: "events", type: "INSERT", rowId: "evt-1", eventId: "evt-1", receivedAt: AT },
      {
        table: "event_exceptions",
        type: "INSERT",
        rowId: "exc-1",
        eventId: "evt-1",
        receivedAt: AT,
      },
    ]);
  });

  test("die Rückgabe entfernt genau den erzeugten Kanal", () => {
    const client = fakeClient();
    const unsubscribe = subscribeToCalendarChanges({
      client: asClient(client),
      familyId: FAMILY_ID,
      onChange: () => {},
    });
    expect(client.removed).toHaveLength(0);
    unsubscribe();
    expect(client.removed).toEqual([client.channels[0]]);
  });
});
```

Ergänze außerdem den Import in `CalendarChange`-Typ-Position: die bestehende Import-Liste aus `./realtime` bekommt `subscribeToCalendarChanges` und `type CalendarChange` dazu.

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `bun test features/calendar/realtime.test.ts`
Expected: FAIL — `subscribeToCalendarChanges is not a function` (bzw. Import-Fehler).

- [ ] **Step 3: Subscription und Hook implementieren**

An `features/calendar/realtime.ts` anhängen. Die Import-Zeile oben wird zu:

```ts
import type {
  REALTIME_SUBSCRIBE_STATES,
  RealtimePostgresChangesPayload,
  SupabaseClient,
} from "@supabase/supabase-js";

import { useEffect, useRef, useState } from "react";

import type { Database } from "@/features/supabase/database.types";

import { supabase } from "@/features/supabase";
```

Die Gruppierung folgt [features/calendar/createMutation.ts](../../../features/calendar/createMutation.ts): externe Werte-Importe, dann `@/`-Typ-Importe, dann `@/`-Werte-Importe. `perfectionist/sort-imports` steht auf `warn` und `lint-staged` fährt beim Commit ohnehin `eslint --fix` — falls die Reihenfolge abweicht, korrigiert der Hook sie.

Angehängt:

```ts
export interface SubscribeToCalendarChangesArgs {
  client: SupabaseClient<Database>;
  familyId: string;
  onChange: (change: CalendarChange) => void;
  onStatus?: (status: CalendarRealtimeStatus) => void;
  now?: () => number;
}

/**
 * React-frei: Der Client kommt als Parameter, damit ein Test ihn ohne
 * `mock.module` ersetzen kann.
 *
 * Rückgabewert ist die Abmeldung.
 */
export function subscribeToCalendarChanges({
  client,
  familyId,
  onChange,
  onStatus,
  now,
}: SubscribeToCalendarChangesArgs): () => void {
  const channel = client.channel(calendarChannelTopic(familyId));

  for (const binding of calendarBindings(familyId)) {
    channel.on<Record<string, unknown>>("postgres_changes", binding, (payload) => {
      // Die Tabelle kommt aus dem Binding, nicht aus `payload.table`: Das
      // Binding ist typisiert, `payload.table` ist ein `string`, und die
      // Zuweisung auf die Union bräuchte eine Behauptung, die nichts prüft.
      onChange(normalizeChange(binding.table, payload, now));
    });
  }

  onStatus?.("subscribing");
  channel.subscribe((state) => {
    onStatus?.(toRealtimeStatus(state));
  });

  return () => {
    void client.removeChannel(channel);
  };
}

/**
 * `familyId` kommt als Parameter statt aus einem `useCurrentParent()` im Hook —
 * das hält ihn frei von der Query-Abhängigkeit und komponierbar.
 *
 * Ein `supabase.realtime.setAuth()` ruft der Hook bewusst nicht: `supabase-js`
 * schiebt den Zugriffstoken bei jedem Auth-Wechsel selbst an den Socket, und
 * abonniert wird ohnehin erst, wenn `familyId` steht — was eine aufgelöste
 * `parents`-Query und damit eine authentifizierte Sitzung voraussetzt.
 */
export function useCalendarRealtime(
  familyId: string | null,
  onChange: (change: CalendarChange) => void,
): { status: CalendarRealtimeStatus } {
  const [status, setStatus] = useState<CalendarRealtimeStatus>("idle");

  // Der Callback liegt in einer Ref, weil `react-hooks/exhaustive-deps` in
  // diesem Repo auf `error` steht: stünde er in der Dependency-Liste, baute
  // jeder Render mit frischer Closure die Subscription neu auf.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!familyId) {
      setStatus("idle");
      return;
    }
    // Der Kanal wird hier frisch erzeugt und im Cleanup entsorgt, nie über
    // Renders hinweg wiederverwendet: React hängt im StrictMode jeden Effekt
    // einmal ab und wieder an, und ein zweites `subscribe()` auf demselben
    // Kanal wirft „tried to subscribe multiple times".
    return subscribeToCalendarChanges({
      client: supabase,
      familyId,
      onChange: (change) => onChangeRef.current(change),
      onStatus: setStatus,
    });
  }, [familyId]);

  return { status };
}
```

- [ ] **Step 4: Tests laufen lassen und Erfolg bestätigen**

Run: `bun test features/calendar/realtime.test.ts`
Expected: PASS, 21 Tests (14 aus Task 2, 7 neue).

- [ ] **Step 5: Barrel erweitern**

In `features/calendar/index.ts` einen Export-Block ergänzen (die Datei ist alphabetisch grob nach Modul sortiert; setze ihn hinter den `pendingDeletes`-Block):

```ts
export {
  calendarBindings,
  calendarChannelTopic,
  normalizeChange,
  subscribeToCalendarChanges,
  toRealtimeStatus,
  useCalendarRealtime,
  CALENDAR_CHANNEL_PREFIX,
  type CalendarBinding,
  type CalendarChange,
  type CalendarChangeType,
  type CalendarRealtimeStatus,
  type CalendarRealtimeTable,
} from "./realtime";
```

- [ ] **Step 6: Volle Prüfung**

Run: `bun test && bun run check`
Expected: alle PASS.

- [ ] **Step 7: Commit**

```bash
git add features/calendar/realtime.ts features/calendar/realtime.test.ts features/calendar/index.ts
git commit -m "feat(realtime): Subscription und useCalendarRealtime für den Kalender-Kanal"
```

---

### Task 4: Debug-Screen, Route und Einstieg

**Files:**

- Create: `app-sections/debug/RealtimeDebugScreen.tsx`
- Create: `app-sections/debug/index.ts`
- Create: `app/debug/realtime.tsx`
- Modify: `app/_layout.tsx` (Stack.Screen-Liste)
- Modify: `app-sections/settings/SettingsScreen.tsx` (Zeile unter `__DEV__`)

**Interfaces:**

- Consumes: `useCalendarRealtime`, `calendarChannelTopic`, `type CalendarChange`, `type CalendarRealtimeStatus` aus `@/features/calendar`; `useCurrentParent` aus `@/features/auth`; `Button`/`Card`/`Screen`/`Text` aus `@/design-system/ui`; `Icon`/`Pill`/`type PillTone` aus `@/app-sections/shared`.
- Produces: `RealtimeDebugScreen` (Default-Export der Route `/debug/realtime`).

Kein TDD-Zyklus: Für React-Komponenten gibt es in diesem Repo keine Testinfrastruktur (siehe Global Constraints). Der Prüfschritt ist Typecheck, Lint und ein Sichtlauf.

- [ ] **Step 1: Screen schreiben**

Create `app-sections/debug/RealtimeDebugScreen.tsx`:

```tsx
/* eslint-disable i18next/no-literal-string -- Dev-Werkzeug: Der Screen wird nur
   unter `__DEV__` verlinkt und nie ausgeliefert. Die i18n-Kataloge tragen die
   Designer-Copy aus docs/COPY.md; ein Debug-Screen gehört dort nicht hinein
   (ADR-028, Decision 8). */
import { router } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Pressable, View } from "react-native";

import { Icon, Pill, type PillTone } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Card, Screen, Text } from "@/design-system/ui";
import { useCurrentParent } from "@/features/auth";
import {
  calendarChannelTopic,
  useCalendarRealtime,
  type CalendarChange,
  type CalendarRealtimeStatus,
} from "@/features/calendar";

/** Genug, um eine Testreihe zu überblicken, wenig genug für eine flüssige Liste. */
const MAX_ENTRIES = 50;

const statusTone: Record<CalendarRealtimeStatus, PillTone> = {
  idle: "neutral",
  subscribing: "warn",
  subscribed: "success",
  timedOut: "warn",
  error: "danger",
  closed: "ink",
};

/** `receivedAt` allein taugt nicht als React-Key — zwei Ereignisse teilen sich
 *  ohne Weiteres dieselbe Millisekunde. */
interface LoggedChange extends CalendarChange {
  seq: number;
}

/**
 * Fenster in den Realtime-Strom, das die Übertragungsstrecke sichtbar macht,
 * bevor Issue #51 sie an `useFamilyEvents` hängt. Bewusst roh: Zeitstempel,
 * Tabelle, Typ, Ids — keine Aufbereitung, die einen Fehler verstecken könnte.
 */
export function RealtimeDebugScreen() {
  const { theme } = useTheme();
  const parentQuery = useCurrentParent();
  const familyId = parentQuery.data?.family_id ?? null;

  const [changes, setChanges] = useState<LoggedChange[]>([]);
  const seq = useRef(0);

  const append = useCallback((change: CalendarChange) => {
    seq.current += 1;
    const entry: LoggedChange = { ...change, seq: seq.current };
    setChanges((prev) => [entry, ...prev].slice(0, MAX_ENTRIES));
  }, []);

  const { status } = useCalendarRealtime(familyId, append);

  return (
    <Screen scroll>
      <View className="flex-row items-center gap-1 pb-3 pt-1">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Zurück"
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          className="h-11 w-11 items-center justify-center rounded-xl active:opacity-70"
        >
          <Icon name="chevron-left" size={20} color={theme.ink} />
        </Pressable>
        <Text variant="h1" className="flex-1">
          Realtime-Debug
        </Text>
      </View>

      <Card className="gap-2">
        <View className="flex-row items-center justify-between">
          <Text variant="listTitle">Kanal</Text>
          <Pill label={status} tone={statusTone[status]} />
        </View>
        <Text variant="meta" tone="inkSecondary" numberOfLines={1}>
          {familyId ? calendarChannelTopic(familyId) : "Familie noch nicht geladen"}
        </Text>
        <Text variant="meta" tone="inkTertiary">
          {`${String(changes.length)} von max. ${String(MAX_ENTRIES)} Ereignissen`}
        </Text>
      </Card>

      <Card variant="tinted" tint="warning" className="mt-3">
        <Text variant="meta">
          Lösch-Ereignisse laufen ohne RLS-Prüfung ein: Sie tragen nur die Row-Id, keine Event-Id —
          und sie können aus fremden Familien stammen. Ein leeres „event" ist also kein Fehler
          dieses Screens.
        </Text>
      </Card>

      <View className="mt-5 flex-row items-center justify-between">
        <Text variant="eyebrow" tone="inkTertiary">
          Ereignisse
        </Text>
        <Button
          label="Leeren"
          variant="soft"
          tone="neutral"
          size="md"
          disabled={changes.length === 0}
          onPress={() => setChanges([])}
        />
      </View>

      {changes.length === 0 ? (
        <Card className="mt-2">
          <Text variant="meta" tone="inkTertiary">
            Noch nichts empfangen. Änderungen an events oder event_exceptions dieser Familie
            erscheinen hier, sobald die Publikation supabase_realtime beide Tabellen führt.
          </Text>
        </Card>
      ) : (
        <Card className="mt-2 p-0 px-4">
          {changes.map((change, index) => (
            <View
              key={change.seq}
              className={`flex-row items-center gap-3 py-3 ${
                index === changes.length - 1 ? "" : "border-b border-line"
              }`}
            >
              <Text variant="numeric" tone="inkTertiary">
                {new Date(change.receivedAt).toLocaleTimeString("de-DE")}
              </Text>
              <View className="flex-1">
                <Text variant="listTitle">{`${change.table} · ${change.type}`}</Text>
                <Text variant="meta" tone="inkSecondary" numberOfLines={1}>
                  {`row ${change.rowId ?? "—"} · event ${change.eventId ?? "—"}`}
                </Text>
              </View>
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}
```

- [ ] **Step 2: Barrel und Route**

Create `app-sections/debug/index.ts`:

```ts
export { RealtimeDebugScreen } from "./RealtimeDebugScreen";
```

Create `app/debug/realtime.tsx`:

```tsx
export { RealtimeDebugScreen as default } from "@/app-sections/debug/RealtimeDebugScreen";
```

- [ ] **Step 3: Route im Root-Layout anmelden**

In `app/_layout.tsx`, unmittelbar **vor** der Zeile `<Stack.Screen name="+not-found" options={{ presentation: "modal" }} />` einfügen:

```tsx
<Stack.Screen name="debug/realtime" options={{ presentation: "card", headerShown: false }} />
```

- [ ] **Step 4: Einstieg im Settings-Sheet**

In `app-sections/settings/SettingsScreen.tsx` im letzten `<Card>`-Block (der mit `set.subscription` / `set.help` / `set.logout`) **vor** der Logout-Zeile einfügen:

```tsx
{
  __DEV__ ? (
    // Dev-Werkzeug für Issue #50/#51/#52 — im Release-Build nicht
    // gerendert, deshalb bewusst ohne i18n-Key.
    <Row
      icon="alert-triangle"
      // eslint-disable-next-line i18next/no-literal-string
      label="Realtime-Debug"
      onPress={() => {
        if (router.canGoBack()) router.back();
        router.push("/debug/realtime");
      }}
    />
  ) : null;
}
```

Die `router.back()`-vor-`push`-Reihenfolge ist das im Screen bereits etablierte Muster (siehe die `set.familyMembers`-Zeile) — ohne sie hinge der Screen hinter dem Formsheet.

- [ ] **Step 5: Typecheck, Lint, Format**

Run: `bun run check`
Expected: PASS, **ohne neue Warnungen**. `i18next/no-literal-string` steht auf `warn` und bricht `bun lint` nicht — eine stehengelassene Warnung ist hier trotzdem ein Mangel, nicht ein Freibrief. Prüfe gezielt: `bun lint app-sections/debug app-sections/settings`.

- [ ] **Step 6: Sichtlauf im Web-Bundle**

Run: `bun run web`
Prüfe: Settings öffnen → Zeile „Realtime-Debug" ist da → Tippen öffnet den Screen → Status-Pille zeigt `subscribing`, dann `subscribed` → die leere Liste zeigt ihren Hinweistext → „Leeren" ist ausgegraut.

- [ ] **Step 7: Commit**

```bash
git add app-sections/debug app/debug app/_layout.tsx app-sections/settings/SettingsScreen.tsx
git commit -m "feat(realtime): Debug-Screen für den Kalender-Kanal, Einstieg nur unter __DEV__"
```

---

### Task 5: Dokumentation

**Files:**

- Modify: `docs/decision-log.md` (ADR-028 anhängen)
- Modify: `docs/TODO.md`
- Modify: `CLAUDE.md`
- Modify: `docs/architecture.md`

**Interfaces:**

- Consumes: die Entscheidungen aus Tasks 1–4.
- Produces: keinen Code-Vertrag.

- [ ] **Step 1: ADR-028 an `docs/decision-log.md` anhängen**

```markdown
## ADR-028 — Realtime für den Kalender: ein Kanal pro Familie, DELETE bleibt unzuordenbar (2026-09-01)

### Status

Accepted. Erste von drei Realtime-Iterationen (Issues #50 → #51 → #52). Keine Supersession; ergänzt ADR-004, das Realtime-Subscriptions ausdrücklich als not-MVP führte.

### Context

`events` und `event_exceptions` waren nicht Teil der Publikation `supabase_realtime`; Änderungen erreichten einen zweiten angemeldeten Client erst beim nächsten Refetch. Der Auftrag nannte drei Zutaten — Replikation aktivieren, Kanäle definieren, Test-Subscription in einem Debug-Screen.

Zwei seiner Annahmen trafen so nicht zu. Realtime ist auf einem Supabase-Projekt bereits an; zu tun war, zwei Tabellen in eine bestehende Publikation aufzunehmen. Und zwei Tabellen brauchen keine zwei Kanäle: Ein Supabase-Kanal trägt beliebig viele `postgres_changes`-Bindings.

Umgesetzt wurde eine idempotente Migration (`20260901093000_realtime_calendar.sql`), ein Modul `features/calendar/realtime.ts` mit reinen Funktionen, einer React-freien Kernfunktion und einem dünnen Hook, sowie ein Dev-Screen unter `app/debug/realtime.tsx`.

### Decisions

1. **Fundament, nicht Live-Sync.** `useFamilyEvents` bleibt unangetastet. Eine eingehende Invalidierung müsste sich mit zwei bestehenden Overlays vertragen — den offenen Löschungen aus [ADR-026](#adr-026--rückgängig-nach-dem-löschen-verzögern-statt-wiederherstellen-2026-08-31) und dem optimistischen Occurrence-Overlay aus [ADR-027](#adr-027--optimistische-kalender-updates-ein-occurrence-overlay-auf-der-anzeige-keine-cache-patches-2026-08-31). Ein Realtime-Refetch mitten im Undo-Fenster darf den gerade gelöschten Termin nicht zurückholen; das ist keine Zeile nebenbei, sondern Issue #51.

2. **Ein Topic, zwei Bindings.** `calendar:<familyId>` trägt beide Tabellen. Zwei Topics kosteten zwei WebSocket-Abonnements pro Client und zwei Zustände für etwas, das nur gemeinsam gebraucht wird — getrennt abonnieren will sie niemand.

3. **`family_id` wird nicht auf `event_exceptions` denormalisiert.** Der Reiz wäre Symmetrie: beide Bindings serverseitig gefiltert. Der Gewinn wäre allein Bandbreite — RLS filtert INSERT und UPDATE dort bereits über die `exists (… events … current_family_id())`-Policy —, und den einzigen wirklich unsauberen Fall (DELETE) löste die Spalte nicht mit, weil RLS dort gar nicht erst läuft. Dafür kostete sie eine Schema-Änderung an einer bestehenden Tabelle samt Backfill und Synchron-Trigger.

4. **Die DELETE-Lücke steht im Typ, nicht in einem Kommentar.** Postgres Changes wendet RLS nicht auf DELETE an — eine gelöschte Zeile lässt sich nicht mehr gegen eine Policy prüfen —, und der Payload trägt nur den Primärschlüssel. Das heißt zweierlei: Ein Client sieht Lösch-Ereignisse **fremder** Familien (nur die Row-Id — keine Titel, keine Orte, keine Kind-Zuordnung), und er kann eine gelöschte Exception nicht ihrem Event zuordnen. `CalendarChange.eventId` ist deshalb `string | null` und bei DELETE immer `null`, sodass #51 die Fallunterscheidung nicht übersehen **kann**. Der Debug-Screen benennt sie zusätzlich sichtbar, damit ein leeres Feld nicht als Fehler des Screens gelesen wird.

5. **Reine Kernfunktion, dünner Hook.** Nicht Stil, sondern die einzige Form, in der das Modul hier prüfbar ist: Es gibt im Repo keinen Pfad, auf dem React-Komponenten unter `bun test` rendern — `@testing-library/react-native` liegt als devDependency und wird von keiner Suite benutzt, und `features/calendar/hooks.ts` ist über `useTheme` → nativewind-Runtime nicht einmal ladbar. `subscribeToCalendarChanges` nimmt den Client deshalb als Parameter; ein Test ersetzt ihn ohne `mock.module`.

6. **Kein `replica identity full`.** Bei aktivem RLS bleibt `payload.old` auf den Primärschlüssel beschränkt; die Einstellung erhöhte nur das WAL-Volumen. Im SQL kommentiert, damit #52 (Conflict-Detection) die Frage nicht ohne die Antwort neu stellt.

7. **Der Debug-Screen bleibt im Repo.** #51 und #52 brauchen genau dieses Fenster in den Datenstrom. Der Preis ist eine dauerhafte Route — gedeckelt dadurch, dass ihr Einstieg unter `__DEV__` steht.

8. **Keine `debug.*`-Keys in den i18n-Katalogen.** Die Kataloge tragen ausgelieferte Copy aus `docs/COPY.md`, einem nach Screens gegliederten Deck, das für ein Dev-Werkzeug keinen Eintrag hat und haben soll. Die Ausnahme steht als file-level `eslint-disable i18next/no-literal-string` mit Begründung sichtbar im Kopf der Datei, statt als Zeilen-Ausnahmen verteilt zu sein. Verwandt mit der `sample.*`-Abwägung aus ADR-020, dort mit umgekehrtem Ausgang: Fixtures brauchen übersetzbare Copy, ein Werkzeug nicht.

### Consequences

- **Der grüne Status beweist die Socket-Verbindung, nicht die Replikation.** Ein fehlendes Publikations-Mitglied ist kein Verbindungsfehler: Der Kanal meldet `subscribed`, es kommt nur nie ein Event. Genau deshalb zeigt der Debug-Screen Ereignisse statt nur einen Status.
- **Die Migration wurde in der Umsetzungssitzung nicht gefahren** — der Supabase-MCP-Server war dort nicht authentifiziert. Nach `apply_migration` greift der Versions-Abgleich aus `supabase/SETUP.md` §3: Der MCP-Server vergibt einen eigenen Timestamp und ignoriert den Dateinamen; bleibt die Divergenz stehen, hält die CLI die Migration für nicht angewendet und fährt bei `db push` die Basis-Migrationen erneut — die mit `drop table … cascade` beginnen.
- **`useCalendarRealtime` selbst ist ungetestet.** Nach dem Split ist er ein `useEffect` um `subscribeToCalendarChanges` plus eine Callback-Ref; alles Prüfenswerte liegt darunter. In `docs/TODO.md` festgehalten.
- **Kein sichtbares Scheitern nach dauerhaftem Verbindungsverlust.** Der Realtime-Client bringt seinen eigenen Reconnect mit; was fehlt, ist eine Rückmeldung an den Nutzer, wenn er dauerhaft nicht durchkommt. Für den Debug-Screen genügt die Status-Pille; für #51 ist es eine offene Frage und steht in `docs/TODO.md`.
- **Das Barrel `features/calendar/index.ts` exportiert das Modul mit**, Tests importieren aber weiter `./realtime` direkt — dieselbe Einschränkung, unter der `features/auth` schon `features/calendar/optimisticEvents` direkt importiert: Der Weg über das Barrel zöge `./hooks` und damit das nativewind-Runtime herein.
```

- [ ] **Step 2: `docs/TODO.md` anpassen**

Ersetze unter `## Weitere Out-of-Scope-Items` die Zeile

```
- **Realtime-Subscription** auf `events` / `event_exceptions` für Multi-User-Sync.
```

ersatzlos (sie wandert in den neuen Abschnitt), und füge **vor** `## Weitere Out-of-Scope-Items` einen neuen Abschnitt ein:

```markdown
## Realtime (siehe [ADR-028](./decision-log.md))

- **`useFamilyEvents` abonniert den Kanal noch nicht** ([features/calendar/hooks.ts](../features/calendar/hooks.ts)): Die Kanal-Schicht steht ([realtime.ts](../features/calendar/realtime.ts)), aber nichts invalidiert damit `calendarKeys`. Das ist Issue #51 und bewusst eine eigene Iteration: Eine eingehende Invalidierung muss sich mit zwei Overlays vertragen — ein Refetch mitten im Undo-Fenster ([ADR-026](./decision-log.md)) darf den gerade gelöschten Termin nicht zurückholen, und `onSettled` in [createMutation.ts](../features/calendar/createMutation.ts) räumt den optimistischen Eintrag ([ADR-027](./decision-log.md)) am Ende einer Sammel-Invalidierung ab, die ein Realtime-Ereignis jederzeit erneut auslösen kann.
- **DELETE-Ereignisse sind keinem Event zuzuordnen** ([features/calendar/realtime.ts](../features/calendar/realtime.ts) — `CalendarChange.eventId`): RLS greift bei `postgres_changes` nicht auf DELETE, der Payload trägt nur die Row-Id. Für #51 heißt das: Auf ein Lösch-Ereignis lässt sich nicht gezielt eine Event-Query invalidieren, sondern nur breit (`calendarKeys.all`) — und das auch bei Löschungen **fremder** Familien, die derselbe Kanal ungefiltert mitliefert. Ob das ein Problem ist (unnötige Refetches) oder nicht (selten, billig), entscheidet #51 mit Zahlen, nicht hier.
- **`useCalendarRealtime` ist ungetestet** ([features/calendar/realtime.ts](../features/calendar/realtime.ts)): Im Repo gibt es keinen Pfad, auf dem React-Komponenten unter `bun test` rendern — `@testing-library/react-native` liegt als devDependency und wird von keiner Suite benutzt. Nach dem Split ist der Hook ein `useEffect` um die getestete `subscribeToCalendarChanges` plus eine Callback-Ref; die Zerlegung ist die Antwort auf die Lücke, nicht ihr Opfer. Ein Test brauchte zuerst einen tragfähigen Render-Pfad — dieselbe Baustelle wie das nativewind-Ladeproblem von [hooks.ts](../features/calendar/hooks.ts).
- **Kein sichtbares Scheitern nach dauerhaftem Verbindungsverlust** ([features/calendar/realtime.ts](../features/calendar/realtime.ts)): Der Realtime-Client bringt seinen eigenen Reconnect mit, aber nichts sagt dem Nutzer, wenn er dauerhaft nicht durchkommt — der Kalender zeigt dann still veraltete Daten. Der Debug-Screen hat dafür seine Status-Pille; für den echten Screen wäre es ein Designer-Thema (Inline-Hinweis? Offline-Banner?), verwandt mit dem stummen Fehlerfall der Event-Query weiter oben.
- **Der Debug-Screen steht nicht in [docs/COPY.md](./COPY.md)** ([app-sections/debug/RealtimeDebugScreen.tsx](../app-sections/debug/RealtimeDebugScreen.tsx)): Seine Copy ist hartkodiert und bewusst nicht in den i18n-Katalogen ([ADR-028](./decision-log.md), Decision 8). Kein Nachtrag nötig, solange der Einstieg unter `__DEV__` steht — sollte der Screen je ausgeliefert werden, ist das die Stelle, an der es auffallen muss.
```

- [ ] **Step 3: `CLAUDE.md` nachziehen**

Drei Stellen:

1. Im Ordner-Baum die Calendar-Zeile

```
├─ calendar/             Queries · Mutations · RRULE-Expansion · Reminder · Pending-Deletes · Optimistic-Overlay
```

ersetzen durch

```
├─ calendar/             Queries · Mutations · RRULE-Expansion · Reminder · Pending-Deletes · Optimistic-Overlay
│                        · Realtime-Kanal (ein Topic pro Familie, ADR-028)
```

2. Im `app-sections/`-Baum hinter der `auth/`-Zeile einfügen:

```
├─ debug/                Dev-Werkzeuge (Realtime-Debug) — Einstieg nur unter `__DEV__`
```

und im `app/`-Baum hinter `task/edit/[id].tsx`:

```
├─ debug/realtime.tsx     → RealtimeDebugScreen (nur `__DEV__` verlinkt)
```

3. Im Tech-Stack-Block den Satz

```
Auth-Flow lebt seit ADR-005 (Email+Passwort, strict Confirm-Email, Reset-Password, 5-Step-Onboarding mit Share-Sheet-Invite, `features/auth/AuthGate`). Realtime + Edge Functions sind die nächsten Iterationen.
```

ersetzen durch

```
Auth-Flow lebt seit ADR-005 (Email+Passwort, strict Confirm-Email, Reset-Password, 5-Step-Onboarding mit Share-Sheet-Invite, `features/auth/AuthGate`). **Realtime** ist seit ADR-028 als Fundament da — `events` und `event_exceptions` liegen in der Publikation `supabase_realtime`, `features/calendar/realtime.ts` hält einen Kanal pro Familie, und ein Dev-Screen unter `/debug/realtime` zeigt den Strom. Der Kalender abonniert ihn noch **nicht** (Issue #51). Edge Functions sind die nächste Iteration.
```

Und in der Zeile darunter `Realtime` aus der Deferred-Liste streichen — **zusammen mit `Auth-Flow`**, der dort seit ADR-005 fälschlich steht und im selben Satz sitzt (eine editorische Reparatur einer überholten Aufzählung, keine Entscheidungsänderung):

```
Deferred to later iterations (not yet wired): Edge Functions, gustar.io Worker, Stripe, real STT + LLM, Expo Notifications.
```

- [ ] **Step 4: `docs/architecture.md` ergänzen**

Vor dem Abschnitt `## What's not here yet` einfügen:

```markdown
## Realtime

`events` und `event_exceptions` liegen in der Postgres-Publikation
`supabase_realtime`. [features/calendar/realtime.ts](../features/calendar/realtime.ts)
öffnet daraus **einen** Kanal pro Familie (`calendar:<familyId>`) mit zwei
`postgres_changes`-Bindings und normalisiert eingehende Payloads zu einem
`CalendarChange`. RLS filtert pro Abonnent — außer bei DELETE, wo Postgres eine
gelöschte Zeile nicht mehr prüfen kann; solche Ereignisse tragen nur die Row-Id.
Konsument ist bislang allein der Dev-Screen `/debug/realtime`; der Kalender
selbst abonniert noch nicht (siehe [decision-log.md](./decision-log.md), ADR-028).
```

- [ ] **Step 5: Format-Gate**

Run: `bun run format:check`
Expected: PASS. Bei Abweichung `bun format` laufen lassen.

- [ ] **Step 6: Commit**

```bash
git add docs/decision-log.md docs/TODO.md docs/architecture.md CLAUDE.md
git commit -m "docs: ADR-028 für den Realtime-Kanal des Kalenders, Folge-TODOs und Ordnerstruktur"
```

---

### Task 6: Abnahme

**Files:** keine neuen; nur Korrekturen, die aus den Läufen fallen.

**Interfaces:**

- Consumes: alles aus Tasks 1–5.
- Produces: den Nachweis, ohne den nichts als fertig gemeldet wird.

- [ ] **Step 1: Volle Prüfkette**

Run: `bun run check && bun test`
Expected: `format:check`, `lint`, `typecheck` und alle Suiten PASS. Notiere die Test-Zahl.

- [ ] **Step 2: Web-Smoke-Build**

Run: `bunx expo export --platform web --output-dir /tmp/eltern-web`
Expected: Build läuft durch. Das ist derselbe Schritt, den `ci.yml` als letzten fährt.

- [ ] **Step 3: iOS-Simulator**

Run: `bun run ios`
Prüfe: App startet, Settings → „Realtime-Debug" → Screen rendert, Status-Pille wechselt auf `subscribed`, Layout in Light **und** Dark (Theme im Settings-Sheet umschalten).

- [ ] **Step 4: Android-Emulator**

Run: `bun run android`
Prüfe: dasselbe wie Step 3.

Bleibt ein Simulator/Emulator unerreichbar, halte das im Bericht ausdrücklich fest — kein stilles Auslassen.

- [ ] **Step 5: CodeRabbit-Durchlauf**

Run: `coderabbit review --base main --agent`
Arbeite die Befunde ab oder verwirf sie begründet. Erst danach ist der Branch PR-reif.

- [ ] **Step 6: Bericht**

Run: `git status && git log --oneline main..HEAD`
Fasse zusammen: welche Dateien, welche Commits, welche Prüfungen mit welchem Ergebnis, und die zwei offenen Punkte, die kein Commit schließen kann — die Migration ist **nicht** angewendet (MCP nicht authentifiziert; nach `apply_migration` Versions-Abgleich nach `supabase/SETUP.md`), und der echte Zwei-Client-Beweis ist Issue #52.

Der PR schließt Issue #50; die PR-Beschreibung braucht dafür `Closes #50`.
