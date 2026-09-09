# Block 1, Teil A — Forward-Split und Serienanker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zwei stille Datenverluste im Kalender aufhören lassen — die abgespaltene Serienhälfte verliert ihre Personenzuordnung nicht mehr, und ein Speichern mit „Alle Termine" löscht keine vergangenen Vorkommen mehr.

**Architecture:** Zwei kleine, voneinander unabhängige PRs auf `main`. PR A ergänzt eine fehlende Spalte im Insert und sichert die Vollzähligkeit **aller drei** Event-Schreiber gegen den generierten Datenbank-Typ ab. PR B trennt die Doppelbelegung von `events.start_at` (Startzeit **und** `dtstart`) auf, indem der Scope „alle" nur noch die Tageszeit übernimmt und das Datum des Masters stehen lässt — dieselbe Regel, die das optimistische Overlay für die Anzeige längst anwendet.

**Tech Stack:** TypeScript strict, `bun test` (Buns Runner, `bun:test`), Supabase-JS (nur über injizierte Clients bzw. `mock.module`), `rrule@2.8.1`, `date-fns@4.4.0`.

**Spec:** [docs/superpowers/specs/2026-09-09-calendar-silent-data-loss-design.md](../specs/2026-09-09-calendar-silent-data-loss-design.md) — §3 (PR A) und §4 (PR B)

## Global Constraints

- **Handoff-Bundle ist gesperrt** (CLAUDE.md Non-Negotiable 1): `design-system/{colors,typography,spacing,themes,components,index}.ts`, `docs/{HANDOFF,COPY,ICONS,README}.md`, `patterns/*.md` werden in diesem Plan **nicht** angefasst. Beide PRs kommen ohne neue Copy-Keys aus — das ist Absicht und der Grund, warum sie zuerst laufen.
- **Keine UI-Änderung.** Beide PRs bleiben unterhalb der Screens. `EventEditScreen.tsx` und `EventCreateScreen.tsx` werden nicht editiert.
- **Docstrings** (CLAUDE.md → Documentation discipline): jede neue exportierte Funktion und jedes neue Modul bekommt einen JSDoc-Block **im selben Commit**. Inhalt ist das Nicht-Offensichtliche — Warum, Grenzfall, ADR-Verweis —, nicht die Wiederholung des Namens. Lokale Helfer in Testdateien sind ausgenommen.
- **Commits:** Conventional-Commits-Präfix, scoped (`fix(calendar): …`, `test(calendar): …`, `docs: …`). **Niemals** ein `Co-Authored-By: Claude`-Trailer. `--no-verify` ist verboten; die `lint-staged`-Hooks laufen immer mit.
- **Vor jedem Commit grün:** `bun run typecheck` · `bun lint` · `bun test` · `bun format:check`.
- **Testfixturen sind zeitzonenrobust.** Der Runner läuft lokal unter `Europe/Berlin`, in CI unter `UTC`. Wo eine Erwartung von der Ortszeit abhängt, wird sie aus lokalen Komponenten (`new Date(2026, 4, 4, 18, 30)`) gebaut oder ihre Zonenunabhängigkeit im Kommentar begründet — nie beides ungeprüft gemischt.
- **`docs/TODO.md` im selben Commit pflegen** (CLAUDE.md → Out-of-scope TODOs): erledigte Einträge **löschen**, neu entstandene Grenzen anlegen.
- **Vor jedem PR:** `coderabbit review --base main` lokal durchlaufen lassen und Findings adressieren oder begründet verwerfen.

---

## File Structure

| Datei                                          | Verantwortung                                                   | Task |
| ---------------------------------------------- | --------------------------------------------------------------- | ---- |
| `features/calendar/eventColumns.test.ts` (neu) | Vollzähligkeit der Insert-Spalten für alle drei Event-Schreiber | 1, 3 |
| `features/calendar/recurrence.ts`              | `insertSplitEvent` bekommt `parent_id`                          | 2    |
| `features/calendar/createMutation.ts`          | `createEvent` setzt `rrule_until` explizit                      | 3    |
| `docs/TODO.md`, `docs/roadmap.md`              | Eintrag 1.1 entfernen, Reminder-Grenze anlegen                  | 4    |
| `features/calendar/recurrence.ts`              | `anchoredChanges` + zwei Aufrufstellen                          | 5–7  |
| `features/calendar/recurrence.test.ts`         | Anker-Tests, bestehende Assertions nachziehen                   | 5–7  |
| `features/calendar/expand.test.ts`             | Ende-zu-Ende: die Vorkommenzahl bleibt erhalten                 | 8    |
| `docs/decision-log.md`                         | **ADR-032** — „Alle Termine" verankert nicht neu                | 9    |
| `docs/TODO.md`, `docs/roadmap.md`              | Eintrag 1.2 entfernen, verworfene Datumsänderung anlegen        | 9    |

---

# PR A — `insertSplitEvent` verliert `parent_id`

**Branch:** `fix/calendar-split-parent-id` (von `main`)

---

## Task 1: Der Spaltenvollzähligkeits-Test (rot)

**Files:**

- Create: `features/calendar/eventColumns.test.ts`

**Interfaces:**

- Consumes: `createSupabaseEventOps` aus `features/calendar/recurrence.ts` (Signatur: `(client: SupabaseClient<Database>) => EventOps`), `EventChanges` von dort.
- Produces: `EVENT_ROW_COLUMNS`, `SERVER_OWNED`, `requiredInsertColumns()` — **testfilelokal**, kein Export. Task 3 baut in derselben Datei darauf auf.

**Hintergrund für den Umsetzenden:** `createSupabaseEventOps` nimmt den Supabase-Client als **Parameter**, genau damit ein Test ihn ersetzen kann. Das Vorbild steht bereits in `features/calendar/recurrence.test.ts` (`fakeUpdateClient`, ab Zeile 578). Die vorhandenen Split-Tests mocken dagegen die `EventOps`-Schnittstelle — die fehlende Spalte liegt **unterhalb** davon und ist von dort grundsätzlich unsichtbar. Deshalb eine eigene Datei auf der Adapter-Ebene.

- [ ] **Step 1: Testdatei anlegen**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

