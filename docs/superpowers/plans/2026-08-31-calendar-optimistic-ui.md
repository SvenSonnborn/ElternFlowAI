# Optimistische Kalender-Updates — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein angelegter oder geänderter Termin steht sofort im Kalender — bevor der Server geantwortet hat —, und verschwindet mit einer Retry-Möglichkeit wieder, falls das Speichern fehlschlägt.

**Architecture:** Ein kalender-eigener Zustand-Store hält die optimistischen Änderungen als Occurrence-Overlay. `useFamilyEvents` legt es zwischen `expandEvents` und `withoutPendingDeletes`. Die Mutations-Hooks führen es über `onMutate`/`onError`/`onSettled`. Gepatcht wird die **Anzeige**, nicht die Speicherung: Ein Create trägt eine synthetische Master-Zeile, die durch dasselbe `expandEvents` läuft wie die echten.

**Tech Stack:** Zustand · TanStack Query · date-fns · react-i18next · `bun test`

**Spec:** [docs/superpowers/specs/2026-08-31-calendar-optimistic-ui-design.md](../specs/2026-08-31-calendar-optimistic-ui-design.md) — der Plan argumentiert aus der Spec; beide gehören zusammen gelesen.

**Branch:** `feat/calendar-optimistic-ui`

## Global Constraints

Gelten für **jede** Task, ohne dort wiederholt zu werden:

- **Sprache:** Alle UI-Strings aus `features/i18n/locales/{de,en}.json`. DE kanonisch, EN spiegelt. **Immer Du, nie Sie.** Nie ein String im JSX.
- **Handoff-Bundle ist tabu:** `design-system/{colors,typography,spacing,themes,components,index}.ts`, `docs/{HANDOFF,COPY,ICONS,README}.md`, `patterns/*.md`.
- **Abhängigkeitsrichtung:** `features/*` importiert **nie** aus `app-sections/*`.
- **Docstrings:** Jede neue oder umgeschriebene exportierte Funktion, jeder Hook, jedes neue Modul bekommt einen JSDoc-Block im selben Commit. Inhalt ist das Nicht-Offensichtliche — was der Name schon sagt, ist Füllmaterial.
- **`useDeleteEvent` wird nicht angefasst.** Das Ziel ist dort seit [ADR-026](../../decision-log.md) auf anderem Weg erreicht (Decision 2 der Spec).
- **Kommentare und Doku auf Deutsch**, passend zum Bestand der berührten Datei.
- **Commits:** Conventional-Commits-Präfix mit Scope. **Niemals** ein `Co-Authored-By: Claude`-Trailer. **Niemals** `--no-verify`.
- **Vor jedem Commit grün:** `bun run typecheck` und `bun lint`.

Werte, die mehrfach vorkommen und exakt stimmen müssen:

| Wert                                                                | Bedeutung                                       |
| ------------------------------------------------------------------- | ----------------------------------------------- |
| `EditScope = "this" \| "forward" \| "all"`                          | aus `features/calendar/recurrence.ts`           |
| `EventChanges = { title, start_at, end_at, location, description }` | ebenda; `start_at`/`end_at` sind ISO-Strings    |
| Reihenfolge `withOptimistic` → `withoutPendingDeletes`              | Löschung gewinnt gegen Bearbeitung (Decision 9) |

---

## Dateiübersicht

**Neu**

| Datei                                        | Verantwortung                                               |
| -------------------------------------------- | ----------------------------------------------------------- |
| `features/calendar/optimisticEvents.ts`      | Store, Scope-Prädikat, Patch-Anwendung, Overlay-Komposition |
| `features/calendar/optimisticEvents.test.ts` | die reinen Funktionen                                       |

**Geändert**

`features/calendar/{hooks,createMutation,mutations,index}.ts` · `app-sections/event/{EventCreateScreen,EventEditScreen}.tsx` · `features/i18n/locales/{de,en}.json` · `docs/{decision-log,TODO}.md` · `CLAUDE.md`

---

## Task 1: Scope-Prädikat und Patch-Anwendung

**Files:**

- Create: `features/calendar/optimisticEvents.ts`
- Test: `features/calendar/optimisticEvents.test.ts`

**Interfaces:**

- Consumes: `EditScope`, `EventChanges` aus `./recurrence`; `CalendarOccurrence` aus `./types`
- Produces:
  - `patchesOccurrence(entry: { eventId: string; occurrenceDate: string; scope: EditScope }, occurrence: { eventId: string; occurrenceDate: string }): boolean`
  - `applyOptimisticChanges(occurrence: CalendarOccurrence, scope: EditScope, changes: EventChanges): CalendarOccurrence`

Das ist der inhaltliche Kern des ganzen Features. Vier Kombinationen aus Scope und `isRecurring` führen zu drei verschiedenen Verhalten; Abschnitt 2.3 der Spec begründet jedes.

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

