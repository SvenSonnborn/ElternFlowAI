# Die Regel im Vergleich — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ändern zwei Eltern denselben Termin nur am Rhythmus, erscheint der Konflikt-Dialog, statt dass die zuletzt gespeicherte Regel still gewinnt und dabei alle Ausnahmen der Serie löscht.

**Architecture:** Ein Regel-Vergleich für das ganze Feature in `features/calendar/rule.ts` (`ruleOf`, `sameRule`), mit zwei Lesern: `ruleDiffers` (löscht es die Exceptions?) und `differingEventFields` (ist es ein Konflikt?). Die Regel wird ein sechstes Konfliktfeld, dreiwertig wie die anderen fünf. Der Dialog zeigt sie in bis zu zwei Zeilen aus vorhandenen Copy-Keys; die Zeilen baut ein reiner, getesteter Helfer neben dem Screen.

**Tech Stack:** TypeScript ~6.0 strict · `bun test` (`bun:test`-Importe) · React Native 0.86 · react-i18next

**Spec:** [docs/superpowers/specs/2026-09-17-tasks-delete-path-conflict-gaps-design.md](../specs/2026-09-17-tasks-delete-path-conflict-gaps-design.md) — **§5** ist dieser PR, **§5.0** hält drei Messungen vor der Umsetzung fest, die §5.1, §5.3 und Decisions 9/10 geändert haben. Lies §5.0 zuerst.

**Roadmap:** [docs/roadmap.md](../../roadmap.md) → Block 2, Punkt **2.2a** (der erste Spiegelstrich von 2.2).

## Global Constraints

- **Handoff-Bundle ist tabu**: `design-system/{colors,typography,spacing,themes,components,index}.ts`, `docs/{HANDOFF,COPY,ICONS,README}.md`, `patterns/*.md`. Dieser PR braucht **keinen neuen Copy-Key** — alle Beschriftungen existieren: `cal.create.fieldRecurrence`, `cal.create.fieldRecurrenceCount`, `cal.create.recurrenceCountUnlimited`, `cal.recur.<option>`, `conflict.theirs`, `conflict.mine`.
- **Kein `Co-Authored-By: Claude`-Trailer** in irgendeinem Commit (CLAUDE.md geht jeder anderslautenden Anweisung vor).
- **Pre-Commit-Hooks (`lint-staged`) niemals mit `--no-verify` umgehen.**
- **Ältere ADRs werden nie umgeschrieben**, nur abgelöst. ADR-038 wird angehängt.
- **Jede neue exportierte Funktion/Konstante und jedes neue Modul bekommt einen JSDoc-Block im selben Commit** — das Nicht-Offensichtliche, nicht die Wiederholung des Namens.
- **Testrunner ist `bun test`**, nicht `jest`. Deutsche Testnamen und Kommentare.
- **Screens sind unter `bun test` nicht ladbar** (`nativewind` → `react-native-css-interop` crasht beim Modul-Load). Deshalb liegt jede testwürdige Logik in reinen Modulen; der Screen verdrahtet nur.
- **Gates vor jedem Commit grün**: `bun run typecheck`, `bun lint`, `bun test`, `bun format:check`.
- **Baseline:** 815 pass · 1 todo · 0 fail über 70 Dateien. Jede Task-Meldung nennt die Zahlen.
- **`features/calendar` unter `TZ=Europe/Berlin`, `TZ=UTC`, `TZ=America/New_York`** mit identischem Ergebnis — `rule.ts` vergleicht Zeitpunkte.

---

### Task 1: `rule.ts` — ein Regel-Vergleich für das Feature

**Files:**

- Create: `features/calendar/rule.ts`, `features/calendar/rule.test.ts`
- Modify: `features/calendar/recurrence.ts` (`ruleDiffers`, ~Zeile 197-208, plus Import)
- Modify: `features/calendar/recurrence.test.ts` (zwei Tests in der `applyEditScope`-Suite)

**Interfaces:**

- Produces: `ruleOf(columns: RuleColumns): OccurrenceRrule` und `sameRule(a: OccurrenceRrule, b: OccurrenceRrule): boolean` aus `features/calendar/rule.ts`. `OccurrenceRrule` ist der bestehende Typ aus `features/calendar/types.ts` — **kein neuer Typ**.

**Kontext, der nicht im Diff steht:**

- `OccurrenceRrule` (`types.ts`) hat genau die fünf Felder `freq`, `interval`, `byweekday`, `count`, `until`; jede `CalendarOccurrence` trägt sie als `occ.rrule` (gebaut in `expand.ts` ~Zeile 237). `RecurrenceChanges` (`recurrence.ts`) hat genau die fünf Spalten `rrule_freq` … `rrule_until` einer `events`-Zeile. Deshalb **eine** Funktion `ruleOf` für Master-Zeile und Formular-Regel, und keine für Occurrences.
- **Die `until`-Änderung ist eine Absicherung, kein Bugfix** — gemessen: Das Formular reicht `until` als Server-String durch (`EventEditScreen.tsx`, `buildRecurrenceChanges`), kein heutiger Pfad bringt `…+00:00` und `…Z` in denselben Vergleich. Der rote Test unten arbeitet deshalb mit einer **konstruierten** Eingabe und sagt das im Kommentar. Nichts im Report, im Code oder in Commit-Messages darf einen beobachteten Fehler behaupten.
- `byweekday` als Menge: Für Listen ohne Doppelungen — und nur solche schreibt `recurrenceToRrule` — urteilt das genau wie das bisherige `ruleDiffers`.

- [ ] **Step 1: Die beiden `ruleDiffers`-Tests schreiben**

In `features/calendar/recurrence.test.ts`, direkt **nach** dem Test `"recurrence identical to the master → exceptions survive"`:

```ts
test("dasselbe Serienende in anderer Schreibweise ist keine Regeländerung", async () => {
  // Konstruiert: Heute bringt kein Pfad beide Schreibweisen hierher — das
  // Formular reicht `until` als Server-String durch (ADR-038). Der Test hält
  // fest, dass `ruleDiffers` davon nicht mehr abhängt: PostgREST liefert
  // `…+00:00`, `toISOString()` schreibt `…Z`, gemeint ist derselbe Zeitpunkt.
  const ops = makeOps();
  const sameEnd: RecurrenceChanges = {
    rrule_freq: "weekly",
    rrule_interval: 1,
    rrule_byweekday: [1],
    rrule_count: null,
    rrule_until: "2026-09-27T21:59:59.999Z",
  };
  await applyEditScope({
    ops,
    scope: "all",
    eventId: "evt-1",
    occurrenceKey: "2026-06-15",
    isRecurring: true,
    master: makeMaster({ rrule_until: "2026-09-27T21:59:59.999+00:00" }),
    changes: CHANGES,
    recurrence: sameEnd,
  });
  expect(ops.deleteAllExceptions).not.toHaveBeenCalled();
});

test("ein anderes Serienende bleibt eine Regeländerung", async () => {
  // Gegenprobe: Der Zeitvergleich darf nicht großzügiger werden als nötig.
  const ops = makeOps();
  const laterEnd: RecurrenceChanges = {
    rrule_freq: "weekly",
    rrule_interval: 1,
    rrule_byweekday: [1],
    rrule_count: null,
    rrule_until: "2026-10-04T21:59:59.999Z",
  };
  await applyEditScope({
    ops,
    scope: "all",
    eventId: "evt-1",
    occurrenceKey: "2026-06-15",
    isRecurring: true,
    master: makeMaster({ rrule_until: "2026-09-27T21:59:59.999+00:00" }),
    changes: CHANGES,
    recurrence: laterEnd,
  });
  expect(ops.deleteAllExceptions).toHaveBeenCalledWith("evt-1");
});
```

- [ ] **Step 2: Rot vorführen**

Run: `bun test features/calendar/recurrence.test.ts`
Erwartet: **genau ein** Fehlschlag, „dasselbe Serienende in anderer Schreibweise …" (`deleteAllExceptions` wurde gerufen). Die Gegenprobe ist schon grün. Die wörtliche Ausgabe gehört in den Report.

- [ ] **Step 3: `rule.ts` anlegen**

`features/calendar/rule.ts`:

```ts
import type { Database } from "@/features/supabase/database.types";

import type { OccurrenceRrule } from "./types";

type EventRow = Database["public"]["Tables"]["events"]["Row"];

/**
 * Die fünf `rrule_*`-Spalten — einer `events`-Zeile ebenso wie
 * `RecurrenceChanges`, das genau diese Spalten schreibt.
 */
type RuleColumns = Pick<
  EventRow,
  "rrule_freq" | "rrule_interval" | "rrule_byweekday" | "rrule_count" | "rrule_until"
>;

/**
 * Die Regel aus den fünf `rrule_*`-Spalten, in der Form, die jede
 * `CalendarOccurrence` schon als `occ.rrule` trägt (gebaut in `expand.ts`).
 *
 * Eine Funktion für beide Quellen, weil beide dieselben Spalten haben: den
 * gelesenen Master (`ruleDiffers`) und das, was das Formular schreiben will
 * (`RecurrenceChanges`, im Konflikt-Vergleich). Eine Occurrence braucht keinen
 * Umwandler — `occ.rrule` ist bereits diese Form.
 */
export function ruleOf(columns: RuleColumns): OccurrenceRrule {
  return {
    freq: columns.rrule_freq,
    interval: columns.rrule_interval,
    byweekday: columns.rrule_byweekday,
    count: columns.rrule_count,
    until: columns.rrule_until,
  };
}

/** Wochentage als Menge: Die Reihenfolge ist keine Information, `null` und `[]` heißen beide „keine". */
function sameDays(a: number[] | null, b: number[] | null): boolean {
  const left = new Set(a ?? []);
  const right = new Set(b ?? []);
  return left.size === right.size && [...left].every((day) => right.has(day));
}

/**
 * Das Serienende als Zeitpunkt, nicht als Zeichenkette — wie `sameInstant` in
 * `conflict.ts` für Start und Ende. Der Server liefert PostgREST-Zeitstempel
 * (`…+00:00`), `toISOString()` schreibt `…Z`.
 *
 * Eine Absicherung, kein Bugfix: Heute bringt kein Pfad beide Schreibweisen in
 * denselben Vergleich, weil das Formular `until` als Server-String durchreicht
 * (ADR-038). Der Stringvergleich hing aber an genau dieser ungeprüften Annahme.
 *
 * Gleiche Zeichenketten gelten als gleich, bevor geparst wird — die Umstellung
 * macht also nur Paare gleich, die vorher verschieden waren, nie umgekehrt.
 * `null` wird vor dem Parsen abgefangen: `new Date(null)` ist die Epoche, nicht
 * `NaN`. Ein unparsbarer Wert wird `NaN` und damit ungleich — bei einem kaputten
 * Datum ist „verschieden" die sichere Richtung.
 */
function sameUntil(a: string | null, b: string | null): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  return new Date(a).getTime() === new Date(b).getTime();
}

/**
 * Ob zwei Regeln übereinstimmen — Spalte für Spalte, mit zwei Ausnahmen von der
 * wörtlichen Gleichheit: Wochentage als Menge, das Serienende als Zeitpunkt.
 *
 * Der **eine** Regel-Vergleich des Kalenders (ADR-038). Zwei Leser urteilen
 * über dieselbe Frage: `ruleDiffers` in `recurrence.ts` entscheidet, ob ein
 * Speichern die Exceptions der Serie löscht, `differingEventFields` in
 * `conflict.ts`, ob eine fremde Regeländerung ein Konflikt ist. Zwei leicht
 * verschiedene Vergleiche würden dieselbe Frage an beiden Stellen verschieden
 * beantworten.
 *
 * Zwei Regeln, die dieselben Termine auf verschiedenem Weg beschreiben
 * (wöchentlich ohne Wochentag gegen wöchentlich am Wochentag des Serienstarts),
 * gelten als verschieden — wie schon im alten `ruleDiffers`.
 */
export function sameRule(a: OccurrenceRrule, b: OccurrenceRrule): boolean {
  return (
    a.freq === b.freq &&
    a.interval === b.interval &&
    sameDays(a.byweekday, b.byweekday) &&
    a.count === b.count &&
    sameUntil(a.until, b.until)
  );
}
```

