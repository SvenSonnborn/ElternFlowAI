# Live-Sync für den Kalender (Broadcast from Database) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine Termin-Änderung eines Familienmitglieds erscheint bei allen anderen Mitgliedern derselben Familie innerhalb von Sekundenbruchteilen auf Kalender und Dashboard — und ausschließlich dort.

**Architecture:** Trigger auf `events` und `event_exceptions` senden per `realtime.broadcast_changes()` auf ein privates Topic `family:<familyId>`, autorisiert durch eine RLS-Policy auf `realtime.messages`. Client-seitig entsteht `features/realtime/` als Sync-Schicht **über** den Features: ein Mountpunkt in `ThemedStack`, ein 300-ms-Sammelfenster, gezielte Invalidierung der TanStack-Query-Keys. Beide bestehenden Kalender-Overlays bleiben unangetastet.

**Tech Stack:** Supabase (Postgres 15 + Realtime, `@supabase/supabase-js` 2.112.3) · TanStack Query 5 · Zustand · Expo SDK 57 / React Native 0.86 / React 19.2 · TypeScript strict · NativeWind v4 · `bun test`

**Spec:** [docs/superpowers/specs/2026-09-01-realtime-family-broadcast-design.md](../specs/2026-09-01-realtime-family-broadcast-design.md)

## Global Constraints

- **Handoff-Bundle ist gesperrt** — `design-system/{colors,typography,spacing,themes,components,index}.ts`, `docs/HANDOFF.md`, `docs/ICONS.md`, `docs/README.md`, `patterns/*.md` werden **nicht** bearbeitet. **Ausnahme für diesen Plan:** `docs/COPY.md` bekommt den `sync.*`-Eintrag — ausdrücklich freigegeben (Konversation 2026-09-01), und nur dieser eine Abschnitt.
- **Alle ausgelieferten Strings kommen aus den i18n-Katalogen**, Du-Form, DE ist kanonisch. Ausnahme: der Debug-Screen (`__DEV__`, ADR-028 Decision 8).
- **Touch-Targets ≥ 44×44.** Betrifft hier nichts Neues — `<SyncNotice />` ist nicht interaktiv.
- **`app/` enthält nur dünne Re-Exports.** Einzige Ausnahme bleibt `app/_layout.tsx` (Provider-Komposition), wo dieser Plan einen Hook-Aufruf ergänzt.
- **Jede neue exportierte Funktion, Komponente, Hook und jedes neue Modul bekommt einen JSDoc-Block im selben Commit** — Inhalt ist das Nicht-Offensichtliche (Warum, Grenzfall, ADR-Bezug), nicht die Wiederholung des Namens. Ausgenommen sind lokale Test-Helfer.
- **Conventional-Commit-Prefix, kein `Co-Authored-By: Claude`-Trailer, niemals `--no-verify`** und niemals `-c core.hooksPath=…` — die `lint-staged`-Hooks laufen bei jedem Commit.
- **Kein ADR wird umgeschrieben.** ADR-030 wird angehängt und löst ADR-028 in den Decisions 2, 3, 4 und 6 ab.
- Vor dem PR: `bun format:check` → `bun lint` → `bun run typecheck` → `bun test` → `bunx expo export --platform web --output-dir /tmp/eltern-web`, danach `coderabbit review --base main`.

### Abweichung von der Spec, die im ADR mitgeschrieben wird

§7 der Spec beschreibt `isDegraded(status, elapsedMs)` als reine Funktion, die eine UI-Komponente auswertet. Der Plan dreht das um: `degradedDelayMs(status)` liefert die Wartezeit, **`useFamilyRealtime` bewaffnet den Timer** und schreibt ein fertiges Boolean in den Store. Grund: Die Alternative bräuchte in `<SyncNotice />` einen Timer, der `setState` auslöst — `react-hooks/set-state-in-effect` steht in diesem Repo auf `error` (ADR-028 Decision 9), und ein Store-Write ist kein React-State. Ein Timer an einem Ort statt in jeder anzeigenden Komponente ist zusätzlich das einfachere Modell.

---

## File Structure

| Datei                                                                                           | Verantwortung                                                                                   |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `supabase/migrations/20260901120000_realtime_family_broadcast.sql`                              | Publikation zurücknehmen · RLS-Policy auf `realtime.messages` · Trigger-Funktion + zwei Trigger |
| `features/realtime/topic.ts`                                                                    | Topic-Name aus einer `family_id`                                                                |
| `features/realtime/status.ts`                                                                   | `RealtimeStatus` · `toRealtimeStatus` · Zustand-Store (`status`, `degraded`)                    |
| `features/realtime/normalize.ts`                                                                | Broadcast-Nachricht → `FamilyChange`                                                            |
| `features/realtime/coalesce.ts`                                                                 | Query-Keys eines Sammelfensters deduplizieren                                                   |
| `features/realtime/reconnect.ts`                                                                | Wann nach Wiederverbinden nachgeladen wird · ab wann „degraded" gilt                            |
| `features/realtime/subscribe.ts`                                                                | React-freie Kernfunktion: Kanal aufbauen, abbauen                                               |
| `features/realtime/dispatch.ts`                                                                 | Änderungen → Query-Keys; die **einzige** Datei der Schicht, die Features kennt                  |
| `features/realtime/useFamilyRealtime.ts`                                                        | Der eine Hook: Lebenszyklus, Sammelfenster, Reconnect, Degraded-Timer                           |
| `features/realtime/index.ts`                                                                    | Barrel                                                                                          |
| `features/calendar/realtimeKeys.ts`                                                             | Kalender-Mapper: `FamilyChange` → Query-Keys                                                    |
| `features/calendar/queries.ts`                                                                  | **Modify** — `eventsRoot` / `oneRoot` als Präfix-Konstanten                                     |
| `features/calendar/realtime.ts` + `.test.ts`                                                    | **Delete** — ersetzt durch `features/realtime/`                                                 |
| `features/calendar/index.ts`                                                                    | **Modify** — Re-Export des gelöschten Moduls raus, Mapper rein                                  |
| `app/_layout.tsx`                                                                               | **Modify** — `useFamilyRealtime()` in `ThemedStack`                                             |
| `app-sections/shared/SyncNotice.tsx`                                                            | Die Offline-Zeile                                                                               |
| `app-sections/shared/index.ts`                                                                  | **Modify** — Export                                                                             |
| `app-sections/(tabs)/kalender/KalenderScreen.tsx`                                               | **Modify** — `<SyncNotice />` unter der `TopBar`                                                |
| `app-sections/(tabs)/dashboard/DashboardScreen.tsx`                                             | **Modify** — dito                                                                               |
| `app-sections/debug/RealtimeDebugScreen.tsx`                                                    | **Modify** — auf den neuen Transport                                                            |
| `features/i18n/locales/{de,en}.json`                                                            | **Modify** — `sync.*`                                                                           |
| `docs/COPY.md` · `docs/architecture.md` · `docs/decision-log.md` · `docs/TODO.md` · `CLAUDE.md` | **Modify** — Papierspur                                                                         |

---

## Task 1: Die Migration

**Files:**

- Create: `supabase/migrations/20260901120000_realtime_family_broadcast.sql`

**Interfaces:**

- Consumes: `public.current_family_id()` (aus `20260529090123_helpers_and_core.sql`), `public.events.family_id`, `public.event_exceptions.event_id`
- Produces: Broadcast-Nachrichten auf dem Topic `family:<family_id>` mit den Feldern `schema` · `table` · `operation` · `record` · `old_record`; Event-Name = `INSERT` | `UPDATE` | `DELETE`

- [ ] **Step 1: Migration schreiben**

```sql
-- Eltern Flow AI: Live-Sync für den Kalender per Broadcast from Database
-- Spec: docs/superpowers/specs/2026-09-01-realtime-family-broadcast-design.md
-- Löst den `postgres_changes`-Ansatz aus 20260901083335_realtime_calendar.sql ab
-- (ADR-028 → ADR-030). Idempotent.

-- 1. Die Publikation zurücknehmen.
--
-- Das ist der eigentliche Verschluss des DELETE-Lecks und gehört deshalb in die
-- Datenbank, nicht in eine Client-Konvention: RLS greift bei `postgres_changes`
-- nicht auf DELETE — Postgres kann eine bereits gelöschte Zeile nicht mehr gegen
-- eine Policy prüfen. Solange die Tabellen in `supabase_realtime` liegen, kann
-- JEDER angemeldete Client sie abonnieren und Lösch-Ereignisse fremder Familien
-- mithören, unabhängig davon, was unser eigener Code tut.
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'events'
  ) then
    alter publication supabase_realtime drop table public.events;
  end if;

  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'event_exceptions'
  ) then
    alter publication supabase_realtime drop table public.event_exceptions;
  end if;
end $$;

-- 2. Realtime Authorization.
--
-- Ein privater Kanal wird über RLS auf `realtime.messages` autorisiert. Der
-- Vergleich läuft gegen `realtime.topic()` — den Topic-Namen, auf den der Client
-- gerade joinen will. `current_family_id()` liefert während des Onboardings
-- `null`; der Vergleich schlägt dann fehl und der Join wird abgelehnt, was genau
-- richtig ist.
--
-- Bewusst KEINE `insert`-Policy: Clients senden nicht auf diesen Kanal. Alle
-- Nachrichten kommen aus dem Trigger unten, der als `security definer` läuft und
-- RLS damit nicht unterliegt.
drop policy if exists "family members receive family broadcasts" on realtime.messages;

create policy "family members receive family broadcasts"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and (select realtime.topic()) = 'family:' || public.current_family_id()::text
);

-- 3. Trigger-Funktion für beide Tabellen.
create or replace function public.broadcast_family_change()
returns trigger
security definer
set search_path = ''
language plpgsql
as $$
declare
  fid uuid;
  eid uuid;
begin
  -- Bewusst KEIN `coalesce(NEW.x, OLD.x)`, obwohl die Supabase-Doku es so zeigt:
  -- In einem Row-Trigger auf DELETE ist `NEW` nicht zugewiesen, und ein
  -- Feldzugriff darauf kann mit `record "new" is not assigned yet` abbrechen —
  -- ausgerechnet im Fall, für den dieser ganze Entwurf gebaut ist.
  if TG_OP = 'DELETE' then
    fid := case when TG_TABLE_NAME = 'events' then OLD.family_id end;
    eid := case when TG_TABLE_NAME = 'events' then OLD.id else OLD.event_id end;
  else
    fid := case when TG_TABLE_NAME = 'events' then NEW.family_id end;
    eid := case when TG_TABLE_NAME = 'events' then NEW.id else NEW.event_id end;
  end if;

  -- `event_exceptions` trägt keine `family_id`; sie hängt am Event.
  if TG_TABLE_NAME <> 'events' then
    select e.family_id into fid from public.events e where e.id = eid;
  end if;

  -- Kaskade: `on delete cascade` räumt die Exceptions NACH der Master-Zeile ab,
  -- der Lookup läuft dann ins Leere. Das DELETE-Broadcast des Events selbst
  -- deckt den Fall bereits ab; ohne diesen Ausstieg entstünde das Topic
  -- `family:` ohne Id, das niemand abonniert.
  if fid is null then
    return null;
  end if;

  perform realtime.broadcast_changes(
    'family:' || fid::text,  -- topic
    TG_OP,                   -- event
    TG_OP,                   -- operation
    TG_TABLE_NAME,           -- table
    TG_TABLE_SCHEMA,         -- schema
    NEW,                     -- new record
    OLD                      -- old record
  );
  return null;
end;
$$;

comment on function public.broadcast_family_change() is
  'AFTER-Trigger für Realtime: sendet Zeilenänderungen auf das private Topic family:<family_id>. Eine Funktion für alle familiengebundenen Tabellen — Aufgaben und Essen anzuschließen heißt, den TG_TABLE_NAME-Zweig zu erweitern und einen Trigger zu setzen. Kosten: jede Mutation schreibt zusätzlich eine Zeile in realtime.messages (Supabase partitioniert tagesweise und löscht > 3 Tage selbst).';

drop trigger if exists broadcast_events_changes on public.events;
create trigger broadcast_events_changes
after insert or update or delete on public.events
for each row execute function public.broadcast_family_change();

drop trigger if exists broadcast_event_exceptions_changes on public.event_exceptions;
create trigger broadcast_event_exceptions_changes
after insert or update or delete on public.event_exceptions
for each row execute function public.broadcast_family_change();

-- `replica identity full` bleibt aus und ist jetzt endgültig gegenstandslos:
-- `OLD` kommt aus dem Trigger, nicht aus dem WAL (korrigiert ADR-028 Decision 6).
```