`features/calendar/optimisticEvents.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import type { EventChanges } from "./recurrence";
import type { CalendarOccurrence } from "./types";

import { applyOptimisticChanges, patchesOccurrence } from "./optimisticEvents";

function occ(partial: Partial<CalendarOccurrence> = {}): CalendarOccurrence {
  return {
    eventId: "e1",
    occurrenceDate: "2026-09-10",
    startAt: new Date("2026-09-10T16:00:00"),
    endAt: new Date("2026-09-10T17:30:00"),
    title: "Fußballtraining",
    description: "Trikot einpacken",
    location: "Sportplatz",
    allDay: false,
    childId: null,
    parentId: null,
    isException: false,
    isRecurring: true,
    rrule: { freq: "weekly", interval: 1, byweekday: [3], count: null, until: null },
    type: {
      slug: "sport",
      color: "#000",
      iconName: "activity",
      labelDe: "Sport",
      labelEn: "Sport",
    },
    ...partial,
  };
}

function changes(partial: Partial<EventChanges> = {}): EventChanges {
  return {
    title: "Fußballtraining",
    start_at: new Date("2026-09-10T18:00:00").toISOString(),
    end_at: new Date("2026-09-10T19:30:00").toISOString(),
    location: "Sportplatz",
    description: "Trikot einpacken",
    ...partial,
  };
}

describe("patchesOccurrence", () => {
  const entry = { eventId: "e1", occurrenceDate: "2026-09-10", scope: "this" as const };

  test("`this` trifft genau diese Occurrence", () => {
    expect(patchesOccurrence(entry, { eventId: "e1", occurrenceDate: "2026-09-10" })).toBe(true);
    expect(patchesOccurrence(entry, { eventId: "e1", occurrenceDate: "2026-09-17" })).toBe(false);
  });

  test("`forward` schließt den Stichtag ein und lässt alles davor", () => {
    const fwd = { ...entry, scope: "forward" as const };
    expect(patchesOccurrence(fwd, { eventId: "e1", occurrenceDate: "2026-09-10" })).toBe(true);
    expect(patchesOccurrence(fwd, { eventId: "e1", occurrenceDate: "2026-09-17" })).toBe(true);
    expect(patchesOccurrence(fwd, { eventId: "e1", occurrenceDate: "2026-09-03" })).toBe(false);
  });

  test("`all` trifft jede Occurrence des Events", () => {
    const all = { ...entry, scope: "all" as const };
    expect(patchesOccurrence(all, { eventId: "e1", occurrenceDate: "2020-01-01" })).toBe(true);
    expect(patchesOccurrence(all, { eventId: "e1", occurrenceDate: "2030-12-31" })).toBe(true);
  });

  test("kein Scope greift auf ein fremdes Event über", () => {
    for (const scope of ["this", "forward", "all"] as const) {
      expect(
        patchesOccurrence({ ...entry, scope }, { eventId: "e2", occurrenceDate: "2026-09-10" }),
      ).toBe(false);
    }
  });
});

describe("applyOptimisticChanges · Serie mit Scope `all`", () => {
  test("verschiebt die Tageszeit und behält das Datum jeder Occurrence", () => {
    // Die naheliegende Fehlimplementierung schreibt `changes.start_at` stumpf in
    // jede Occurrence — dann zöge sich die ganze Serie auf einen Tag zusammen.
    const later = occ({
      occurrenceDate: "2026-09-17",
      startAt: new Date("2026-09-17T16:00:00"),
      endAt: new Date("2026-09-17T17:30:00"),
    });
    const out = applyOptimisticChanges(later, "all", changes());
    expect(out.occurrenceDate).toBe("2026-09-17");
    expect(out.startAt.getHours()).toBe(18);
    expect(out.startAt.getDate()).toBe(17);
  });

  test("erhält die Dauer", () => {
    const out = applyOptimisticChanges(occ(), "all", changes());
    expect(out.endAt.getTime() - out.startAt.getTime()).toBe(90 * 60 * 1000);
  });

  test("patcht auch die Beschreibung — der Server schreibt sie auf den Master", () => {
    const out = applyOptimisticChanges(occ(), "all", changes({ description: "Neue Notiz" }));
    expect(out.description).toBe("Neue Notiz");
  });
});

describe("applyOptimisticChanges · Serie mit Scope `this`", () => {
  test("übernimmt die Literalzeiten der Exception", () => {
    const out = applyOptimisticChanges(occ(), "this", changes());
    expect(out.startAt.getHours()).toBe(18);
    expect(out.isException).toBe(true);
  });

  test("lässt die Beschreibung stehen, obwohl der Server sie schreibt", () => {
    // `expandEvents` liest `description` immer von der Master-Zeile, auch bei
    // einer `modified`-Exception — `applyOverride` kennt das Feld nicht. Ein
    // Patch, der sie zeigte, nähme der Refetch eine Sekunde später wieder weg:
    // genau das Flackern, das dieses Feature abstellen soll.
    const out = applyOptimisticChanges(
      occ(),
      "this",
      changes({ title: "Neuer Titel", description: "Neue Notiz" }),
    );
    expect(out.title).toBe("Neuer Titel");
    expect(out.description).toBe("Trikot einpacken");
  });
});

describe("applyOptimisticChanges · Einzeltermin", () => {
  const single = occ({
    isRecurring: false,
    rrule: { freq: null, interval: 1, byweekday: null, count: null, until: null },
  });

  test("verschiebt sich auf ein neues Datum, statt auf dem alten zu bleiben", () => {
    // Beim Einzeltermin ändert `scope: "this"` die Master-Zeile; eine
    // Datumsänderung im Formular verschiebt den Termin also wirklich.
    const moved = changes({
      start_at: new Date("2026-09-24T18:00:00").toISOString(),
      end_at: new Date("2026-09-24T19:30:00").toISOString(),
    });
    const out = applyOptimisticChanges(single, "this", moved);
    expect(out.occurrenceDate).toBe("2026-09-24");
    expect(out.startAt.getDate()).toBe(24);
  });

  test("patcht die Beschreibung — es gibt keine Exception", () => {
    const out = applyOptimisticChanges(single, "this", changes({ description: "Neue Notiz" }));
    expect(out.description).toBe("Neue Notiz");
  });
});
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `bun test features/calendar/optimisticEvents.test.ts`
Expected: FAIL — `Cannot find module './optimisticEvents'`

- [ ] **Step 3: Implementieren**

`features/calendar/optimisticEvents.ts`:

```ts
import { format } from "date-fns";

import type { EditScope, EventChanges } from "./recurrence";
import type { CalendarOccurrence } from "./types";

/**
 * Das Occurrence-Overlay für optimistische Kalender-Änderungen.
 *
 * Es modelliert die **Anzeige**, nicht die Speicherung: Der Cache hält
 * Master-Zeilen, die UI zeigt Occurrences, und dazwischen liegt `expandEvents`.
 * Ein Patch auf Master-Ebene müsste `applyEditScope` im Client nachbauen —
 * inklusive der Serien-Aufspaltung bei `forward` —, und genau das hat
 * [ADR-026](../../docs/decision-log.md) für das Löschen bereits verworfen.
 *
 * Was hier steht, ist deshalb bewusst eine **Näherung** (Decision 3 der Spec):
 * Sie muss gut aussehen, nicht exakt sein — der Refetch korrigiert sie
 * innerhalb einer Sekunde.
 */

/**
 * Ob dieser Update-Eintrag die gegebene Occurrence betrifft.
 *
 * Dieselben drei Scopes wie `hidesOccurrence` in [pendingDeletes.ts](./pendingDeletes.ts),
 * und aus demselben Grund derselbe String-Vergleich: `YYYY-MM-DD` ist
 * lexikographisch chronologisch, ein `Date` wäre hier nur eine Zeitzonenfalle.
 * `forward` schließt den Stichtag **ein** — geändert wird „ab diesem Termin".
 */