- [ ] **Step 4: `ruleDiffers` umstellen**

In `features/calendar/recurrence.ts` den Import ergänzen (die ESLint-Sortierung räumt notfalls `bun lint:fix` nach):

```ts
import { ruleOf, sameRule } from "./rule";
```

und `ruleDiffers` samt seinem Docstring ersetzen:

```ts
/**
 * Ob das Speichern die Regel wirklich ändert — ein unverändert zurückgeschickter
 * Rhythmus soll die Exceptions der Serie nicht löschen. Der Vergleich selbst
 * liegt in `rule.ts`: derselbe, mit dem der Konflikt-Dialog eine fremde
 * Regeländerung erkennt (ADR-038).
 */
function ruleDiffers(master: EventRow, next: RecurrenceChanges): boolean {
  return !sameRule(ruleOf(master), ruleOf(next));
}
```

- [ ] **Step 5: `rule.test.ts` anlegen**

```ts
import { describe, expect, test } from "bun:test";

import type { OccurrenceRrule } from "./types";

import { ruleOf, sameRule } from "./rule";

const WEEKLY: OccurrenceRrule = {
  freq: "weekly",
  interval: 1,
  byweekday: [1],
  count: null,
  until: null,
};

function rule(overrides: Partial<OccurrenceRrule> = {}): OccurrenceRrule {
  return { ...WEEKLY, ...overrides };
}

describe("sameRule", () => {
  test("identische Regeln sind gleich", () => {
    expect(sameRule(rule(), rule())).toBe(true);
  });

  test("jedes der fünf Felder macht für sich einen Unterschied", () => {
    expect(sameRule(rule(), rule({ freq: "daily" }))).toBe(false);
    expect(sameRule(rule(), rule({ interval: 2 }))).toBe(false);
    expect(sameRule(rule(), rule({ byweekday: [3] }))).toBe(false);
    expect(sameRule(rule(), rule({ count: 10 }))).toBe(false);
    expect(sameRule(rule(), rule({ until: "2026-09-27T21:59:59.999Z" }))).toBe(false);
  });

  test("Wochentage vergleichen als Menge, nicht als Liste", () => {
    expect(sameRule(rule({ byweekday: [1, 3, 5] }), rule({ byweekday: [5, 1, 3] }))).toBe(true);
  });

  test("null und eine leere Liste bedeuten beide: keine Wochentage", () => {
    expect(sameRule(rule({ byweekday: null }), rule({ byweekday: [] }))).toBe(true);
  });

  test("das Serienende vergleicht als Zeitpunkt, nicht als Zeichenkette", () => {
    // PostgREST liefert `…+00:00`, `toISOString()` schreibt `…Z`.
    expect(
      sameRule(
        rule({ until: "2026-09-27T21:59:59.999+00:00" }),
        rule({ until: "2026-09-27T21:59:59.999Z" }),
      ),
    ).toBe(true);
  });

  test("ein fehlendes Serienende gegen ein gesetztes ist ein Unterschied", () => {
    expect(sameRule(rule({ until: null }), rule({ until: "2026-09-27T21:59:59.999Z" }))).toBe(
      false,
    );
    expect(sameRule(rule({ until: null }), rule({ until: null }))).toBe(true);
  });
});

describe("ruleOf", () => {
  test("bildet die fünf rrule-Spalten auf die Form von occ.rrule ab", () => {
    expect(
      ruleOf({
        rrule_freq: "monthly",
        rrule_interval: 1,
        rrule_byweekday: null,
        rrule_count: 6,
        rrule_until: null,
      }),
    ).toEqual({ freq: "monthly", interval: 1, byweekday: null, count: 6, until: null });
  });
});
```

- [ ] **Step 6: Grün + Gates**

Run: `bun test features/calendar` → grün. Dann alle vier Gates. Erwartet: **824 pass** (815 + 2 in `recurrence.test.ts` + 7 in `rule.test.ts`). Dazu `features/calendar` unter den drei Zonen (siehe Global Constraints) — Ergebnis identisch.

- [ ] **Step 7: Commit**

```bash
git add features/calendar/rule.ts features/calendar/rule.test.ts \
  features/calendar/recurrence.ts features/calendar/recurrence.test.ts
git commit -m "refactor(calendar): ein Regel-Vergleich in rule.ts, Serienende als Zeitpunkt"
```

---

### Task 2: Die Regel im Vergleich und im Dialog

**Files:**

- Modify: `features/calendar/conflict.ts` (Feldtyp, vierter Parameter), `features/calendar/conflict.test.ts`
- Create: `app-sections/event/recurrenceConflictRows.ts`, `app-sections/event/recurrenceConflictRows.test.ts`
- Modify: `app-sections/event/EventEditScreen.tsx` (`FIELD_LABEL_KEY`, `formatField`, `showConflict`)
- Modify: `docs/TODO.md` (einen Eintrag löschen, einen 🎨-Eintrag anlegen)

**Interfaces:**

- Consumes: `ruleOf`, `sameRule` aus `features/calendar/rule.ts` (Task 1).
- Produces: `EventConflictField` um `"recurrence"` erweitert; `differingEventFields(theirs, mine, base, mineRecurrence?: RecurrenceChanges | null)`; `recurrenceConflictRows(theirs, mine, t): ConflictRow[]`.