import { describe, expect, test } from "bun:test";

import type { Database } from "@/features/supabase/database.types";

import type { EventChanges } from "./recurrence";

import { createSupabaseEventOps } from "./recurrence";

type EventRow = Database["public"]["Tables"]["events"]["Row"];

/**
 * Die Spalten von `EventRow`, zur Laufzeit lesbar.
 *
 * TypeScript löscht Typen, eine handgeführte Liste im Test wäre also eine
 * zweite Wahrheit, die still veraltet — genau der Zustand, der `parent_id`
 * jahrelang hat durchrutschen lassen. `Record<keyof EventRow, true>` bindet die
 * Liste an den generierten Datenbank-Typ: Kommt eine Spalte dazu, schlägt
 * `bun run typecheck` hier fehl, bevor überhaupt ein Test läuft.
 */
const EVENT_ROW_COLUMNS: Record<keyof EventRow, true> = {
  id: true,
  family_id: true,
  type_id: true,
  child_id: true,
  parent_id: true,
  title: true,
  description: true,
  location: true,
  start_at: true,
  end_at: true,
  all_day: true,
  rrule_freq: true,
  rrule_interval: true,
  rrule_byweekday: true,
  rrule_until: true,
  rrule_count: true,
  created_by: true,
  created_at: true,
  updated_at: true,
};

/**
 * Spalten, die ein Insert bewusst dem Server überlässt:
 * `id` hat `default gen_random_uuid()`, `created_at` hat `default now()`, und
 * `updated_at` gehört seit ADR-031 dem `set_updated_at`-Trigger. Sie hier zu
 * setzen wäre falsch, nicht nur überflüssig.
 */
const SERVER_OWNED: readonly (keyof EventRow)[] = ["id", "created_at", "updated_at"];

/** Jede Spalte, die ein Schreiber selbst füllen muss. Sortiert, damit der Vergleich stabil ist. */
function requiredInsertColumns(): string[] {
  return Object.keys(EVENT_ROW_COLUMNS)
    .filter((column) => !SERVER_OWNED.includes(column as keyof EventRow))
    .sort();
}

/**
 * Doppelgänger des Query-Builders, den `insertSplitEvent` durchläuft
 * (`.from().insert()`). Der echte Aufruf wird direkt `await`-ed, das Fake gibt
 * deshalb eine Promise zurück, kein Builder.
 */