export function patchesOccurrence(
  entry: { eventId: string; occurrenceDate: string; scope: EditScope },
  occurrence: { eventId: string; occurrenceDate: string },
): boolean {
  if (entry.eventId !== occurrence.eventId) return false;
  switch (entry.scope) {
    case "this":
      return entry.occurrenceDate === occurrence.occurrenceDate;
    case "forward":
      return occurrence.occurrenceDate >= entry.occurrenceDate;
    case "all":
      return true;
  }
}

/** Nimmt das Datum von `day` und die Uhrzeit von `time`. */
function withTimeOfDay(day: Date, time: Date): Date {
  const out = new Date(day);
  out.setHours(time.getHours(), time.getMinutes(), time.getSeconds(), time.getMilliseconds());
  return out;
}

/**
 * Wendet eine Änderung auf eine Occurrence an — so, wie `expandEvents` sie nach
 * dem Refetch **anzeigen** wird, nicht wie der Server sie schreibt.
 *
 * Zwei Unterscheidungen tragen die Funktion:
 *
 * 1. **Literale Zeiten oder neu verankerte?** Trifft die Änderung die
 *    Master-Zeile *einer Serie* (`all`, `forward`), schreibt der Server dort
 *    `start_at`/`end_at`, und `expandEvents` trägt deren **Tageszeit** in jede
 *    Occurrence, während jede ihr eigenes Datum behält. Ein stumpfes Übernehmen
 *    zöge die Serie auf einen Tag zusammen. Beim Einzeltermin und bei einer
 *    Exception (`this` auf einer Serie) gelten dagegen die Literalwerte — dort
 *    verschiebt eine Datumsänderung den Termin tatsächlich.
 * 2. **Überlebt `description` den Weg?** Nein, wenn eine Exception geschrieben
 *    wird: `expandEvents` liest das Feld **immer** von der Master-Zeile, und
 *    `applyOverride` kennt es nicht. Der Server legt eine geänderte Beschreibung
 *    zwar ins Override-JSON, die Anzeige übernimmt sie nie. Sie hier zu zeigen
 *    hieße, sie eine Sekunde später vom Refetch wegnehmen zu lassen — genau das
 *    Flackern, gegen das dieses Feature antritt.
 */
export function applyOptimisticChanges(
  occurrence: CalendarOccurrence,
  scope: EditScope,
  changes: EventChanges,
): CalendarOccurrence {
  const newStart = new Date(changes.start_at);
  const newEnd = new Date(changes.end_at);

  const viaException = occurrence.isRecurring && scope === "this";
  const literalTimes = !occurrence.isRecurring || viaException;

  const startAt = literalTimes ? newStart : withTimeOfDay(occurrence.startAt, newStart);
  const endAt = literalTimes
    ? newEnd
    : new Date(startAt.getTime() + (newEnd.getTime() - newStart.getTime()));

  return {
    ...occurrence,
    title: changes.title,
    location: changes.location,
    description: viaException ? occurrence.description : changes.description,
    startAt,
    endAt,
    // `expandEvents` leitet das Datum aus dem aufgelösten Start ab, nicht aus
    // der Regel — eine verschobene Occurrence wandert also mit.
    occurrenceDate: format(startAt, "yyyy-MM-dd"),
    isException: viaException ? true : occurrence.isException,
  };
}
```

- [ ] **Step 4: Test laufen lassen und grün sehen**

Run: `bun test features/calendar/optimisticEvents.test.ts`
Expected: PASS, 11 Tests

- [ ] **Step 5: Typecheck, Lint, Commit**

```bash
bun run typecheck && bun lint
git add features/calendar/optimisticEvents.ts features/calendar/optimisticEvents.test.ts
git commit -m "feat(calendar): Patch-Logik für optimistische Termin-Änderungen"
```

---

## Task 2: Store und Overlay-Komposition

**Files:**

- Modify: `features/calendar/optimisticEvents.ts`
- Modify: `features/calendar/optimisticEvents.test.ts`
- Modify: `features/calendar/index.ts`

**Interfaces:**

- Consumes: `patchesOccurrence`, `applyOptimisticChanges` (Task 1); `EventWithRelations` aus `./expand`
- Produces:
  - `type OptimisticCreate = { kind: "create"; row: EventWithRelations }`
  - `type OptimisticUpdate = { kind: "update"; eventId: string; occurrenceDate: string; scope: EditScope; changes: EventChanges }`
  - `type OptimisticEvent = ({ id: string } & OptimisticCreate) | ({ id: string } & OptimisticUpdate)`
  - `useOptimisticEventsStore` — Zustand-Store mit `entries`, `add(payload) => string`, `remove(id) => void`
  - `useOptimisticEvents(): OptimisticEvent[]`
  - `withOptimistic(occurrences: CalendarOccurrence[], entries: readonly OptimisticEvent[], expand: (rows: EventWithRelations[]) => CalendarOccurrence[]): CalendarOccurrence[]`

- [ ] **Step 1: Den fehlschlagenden Test anhängen**

An `features/calendar/optimisticEvents.test.ts` anhängen (die `occ`/`changes`-Fabriken aus Task 1 bleiben und werden mitbenutzt); ergänze den Import um `useOptimisticEventsStore` und `withOptimistic`:

```ts
/** Eine minimale Master-Zeile in der Form, die `fetchEventsInRange` liefert. */
function row(partial: Partial<EventWithRelations> = {}): EventWithRelations {
  return {
    id: "e9",
    family_id: "f1",
    type_id: "t1",
    child_id: null,
    parent_id: null,
    title: "Elternabend",
    description: null,
    location: null,
    start_at: new Date("2026-10-01T19:00:00").toISOString(),
    end_at: new Date("2026-10-01T20:30:00").toISOString(),
    all_day: false,
    rrule_freq: "weekly",
    rrule_interval: 1,
    rrule_byweekday: [3],
    rrule_count: 2,
    rrule_until: null,
    created_by: null,
    created_at: new Date("2026-09-01T00:00:00").toISOString(),
    updated_at: new Date("2026-09-01T00:00:00").toISOString(),
    event_types: null,
    event_exceptions: [],
    ...partial,
  };
}

/**
 * Ein Stub statt des echten `expandEvents`: Diese Tests prüfen, dass die
 * synthetische Zeile **durch** den Expander geht — nicht, was er daraus macht.
 * Der Test darunter benutzt dafür den echten.
 */
function expandStub(rows: EventWithRelations[]): CalendarOccurrence[] {
  return rows.flatMap((r) => [
    occ({ eventId: r.id, occurrenceDate: "2026-10-01" }),
    occ({ eventId: r.id, occurrenceDate: "2026-10-08" }),
  ]);
}