**Kontext, der nicht im Diff steht:**

- **Die Anzeige ist entschieden (2026-09-18, Spec §5.3):** zwei Zeilen aus vorhandenen Keys, **keine neuen**. Option: Label `cal.create.fieldRecurrence`, Wert `cal.recur.<option>` oder „—". Serienende: Label `cal.create.fieldRecurrenceCount` („Endet nach … Terminen“ — eine Beschriftung, deshalb als **Label** benutzt, nicht als Wert-Vorlage), Wert = die Zahl, `cal.create.recurrenceCountUnlimited` nur ohne Anzahl **und** ohne Enddatum, sonst „—". Eine Zeile nur, wenn ihre beiden **angezeigten** Texte verschieden sind; ist es keine, trotzdem die Options-Zeile.
- **Das Hinzufügen von `"recurrence"` zum Union bricht zwei Stellen im Screen beim Kompilieren** — `FIELD_LABEL_KEY: Record<EventConflictField, string>` und den erschöpfenden `switch` in `formatField`. Beide bekommen `Exclude<EventConflictField, "recurrence">`; die Regel-Zeilen baut der Helfer mit eigenen Labels. Das ist gewollt: Detektion und Anzeige müssen in einem Commit landen, sonst ist der Baum dazwischen rot.
- Der Wochentag für `rruleToRecurrence` wird geprüft wie bei der Hydration (`EventEditScreen`, `initial`): die fremde Fassung gegen `theirs.startAt` in `theirs.timezone`, die eigene gegen `vars.changes.start_at` in `vars.timezone` — die Werte, mit denen das Formular die Regel gebaut hat.
- `rruleToRecurrence` kommt direkt aus `@/features/calendar/createMutation`, **nicht** aus dem Barrel `@/features/calendar` (der zieht Hooks, die unter `bun test` nicht laden). Gemessen: Der direkte Import lädt neben dem Screen sauber.
- Vorbild für den Helfer samt Test: `app-sections/event/submitLock.ts` / `submitLock.test.ts`; für `t: Translate`: `features/calendar/undoDeleteMessage.ts`.

- [ ] **Step 1: Die Konflikt-Tests schreiben**

In `features/calendar/conflict.test.ts` den Import um `RecurrenceChanges` und `OccurrenceRrule` erweitern:

```ts
import type { EventChanges, RecurrenceChanges } from "./recurrence";
import type { CalendarOccurrence, OccurrenceRrule } from "./types";
```

und am Dateiende anhängen:

```ts
describe("differingEventFields — die Regel", () => {
  const WEEKLY: OccurrenceRrule = {
    freq: "weekly",
    interval: 1,
    byweekday: [1],
    count: null,
    until: null,
  };
  const base = () => theirs({ isRecurring: true, rrule: WEEKLY });
  // Die fremde Fassung: B hat die Serie auf zehn Termine begrenzt.
  const fremd = (overrides: Partial<CalendarOccurrence> = {}) =>
    theirs({ isRecurring: true, rrule: { ...WEEKLY, count: 10 }, ...overrides });
  const rule = (overrides: Partial<RecurrenceChanges> = {}): RecurrenceChanges => ({
    rrule_freq: "weekly",
    rrule_interval: 1,
    rrule_byweekday: [1],
    rrule_count: null,
    rrule_until: null,
    ...overrides,
  });

  test("beide ändern die Regel verschieden → Konflikt", () => {
    expect(differingEventFields(fremd(), mine(), base(), rule({ rrule_count: 6 }))).toEqual([
      "recurrence",
    ]);
  });

  test("ich ändere Titel und Regel, die andere Seite nur die Regel → nur die Regel", () => {
    // Das Szenario, in dem der Drei-Wege-Vergleich (ADR-031) die Lücke schärfer
    // gemacht hatte: Meine Titeländerung ist keine fremde, die Liste war leer.
    expect(
      differingEventFields(
        fremd(),
        mine({ title: "Kieferorthopäde" }),
        base(),
        rule({ rrule_freq: "daily", rrule_byweekday: null }),
      ),
    ).toEqual(["recurrence"]);
  });

  test("GRENZWÄCHTER: ich fasse die Regel nicht an → kein Konflikt, auch wenn sie fremd geändert wurde", () => {
    // Ohne Regel im Schreibvorgang stehen die `rrule_*`-Spalten nicht im
    // UPDATE — es gibt nichts zu überschreiben.
    expect(differingEventFields(fremd(), mine(), base(), null)).toEqual([]);
    expect(differingEventFields(fremd(), mine(), base())).toEqual([]);
  });

  test("GRENZWÄCHTER: beide ändern die Regel gleich → kein Konflikt", () => {
    expect(differingEventFields(fremd(), mine(), base(), rule({ rrule_count: 10 }))).toEqual([]);
  });

  test("nur ich ändere die Regel → meine eigene Bearbeitung, kein Konflikt", () => {
    expect(differingEventFields(base(), mine(), base(), rule({ rrule_count: 6 }))).toEqual([]);
  });

  test("die Regel steht in der Liste hinter den fünf Feldern", () => {
    expect(
      differingEventFields(
        fremd({ title: "Fremd" }),
        mine({ title: "Meins" }),
        base(),
        rule({ rrule_count: 6 }),
      ),
    ).toEqual(["title", "recurrence"]);
  });
});
```

- [ ] **Step 2: Rot vorführen**

Run: `bun test features/calendar/conflict.test.ts`
Erwartet: **drei** Fehlschläge — „beide ändern die Regel verschieden", „ich ändere Titel und Regel …", „die Regel steht in der Liste hinter den fünf Feldern" (`bun test` prüft keine Typen, das vierte Argument wird heute schlicht ignoriert). Die drei übrigen sind schon grün: Sie halten die Grenzen fest, die der Fix nicht verschieben darf. Wörtliche Ausgabe in den Report.

