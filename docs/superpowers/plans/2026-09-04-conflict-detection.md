# Conflict-Detection V1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gleichzeitige Edits zweier Familienmitglieder überschreiben sich nicht mehr stillschweigend — der Zweite sieht einen Vergleichs-Dialog und entscheidet.

**Architecture:** Ein `before update`-Trigger belebt die tote `updated_at`-Spalte auf `events`, `tasks` und (neu) `event_exceptions`. Der Kalender vergleicht die Version im ohnehin nötigen Master-Fetch (Pre-Flight) und sichert `updateMaster` zusätzlich per Compare-and-Swap; Aufgaben benutzen CAS als Detektor und lesen nur im Konfliktfall nach. Der Dialog wohnt als Store + Wirt im Root-Layout, weil das Edit-Sheet vor der Server-Antwort schließt.

**Tech Stack:** Postgres (Supabase MCP `apply_migration`), TypeScript strict, TanStack Query, Zustand, react-i18next, NativeWind v4, `bun test`.

**Spec:** [docs/superpowers/specs/2026-09-04-conflict-detection-design.md](../specs/2026-09-04-conflict-detection-design.md)

## Global Constraints

- **Handoff-Bundle ist gesperrt** (CLAUDE.md Non-Negotiable 1): `design-system/{colors,typography,spacing,themes,components,index}.ts`, `docs/{HANDOFF,ICONS,README}.md`, `patterns/*.md` werden **nicht** angefasst. **Ausnahme:** `docs/COPY.md` — der `conflict.*`-Abschnitt ist am 2026-09-03 ausdrücklich freigegeben (Task 3).
- **Alle UI-Strings über i18n.** Keine hartkodierte Copy. Neue Keys immer in **beiden** Katalogen (`features/i18n/locales/{de,en}.json`) — `catalogs.test.ts` erzwingt Parität.
- **Brand voice:** immer **Du**, nie Sie. Deshalb „Andere Fassung behalten", nicht „Ihre Fassung".
- **Touch-Targets ≥ 44×44.** Die Dialog-Buttons benutzen `<Button size="lg">` (h-12 = 48).
- **Keine neuen Design-Tokens.** Nur `DS.components.card`, `DS.components.bottomSheet.scrimColor`, `theme.overlay`, `theme.card` und die `Button`/`Text`-Primitives aus `@/design-system/ui`.
- **Docstrings** (CLAUDE.md → Documentation discipline): Jede neue exportierte Funktion, Komponente, Hook und jedes neue Modul bekommt einen JSDoc-Block **im selben Commit**. Inhalt ist das Nicht-Offensichtliche (Warum, Grenzfall, ADR-Verweis), nicht die Wiederholung des Namens. Ausgenommen: lokale Helfer in Testdateien.
- **Commits:** Conventional-Commits-Präfix, scoped. **Niemals** ein `Co-Authored-By: Claude`-Trailer. `--no-verify` ist verboten.
- **Vor jedem Commit:** `bun run typecheck` und `bun test` müssen grün sein.
- **Branch:** `feat/conflict-detection` (existiert bereits, die Spec liegt darauf).

---

## File Structure

| Datei                                                  | Verantwortung                                           | Task |
| ------------------------------------------------------ | ------------------------------------------------------- | ---- |
| `supabase/migrations/<version>_conflict_detection.sql` | `set_updated_at()` + drei Trigger + neue Spalte         | 1    |
| `features/supabase/database.types.ts`                  | neu generiert (bekommt `event_exceptions.updated_at`)   | 1    |
| `features/calendar/version.ts` + `.test.ts`            | `occurrenceVersion` — das Versions-Token                | 2    |
| `features/calendar/expand.ts`                          | setzt `version` auf jede `CalendarOccurrence`           | 2    |
| `features/calendar/types.ts`                           | `CalendarOccurrence.version`                            | 2    |
| `features/calendar/errors.ts` + `.test.ts`             | `EventConflictError`, `mapEventError`-Zweig             | 3    |
| `features/tasks/errors.ts` + `.test.ts`                | `TaskConflictError`, `mapTaskError`-Zweig               | 3    |
| `features/i18n/locales/{de,en}.json`                   | `conflict.*`, `cal.error.conflict`, `hw.error.conflict` | 3    |
| `docs/COPY.md`                                         | Deck-Abschnitt „Conflict (cross-screen)"                | 3    |
| `features/calendar/recurrence.ts`                      | `EventOps.updateMaster` + `seenUpdatedAt`, CAS          | 4    |
| `features/calendar/mutations.ts`                       | `baseVersion` in Vars, Pre-Flight-Vergleich             | 4    |
| `features/tasks/mutations.ts`                          | `baseVersion` in `UpdateTaskVars`, CAS + Nachlesen      | 5    |
| `features/calendar/conflict.ts` + `.test.ts`           | `differingEventFields`                                  | 6    |
| `features/tasks/conflict.ts` + `.test.ts`              | `differingTaskFields`                                   | 6    |
| `app-sections/shared/conflictStore.ts` + `.test.ts`    | Zustand-Store, ein Dialog zur Zeit                      | 7    |
| `app-sections/shared/ConflictDialog.tsx`               | die Darstellung — stumpf, rendert `ConflictRow[]`       | 7    |
| `app-sections/shared/ConflictDialogHost.tsx`           | der Wirt                                                | 7    |
| `app/_layout.tsx`                                      | montiert den Wirt                                       | 7    |
| `app-sections/event/EventEditScreen.tsx`               | `baseVersion` mitschicken, Konflikt fangen              | 8    |
| `app-sections/task/TaskEditScreen.tsx`                 | dasselbe für Aufgaben                                   | 9    |
| `app-sections/shared/useUndoableDelete.ts`             | optionale `errorAction`                                 | 10   |
| `app-sections/event/EventDetailScreen.tsx`             | „Trotzdem löschen" verdrahten                           | 10   |
| `docs/decision-log.md`, `CLAUDE.md`, `docs/TODO.md`    | ADR-031 + Doku                                          | 12   |

---

## Task 1: Migration — `updated_at` beleben

**Files:**

- Create: `supabase/migrations/20260904000000_conflict_detection.sql` (wird in Step 4 auf die vergebene Version umbenannt)
- Modify: `features/supabase/database.types.ts` (neu generiert)

**Interfaces:**

- Consumes: nichts
- Produces: `public.set_updated_at()`; Trigger `events_set_updated_at`, `tasks_set_updated_at`, `event_exceptions_set_updated_at`; Spalte `public.event_exceptions.updated_at timestamptz not null`. Ab hier gilt: `Database["public"]["Tables"]["event_exceptions"]["Row"]` hat `updated_at: string`.

- [ ] **Step 1: Migrationsdatei schreiben**

Create `supabase/migrations/20260904000000_conflict_detection.sql`:

```sql
-- Eltern Flow AI: Conflict-Detection V1 — `updated_at` beleben
-- Spec: docs/superpowers/specs/2026-09-04-conflict-detection-design.md
-- Issue #52. Idempotent.

-- 1. Die Trigger-Funktion.
--
-- Bewusst KEIN `security definer`: Anders als `broadcast_family_change`
-- (20260902065203_realtime_family_broadcast.sql) fasst diese Funktion nur NEW
-- an und schreibt in keine fremde Tabelle. Erhöhte Rechte wären hier
-- ausschließlich Angriffsfläche.
--
-- `set search_path = ''` bleibt trotzdem gesetzt (Hausstandard); `now()` liegt
-- in pg_catalog und wird auch bei leerem Suchpfad implizit gefunden.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'BEFORE-UPDATE-Trigger: stempelt updated_at. Grundlage der Conflict-Detection (Issue #52) — die Spalte existierte seit dem ersten Kalender-Schema, wurde aber von keinem Trigger angefasst und war damit faktisch ein zweites created_at.';

-- 2. `event_exceptions` hatte die Spalte noch gar nicht.
--
-- Kein Backfill nötig: Die Basis-Version stammt immer aus der Zeile, die der
-- Client gerade gelesen hat — der erste Vergleich ist per Konstruktion
-- konsistent, egal welcher Wert dort steht.
alter table public.event_exceptions
  add column if not exists updated_at timestamptz not null default now();

-- 3. Die Trigger.
--
-- `before`, nicht `after`: Ein AFTER-Trigger sieht die Zeile, nachdem sie
-- geschrieben wurde, sein NEW zu ändern hat keine Wirkung mehr. Und Postgres
-- führt alle BEFORE-ROW-Trigger vor allen AFTER-ROW-Triggern aus — dieser läuft
-- also vor `broadcast_family_change`, und das Broadcast trägt das neue
-- updated_at bereits in `record`.
drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at
before update on public.events
for each row execute function public.set_updated_at();

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

drop trigger if exists event_exceptions_set_updated_at on public.event_exceptions;
create trigger event_exceptions_set_updated_at
before update on public.event_exceptions
for each row execute function public.set_updated_at();

-- `families`, `parents` und `children` tragen dasselbe tote `updated_at`.
-- Bewusst draußen: kein Schreibpfad dieser Iteration berührt sie. Vermerkt in
-- docs/TODO.md.
```

- [ ] **Step 2: Migration anwenden**

Über den Supabase-MCP-Server: `apply_migration` mit `name: "conflict_detection"` und dem SQL aus Step 1.

- [ ] **Step 3: Wirkung verifizieren**

Über `execute_sql`:

```sql
-- Trigger da?
select c.relname, t.tgname
from pg_trigger t join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and not t.tgisinternal and t.tgname like '%set_updated_at'
order by c.relname;
```

Erwartet: drei Zeilen — `event_exceptions`, `events`, `tasks`.

```sql
-- Stempelt er wirklich? Ein No-op-Update auf eine beliebige Zeile.
select id, updated_at as before from public.events limit 1;
```

Dann mit der zurückgegebenen Id:

```sql
update public.events set title = title where id = '<id>' returning updated_at as after;
```

Erwartet: `after` > `before`. **Wenn `after` == `before`, ist der Trigger nicht aktiv — nicht weitermachen.**

- [ ] **Step 4: Version abgleichen und Datei umbenennen**

`supabase/SETUP.md` §3: Der MCP-Server vergibt einen **eigenen** Timestamp und ignoriert den Dateinamen. Ein Auseinanderlaufen hat historisch beinahe die Datenbank gelöscht.

```bash
# Die tatsächlich vergebene Version über MCP `list_migrations` ablesen, dann:
git mv supabase/migrations/20260904000000_conflict_detection.sql \
       supabase/migrations/<vergebene_version>_conflict_detection.sql
```

Gegenprobe: `list_migrations` gegen `ls supabase/migrations/` — beide Listen müssen deckungsgleich sein.

- [ ] **Step 5: Typen neu generieren**

Über MCP `generate_typescript_types`, Ergebnis nach `features/supabase/database.types.ts` schreiben.

Gegenprobe:

```bash
grep -n "updated_at" features/supabase/database.types.ts | head -20
```

Erwartet: `event_exceptions` hat jetzt `updated_at: string` in `Row`, `updated_at?: string` in `Insert` und `Update`.

- [ ] **Step 6: Typecheck + Tests**

```bash
bun run typecheck && bun test
```

Erwartet: beides grün. (Die neue Spalte ist optional in `Insert`, bestehende Aufrufe bleiben gültig.)

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations features/supabase/database.types.ts
git commit -m "feat(db): set_updated_at-Trigger auf events, tasks und event_exceptions

Die updated_at-Spalte existierte seit dem ersten Kalender-Schema, wurde aber
von keinem Trigger angefasst — ein Vergleich darauf hätte nie angeschlagen.
event_exceptions hatte die Spalte gar nicht.

BEFORE statt AFTER, damit NEW noch änderbar ist und der Stempel vor
broadcast_family_change (ADR-030) läuft."
```

---

## Task 2: Das Versions-Token

**Files:**

- Create: `features/calendar/version.ts`, `features/calendar/version.test.ts`
- Modify: `features/calendar/types.ts`, `features/calendar/expand.ts`, `features/calendar/index.ts`

**Interfaces:**

- Consumes: `Database["public"]["Tables"]["event_exceptions"]["Row"].updated_at` (Task 1)
- Produces:
  - `occurrenceVersion(row: EventWithRelations, occurrenceDate: string): string`
  - `CalendarOccurrence.version: string`

- [ ] **Step 1: Failing test schreiben**

Create `features/calendar/version.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import type { EventWithRelations } from "./expand";