describe("withOptimistic", () => {
  test("gibt bei leerer Liste dieselbe Referenz zurück", () => {
    const input = [occ()];
    expect(withOptimistic(input, [], expandStub)).toBe(input);
  });

  test("patcht eine betroffene Occurrence und lässt die übrigen unberührt", () => {
    const a = occ({ occurrenceDate: "2026-09-10" });
    const b = occ({ eventId: "e2", occurrenceDate: "2026-09-10" });
    const out = withOptimistic(
      [a, b],
      [
        {
          id: "o1",
          kind: "update",
          eventId: "e1",
          occurrenceDate: "2026-09-10",
          scope: "this",
          changes: changes({ title: "Geändert" }),
        },
      ],
      expandStub,
    );
    expect(out[0].title).toBe("Geändert");
    expect(out[1]).toBe(b);
  });

  test("schickt eine Create-Zeile durch den Expander", () => {
    const out = withOptimistic([], [{ id: "o1", kind: "create", row: row() }], expandStub);
    expect(out).toHaveLength(2);
    expect(out.map((o) => o.occurrenceDate)).toEqual(["2026-10-01", "2026-10-08"]);
  });

  test("mehrere Update-Einträge wirken kumulativ", () => {
    const out = withOptimistic(
      [occ()],
      [
        {
          id: "o1",
          kind: "update",
          eventId: "e1",
          occurrenceDate: "2026-09-10",
          scope: "all",
          changes: changes({ title: "Erst" }),
        },
        {
          id: "o2",
          kind: "update",
          eventId: "e1",
          occurrenceDate: "2026-09-10",
          scope: "all",
          changes: changes({ title: "Dann", location: "Halle" }),
        },
      ],
      expandStub,
    );
    expect(out[0].title).toBe("Dann");
    expect(out[0].location).toBe("Halle");
  });
});

describe("withOptimistic mit dem echten expandEvents", () => {
  const theme = lightTheme;

  test("ein neu angelegter Serientermin erscheint mit allen Occurrences im Fenster", () => {
    // Trüge der Eintrag eine fertige Occurrence, erschiene die Serie nur mit
    // ihrer ersten, und der Rest poppte beim Refetch nach — genau das Flackern,
    // gegen das dieses Feature antritt.
    const start = new Date("2026-09-25T00:00:00");
    const end = new Date("2026-10-31T00:00:00");
    const out = withOptimistic([], [{ id: "o1", kind: "create", row: row() }], (rows) =>
      expandEvents(rows, start, end, theme),
    );
    // rrule_count: 2 → zwei wöchentliche Termine ab dem 01.10.
    expect(out.map((o) => o.occurrenceDate)).toEqual(["2026-10-01", "2026-10-08"]);
  });

  test("ein Termin außerhalb des Fensters erscheint nicht", () => {
    // Die Range-Grenze fällt aus `expandEvents` ab; der Test hält sie fest,
    // damit eine spätere Umstellung sie nicht verliert.
    const start = new Date("2026-11-01T00:00:00");
    const end = new Date("2026-11-30T00:00:00");
    const out = withOptimistic([], [{ id: "o1", kind: "create", row: row() }], (rows) =>
      expandEvents(rows, start, end, theme),
    );
    expect(out).toHaveLength(0);
  });
});

describe("Reihenfolge der beiden Overlays", () => {
  test("eine zugleich bearbeitete und gelöschte Occurrence ist weg", () => {
    // Erst patchen, dann filtern (Decision 9 der Spec). Andersherum bliebe der
    // gelöschte Termin sichtbar, weil der Patch ihn wieder einführte.
    const patched = withOptimistic(
      [occ()],
      [
        {
          id: "o1",
          kind: "update",
          eventId: "e1",
          occurrenceDate: "2026-09-10",
          scope: "all",
          changes: changes({ title: "Geändert" }),
        },
      ],
      expandStub,
    );
    expect(patched).toHaveLength(1);
    const out = withoutPendingDeletes(patched, [
      { eventId: "e1", occurrenceDate: "2026-09-10", scope: "all" },
    ]);
    expect(out).toHaveLength(0);
  });
});

describe("useOptimisticEventsStore", () => {
  test("add gibt eine Id zurück, remove nimmt den Eintrag wieder heraus", () => {
    const store = () => useOptimisticEventsStore.getState();
    const id = store().add({
      kind: "update",
      eventId: "e1",
      occurrenceDate: "2026-09-10",
      scope: "all",
      changes: changes(),
    });
    expect(store().entries).toHaveLength(1);
    expect(store().entries[0]).toMatchObject({ id, kind: "update", eventId: "e1" });
    store().remove(id);
    expect(store().entries).toHaveLength(0);
  });

  test("zwei Einträge stören einander nicht", () => {
    const store = () => useOptimisticEventsStore.getState();
    const first = store().add({
      kind: "update",
      eventId: "e1",
      occurrenceDate: "2026-09-10",
      scope: "all",
      changes: changes(),
    });
    const second = store().add({
      kind: "update",
      eventId: "e2",
      occurrenceDate: "2026-09-10",
      scope: "all",
      changes: changes(),
    });
    expect(first).not.toBe(second);
    store().remove(first);
    expect(store().entries).toHaveLength(1);
    expect(store().entries[0].id).toBe(second);
    store().remove(second);
  });
});
```

Ergänze oben in der Datei die Imports, die diese Tests brauchen:

```ts
import { lightTheme } from "@/design-system";

import type { EventWithRelations } from "./expand";

import { expandEvents } from "./expand";
import { withoutPendingDeletes } from "./pendingDeletes";
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `bun test features/calendar/optimisticEvents.test.ts`
Expected: FAIL — `withOptimistic is not a function` bzw. `useOptimisticEventsStore is not exported`

- [ ] **Step 3: Store und Komposition ergänzen**

An `features/calendar/optimisticEvents.ts` anhängen:

```ts
import { useMemo } from "react";
import { create } from "zustand";

import type { EventWithRelations } from "./expand";

export interface OptimisticCreate {
  kind: "create";
  /**
   * Eine **synthetische** Master-Zeile in der Form, die `fetchEventsInRange`
   * liefert. Sie geht durch dasselbe `expandEvents` wie die echten Zeilen —
   * Wiederverwendung statt Nachbildung, und ein neu angelegter Serientermin
   * erscheint dadurch mit allen seinen Occurrences statt nur der ersten.
   */
  row: EventWithRelations;
}

export interface OptimisticUpdate {
  kind: "update";
  eventId: string;
  occurrenceDate: string;
  scope: EditScope;
  changes: EventChanges;
}

export type OptimisticEvent =
  ({ id: string } & OptimisticCreate) | ({ id: string } & OptimisticUpdate);

interface OptimisticEventsState {
  entries: OptimisticEvent[];
  /** Legt einen Eintrag an und gibt seine Id zurück — `onMutate` reicht sie als Kontext weiter. */
  add: (payload: OptimisticCreate | OptimisticUpdate) => string;
  remove: (id: string) => void;
}

// Laufende Nummer statt Zufalls-Id: Der Eintrag lebt Sekundenbruchteile, eine
// Kollision über einen App-Lauf hinweg gibt es nicht, und Tests bleiben lesbar.
let sequence = 0;

export const useOptimisticEventsStore = create<OptimisticEventsState>((set) => ({
  entries: [],
  add: (payload) => {
    sequence += 1;
    const id = `optimistic-${sequence}`;
    set((state) => ({ entries: [...state.entries, { id, ...payload }] }));
    return id;
  },
  remove: (id) => set((state) => ({ entries: state.entries.filter((entry) => entry.id !== id) })),
}));

/** Die offenen optimistischen Änderungen. Referenzstabil, solange sich nichts ändert. */
export function useOptimisticEvents(): OptimisticEvent[] {
  return useOptimisticEventsStore((state) => state.entries);
}

/**
 * Legt die optimistischen Änderungen auf den expandierten Occurrence-Strom.
 *
 * `expand` wird **injiziert** statt importiert: `expandEvents` braucht
 * `rangeStart`, `rangeEnd` und `theme`, die alle im Hook liegen. So bleibt diese
 * Funktion rein und ein Test kann sie mit einem Stub bedienen. Die Range-Grenze
 * für neu angelegte Termine fällt dabei gratis ab — `expandEvents` wendet sie
 * ohnehin an.
 *
 * Gibt bei leerer Liste die Eingabe **unverändert** zurück. Das spart im
 * Normalfall einen Durchlauf und eine Allokation; für die Referenzstabilität des
 * Aufrufers tut es nichts, denn der Aufruf steht innerhalb desselben `useMemo`.
 */
export function withOptimistic(
  occurrences: CalendarOccurrence[],
  entries: readonly OptimisticEvent[],
  expand: (rows: EventWithRelations[]) => CalendarOccurrence[],
): CalendarOccurrence[] {
  if (entries.length === 0) return occurrences;

  const updates = entries.filter(
    (entry): entry is { id: string } & OptimisticUpdate => entry.kind === "update",
  );
  const patched =
    updates.length === 0
      ? occurrences
      : occurrences.map((occurrence) => {
          let next = occurrence;
          for (const update of updates) {
            if (patchesOccurrence(update, next)) {
              next = applyOptimisticChanges(next, update.scope, update.changes);
            }
          }
          return next;
        });

  const created = entries
    .filter((entry): entry is { id: string } & OptimisticCreate => entry.kind === "create")
    .map((entry) => entry.row);
  if (created.length === 0) return patched;
  return [...patched, ...expand(created)];
}
```

Der `useMemo`-Import wird hier noch nicht gebraucht — lass ihn weg, wenn ESLint ihn als ungenutzt meldet.

- [ ] **Step 4: Test laufen lassen und grün sehen**

Run: `bun test features/calendar/optimisticEvents.test.ts`
Expected: PASS, 20 Tests

- [ ] **Step 5: Barrel erweitern**

`features/calendar/index.ts`, alphabetisch einsortiert:

```ts
export {
  applyOptimisticChanges,
  patchesOccurrence,
  useOptimisticEvents,
  useOptimisticEventsStore,
  withOptimistic,
  type OptimisticCreate,
  type OptimisticEvent,
  type OptimisticUpdate,
} from "./optimisticEvents";
```

- [ ] **Step 6: Typecheck, Lint, Commit**

```bash
bun run typecheck && bun lint
git add features/calendar/optimisticEvents.ts features/calendar/optimisticEvents.test.ts features/calendar/index.ts
git commit -m "feat(calendar): Store und Komposition für das Optimistic-Overlay"
```

---

## Task 3: Overlay in `useFamilyEvents` einhängen

**Files:**

- Modify: `features/calendar/hooks.ts`

**Interfaces:**

- Consumes: `useOptimisticEvents`, `withOptimistic` (Task 2)
- Produces: keine neue API — `useFamilyEvents` zeigt die optimistischen Änderungen mit

Keine neuen Tests: Die Logik ist in Task 1 und 2 abgedeckt, hier bleiben fünf Zeilen Verdrahtung. Absicherung ist der Bestand (`bun test features/calendar`) plus `typecheck`.

- [ ] **Step 1: Import ergänzen**

```ts
import { useOptimisticEvents, withOptimistic } from "./optimisticEvents";
```

- [ ] **Step 2: Den `data`-`useMemo` umbauen**

In `useFamilyEvents`, neben `const pending = usePendingEventDeletes();`:

```ts
const optimistic = useOptimisticEvents();
```

Und der `data`-`useMemo` wird zu:

```ts
const data = useMemo(() => {
  if (!query.data) return NO_OCCURRENCES;
  const expanded = expandEvents(query.data, rangeStart, rangeEnd, theme);
  // Erst patchen, dann filtern: Eine Löschung gewinnt gegen eine gleichzeitige
  // Bearbeitung (Decision 9 der Spec). Andersherum bliebe ein gelöschter
  // Termin sichtbar, weil der Patch ihn wieder einführte.
  const withOptimisticChanges = withOptimistic(expanded, optimistic, (rows) =>
    expandEvents(rows, rangeStart, rangeEnd, theme),
  );
  return withoutPendingDeletes(withOptimisticChanges, pending);
}, [query.data, rangeStart, rangeEnd, theme, optimistic, pending]);
```

- [ ] **Step 3: Den Docstring von `useFamilyEvents` nachziehen**

Er nennt heute nur den Undo-Filter. Ergänze einen Satz, dass die Menge zusätzlich **optimistische Änderungen** enthält, die der Server noch nicht bestätigt hat — inklusive Termine, deren Zeilen es serverseitig noch gar nicht gibt. Wer nur die Signatur liest, sieht das sonst nicht.

- [ ] **Step 4: Bestehende Kalender-Suites laufen lassen**

Run: `bun test features/calendar`
Expected: PASS. **Sei im Report präzise**, was dieser Lauf abdeckt: Er prüft die reinen Funktionen und die Expansion, **nicht** die Verdrahtung im Hook — dafür gibt es kein `renderHook` im Repo.