- [ ] **Step 3: `conflict.ts` erweitern**

Die Importe:

```ts
import type { EventChanges, RecurrenceChanges } from "./recurrence";
import type { CalendarOccurrence } from "./types";

import { ruleOf, sameRule } from "./rule";
```

Den Feldtyp samt Docstring ersetzen:

```ts
/**
 * Was das Bearbeiten-Formular schreibt und ein Konflikt sein kann: die fünf
 * Felder aus `EventChanges` — und seit ADR-038 die Regel, die nicht in
 * `EventChanges` steckt, sondern daneben in `RecurrenceChanges`.
 */
export type EventConflictField =
  "title" | "start_at" | "end_at" | "location" | "description" | "recurrence";
```

Am Docstring von `differingEventFields` **vor** dem schließenden `*/` einen Absatz anhängen:

```ts
 *
 * `mineRecurrence` ist die Regel, die dieser Schreibvorgang mitführt
 * (`vars.recurrence`). Fehlt sie, stehen die `rrule_*`-Spalten gar nicht im
 * UPDATE (`updateMaster` schreibt sie nur mit, wenn sie da ist) — eine fremde
 * Regeländerung kann dann nicht überschrieben werden, dieselbe Begründung, mit
 * der `differingTaskFields` seine `undefined`-Felder überspringt. Bis ADR-038
 * floss die Regel gar nicht ein: Änderten zwei Eltern denselben Termin nur am
 * Rhythmus, war die Liste leer, der Screen speicherte still durch, und
 * `applyEditScope` löschte dabei vorher alle Exceptions der Serie.
```

Die Signatur um den vierten Parameter erweitern:

```ts
export function differingEventFields(
  theirs: CalendarOccurrence,
  mine: EventChanges,
  base: CalendarOccurrence,
  mineRecurrence?: RecurrenceChanges | null,
): EventConflictField[] {
```

und vor `return out;` einfügen:

```ts
if (
  mineRecurrence != null &&
  !sameRule(theirs.rrule, base.rrule) &&
  !sameRule(theirs.rrule, ruleOf(mineRecurrence))
) {
  out.push("recurrence");
}
```

Run: `bun test features/calendar/conflict.test.ts` → grün.

- [ ] **Step 4: Den Zeilen-Helfer mit Tests anlegen**

`app-sections/event/recurrenceConflictRows.test.ts` **zuerst**:

```ts
import { describe, expect, test } from "bun:test";

import type { RecurrenceChanges } from "@/features/calendar/recurrence";
import type { OccurrenceRrule } from "@/features/calendar/types";

import { recurrenceConflictRows } from "./recurrenceConflictRows";

// Gibt den Key zurück — so prüft der Test, WELCHER Text gewählt wurde, ohne
// von der Übersetzung abzuhängen.
const t = (key: string) => key;

// Montag, 15.06.2026, 17:00 in Berlin — ein wöchentlicher Termin am Montag.
const START = new Date("2026-06-15T15:00:00.000Z");
const ZONE = "Europe/Berlin";

const WEEKLY: OccurrenceRrule = {
  freq: "weekly",
  interval: 1,
  byweekday: [1],
  count: null,
  until: null,
};

function theirs(rrule: Partial<OccurrenceRrule> = {}) {
  return { rrule: { ...WEEKLY, ...rrule }, startAt: START, timezone: ZONE };
}

function mine(recurrence: Partial<RecurrenceChanges> = {}) {
  return {
    recurrence: {
      rrule_freq: "weekly" as const,
      rrule_interval: 1,
      rrule_byweekday: [1],
      rrule_count: null,
      rrule_until: null,
      ...recurrence,
    },
    startAt: START,
    timezone: ZONE,
  };
}

describe("recurrenceConflictRows", () => {
  test("nur die Anzahl weicht ab → nur die Serienende-Zeile", () => {
    expect(recurrenceConflictRows(theirs({ count: 10 }), mine({ rrule_count: 6 }), t)).toEqual([
      {
        label: "cal.create.fieldRecurrenceCount",
        theirs: "conflict.theirs: 10",
        mine: "conflict.mine: 6",
      },
    ]);
  });

  test("nur die Option weicht ab → nur die Options-Zeile", () => {
    expect(
      recurrenceConflictRows(theirs(), mine({ rrule_freq: "daily", rrule_byweekday: null }), t),
    ).toEqual([
      {
        label: "cal.create.fieldRecurrence",
        theirs: "conflict.theirs: cal.recur.weekly",
        mine: "conflict.mine: cal.recur.daily",
      },
    ]);
  });

  test("eine an einem Datum beendete Serie heißt nie „Unbegrenzt“", () => {
    // B hat per „ab hier löschen" ein Enddatum gesetzt, A lässt die Serie offen.
    const rows = recurrenceConflictRows(
      theirs({ until: "2026-09-27T21:59:59.999+00:00" }),
      mine(),
      t,
    );
    expect(rows).toEqual([
      {
        label: "cal.create.fieldRecurrenceCount",
        theirs: "conflict.theirs: —",
        mine: "conflict.mine: cal.create.recurrenceCountUnlimited",
      },
    ]);
  });

  test("kein sichtbarer Unterschied → trotzdem die Options-Zeile", () => {
    // Zwei verschiedene Enddaten: beide zeigen „—", die Option ist gleich. Der
    // Vergleich hat trotzdem einen Konflikt gemeldet — der Dialog darf ihn
    // nicht ohne Zeile zeigen.
    const rows = recurrenceConflictRows(
      theirs({ until: "2026-09-27T21:59:59.999+00:00" }),
      mine({ rrule_until: "2026-10-04T21:59:59.999+00:00" }),
      t,
    );
    expect(rows).toEqual([
      {
        label: "cal.create.fieldRecurrence",
        theirs: "conflict.theirs: cal.recur.weekly",
        mine: "conflict.mine: cal.recur.weekly",
      },
    ]);
  });

  test("eine fremde Regel außerhalb der fünf Optionen erscheint als „—“", () => {
    const rows = recurrenceConflictRows(theirs({ interval: 2 }), mine(), t);
    expect(rows[0]).toEqual({
      label: "cal.create.fieldRecurrence",
      theirs: "conflict.theirs: —",
      mine: "conflict.mine: cal.recur.weekly",
    });
  });
});
```