import { occurrenceVersion } from "./version";

function row(exceptions: EventWithRelations["event_exceptions"]): EventWithRelations {
  return {
    id: "evt-1",
    family_id: "fam-1",
    type_id: "type-1",
    child_id: null,
    parent_id: null,
    title: "Zahnarzt",
    description: null,
    location: null,
    start_at: "2026-06-15T15:00:00.000Z",
    end_at: "2026-06-15T16:00:00.000Z",
    all_day: false,
    rrule_freq: "weekly",
    rrule_interval: 1,
    rrule_byweekday: [1],
    rrule_until: null,
    rrule_count: null,
    created_by: null,
    created_at: "2026-05-01T00:00:00.000Z",
    updated_at: "2026-06-01T10:00:00.000Z",
    event_types: null,
    event_exceptions: exceptions,
  };
}

function exception(occurrenceDate: string, updatedAt: string) {
  return {
    id: `ex-${occurrenceDate}`,
    event_id: "evt-1",
    occurrence_date: occurrenceDate,
    action: "modified" as const,
    override: null,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: updatedAt,
  };
}

describe("occurrenceVersion", () => {
  test("ohne Exception ist nur der Master-Stempel drin", () => {
    expect(occurrenceVersion(row(null), "2026-06-15")).toBe("2026-06-01T10:00:00.000Z|-");
  });

  test("eine leere Exception-Liste verhält sich wie keine", () => {
    expect(occurrenceVersion(row([]), "2026-06-15")).toBe("2026-06-01T10:00:00.000Z|-");
  });

  test("die Exception an genau diesem Datum zählt mit", () => {
    const rows = row([exception("2026-06-15", "2026-06-02T09:00:00.000Z")]);
    expect(occurrenceVersion(rows, "2026-06-15")).toBe(
      "2026-06-01T10:00:00.000Z|2026-06-02T09:00:00.000Z",
    );
  });

  test("eine Exception an einem anderen Datum zählt NICHT mit", () => {
    // Sonst meldete das Bearbeiten des 15. einen Konflikt, weil jemand den
    // 22. geändert hat — ein Fehlalarm, der häufiger wäre als der echte Fall.
    const rows = row([exception("2026-06-22", "2026-06-02T09:00:00.000Z")]);
    expect(occurrenceVersion(rows, "2026-06-15")).toBe("2026-06-01T10:00:00.000Z|-");
  });

  test("ändert sich, wenn der Master sich ändert", () => {
    const before = occurrenceVersion(row(null), "2026-06-15");
    const after = occurrenceVersion(
      { ...row(null), updated_at: "2026-06-03T12:00:00.000Z" },
      "2026-06-15",
    );
    expect(after).not.toBe(before);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

```bash
bun test features/calendar/version.test.ts
```

Erwartet: FAIL — `Cannot find module './version'`.

- [ ] **Step 3: `version.ts` schreiben**

Create `features/calendar/version.ts`:

```ts
import type { EventWithRelations } from "./expand";

/** Steht für „an diesem Datum liegt keine Exception". */
const NO_EXCEPTION = "-";

/**
 * Der Stand einer Occurrence, als ein vergleichbarer String.
 *
 * Das Token deckt **genau die Zeilen ab, die ein Speichern dieser Occurrence
 * anfassen wird**: die Master-Zeile und die Exception an diesem Datum. Beide
 * Nachbar-Zuschnitte wären falsch (ADR-031):
 *
 * - Nur `events.updated_at` übersieht jede fremde Änderung am Scope „Nur
 *   diesen Termin" — bei Serien der häufigste Pfad.
 * - Die ganze Serie (`max` über alle Exceptions) übersieht nichts, meldet aber
 *   einen Konflikt, wenn jemand eine *andere* Occurrence ändert. Dieser
 *   Fehlalarm wäre häufiger als der echte Fall, und der Feldvergleich fängt ihn
 *   nicht ab: Die fremde Änderung am 22. ändert nichts an der Auflösung des
 *   15., wohl aber die eigene Eingabe — verglichen würde also sehr wohl eine
 *   Abweichung.
 *
 * Der Schlüssel ist `occurrenceDate`, also das **aufgelöste** Datum, das auch
 * `modifyOccurrence` als Exception-Schlüssel benutzt. Bei einer per Override
 * auf einen anderen Tag verschobenen Occurrence fällt er mit dem
 * regelerzeugten Datum auseinander; das Token folgt dann dem, was der
 * Schreibvorgang tut. Siehe `docs/TODO.md`.
 */
export function occurrenceVersion(row: EventWithRelations, occurrenceDate: string): string {
  const exception = (row.event_exceptions ?? []).find(
    (ex) => ex.occurrence_date === occurrenceDate,
  );
  return `${row.updated_at}|${exception?.updated_at ?? NO_EXCEPTION}`;
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg prüfen**

```bash
bun test features/calendar/version.test.ts
```

Erwartet: PASS, 5 Tests.

- [ ] **Step 5: `version` auf `CalendarOccurrence` legen**

In `features/calendar/types.ts`, im `CalendarOccurrence`-Interface direkt nach `isRecurring: boolean;`:

```ts
/**
 * Der Stand dieser Occurrence beim Laden — siehe `occurrenceVersion`. Das
 * Bearbeiten-Formular schickt ihn als `baseVersion` zurück, damit die
 * Mutation erkennt, ob jemand zwischenzeitlich geschrieben hat (ADR-031).
 */
version: string;
```

In `features/calendar/expand.ts` den Import ergänzen:

```ts
import { occurrenceVersion } from "./version";
```

und im `out.push({ … })`-Objekt direkt nach `isRecurring: !!row.rrule_freq,`:

```ts
        version: occurrenceVersion(row, occurrenceDate),
```

- [ ] **Step 6: Barrel ergänzen**

In `features/calendar/index.ts`, alphabetisch bei den übrigen Exporten:

```ts
export { occurrenceVersion } from "./version";
```

- [ ] **Step 7: Typecheck + alle Tests**

```bash
bun run typecheck && bun test
```

Erwartet: grün. Falls `expand.test.ts` an einem Objekt-Vergleich (`toEqual` über eine ganze Occurrence) scheitert, das neue Feld dort ergänzen — **nicht** das Feld wieder entfernen.

- [ ] **Step 8: Commit**

```bash
git add features/calendar
git commit -m "feat(calendar): Versions-Token pro Occurrence

occurrenceVersion deckt genau die Zeilen ab, die ein Speichern dieser
Occurrence schreibt: Master plus Exception an diesem Datum. Die ganze Serie
zu nehmen meldete einen Konflikt, wenn jemand eine andere Occurrence ändert."
```

---

## Task 3: Fehlerklassen, Fehler-Keys, Copy

**Files:**

- Modify: `features/calendar/errors.ts`, `features/calendar/errors.test.ts`
- Modify: `features/tasks/errors.ts`, `features/tasks/errors.test.ts`
- Modify: `features/i18n/locales/de.json`, `features/i18n/locales/en.json`
- Modify: `docs/COPY.md`
- Modify: `features/calendar/index.ts`, `features/tasks/index.ts`

**Interfaces:**

- Consumes: `EventWithRelations` (features/calendar/expand.ts), `TaskWithType` (features/tasks/types.ts)
- Produces:
  - `class EventConflictError extends Error { readonly row: EventWithRelations | null }`
  - `class TaskConflictError extends Error { readonly row: TaskWithType }`
  - `mapEventError(...) === "cal.error.conflict"` für `EventConflictError`
  - `mapTaskError(...) === "hw.error.conflict"` für `TaskConflictError`
  - i18n-Keys: `conflict.title`, `conflict.body.event`, `conflict.body.task`, `conflict.theirs`, `conflict.mine`, `conflict.keepMine`, `conflict.keepTheirs`, `conflict.deleteAnyway`, `cal.error.conflict`, `hw.error.conflict`

- [ ] **Step 1: Failing tests schreiben**

In `features/calendar/errors.test.ts` den Import erweitern und einen `describe`-Block ergänzen:

```ts
import { EventConflictError, EventNotFoundError, mapEventError } from "./errors";
```

Direkt nach dem Test `"EventNotFoundError → cal.error.eventGone"`:

```ts
test("EventConflictError → cal.error.conflict", () => {
  expect(mapEventError(new EventConflictError(null))).toBe("cal.error.conflict");
});

test("auch der Konflikt wird an `name` erkannt, nicht an der Meldung", () => {
  expect(mapEventError({ name: "EventConflictError", message: "irgendwas" })).toBe(
    "cal.error.conflict",
  );
});
```

In `features/tasks/errors.test.ts` analog:

```ts
import { mapTaskError, MissingParentError, TaskConflictError } from "./errors";
```

```ts
test("TaskConflictError → hw.error.conflict", () => {
  const row = { id: "task-1" } as never;
  expect(mapTaskError(new TaskConflictError(row))).toBe("hw.error.conflict");
});

test("auch der Konflikt wird an `name` erkannt, nicht an der Meldung", () => {
  expect(mapTaskError({ name: "TaskConflictError", message: "irgendwas" })).toBe(
    "hw.error.conflict",
  );
});
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag prüfen**

```bash
bun test features/calendar/errors.test.ts features/tasks/errors.test.ts
```

Erwartet: FAIL — `EventConflictError`/`TaskConflictError` existieren nicht.

- [ ] **Step 3: Fehlerklassen und Mapper-Zweige schreiben**

In `features/calendar/errors.ts`, oben den Typ-Import ergänzen:

```ts
import type { EventWithRelations } from "./expand";
```

Nach der `EventNotFoundError`-Klasse:

```ts
/**
 * Jemand anderes hat den Termin geändert, seit dieses Formular ihn geladen hat.
 *
 * Trägt die fremde Fassung mit, damit der Screen sie ohne zweiten Roundtrip
 * mit `expandEvents` auflösen und Feld für Feld gegen die eigene Eingabe
 * stellen kann — genau das, was der Vergleichs-Dialog zeigt (ADR-031).
 *
 * `row` ist `null`, wenn der Konflikt aus dem Compare-and-Swap in
 * `updateMaster` kommt statt aus dem Pre-Flight: Dort ist bekannt, *dass*
 * jemand dazwischengeschrieben hat, aber nicht *was*. Der Dialog erscheint dann
 * ohne Vergleichszeilen — stilles Durchwinken wäre genau der Fehler, gegen den
 * diese Klasse gebaut ist.
 */
export class EventConflictError extends Error {
  constructor(readonly row: EventWithRelations | null) {
    super("Event was modified by someone else");
    this.name = "EventConflictError";
  }
}
```

`CalendarErrorKey` um den Key erweitern:

```ts
export type CalendarErrorKey =
  | "cal.error.notAuthenticated"
  | "cal.error.eventGone"
  | "cal.error.conflict"
  | "cal.error.network"
  | "cal.error.generic";
```

In `mapEventError`, direkt nach der `EventNotFoundError`-Zeile:

```ts
if (err.name === "EventConflictError") return "cal.error.conflict";
```

In `features/tasks/errors.ts` analog. Typ-Import oben:

```ts
import type { TaskWithType } from "./types";
```

Nach `MissingParentError`:

```ts
/**
 * Someone else changed the task since this form loaded it.
 *
 * Carries their version so the screen can diff it field by field against the
 * user's own input without a second round trip (ADR-031). Unlike the calendar's
 * counterpart, `row` is never null here: the task path detects the conflict via
 * compare-and-swap and then reads the row precisely to fill this in.
 */
export class TaskConflictError extends Error {
  constructor(readonly row: TaskWithType) {
    super("Task was modified by someone else");
    this.name = "TaskConflictError";
  }
}
```

```ts
export type TaskErrorKey =
  | "hw.error.notAuthenticated"
  | "hw.error.staleReference"
  | "hw.error.conflict"
  | "hw.error.network"
  | "hw.error.generic";
```

In `mapTaskError`, direkt nach der `MissingParentError`-Zeile:

```ts
if (err.name === "TaskConflictError") return "hw.error.conflict";
```

- [ ] **Step 4: Tests laufen lassen, Erfolg prüfen**

```bash
bun test features/calendar/errors.test.ts features/tasks/errors.test.ts
```

Erwartet: PASS.

- [ ] **Step 5: i18n-Kataloge**

In `features/i18n/locales/de.json` einen neuen Top-Level-Block `conflict` **direkt nach** `sync` einfügen:

```json
  "conflict": {
    "title": "Gleichzeitig bearbeitet",
    "body": {
      "event": "Jemand anderes hat diesen Termin geändert, während du ihn bearbeitet hast.",
      "task": "Jemand anderes hat diese Aufgabe geändert, während du sie bearbeitet hast."
    },
    "theirs": "Jetzt gespeichert",
    "mine": "Deine Fassung",
    "keepMine": "Deine Fassung speichern",
    "keepTheirs": "Andere Fassung behalten",
    "deleteAnyway": "Trotzdem löschen"
  },
```

In `cal.error` ergänzen: `"conflict": "Jemand anderes hat den Termin geändert.",`
In `hw.error` ergänzen: `"conflict": "Jemand anderes hat die Aufgabe geändert.",`

In `features/i18n/locales/en.json` an denselben Stellen:

```json
  "conflict": {
    "title": "Edited at the same time",
    "body": {
      "event": "Someone else changed this event while you were editing it.",
      "task": "Someone else changed this task while you were editing it."
    },
    "theirs": "Saved now",
    "mine": "Your version",
    "keepMine": "Save your version",
    "keepTheirs": "Keep the other version",
    "deleteAnyway": "Delete anyway"
  },
```

`cal.error.conflict`: `"Someone else changed this event."`
`hw.error.conflict`: `"Someone else changed this task."`

- [ ] **Step 6: `docs/COPY.md` — Deck-Eintrag**

**Freigegeben am 2026-09-03** (sonst gesperrt, CLAUDE.md Non-Negotiable 1). Direkt **nach** dem Abschnitt „## Sync (cross-screen)" einfügen:

```markdown
## Conflict (cross-screen)

Shown when a save collides with someone else's change to the same row —
calendar and tasks share one dialog. Two ways out, not three: the edit sheet has
already closed by the time the server answers, so "cancel" and "keep theirs"
would be the same thing. Dismissing the dialog keeps the other version.

| Key                     | DE                                                                         | EN                                                         |
| ----------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `conflict.title`        | Gleichzeitig bearbeitet                                                    | Edited at the same time                                    |
| `conflict.body.event`   | Jemand anderes hat diesen Termin geändert, während du ihn bearbeitet hast. | Someone else changed this event while you were editing it. |
| `conflict.body.task`    | Jemand anderes hat diese Aufgabe geändert, während du sie bearbeitet hast. | Someone else changed this task while you were editing it.  |
| `conflict.theirs`       | Jetzt gespeichert                                                          | Saved now                                                  |
| `conflict.mine`         | Deine Fassung                                                              | Your version                                               |
| `conflict.keepMine`     | Deine Fassung speichern                                                    | Save your version                                          |
| `conflict.keepTheirs`   | Andere Fassung behalten                                                    | Keep the other version                                     |
| `conflict.deleteAnyway` | Trotzdem löschen                                                           | Delete anyway                                              |

Not "Ihre Fassung": in German that reads as the polite second person and breaks
the Du rule. Field labels are not new copy — the dialog reuses `cal.edit.field*`
and the `hw.*` form labels.
```

- [ ] **Step 7: Barrels ergänzen**

`features/calendar/index.ts` — die Errors-Zeile erweitern:

```ts
export {
  EventConflictError,
  EventNotFoundError,
  mapEventError,
  type CalendarErrorKey,
} from "./errors";
```

`features/tasks/index.ts` — dieselbe Zeile:

```ts
export { mapTaskError, MissingParentError, TaskConflictError, type TaskErrorKey } from "./errors";
```

- [ ] **Step 8: Typecheck + alle Tests**

```bash
bun run typecheck && bun test
```

Erwartet: grün — insbesondere `features/i18n/catalogs.test.ts` (DE/EN-Parität der neuen Keys).

- [ ] **Step 9: Commit**

```bash
git add features/calendar features/tasks features/i18n docs/COPY.md
git commit -m "feat(conflict): Fehlerklassen, Fehler-Keys und Copy

EventConflictError trägt die fremde Fassung mit, damit der Dialog sie ohne
zweiten Roundtrip auflösen kann. row ist null, wenn der Konflikt aus dem
Compare-and-Swap kommt — dort ist bekannt, dass jemand geschrieben hat, aber
nicht was.

Der conflict.*-Abschnitt in docs/COPY.md steht auf ausdrücklicher Freigabe
(2026-09-03), wie sync.* in ADR-030."
```

---

## Task 4: Pre-Flight im Kalender + CAS auf `updateMaster`

**Files:**

- Modify: `features/calendar/recurrence.ts`, `features/calendar/recurrence.test.ts`
- Modify: `features/calendar/mutations.ts`, `features/calendar/mutations.test.ts`

**Interfaces:**

- Consumes: `occurrenceVersion` (Task 2), `EventConflictError` (Task 3)
- Produces:
  - `EventOps.updateMaster: (eventId: string, changes: EventChanges, seenUpdatedAt: string, recurrence?: RecurrenceChanges) => Promise<void>` — **`seenUpdatedAt` ist der dritte, `recurrence` der vierte Parameter**
  - `UpdateEventVars.baseVersion: string`, `DeleteEventVars.baseVersion: string`
  - `updateEvent`/`deleteEvent` werfen `EventConflictError` bei Versionsabweichung

- [ ] **Step 1: Failing tests schreiben**

In `features/calendar/mutations.test.ts` den Import erweitern:

```ts
import { EventConflictError } from "./errors";
```

Die Fixtures ergänzen — direkt unter `MASTER_START`:

```ts
// Der Stempel, den `makeMaster` trägt. `occurrenceVersion` hängt "|-" an, weil
// die Fixture keine Exceptions führt.
const MASTER_UPDATED_AT = "2026-05-01T00:00:00.000Z";
const MASTER_VERSION = `${MASTER_UPDATED_AT}|-`;
```

`makeMaster` gibt einen `EventRow` zurück, `occurrenceVersion` erwartet `EventWithRelations`. Die Fixture deshalb erweitern — `makeMaster` bleibt wie sie ist, und daneben:

```ts
function makeRelations(overrides: Partial<EventRow> = {}): EventWithRelations {
  return { ...makeMaster(overrides), event_types: null, event_exceptions: null };
}
```

mit dem Import `import type { EventWithRelations } from "./expand";`.

**Alle** `fetchMaster`-Mocks in dieser Datei von `makeMaster(...)` auf `makeRelations(...)` umstellen, und `BASE_VARS`/`DELETE_VARS` um `baseVersion: MASTER_VERSION` erweitern.

Dann die neuen Tests, am Ende des `describe("updateEvent")`-Blocks:

```ts
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
```

Am Ende des `describe("deleteEvent")`-Blocks:

```ts
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
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag prüfen**

```bash
bun test features/calendar/mutations.test.ts
```

Erwartet: FAIL — `baseVersion` existiert nicht auf den Vars, kein Konflikt wird geworfen.

- [ ] **Step 3: `mutations.ts` — Vars und Pre-Flight**

In `features/calendar/mutations.ts`:

Import ergänzen:

```ts
import { EventConflictError, EventNotFoundError } from "./errors";
import { occurrenceVersion } from "./version";
```

`DeleteEventVars` erweitern:

```ts
export interface DeleteEventVars {
  scope: EditScope;
  eventId: string;
  occurrenceDate: string;
  isRecurring: boolean;
  /**
   * Der Stand, den der Screen beim Laden gesehen hat (`CalendarOccurrence.version`).
   * Weicht er beim Schreiben ab, hat jemand anderes dazwischen geschrieben.
   */
  baseVersion: string;
}
```

`EventWithRelations` als Typ importieren und `UpdateEventDeps.fetchMaster` darauf umstellen:

```ts
import type { EventWithRelations } from "./expand";

export interface UpdateEventDeps {
  fetchMaster: (eventId: string) => Promise<EventWithRelations | null>;
  ops: EventOps;
}
```

(`fetchEventById` liefert bereits `EventWithRelations | null` — der bisherige `EventRow`-Typ war die engere Sicht auf denselben Wert. Die lokale Zeile `type EventRow = …` kann bleiben, `applyEditScope` nimmt weiterhin einen `EventRow`, und `EventWithRelations` erweitert ihn.)

In `updateEvent` **und** `deleteEvent`, jeweils direkt nach dem `if (!master)`-Block:

```ts
// Der Existenz-Check steht bewusst davor: „weg" und „geändert" sind
// verschiedene Meldungen, und eine fehlende Zeile hat keine Version.
if (occurrenceVersion(master, vars.occurrenceDate) !== vars.baseVersion) {
  throw new EventConflictError(master);
}
```

Den Docstring von `updateEvent`/`deleteEvent` (bzw. einen neuen) um den Grund ergänzen: Der Fetch war ohnehin da, der Vergleich kostet nichts und deckt **alle** Scopes — auch den mehrstufigen Forward-Split, der `updateMaster` gar nicht ruft.

- [ ] **Step 4: `recurrence.ts` — `seenUpdatedAt` durchreichen und CAS**

In `features/calendar/recurrence.ts`:

`EventOps.updateMaster` umschreiben (dritter Parameter **vor** dem optionalen):

```ts
/**
 * `seenUpdatedAt` ist `master.updated_at` aus dem gerade gelesenen Row —
 * **nicht** die `baseVersion` des Formulars. Der Unterschied ist der Zweck:
 * Der Pre-Flight in `mutations.ts` prüft gegen das, was das *Formular*
 * gesehen hat (Fenster: Minuten), dieses Compare-and-Swap gegen das, was
 * *dieser Schreibvorgang* eine Zeile vorher gelesen hat (Fenster:
 * Millisekunden). Mit der `baseVersion` prüfte es dieselbe Bedingung zweimal
 * und schlösse das Fenster nicht, für das es da ist (ADR-031).
 */
updateMaster: (
  eventId: string,
  changes: EventChanges,
  seenUpdatedAt: string,
  recurrence?: RecurrenceChanges,
) => Promise<void>;
```

In `applyEditScope` **alle vier** `ops.updateMaster`-Aufrufstellen ergänzen — `master` ist überall in Scope:

```ts
    await ops.updateMaster(eventId, changes, master.updated_at, recurrence);   // recurrence-Zweig
    …
    await ops.updateMaster(eventId, changes, master.updated_at);               // scope === "this", nicht wiederkehrend
    …
    await ops.updateMaster(eventId, changes, master.updated_at);               // forward, consumed === 0
    …
    await ops.updateMaster(eventId, changes, master.updated_at);               // forward, cutoff < dtstart
    …
    await ops.updateMaster(eventId, changes, master.updated_at);               // scope === "all"
```

(Gegenprobe: `grep -c "ops.updateMaster" features/calendar/recurrence.ts` — es sind fünf Aufrufstellen.)

In `createSupabaseEventOps` die Implementierung:

```ts
    updateMaster: async (eventId, changes, seenUpdatedAt, recurrence) => {
      const { data, error } = await client
        .from("events")
        .update(recurrence ? { ...changes, ...recurrence } : changes)
        .eq("id", eventId)
        .eq("updated_at", seenUpdatedAt)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      // Null Zeilen heißt: zwischen dem Lesen und diesem Schreiben hat jemand
      // die Zeile angefasst (oder gelöscht). `null` statt der fremden Fassung —
      // hier ist bekannt, *dass*, nicht *was*.
      if (!data) throw new EventConflictError(null);
    },
```

mit `import { EventConflictError } from "./errors";` oben.

- [ ] **Step 5: `recurrence.test.ts` nachziehen**

Elf Assertions in dieser Datei erwarten die alte Signatur. Fixture ergänzen (unter `MASTER_START`):

```ts
const MASTER_UPDATED_AT = "2026-05-01T00:00:00.000Z";
```

Dann:

- `expect(ops.updateMaster).toHaveBeenCalledWith("evt-1", CHANGES)` → `toHaveBeenCalledWith("evt-1", CHANGES, MASTER_UPDATED_AT)` (5 Stellen: Zeilen ~233, ~247, ~281, ~296, ~334)
- `expect(ops.updateMaster).toHaveBeenCalledWith("evt-1", CHANGES, NEW_RULE)` → `toHaveBeenCalledWith("evt-1", CHANGES, MASTER_UPDATED_AT, NEW_RULE)` (2 Stellen: ~434, ~451)
- `toHaveBeenCalledWith("evt-1", CHANGES, unchanged)` → `("evt-1", CHANGES, MASTER_UPDATED_AT, unchanged)` (~475)
- `toHaveBeenCalledWith("evt-1", CHANGES, none)` → `("evt-1", CHANGES, MASTER_UPDATED_AT, none)` (~520)
- Die `not.toHaveBeenCalled()`-Stellen bleiben unverändert.

Falls `makeMaster` in dieser Datei ein anderes `updated_at` trägt als `2026-05-01T00:00:00.000Z`, den tatsächlichen Wert nehmen:

```bash
grep -n "updated_at" features/calendar/recurrence.test.ts
```

Zusätzlich ein neuer Test am Ende des Edit-Scope-`describe`-Blocks:

```ts
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

  expect(ops.updateMaster).toHaveBeenCalledWith("evt-1", CHANGES, "2026-05-09T08:00:00.000Z");
});
```

- [ ] **Step 6: Tests laufen lassen, Erfolg prüfen**

```bash
bun test features/calendar
```

Erwartet: PASS, alle Kalender-Suites.

- [ ] **Step 7: Typecheck**

```bash
bun run typecheck
```

Erwartet: **Fehler** in `EventEditScreen.tsx` und `EventDetailScreen.tsx` — `baseVersion` fehlt in den Vars. Das ist richtig so und wird in Task 8 und 10 aufgelöst. Um jetzt grün zu committen, in beiden Screens das Feld provisorisch mit dem vorhandenen Wert füllen:

- `EventEditScreen.onSave`, im `vars`-Objekt: `baseVersion: occurrence.version,`
- `EventDetailScreen`, im `deleteMutation.mutateAsync({ … })`: `baseVersion: data.version,`

Das ist keine Zwischenlösung, sondern schon die endgültige Verdrahtung — Task 8 und 10 ergänzen nur die Fehlerbehandlung.

Danach erneut:

```bash
bun run typecheck && bun test
```

Erwartet: grün.

- [ ] **Step 8: Commit**

```bash
git add features/calendar app-sections/event
git commit -m "feat(calendar): Konflikt-Erkennung vor dem Schreiben

Pre-Flight in updateEvent/deleteEvent: Der Master-Fetch war ohnehin da, der
Versionsvergleich kostet nichts und deckt alle vier Scopes — auch den
Forward-Split, der updateMaster gar nicht ruft.

updateMaster bekommt zusätzlich ein Compare-and-Swap gegen den Stempel des
gerade gelesenen Masters. Das ist bewusst nicht die baseVersion des Formulars:
sonst prüfte es dieselbe Bedingung zweimal statt das Millisekundenfenster
zwischen Lesen und Schreiben zu schließen."
```

---

## Task 5: CAS in `useUpdateTask`

**Files:**

- Modify: `features/tasks/mutations.ts`

**Interfaces:**

- Consumes: `TaskConflictError` (Task 3)
- Produces: `UpdateTaskVars.baseVersion: string`

- [ ] **Step 1: `UpdateTaskVars` erweitern**

In `features/tasks/mutations.ts`:

```ts
export interface UpdateTaskVars {
  taskId: string;
  changes: TaskChanges;
  /**
   * `task.updated_at` beim Laden des Formulars. Aufgaben brauchen kein
   * zusammengesetztes Token wie der Kalender — eine Aufgabe ist eine Zeile.
   */
  baseVersion: string;
}
```

- [ ] **Step 2: `mutationFn` umschreiben**

```ts
    mutationFn: async (vars: UpdateTaskVars): Promise<void> => {
      // `.eq("updated_at", …)` macht aus dem Update ein Compare-and-Swap: Es
      // trifft die Zeile nur, solange niemand anderes sie seit dem Laden des
      // Formulars angefasst hat. Anders als im Kalender ist das hier der
      // *Detektor*, nicht bloß die Absicherung — es gibt keinen Fetch, den man
      // mitbenutzen könnte, und ein Pre-Flight kostete einen Roundtrip pro
      // Speichern (ADR-031).
      const { data, error } = await supabase
        .from("tasks")
        .update(vars.changes)
        .eq("id", vars.taskId)
        .eq("updated_at", vars.baseVersion)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (data) return;

      // Null Zeilen heißt eines von zwei Dingen. Erst *jetzt* wird gelesen —
      // im Normalfall kostet der Guard damit keinen zusätzlichen Roundtrip.
      const { data: current, error: readError } = await supabase
        .from("tasks")
        .select("*, task_types(*)")
        .eq("id", vars.taskId)
        .maybeSingle();
      if (readError) throw readError;
      if (!current) {
        // `hw.error.staleReference` names a stale *child or task type*
        // reference specifically — using it here (the task row itself is
        // gone) would misdescribe the failure. A plain Error falls through
        // mapTaskError's classification to `hw.error.generic`, which is the
        // closer fit.
        throw new Error("Task no longer exists");
      }
      throw new TaskConflictError(current);
    },
```

Import ergänzen:

```ts
import { MissingParentError, TaskConflictError } from "./errors";
```

- [ ] **Step 3: Typecheck**

```bash
bun run typecheck
```

Erwartet: **Fehler** in `TaskEditScreen.tsx` — `baseVersion` fehlt. Dort ergänzen, im `onSave`:

```ts
function onSave() {
  const changes = toTaskChanges(state);
  if (!changes || !taskId || !task || updateMutation.isPending) return;
  updateMutation.mutate(
    { taskId, changes, baseVersion: task.updated_at },
    { onSuccess: goBackOrToTasks },
  );
}
```

Erneut `bun run typecheck` — erwartet: grün.

- [ ] **Step 4: Tests**

```bash
bun test
```

Erwartet: grün. `useUpdateTask` hat keine eigene Suite (der Hook spricht direkt mit Supabase, es gibt keine injizierbaren Deps wie im Kalender) — die Verifikation dieses Pfades ist der Zwei-Client-Lauf in Task 11, Schritt 8.

- [ ] **Step 5: Commit**

```bash
git add features/tasks app-sections/task
git commit -m "feat(tasks): Compare-and-Swap beim Aktualisieren

Das Update trifft die Zeile nur noch, solange niemand sie seit dem Laden des
Formulars angefasst hat. Bei null Zeilen wird erst dann gelesen, um zu
unterscheiden, ob die Aufgabe weg ist oder fremd geändert wurde — im
Normalfall kostet der Guard damit keinen zusätzlichen Roundtrip.

Löst den TODO-Eintrag 'Zwei Eltern, die zeitgleich verschiedene Felder
derselben Aufgabe ändern, überschreiben sich gegenseitig'."
```

---

## Task 6: Die Vergleichsfunktionen

**Files:**

- Create: `features/calendar/conflict.ts`, `features/calendar/conflict.test.ts`
- Create: `features/tasks/conflict.ts`, `features/tasks/conflict.test.ts`
- Modify: `features/calendar/index.ts`, `features/tasks/index.ts`

**Interfaces:**

- Consumes: `CalendarOccurrence` (features/calendar/types.ts), `EventChanges` (features/calendar/recurrence.ts), `TaskWithType` (features/tasks/types.ts), `TaskChanges` (features/tasks/optimistic.ts)
- Produces:
  - `type EventConflictField = "title" | "start_at" | "end_at" | "location" | "description"`
  - `differingEventFields(theirs: CalendarOccurrence, mine: EventChanges): EventConflictField[]`
  - `type TaskConflictField = "title" | "subject" | "description" | "due_date" | "due_time" | "child_id" | "type_id"`
  - `differingTaskFields(theirs: TaskWithType, mine: TaskChanges): TaskConflictField[]`

- [ ] **Step 1: Failing test für den Kalender schreiben**

Create `features/calendar/conflict.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import type { EventChanges } from "./recurrence";
import type { CalendarOccurrence } from "./types";

import { differingEventFields } from "./conflict";

const START = new Date("2026-06-15T15:00:00.000Z");
const END = new Date("2026-06-15T16:00:00.000Z");

function theirs(overrides: Partial<CalendarOccurrence> = {}): CalendarOccurrence {
  return {
    eventId: "evt-1",
    occurrenceDate: "2026-06-15",
    startAt: START,
    endAt: END,
    title: "Zahnarzt",
    description: null,
    location: "Praxis Dr. Weiß",
    allDay: false,
    childId: null,
    parentId: null,
    isException: false,
    isRecurring: false,
    version: "v1|-",
    rrule: { freq: null, interval: 1, byweekday: null, count: null, until: null },
    type: { slug: "arzt", color: "#000", iconName: "calendar", labelDe: "Arzt", labelEn: "Doctor" },
    ...overrides,
  };
}

function mine(overrides: Partial<EventChanges> = {}): EventChanges {
  return {
    title: "Zahnarzt",
    start_at: START.toISOString(),
    end_at: END.toISOString(),
    location: "Praxis Dr. Weiß",
    description: null,
    ...overrides,
  };
}

describe("differingEventFields", () => {
  test("identische Fassungen ergeben keine Abweichung", () => {
    expect(differingEventFields(theirs(), mine())).toEqual([]);
  });

  test("ein abweichender Titel", () => {
    expect(differingEventFields(theirs(), mine({ title: "Kieferorthopäde" }))).toEqual(["title"]);
  });

  test("abweichende Zeiten, beide Enden", () => {
    expect(
      differingEventFields(
        theirs(),
        mine({
          start_at: "2026-06-15T17:00:00.000Z",
          end_at: "2026-06-15T18:00:00.000Z",
        }),
      ),
    ).toEqual(["start_at", "end_at"]);
  });

  test("Zeitpunkte werden als Zeitpunkt verglichen, nicht als Zeichenkette", () => {
    // Dasselbe Instant, andere Schreibweise — der Server liefert PostgREST-
    // Zeitstempel, das Formular `toISOString()`. Ein Stringvergleich meldete
    // hier eine Abweichung, die keine ist.
    expect(differingEventFields(theirs(), mine({ start_at: "2026-06-15T17:00:00+02:00" }))).toEqual(
      [],
    );
  });

  test("leerer Ort und null gelten als dasselbe", () => {
    // Das Formular schickt `location.trim() || null`; eine fremde Fassung kann
    // "" tragen. Beide heißen „kein Ort".
    expect(differingEventFields(theirs({ location: "" }), mine({ location: null }))).toEqual([]);
  });

  test("mehrere Abweichungen kommen in fester Reihenfolge", () => {
    expect(
      differingEventFields(theirs(), mine({ description: "Karte mitnehmen", title: "Neu" })),
    ).toEqual(["title", "description"]);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

```bash
bun test features/calendar/conflict.test.ts
```

Erwartet: FAIL — `Cannot find module './conflict'`.

- [ ] **Step 3: `features/calendar/conflict.ts` schreiben**

```ts
import type { EventChanges } from "./recurrence";
import type { CalendarOccurrence } from "./types";

/** Die fünf Felder, die das Bearbeiten-Formular schreibt (`EventChanges`). */
export type EventConflictField = "title" | "start_at" | "end_at" | "location" | "description";

/** `""` und `null` heißen beide „nicht gesetzt" — das Formular schickt `trim() || null`. */
function sameText(a: string | null, b: string | null): boolean {
  return (a ?? "") === (b ?? "");
}

/**
 * Als Zeitpunkt vergleichen, nicht als Zeichenkette: Der Server liefert
 * PostgREST-Zeitstempel (`2026-06-15T17:00:00+00:00`), das Formular
 * `toISOString()` (`…Z`). Ein Stringvergleich meldete jedes Speichern als
 * Konflikt.
 */
function sameInstant(a: Date, b: string): boolean {
  return a.getTime() === new Date(b).getTime();
}

/**
 * Welche Felder die fremde Fassung anders trägt als die eigene Eingabe.
 *
 * **Eine leere Liste heißt: kein Dialog, der Schreibvorgang läuft durch.** Das
 * ist kein Sonderfall, sondern was den Mechanismus benutzbar macht — ein
 * Versionssprung ohne inhaltliche Abweichung (jemand hat dasselbe geändert,
 * oder etwas, das ich gar nicht anfasse) darf niemanden anhalten. Ein Guard,
 * der bei jedem Versionssprung meldet, wird weggeklickt (ADR-031).
 *
 * Gibt Schlüssel zurück, keine Zeichenketten: Formatiert wird im Screen, der
 * Locale, Datumsformat und die geladenen Nachschlagelisten hat.
 */
export function differingEventFields(
  theirs: CalendarOccurrence,
  mine: EventChanges,
): EventConflictField[] {
  const out: EventConflictField[] = [];
  if (theirs.title !== mine.title) out.push("title");
  if (!sameInstant(theirs.startAt, mine.start_at)) out.push("start_at");
  if (!sameInstant(theirs.endAt, mine.end_at)) out.push("end_at");
  if (!sameText(theirs.location, mine.location)) out.push("location");
  if (!sameText(theirs.description, mine.description)) out.push("description");
  return out;
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg prüfen**

```bash
bun test features/calendar/conflict.test.ts
```

Erwartet: PASS, 6 Tests.

- [ ] **Step 5: Failing test für Aufgaben schreiben**

Create `features/tasks/conflict.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import type { TaskChanges } from "./optimistic";
import type { TaskWithType } from "./types";

import { differingTaskFields } from "./conflict";

function theirs(overrides: Partial<TaskWithType> = {}): TaskWithType {
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
    updated_at: "2026-06-01T00:00:00.000Z",
    task_types: null,
    ...overrides,
  } as TaskWithType;
}

function mine(overrides: Partial<TaskChanges> = {}): TaskChanges {
  return {
    title: "Mathe Seite 42",
    description: null,
    subject: "Mathe",
    due_date: "2026-06-15",
    due_time: null,
    child_id: null,
    type_id: "type-1",
    ...overrides,
  };
}

describe("differingTaskFields", () => {
  test("identische Fassungen ergeben keine Abweichung", () => {
    expect(differingTaskFields(theirs(), mine())).toEqual([]);
  });

  test("ein abweichender Titel", () => {
    expect(differingTaskFields(theirs(), mine({ title: "Mathe Seite 43" }))).toEqual(["title"]);
  });

  test("ein abweichendes Fälligkeitsdatum", () => {
    expect(differingTaskFields(theirs(), mine({ due_date: "2026-06-16" }))).toEqual(["due_date"]);
  });

  test("die Uhrzeit vergleicht HH:mm, nicht die Postgres-Schreibweise", () => {
    // Postgres rendert `time` als HH:mm:ss, ein Wert kann aber als HH:mm
    // ankommen — `parseDueTime` in form.ts akzeptiert deshalb beide.
    expect(
      differingTaskFields(theirs({ due_time: "16:30:00" }), mine({ due_time: "16:30" })),
    ).toEqual([]);
  });

  test("ein Wechsel des Kindes", () => {
    expect(differingTaskFields(theirs(), mine({ child_id: "child-2" }))).toEqual(["child_id"]);
  });

  test("leerer Text und null gelten als dasselbe", () => {
    expect(differingTaskFields(theirs({ subject: "" }), mine({ subject: null }))).toEqual([]);
  });

  test("mehrere Abweichungen kommen in fester Reihenfolge", () => {
    expect(differingTaskFields(theirs(), mine({ type_id: "type-2", title: "Neu" }))).toEqual([
      "title",
      "type_id",
    ]);
  });
});
```

- [ ] **Step 6: Test laufen lassen, Fehlschlag prüfen**

```bash
bun test features/tasks/conflict.test.ts
```

Erwartet: FAIL — `Cannot find module './conflict'`.

- [ ] **Step 7: `features/tasks/conflict.ts` schreiben**

```ts
import type { TaskChanges } from "./optimistic";
import type { TaskWithType } from "./types";

/** Die Felder, die `toTaskChanges` schreibt. */
export type TaskConflictField =
  "title" | "subject" | "description" | "due_date" | "due_time" | "child_id" | "type_id";

/** `""` und `null` heißen beide „nicht gesetzt". */
function sameText(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? "") === (b ?? "");
}

/**
 * Postgres rendert `time` als `HH:mm:ss`, ein als `HH:mm` geschriebener Wert
 * erreicht den Client aber unverändert — `parseDueTime` in form.ts akzeptiert
 * deshalb beide Schreibweisen. Verglichen werden nur Stunde und Minute.
 */
function sameTime(a: string | null | undefined, b: string | null | undefined): boolean {
  const clock = (value: string | null | undefined) => (value ?? "").slice(0, 5);
  return clock(a) === clock(b);
}

/**
 * Welche Felder die fremde Fassung anders trägt als die eigene Eingabe.
 *
 * Leere Liste heißt: kein Dialog, der Schreibvorgang läuft durch — dieselbe
 * Regel und dieselbe Begründung wie bei `differingEventFields` im Kalender
 * (ADR-031).
 *
 * `child_id` und `type_id` sind Fremdschlüssel; der Vergleich läuft auf der
 * Id, die *Anzeige* löst der Screen aus den ohnehin geladenen Kind- und
 * Typ-Listen auf.
 */
export function differingTaskFields(theirs: TaskWithType, mine: TaskChanges): TaskConflictField[] {
  const out: TaskConflictField[] = [];
  if (theirs.title !== mine.title) out.push("title");
  if (!sameText(theirs.subject, mine.subject)) out.push("subject");
  if (!sameText(theirs.description, mine.description)) out.push("description");
  if (theirs.due_date !== mine.due_date) out.push("due_date");
  if (!sameTime(theirs.due_time, mine.due_time)) out.push("due_time");
  if ((theirs.child_id ?? null) !== (mine.child_id ?? null)) out.push("child_id");
  if (theirs.type_id !== mine.type_id) out.push("type_id");
  return out;
}
```

- [ ] **Step 8: Test laufen lassen, Erfolg prüfen**

```bash
bun test features/tasks/conflict.test.ts
```

Erwartet: PASS, 7 Tests.

- [ ] **Step 9: Barrels ergänzen**

`features/calendar/index.ts`:

```ts
export { differingEventFields, type EventConflictField } from "./conflict";
```

`features/tasks/index.ts`:

```ts
export { differingTaskFields, type TaskConflictField } from "./conflict";
```

- [ ] **Step 10: Typecheck + alle Tests + Commit**

```bash
bun run typecheck && bun test
git add features/calendar features/tasks
git commit -m "feat(conflict): Feldvergleich für Termine und Aufgaben

Eine leere Liste heißt: kein Dialog, der Schreibvorgang läuft durch. Ein
Versionssprung ohne inhaltliche Abweichung darf niemanden anhalten — ein
Guard, der bei jedem Sprung meldet, wird weggeklickt.

Zeitpunkte werden als Zeitpunkt verglichen, nicht als Zeichenkette: der
Server liefert PostgREST-Stempel, das Formular toISOString()."
```

---

## Task 7: Store, Dialog, Wirt

**Files:**

- Create: `app-sections/shared/conflictStore.ts`, `app-sections/shared/conflictStore.test.ts`
- Create: `app-sections/shared/ConflictDialog.tsx`, `app-sections/shared/ConflictDialogHost.tsx`
- Modify: `app-sections/shared/index.ts`, `app/_layout.tsx`

**Interfaces:**

- Consumes: nichts aus früheren Tasks
- Produces:
  - `interface ConflictRow { label: string; theirs: string; mine: string }`
  - `interface ShowConflictOptions { body: string; rows: ConflictRow[]; keepMineLabel: string; keepTheirsLabel: string; title: string; onKeepMine: () => void }`
  - `interface ConflictEntry extends ShowConflictOptions { id: string }`
  - `useConflictStore` (Zustand), `useConflict(): { show, dismiss }`
  - `<ConflictDialogHost />`

- [ ] **Step 1: Failing test schreiben**

Create `app-sections/shared/conflictStore.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import type { ShowConflictOptions } from "./conflictStore";

import { useConflictStore } from "./conflictStore";

function options(overrides: Partial<ShowConflictOptions> = {}): ShowConflictOptions {
  return {
    title: "Gleichzeitig bearbeitet",
    body: "Jemand anderes hat diesen Termin geändert.",
    rows: [{ label: "Titel", theirs: "Zahnarzt", mine: "Kieferorthopäde" }],
    keepMineLabel: "Deine Fassung speichern",
    keepTheirsLabel: "Andere Fassung behalten",
    onKeepMine: () => {},
    ...overrides,
  };
}

describe("conflictStore", () => {
  test("show legt den Dialog ab und gibt seine Id zurück", () => {
    const id = useConflictStore.getState().show(options());
    expect(useConflictStore.getState().current?.id).toBe(id);
  });

  test("ein zweiter Konflikt ersetzt den ersten", () => {
    // Ein Modal kann nur eines zeigen, und das jüngste Ereignis ist das, auf
    // das der Nutzer gerade reagiert — dieselbe Regel wie beim Toast-Stapel.
    useConflictStore.getState().show(options({ body: "erster" }));
    const second = useConflictStore.getState().show(options({ body: "zweiter" }));
    expect(useConflictStore.getState().current?.id).toBe(second);
    expect(useConflictStore.getState().current?.body).toBe("zweiter");
  });

  test("dismiss schließt den Dialog", () => {
    const id = useConflictStore.getState().show(options());
    useConflictStore.getState().dismiss(id);
    expect(useConflictStore.getState().current).toBeNull();
  });

  test("ein veraltetes dismiss schließt den neueren Dialog nicht", () => {
    // Der Nutzer wählt in Dialog A, während B schon steht: A's Handler ruft
    // dismiss(idA) und nähme B sonst mit weg, ohne dass jemand es gesehen hat.
    const first = useConflictStore.getState().show(options({ body: "erster" }));
    useConflictStore.getState().show(options({ body: "zweiter" }));
    useConflictStore.getState().dismiss(first);
    expect(useConflictStore.getState().current?.body).toBe("zweiter");
  });

  test("jede Id ist neu", () => {
    const a = useConflictStore.getState().show(options());
    const b = useConflictStore.getState().show(options());
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

```bash
bun test app-sections/shared/conflictStore.test.ts
```

Erwartet: FAIL — `Cannot find module './conflictStore'`.

- [ ] **Step 3: `conflictStore.ts` schreiben**

```ts
import { create } from "zustand";

/**
 * Der Zustand hinter dem Konflikt-Dialog.
 *
 * Warum ein Store im Root-Layout und nicht lokaler State im Bearbeiten-Screen:
 * `EventEditScreen.onSave` ruft `goBackOrToKalender()` **vor** `save(vars)` —
 * die Änderung steht dank `onMutate` schon im Kalender, das Sheet schließt
 * sofort. Ein Dialog als Screen-State wäre unmontiert, wenn der Server
 * antwortet. Dieselbe Lehre, die ADR-025 für den Toast gezogen hat.
 *
 * Bewusst **ohne** `react-native`-Import, wie `toastStore.ts` und
 * `pendingDeletes.ts` — so läuft die Suite unter Bun, ohne sich auf die Mocks
 * aus `bun.test.preload.ts` zu verlassen.
 */

/** Eine Zeile des Vergleichs. Beide Seiten kommen fertig formatiert an. */
export interface ConflictRow {
  /** Feldname, schon übersetzt — der Screen kennt die passenden `field*`-Keys. */
  label: string;
  theirs: string;
  mine: string;
}

export interface ShowConflictOptions {
  title: string;
  body: string;
  /**
   * Leer heißt nicht „kein Dialog" — das entscheidet der Aufrufer, bevor er
   * hierher kommt. Leer heißt: erkannt, aber die fremde Fassung liegt nicht
   * vor (der Compare-and-Swap-Fall, siehe `EventConflictError.row === null`).
   */
  rows: ConflictRow[];
  keepMineLabel: string;
  keepTheirsLabel: string;
  /** Schickt dieselbe Mutation erneut, mit frischer Basis-Version. */
  onKeepMine: () => void;
}

export interface ConflictEntry extends ShowConflictOptions {
  id: string;
}

// Laufende Nummer statt Zufalls-Id — wie `nextToastId`.
let sequence = 0;

function nextConflictId(): string {
  sequence += 1;
  return `conflict-${sequence}`;
}

interface ConflictState {
  /** Ein Modal kann nur einen Dialog zeigen; ein zweiter ersetzt den ersten. */
  current: ConflictEntry | null;
  show: (options: ShowConflictOptions) => string;
  dismiss: (id: string) => void;
}

export const useConflictStore = create<ConflictState>((set) => ({
  current: null,
  show: (options) => {
    const entry: ConflictEntry = { ...options, id: nextConflictId() };
    set({ current: entry });
    return entry.id;
  },
  // Nur schließen, wenn genau *dieser* Dialog noch steht: Der Nutzer kann in A
  // wählen, während B bereits darüber liegt — ohne den Vergleich nähme A's
  // Handler B mit weg, ohne dass jemand es gesehen hat.
  dismiss: (id) => set((state) => (state.current?.id === id ? { current: null } : state)),
}));

export interface ConflictApi {
  show: (options: ShowConflictOptions) => string;
  dismiss: (id: string) => void;
}

/**
 * Der Zugriff für Screens. Bewusst ohne Context — der Store liegt auf
 * Modulebene, der Hook funktioniert also auch in Bäumen, die der Wirt nicht
 * umschließt (etwa den nativen Modal-Screens). Der Wirt zeichnet, er verteilt
 * nicht. Dieselbe Bauform wie `useToast()`.
 */
export function useConflict(): ConflictApi {
  const show = useConflictStore((s) => s.show);
  const dismiss = useConflictStore((s) => s.dismiss);
  return { show, dismiss };
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg prüfen**

```bash
bun test app-sections/shared/conflictStore.test.ts
```

Erwartet: PASS, 5 Tests.

- [ ] **Step 5: `ConflictDialog.tsx` schreiben**

```tsx
import { Modal, Pressable, ScrollView, View } from "react-native";

import { DS } from "@/design-system";
import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Text } from "@/design-system/ui";

import type { ConflictEntry } from "./conflictStore";

interface ConflictDialogProps {
  entry: ConflictEntry;
  onKeepMine: () => void;
  onKeepTheirs: () => void;
}

/**
 * Der Vergleich zweier Fassungen, mit zwei Auswegen.
 *
 * `Modal` statt `Alert.alert`, und das ist keine Geschmacksfrage:
 * react-native-web implementiert `Alert.alert` als No-Op (`static alert() {}`),
 * der Dialog wäre im Web-Bundle unsichtbar — ausgerechnet dort, wo der
 * Zwei-Client-Test läuft (ADR-031). Die Bauform ist dieselbe wie in
 * `DateTimePickerSheet.web.tsx`.
 *
 * Bewusst nur **zwei** Aktionen: „Abbrechen" fiele mit „Andere Fassung
 * behalten" zusammen, weil das Bearbeiten-Sheet längst zu ist — es gibt kein
 * Formular mehr, in das ein Abbruch zurückführen könnte. Der Scrim-Tap wirkt
 * wie „behalten": nichts tun heißt hier, dass die fremde Fassung gilt.
 *
 * `rows` darf leer sein (Compare-and-Swap ohne fremde Fassung). Dann steht der
 * Text allein — stilles Durchwinken wäre der Fehler, gegen den der Dialog
 * gebaut ist.
 */
export function ConflictDialog({ entry, onKeepMine, onKeepTheirs }: ConflictDialogProps) {
  const { theme } = useTheme();

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onKeepTheirs}>
      <Pressable
        style={{
          flex: 1,
          backgroundColor: DS.components.bottomSheet.scrimColor,
          justifyContent: "center",
          alignItems: "center",
          padding: 24,
        }}
        accessibilityLabel={entry.keepTheirsLabel}
        onPress={onKeepTheirs}
      >
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={{
            backgroundColor: theme.card,
            borderRadius: 20,
            padding: 20,
            gap: 14,
            width: "100%",
            maxWidth: 420,
          }}
        >
          <Text variant="h2">{entry.title}</Text>
          <Text variant="body" tone="inkSecondary">
            {entry.body}
          </Text>

          {entry.rows.length > 0 ? (
            <ScrollView style={{ maxHeight: 260 }} contentContainerStyle={{ gap: 12 }}>
              {entry.rows.map((row) => (
                <View
                  key={row.label}
                  style={{
                    backgroundColor: theme.cardSubtle,
                    borderRadius: 14,
                    padding: 12,
                    gap: 6,
                  }}
                >
                  <Text variant="caption" tone="inkTertiary">
                    {row.label}
                  </Text>
                  <Text variant="body">{row.theirs}</Text>
                  <Text variant="body" tone="primaryStrong">
                    {row.mine}
                  </Text>
                </View>
              ))}
            </ScrollView>
          ) : null}

          <View style={{ gap: 8 }}>
            <Button label={entry.keepMineLabel} size="lg" block onPress={onKeepMine} />
            <Button
              label={entry.keepTheirsLabel}
              variant="soft"
              tone="neutral"
              size="lg"
              block
              onPress={onKeepTheirs}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
```

**Hinweis zur Beschriftung der Vergleichszeilen:** Die beiden Werte einer Zeile brauchen ihre Herkunft. Der Screen baut `label` bereits als Feldname; die Zuordnung „oben = fremd, unten = eigen" trägt der Dialog über die Tonwerte (`ink` vs. `primaryStrong`). Damit sie auch benannt ist, bekommt jede Zeile die beiden Präfixe aus `conflict.theirs`/`conflict.mine` — der Screen setzt sie in Task 8 als Teil des `theirs`/`mine`-Strings zusammen (`"Jetzt gespeichert: Zahnarzt"`). Der Dialog bleibt damit stumpf und braucht keine eigene i18n-Anbindung.

- [ ] **Step 6: `ConflictDialogHost.tsx` schreiben**

```tsx
import { ConflictDialog } from "./ConflictDialog";
import { useConflictStore } from "./conflictStore";

/**
 * Zeichnet den Konflikt-Dialog — einmal im Root-Layout montiert, neben dem
 * `ToastProvider` und aus demselben Grund: Das Bearbeiten-Sheet ist zu, bevor
 * der Server antwortet, ein Dialog im Screen wäre nie sichtbar (ADR-031).
 *
 * Der Wirt **verteilt nichts** — `useConflict()` kommt ohne Context aus. Ihn zu
 * vergessen heißt, dass Konflikte unbemerkt bleiben, nicht dass etwas wirft.
 */
export function ConflictDialogHost() {
  const current = useConflictStore((s) => s.current);
  const dismiss = useConflictStore((s) => s.dismiss);

  if (!current) return null;

  return (
    <ConflictDialog
      entry={current}
      onKeepMine={() => {
        // Erst schließen, dann schicken: Der zweite Versuch kann selbst wieder
        // kollidieren und einen neuen Dialog öffnen — ein `dismiss` danach
        // nähme genau den wieder weg.
        dismiss(current.id);
        current.onKeepMine();
      }}
      onKeepTheirs={() => {
        dismiss(current.id);
      }}
    />
  );
}
```

- [ ] **Step 7: Barrel und Root-Layout**

In `app-sections/shared/index.ts`, alphabetisch einsortiert:

```ts
export { ConflictDialog } from "./ConflictDialog";
export { ConflictDialogHost } from "./ConflictDialogHost";
export {
  useConflict,
  useConflictStore,
  type ConflictApi,
  type ConflictEntry,
  type ConflictRow,
  type ShowConflictOptions,
} from "./conflictStore";
```

In `app/_layout.tsx` den Import erweitern:

```ts
import { ConflictDialogHost, ToastProvider } from "@/app-sections/shared";
```

und direkt **nach** `</Stack>`, innerhalb von `<ToastProvider>`:

```tsx
{
  /* Neben den Toasts und aus demselben Grund: Der Dialog überlebt den
            Screenwechsel, der ihn ausgelöst hat. */
}
<ConflictDialogHost />;
```

- [ ] **Step 8: Typecheck, Tests, Web-Bundle**

```bash
bun run typecheck && bun test && bun lint
```

Erwartet: alles grün.

```bash
bunx expo export --platform web --output-dir /tmp/eltern-web
```

Erwartet: Build läuft durch (der Dialog ist neu im Baum des Root-Layouts).

- [ ] **Step 9: Commit**

```bash
git add app-sections/shared app/_layout.tsx
git commit -m "feat(conflict): Store, Dialog und Wirt im Root-Layout

Das Bearbeiten-Sheet schließt vor der Server-Antwort — ein Dialog als
Screen-State würde nie gezeichnet. Deshalb dieselbe Bauform wie beim Toast:
Store auf Modulebene, Wirt im Root-Layout.

Modal statt Alert.alert: react-native-web implementiert Alert.alert als
No-Op, der Dialog wäre im Web-Bundle unsichtbar — ausgerechnet dort, wo der
Zwei-Client-Test läuft."
```

---

## Task 8: `EventEditScreen` verdrahten

**Files:**

- Modify: `app-sections/event/EventEditScreen.tsx`

**Interfaces:**

- Consumes: `EventConflictError` (Task 3), `differingEventFields` (Task 6), `useConflict` (Task 7), `occurrence.version` (Task 2)
- Produces: nichts für spätere Tasks

- [ ] **Step 1: Imports und Hook ergänzen**

```ts
import { DateTimePickerSheet, Field, useConflict, useToast } from "@/app-sections/shared";
```

```ts
import {
  // … bestehende Importe …
  differingEventFields,
  EventConflictError,
  expandEvents,
  type EventConflictField,
} from "@/features/calendar";
```

`features/calendar/index.ts` exportiert `expandEvents` heute **nicht** (geprüft: kein `expand`-Eintrag im Barrel). Ergänzen:

```ts
export { expandEvents, type EventWithRelations } from "./expand";
```

Kein Zyklus: `version.ts` und `errors.ts` importieren aus `./expand` nur `import type`, also zur Laufzeit gar nicht.

Im Komponentenrumpf, neben `const { show } = useToast();`:

```ts
const conflict = useConflict();
```

- [ ] **Step 2: Feldbeschriftungen und Formatierung**

Oberhalb der Komponente, auf Modulebene:

```tsx
/** Welcher Copy-Key welches Feld benennt — die Beschriftungen des Formulars. */
const FIELD_LABEL_KEY: Record<EventConflictField, string> = {
  title: "cal.edit.fieldTitle",
  start_at: "cal.edit.fieldStart",
  end_at: "cal.edit.fieldEnd",
  location: "cal.edit.fieldLocation",
  description: "cal.edit.fieldNotes",
};
```

Innerhalb der Komponente, neben den übrigen Hilfsfunktionen:

```tsx
/** Ein Feldwert, wie er im Vergleich lesbar ist. `—` für „nicht gesetzt". */
function formatField(
  field: EventConflictField,
  source: {
    title: string;
    startAt: Date;
    endAt: Date;
    location: string | null;
    description: string | null;
  },
): string {
  switch (field) {
    case "title":
      return source.title || "—";
    case "start_at":
      return format(source.startAt, "E, d. MMM yyyy, HH:mm", { locale: dateLocale });
    case "end_at":
      return format(source.endAt, "E, d. MMM yyyy, HH:mm", { locale: dateLocale });
    case "location":
      return source.location?.trim() || "—";
    case "description":
      return source.description?.trim() || "—";
  }
}
```

- [ ] **Step 3: `save()` um den Konflikt-Zweig erweitern**

Die vorhandene Funktion ersetzen:

```tsx
/**
 * Schickt die Mutation und meldet einen Fehlschlag selbst.
 *
 * Bewusst `mutateAsync` mit eigenem `catch` statt eines Per-Call-`onError`:
 * Das Sheet ist unmontiert, bevor der Server antwortet, und TanStack Query
 * ruft Per-Call-Callbacks dann nicht mehr — festgehalten in
 * `features/tasks/mutateAsyncSurvivesUnmount.test.ts`. Genau deshalb geht der
 * Konflikt-Fall in den Store und nicht in lokalen State: Dieser `catch` ist
 * eine Closure und überlebt den Unmount, ein `useState` nicht (ADR-031).
 *
 * Die Retry-Aktion schickt dieselben `vars` erneut, damit der Rollback dem
 * Nutzer nicht die Eingaben nimmt.
 */
function save(vars: Parameters<typeof updateMutation.mutateAsync>[0]) {
  updateMutation.mutateAsync(vars).catch((err: unknown) => {
    if (err instanceof EventConflictError) {
      showConflict(err, vars);
      return;
    }
    show({
      title: t("cal.edit.error.saveFailed"),
      message: t(mapEventError(err)),
      variant: "error",
      position: "bottom",
      action: {
        label: t("action.retry"),
        onPress: () => {
          save(vars);
        },
      },
    });
  });
}

/**
 * Öffnet den Vergleich — oder speichert stillschweigend durch.
 *
 * Weicht inhaltlich nichts ab, gibt es nichts zu entscheiden: Jemand hat
 * dasselbe geändert, oder etwas, das dieser Nutzer gar nicht angefasst hat.
 * Ein Dialog wäre dann nur im Weg (ADR-031). Der Wiederholungsversuch nimmt
 * die **frische** Version als Basis — kein `force`-Flag, kein Bypass: Er kann
 * erneut kollidieren, wenn ein Dritter dazwischenschreibt.
 */
function showConflict(
  err: EventConflictError,
  vars: Parameters<typeof updateMutation.mutateAsync>[0],
) {
  // Kein `row` heißt: der Compare-and-Swap hat den Konflikt erkannt, ohne die
  // fremde Fassung zu kennen. Dann steht der Dialog ohne Vergleichszeilen —
  // und ohne frische Version bleibt nur die alte als Basis, der zweite
  // Versuch schlägt also erneut fehl, bis der Refetch durch ist. Das ist
  // ehrlicher als stilles Überschreiben.
  const theirs = err.row
    ? (expandEvents(
        [err.row],
        new Date(vars.changes.start_at),
        new Date(vars.changes.end_at),
        theme,
      ).find((o) => o.occurrenceDate === vars.occurrenceDate) ?? null)
    : null;

  const fields = theirs ? differingEventFields(theirs, vars.changes) : [];
  if (theirs && fields.length === 0) {
    save({ ...vars, baseVersion: theirs.version });
    return;
  }

  const mineSource = {
    title: vars.changes.title,
    startAt: new Date(vars.changes.start_at),
    endAt: new Date(vars.changes.end_at),
    location: vars.changes.location,
    description: vars.changes.description,
  };

  conflict.show({
    title: t("conflict.title"),
    body: t("conflict.body.event"),
    rows:
      theirs === null
        ? []
        : fields.map((field) => ({
            label: t(FIELD_LABEL_KEY[field]),
            theirs: `${t("conflict.theirs")}: ${formatField(field, theirs)}`,
            mine: `${t("conflict.mine")}: ${formatField(field, mineSource)}`,
          })),
    keepMineLabel: t("conflict.keepMine"),
    keepTheirsLabel: t("conflict.keepTheirs"),
    onKeepMine: () => {
      save({ ...vars, baseVersion: theirs?.version ?? vars.baseVersion });
    },
  });
}
```

- [ ] **Step 4: `baseVersion` in den Vars prüfen**

In `onSave` muss das `vars`-Objekt (aus Task 4, Step 7) enthalten:

```ts
      baseVersion: occurrence.version,
```

Gegenprobe:

```bash
grep -n "baseVersion" app-sections/event/EventEditScreen.tsx
```

Erwartet: mindestens drei Treffer (Vars-Objekt, `showConflict`-Retry, `onKeepMine`).

- [ ] **Step 5: Typecheck, Lint, Tests**

```bash
bun run typecheck && bun lint && bun test
```

Erwartet: grün. `expandEvents` braucht ein Fenster — es ist hier bewusst der Änderungs-Bereich der eigenen Eingabe; sollte die fremde Fassung außerhalb liegen, ist `theirs` `null` und der Dialog erscheint ohne Zeilen. Das ist der ehrliche Ausgang, kein Bug.

- [ ] **Step 6: Commit**

```bash
git add app-sections/event/EventEditScreen.tsx features/calendar/index.ts
git commit -m "feat(calendar): Vergleichs-Dialog beim Bearbeiten

Der catch-Block ist eine Closure und überlebt den Unmount des Sheets — genau
deshalb geht der Konflikt in den Store statt in lokalen State.

Weicht inhaltlich nichts ab, wird ohne Dialog durchgespeichert: Jemand hat
dasselbe geändert oder etwas, das dieser Nutzer gar nicht angefasst hat."
```

---

## Task 9: `TaskEditScreen` verdrahten

**Files:**

- Modify: `app-sections/task/TaskEditScreen.tsx`

**Interfaces:**

- Consumes: `TaskConflictError` (Task 3), `differingTaskFields` + `TaskConflictField` (Task 6), `useConflict` (Task 7), `UpdateTaskVars.baseVersion` (Task 5)
- Produces: nichts für spätere Tasks

**Kontext, der die Form dieser Task bestimmt** — dieser Screen ist **nicht** wie
`EventEditScreen` gebaut, und das ist kein Versehen:

- Er bleibt bis zum Erfolg montiert (`updateMutation.mutate(vars, { onSuccess: goBackOrToTasks })`),
  Per-Call-Callbacks feuern hier also. Kein `mutateAsync`-mit-eigenem-`catch` nötig.
- Er hat **keinen** Toast. Update-Fehler stehen als Inline-Zeile unter dem
  Formular (`{updateMutation.error ? <Text tone="danger">{t(mapTaskError(…))}</Text> : null}`).
  Diese Zeile bleibt unangetastet und übernimmt weiterhin alles außer dem
  Konflikt — **kein** `useToast` in diesen Screen einbauen, kein
  `hw.edit.error.saveFailed` erfinden (der Key existiert nicht).
- `typeItems` und `childOptions` aus `useTaskFormOptions` tragen die
  aufgelösten Namen bereits (`{ id, label, color }` bzw. `{ id, name, color, kind }`).
  Für den Vergleich werden **diese** gelesen, nicht die Rohlisten.

- [ ] **Step 1: Imports und Hook**

Den Shared-Import erweitern:

```ts
import { confirmDestructive, useConflict, useUndoableDelete } from "@/app-sections/shared";
```

Den Tasks-Import erweitern:

```ts
import {
  // … bestehende Importe …
  differingTaskFields,
  TaskConflictError,
  type TaskConflictField,
} from "@/features/tasks";
```

Und den Typ-Import oben ergänzen:

```ts
import type { TaskChanges, TaskFormState } from "@/features/tasks";
```

Im Komponentenrumpf, neben `const undoableDelete = useUndoableDelete();`:

```ts
const conflict = useConflict();
```

- [ ] **Step 2: Feldbeschriftungen auf Modulebene**

Oberhalb von `export function TaskEditScreen()`:

```tsx
/**
 * Welcher Copy-Key welches Feld benennt — die Beschriftungen, die `TaskForm`
 * ohnehin über den Feldern zeigt. Bewusst keine eigene Copy für den Dialog:
 * ein zweiter Name für dasselbe Feld wäre eine Divergenz, die niemand pflegt.
 */
const FIELD_LABEL_KEY: Record<TaskConflictField, string> = {
  title: "hw.form.fieldTitle",
  subject: "hw.form.fieldSubject",
  description: "hw.form.fieldNotes",
  due_date: "hw.form.fieldDue",
  due_time: "hw.form.fieldDueTime",
  child_id: "hw.form.fieldChild",
  type_id: "hw.form.fieldType",
};

/**
 * Beide Seiten des Vergleichs unter einem Dach: `TaskWithType` (die fremde
 * Fassung) ist auf diese Form zuweisbar, `TaskChanges` ebenfalls — dessen
 * Felder sind optional, die der Zeile nullable.
 */
type TaskFieldSource = Pick<TaskChanges, TaskConflictField>;
```

- [ ] **Step 3: Speichern und Konflikt**

Die vorhandene `onSave`-Funktion ersetzen:

```tsx
function onSave() {
  const changes = toTaskChanges(state);
  if (!changes || !taskId || !task || updateMutation.isPending) return;
  submit({ taskId, changes, baseVersion: task.updated_at });
}

/**
 * Der eine Schreibpfad — auch der Wiederholungsversuch aus dem Dialog läuft
 * hierdurch, damit er dieselbe Behandlung bekommt und erneut kollidieren
 * kann.
 *
 * `mutate` mit Per-Call-Callbacks statt `mutateAsync` mit eigenem `catch`:
 * Anders als das Kalender-Sheet bleibt dieser Screen bis zum Erfolg montiert,
 * TanStack ruft die Callbacks also. Alles außer dem Konflikt meldet weiterhin
 * die Inline-Zeile unter dem Formular (`updateMutation.error`) — ein Toast
 * wäre ein zweiter Kanal für dieselbe Sache.
 */
function submit(vars: Parameters<typeof updateMutation.mutate>[0]) {
  updateMutation.mutate(vars, {
    onSuccess: goBackOrToTasks,
    onError: (err: unknown) => {
      if (err instanceof TaskConflictError) showConflict(err, vars);
    },
  });
}

/**
 * Öffnet den Vergleich — oder speichert stillschweigend durch.
 *
 * Weicht inhaltlich nichts ab, gibt es nichts zu entscheiden: Jemand hat
 * dasselbe geändert, oder ein Feld, das dieser Nutzer gar nicht angefasst
 * hat. Ein Dialog wäre dann nur im Weg (ADR-031).
 *
 * Der Wiederholungsversuch nimmt die **frische** Version der fremden Fassung
 * als Basis — kein `force`-Flag, kein Bypass.
 */
function showConflict(err: TaskConflictError, vars: Parameters<typeof updateMutation.mutate>[0]) {
  const theirs = err.row;
  const fields = differingTaskFields(theirs, vars.changes);
  if (fields.length === 0) {
    submit({ ...vars, baseVersion: theirs.updated_at });
    return;
  }

  conflict.show({
    title: t("conflict.title"),
    body: t("conflict.body.task"),
    rows: fields.map((field) => ({
      label: t(FIELD_LABEL_KEY[field]),
      theirs: `${t("conflict.theirs")}: ${formatTaskField(field, theirs)}`,
      mine: `${t("conflict.mine")}: ${formatTaskField(field, vars.changes)}`,
    })),
    keepMineLabel: t("conflict.keepMine"),
    keepTheirsLabel: t("conflict.keepTheirs"),
    onKeepMine: () => {
      submit({ ...vars, baseVersion: theirs.updated_at });
    },
  });
}

/**
 * Ein Feldwert, wie er im Vergleich lesbar ist.
 *
 * Kind und Aufgabentyp sind Fremdschlüssel — verglichen wird auf der Id
 * (`differingTaskFields`), angezeigt der Name aus den Listen, die die
 * Formular-Picker ohnehin schon halten. `due_date` bleibt als `YYYY-MM-DD`
 * stehen: unmissverständlich, und dieser Screen zieht sonst kein date-fns
 * herein.
 */
function formatTaskField(field: TaskConflictField, source: TaskFieldSource): string {
  switch (field) {
    case "child_id":
      return (
        childOptions.find((option) => option.id === source.child_id)?.name ?? t("hw.form.noChild")
      );
    case "type_id":
      return typeItems.find((item) => item.id === source.type_id)?.label ?? "—";
    case "due_time":
      return source.due_time?.slice(0, 5) || "—";
    case "due_date":
      return source.due_date || "—";
    case "title":
      return source.title?.trim() || "—";
    case "subject":
      return source.subject?.trim() || "—";
    case "description":
      return source.description?.trim() || "—";
  }
}
```

**Reihenfolge beachten:** `formatTaskField` liest `childOptions` und `typeItems`, die
aus `useTaskFormOptions(types.data, children)` stammen — die Deklaration muss
also **nach** jenem Aufruf stehen. Als Funktionsdeklaration (nicht `const`) ist
sie ohnehin gehoisted; der Aufruf passiert erst im Handler.

- [ ] **Step 4: Typecheck, Lint, Tests**

```bash
bun run typecheck && bun lint && bun test
```

Erwartet: grün. Falls `Parameters<typeof updateMutation.mutate>[0]` sich nicht
sauber auflöst, stattdessen `UpdateTaskVars` direkt importieren:
`import type { UpdateTaskVars } from "@/features/tasks";`

- [ ] **Step 5: Commit**

```bash
git add app-sections/task/TaskEditScreen.tsx
git commit -m "feat(tasks): Vergleichs-Dialog beim Bearbeiten

Derselbe Wirt wie im Kalender statt eines zweiten Dialogs, der dasselbe tut.
Alles außer dem Konflikt meldet weiterhin die Inline-Zeile unter dem Formular
— dieser Screen bleibt bis zum Erfolg montiert und hat keinen Toast.

Kind und Aufgabentyp werden für die Anzeige aus den Listen aufgelöst, die die
Formular-Picker ohnehin halten; verglichen wird auf der Id."
```

---

## Task 10: Löschen — „Trotzdem löschen" im Toast

**Files:**

- Modify: `app-sections/shared/useUndoableDelete.ts`
- Modify: `app-sections/event/EventDetailScreen.tsx`

**Interfaces:**

- Consumes: `EventConflictError` (Task 3), `occurrenceVersion` (Task 2), `DeleteEventVars.baseVersion` (Task 4)
- Produces: `UndoableDeleteArgs.errorAction?: (err: unknown) => ToastAction | undefined`

- [ ] **Step 1: `useUndoableDelete` um eine optionale Aktion erweitern**

In `UndoableDeleteArgs`:

```ts
  /**
   * Optionale Aktion am Fehler-Toast, abhängig davon, *woran* es scheiterte.
   *
   * Bewusst eine Funktion über den Fehler und nicht ein fertiges `ToastAction`:
   * „Trotzdem löschen" ergibt nur bei einem Konflikt Sinn, nicht bei einem
   * Netzwerkfehler — und der Aufrufer ist der einzige, der den Fehler
   * klassifizieren kann. `undefined` heißt: dieser Fehler bekommt keine Aktion,
   * der Toast bleibt wie bisher.
   */
  errorAction?: (err: unknown) => ToastAction | undefined;
```

Import ergänzen:

```ts
import { useToast, type ToastAction } from "./toastStore";
```

Im `catch`-Block:

```ts
        } catch (err) {
          // Kein `Alert`: der Nutzer steht längst auf einem anderen Screen, und
          // ein Dialog fünf Sekunden später wäre ein Überfall. Fehler-Toasts
          // laufen nie ab und tragen ihr ✕ (Decision 12 der Spec).
          show({
            title: args.errorTitle,
            message: args.formatError(err),
            variant: "error",
            position: "bottom",
            action: args.errorAction?.(err),
          });
        }
```

- [ ] **Step 2: `EventDetailScreen` verdrahten**

Imports ergänzen:

```ts
import {
  // … bestehende …
  EventConflictError,
  occurrenceVersion,
} from "@/features/calendar";
```

Im `undoableDelete({ … })`-Aufruf, nach `formatError`:

```tsx
              // „Trotzdem löschen" statt eines Dialogs: Seit ADR-026 läuft das
              // Löschen fünf Sekunden verzögert, der Nutzer ist längst auf
              // einem anderen Screen und hat den Termin nicht mehr vor sich —
              // ein Feldvergleich hätte dort nichts zu vergleichen (ADR-031).
              // Die frische Basis-Version kommt aus der Fassung, die der
              // Fehler mitträgt; ein Bypass ist damit nicht nötig.
              errorAction: (err) => {
                if (!(err instanceof EventConflictError) || !err.row) return undefined;
                const fresh = occurrenceVersion(err.row, data.occurrenceDate);
                return {
                  label: t("conflict.deleteAnyway"),
                  onPress: () => {
                    void deleteMutation.mutateAsync({
                      scope,
                      eventId: data.eventId,
                      occurrenceDate: data.occurrenceDate,
                      isRecurring,
                      baseVersion: fresh,
                    });
                  },
                };
              },
```

**Prüfen:** Sind `scope` und `isRecurring` an dieser Stelle in Scope? (Im vorhandenen Code werden sie im `run`-Callback benutzt, sollten also verfügbar sein — falls nicht, die umgebende Funktion daraufhin lesen.)

- [ ] **Step 3: `baseVersion` im `run`-Callback prüfen**

Aus Task 4, Step 7 sollte dort bereits `baseVersion: data.version,` stehen.

```bash
grep -n "baseVersion" app-sections/event/EventDetailScreen.tsx
```

Erwartet: zwei Treffer.

- [ ] **Step 4: Typecheck, Lint, Tests**

```bash
bun run typecheck && bun lint && bun test
```

Erwartet: grün.

- [ ] **Step 5: Commit**

```bash
git add app-sections/shared/useUndoableDelete.ts app-sections/event/EventDetailScreen.tsx
git commit -m "feat(calendar): Konflikt beim Löschen meldet sich als Toast

Kein Dialog: Seit ADR-026 läuft das Löschen fünf Sekunden verzögert, der
Nutzer ist dann auf einem anderen Screen und hat den Termin nicht mehr vor
sich — ein Feldvergleich hätte nichts zu vergleichen.

errorAction ist eine Funktion über den Fehler, nicht ein fertiges ToastAction:
'Trotzdem löschen' ergibt nur bei einem Konflikt Sinn, nicht bei einem
Netzwerkfehler."
```

---

## Task 11: Zwei-Client-Verifikation

**Files:**

- Create: `docs/superpowers/plans/2026-09-04-conflict-detection-verification.md` (Bericht)

**Interfaces:**

- Consumes: alles aus Task 1–10
- Produces: den Befundbericht, den Task 12 in den ADR zusammenfasst

- [ ] **Step 1: Web-Loop starten**

```bash
bun run web
```

Läuft auf `http://localhost:8081`. Im Hintergrund laufen lassen.

- [ ] **Step 2: Zwei persistente Browser-Kontexte öffnen**

Python-Playwright unter `/opt/homebrew/opt/python@3.14/bin/python3.14` (das Node-Modul gibt es in diesem Repo **nicht**). Zwei getrennte User-Data-Dirs im Scratchpad, damit die Sitzungen unabhängig sind:

```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    a = p.chromium.launch_persistent_context("<scratchpad>/ctx-a", headless=False)
    b = p.chromium.launch_persistent_context("<scratchpad>/ctx-b", headless=False)
    a.pages[0].goto("http://localhost:8081")
    b.pages[0].goto("http://localhost:8081")
    input("Bitte in beiden Fenstern anmelden, dann Enter…")
```

**Passwort nicht erfragen** — der Entwickler meldet sich selbst an; die Sitzung überlebt weitere Läufe.

**Theme-Falle:** `design-system/themeStore.ts` hat kein `persist`. Jedes `page.goto()` ist ein voller Reload und setzt das Theme auf `light` zurück. Für Dark-Screenshots **innerhalb** der SPA klicken, nie navigieren. Zwei identische Screenshots hintereinander sind genau dieses Symptom — Hashes vergleichen, nicht Dateigrößen.

- [ ] **Step 3: Das Protokoll fahren**

| #   | Schritt                                                         | Erwartung                                                               |
| --- | --------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1   | A und B öffnen denselben Termin im Bearbeiten-Sheet             | beide zeigen dieselbe Fassung                                           |
| 2   | B ändert den Titel und speichert                                | A sieht die Änderung live im Kalender hinter dem Sheet (prüft #51 nach) |
| 3   | A ändert den Titel abweichend und speichert                     | Konflikt-Dialog in A, **eine** Zeile „Titel"                            |
| 4   | A wählt „Deine Fassung speichern"                               | B aktualisiert sich innerhalb des 300-ms-Sammelfensters                 |
| 5   | Wiederholung, A wählt „Andere Fassung behalten"                 | A behält Bs Fassung, kein Schreibvorgang                                |
| 6   | B ändert den **Ort**, A ändert den **Titel**                    | **kein Dialog** — A speichert durch                                     |
| 7   | A plant eine Löschung, B ändert innerhalb des 5-s-Undo-Fensters | Fehler-Toast in A mit „Trotzdem löschen"                                |
| 8   | Schritte 1–6 auf einer Aufgabe                                  | gleiches Verhalten                                                      |

Schritt 6 ist der wichtigste: Er prüft, dass der Mechanismus **nicht** anschlägt, wo er nicht soll. Screenshot je Schritt.

- [ ] **Step 4: Bericht schreiben**

`docs/superpowers/plans/2026-09-04-conflict-detection-verification.md`: pro Schritt eine Zeile — erwartet / beobachtet / Screenshot-Pfad. Abweichungen **wörtlich** festhalten, nicht glätten; sie gehen in Task 12 als Consequences in den ADR.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-09-04-conflict-detection-verification.md
git commit -m "test(conflict): Zwei-Client-Verifikation im Web-Loop"
```

---

## Task 12: Dokumentation

**Files:**

- Modify: `docs/decision-log.md` (ADR-031 **anhängen**, ältere ADRs nie umschreiben)
- Modify: `CLAUDE.md`
- Modify: `docs/TODO.md`

- [ ] **Step 1: ADR-031 anhängen**

Ans Ende von `docs/decision-log.md`, in der Hausform (Status / Context / Decisions / Consequences). Verweis: „Ergänzt [ADR-030]; löst nichts ab. Dritte und letzte der drei Realtime-Iterationen (#50 → #51 → **#52**)."

Die elf Decisions aus §10 der Spec, plus die Befunde aus Task 11. Diese Consequences dürfen nicht fehlen:

- Die COPY.md-Freigabe vom 2026-09-03 (ein Diff-Leser sucht sie hier).
- Dass `updated_at` vor dieser Iteration auf **allen** Tabellen tot war und nur drei davon belebt wurden.
- Dass `applyOverride` in `expand.ts` `description` nicht zurückliest — die fremde Fassung zeigt bei Scope „nur diesen" immer die Master-Beschreibung.
- Die Lücke bei einer per Override auf einen anderen Tag verschobenen Occurrence.
- Dass `useUpdateTask` keine eigene Testsuite hat und sein CAS-Pfad allein über den Zwei-Client-Lauf belegt ist.

- [ ] **Step 2: CLAUDE.md**

In der Ordnerübersicht ergänzen:

- unter `features/calendar/`: `· version.ts (Versions-Token) · conflict.ts (Feldvergleich)`
- unter `features/tasks/`: `· conflict.ts`
- unter `app-sections/shared/`: `· ConflictDialog · conflictStore` in die Klammerliste
- in der `app/_layout.tsx`-Zeile: `+ <ConflictDialogHost />`

Im Tech-Stack-Absatz zu Realtime den Schlusssatz ergänzen: Conflict-Detection steht seit ADR-031 (Issue #52), damit sind die drei Realtime-Iterationen abgeschlossen.

- [ ] **Step 3: `docs/TODO.md`**

**Entfernen** (Zeile ~86, der Eintrag beginnt mit „Zwei Eltern, die zeitgleich verschiedene Felder derselben Aufgabe ändern, überschreiben sich gegenseitig") — genau diese Iteration löst ihn. Die Zeile **löschen**, nicht abhaken.

**Anhängen** unter einem neuen Abschnitt „## Conflict-Detection (siehe ADR-031)":

- `families`, `parents` und `children` tragen dasselbe tote `updated_at` wie `events` es vor dieser Iteration tat — kein Trigger stempelt sie. Kein Schreibpfad braucht sie heute; fällig, sobald einer dieser Tabellen ein Formular bekommt, das zwei Personen gleichzeitig offen haben können.
- Eine per Override auf einen anderen Tag verschobene Occurrence: `occurrenceVersion` schlüsselt auf das aufgelöste Datum, `expand.ts` löst den Inhalt über das regelerzeugte auf. Eine fremde Änderung an der inhaltsgebenden Exception wird dort übersehen. Vorbestehende Eigenheit — `modifyOccurrence` schreibt in dem Fall ohnehin eine zweite Exception-Zeile —, hier nur erstmals benannt.
- `applyOverride` in `features/calendar/expand.ts` liest `description` nicht zurück, obwohl `modifyOccurrence` es schreibt. Betrifft den Konflikt-Vergleich direkt: Bei Scope „nur diesen" zeigt die fremde Fassung immer die Master-Beschreibung, eine Abweichung in der Notiz bleibt also unsichtbar.
- `useUpdateTask` hat keine eigene Testsuite — der Hook spricht direkt mit Supabase, es gibt keine injizierbaren Deps wie im Kalender (`fetchMaster` + `ops`). Sein Compare-and-Swap ist allein über den Zwei-Client-Lauf belegt. Ein Test bräuchte denselben Deps-Schnitt wie `updateEvent`.

- [ ] **Step 4: Format, Lint, Tests**

```bash
bun format && bun run typecheck && bun lint && bun test
```

- [ ] **Step 5: Commit**

```bash
git add docs CLAUDE.md
git commit -m "docs: ADR-031 zur Conflict-Detection, CLAUDE.md und TODO nachziehen

Der TODO-Eintrag zu gleichzeitigen Aufgaben-Edits entfällt — diese Iteration
löst ihn. Vier neue Einträge halten fest, was sie bewusst offen lässt."
```

- [ ] **Step 6: Lokaler CodeRabbit-Lauf**

```bash
coderabbit review --base main --agent
```

Findings abarbeiten oder mit Begründung verwerfen. Rate-Limit: ~3 Reviews/Stunde, nicht im Kreis laufen lassen.

- [ ] **Step 7: Push und PR**

```bash
git push -u origin feat/conflict-detection
gh pr create --fill
```