- [ ] **Step 5: Typecheck, Lint, Commit**

```bash
bun run typecheck && bun lint
git add features/calendar/hooks.ts
git commit -m "feat(calendar): optimistische Änderungen in useFamilyEvents auflegen"
```

---

## Task 4: `useCreateEvent` optimistisch

**Files:**

- Modify: `features/calendar/createMutation.ts`

**Interfaces:**

- Consumes: `useOptimisticEventsStore` (Task 2); `useEventTypes` aus `./hooks`; `EventWithRelations` aus `./expand`
- Produces: keine neue öffentliche API — `useCreateEvent` legt den Termin optimistisch an

- [ ] **Step 1: Die synthetische Zeile bauen**

In `features/calendar/createMutation.ts`, über `useCreateEvent`:

```ts
/**
 * Baut aus den Mutations-Variablen eine Master-Zeile in der Form, die
 * `fetchEventsInRange` liefert — damit sie durch dasselbe `expandEvents` laufen
 * kann wie die echten.
 *
 * Erfunden wird nur die `id` (Präfix `optimistic-`, damit sie in Logs erkennbar
 * ist) und die beiden Zeitstempel; alles andere kommt aus dem Formular oder aus
 * der bereits geladenen Typ-Zeile. Die Feldliste spiegelt bewusst den `insert`
 * in `createEvent` direkt darüber: Weicht sie ab, zeigt der Kalender etwas
 * anderes an, als gleich gespeichert wird.
 */
function optimisticEventRow(vars: CreateEventVars, type: EventTypeRow): EventWithRelations {
  const rrule = recurrenceToRrule(vars.recurrence, new Date(vars.startAt));
  const now = new Date().toISOString();
  return {
    id: `optimistic-${vars.startAt}-${vars.typeId}`,
    family_id: vars.familyId,
    type_id: vars.typeId,
    child_id: vars.childId,
    parent_id: vars.parentId,
    title: vars.title,
    description: vars.description,
    location: vars.location,
    start_at: vars.startAt,
    end_at: vars.endAt,
    all_day: vars.allDay,
    rrule_freq: rrule.rrule_freq,
    rrule_interval: rrule.rrule_interval,
    rrule_byweekday: rrule.rrule_byweekday,
    rrule_count: vars.recurrence === "none" ? null : vars.recurrenceCount,
    rrule_until: null,
    created_by: vars.createdBy,
    created_at: now,
    updated_at: now,
    event_types: type,
    event_exceptions: [],
  };
}
```

Ergänze dafür die Imports:

```ts
import type { Database } from "@/features/supabase/database.types";

import type { EventWithRelations } from "./expand";

import { useEventTypes } from "./hooks";
import { useOptimisticEventsStore } from "./optimisticEvents";

type EventTypeRow = Database["public"]["Tables"]["event_types"]["Row"];
```

Die Feldliste ist vollständig: `events.Row` in `features/supabase/database.types.ts` hat genau diese 19 Spalten. Sollte der Typecheck trotzdem etwas anmahnen, ergänze das Feld mit dem Wert, den der Server nach dem Insert hätte — und **leg keinen `as`-Cast darüber**, um eine Lücke zu überdecken.

- [ ] **Step 2: Die Mutation umbauen**

```ts
export function useCreateEvent() {
  const qc = useQueryClient();
  const types = useEventTypes();
  const add = useOptimisticEventsStore((state) => state.add);
  const remove = useOptimisticEventsStore((state) => state.remove);

  return useMutation({
    mutationFn: createEvent,
    onMutate: (vars) => {
      // Ohne die Typ-Zeile wäre die Occurrence unvollständig (Farbe, Icon,
      // Beschriftung). Dann lieber nicht optimistisch als falsch: Der Termin
      // erscheint eben erst mit dem Refetch.
      const type = types.data?.find((row) => row.id === vars.typeId);
      if (!type) return undefined;
      return add({ kind: "create", row: optimisticEventRow(vars, type) });
    },
    onError: (_err, _vars, id) => {
      if (id) remove(id);
    },
    onSettled: async (_data, _err, _vars, id) => {
      // Erst invalidieren, **dann** freigeben. Andersherum blitzt der alte Stand
      // für einen Frame durch, bevor der Refetch landet — dieselbe Lehre, die
      // `useDeleteEvent` in ADR-026 gezogen hat.
      await qc.invalidateQueries({ queryKey: calendarKeys.all });
      if (id) remove(id);
    },
  });
}
```

Das bisherige `onSuccess` mit `void qc.invalidateQueries(…)` entfällt — `onSettled` übernimmt es und wird abgewartet.

- [ ] **Step 3: Typecheck, Lint, bestehende Tests**

Run: `bun run typecheck && bun lint && bun test features/calendar`
Expected: alle grün.

- [ ] **Step 4: Commit**

```bash
git add features/calendar/createMutation.ts
git commit -m "feat(calendar): Termin optimistisch anlegen"
```

---

## Task 5: `useUpdateEvent` optimistisch

**Files:**

- Modify: `features/calendar/mutations.ts`

**Interfaces:**

- Consumes: `useOptimisticEventsStore` (Task 2)
- Produces: keine neue öffentliche API

**`useDeleteEvent` in derselben Datei bleibt unangetastet** — auch wenn es daneben steht. Decision 2 der Spec begründet das.

- [ ] **Step 1: Import ergänzen**

```ts
import { useOptimisticEventsStore } from "./optimisticEvents";
```

- [ ] **Step 2: `useUpdateEvent` umbauen**

```ts
export function useUpdateEvent() {
  const qc = useQueryClient();
  const add = useOptimisticEventsStore((state) => state.add);
  const remove = useOptimisticEventsStore((state) => state.remove);

  return useMutation({
    mutationFn: async (vars: UpdateEventVars) => {
      const ops = createSupabaseEventOps(supabase);
      await updateEvent(vars, { fetchMaster: fetchEventById, ops });
    },
    onMutate: (vars) =>
      add({
        kind: "update",
        eventId: vars.eventId,
        occurrenceDate: vars.occurrenceDate,
        scope: vars.scope,
        changes: vars.changes,
      }),
    onError: (_err, _vars, id) => {
      if (id) remove(id);
    },
    onSettled: async (_data, _err, _vars, id) => {
      // Erst invalidieren, **dann** freigeben — sonst blitzt der alte Stand für
      // einen Frame durch.
      await qc.invalidateQueries({ queryKey: calendarKeys.all });
      if (id) remove(id);
    },
  });
}
```