Run: `bun test app-sections/event/recurrenceConflictRows.test.ts` → rot (Modul fehlt). Dann `app-sections/event/recurrenceConflictRows.ts`:

```ts
import type { ConflictRow } from "@/app-sections/shared/conflictStore";
import type { RecurrenceChanges } from "@/features/calendar/recurrence";
import type { CalendarOccurrence, OccurrenceRrule } from "@/features/calendar/types";
import type { Translate } from "@/features/shared";

// Direkt aus dem Modul, nicht aus dem Barrel `@/features/calendar`: Der zieht
// Hooks, die unter `bun test` nicht laden, und dieser Helfer existiert gerade,
// damit seine Zweige testbar sind.
import { rruleToRecurrence } from "@/features/calendar/createMutation";
import { ruleOf } from "@/features/calendar/rule";

/** Die eigene Seite: die Regel, die geschrieben würde, und wo ihr Wochentag gilt. */
interface MineSide {
  recurrence: RecurrenceChanges;
  /** Der Start, mit dem das Formular die Regel gebaut hat (`vars.changes.start_at`). */
  startAt: Date;
  /** Die Zone des Termins (`vars.timezone`) — dort prüft `rruleToRecurrence` den Wochentag. */
  timezone: string;
}

function optionText(rule: OccurrenceRrule, startAt: Date, timezone: string, t: Translate): string {
  const option = rruleToRecurrence(
    { rrule_freq: rule.freq, rrule_interval: rule.interval, rrule_byweekday: rule.byweekday },
    startAt,
    timezone,
  );
  return option == null ? "—" : t(`cal.recur.${option}`);
}

/**
 * „Unbegrenzt" nur ohne Anzahl **und** ohne Enddatum: Eine per „ab hier
 * löschen" an einem Datum beendete Serie hat keine Anzahl, ist aber nicht
 * unbegrenzt. Für ein Enddatum gibt es keinen Key — „—" ist dort karg, aber
 * nicht falsch (🎨-Eintrag in `docs/TODO.md`).
 */
function endText(rule: OccurrenceRrule, t: Translate): string {
  if (rule.count != null) return String(rule.count);
  if (rule.until != null) return "—";
  return t("cal.create.recurrenceCountUnlimited");
}

/**
 * Die Dialogzeilen für eine abweichende Wiederholungsregel — bis zu zwei, eine
 * je Bedienelement des Formulars: die Option („Wiederholung") und das
 * Serienende („Endet nach … Terminen"). Beide Beschriftungen existieren; eine
 * Zeile, die die ganze Regel beschreibt, bräuchte neue Copy-Keys (ADR-038).
 *
 * Eine Zeile erscheint nur, wenn sich ihre beiden **angezeigten** Texte
 * unterscheiden. Zeigt keine einen Unterschied — er liegt dann in einem Teil
 * der Regel, den das Formular nicht darstellt: Intervall, Wochentage, zwei
 * verschiedene Enddaten —, erscheint die Options-Zeile trotzdem.
 * `differingEventFields` hat einen echten Konflikt gemeldet; ein Dialog, der
 * ihn meldet und nichts zeigt, wäre schlechter als zwei gleiche Werte.
 *
 * Ein eigenes Modul statt Code in `showConflict`, weil `EventEditScreen` unter
 * `bun test` nicht ladbar ist und diese Zweige einen Test verdienen.
 */
export function recurrenceConflictRows(
  theirs: Pick<CalendarOccurrence, "rrule" | "startAt" | "timezone">,
  mine: MineSide,
  t: Translate,
): ConflictRow[] {
  const mineRule = ruleOf(mine.recurrence);
  const theirsOption = optionText(theirs.rrule, theirs.startAt, theirs.timezone, t);
  const mineOption = optionText(mineRule, mine.startAt, mine.timezone, t);
  const theirsEnd = endText(theirs.rrule, t);
  const mineEnd = endText(mineRule, t);

  const optionRow: ConflictRow = {
    label: t("cal.create.fieldRecurrence"),
    theirs: `${t("conflict.theirs")}: ${theirsOption}`,
    mine: `${t("conflict.mine")}: ${mineOption}`,
  };

  const rows: ConflictRow[] = [];
  if (theirsOption !== mineOption) rows.push(optionRow);
  if (theirsEnd !== mineEnd) {
    rows.push({
      label: t("cal.create.fieldRecurrenceCount"),
      theirs: `${t("conflict.theirs")}: ${theirsEnd}`,
      mine: `${t("conflict.mine")}: ${mineEnd}`,
    });
  }
  if (rows.length === 0) rows.push(optionRow);
  return rows;
}
```

Run: `bun test app-sections/event/recurrenceConflictRows.test.ts` → grün.

- [ ] **Step 5: Den Screen verdrahten**

In `app-sections/event/EventEditScreen.tsx`:

**(a)** Import neben den anderen lokalen Importen:

```ts
import { recurrenceConflictRows } from "./recurrenceConflictRows";
```

**(b)** `FIELD_LABEL_KEY` — Typ und Kommentar:

```ts
/**
 * Welcher Copy-Key welches Feld benennt — die Beschriftungen des Formulars.
 * Ohne `recurrence`: Die Regel bekommt bis zu zwei Zeilen mit eigenen
 * Beschriftungen, die `recurrenceConflictRows` baut (ADR-038).
 */
const FIELD_LABEL_KEY: Record<Exclude<EventConflictField, "recurrence">, string> = {
```