function fakeInsertClient() {
  const calls = { table: "", payload: undefined as Record<string, unknown> | undefined };
  const client = {
    from(table: string) {
      calls.table = table;
      return {
        insert(payload: Record<string, unknown>) {
          calls.payload = payload;
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, calls };
}

function master(overrides: Partial<EventRow> = {}): EventRow {
  return {
    id: "evt-1",
    family_id: "fam-1",
    type_id: "type-1",
    child_id: null,
    parent_id: null,
    title: "Papas Sportkurs",
    description: "Turnhalle West",
    location: "Sportplatz Nord",
    start_at: "2026-05-04T16:30:00.000Z",
    end_at: "2026-05-04T17:30:00.000Z",
    all_day: false,
    rrule_freq: "weekly",
    rrule_interval: 1,
    rrule_byweekday: [1],
    rrule_until: null,
    rrule_count: null,
    created_by: "par-1",
    created_at: "2026-04-20T00:00:00.000Z",
    updated_at: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

const CHANGES: EventChanges = {
  title: "Neuer Titel",
  start_at: "2026-06-15T15:00:00.000Z",
  end_at: "2026-06-15T16:00:00.000Z",
  location: "Sportplatz Süd",
  description: null,
};

describe("insertSplitEvent — Spaltenvollzähligkeit", () => {
  test("schreibt jede Spalte, die der Server nicht selbst füllt", async () => {
    const { client, calls } = fakeInsertClient();

    await createSupabaseEventOps(client).insertSplitEvent(master(), CHANGES, null);

    expect(calls.table).toBe("events");
    expect(Object.keys(calls.payload ?? {}).sort()).toEqual(requiredInsertColumns());
  });

  test("die abgespaltene Hälfte behält die Personenzuordnung des Masters", async () => {
    // Die Vollzähligkeitsprüfung allein wäre mit einem hartkodierten
    // `parent_id: null` zufrieden. Dieser Test hält den Wert dagegen.
    const { client, calls } = fakeInsertClient();

    await createSupabaseEventOps(client).insertSplitEvent(
      master({ parent_id: "par-7" }),
      CHANGES,
      null,
    );

    expect(calls.payload?.parent_id).toBe("par-7");
  });
});
```

- [ ] **Step 2: Test laufen lassen und Rot bestätigen**

Run: `bun test features/calendar/eventColumns.test.ts`

Erwartet: **beide Tests failen.** Der erste, weil `Object.keys(payload)` `parent_id` nicht enthält; der zweite, weil `payload.parent_id` `undefined` statt `"par-7"` ist. Wenn stattdessen ein Typfehler oder ein `Cannot find module` kommt, stimmt etwas am Setup — erst das reparieren, nicht die Erwartung.

- [ ] **Step 3: Commit (roter Test, absichtlich)**

Der rote Test wird **nicht** einzeln committet — er geht zusammen mit dem Fix in Task 2 in einen Commit. Grund: `lint-staged` und die CI-Gates laufen auf jedem Commit, ein absichtlich roter Commit auf dem Branch wäre ein rotes Signal ohne Aussage. Weiter zu Task 2.

---

## Task 2: `parent_id` ergänzen (grün)

**Files:**

- Modify: `features/calendar/recurrence.ts` — `createSupabaseEventOps.insertSplitEvent`

**Interfaces:**

- Consumes: nichts Neues.
- Produces: nichts Neues. Reine Verhaltenskorrektur.

- [ ] **Step 1: Die Zeile einfügen**

In `createSupabaseEventOps`, im `insert`-Objekt von `insertSplitEvent`, direkt nach `child_id`:

```ts
    insertSplitEvent: async (master, changes, rruleCount) => {
      const { error } = await client.from("events").insert({
        family_id: master.family_id,
        type_id: master.type_id,
        child_id: master.child_id,
        // Die Zuordnung wandert mit. Ohne sie wurde die abgespaltene Hälfte
        // stillschweigend zum familienweiten Termin — kein Fehler, keine
        // Meldung, auffallen konnte es erst, wenn die Ansicht nach Person den
        // Termin nicht mehr fand.
        parent_id: master.parent_id,
        title: changes.title,
```

Der Rest des Objekts bleibt unverändert.

- [ ] **Step 2: Test laufen lassen und Grün bestätigen**

Run: `bun test features/calendar/eventColumns.test.ts`
Erwartet: **2 pass, 0 fail.**

- [ ] **Step 3: Die bestehende Suite gegenprüfen**

Run: `bun test features/calendar/`
Erwartet: alles grün. `recurrence.test.ts` mockt `EventOps` und sieht die Änderung nicht — wenn dort etwas rot wird, ist es ein echter Regress und kein Erwartungsfehler.

- [ ] **Step 4: Gates**

```bash
bun run typecheck && bun lint && bun format:check
```

- [ ] **Step 5: Commit**

```bash
git add features/calendar/recurrence.ts features/calendar/eventColumns.test.ts
git commit -m "fix(calendar): parent_id in den Forward-Split übernehmen

Der Insert der abgespaltenen Serienhälfte führte fünfzehn Spalten und ließ
parent_id aus — die Hälfte wurde stillschweigend familienweit. Der neue Test
prüft nicht die eine Spalte, sondern die Schlüsselmenge gegen EventRow: eine
künftig hinzugefügte Spalte wird rot, statt still durchzurutschen."
```

---

## Task 3: Die zwei anderen Schreiber unter dieselbe Prüfung

**Files:**

- Modify: `features/calendar/eventColumns.test.ts`
- Modify: `features/calendar/createMutation.ts` — `createEvent`

**Interfaces:**

- Consumes: `requiredInsertColumns()`, `EVENT_ROW_COLUMNS` aus Task 1 (dieselbe Datei); `createEvent` und `optimisticEventRow` aus `features/calendar/createMutation.ts`; `CreateEventVars` von dort.
- Produces: nichts Neues.

**Hintergrund:** `createMutation.ts` trägt die Regel heute nur als Kommentar über `optimisticEventRow` — „Die Feldliste spiegelt bewusst den `insert` in `createEvent` direkt darüber: Weicht sie ab, zeigt der Kalender etwas anderes an, als gleich gespeichert wird." Ein Kommentar ist keine Prüfung. Drei Schreiber, eine Prüfung.

`createEvent` spricht anders als `insertSplitEvent` mit dem Modul-Singleton `supabase`, ist also nicht injizierbar. Dafür gibt es im Repo genau ein Muster: `mock.module("@/features/supabase", …)` plus **dynamischer** Import des Moduls unter Test — siehe `features/calendar/reminders.test.ts:60-65`. Ein statischer Import würde über den Mock hochgezogen und griffe den echten Client ab.

- [ ] **Step 1: Mock und dynamischen Import an den Kopf der Testdatei setzen**

Direkt unter die vorhandenen Imports in `features/calendar/eventColumns.test.ts`, **vor** die `describe`-Blöcke:

```ts
import { mock } from "bun:test";

let inserted: { table: string; payload: Record<string, unknown> | undefined } = {
  table: "",
  payload: undefined,
};

const supabase = {
  from(table: string) {
    inserted.table = table;
    return {
      insert(payload: Record<string, unknown>) {
        inserted.payload = payload;
        return Promise.resolve({ error: null });
      },
    };
  },
};

void mock.module("@/features/supabase", () => ({ supabase }));

// Nach dem Modul-Mock importiert: ein statischer Import würde darüber
// hochgezogen und `createMutation.ts` griffe den echten Client ab.
// Gleiches Muster wie in `reminders.test.ts`.
const { createEvent, optimisticEventRow } = await import("./createMutation");
```

Der `mock`-Import kommt in die bestehende `bun:test`-Importzeile (`import { describe, expect, mock, test } from "bun:test";`), keine zweite Zeile.

- [ ] **Step 2: Die beiden Fixture-Fabriken ergänzen**

```ts
type EventTypeRow = Database["public"]["Tables"]["event_types"]["Row"];

function createVars(): Parameters<typeof createEvent>[0] {
  return {
    familyId: "fam-1",
    typeId: "type-1",
    childId: "child-1",
    parentId: null,
    title: "Elternabend",
    startAt: "2026-10-01T19:00:00.000Z",
    endAt: "2026-10-01T20:30:00.000Z",
    allDay: false,
    location: "Schule",
    description: "Raum 12",
    recurrence: "weekly",
    recurrenceCount: 5,
    createdBy: "par-1",
  };
}

/** Die acht Spalten von `event_types.Row`, Stand `database.types.ts`. */
function eventType(): EventTypeRow {
  return {
    id: "type-1",
    family_id: "fam-1",
    slug: "family",
    color: "primary",
    icon: "users",
    label: { de: "Familie", en: "Family" },
    created_at: "2026-01-01T00:00:00.000Z",
  };
}
```

`label` ist `Json`, kein String-Paar-Typ — ein Objektliteral genügt, `readLabel` in `expand.ts` liest es defensiv.

- [ ] **Step 3: Die beiden Tests schreiben**

```ts
describe("createEvent und optimisticEventRow — dieselbe Spaltenmenge", () => {
  test("createEvent schreibt jede Spalte, die der Server nicht selbst füllt", async () => {
    inserted = { table: "", payload: undefined };

    await createEvent(createVars());

    expect(inserted.table).toBe("events");
    expect(Object.keys(inserted.payload ?? {}).sort()).toEqual(requiredInsertColumns());
  });

  test("optimisticEventRow deckt jede Spalte von EventRow ab", () => {
    // Die synthetische Zeile geht durch dasselbe `expandEvents` wie die echten
    // und muss deshalb eine vollständige `EventRow` sein — inklusive der drei
    // servergefüllten Spalten, die `createEvent` bewusst auslässt.
    const row = optimisticEventRow(createVars(), eventType());
    const columns = Object.keys(row).filter(
      (key) => key !== "event_types" && key !== "event_exceptions",
    );

    expect(columns.sort()).toEqual(Object.keys(EVENT_ROW_COLUMNS).sort());
  });
});
```

- [ ] **Step 4: Test laufen lassen und das erwartete Rot prüfen**

Run: `bun test features/calendar/eventColumns.test.ts`

Erwartet: der `createEvent`-Test **failt**, `optimisticEventRow` ist **grün**. Der Unterschied ist genau eine Spalte: `createEvent` setzt `rrule_until` nicht, `optimisticEventRow` setzt es auf `null`.

Das ist **kein Bug** — eine ausgelassene, nullable Spalte ohne Default landet als `NULL`, und zum Anlegezeitpunkt gibt es nie ein UNTIL. Es ist aber genau die Drift, gegen die dieser Test da ist: die drei Schreiber sollen sich Zeile für Zeile spiegeln, damit ein Leser sie nebeneinanderlegen kann.

- [ ] **Step 5: `rrule_until` in `createEvent` explizit setzen**

In `features/calendar/createMutation.ts`, im `insert`-Objekt von `createEvent`, direkt vor `rrule_count`:

```ts
    // Zum Anlegezeitpunkt gibt es nie ein UNTIL (das entsteht erst beim
    // Forward-Löschen). Explizit `null` statt ausgelassen, damit die drei
    // Event-Schreiber — hier, `optimisticEventRow` darunter und
    // `insertSplitEvent` in `recurrence.ts` — dieselbe Spaltenmenge führen;
    // `eventColumns.test.ts` hält sie darauf fest.
    rrule_until: null,
```

- [ ] **Step 6: Test laufen lassen und Grün bestätigen**

Run: `bun test features/calendar/`
Erwartet: alles grün, inklusive `createMutation.test.ts`.

- [ ] **Step 7: Gates**

```bash
bun run typecheck && bun lint && bun format:check
```

- [ ] **Step 8: Commit**

```bash
git add features/calendar/eventColumns.test.ts features/calendar/createMutation.ts
git commit -m "test(calendar): alle drei Event-Schreiber auf dieselbe Spaltenmenge festnageln

createEvent, optimisticEventRow und insertSplitEvent führen dieselben Spalten.
Bisher stand das nur als Kommentar über optimisticEventRow. Die Prüfung bindet
die Liste über Record<keyof EventRow, true> an den generierten DB-Typ, eine neue
Spalte failt damit den Typecheck. createEvent setzt rrule_until jetzt explizit
auf null — verhaltensgleich, aber nicht mehr die Ausnahme in der Reihe."
```

---

## Task 4: Doku und PR A

**Files:**

- Modify: `docs/TODO.md`
- Modify: `docs/roadmap.md`

- [ ] **Step 1: Den erledigten TODO-Eintrag löschen**

In `docs/TODO.md`, Sektion „Calendar (V1 …)", den Eintrag **vollständig entfernen** (nicht abhaken — CLAUDE.md → Out-of-scope TODOs):

> **`insertSplitEvent` verliert `parent_id` — stiller Datenverlust** …

- [ ] **Step 2: Die neu benannte Grenze anlegen**

In derselben Sektion anhängen:

```markdown
- **Der Forward-Split übernimmt keine Reminder** ([features/calendar/recurrence.ts](../features/calendar/recurrence.ts) — `insertSplitEvent`): `reminders` hängen an `event_id`; die abgespaltene Serienhälfte bekommt eine neue Id und damit keine einzige Erinnerung. Derselbe Fehlertyp wie die fehlende `parent_id`, aber eine andere Tabelle und eine andere Entscheidung: Kopieren wäre für eine bewusst nur „ab hier" geänderte Serie plausibel, für eine gerade erst abgetrennte Hälfte aber auch überraschend. Aufgekommen beim Schließen der `parent_id`-Lücke; die Spaltenprüfung in [eventColumns.test.ts](../features/calendar/eventColumns.test.ts) deckt Fremdtabellen nicht ab.
```

- [ ] **Step 3: Die Roadmap abhaken**

In `docs/roadmap.md`, Überschrift von 1.1 ändern:

```markdown
### 1.1 `insertSplitEvent` verliert `parent_id` — **erledigt**
```

- [ ] **Step 4: Gates und Commit**

```bash
bun format:check
git add docs/TODO.md docs/roadmap.md
git commit -m "docs: parent_id-Lücke geschlossen, Reminder-Grenze benannt"
```

- [ ] **Step 5: CodeRabbit lokal**

Run: `coderabbit review --base main`

Findings adressieren oder mit Begründung verwerfen. Nicht in Schleife laufen lassen — das CLI erlaubt rund drei Reviews pro Stunde.

- [ ] **Step 6: PR öffnen**

```bash
git push -u origin fix/calendar-split-parent-id
gh pr create --fill
```

Die sechs Workflows laufen als Gate; der iOS-Job dauert ~30 min und bestimmt die PR-Dauer.

- [ ] **Step 7: Sichtprüfung am Simulator**

Vor dem Merge: eine wiederkehrende Serie mit gesetztem Elternteil anlegen (`MemberPicker` im Create-Formular), eine spätere Occurrence mit Scope „Ab diesem Termin" bearbeiten, dann in der Ansicht nach Person prüfen, dass **beide** Hälften der Person zugeordnet bleiben. Web reicht hier nicht — der Scope-Dialog fällt außerhalb von iOS auf `Alert.alert` zurück, das auf react-native-web ein No-op ist (Block 3).

---

# PR B — „Alle Termine" verschiebt den Serienstart

**Branch:** `fix/calendar-series-anchor` (von `main`, unabhängig von PR A)

---

## Task 5: Der Anker-Test (rot)

**Files:**

- Modify: `features/calendar/recurrence.test.ts` — neuer `describe`-Block, ans Ende der `applyEditScope`-Suite

**Interfaces:**

- Consumes: `applyEditScope`, `makeOps()`, `EventChanges` — alle bereits in der Datei.
- Produces: `ANCHOR_MASTER_START`, `ANCHOR_CHANGES`, `ANCHOR_EXPECTED`, `anchorMaster()` — testfilelokal. Task 7 führt daneben ein zweites, gleichnamiges Paar für die **Bestandsfixture** ein (`CHANGES_ANCHORED`); die beiden dürfen nicht verwechselt werden — dieses hier gehört zu `anchorMaster()`, jenes zu `makeMaster()`.

**Hintergrund für den Umsetzenden:** `events.start_at` ist doppelt belegt — Startzeit des Termins **und** `dtstart` der Serie (`buildRule` in `rrule.ts`). Das Bearbeiten-Formular hydriert aus der angetippten Occurrence, `changes.start_at` trägt also deren Datum. Schreibt `updateMaster` das unbedingt, wandert der Serienanker dorthin und alle Vorkommen davor fallen serverseitig weg. Nachgemessen: Serie ab 01.06., bearbeitet am 03.08. → 9 von 14 Vorkommen weg, ohne Fehler oder Meldung.

**Zur Zonenrobustheit:** Die Fixtures unten werden aus **lokalen** Komponenten gebaut (`new Date(2026, 4, 4, 18, 30)`), die Erwartung ebenso. Damit ist die Assertion unabhängig davon, ob der Runner unter `Europe/Berlin` (lokal) oder `UTC` (CI) läuft. Beide Daten — 04.05. und 15.06. — liegen in jeder gängigen Zone im selben Sommerzeit-Regime; das ist die Bedingung, unter der die Umrechnung offsetunabhängig ist, und sie gehört als Kommentar an die Fixture.

- [ ] **Step 1: Fixtures und ersten Test anlegen**

Ans **Ende der Datei** `features/calendar/recurrence.test.ts`, also hinter den `createSupabaseEventOps`-Block:

```ts
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
});
```

- [ ] **Step 2: Test laufen lassen und Rot bestätigen**

Run: `bun test features/calendar/recurrence.test.ts`

Erwartet: die ersten beiden Tests **failen** (`updateMaster` bekommt `ANCHOR_CHANGES` statt `ANCHORED`), der dritte ist **grün** (Einzeltermine sind schon heute literal). Genau diese Aufteilung ist der Beleg, dass der Test die richtige Sache misst.

---

## Task 6: `anchoredChanges` implementieren

**Files:**

- Modify: `features/calendar/recurrence.ts` — neue lokale Funktion + zwei Aufrufstellen

**Interfaces:**

- Consumes: `EventRow`, `EventChanges` (beide bereits im Modul).
- Produces: `anchoredChanges(master: EventRow, changes: EventChanges): EventChanges` — **modullokal, kein Export.** Sie beschreibt eine Regel von `applyEditScope`, keine Fähigkeit des Moduls.

- [ ] **Step 1: Die Funktion einfügen**

In `features/calendar/recurrence.ts`, direkt unter `ruleDiffers` und über `applyEditScope`:

```ts
/**
 * `changes`, so umgeschrieben, dass der **Serienanker stehen bleibt**.
 *
 * `events.start_at` ist doppelt belegt: Startzeit des Termins *und* `dtstart`
 * der Serie (`buildRule` in `rrule.ts`). Das Bearbeiten-Formular hydriert aus
 * der angetippten Occurrence, `changes.start_at` trägt also deren Datum.
 * Unbedingt geschrieben, wandert `dtstart` dorthin, und jedes Vorkommen davor
 * fällt aus `rule.between()` — serverseitig, ohne Fehler oder Meldung.
 * Nachgemessen: eine Serie ab 01.06., bearbeitet am 03.08., verliert 9 von 14
 * Vorkommen. Trägt sie ein `rrule_count`, verschiebt sich zusätzlich das ganze
 * Zählfenster, weil COUNT relativ zu `dtstart` läuft.
 *
 * Übernommen wird deshalb nur die **Tageszeit**; das Datum bleibt das des
 * Masters, die Dauer kommt aus der Eingabe. Das ist Zeile für Zeile, was
 * `applyOptimisticChanges` (`optimisticEvents.ts`) für die Anzeige längst tut —
 * Anzeige und Schreibpfad sagen damit dasselbe, was sie vorher nicht taten.
 *
 * Zwei bewusste Grenzen (ADR-032):
 *
 * - Eine **Datumsänderung** unter Scope „alle" wird verworfen. Eine Angabe
 *   stumm fallen zu lassen ist ungleich billiger als stumm neun Vorkommen zu
 *   löschen, und die Anzeige verspricht das Verworfene ohnehin schon. Ein
 *   sichtbarer Hinweis bräuchte einen Copy-Key — siehe `docs/TODO.md`.
 * - Wird eine Serie zum **Einzeltermin** (`recurrence.rrule_freq === null`),
 *   behält sie das Datum des Serienbeginns statt das der bearbeiteten
 *   Occurrence. Eine Regel gibt es dann nicht mehr, verloren geht also nichts;
 *   die Alternative wäre eine dritte Sonderregel für einen seltenen Fall.
 *
 * Gerechnet wird mit lokalen Gettern, wie `withTimeOfDay` es tut. Sobald
 * `events` eine eigene Zone trägt, gehört die Tageszeit in dieser Zone
 * genommen — das ist der nächste PR dieses Blocks.
 */
function anchoredChanges(master: EventRow, changes: EventChanges): EventChanges {
  const newStart = new Date(changes.start_at);
  const start = new Date(master.start_at);
  start.setHours(
    newStart.getHours(),
    newStart.getMinutes(),
    newStart.getSeconds(),
    newStart.getMilliseconds(),
  );
  const durationMs = new Date(changes.end_at).getTime() - newStart.getTime();
  return {
    ...changes,
    start_at: start.toISOString(),
    end_at: new Date(start.getTime() + durationMs).toISOString(),
  };
}
```

- [ ] **Step 2: Die letzte Zeile von `applyEditScope` umstellen**

Ersetzen:

```ts
// scope === "all" (or "forward" on a non-recurring event — same outcome)
await ops.updateMaster(eventId, changes, master.updated_at);
```

durch:

```ts
// scope === "all" (or "forward" on a non-recurring event — same outcome).
// Der Anker greift nur bei einer Serie; beim Einzeltermin verschiebt eine
// Datumsänderung den Termin tatsächlich (siehe `anchoredChanges`). Auf
// `isRecurring` allein zu prüfen genügt: „forward" auf einer Serie kehrt in
// jedem seiner Zweige oben zurück und erreicht diese Zeile nie.
await ops.updateMaster(
  eventId,
  isRecurring ? anchoredChanges(master, changes) : changes,
  master.updated_at,
);
```

- [ ] **Step 3: Den `recurrence`-Zweig umstellen**

Ersetzen:

```ts
await ops.updateMaster(eventId, changes, master.updated_at, recurrence);
```

durch:

```ts
// Derselbe Anker wie unten: Dass die Serie ohnehin neu definiert wird,
// rettet die Vorkommen vor der bearbeiteten Occurrence nicht — sie
// verschwinden mit dem wandernden `dtstart` genauso.
await ops.updateMaster(
  eventId,
  isRecurring ? anchoredChanges(master, changes) : changes,
  master.updated_at,
  recurrence,
);
```

- [ ] **Step 4: Test laufen lassen**

Run: `bun test features/calendar/recurrence.test.ts`

Erwartet: die drei neuen Tests sind grün, **mehrere bestehende sind rot** — das ist richtig und der Beleg, dass das Verhalten sich geändert hat. Weiter zu Task 7, dort werden sie einzeln beurteilt.

---

## Task 7: Bestehende Assertions beurteilen und nachziehen

**Files:**

- Modify: `features/calendar/recurrence.test.ts` — die betroffenen Assertions

**Interfaces:**

- Consumes: nichts aus Task 5 — die dortigen Fixtures gehören zu `anchorMaster()`, dieser Task arbeitet an den Bestandstests um `makeMaster()`. Verwendet werden `CHANGES`, `makeMaster`, `MASTER_UPDATED_AT` aus dem Bestand.
- Produces: nichts.

**Hintergrund:** Nicht jede rote Assertion ist gleich zu behandeln. Diese Tabelle sagt für jede, was gilt. **Der Master in `makeMaster()` startet am 04.05. (`MASTER_START`), `CHANGES.start_at` liegt am 15.06.** — dieselbe Konstellation wie in Task 5, also derselbe Anker.

| Test (Zeile ≈)                                                           | Serie? | Erwartung danach                      |
| ------------------------------------------------------------------------ | ------ | ------------------------------------- |
| „scope=this on single → updateMaster"                                    | nein   | `CHANGES` — **unverändert**           |
| „scope=all → updateMaster"                                               | **ja** | verankert — **nachziehen**            |
| „scope=forward with cutoff < dtstart → updateMaster (no split)"          | ja     | `CHANGES` — **unverändert** (forward) |
| „scope=forward on non-recurring event → updateMaster (no split)"         | nein   | `CHANGES` — **unverändert**           |
| „scope=forward on count-series from the first occurrence → updateMaster" | ja     | `CHANGES` — **unverändert** (forward) |
| „recurrence change → updateMaster carries the rule …"                    | **ja** | verankert — **nachziehen**            |
| „recurrence change wins over scope=forward — no split is attempted"      | **ja** | verankert — **nachziehen**            |
| die beiden weiteren `recurrence`-Tests (`unchanged`, `none`)             | **ja** | verankert — **nachziehen**            |
| „updateMaster bekommt den Stempel des gelesenen Masters …"               | **ja** | verankert — **nachziehen**            |

Dass die drei Forward-Zeilen unverändert bleiben, ist **die Kernaussage** von PR B: „ab diesem Termin" _soll_ neu verankern, das ist seine Bedeutung. Nur „alle Termine" darf es nicht.

- [ ] **Step 1: Die Anker-Erwartung für die Bestandsfixture definieren**

Direkt unter `const CHANGES` in `features/calendar/recurrence.test.ts`:

```ts
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
```

- [ ] **Step 2: Die sechs Assertions nachziehen**

In jedem der sechs in der Tabelle mit **nachziehen** markierten Tests `CHANGES` durch `CHANGES_ANCHORED` ersetzen — **nur im `expect`, nicht im `changes:`-Argument**. Beispiel:

```ts
// vorher
expect(ops.updateMaster).toHaveBeenCalledWith("evt-1", CHANGES, MASTER_UPDATED_AT, NEW_RULE);
// nachher
expect(ops.updateMaster).toHaveBeenCalledWith(
  "evt-1",
  CHANGES_ANCHORED,
  MASTER_UPDATED_AT,
  NEW_RULE,
);
```

Beim Stempel-Test (`"2026-05-09T08:00:00.000Z"`) bleibt der dritte Parameter, wie er ist — nur der zweite wechselt.

- [ ] **Step 3: Die drei Forward-Tests mit einem Kommentar festhalten**

Über die drei Tests, die `CHANGES` **behalten**, je eine Zeile, damit niemand sie später „konsistent" nachzieht:

```ts
// Bleibt literal: „ab diesem Termin" verankert die Serie absichtlich neu —
// hier liegt der Schnitt am oder vor dem Serienanfang, die „Schwanzhälfte"
// ist die ganze Serie. Siehe `anchoredChanges` in `recurrence.ts`.
```

- [ ] **Step 4: Volle Suite**

Run: `bun test features/calendar/`
Erwartet: alles grün.

- [ ] **Step 5: Gates**

```bash
bun run typecheck && bun lint && bun format:check
```

- [ ] **Step 6: Commit**

```bash
git add features/calendar/recurrence.ts features/calendar/recurrence.test.ts
git commit -m "fix(calendar): Scope \"alle Termine\" verschiebt den Serienanker nicht mehr

start_at ist zugleich Termin-Startzeit und dtstart der Serie. Das Formular
hydriert aus der bearbeiteten Occurrence, ein unbedingtes Schreiben zog dtstart
also auf deren Datum — eine Serie ab 01.06., bearbeitet am 03.08., verlor
9 von 14 Vorkommen, ohne Fehler oder Meldung.

anchoredChanges übernimmt nur noch die Tageszeit und lässt das Datum des
Masters stehen, genau wie applyOptimisticChanges es für die Anzeige längst tut.
scope=forward bleibt unangetastet: dort ist Neu-Verankern die Bedeutung."
```

---

## Task 8: Ende-zu-Ende — die Vorkommenzahl bleibt erhalten

**Files:**

- Modify: `features/calendar/expand.test.ts`

**Interfaces:**

- Consumes: `expandEvents`, `makeRow` (beide bereits in der Datei), `lightTheme`.
- Produces: nichts.

**Hintergrund:** Task 5–7 prüfen, _was_ `updateMaster` bekommt. Dieser Test prüft, _was das bedeutet_ — er schickt die Master-Zeile vor und nach dem Anker durch dieselbe Expansion, die der Kalender benutzt, und zählt. Ohne ihn belegt die Suite die Absicht, nicht die Wirkung.

- [ ] **Step 1: Den Test schreiben**

Ans Ende von `features/calendar/expand.test.ts`:

```ts
describe("Serienanker", () => {
  test("die verankerte Fassung behält alle Vorkommen, die naive verliert sie", () => {
    // Wöchentliche Serie ab Montag, 01.06.2026, 18:00 Ortszeit.
    const series = makeRow({
      start_at: new Date(2026, 5, 1, 18, 0).toISOString(),
      end_at: new Date(2026, 5, 1, 19, 0).toISOString(),
      rrule_freq: "weekly",
    });
    const windowStart = new Date(2026, 5, 1);
    const windowEnd = new Date(2026, 7, 31, 23, 59, 59);

    const before = expandEvents([series], windowStart, windowEnd, lightTheme);

    // Was ein unbedingtes `updateMaster` geschrieben hätte: das Datum der am
    // 03.08. bearbeiteten Occurrence wandert in `start_at` und damit in dtstart.
    const naive = expandEvents(
      [
        {
          ...series,
          start_at: new Date(2026, 7, 3, 19, 0).toISOString(),
          end_at: new Date(2026, 7, 3, 20, 0).toISOString(),
        },
      ],
      windowStart,
      windowEnd,
      lightTheme,
    );

    // Was `anchoredChanges` schreibt: Datum des Masters, Uhrzeit der Eingabe.
    const anchored = expandEvents(
      [
        {
          ...series,
          start_at: new Date(2026, 5, 1, 19, 0).toISOString(),
          end_at: new Date(2026, 5, 1, 20, 0).toISOString(),
        },
      ],
      windowStart,
      windowEnd,
      lightTheme,
    );

    expect(naive.length).toBeLessThan(before.length);
    expect(anchored.length).toBe(before.length);
    // Und die neue Uhrzeit ist tatsächlich angekommen.
    expect(anchored[0].startAt.getHours()).toBe(19);
  });
});
```

- [ ] **Step 2: Test laufen lassen**

Run: `bun test features/calendar/expand.test.ts`
Erwartet: **pass.** Dieser Test ist bewusst kein Rot-vor-Grün-Test — er beschreibt eine Eigenschaft der Expansion, nicht des Fixes, und muss auch vor dem Fix schon halten. Failt er, stimmt die Fixture nicht (etwa weil `makeRow` andere Defaults setzt als angenommen).

- [ ] **Step 3: Gates und Commit**

```bash
bun run typecheck && bun lint && bun format:check && bun test
git add features/calendar/expand.test.ts
git commit -m "test(calendar): Wirkung des Serienankers auf die Expansion belegen"
```

---

## Task 9: ADR-032, Doku und PR B

**Files:**

- Modify: `docs/decision-log.md`
- Modify: `docs/TODO.md`
- Modify: `docs/roadmap.md`

**Hintergrund:** Die Spec (§8) hatte ADR-032 für Zonenmodell **und** Occurrence-Schlüssel vorgesehen. Beim Planen zeigte sich, dass hier drei getrennte Verträge entstehen — Anker, Zone, Schlüssel —, die nichts miteinander zu tun haben. Sie bekommen deshalb je einen ADR: **032 (dieser PR)**, 033 (Zonenmodell), 034 (Occurrence-Schlüssel). §8 der Spec ist bereits entsprechend nachgezogen — hier ist nichts mehr daran zu tun.

- [ ] **Step 1: ADR-032 anhängen**

Ans Ende von `docs/decision-log.md` (**niemals** einen älteren ADR umschreiben — CLAUDE.md → Documentation discipline):

Die Gliederung ist die des Hauses (`### Status` · `### Context` · `### Decisions` · `### Consequences`), Querverweise gehen auf den vollen, slugifizierten Überschriften-Anker — siehe ADR-031 als unmittelbares Vorbild.

```markdown
## ADR-032 — „Alle Termine" verankert die Serie nicht neu (2026-09-09)

### Status

Accepted. Ergänzt [ADR-008](#adr-008--kalender-v1-abgeschlossen-reminder-recurrence-editor-multi-day-2026-07-28) um die Schreibseite des Scope-Modells und zieht die Schreibrichtung an das nach, was [ADR-027](#adr-027--optimistische-kalender-updates-ein-occurrence-overlay-auf-der-anzeige-keine-cache-patches-2026-08-31) für die Anzeige längst tut. Löst nichts ab. Erster von drei ADRs aus Block 1 der Roadmap (032 Anker → 033 Zonenmodell → 034 Occurrence-Schlüssel).

### Context

`events.start_at` trägt zwei Bedeutungen: die Startzeit des Termins und den Anker `dtstart` der Serie (`buildRule` in [features/calendar/rrule.ts](../features/calendar/rrule.ts)). `EventEditScreen` hydriert sein Formular aus der angetippten Occurrence; `changes.start_at` trägt deshalb deren Datum, nicht das des Serienbeginns.

`applyEditScope` schrieb den Wert bei Scope „alle" unbedingt auf die Master-Zeile — `dtstart` wanderte mit, und jedes Vorkommen davor fiel aus `rule.between()`. Nachgemessen an einer wöchentlichen Serie ab 01.06.2026, bearbeitet an der Occurrence vom 03.08.: **9 von 14 Vorkommen verschwanden**, serverseitig, ohne Fehler oder Meldung. Trug die Serie ein `rrule_count`, verschob sich zusätzlich das ganze Zählfenster, weil COUNT relativ zu `dtstart` läuft.

Die Anzeige hatte den Fall längst richtig: `applyOptimisticChanges` nimmt bei `all`/`forward` auf einer Serie nur die **Tageszeit** und lässt jeder Occurrence ihr Datum. Anzeige und Schreibpfad widersprachen sich also, und die Anzeige hatte recht.

### Decisions

1. **Bei Scope „alle" auf einer Serie übernimmt der Master nur die Tageszeit.** Das Datum bleibt seines, die Dauer kommt aus der Eingabe (`anchoredChanges` in [features/calendar/recurrence.ts](../features/calendar/recurrence.ts)).
2. **Bei Scope „ab diesem Termin" bleibt es beim Neu-Verankern.** Das ist die Bedeutung des Scopes, kein Fehler — auch in den beiden Zweigen, in denen der Schnitt am oder vor dem Serienanfang liegt und die Schwanzhälfte deshalb die ganze Serie ist.
3. **Beim Einzeltermin gilt die Eingabe literal.** Dort verschiebt eine Datumsänderung den Termin tatsächlich, und es gibt keine Serie, die etwas verlieren könnte.
4. **Eine Regeländerung folgt derselben Regel.** Dass die Serie ohnehin neu definiert wird, rettet die Vorkommen vor der bearbeiteten Occurrence nicht — sie verschwinden mit dem wandernden `dtstart` genauso.
5. **Eine Datumsänderung unter Scope „alle" wird verworfen** — stumm. Eine Angabe fallen zu lassen ist ungleich billiger als neun Vorkommen zu löschen, und die Anzeige verspricht das Verworfene ohnehin schon. Ein sichtbarer Hinweis braucht einen Copy-Key und damit den Designer; der Eintrag steht in [docs/TODO.md](./TODO.md).

### Consequences

- Anzeige und Schreibpfad sagen dasselbe. Der Widerspruch, der `canApplyOptimistically` zu seiner Ausnahme für datumsändernde `all`/`forward`-Edits gezwungen hat, ist damit einseitig aufgelöst — die Ausnahme bleibt trotzdem richtig, weil das Overlay eine verworfene Änderung nicht zeigen soll.
- Wird eine Serie zum Einzeltermin gemacht, behält sie das Datum des Serienbeginns statt das der bearbeiteten Occurrence. Eine Regel gibt es dann nicht mehr, verloren geht nichts; die Alternative wäre eine dritte Sonderregel für einen seltenen Fall.
- `anchoredChanges` rechnet mit lokalen Gettern, wie `withTimeOfDay` es tut. Sobald `events` eine eigene Zeitzone trägt (ADR-033), gehört die Tageszeit in dieser Zone genommen — das ist der nächste PR desselben Blocks und der einzige bekannte Folgeschritt.
```

- [ ] **Step 2: Den erledigten TODO-Eintrag löschen**

In `docs/TODO.md`, Sektion „Calendar (V1 …)", den Eintrag **vollständig entfernen**:

> **„Alle Termine"-Scope verschiebt den Serienstart** …

- [ ] **Step 3: Die neue Grenze anlegen**

In derselben Sektion anhängen:

```markdown
- 🎨 **Eine Datumsänderung unter Scope „alle Termine" wird stillschweigend verworfen** ([features/calendar/recurrence.ts](../features/calendar/recurrence.ts) — `anchoredChanges`): Seit [ADR-032](./decision-log.md) übernimmt der Master bei Scope „alle" nur noch die Tageszeit; verschiebt der Nutzer im selben Vorgang das Datum, passiert damit nichts, ohne dass er es erfährt. Das ist die bewusst gewählte Seite des Tauschs — die Alternative war der stille Verlust ganzer Vorkommen —, aber ein Hinweis gehört hin. Vorbild ist das bestehende Banner `cal.edit.recurrenceAppliesToAll`; der Key dafür fehlt und gehört in die designer-eigene [docs/COPY.md](./COPY.md). Gehört zum 🎨-Paket in [docs/roadmap.md](./roadmap.md).
```

- [ ] **Step 4: Die Roadmap abhaken**

In `docs/roadmap.md`:

```markdown
### 1.2 „Alle Termine"-Scope verschiebt den Serienstart — **erledigt**
```

Und im 🎨-Abschnitt „Die 🎨-Punkte, gebündelt zur Übergabe" den neuen Copy-Bedarf ergänzen.

- [ ] **Step 5: Gates und Commit**

```bash
bun format:check
git add docs/decision-log.md docs/TODO.md docs/roadmap.md
git commit -m "docs: ADR-032 zum Serienanker, TODO und Roadmap nachziehen"
```

- [ ] **Step 6: CodeRabbit lokal**

Run: `coderabbit review --base main`

- [ ] **Step 7: PR öffnen**

```bash
git push -u origin fix/calendar-series-anchor
gh pr create --fill
```

- [ ] **Step 8: Sichtprüfung am Simulator**

Vor dem Merge, am Simulator (nicht auf Web):

1. Wöchentliche Serie anlegen, Start zwei Monate in der Vergangenheit.
2. Eine späte Occurrence öffnen, **nur die Uhrzeit** ändern, „Alle Termine" wählen, speichern.
3. Zurück in den Monat des Serienbeginns wischen: **alle** früheren Vorkommen sind noch da und tragen die neue Uhrzeit.
4. Gegenprobe mit „Ab diesem Termin": die Kopfhälfte behält die alte Uhrzeit, die Schwanzhälfte die neue.

Punkt 3 ist der eigentliche Beleg — vor dem Fix waren die früheren Vorkommen dort weg.

---

## Was danach kommt

PR 3 (Zeitumstellung + `events.timezone`) und PR 4 (Override-Modell) bekommen je einen eigenen Plan. PR 3 beginnt mit einer Gegenprobe, ob `Intl.DateTimeFormat` mit `timeZone` und `formatToParts` unter Hermes auf iOS **und** Android trägt — das Repo nutzt heute nirgends `Intl` zur Laufzeit, und ein bestandener `bun test` beweist dafür nichts. Fällt sie aus, ändert das das Innere von `features/calendar/timezone.ts`, nicht den übrigen Entwurf. Details in §5.8 der Spec.