**Eine Grenze, die im Docstring stehen muss:** `vars.recurrence` (eine Regeländerung) wird **nicht** optimistisch abgebildet. Ändert der Nutzer den Rhythmus einer Serie, verschieben sich die Occurrence-_Termine_ selbst — das vorherzusagen hieße, die RRULE-Expansion für eine ungespeicherte Regel zu fahren. Der Refetch bringt es eine Sekunde später; bis dahin zeigt der Kalender die alten Termine mit den neuen Feldern. Halte das als Kommentar fest, damit es eine Entscheidung bleibt und kein Versehen.

- [ ] **Step 3: Typecheck, Lint, bestehende Tests**

Run: `bun run typecheck && bun lint && bun test features/calendar`
Expected: alle grün. `features/calendar/mutations.test.ts` prüft `updateEvent`/`deleteEvent` als reine Funktionen und ist von der Hook-Änderung nicht betroffen — bestätige das im Report, statt den grünen Lauf als Beleg für die Verdrahtung auszugeben.

- [ ] **Step 4: Commit**

```bash
git add features/calendar/mutations.ts
git commit -m "feat(calendar): Termin-Änderung optimistisch anzeigen"
```

---

## Task 6: Copy und der Anlegen-Screen

**Files:**

- Modify: `features/i18n/locales/de.json`
- Modify: `features/i18n/locales/en.json`
- Modify: `app-sections/event/EventCreateScreen.tsx`

**Interfaces:**

- Consumes: `useCreateEvent` (Task 4); `useToast` aus `@/app-sections/shared`; `mapEventError` aus `@/features/calendar`
- Produces: nichts

- [ ] **Step 1: Die deutschen Keys setzen**

In `features/i18n/locales/de.json`, unter `cal.create`:

- **entfernen:** `"saving": "Speichere…"`
- **ergänzen** im bestehenden `cal.create.error`-Block: `"saveFailed": "Termin konnte nicht angelegt werden"`

Der `cal.create.error`-Block existiert bereits — `typeRequired` wird in `EventCreateScreen.tsx` daraus gelesen. Häng `saveFailed` dort an.

- [ ] **Step 2: Die englischen Keys spiegeln**

`cal.create.error.saveFailed`: `"Couldn't create event"`, `cal.create.saving` entfernen.

- [ ] **Step 3: Key-Parität prüfen**

```bash
python3 - <<'PY'
import json
de = json.load(open("features/i18n/locales/de.json"))
en = json.load(open("features/i18n/locales/en.json"))
def keys(d, p=""):
    out = set()
    for k, v in d.items():
        out |= keys(v, f"{p}{k}.") if isinstance(v, dict) else {p + k}
    return out
print("nur DE:", sorted(keys(de) - keys(en)))
print("nur EN:", sorted(keys(en) - keys(de)))
PY
```

Expected: beide Listen leer. `cal.edit.saving` steht zu diesem Zeitpunkt noch in **beiden** Katalogen — er hat seine letzte Verwendung erst in Task 7. Die Kataloge sind **nicht** typisiert: Ein Commit, der einen Key vor seiner letzten Verwendung entfernt, scheitert nicht, sondern rendert still den Key-String.

- [ ] **Step 4: Den Screen umbauen**

Der Speichern-Pfad wird zu:

```tsx
function onSave() {
  if (!canSave || !familyId || !typeId || parsedCount === "invalid") return;
  const vars = {/* … unverändert wie bisher … */};
  // Sofort schließen: Der Termin steht dank `onMutate` schon im Kalender.
  router.back();
  void save(vars);
}
```

Und darüber der Fehlerpfad, der den Unmount überlebt:

```tsx
const { show } = useToast();
const createMutation = useCreateEvent();

/**
 * Schickt die Mutation und meldet einen Fehlschlag selbst.
 *
 * Bewusst `mutateAsync` mit eigenem `catch` statt eines Per-Call-`onError`:
 * Das Sheet ist unmontiert, bevor der Server antwortet, und TanStack Query
 * ruft Per-Call-Callbacks dann nicht mehr — festgehalten in
 * `features/tasks/mutateAsyncSurvivesUnmount.test.ts`. Die Retry-Aktion
 * schickt dieselben `vars` erneut, damit der Rollback dem Nutzer nicht die
 * Eingaben nimmt.
 *
 * Eine Funktionsdeklaration statt `useCallback`, damit sie sich in der
 * Retry-Aktion selbst aufrufen kann — und weil der Screen seine übrigen
 * Handler (`onSave`) genauso deklariert.
 */
function save(vars: CreateEventVars) {
  createMutation.mutateAsync(vars).catch((err: unknown) => {
    show({
      title: t("cal.create.error.saveFailed"),
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
```

Ergänze die Imports (`useToast` aus `@/app-sections/shared`, `mapEventError` und der Typ `CreateEventVars` aus `@/features/calendar`) und entferne die `isPending`-Beschriftung:

```tsx
            label={t("cal.create.save")}
```

`createMutation.isPending` steuert nichts Sichtbares mehr — der Screen ist weg, bevor die Mutation antwortet. Entferne es auch aus `canSave`.

- [ ] **Step 5: Typecheck, Lint, volle Suite**

Run: `bun run typecheck && bun lint && bun test`
Expected: alle grün.

- [ ] **Step 6: Web-Bundle prüfen**

Run: `bunx expo export --platform web --output-dir /tmp/eltern-web-optimistic`
Expected: baut ohne Fehler.

- [ ] **Step 7: Commit**

```bash
git add features/i18n/locales/de.json features/i18n/locales/en.json app-sections/event/EventCreateScreen.tsx
git commit -m "feat(calendar): Anlegen schließt sofort und meldet Fehler per Toast"
```

---

## Task 7: Der Bearbeiten-Screen

**Files:**

- Modify: `app-sections/event/EventEditScreen.tsx`
- Modify: `features/i18n/locales/de.json`
- Modify: `features/i18n/locales/en.json`

**Interfaces:**

- Consumes: `useUpdateEvent` (Task 5); `useToast`; `mapEventError`
- Produces: nichts

Derselbe Umbau wie in Task 6, für die andere Mutation. **Sieh dir den fertigen Stand von `EventCreateScreen.tsx` an, bevor du anfängst** — dieser Screen soll sein Geschwister sein, in derselben Handschrift.

- [ ] **Step 1: Copy**