**(c)** `formatField`: der erste Parameter wird `field: Exclude<EventConflictField, "recurrence">,` — sonst nichts an der Funktion.

**(d)** In `showConflict` den Aufruf um das vierte Argument erweitern:

```ts
const fields =
  theirs && baseOccurrence
    ? differingEventFields(theirs, vars.changes, baseOccurrence, vars.recurrence)
    : [];
```

**(e)** In `conflict.show({ … })` den `rows`-Ausdruck ersetzen:

```ts
        rows:
          theirs === null
            ? []
            : fields.flatMap((field) => {
                if (field !== "recurrence") {
                  return [
                    {
                      label: t(FIELD_LABEL_KEY[field]),
                      theirs: `${t("conflict.theirs")}: ${formatField(field, theirs)}`,
                      mine: `${t("conflict.mine")}: ${formatField(field, mineSource)}`,
                    },
                  ];
                }
                // `differingEventFields` meldet die Regel nur, wenn dieser
                // Schreibvorgang eine mitführt — der leere Zweig ist für den
                // Compiler da, nicht für einen Laufzeitfall.
                if (!vars.recurrence) return [];
                return recurrenceConflictRows(
                  theirs,
                  {
                    recurrence: vars.recurrence,
                    startAt: new Date(vars.changes.start_at),
                    timezone: vars.timezone,
                  },
                  t,
                );
              }),
```

- [ ] **Step 6: `docs/TODO.md` pflegen**

**Löschen** (Abschnitt `## Calendar (V1 …)`, eine lange Zeile): den Eintrag **„Eine reine Änderung der Wiederholungsregel wird beim Konflikt-Vergleich still überschrieben"** — vollständig entfernen, nicht abhaken.

**Anlegen**, im selben Abschnitt direkt unter dem bestehenden 🎨-Eintrag „Eine Datumsänderung unter Scope ‚alle Termine' wird stillschweigend verworfen":

```markdown
- 🎨 **Der Konflikt-Dialog verschweigt, was an einer Regeländerung hängt** ([app-sections/event/recurrenceConflictRows.ts](../app-sections/event/recurrenceConflictRows.ts), [features/calendar/recurrence.ts](../features/calendar/recurrence.ts) — `applyEditScope`): Seit [ADR-038](./decision-log.md) erscheint bei einer fremden Regeländerung ein Dialog statt eines stillen Überschreibens — er zeigt aber nur, **was** kollidiert, nicht, was daran hängt. Wählt der Nutzer „Deine Fassung speichern", löscht `deleteAllExceptions` sämtliche „Nur diesen"-Änderungen und Absagen der Serie. Und hat die andere Seite die Serie per „ab hier löschen" an einem Datum beendet, trägt der eigene Schreibvorgang das Serienende aus dem Stand, den das Formular geladen hat — keins —: Die Kürzung wird rückgängig, die gelöschten Termine kehren zurück, und die Serienende-Zeile zeigt dafür nur „—" gegen „Unbegrenzt". Beides zu benennen bräuchte Copy-Keys (ein Warnsatz im Dialog, ein Wert „endet am …"), und die gehören in die designer-eigene [docs/COPY.md](./COPY.md). Gehört zum 🎨-Paket in [docs/roadmap.md](./roadmap.md).
```

- [ ] **Step 7: Gates**

Alle vier Gates; `bun format:check` **nach** Step 6 erneut. Erwartet: **835 pass** (824 + 6 in `conflict.test.ts` + 5 in `recurrenceConflictRows.test.ts`). `features/calendar` unter den drei Zonen, identisch.

- [ ] **Step 8: Commit**

```bash
git add features/calendar/conflict.ts features/calendar/conflict.test.ts \
  app-sections/event/recurrenceConflictRows.ts app-sections/event/recurrenceConflictRows.test.ts \
  app-sections/event/EventEditScreen.tsx docs/TODO.md
git commit -m "fix(calendar): eine fremde Regelaenderung ist ein Konflikt statt eines stillen Overwrites"
```

---

### Task 3: Dokumentation

**Files:**

- Modify: `docs/decision-log.md` (ADR-038 ans Dateiende)
- Modify: `docs/roadmap.md` (Block 2: 2.2 abschließen, 🎨-Bündel ergänzen)
- Modify: `CLAUDE.md` (Ordnerübersicht, Conflict-Detection-Satz)

- [ ] **Step 1: ADR-038 anhängen**

Lies zuerst **ADR-037** (der letzte Eintrag) und schreib ADR-038 in derselben Form: `## ADR-038 — <Titel> (2026-09-18)`, `### Status`, `### Context`, `### Decisions` (nummeriert), `### Consequences`. Deutsch, sachlich.