- [ ] **Step 2: Migration anwenden**

Über den Supabase-MCP-Server: `mcp__supabase__apply_migration` mit `name: "realtime_family_broadcast"` und dem SQL aus Step 1.

Braucht einen gültigen PAT in `.env.local` (siehe CLAUDE.md → MCP-Server). Ist der Server nicht verbunden, **hier abbrechen und melden** — nicht raten. Die Migration geht dann wie bei ADR-028 unangewendet in den Commit und wird in den Consequences vermerkt.

- [ ] **Step 3: Wirkung prüfen**

`mcp__supabase__execute_sql` mit:

```sql
select
  (select count(*) from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename in ('events','event_exceptions')) as still_published,
  (select count(*) from pg_policies
    where schemaname = 'realtime' and tablename = 'messages'
      and policyname = 'family members receive family broadcasts') as policy_count,
  (select count(*) from pg_trigger
    where tgname in ('broadcast_events_changes','broadcast_event_exceptions_changes')
      and not tgisinternal) as trigger_count;
```

Erwartet: `still_published = 0`, `policy_count = 1`, `trigger_count = 2`.

- [ ] **Step 4: Versions-Drift abgleichen**

Der MCP-Server vergibt einen eigenen Timestamp und ignoriert den Dateinamen. `mcp__supabase__list_migrations` aufrufen und den Dateinamen an die zurückgemeldete Version angleichen, falls sie abweicht — siehe `supabase/SETUP.md` §3. Bleibt die Divergenz stehen, hält die CLI die Migration für nicht angewendet und fährt bei `db push` die Basis-Migrationen erneut, die mit `drop table … cascade` beginnen.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260901120000_realtime_family_broadcast.sql
git commit -m "feat(realtime): Broadcast-Trigger und Kanal-Autorisierung für Familien-Topics"
```

---

## Task 2: Sync-Primitive — Topic, Status, Normalisierung

**Files:**

- Create: `features/realtime/topic.ts`, `features/realtime/status.ts`, `features/realtime/normalize.ts`
- Test: `features/realtime/topic.test.ts`, `features/realtime/normalize.test.ts`, `features/realtime/status.test.ts`

**Interfaces:**

- Consumes: nichts aus früheren Tasks (die Feldnamen `table` / `record` / `old_record` stammen aus Task 1)
- Produces:
  - `FAMILY_CHANNEL_PREFIX: "family"`, `familyTopic(familyId: string): string`
  - `type RealtimeStatus = "idle" | "subscribing" | "subscribed" | "timedOut" | "error" | "closed"`
  - `toRealtimeStatus(state: \`${REALTIME_SUBSCRIBE_STATES}\`): RealtimeStatus`
  - `useRealtimeStatusStore` mit `{ status: RealtimeStatus; degraded: boolean; setStatus(status: RealtimeStatus): void; setDegraded(value: boolean): void }`
  - `type FamilyChangeType = "INSERT" | "UPDATE" | "DELETE"`
  - `interface FamilyChange { table: string; type: FamilyChangeType; rowId: string | null; record: Record<string, unknown> | null; oldRecord: Record<string, unknown> | null; receivedAt: number }`
  - `normalizeBroadcast(type: FamilyChangeType, message: unknown, now?: () => number): FamilyChange`

- [ ] **Step 1: Die failing tests schreiben**

`features/realtime/topic.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { FAMILY_CHANNEL_PREFIX, familyTopic } from "./topic";

describe("familyTopic", () => {
  test("bildet ein Topic pro Familie", () => {
    expect(familyTopic("fam-1")).toBe(`${FAMILY_CHANNEL_PREFIX}:fam-1`);
  });

  test("trennt zwei Familien", () => {
    expect(familyTopic("a")).not.toBe(familyTopic("b"));
  });
});
```

`features/realtime/status.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { toRealtimeStatus, useRealtimeStatusStore } from "./status";

describe("toRealtimeStatus", () => {
  test("bildet alle vier Subscribe-States ab", () => {
    expect(toRealtimeStatus("SUBSCRIBED")).toBe("subscribed");
    expect(toRealtimeStatus("TIMED_OUT")).toBe("timedOut");
    expect(toRealtimeStatus("CLOSED")).toBe("closed");
    expect(toRealtimeStatus("CHANNEL_ERROR")).toBe("error");
  });
});

describe("useRealtimeStatusStore", () => {
  test("startet idle und nicht degradiert", () => {
    const state = useRealtimeStatusStore.getState();
    expect(state.status).toBe("idle");
    expect(state.degraded).toBe(false);
  });

  test("ein Wechsel auf subscribed räumt das Degraded-Flag mit ab", () => {
    useRealtimeStatusStore.getState().setDegraded(true);
    useRealtimeStatusStore.getState().setStatus("subscribed");
    expect(useRealtimeStatusStore.getState().degraded).toBe(false);
  });

  test("ein Wechsel auf error lässt das Flag unberührt — den Timer stellt der Hook", () => {
    useRealtimeStatusStore.getState().setStatus("subscribed");
    useRealtimeStatusStore.getState().setStatus("error");
    expect(useRealtimeStatusStore.getState().degraded).toBe(false);
    useRealtimeStatusStore.getState().setDegraded(true);
    useRealtimeStatusStore.getState().setStatus("closed");
    expect(useRealtimeStatusStore.getState().degraded).toBe(true);
  });
});
```

`features/realtime/normalize.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { normalizeBroadcast, type FamilyChangeType } from "./normalize";

const AT = 1_700_000_000_000;
const now = () => AT;

function message(
  type: FamilyChangeType,
  table: string,
  record: Record<string, unknown> | null,
  oldRecord: Record<string, unknown> | null,
) {
  return {
    type: "broadcast",
    event: type,
    payload: { schema: "public", table, operation: type, record, old_record: oldRecord },
  };
}

describe("normalizeBroadcast", () => {
  test("INSERT: Tabelle, Typ und Row-Id aus record", () => {
    const change = normalizeBroadcast(
      "INSERT",
      message("INSERT", "events", { id: "evt-1", family_id: "fam-1" }, null),
      now,
    );
    expect(change).toEqual({
      table: "events",
      type: "INSERT",
      rowId: "evt-1",
      record: { id: "evt-1", family_id: "fam-1" },
      oldRecord: null,
      receivedAt: AT,
    });
  });

  test("DELETE: Row-Id kommt aus old_record", () => {
    const change = normalizeBroadcast(
      "DELETE",
      message("DELETE", "events", null, { id: "evt-2", family_id: "fam-1" }),
      now,
    );
    expect(change.rowId).toBe("evt-2");
    expect(change.oldRecord).toEqual({ id: "evt-2", family_id: "fam-1" });
    expect(change.record).toBeNull();
  });

  test("UPDATE: record gewinnt, old_record bleibt erhalten", () => {
    const change = normalizeBroadcast(
      "UPDATE",
      message("UPDATE", "event_exceptions", { id: "exc-1", event_id: "evt-3" }, { id: "exc-1" }),
      now,
    );
    expect(change.table).toBe("event_exceptions");
    expect(change.rowId).toBe("exc-1");
    expect(change.record).toEqual({ id: "exc-1", event_id: "evt-3" });
  });

  test("kaputte Nachricht wirft nicht, sondern liefert leere Felder", () => {
    const change = normalizeBroadcast("INSERT", { nonsense: true }, now);
    expect(change).toEqual({
      table: "",
      type: "INSERT",
      rowId: null,
      record: null,
      oldRecord: null,
      receivedAt: AT,
    });
  });

  test("nicht-string Ids zählen nicht als Row-Id", () => {
    const change = normalizeBroadcast("INSERT", message("INSERT", "events", { id: 7 }, null), now);
    expect(change.rowId).toBeNull();
  });
});
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag bestätigen**

Run: `bun test features/realtime`
Expected: FAIL — `Cannot find module './topic'` (bzw. `./status`, `./normalize`).

- [ ] **Step 3: Implementieren**

`features/realtime/topic.ts`:

```ts
/**
 * Der Kanal ist **familienweit**, nicht kalenderspezifisch (ADR-030 Decision 2):
 * ein WebSocket-Abo und eine RLS-Policy für alle Features statt je eines pro
 * Feature. Aufgaben und Essen anzuschließen heißt später, einen Trigger zu
 * setzen und einen Mapper zu registrieren — der Topic-Name bleibt.
 *
 * Muss zeichengleich zum Topic aus `public.broadcast_family_change()` sein
 * (`supabase/migrations/20260901120000_realtime_family_broadcast.sql`); die
 * RLS-Policy auf `realtime.messages` vergleicht ihn wörtlich.
 */
export const FAMILY_CHANNEL_PREFIX = "family";

export function familyTopic(familyId: string): string {
  return `${FAMILY_CHANNEL_PREFIX}:${familyId}`;
}
```

`features/realtime/status.ts`:

```ts
import type { REALTIME_SUBSCRIBE_STATES } from "@supabase/supabase-js";

import { create } from "zustand";

/**
 * Verbindungszustand des Familien-Kanals — ein Store, weil ihn zwei Screens
 * anzeigen (`<SyncNotice />` auf Kalender und Dashboard), aber nur ein einziger
 * Mountpunkt ihn schreibt (`useFamilyRealtime`).
 *
 * Die Datei importiert bewusst kein `react-native` und kein Feature, damit sie
 * unter `bun test` ohne die Mocks aus `bun.test.preload.ts` lädt.
 */

/** `idle` heißt: keine `family_id`, es gibt nichts zu abonnieren. */
export type RealtimeStatus =
  "idle" | "subscribing" | "subscribed" | "timedOut" | "error" | "closed";

export function toRealtimeStatus(state: `${REALTIME_SUBSCRIBE_STATES}`): RealtimeStatus {
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

interface RealtimeStatusState {
  status: RealtimeStatus;
  /**
   * Ob der Kanal lange genug weg ist, dass es den Nutzer etwas angeht. Der
   * Timer dafür liegt in `useFamilyRealtime` und nicht in der anzeigenden
   * Komponente: ein `setState` aus einem Timer heraus fiele unter
   * `react-hooks/set-state-in-effect` (in diesem Repo ein Error), ein
   * Store-Write nicht — und ein Timer an einer Stelle schlägt einen pro Screen.
   */
  degraded: boolean;
  setStatus: (status: RealtimeStatus) => void;
  setDegraded: (value: boolean) => void;
}

export const useRealtimeStatusStore = create<RealtimeStatusState>((set) => ({
  status: "idle",
  degraded: false,
  // `subscribed` räumt das Flag mit ab: Die Verbindung steht wieder, ein
  // stehengebliebener Hinweis wäre schlicht falsch. Jeder andere Wechsel lässt
  // es unberührt — ob er „lange genug" dauert, entscheidet der Timer.
  setStatus: (status) => set(status === "subscribed" ? { status, degraded: false } : { status }),
  setDegraded: (degraded) => set({ degraded }),
}));
```

`features/realtime/normalize.ts`:

```ts
/**
 * Broadcast-Nachricht → `FamilyChange`.
 *
 * Anders als unter `postgres_changes` (ADR-028) ist ein DELETE hier **kein**
 * Sonderfall: Der Trigger sieht die alte Zeile noch und schickt sie in
 * `old_record`, inklusive `family_id` und `event_id`. Genau deshalb hat
 * `FamilyChange` keine Null-Variante mehr für die zuordnende Id.
 *
 * Die Eingabe ist `unknown` und wird zur Laufzeit geprüft: Der Payload kommt
 * über das Netz aus einer Trigger-Funktion, nicht aus dem eigenen Typsystem.
 * Eine kaputte Nachricht darf den Kanal nicht abreißen lassen.
 */
export type FamilyChangeType = "INSERT" | "UPDATE" | "DELETE";

export interface FamilyChange {
  /** `TG_TABLE_NAME` aus dem Trigger. Bewusst `string`: Die Sync-Schicht kennt
   *  die Tabellen der Features nicht, die Mapper prüfen selbst. */
  table: string;
  type: FamilyChangeType;
  rowId: string | null;
  record: Record<string, unknown> | null;
  oldRecord: Record<string, unknown> | null;
  receivedAt: number;
}

function objectField(source: unknown, key: string): Record<string, unknown> | null {
  if (typeof source !== "object" || source === null) return null;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function stringField(source: Record<string, unknown> | null, key: string): string | null {
  if (source === null) return null;
  const value = source[key];
  return typeof value === "string" ? value : null;
}

export function normalizeBroadcast(
  type: FamilyChangeType,
  message: unknown,
  now: () => number = Date.now,
): FamilyChange {
  const payload = objectField(message, "payload");
  const record = objectField(payload, "record");
  const oldRecord = objectField(payload, "old_record");
  const table = stringField(payload, "table") ?? "";
  // Eine Reihenfolge für alle drei Operationen: bei INSERT/UPDATE steht die Id
  // in `record`, bei DELETE nur in `old_record`.
  const rowId = stringField(record, "id") ?? stringField(oldRecord, "id");

  return { table, type, rowId, record, oldRecord, receivedAt: now() };
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `bun test features/realtime`
Expected: PASS (11 Tests).

- [ ] **Step 5: Commit**

```bash
git add features/realtime/topic.ts features/realtime/topic.test.ts \
        features/realtime/status.ts features/realtime/status.test.ts \
        features/realtime/normalize.ts features/realtime/normalize.test.ts
git commit -m "feat(realtime): Topic, Verbindungsstatus und Payload-Normalisierung"
```

---

## Task 3: Sammelfenster und Reconnect-Regeln

**Files:**

- Create: `features/realtime/coalesce.ts`, `features/realtime/reconnect.ts`
- Test: `features/realtime/coalesce.test.ts`, `features/realtime/reconnect.test.ts`

**Interfaces:**

- Consumes: `RealtimeStatus` aus `./status` (Task 2)
- Produces:
  - `mergeInvalidationKeys(keys: readonly QueryKey[]): QueryKey[]`
  - `COALESCE_WINDOW_MS = 300`
  - `DEGRADED_AFTER_MS = 10_000`
  - `shouldRefetchAfterResubscribe(prev: RealtimeStatus, next: RealtimeStatus): boolean`
  - `degradedDelayMs(status: RealtimeStatus): number | null`

- [ ] **Step 1: Die failing tests schreiben**

`features/realtime/coalesce.test.ts`:

```ts
import type { QueryKey } from "@tanstack/react-query";

import { describe, expect, test } from "bun:test";

import { mergeInvalidationKeys } from "./coalesce";

describe("mergeInvalidationKeys", () => {
  test("leere Eingabe bleibt leer", () => {
    expect(mergeInvalidationKeys([])).toEqual([]);
  });

  test("dedupliziert strukturgleiche Schlüssel", () => {
    const keys: QueryKey[] = [
      ["calendar", "events"],
      ["calendar", "events"],
      ["calendar", "event", "evt-1"],
    ];
    expect(mergeInvalidationKeys(keys)).toEqual([
      ["calendar", "events"],
      ["calendar", "event", "evt-1"],
    ]);
  });

  test("hält die Reihenfolge des ersten Auftretens", () => {
    const keys: QueryKey[] = [
      ["calendar", "event", "b"],
      ["calendar", "event", "a"],
      ["calendar", "event", "b"],
    ];
    expect(mergeInvalidationKeys(keys)).toEqual([
      ["calendar", "event", "b"],
      ["calendar", "event", "a"],
    ]);
  });

  test("ein Serien-Delete kollabiert auf zwei Schlüssel", () => {
    // Master-Zeile + zwei Exceptions desselben Events im selben Fenster.
    const keys: QueryKey[] = [
      ["calendar", "events"],
      ["calendar", "event", "evt-1"],
      ["calendar", "events"],
      ["calendar", "event", "evt-1"],
      ["calendar", "events"],
      ["calendar", "event", "evt-1"],
    ];
    expect(mergeInvalidationKeys(keys)).toHaveLength(2);
  });
});
```

`features/realtime/reconnect.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { DEGRADED_AFTER_MS, degradedDelayMs, shouldRefetchAfterResubscribe } from "./reconnect";

describe("shouldRefetchAfterResubscribe", () => {
  test("das erste Abonnieren löst keinen Nachlade-Lauf aus", () => {
    expect(shouldRefetchAfterResubscribe("idle", "subscribed")).toBe(false);
    expect(shouldRefetchAfterResubscribe("subscribing", "subscribed")).toBe(false);
  });

  test("die Rückkehr aus einem Verlust lädt nach", () => {
    expect(shouldRefetchAfterResubscribe("closed", "subscribed")).toBe(true);
    expect(shouldRefetchAfterResubscribe("timedOut", "subscribed")).toBe(true);
    expect(shouldRefetchAfterResubscribe("error", "subscribed")).toBe(true);
  });

  test("jeder Wechsel, der nicht auf subscribed endet, lädt nichts nach", () => {
    expect(shouldRefetchAfterResubscribe("subscribed", "closed")).toBe(false);
    expect(shouldRefetchAfterResubscribe("error", "timedOut")).toBe(false);
  });
});

describe("degradedDelayMs", () => {
  test("eine stehende Verbindung wird nie degradiert", () => {
    expect(degradedDelayMs("subscribed")).toBeNull();
  });

  test("ohne Familie gibt es nichts zu melden", () => {
    expect(degradedDelayMs("idle")).toBeNull();
  });

  test("jeder Verlustzustand bekommt dieselbe Schonfrist", () => {
    for (const status of ["subscribing", "timedOut", "error", "closed"] as const) {
      expect(degradedDelayMs(status)).toBe(DEGRADED_AFTER_MS);
    }
  });
});
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag bestätigen**

Run: `bun test features/realtime/coalesce.test.ts features/realtime/reconnect.test.ts`
Expected: FAIL — `Cannot find module './coalesce'`.

- [ ] **Step 3: Implementieren**

`features/realtime/coalesce.ts`:

```ts
import type { QueryKey } from "@tanstack/react-query";

/**
 * Wie lange eingehende Änderungen gesammelt werden, bevor invalidiert wird.
 *
 * Der Gewinn ist nicht Kosmetik: Eine Scope-Löschung fasst mehrere Zeilen an
 * (Exception schreiben **und** Master-Zeile anfassen), jede davon erzeugt ein
 * eigenes Broadcast. Ohne Fenster wären das mehrere Refetches derselben
 * Range-Query. 300 ms liegen unter der Schwelle, ab der „sofort" nicht mehr
 * sofort wirkt.
 */
export const COALESCE_WINDOW_MS = 300;

/**
 * Dedupliziert Query-Keys eines Sammelfensters, Reihenfolge des ersten
 * Auftretens.
 *
 * `JSON.stringify` als Identität ist hier tragfähig, weil alle Kalender-Keys
 * aus Strings bestehen (`calendarKeys` in features/calendar/queries.ts). Käme je
 * ein Key mit Objekt-Segment dazu, müsste diese Funktion mitwachsen — deshalb
 * steht es hier und nicht nur im Test.
 */
export function mergeInvalidationKeys(keys: readonly QueryKey[]): QueryKey[] {
  const seen = new Set<string>();
  const out: QueryKey[] = [];
  for (const key of keys) {
    const id = JSON.stringify(key);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(key);
  }
  return out;
}
```

`features/realtime/reconnect.ts`:

```ts
import type { RealtimeStatus } from "./status";

/**
 * Ab wann ein Verbindungsverlust den Nutzer etwas angeht.
 *
 * Die Schwelle ist der Punkt: Ein normaler Reconnect nach Bildschirmsperre
 * dauert unter einer Sekunde. Ohne sie blitzte bei jedem App-Wechsel ein
 * Hinweis auf, den niemand lesen kann und den keiner braucht.
 */
export const DEGRADED_AFTER_MS = 10_000;

/**
 * Ob nach einem Statuswechsel der verpasste Stand nachzuladen ist.
 *
 * Broadcasts werden **nicht** nachgeliefert: Nach jeder Unterbrechung ist der
 * Cache stumm veraltet. Das erste Abonnieren ist ausgenommen — dort holt die
 * Query ihre Daten ohnehin gerade selbst, ein zweiter Lauf wäre reine Last.
 */
export function shouldRefetchAfterResubscribe(prev: RealtimeStatus, next: RealtimeStatus): boolean {
  if (next !== "subscribed") return false;
  return prev === "closed" || prev === "timedOut" || prev === "error";
}

/**
 * Wie lange dieser Status anhalten darf, bevor er sichtbar wird — `null` heißt
 * „gar nicht melden".
 *
 * `subscribing` bekommt dieselbe Frist wie ein echter Verlust: Ein Abo, das
 * nach zehn Sekunden immer noch nicht steht, ist praktisch dasselbe wie ein
 * abgerissenes.
 */
export function degradedDelayMs(status: RealtimeStatus): number | null {
  if (status === "subscribed" || status === "idle") return null;
  return DEGRADED_AFTER_MS;
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `bun test features/realtime`
Expected: PASS (alle aus Task 2 und 3, 21 Tests).

- [ ] **Step 5: Commit**

```bash
git add features/realtime/coalesce.ts features/realtime/coalesce.test.ts \
        features/realtime/reconnect.ts features/realtime/reconnect.test.ts
git commit -m "feat(realtime): Sammelfenster und Reconnect-Regeln"
```

---

## Task 4: Die React-freie Kernfunktion

**Files:**

- Create: `features/realtime/subscribe.ts`
- Test: `features/realtime/subscribe.test.ts`

**Interfaces:**

- Consumes: `familyTopic` (Task 2), `normalizeBroadcast` / `FamilyChange` (Task 2), `toRealtimeStatus` / `RealtimeStatus` (Task 2)
- Produces: `subscribeToFamilyChanges(args: SubscribeToFamilyChangesArgs): Promise<() => void>` mit `SubscribeToFamilyChangesArgs = { client: SupabaseClient<Database>; familyId: string; onChange: (change: FamilyChange) => void; onStatus?: (status: RealtimeStatus) => void; now?: () => number }`

- [ ] **Step 1: Den failing test schreiben**

`features/realtime/subscribe.test.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

import { describe, expect, test } from "bun:test";

import type { Database } from "@/features/supabase/database.types";

import type { FamilyChange } from "./normalize";
import type { RealtimeStatus } from "./status";

import { subscribeToFamilyChanges } from "./subscribe";
import { familyTopic } from "./topic";

const FAMILY_ID = "fam-1";

type Handler = (message: unknown) => void;

/**
 * Minimaler Doppelgänger des Supabase-Clients. Kein `mock.module`: Die
 * Kernfunktion nimmt den Client als Parameter, genau damit ein Test ihn
 * ersetzen kann.
 */
function fakeClient() {
  const handlers = new Map<string, Handler>();
  const calls = {
    setAuth: 0,
    removed: 0,
    topic: "",
    config: undefined as unknown,
    subscribeCallbacks: [] as ((state: string) => void)[],
  };

  const channel = {
    on(_type: "broadcast", filter: { event: string }, handler: Handler) {
      handlers.set(filter.event, handler);
      return channel;
    },
    subscribe(cb: (state: string) => void) {
      calls.subscribeCallbacks.push(cb);
      return channel;
    },
  };

  const client = {
    realtime: {
      setAuth: () => {
        calls.setAuth += 1;
        return Promise.resolve();
      },
    },
    channel(topic: string, config?: unknown) {
      calls.topic = topic;
      calls.config = config;
      return channel;
    },
    removeChannel: () => {
      calls.removed += 1;
      return Promise.resolve("ok");
    },
  };

  return { client: client as unknown as SupabaseClient<Database>, calls, handlers };
}

function broadcast(table: string, id: string) {
  return {
    type: "broadcast",
    event: "INSERT",
    payload: { schema: "public", table, operation: "INSERT", record: { id }, old_record: null },
  };
}

describe("subscribeToFamilyChanges", () => {
  test("authentifiziert den Socket, bevor der private Kanal joint", async () => {
    const { client, calls } = fakeClient();
    await subscribeToFamilyChanges({ client, familyId: FAMILY_ID, onChange: () => {} });
    expect(calls.setAuth).toBe(1);
    expect(calls.topic).toBe(familyTopic(FAMILY_ID));
    expect(calls.config).toEqual({ config: { private: true } });
  });

  test("bindet genau die drei Operationen", async () => {
    const { client, handlers } = fakeClient();
    await subscribeToFamilyChanges({ client, familyId: FAMILY_ID, onChange: () => {} });
    expect([...handlers.keys()].sort()).toEqual(["DELETE", "INSERT", "UPDATE"]);
  });

  test("reicht normalisierte Änderungen durch", async () => {
    const { client, handlers } = fakeClient();
    const seen: FamilyChange[] = [];
    await subscribeToFamilyChanges({
      client,
      familyId: FAMILY_ID,
      onChange: (change) => seen.push(change),
      now: () => 42,
    });
    handlers.get("INSERT")?.(broadcast("events", "evt-1"));
    expect(seen).toEqual([
      {
        table: "events",
        type: "INSERT",
        rowId: "evt-1",
        record: { id: "evt-1" },
        oldRecord: null,
        receivedAt: 42,
      },
    ]);
  });

  test("meldet subscribing vor der Antwort und danach den Server-Status", async () => {
    const { client, calls } = fakeClient();
    const states: RealtimeStatus[] = [];
    await subscribeToFamilyChanges({
      client,
      familyId: FAMILY_ID,
      onChange: () => {},
      onStatus: (status) => states.push(status),
    });
    expect(states).toEqual(["subscribing"]);
    calls.subscribeCallbacks[0]?.("SUBSCRIBED");
    expect(states).toEqual(["subscribing", "subscribed"]);
  });

  test("der Rückgabewert entfernt den Kanal", async () => {
    const { client, calls } = fakeClient();
    const unsubscribe = await subscribeToFamilyChanges({
      client,
      familyId: FAMILY_ID,
      onChange: () => {},
    });
    expect(calls.removed).toBe(0);
    unsubscribe();
    expect(calls.removed).toBe(1);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `bun test features/realtime/subscribe.test.ts`
Expected: FAIL — `Cannot find module './subscribe'`.

- [ ] **Step 3: Implementieren**

`features/realtime/subscribe.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/features/supabase/database.types";

import type { FamilyChange, FamilyChangeType } from "./normalize";
import type { RealtimeStatus } from "./status";

import { normalizeBroadcast } from "./normalize";
import { toRealtimeStatus } from "./status";
import { familyTopic } from "./topic";

const OPERATIONS: FamilyChangeType[] = ["INSERT", "UPDATE", "DELETE"];

export interface SubscribeToFamilyChangesArgs {
  client: SupabaseClient<Database>;
  familyId: string;
  onChange: (change: FamilyChange) => void;
  onStatus?: (status: RealtimeStatus) => void;
  now?: () => number;
}

/**
 * Baut den privaten Familien-Kanal auf und gibt seine Abmeldung zurück.
 *
 * React-frei: Der Client kommt als Parameter, damit ein Test ihn ohne
 * `mock.module` ersetzen kann — dieselbe Form wie `createSupabaseEventOps` in
 * features/calendar/recurrence.ts, und die einzige, in der das Modul hier
 * prüfbar ist (es gibt im Repo keinen Pfad, auf dem RN-Komponenten unter
 * `bun test` rendern).
 *
 * **`async` wegen `setAuth()`.** Realtime Authorization ist für private Kanäle
 * Pflicht: Ohne den Zugriffstoken am Socket lehnt die RLS-Policy auf
 * `realtime.messages` den Join ab. Das korrigiert die Notiz in ADR-028, ein
 * `setAuth()` sei verzichtbar — für `postgres_changes` stimmte sie, hier nicht.
 * Der Aufrufer muss deshalb damit rechnen, dass das `await` erst nach seinem
 * Unmount durchläuft (siehe `useFamilyRealtime`).
 */
export async function subscribeToFamilyChanges({
  client,
  familyId,
  onChange,
  onStatus,
  now,
}: SubscribeToFamilyChangesArgs): Promise<() => void> {
  await client.realtime.setAuth();

  // Der Kanal wird bei jedem Aufruf frisch erzeugt und in der Abmeldung
  // entsorgt, nie über Renders hinweg wiederverwendet: React hängt im
  // StrictMode jeden Effekt einmal ab und wieder an, und ein zweites
  // `subscribe()` auf demselben Kanal wirft „tried to subscribe multiple times".
  const channel = client.channel(familyTopic(familyId), { config: { private: true } });

  for (const operation of OPERATIONS) {
    channel.on("broadcast", { event: operation }, (message) => {
      // Die Operation kommt aus dem Binding, nicht aus dem Payload: Das Binding
      // ist typisiert, `payload.operation` ist ein `string` und bräuchte eine
      // Behauptung, die nichts prüft.
      onChange(normalizeBroadcast(operation, message, now));
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
```

- [ ] **Step 4: Test laufen lassen**

Run: `bun test features/realtime`
Expected: PASS (26 Tests).

- [ ] **Step 5: Commit**

```bash
git add features/realtime/subscribe.ts features/realtime/subscribe.test.ts
git commit -m "feat(realtime): privater Familien-Kanal als React-freie Kernfunktion"
```

---

## Task 5: Der Kalender-Mapper

**Files:**

- Create: `features/calendar/realtimeKeys.ts`
- Modify: `features/calendar/queries.ts:11-17` (Präfix-Konstanten)
- Test: `features/calendar/realtimeKeys.test.ts`

**Interfaces:**

- Consumes: `FamilyChange` (Task 2)
- Produces:
  - `calendarKeys.eventsRoot: readonly ["calendar", "events"]`, `calendarKeys.oneRoot: readonly ["calendar", "event"]`
  - `calendarInvalidationKeys(change: FamilyChange): QueryKey[]`

- [ ] **Step 1: Den failing test schreiben**

`features/calendar/realtimeKeys.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import type { FamilyChange, FamilyChangeType } from "@/features/realtime/normalize";

import { calendarKeys } from "./queries";
import { calendarInvalidationKeys } from "./realtimeKeys";

function change(
  table: string,
  type: FamilyChangeType,
  record: Record<string, unknown> | null,
  oldRecord: Record<string, unknown> | null = null,
): FamilyChange {
  const rowId = typeof record?.id === "string" ? record.id : null;
  const oldId = typeof oldRecord?.id === "string" ? oldRecord.id : null;
  return { table, type, rowId: rowId ?? oldId, record, oldRecord, receivedAt: 0 };
}

describe("calendarInvalidationKeys", () => {
  test("ein Event-INSERT trifft die Ranges und den Einzeltermin", () => {
    expect(calendarInvalidationKeys(change("events", "INSERT", { id: "evt-1" }))).toEqual([
      calendarKeys.eventsRoot,
      calendarKeys.one("evt-1"),
    ]);
  });

  test("ein Event-DELETE ist genauso zuzuordnen — der Trigger schickt die alte Zeile", () => {
    expect(calendarInvalidationKeys(change("events", "DELETE", null, { id: "evt-2" }))).toEqual([
      calendarKeys.eventsRoot,
      calendarKeys.one("evt-2"),
    ]);
  });

  test("eine Exception hängt am Event, nicht an sich selbst", () => {
    const keys = calendarInvalidationKeys(
      change("event_exceptions", "INSERT", { id: "exc-1", event_id: "evt-3" }),
    );
    expect(keys).toEqual([calendarKeys.eventsRoot, calendarKeys.one("evt-3")]);
  });

  test("eine gelöschte Exception zieht ihre event_id aus old_record", () => {
    const keys = calendarInvalidationKeys(
      change("event_exceptions", "DELETE", null, { id: "exc-2", event_id: "evt-4" }),
    );
    expect(keys).toEqual([calendarKeys.eventsRoot, calendarKeys.one("evt-4")]);
  });

  test("ohne zuordenbare Event-Id bleiben die Ranges übrig", () => {
    expect(calendarInvalidationKeys(change("event_exceptions", "INSERT", { id: "exc-3" }))).toEqual(
      [calendarKeys.eventsRoot],
    );
  });

  test("fremde Tabellen gehen den Kalender nichts an", () => {
    expect(calendarInvalidationKeys(change("tasks", "INSERT", { id: "task-1" }))).toEqual([]);
  });

  test("types und reminders werden nie invalidiert", () => {
    const keys = calendarInvalidationKeys(change("events", "UPDATE", { id: "evt-5" }));
    expect(keys).not.toContainEqual(calendarKeys.types);
    expect(keys).not.toContainEqual(calendarKeys.all);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `bun test features/calendar/realtimeKeys.test.ts`
Expected: FAIL — `Cannot find module './realtimeKeys'`.

- [ ] **Step 3: `calendarKeys` erweitern**

In `features/calendar/queries.ts` den Block ersetzen:

```ts
export const calendarKeys = {
  all: ["calendar"] as const,
  /**
   * Präfix über **alle** Range-Queries — `range()` hängt nur Start und Ende an.
   * Existiert getrennt von `all`, weil `all` (`["calendar"]`) auch `types` und
   * `reminders` überdeckt, die eine Termin-Änderung nie betrifft.
   */
  eventsRoot: ["calendar", "events"] as const,
  /** Präfix über alle Einzeltermin-Queries. Siehe `eventsRoot`. */
  oneRoot: ["calendar", "event"] as const,
  range: (start: string, end: string) => ["calendar", "events", start, end] as const,
  one: (id: string) => ["calendar", "event", id] as const,
  types: ["calendar", "types"] as const,
  reminders: (eventId: string) => ["calendar", "reminders", eventId] as const,
};
```

- [ ] **Step 4: Den Mapper schreiben**

`features/calendar/realtimeKeys.ts`:

```ts
import type { QueryKey } from "@tanstack/react-query";

import type { FamilyChange } from "@/features/realtime/normalize";

import { calendarKeys } from "./queries";

/**
 * Welche Query-Keys eine eingehende Änderung veraltet.
 *
 * Der Import ist `import type` und damit zur Laufzeit nicht vorhanden — dieses
 * Modul hängt an keinem Teil der Sync-Schicht, nur an ihrer Form. Andersherum
 * kennt `features/realtime/dispatch.ts` diese Datei sehr wohl: Die Sync-Schicht
 * steht über den Features (ADR-030 Decision 9).
 *
 * Bewusst **nicht** `calendarKeys.all`: Das ist der Präfix `["calendar"]` und
 * zöge `types` (eine Nachschlagetabelle) und `reminders` (eine eigene Tabelle
 * ohne Trigger) mit, die von einer Termin-Änderung nie betroffen sind.
 */
export function calendarInvalidationKeys(change: FamilyChange): QueryKey[] {
  if (change.table !== "events" && change.table !== "event_exceptions") return [];

  const eventId =
    change.table === "events" ? change.rowId : eventIdOf(change.record ?? change.oldRecord);

  return eventId ? [calendarKeys.eventsRoot, calendarKeys.one(eventId)] : [calendarKeys.eventsRoot];
}

function eventIdOf(row: Record<string, unknown> | null): string | null {
  const value = row?.event_id;
  return typeof value === "string" ? value : null;
}
```

- [ ] **Step 5: Tests laufen lassen**

Run: `bun test features/calendar/realtimeKeys.test.ts`
Expected: PASS (7 Tests).

- [ ] **Step 6: Die volle Suite laufen lassen**

Run: `bun test`
Expected: PASS — die `calendarKeys`-Erweiterung ist additiv, nichts Bestehendes darf brechen.

- [ ] **Step 7: Commit**

```bash
git add features/calendar/queries.ts features/calendar/realtimeKeys.ts \
        features/calendar/realtimeKeys.test.ts
git commit -m "feat(calendar): Realtime-Änderungen auf Query-Keys abbilden"
```

---

## Task 6: Verteiler und Mountpunkt

**Files:**

- Create: `features/realtime/dispatch.ts`, `features/realtime/useFamilyRealtime.ts`, `features/realtime/index.ts`
- Modify: `app/_layout.tsx:16-23`
- Test: `features/realtime/dispatch.test.ts`

**Interfaces:**

- Consumes: `mergeInvalidationKeys` / `COALESCE_WINDOW_MS` (Task 3), `shouldRefetchAfterResubscribe` / `degradedDelayMs` (Task 3), `subscribeToFamilyChanges` (Task 4), `calendarInvalidationKeys` / `calendarKeys` (Task 5), `useCurrentParent` aus `@/features/auth`
- Produces:
  - `invalidationKeysFor(changes: readonly FamilyChange[]): QueryKey[]`
  - `reconnectInvalidationKeys(): QueryKey[]`
  - `useFamilyRealtime(): void`
  - Barrel `@/features/realtime` mit `useFamilyRealtime`, `useRealtimeStatusStore`, `familyTopic`, `subscribeToFamilyChanges`, `type FamilyChange`, `type RealtimeStatus`

- [ ] **Step 1: Den failing test schreiben**

`features/realtime/dispatch.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { calendarKeys } from "@/features/calendar/queries";

import type { FamilyChange } from "./normalize";

import { invalidationKeysFor, reconnectInvalidationKeys } from "./dispatch";

function change(table: string, id: string, eventId?: string): FamilyChange {
  return {
    table,
    type: "UPDATE",
    rowId: id,
    record: eventId ? { id, event_id: eventId } : { id },
    oldRecord: null,
    receivedAt: 0,
  };
}

describe("invalidationKeysFor", () => {
  test("ein leeres Fenster invalidiert nichts", () => {
    expect(invalidationKeysFor([])).toEqual([]);
  });

  test("bündelt ein Fenster aus Master-Zeile und zwei Exceptions auf zwei Schlüssel", () => {
    const keys = invalidationKeysFor([
      change("events", "evt-1"),
      change("event_exceptions", "exc-1", "evt-1"),
      change("event_exceptions", "exc-2", "evt-1"),
    ]);
    expect(keys).toEqual([calendarKeys.eventsRoot, calendarKeys.one("evt-1")]);
  });

  test("zwei verschiedene Events behalten ihre eigenen Schlüssel", () => {
    const keys = invalidationKeysFor([change("events", "evt-1"), change("events", "evt-2")]);
    expect(keys).toHaveLength(3);
  });

  test("Änderungen fremder Tabellen fallen heraus", () => {
    expect(invalidationKeysFor([change("tasks", "task-1")])).toEqual([]);
  });
});

describe("reconnectInvalidationKeys", () => {
  test("deckt beide Kalender-Wurzeln ab, aber nicht types oder reminders", () => {
    const keys = reconnectInvalidationKeys();
    expect(keys).toEqual([calendarKeys.eventsRoot, calendarKeys.oneRoot]);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `bun test features/realtime/dispatch.test.ts`
Expected: FAIL — `Cannot find module './dispatch'`.

- [ ] **Step 3: `dispatch.ts` implementieren**

```ts
import type { QueryKey } from "@tanstack/react-query";

import { calendarKeys } from "@/features/calendar/queries";
import { calendarInvalidationKeys } from "@/features/calendar/realtimeKeys";

import type { FamilyChange } from "./normalize";

import { mergeInvalidationKeys } from "./coalesce";

/**
 * Die **einzige** Datei der Sync-Schicht, die Features kennt.
 *
 * Der Kanal ist familienweit (ADR-030 Decision 2); welche Query-Keys eine
 * Änderung veraltet, weiß nur das besitzende Feature. Die Alternative — eine
 * Registry, bei der jedes Feature sich beim Modul-Laden anmeldet — wäre ein
 * impliziter Seiteneffekt beim Import und in Tests schwerer zu fassen als
 * dieser explizite Aufruf. Aufgaben oder Essen anzuschließen heißt: eine Zeile
 * mehr in `MAPPERS`.
 */
const MAPPERS: ((change: FamilyChange) => QueryKey[])[] = [calendarInvalidationKeys];

export function invalidationKeysFor(changes: readonly FamilyChange[]): QueryKey[] {
  return mergeInvalidationKeys(changes.flatMap((change) => MAPPERS.flatMap((map) => map(change))));
}

/**
 * Was nach einer Verbindungsunterbrechung nachzuladen ist.
 *
 * Verpasste Broadcasts werden nicht nachgeliefert, also lässt sich nicht
 * bestimmen, *was* fehlt — nur, *was hätte kommen können*. Das ist die
 * Vereinigung der Wurzeln, die überhaupt aus einem Broadcast entstehen können,
 * und ausdrücklich nicht `calendarKeys.all`.
 */
export function reconnectInvalidationKeys(): QueryKey[] {
  return mergeInvalidationKeys([calendarKeys.eventsRoot, calendarKeys.oneRoot]);
}
```

- [ ] **Step 4: Test laufen lassen**

Run: `bun test features/realtime/dispatch.test.ts`
Expected: PASS (5 Tests).

- [ ] **Step 5: `useFamilyRealtime.ts` schreiben**

```ts
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { useCurrentParent } from "@/features/auth";
import { supabase } from "@/features/supabase";

import type { FamilyChange } from "./normalize";
import type { RealtimeStatus } from "./status";

import { COALESCE_WINDOW_MS } from "./coalesce";
import { invalidationKeysFor, reconnectInvalidationKeys } from "./dispatch";
import { degradedDelayMs, shouldRefetchAfterResubscribe } from "./reconnect";
import { useRealtimeStatusStore } from "./status";
import { subscribeToFamilyChanges } from "./subscribe";

/**
 * Der eine Mountpunkt des Familien-Kanals.
 *
 * Aufgerufen in `ThemedStack` (app/_layout.tsx) und **nur dort**. Die
 * naheliegende Stelle wäre `useFamilyEvents` gewesen — so steht es im Issue —,
 * aber der Hook hat drei Aufrufer, zwei davon dauerhaft gemountet (Kalender und
 * Dashboard). Das wären drei Kanäle auf einem Topic für eine Wirkung, die
 * global ist (ADR-030 Decision 4). Der Aufruf steht **vor** `<AuthGate>`: Der
 * Gate rendert bei Redirects `<Redirect>` statt seiner Kinder, ein Abo darunter
 * würde bei jedem Routenwechsel ab- und wieder aufgebaut.
 *
 * Vier Aufgaben, die zusammengehören, weil sie alle am selben Lebenszyklus
 * hängen: abonnieren, eingehende Änderungen 300 ms sammeln und einmal
 * invalidieren, nach einem Verbindungsverlust nachladen, und den
 * Degraded-Timer stellen, den `<SyncNotice />` anzeigt.
 */
export function useFamilyRealtime(): void {
  const qc = useQueryClient();
  const parent = useCurrentParent();
  const familyId = parent.data?.family_id ?? null;

  const buffer = useRef<FamilyChange[]>([]);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const degradeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousStatus = useRef<RealtimeStatus>("idle");

  useEffect(() => {
    const store = useRealtimeStatusStore.getState();

    if (!familyId) {
      store.setStatus("idle");
      store.setDegraded(false);
      previousStatus.current = "idle";
      return;
    }

    // Das `await` in `subscribeToFamilyChanges` (setAuth) kann nach dem Unmount
    // durchlaufen. Ohne diesen Marker bliebe der eben erzeugte Kanal verwaist
    // stehen — sichtbar erst als doppelte Ereignisse nach dem nächsten Mount.
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    const flush = () => {
      flushTimer.current = null;
      const changes = buffer.current;
      buffer.current = [];
      for (const key of invalidationKeysFor(changes)) {
        void qc.invalidateQueries({ queryKey: key });
      }
    };

    const handleStatus = (status: RealtimeStatus) => {
      const previous = previousStatus.current;
      previousStatus.current = status;
      useRealtimeStatusStore.getState().setStatus(status);

      if (degradeTimer.current) clearTimeout(degradeTimer.current);
      const delay = degradedDelayMs(status);
      degradeTimer.current =
        delay === null
          ? null
          : setTimeout(() => {
              useRealtimeStatusStore.getState().setDegraded(true);
            }, delay);

      // Verpasste Broadcasts kommen nicht nach: nach einer Unterbrechung ist
      // der Cache stumm veraltet.
      if (shouldRefetchAfterResubscribe(previous, status)) {
        for (const key of reconnectInvalidationKeys()) {
          void qc.invalidateQueries({ queryKey: key });
        }
      }
    };

    void subscribeToFamilyChanges({
      client: supabase,
      familyId,
      onChange: (change) => {
        buffer.current.push(change);
        if (flushTimer.current === null) {
          flushTimer.current = setTimeout(flush, COALESCE_WINDOW_MS);
        }
      },
      onStatus: handleStatus,
    }).then(
      (cleanup) => {
        if (cancelled) {
          cleanup();
          return;
        }
        unsubscribe = cleanup;
      },
      (error: unknown) => {
        // `setAuth` kann ablehnen (kein Token, kein Netz). Das ist kein
        // Kanal-Zustand, den der Server meldet — ohne diesen Zweig bliebe der
        // Status auf `subscribing` stehen und niemand erführe davon.
        console.error("[useFamilyRealtime] Kanal konnte nicht aufgebaut werden", { error });
        if (!cancelled) handleStatus("error");
      },
    );

    return () => {
      cancelled = true;
      unsubscribe?.();
      if (flushTimer.current) clearTimeout(flushTimer.current);
      if (degradeTimer.current) clearTimeout(degradeTimer.current);
      flushTimer.current = null;
      degradeTimer.current = null;
      buffer.current = [];
    };
  }, [familyId, qc]);
}
```

- [ ] **Step 6: Barrel schreiben**

`features/realtime/index.ts`:

```ts
export { familyTopic, FAMILY_CHANNEL_PREFIX } from "./topic";
export { normalizeBroadcast, type FamilyChange, type FamilyChangeType } from "./normalize";
export { toRealtimeStatus, useRealtimeStatusStore, type RealtimeStatus } from "./status";
export { subscribeToFamilyChanges, type SubscribeToFamilyChangesArgs } from "./subscribe";
export { COALESCE_WINDOW_MS, mergeInvalidationKeys } from "./coalesce";
export { DEGRADED_AFTER_MS, degradedDelayMs, shouldRefetchAfterResubscribe } from "./reconnect";
export { invalidationKeysFor, reconnectInvalidationKeys } from "./dispatch";
export { useFamilyRealtime } from "./useFamilyRealtime";
```

- [ ] **Step 7: Mounten**

In `app/_layout.tsx` den Import ergänzen und den Hook aufrufen:

```tsx
import { useFamilyRealtime } from "@/features/realtime";
```

```tsx
function ThemedStack() {
  const { theme } = useTheme();
  useInitSession();
  useEffect(() => initDeepLinkHandler(), []);
  // Offene Undo-Fenster schließen, wenn die App in den Hintergrund geht.
  useFlushPendingDeletes();
  // Der eine Familien-Kanal. Steht bewusst hier und nicht in `useFamilyEvents`
  // (drei Aufrufer, zwei dauerhaft gemountet) und nicht unter `<AuthGate>`
  // (rendert bei Redirects seine Kinder nicht) — siehe ADR-030.
  useFamilyRealtime();
  return (
    <AuthGate>
```

- [ ] **Step 8: Typen und Lint prüfen**

Run: `bun run typecheck && bun lint && bun test`
Expected: alles grün. Erwartbare Stolpersteine: `react-hooks/exhaustive-deps` steht auf `error` — die Dependency-Liste `[familyId, qc]` ist vollständig, weil alle übrigen Werte Refs oder Store-Getter sind.

- [ ] **Step 9: Commit**

```bash
git add features/realtime/dispatch.ts features/realtime/dispatch.test.ts \
        features/realtime/useFamilyRealtime.ts features/realtime/index.ts app/_layout.tsx
git commit -m "feat(realtime): Familien-Kanal an den Query-Cache hängen"
```

---

## Task 7: Altes Modul ablösen, Debug-Screen umziehen

**Files:**

- Delete: `features/calendar/realtime.ts`, `features/calendar/realtime.test.ts`
- Modify: `features/calendar/index.ts:63-76` (Re-Export-Block entfernen, Mapper ergänzen)
- Modify: `app-sections/debug/RealtimeDebugScreen.tsx`

**Interfaces:**

- Consumes: `useFamilyRealtime` ist **nicht** die Quelle für den Debug-Screen — der Screen braucht die rohen Änderungen und benutzt `subscribeToFamilyChanges` direkt über einen eigenen Effekt
- Produces: nichts Neues

- [ ] **Step 1: Debug-Screen umschreiben**

`app-sections/debug/RealtimeDebugScreen.tsx` — nur die betroffenen Teile:

Import-Block ersetzen:

```tsx
import { Icon, Pill, type PillTone } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Card, Screen, Text } from "@/design-system/ui";
import { useCurrentParent } from "@/features/auth";
import {
  familyTopic,
  subscribeToFamilyChanges,
  useRealtimeStatusStore,
  type FamilyChange,
  type RealtimeStatus,
} from "@/features/realtime";
import { supabase } from "@/features/supabase";
```

`statusTone` und `LoggedChange` auf die neuen Typen ziehen:

```tsx
const statusTone: Record<RealtimeStatus, PillTone> = {
  idle: "neutral",
  subscribing: "warn",
  subscribed: "success",
  timedOut: "warn",
  error: "danger",
  closed: "ink",
};

interface LoggedChange extends FamilyChange {
  seq: number;
}
```

In `RealtimeDebugContent` den Subscription-Teil ersetzen:

```tsx
const [changes, setChanges] = useState<LoggedChange[]>([]);
const seq = useRef(0);
// Der Screen liest den Status aus dem Store statt aus seinem eigenen Abo:
// Geschrieben wird er vom einen Mountpunkt in `ThemedStack`, und genau der
// Zustand ist hier interessant — nicht der eines zweiten Kanals.
const status = useRealtimeStatusStore((s) => s.status);

useEffect(() => {
  if (!familyId) return;
  let cancelled = false;
  let unsubscribe: (() => void) | null = null;
  void subscribeToFamilyChanges({
    client: supabase,
    familyId,
    onChange: (change) => {
      seq.current += 1;
      const entry: LoggedChange = { ...change, seq: seq.current };
      setChanges((prev) => [entry, ...prev].slice(0, MAX_ENTRIES));
    },
  }).then((cleanup) => {
    if (cancelled) cleanup();
    else unsubscribe = cleanup;
  });
  return () => {
    cancelled = true;
    unsubscribe?.();
  };
}, [familyId]);
```

Topic-Zeile, Warn-Karte und Ereignis-Zeile anpassen:

```tsx
<Text variant="meta" tone="inkSecondary" numberOfLines={1}>
  {familyId ? familyTopic(familyId) : "Familie noch nicht geladen"}
</Text>
```

```tsx
<Card variant="tinted" tint="warning" className="mt-3">
  <Text variant="meta">
    Zweiter Kanal auf demselben Topic wie der App-Kanal: Was hier einläuft, hat die App ebenfalls
    gesehen. Ereignisse tragen seit ADR-030 auch bei DELETE ihre Zeile — fremde Familien erreichen
    dieses Topic gar nicht mehr.
  </Text>
</Card>
```

```tsx
<View className="flex-1">
  <Text variant="listTitle">{`${change.table} · ${change.type}`}</Text>
  <Text variant="meta" tone="inkSecondary" numberOfLines={1}>
    {`row ${change.rowId ?? "—"}`}
  </Text>
</View>
```

Und den Leer-Text:

```tsx
<Text variant="meta" tone="inkTertiary">
  Noch nichts empfangen. Änderungen an events oder event_exceptions dieser Familie erscheinen hier,
  sobald die Trigger aus 20260901120000_realtime_family_broadcast.sql angewendet sind.
</Text>
```

`useEffect` muss dem React-Import hinzugefügt werden (`useCallback` entfällt).

- [ ] **Step 2: Altes Modul löschen und Barrel bereinigen**

```bash
git rm features/calendar/realtime.ts features/calendar/realtime.test.ts
```

In `features/calendar/index.ts` den kompletten Export-Block von `./realtime` (`calendarBindings` … `type CalendarRealtimeTable`) entfernen und dafür ergänzen:

```ts
export { calendarInvalidationKeys } from "./realtimeKeys";
```

- [ ] **Step 3: Prüfen**

Run: `bun run typecheck && bun lint && bun test`
Expected: grün. Ein `typecheck`-Fehler hier heißt, dass noch jemand aus dem gelöschten Modul importiert — dann die Fundstelle nachziehen, nicht das Modul zurückholen.

Gegenprobe, dass nichts übrig ist:

```bash
rg -n "useCalendarRealtime|subscribeToCalendarChanges|CalendarChange|calendarChannelTopic" --glob '!docs/**'
```

Expected: keine Treffer außer in `docs/` (Spec, ADR-028, TODO — die bleiben als Historie stehen).

- [ ] **Step 4: Commit**

```bash
git add -A features/calendar app-sections/debug/RealtimeDebugScreen.tsx
git commit -m "refactor(realtime): postgres_changes-Modul durch die Sync-Schicht ersetzen"
```

---

## Task 8: Die sichtbare Rückmeldung

**Files:**

- Create: `app-sections/shared/SyncNotice.tsx`
- Modify: `app-sections/shared/index.ts`
- Modify: `app-sections/(tabs)/kalender/KalenderScreen.tsx` (nach der `TopBar`)
- Modify: `app-sections/(tabs)/dashboard/DashboardScreen.tsx:142` (nach der `TopBar`)
- Modify: `features/i18n/locales/de.json`, `features/i18n/locales/en.json`
- Modify: `docs/COPY.md`

**Interfaces:**

- Consumes: `useRealtimeStatusStore` (Task 2), `degraded`-Flag gestellt von `useFamilyRealtime` (Task 6)
- Produces: `<SyncNotice />` (keine Props)

- [ ] **Step 1: Copy in beide Kataloge**

In `features/i18n/locales/de.json` ein neues Top-Level-Objekt **vor** `"sample"` einfügen:

```json
  "sync": {
    "offline": {
      "title": "Keine Verbindung",
      "hint": "Du siehst möglicherweise nicht die neuesten Änderungen."
    }
  },
```

In `features/i18n/locales/en.json` an derselben Stelle:

```json
  "sync": {
    "offline": {
      "title": "No connection",
      "hint": "You may not be seeing the latest changes."
    }
  },
```

- [ ] **Step 2: Katalog-Test laufen lassen**

Run: `bun test features/i18n`
Expected: PASS — `catalogs.test.ts` prüft Schlüsselgleichheit zwischen DE und EN und leere Werte. Ein Fehlschlag hier heißt: ein Katalog hat den Block nicht bekommen.

- [ ] **Step 3: `docs/COPY.md` ergänzen**

Neuer Abschnitt direkt **nach** `## Global` (die Copy ist bildschirmübergreifend, gehört also nicht unter „Calendar"):

```markdown
## Sync (cross-screen)

Shown on Calendar and Dashboard when the realtime channel has been down for more
than 10 seconds. Not interactive — it states a fact, it does not ask for an action.

| Key                  | DE                                                      | EN                                        |
| -------------------- | ------------------------------------------------------- | ----------------------------------------- |
| `sync.offline.title` | Keine Verbindung                                        | No connection                             |
| `sync.offline.hint`  | Du siehst möglicherweise nicht die neuesten Änderungen. | You may not be seeing the latest changes. |
```

- [ ] **Step 4: Die Komponente schreiben**

`app-sections/shared/SyncNotice.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { useTheme } from "@/design-system/ThemeProvider";
import { Card, Text } from "@/design-system/ui";
import { useRealtimeStatusStore } from "@/features/realtime";

import { Icon } from "./Icon";

/**
 * Sagt, dass der Live-Kanal seit über zehn Sekunden weg ist — und damit, dass
 * die angezeigten Termine veraltet sein können.
 *
 * Rendert `null`, solange die Verbindung steht; die Schwelle selbst liegt nicht
 * hier, sondern in `useFamilyRealtime` (ein Timer für die ganze App statt einer
 * pro anzeigendem Screen, siehe `degradedDelayMs`).
 *
 * Bewusst nicht interaktiv und bewusst kein Overlay: Es gibt nichts, was der
 * Nutzer tun könnte — der Realtime-Client verbindet von selbst neu, und
 * `patterns/calendar.md` kennt für diesen Zustand kein Muster. Die Zeile
 * benutzt deshalb ausschließlich vorhandene Primitives.
 */
export function SyncNotice() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const degraded = useRealtimeStatusStore((state) => state.degraded);

  if (!degraded) return null;

  return (
    <Card variant="tinted" tint="warning" className="mb-3 flex-row items-start gap-3">
      <View className="pt-0.5">
        <Icon name="alert-triangle" size={18} color={theme.warning} />
      </View>
      <View className="flex-1">
        <Text variant="listTitle">{t("sync.offline.title")}</Text>
        <Text variant="meta" tone="inkSecondary">
          {t("sync.offline.hint")}
        </Text>
      </View>
    </Card>
  );
}
```

- [ ] **Step 5: Exportieren und einbauen**

In `app-sections/shared/index.ts` alphabetisch einsortieren (zwischen `SectionHeader` und `TopBar`):

```ts
export { SyncNotice } from "./SyncNotice";
```

In `app-sections/(tabs)/kalender/KalenderScreen.tsx` den Import erweitern (`SyncNotice` in die Liste aus `@/app-sections/shared`) und direkt nach dem `</TopBar>`-Aufruf einfügen:

```tsx
<SyncNotice />
```

In `app-sections/(tabs)/dashboard/DashboardScreen.tsx` dasselbe direkt nach `<TopBar title={greeting} sub={subtitle} />`.

- [ ] **Step 6: Prüfen**

Run: `bun run typecheck && bun lint && bun test`
Expected: grün. `i18next/no-literal-string` darf hier nicht anschlagen — alle Strings kommen aus `t()`.

- [ ] **Step 7: Commit**

```bash
git add app-sections/shared/SyncNotice.tsx app-sections/shared/index.ts \
        "app-sections/(tabs)/kalender/KalenderScreen.tsx" \
        "app-sections/(tabs)/dashboard/DashboardScreen.tsx" \
        features/i18n/locales/de.json features/i18n/locales/en.json docs/COPY.md
git commit -m "feat(realtime): Hinweis auf veraltete Daten bei totem Kanal"
```

---

## Task 9: Papierspur

**Files:**

- Modify: `docs/decision-log.md` (ADR-030 anhängen)
- Modify: `docs/architecture.md`
- Modify: `CLAUDE.md`
- Modify: `docs/TODO.md`

- [ ] **Step 1: ADR-030 anhängen**

Ans **Ende** von `docs/decision-log.md`. ADR-028 wird **nicht** angefasst. Struktur wie die Nachbarn (`## ADR-030 — …`, dann `### Status`, `### Context`, `### Decisions`, `### Consequences`). Inhalt der Decisions 1–10 aus §11 der Spec, plus:

- **Status:** „Accepted. Löst [ADR-028](#adr-028--…) in den Decisions 2, 3, 4 und 6 ab; 5, 7, 8 und 9 bleiben gültig. Zweite von drei Realtime-Iterationen (#50 → **#51** → #52)."
- Zusätzlich zu §11 in die Decisions aufnehmen: **die Abweichung von §7 der Spec** — `degradedDelayMs` + Timer im Hook statt `isDegraded` in der Komponente, Begründung `react-hooks/set-state-in-effect` (siehe „Abweichung von der Spec" oben in diesem Plan).
- Consequences: (a) jede Termin-Mutation schreibt zusätzlich in `realtime.messages`; (b) der Reconnect-Refetch holt den _Zustand_ nach, nicht die verpassten _Ereignisse_; (c) `useFamilyRealtime` selbst bleibt ungetestet — dieselbe Lücke wie bei `useCalendarRealtime`, alles Prüfenswerte liegt darunter; (d) falls die Migration mangels PAT nicht angewendet werden konnte, hier vermerken.

- [ ] **Step 2: `docs/architecture.md` nachziehen**

Drei Stellen, alle konkret:

1. **`## Realtime` (Zeile 63 ff.)** — der ganze Absatz ist überholt (er beschreibt `postgres_changes`, das Topic `calendar:<familyId>` und „der Kalender selbst abonniert noch nicht"). Ersetzen durch:

```markdown
## Realtime

Änderungen an `events` und `event_exceptions` gehen **nicht** mehr über die
Publikation `supabase_realtime`, sondern über _Broadcast from Database_: Ein
`after`-Trigger ruft `realtime.broadcast_changes()` auf das private Topic
`family:<familyId>`, autorisiert durch eine RLS-Policy auf `realtime.messages`
gegen `current_family_id()`. Weil der Trigger die alte Zeile noch sieht, trägt
auch ein DELETE seine `family_id` und `event_id` — und ein Client hört
ausschließlich die eigene Familie (ADR-030, löst ADR-028 teilweise ab).

Client-seitig ist [features/realtime/](../features/realtime/) eine Sync-Schicht
**über** den Features: `subscribe`/`normalize`/`coalesce`/`reconnect` kennen
kein Feature, allein `dispatch.ts` bildet Änderungen auf Query-Keys ab.
`useFamilyRealtime()` läuft **einmal** in `ThemedStack` — nicht in
`useFamilyEvents`, der drei Aufrufer hat —, sammelt eingehende Änderungen 300 ms
und invalidiert dann gebündelt. Nach einem Verbindungsverlust lädt es den
Zustand nach (verpasste Broadcasts kommen nicht nach); hält der Verlust über
zehn Sekunden an, zeigen Kalender und Dashboard `<SyncNotice />`.
```

2. **`## Providers (mounted in \`app/_layout.tsx\`)`(Zeile 21 ff.)** —`useFamilyRealtime()`in der Aufzählung ergänzen, mit dem Hinweis, dass der Aufruf bewusst **vor**`<AuthGate>` steht.

3. **`## What's not here yet` (Zeile 74 ff.)** — der Satz „Realtime is wired as far as the section above describes" bleibt richtig, braucht aber den Zusatz, dass Conflict-Detection (#52) weiterhin aussteht.

- [ ] **Step 3: `CLAUDE.md` nachziehen**

Drei Stellen:

1. Tech-Stack-Absatz „**Realtime** ist seit ADR-028 als Fundament da …" → auf ADR-030 umschreiben: Broadcast-Trigger, familienweites Topic, Kalender **abonniert jetzt**, Issue #51 erledigt.
2. Ordnerstruktur: `features/realtime/` aufnehmen, den Realtime-Verweis unter `features/calendar/` streichen.
3. i18n-Aufzählung unter „Non-negotiables" Punkt 3: `sync.*` ergänzen.

- [ ] **Step 4: `docs/TODO.md` bereinigen**

Im Abschnitt „## Realtime" entfallen die Zeilen:

- „`useFamilyEvents` abonniert den Kanal noch nicht"
- „DELETE-Ereignisse sind keinem Event zuzuordnen und verlassen die Familiengrenze"
- „Kein sichtbares Scheitern nach dauerhaftem Verbindungsverlust"

Es bleibt (umbenannt auf `useFamilyRealtime`): die Zeile zum ungetesteten Hook. Die Zeile „Der Debug-Screen ist nur auf Web gesichtet" entfällt erst nach Task 10.

Neu dazu:

```markdown
- **Die Mutations-`onSettled`-Blöcke invalidieren weiterhin `calendarKeys.all`** ([mutations.ts](../features/calendar/mutations.ts), [createMutation.ts](../features/calendar/createMutation.ts)): Der Realtime-Pfad benutzt seit [ADR-030](./decision-log.md) die engeren Präfixe `eventsRoot`/`oneRoot` und lässt `types` und `reminders` in Ruhe; die Mutationen ziehen sie bei jedem eigenen Schreibvorgang mit. Nachzuziehen wäre eine Einzeiler-Änderung pro Block — aber eine, die drei Overlay-Interaktionen berührt (ADR-026, ADR-027) und deshalb ihren eigenen Testlauf verdient, nicht den einer Realtime-Iteration.
```

- [ ] **Step 5: Commit**

```bash
git add docs/decision-log.md docs/architecture.md docs/TODO.md CLAUDE.md
git commit -m "docs(realtime): ADR-030 und Dokumentation zum Broadcast-Live-Sync"
```

---

## Task 10: Verifikation am laufenden System

**Files:** keine — dieser Task belegt, dass die neun davor stimmen.

- [ ] **Step 1: Die volle mechanische Kette**

```bash
bun format:check && bun lint && bun run typecheck && bun test
bunx expo export --platform web --output-dir /tmp/eltern-web
```

Expected: alles grün.

- [ ] **Step 2: Zwei-Fenster-Lauf im Web-Bundle**

`bun run web` starten, zwei Browserprofile mit **zwei verschiedenen** Konten **derselben** Familie anmelden. Dann in Fenster A:

1. Termin anlegen → erscheint in B ohne Zutun
2. Termin bearbeiten (Titel) → ändert sich in B
3. Termin löschen, Undo-Fenster **ablaufen lassen** → verschwindet in B
4. Termin löschen und **Rückgängig** drücken → bleibt in beiden Fenstern stehen (das ist der Overlay-Fall aus §6 der Spec: der Refetch darf ihn in A nicht vorzeitig zurückholen und in B nicht verschwinden lassen, bevor die Löschung wirklich läuft)

- [ ] **Step 3: Der Gegenbeweis**

Ein drittes Profil mit einem Konto einer **anderen** Familie anmelden und Schritt 2 wiederholen. Erwartet: In diesem Fenster passiert nichts — insbesondere auch beim Löschen nicht. Das ist der Punkt, an dem die ganze Transport-Entscheidung hängt; ohne diesen Beleg gilt das DELETE-Leck nicht als geschlossen.

- [ ] **Step 4: Degraded-Zustand**

In einem der Fenster die Netzwerkverbindung trennen (DevTools → Offline), 10 Sekunden warten. Erwartet: `<SyncNotice />` erscheint auf Kalender und Dashboard. Verbindung wiederherstellen: Der Hinweis verschwindet, und ein in der Zwischenzeit im anderen Fenster angelegter Termin taucht auf — das ist der Reconnect-Refetch.

- [ ] **Step 5: iOS-Simulator**

`bun run ios`. Sichten: `<SyncNotice />` (Flugmodus, 10 s) in Light und Dark, sowie der Debug-Screen unter `/debug/realtime` (Einstieg über die `__DEV__`-Zeile im Settings-Sheet) — der ist nativ laut `docs/TODO.md` noch nie gesehen worden. Danach die entsprechende TODO-Zeile entfernen und mitcommitten.

- [ ] **Step 6: CodeRabbit**

```bash
coderabbit review --base main
```

Findings abarbeiten oder mit Begründung verwerfen.

- [ ] **Step 7: PR**

```bash
git push -u origin feat/realtime-family-broadcast
gh pr create --title "feat(realtime): Live-Sync für den Kalender per Broadcast from Database" --body "$(cat <<'BODY'
Schließt #51.

**Was sich ändert.** Termin-Änderungen erreichen alle Mitglieder einer Familie
live, auf Kalender und Dashboard. Der Transport wechselt dafür von
`postgres_changes` auf Broadcast from Database (Trigger + privates Topic
`family:<familyId>` + RLS auf `realtime.messages`) — ADR-030, das ADR-028 in den
Decisions 2, 3, 4 und 6 ablöst.

**Warum der Transportwechsel.** `postgres_changes` wendet RLS nicht auf DELETE
an: Lösch-Ereignisse trugen nur eine Row-Id und erreichten *jeden* angemeldeten
Client, auch fremder Familien. Der Trigger sieht die alte Zeile noch und schickt
`family_id` und `event_id` mit; `events` und `event_exceptions` verlassen dafür
die Publikation `supabase_realtime`.

**An den Overlays ändert sich nichts.** Weder die offenen Löschungen (ADR-026)
noch das optimistische Overlay (ADR-027) brauchen einen Sonderfall — beide sind
Anzeige-Filter hinter der Query. Die Begründung steht in §6 der Spec und in
ADR-030.

**Belegt.** Zwei-Fenster-Lauf im Web (anlegen / ändern / löschen / Undo), der
Gegenbeweis mit einem Konto einer fremden Familie (dort kommt nichts an), der
Degraded-Hinweis nach 10 s Offline samt Reconnect-Refetch, und eine Sichtung auf
dem iOS-Simulator.

**Migration:** <angewendet über den Supabase-MCP-Server / NICHT angewendet, weil …>
BODY
)"
```

Den Migrations-Satz vor dem Absenden auf den tatsächlichen Ausgang setzen — das ist die eine Stelle, an der ein PR-Body etwas behaupten könnte, das niemand geprüft hat.