`cal.edit.error.saveFailed` = DE „Änderung konnte nicht gespeichert werden" / EN „Couldn't save changes". `cal.edit.saving` fällt in **beiden** Katalogen — hier fällt seine letzte Verwendung. Führ die Key-Paritätsprüfung aus Task 6 Step 3 erneut aus; danach dürfen `cal.create.saving` und `cal.edit.saving` in keinem der beiden Kataloge mehr stehen:

```bash
grep -rn "cal\.\(create\|edit\)\.saving" app-sections features   # muss leer sein
```

- [ ] **Step 2: Den Speichern-Pfad umbauen**

Der bestehende `updateMutation.mutate(vars, { onSuccess: () => router.back() })` wird zu: `router.back()` **vor** dem Absenden, dann `void save(vars)` mit demselben `mutateAsync`-plus-`catch`-Bau wie im Anlegen-Screen, `errorTitle` aus `cal.edit.error.saveFailed`.

**Achtung auf den Scope-Dialog:** Bei einem Serientermin läuft `pickScope` **vor** dem Speichern. Der Abbruch-Pfad (`if (!chosen) return;`) muss weiterhin sauber aussteigen, ohne zu navigieren oder zu planen. Prüf, dass `router.back()` erst **nach** dieser Abfrage steht.

- [ ] **Step 3: Toten `isPending`-Code entfernen**

`updateMutation.isPending` steuert nichts Sichtbares mehr: die Beschriftung des Speichern-Buttons und die Bedingung in `canSave`.

- [ ] **Step 4: Typecheck, Lint, volle Suite, Web-Bundle**

```bash
bun run typecheck && bun lint && bun test
bunx expo export --platform web --output-dir /tmp/eltern-web-optimistic-edit
```

- [ ] **Step 5: Commit**

```bash
git add app-sections/event/EventEditScreen.tsx features/i18n/locales/de.json features/i18n/locales/en.json
git commit -m "feat(calendar): Bearbeiten schließt sofort und meldet Fehler per Toast"
```

---

## Task 8: Dokumentation

**Files:**

- Modify: `docs/decision-log.md`
- Modify: `docs/TODO.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: ADR-027 anhängen**

An das **Ende** von `docs/decision-log.md`. Ältere ADRs werden nie editiert, nur abgelöst. Nimm **ADR-026** als Vorbild für Aufbau und Detailtiefe — dasselbe Feature-Umfeld, dieselbe Handschrift. Prüf die nächste freie Nummer selbst in der Datei.

Inhaltlich müssen die neun Decisions aus Abschnitt 3 der Spec darin stehen, jede **mit ihrer verworfenen Alternative**:

1. Anzeige modellieren statt Speicherung (verworfen: `setQueriesData` auf den Master-Zeilen, weil es `applyEditScope` im Client nachbaute und ein Refetch den Snapshot überholt).
2. `useDeleteEvent` bleibt unangetastet.
3. Näherung statt Exaktheit bei Serien, samt der benannten Lücke (verschobene Occurrence im `forward`-Fall).
4. Anlegen ist hier optimistisch machbar, anders als bei Aufgaben — zwei der drei Gründe aus `useCreateTask`s Docstring entfallen.
5. Der Fehler-Toast kommt aus dem Screen, nicht aus dem Hook und nicht aus einem Per-Call-Callback.
6. Keine visuelle Sonderbehandlung der optimistischen Occurrence; die `saving`-Keys entfallen.
7. `useEvent` bekommt kein Overlay.
8. Zwei Overlays, nicht eins — und warum die Vereinigung wartet.
9. Die Reihenfolge der Overlays ist Semantik.

Als eigener Punkt oder als Consequence dazu: **der `description`-Fund.** `expandEvents` liest das Feld immer von der Master-Zeile, `applyOverride` kennt es nicht — eine per Exception geänderte Beschreibung erreicht die Anzeige nie. Das Overlay bildet deshalb die Anzeige ab, nicht den Schreibvorgang.

Consequences: Beide Sheets schließen sofort statt einen Ladezustand zu zeigen; ein Fehlschlag meldet sich per Toast mit Retry statt die Eingaben im offenen Sheet zu halten; eine Regeländerung (`vars.recurrence`) wird nicht optimistisch abgebildet.

- [ ] **Step 2: `docs/TODO.md` abgleichen**

| Eintrag                                                                        | Aktion                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| „**Optimistic UI** in den Calendar-Mutations (aktuell invalidate-and-refetch)" | **Zeile löschen** — eingelöst; die Ausnahme für `useDeleteEvent` steht im ADR                                                                                                                                                                                                                                                                                                                   |
| neu                                                                            | **Vereinigung der beiden Occurrence-Overlays**: `pendingDeletes` und `optimisticEvents` operieren auf demselben Strom und haben verwandte Form. Nennt beide Dateien und den Grund für das Warten (der Pending-Delete-Store ist frisch reviewt, Löschen stand nicht zur Disposition), plus das Fälligkeitskriterium: beim dritten Overlay.                                                       |
| neu                                                                            | **`applyOverride` kennt `description` nicht**: Der Server schreibt eine per Occurrence geänderte Beschreibung ins Override-JSON, `expandEvents` liest sie aber immer von der Master-Zeile — sie erreicht die Anzeige also nie. Nennt `features/calendar/expand.ts` und `recurrence.ts`. Ein Fix müsste den Override-Vertrag erweitern; verwandt mit dem bestehenden Eintrag zum `all_day`-Flag. |
| neu                                                                            | **Eine Regeländerung wird nicht optimistisch abgebildet**: `vars.recurrence` verschiebt die Occurrence-Termine selbst; das vorherzusagen hieße, die RRULE-Expansion für eine ungespeicherte Regel zu fahren. Nennt `features/calendar/mutations.ts`.                                                                                                                                            |

- [ ] **Step 3: `CLAUDE.md` nachziehen**

Im Block „Folder structure" bei `features/calendar/` das neue Modul ergänzen, in der Knappheit der bestehenden Einträge — der Ordner nennt heute bereits Queries, Mutations, RRULE-Expansion, Reminder und Pending-Deletes.

- [ ] **Step 4: Alles zusammen prüfen**

```bash
bun run format:check && bun lint && bun run typecheck && bun test
bunx expo export --platform web --output-dir /tmp/eltern-web-optimistic-final
```

- [ ] **Step 5: Commit**

```bash
git add docs/decision-log.md docs/TODO.md CLAUDE.md
git commit -m "docs: ADR-027 für optimistische Kalender-Updates"
```