- **Status:** Accepted. Ergänzt ADR-031 und ADR-037, löst nichts ab. Setzt den ersten Spiegelstrich von Roadmap 2.2 um; letzter von drei ADRs aus Block 2 (036 → 037 → 038). Spec §5, einschließlich des Nachtrags §5.0.
- **Context:** `differingEventFields` verglich nur die fünf `EventChanges`-Felder. Änderten zwei Eltern denselben Termin ausschließlich am Rhythmus, war die Liste leer, `showConflict` speicherte mit frischer Version durch — und weil A's Schreibvorgang die Regel mitführte, löschte `applyEditScope` vorher alle Exceptions der Serie. Der Drei-Wege-Vergleich (ADR-031) hatte das zufällige Sicherheitsnetz des alten Vergleichs entfernt.
- **Decision 1:** Die Regel gehört zum Konfliktvokabular — `EventConflictField` um `"recurrence"`, dreiwertig wie die anderen Felder.
- **Decision 2:** Ohne Regel im Schreibvorgang (`mineRecurrence == null`) nie ein Konflikt — die `rrule_*`-Spalten stehen dann nicht im UPDATE. Dieselbe Begründung wie bei `differingTaskFields`.
- **Decision 3:** Ein Regel-Vergleich für das Feature, in `rule.ts` — zwei Leser, `ruleDiffers` und `differingEventFields`. Die Form ist `OccurrenceRrule`, kein neuer Typ; eine Funktion `ruleOf`, weil `RecurrenceChanges` genau die fünf Spalten einer Zeile hat.
- **Decision 4:** Das Serienende vergleicht als Zeitpunkt — **als Absicherung, nicht als Bugfix**. Gemessen: Kein heutiger Pfad bringt zwei Schreibweisen in denselben Vergleich. Gleiche Zeichenketten gelten vor dem Parsen als gleich, die Änderung macht also nur Paare gleich, nie ungleich. Sie wirkt auch auf `ruleDiffers` und hat dort einen Test an konstruierter Eingabe.
- **Decision 5:** Zwei Dialogzeilen aus vorhandenen Keys, keine neuen — entschieden am 2026-09-18 abweichend vom ursprünglichen Entwurf („eine Zeile"), weil `cal.create.fieldRecurrenceCount` eine Beschriftung ist, keine Wert-Vorlage, und „Option + Anzahl" ein Serienende per Datum nicht ausdrücken kann. Eine Zeile nur bei sichtbarem Unterschied, die Options-Zeile als Rückfall; „Unbegrenzt" nur ohne Enddatum, sonst „—".
- **Decision 6:** Die Zeilen baut ein reiner Helfer neben dem Screen (`recurrenceConflictRows.ts`), weil `EventEditScreen` unter `bun test` nicht ladbar ist — Vorbild `submitLock.ts`.
- **Consequences:** Eine reine Rhythmus-Änderung durch zwei Clients erzeugt einen Dialog; die Exceptions der Serie überleben, solange niemand „Deine Fassung speichern" wählt. Benannte Grenzen (🎨-Eintrag in `docs/TODO.md`): Der Dialog sagt nicht, dass „Deine Fassung speichern" die Exceptions löscht, und nicht, dass es eine fremde Kürzung per „ab hier löschen" rückgängig macht; ein Enddatum erscheint nur als „—". Zwei Regeln, die dieselben Termine verschieden beschreiben, gelten weiterhin als verschieden.

**Nach dem Schreiben den ganzen ADR gegen den Code lesen**, nicht nur einzelne Sätze: jede Tatsachenbehauptung (Datei, Funktion, Key, Verhalten) muss im Branch stimmen.

- [ ] **Step 2: Roadmap**

Lies zuerst, wie **2.1** und der zweite Spiegelstrich von **2.2** als erledigt markiert sind, und übernimm das Muster:

- Überschrift `### 2.2 …` bekommt „— **erledigt**" (beide Spiegelstriche sind jetzt umgesetzt).
- Unter dem **ersten** Spiegelstrich ein Absatz „**Umgesetzt als [ADR-038](./decision-log.md).**" mit dem Ergebnis in wenigen Sätzen — einschließlich der Entscheidung für zwei Zeilen und der benannten Grenze.
- Die Block-2-Zeile der Übersichtstabelle und die „Definition of done Block 2" **nicht** umformulieren; 2.3 bleibt offen.
- Im Abschnitt **„Die 🎨-Punkte, gebündelt zur Übergabe"** den neuen 🎨-Eintrag aus `docs/TODO.md` im Format der Nachbarn ergänzen.

- [ ] **Step 3: CLAUDE.md**

Zwei wörtliche Ersetzungen.

In der Ordnerübersicht diese Zeile:

```text
│                        · version.ts (Versions-Token, schlüsselt auf `occurrenceKey`, ADR-034) · conflict.ts (Feldvergleich, ADR-031)
```

ersetzen durch diese zwei:

```text
│                        · version.ts (Versions-Token, schlüsselt auf `occurrenceKey`, ADR-034) · conflict.ts (Feldvergleich, ADR-031, samt Regel seit ADR-038)
│                        · rule.ts (der eine Regel-Vergleich — Exceptions löschen und Konflikt melden, ADR-038)
```

Im Tech-Stack-Absatz diese Teilzeichenkette:

```text
zeigt `<ConflictDialogHost />` im Root-Layout den Vergleich, Löschen meldet sich als Toast.
```

ersetzen durch:

```text
zeigt `<ConflictDialogHost />` im Root-Layout den Vergleich — seit [ADR-038](docs/decision-log.md) auch für die Wiederholungsregel —, Löschen meldet sich als Toast.
```

- [ ] **Step 4: Gates + Commit**

`bun format:check` (bei Bedarf `bun format`), `bun run typecheck`, `bun lint`, `bun test` (unverändert 835 pass).

```bash
git add docs/decision-log.md docs/roadmap.md CLAUDE.md
git commit -m "docs(calendar): ADR-038 zur Regel im Konflikt-Vergleich, Roadmap 2.2 abschliessen"
```

---

## Definition of Done (Spec §9)

- [ ] Rot vor grün, vorgeführt: Task 1 Step 2 (ein Test), Task 2 Step 2 (drei Tests).
- [ ] `bun run typecheck`, `bun lint`, `bun test`, `bun format:check` grün.
- [ ] `features/calendar` unter drei Zonen identisch.
- [ ] `docs/TODO.md` im selben Commit gepflegt (Task 2 Step 6).
- [ ] Jede neue exportierte Funktion und jedes neue Modul mit JSDoc.
- [ ] Lokaler CodeRabbit-Durchlauf vor dem PR.
- [ ] **Für den Block:** Eine reine Rhythmus-Änderung durch zwei Clients erzeugt einen Dialog statt eines stillen Overwrites — Sichtprüfung am Simulator steht beim Nutzer.
