# Mehrtägige Termine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Termin, der über mehrere Tage geht, erscheint im Monatsraster an jedem überdeckten Tag als durchgehender Balken und in der Tagesliste als Zeile, die zeigt, was an genau diesem Tag passiert.

**Architecture:** `expandEvents` bleibt bei einem `CalendarOccurrence` pro Serientermin — `occurrenceDate` ist der Schlüssel für `event_exceptions.occurrence_date` und darf sich nicht vervielfachen. Ein neuer reiner Layer `features/calendar/spans.ts` fächert Occurrences in `DaySegment`s auf (ein Segment pro Kalendertag) und bereitet daraus die Marker fürs Raster auf. Screens konsumieren Segmente, Mutationen weiterhin Occurrences.

**Tech Stack:** TypeScript (strict), date-fns, react-native-calendars, NativeWind v4, react-i18next, Bun test runner.

**Spec:** [docs/superpowers/specs/2026-07-28-multi-day-events-design.md](../specs/2026-07-28-multi-day-events-design.md)

## Global Constraints

- **Handoff-Bundle ist off-limits.** `design-system/{colors,typography,spacing,themes,components,index}.ts`, `docs/{HANDOFF,COPY,ICONS,README}.md` und `patterns/*.md` werden in diesem Plan **nicht** editiert. Nachträge zu `docs/COPY.md` gehen als Notiz nach `docs/TODO.md`.
- **Alle UI-Strings über i18n.** Neue Strings kommen als Keys in `features/i18n/locales/de.json` **und** `en.json`. DE ist die kanonische Copy, EN spiegelt. Immer Du-Form, nie Sie.
- **Touch-Targets ≥ 44×44.**
- **Kein `Co-Authored-By: Claude`-Trailer** in Commit-Messages (Repo-Policy). Conventional-Commits-Prefix mit Scope, z. B. `feat(calendar): …`.
- **Pre-commit-Hooks (`lint-staged`) nie mit `--no-verify` umgehen.**
- **Tests laufen mit `bun test`** (Buns Runner). Testdateien importieren aus `bun:test`, nicht aus `@jest/globals`. `npx jest` funktioniert für diese Dateien nicht.
- **`occurrenceDate` ist der Exception-Key.** Routing (`params: { occ }`) und Mutationen nutzen ausschließlich `occurrence.occurrenceDate`, **niemals** `segment.date`.
- Kommentare und Doc-Comments im Code auf Englisch (Bestand im `features/calendar/`-Ordner), Commit-Messages und Doku auf Deutsch.

---

## Dateiübersicht

| Datei                                             | Rolle                                                                       |
| ------------------------------------------------- | --------------------------------------------------------------------------- |
| `features/calendar/spans.ts`                      | **neu** — Span-Mathematik: `DaySegment`, `toDaySegments`, `toDayMarkings`   |
| `features/calendar/spans.test.ts`                 | **neu** — Edge-Cases der Span-Mathematik                                    |
| `features/calendar/expand.test.ts`                | **neu** — Fenster-Verhalten des Expanders                                   |
| `features/calendar/types.ts`                      | `SpanBar` ergänzen, `MarkedDates` um `bars` erweitern                       |
| `features/calendar/expand.ts`                     | Suchfenster um die Event-Dauer verbreitern, Nicht-Schnitt verwerfen         |
| `features/calendar/hooks.ts`                      | `useFamilyEvents` liefert Segmente, `useMarkedDates` konsumiert sie         |
| `features/calendar/index.ts`                      | Barrel-Exports für `spans.ts` und `SpanBar`                                 |
| `app-sections/(tabs)/kalender/CalendarDay.tsx`    | Balken-Rendering unter der Zahl-Pill                                        |
| `app-sections/(tabs)/kalender/KalenderScreen.tsx` | Tagesliste auf Segmente: Filter, Sortierung, Labels, Accent-Bar, Keys, a11y |
| `app-sections/event/EventCreateScreen.tsx`        | Conflict-Filter auf die volle Spanne                                        |
| `features/i18n/locales/{de,en}.json`              | fünf `cal.span.*`-Keys                                                      |
| `docs/TODO.md`                                    | zwei erledigte Punkte entfernen, neue Rest-Limits ergänzen                  |

**Abweichung von der Spec (bewusst):** Die Spec nennt für die Marker-Aufbereitung nur „`useMarkedDates` liefert Dots und Balken". Der Plan zieht die Logik als reine Funktion `toDayMarkings` nach `spans.ts` und lässt den Hook ein dünner `useMemo`-Wrapper bleiben — sonst wäre das Balken-Budget (max. 2/Tag, Rest fällt auf Dot zurück) nur über einen React-Renderer testbar. Beide Funktionen arbeiten auf `DaySegment`, die Datei behält damit eine Verantwortung.

---

### Task 1: Span-Mathematik (`toDaySegments`)

**Files:**

- Create: `features/calendar/spans.ts`
- Test: `features/calendar/spans.test.ts`

**Interfaces:**

- Consumes: `CalendarOccurrence` aus `features/calendar/types.ts` (bestehend, unverändert).
- Produces:
  - `interface DaySegment { occurrence: CalendarOccurrence; date: string; index: number; total: number; isStart: boolean; isEnd: boolean }`
  - `function toDaySegments(occurrences: CalendarOccurrence[], rangeStart: Date, rangeEnd: Date): DaySegment[]`

- [ ] **Step 1: Test-Helper und erste Fälle schreiben**

Neue Datei `features/calendar/spans.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import type { CalendarOccurrence } from "./types";

import { toDaySegments } from "./spans";

/**
 * Minimal occurrence — only the fields the span math reads matter. Local times
 * on purpose: the calendar grid works in the user's timezone.
 */
function makeOccurrence(
  startIso: string,
  endIso: string,
  overrides: Partial<CalendarOccurrence> = {},
): CalendarOccurrence {
  const startAt = new Date(startIso);
  return {
    eventId: "evt-1",
    occurrenceDate: startIso.slice(0, 10),
    startAt,
    endAt: new Date(endIso),
    title: "Klassenfahrt",
    description: null,
    location: null,
    allDay: false,
    childId: null,
    parentId: null,
    isException: false,
    isRecurring: false,
    rrule: { freq: null, interval: 1, byweekday: null, count: null, until: null },
    type: {
      slug: "schule",
      color: "#4ECDC4",
      iconName: "book-open",
      labelDe: "Schule",
      labelEn: "School",
    },
    ...overrides,
  };
}

const WINDOW_START = new Date("2026-06-01T00:00:00");
const WINDOW_END = new Date("2026-06-30T23:59:59");

describe("toDaySegments", () => {
  test("a single-day event yields exactly one segment flagged as both ends", () => {
    const occ = makeOccurrence("2026-06-10T09:00:00", "2026-06-10T10:00:00");
    const segments = toDaySegments([occ], WINDOW_START, WINDOW_END);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      date: "2026-06-10",
      index: 0,
      total: 1,
      isStart: true,
      isEnd: true,
    });
    expect(segments[0].occurrence).toBe(occ);
  });

  test("a three-day event yields one segment per covered day", () => {
    const occ = makeOccurrence("2026-06-10T09:00:00", "2026-06-12T14:00:00");
    const segments = toDaySegments([occ], WINDOW_START, WINDOW_END);
    expect(segments.map((s) => s.date)).toEqual(["2026-06-10", "2026-06-11", "2026-06-12"]);
    expect(segments.map((s) => s.index)).toEqual([0, 1, 2]);
    expect(segments.every((s) => s.total === 3)).toBe(true);
    expect(segments.map((s) => s.isStart)).toEqual([true, false, false]);
    expect(segments.map((s) => s.isEnd)).toEqual([false, false, true]);
  });

  test("midnight is exclusive — a 20:00–00:00 event stays on its start day", () => {
    const occ = makeOccurrence("2026-06-10T20:00:00", "2026-06-11T00:00:00");
    const segments = toDaySegments([occ], WINDOW_START, WINDOW_END);
    expect(segments).toHaveLength(1);
    expect(segments[0].date).toBe("2026-06-10");
    expect(segments[0].total).toBe(1);
  });

  test("one minute past midnight does reach the next day", () => {
    const occ = makeOccurrence("2026-06-10T20:00:00", "2026-06-11T00:01:00");
    const segments = toDaySegments([occ], WINDOW_START, WINDOW_END);
    expect(segments.map((s) => s.date)).toEqual(["2026-06-10", "2026-06-11"]);
  });

  test("an all-day multi-day event needs no special case (00:00 to 23:59)", () => {
    const occ = makeOccurrence("2026-06-10T00:00:00", "2026-06-12T23:59:00", { allDay: true });
    const segments = toDaySegments([occ], WINDOW_START, WINDOW_END);
    expect(segments).toHaveLength(3);
    expect(segments[2]).toMatchObject({ date: "2026-06-12", index: 2, total: 3, isEnd: true });
  });

  test("an end at or before the start still yields one segment", () => {
    const occ = makeOccurrence("2026-06-10T09:00:00", "2026-06-10T09:00:00");
    expect(toDaySegments([occ], WINDOW_START, WINDOW_END)).toHaveLength(1);
  });
});

describe("toDaySegments window clipping", () => {
  test("a span reaching in from before the window keeps absolute index and total", () => {
    // 2026-05-28 → 2026-06-03: ten days total, only 06-01…06-03 are visible.
    const occ = makeOccurrence("2026-05-25T09:00:00", "2026-06-03T14:00:00");
    const segments = toDaySegments([occ], WINDOW_START, WINDOW_END);
    expect(segments.map((s) => s.date)).toEqual(["2026-06-01", "2026-06-02", "2026-06-03"]);
    expect(segments.map((s) => s.index)).toEqual([7, 8, 9]);
    expect(segments.every((s) => s.total === 10)).toBe(true);
    // Clipped edge must not claim to be the start of the span.
    expect(segments[0].isStart).toBe(false);
    expect(segments[2].isEnd).toBe(true);
  });

  test("a span running past the window is clipped at the end", () => {
    const occ = makeOccurrence("2026-06-29T09:00:00", "2026-07-05T14:00:00");
    const segments = toDaySegments([occ], WINDOW_START, WINDOW_END);
    expect(segments.map((s) => s.date)).toEqual(["2026-06-29", "2026-06-30"]);
    expect(segments[0].isStart).toBe(true);
    expect(segments[1].isEnd).toBe(false);
    expect(segments[1].total).toBe(7);
  });

  test("an event entirely outside the window yields nothing", () => {
    const occ = makeOccurrence("2026-04-01T09:00:00", "2026-04-03T14:00:00");
    expect(toDaySegments([occ], WINDOW_START, WINDOW_END)).toEqual([]);
  });

  test("a runaway end date does not flood the result", () => {
    const occ = makeOccurrence("2026-06-28T09:00:00", "2099-01-01T14:00:00");
    const segments = toDaySegments([occ], WINDOW_START, WINDOW_END);
    // Only the three visible June days are walked, however absurd `total` gets.
    expect(segments.map((s) => s.date)).toEqual(["2026-06-28", "2026-06-29", "2026-06-30"]);
    expect(segments[0].total).toBeGreaterThan(20_000);
  });
});

describe("toDaySegments across a DST transition", () => {
  test("counts calendar days, not 24-hour blocks", () => {
    // Europe/Berlin springs forward on 2026-03-29 — that day has 23 hours.
    const occ = makeOccurrence("2026-03-28T09:00:00", "2026-03-30T09:00:00");
    const segments = toDaySegments(
      [occ],
      new Date("2026-03-01T00:00:00"),
      new Date("2026-03-31T23:59:59"),
    );
    expect(segments.map((s) => s.date)).toEqual(["2026-03-28", "2026-03-29", "2026-03-30"]);
    expect(segments[0].total).toBe(3);
  });
});
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `bun test features/calendar/spans.test.ts`
Expected: FAIL — `Cannot find module './spans'`.

- [ ] **Step 3: `spans.ts` implementieren**

Neue Datei `features/calendar/spans.ts`:

```ts
import { addDays, differenceInCalendarDays, format, startOfDay } from "date-fns";

import type { CalendarOccurrence } from "./types";

/**
 * One calendar day covered by an occurrence. A single-day event yields exactly
 * one segment, a three-day event yields three.
 *
 * `occurrence.occurrenceDate` stays the series anchor — it is the key behind
 * `event_exceptions.occurrence_date`, so routing and mutations must keep using
 * it. `date` is only the day this segment paints on.
 */
export interface DaySegment {
  occurrence: CalendarOccurrence;
  /** yyyy-MM-dd of the day this segment covers. */
  date: string;
  /** 0-based position inside the full span — absolute, not clipped to the window. */
  index: number;
  /** Length of the full span in calendar days. Always >= 1. */
  total: number;
  isStart: boolean;
  isEnd: boolean;
}

function isMidnight(d: Date): boolean {
  return (
    d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0
  );
}

/**
 * The last instant an occurrence actually occupies. Midnight is exclusive: an
 * event running 20:00–00:00 belongs to the day it started on, not to the next
 * one. All-day ranges end at 23:59 (see `toAllDayRange`) and never hit this.
 */
function lastCoveredInstant(startAt: Date, endAt: Date): Date {
  if (endAt.getTime() <= startAt.getTime()) return startAt;
  return isMidnight(endAt) ? new Date(endAt.getTime() - 1) : endAt;
}

/**
 * Fans occurrences out into one segment per covered calendar day, clipped to
 * `[rangeStart, rangeEnd]`.
 *
 * Clipping happens on the loop, not on the arithmetic: `index` and `total` stay
 * absolute so a partially visible span can still say "day 8 of 10", and a
 * mistyped end date in 2099 cannot flood the result.
 */
export function toDaySegments(
  occurrences: CalendarOccurrence[],
  rangeStart: Date,
  rangeEnd: Date,
): DaySegment[] {
  const windowStart = startOfDay(rangeStart);
  const windowEnd = startOfDay(rangeEnd);
  const out: DaySegment[] = [];

  for (const occurrence of occurrences) {
    const spanStart = startOfDay(occurrence.startAt);
    const spanEnd = startOfDay(lastCoveredInstant(occurrence.startAt, occurrence.endAt));
    const total = differenceInCalendarDays(spanEnd, spanStart) + 1;

    const from = spanStart < windowStart ? windowStart : spanStart;
    const to = spanEnd > windowEnd ? windowEnd : spanEnd;
    if (to < from) continue;

    const firstIndex = differenceInCalendarDays(from, spanStart);
    const lastIndex = differenceInCalendarDays(to, spanStart);
    for (let i = firstIndex; i <= lastIndex; i++) {
      out.push({
        occurrence,
        date: format(addDays(spanStart, i), "yyyy-MM-dd"),
        index: i,
        total,
        isStart: i === 0,
        isEnd: i === total - 1,
      });
    }
  }
  return out;
}
```

- [ ] **Step 4: Tests laufen lassen und grün bestätigen**

Run: `bun test features/calendar/spans.test.ts`
Expected: PASS, 11 Tests.

Falls der DST-Test scheitert: die Testumgebung läuft nicht in `Europe/Berlin`. Dann `TZ=Europe/Berlin bun test features/calendar/spans.test.ts` prüfen — bleibt er so grün, ist die Rechnung korrekt und der Test bekommt in Step 5 ein `process.env.TZ`-unabhängiges Datum (28.–30. Juni), das denselben Punkt ohne Zeitzonenabhängigkeit zeigt. **Nicht** die Implementierung auf Millisekunden-Division umbauen.

- [ ] **Step 5: Barrel-Export ergänzen**

In `features/calendar/index.ts` ans Ende der Export-Liste, direkt vor der `export type { CalendarOccurrence … }`-Zeile:

```ts
export { toDaySegments, type DaySegment } from "./spans";
```

- [ ] **Step 6: Typecheck und Commit**

```bash
bun run typecheck
git add features/calendar/spans.ts features/calendar/spans.test.ts features/calendar/index.ts
git commit -m "feat(calendar): Occurrences in Tages-Segmente auffaechern"
```

---

### Task 2: Marker fürs Monatsraster (`toDayMarkings`)

**Files:**

- Modify: `features/calendar/types.ts` (`MarkedDates`, neuer `SpanBar`)
- Modify: `features/calendar/spans.ts` (Funktion anhängen)
- Modify: `features/calendar/spans.test.ts` (Suite anhängen)
- Modify: `features/calendar/index.ts`

**Interfaces:**

- Consumes: `DaySegment` und `toDaySegments` aus Task 1.
- Produces:
  - `interface SpanBar { key: string; color: string; isStart: boolean; isEnd: boolean }` (in `types.ts`)
  - `MarkedDates[date].bars?: SpanBar[]`
  - `function toDayMarkings(segments: DaySegment[], selectedDate: string, selectedColor: string): MarkedDates`

- [ ] **Step 1: `types.ts` erweitern**

In `features/calendar/types.ts` nach dem `MarkedDot`-Interface einfügen:

```ts
/**
 * A multi-day event's slice on one day of the month grid. `isStart`/`isEnd`
 * round the matching edge; a bar that is neither reaches both cell edges flush
 * and therefore reads as "continues".
 */
export interface SpanBar {
  key: string;
  color: string;
  isStart: boolean;
  isEnd: boolean;
}
```

und `MarkedDates` um `bars` ergänzen:

```ts
export type MarkedDates = Record<
  string,
  {
    dots?: MarkedDot[];
    bars?: SpanBar[];
    marked?: boolean;
    selected?: boolean;
    selectedColor?: string;
  }
>;
```

- [ ] **Step 2: Failing test schreiben**

An `features/calendar/spans.test.ts` anhängen (der `makeOccurrence`-Helper aus Task 1 wird wiederverwendet, `toDayMarkings` zum Import in Zeile 5 hinzufügen):

```ts
describe("toDayMarkings", () => {
  const segmentsFor = (occs: CalendarOccurrence[]) => toDaySegments(occs, WINDOW_START, WINDOW_END);

  test("single-day events become dots, one per type slug", () => {
    const marks = toDayMarkings(
      segmentsFor([
        makeOccurrence("2026-06-10T09:00:00", "2026-06-10T10:00:00", { eventId: "a" }),
        makeOccurrence("2026-06-10T11:00:00", "2026-06-10T12:00:00", { eventId: "b" }),
      ]),
      "2026-06-01",
      "#E8F7F5",
    );
    expect(marks["2026-06-10"].dots).toEqual([{ key: "schule", color: "#4ECDC4" }]);
    expect(marks["2026-06-10"].bars ?? []).toEqual([]);
    expect(marks["2026-06-10"].marked).toBe(true);
  });

  test("a multi-day event becomes a bar on every covered day, rounded at its ends", () => {
    const marks = toDayMarkings(
      segmentsFor([makeOccurrence("2026-06-10T09:00:00", "2026-06-12T14:00:00")]),
      "2026-06-01",
      "#E8F7F5",
    );
    expect(marks["2026-06-10"].bars).toEqual([
      { key: "evt-1-2026-06-10", color: "#4ECDC4", isStart: true, isEnd: false },
    ]);
    expect(marks["2026-06-11"].bars?.[0]).toMatchObject({ isStart: false, isEnd: false });
    expect(marks["2026-06-12"].bars?.[0]).toMatchObject({ isStart: false, isEnd: true });
    expect(marks["2026-06-11"].dots ?? []).toEqual([]);
  });

  test("beyond two bars a span falls back into the dot row instead of vanishing", () => {
    const spans = [1, 2, 3].map((n) =>
      makeOccurrence("2026-06-10T09:00:00", "2026-06-12T14:00:00", {
        eventId: `evt-${n}`,
        type: {
          slug: `slug-${n}`,
          color: `#00000${n}`,
          iconName: "book-open",
          labelDe: "x",
          labelEn: "x",
        },
      }),
    );
    const marks = toDayMarkings(segmentsFor(spans), "2026-06-01", "#E8F7F5");
    expect(marks["2026-06-10"].bars).toHaveLength(2);
    expect(marks["2026-06-10"].dots).toEqual([{ key: "slug-3", color: "#000003" }]);
  });

  test("dots stay capped at three", () => {
    const many = [1, 2, 3, 4].map((n) =>
      makeOccurrence("2026-06-10T09:00:00", "2026-06-10T10:00:00", {
        eventId: `evt-${n}`,
        type: {
          slug: `slug-${n}`,
          color: `#00000${n}`,
          iconName: "book-open",
          labelDe: "x",
          labelEn: "x",
        },
      }),
    );
    expect(
      toDayMarkings(segmentsFor(many), "2026-06-01", "#E8F7F5")["2026-06-10"].dots,
    ).toHaveLength(3);
  });

  test("the selected day is marked even when it holds no events", () => {
    const marks = toDayMarkings([], "2026-06-15", "#E8F7F5");
    expect(marks["2026-06-15"]).toEqual({ selected: true, selectedColor: "#E8F7F5" });
  });

  test("selection is merged onto a day that already has markings", () => {
    const marks = toDayMarkings(
      segmentsFor([makeOccurrence("2026-06-10T09:00:00", "2026-06-10T10:00:00")]),
      "2026-06-10",
      "#E8F7F5",
    );
    expect(marks["2026-06-10"].selected).toBe(true);
    expect(marks["2026-06-10"].dots).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Test laufen lassen und Fehlschlag bestätigen**

Run: `bun test features/calendar/spans.test.ts`
Expected: FAIL — `toDayMarkings is not a function` bzw. Import-Fehler.

- [ ] **Step 4: `toDayMarkings` implementieren**

An `features/calendar/spans.ts` anhängen; den Import-Block oben auf

```ts
import type { CalendarOccurrence, MarkedDates, MarkedDot, SpanBar } from "./types";
```

erweitern:

```ts
/** Bars per day before a span falls back into the dot row. */
const MAX_BARS = 2;
/** Dots per day, matching what `CalendarDay` renders. */
const MAX_DOTS = 3;

/**
 * Turns day segments into the marking objects the month grid consumes.
 *
 * Single-day events stay dots (deduplicated by type slug, as before), spans
 * become bars. The bar budget is deliberately small — beyond it a span drops
 * into the dot row rather than disappearing, so a busy day never silently
 * swallows an event.
 */
export function toDayMarkings(
  segments: DaySegment[],
  selectedDate: string,
  selectedColor: string,
): MarkedDates {
  const barsByDate = new Map<string, SpanBar[]>();
  const dotsByDate = new Map<string, Map<string, MarkedDot>>();

  const addDot = (date: string, occurrence: CalendarOccurrence) => {
    const forDay = dotsByDate.get(date) ?? new Map<string, MarkedDot>();
    if (!forDay.has(occurrence.type.slug)) {
      forDay.set(occurrence.type.slug, {
        key: occurrence.type.slug,
        color: occurrence.type.color,
      });
    }
    dotsByDate.set(date, forDay);
  };

  for (const segment of segments) {
    if (segment.total === 1) {
      addDot(segment.date, segment.occurrence);
      continue;
    }
    const forDay = barsByDate.get(segment.date) ?? [];
    if (forDay.length >= MAX_BARS) {
      addDot(segment.date, segment.occurrence);
      continue;
    }
    forDay.push({
      // Two occurrences of the same series can share a day once a span is
      // longer than its recurrence interval — the anchor date keeps keys unique.
      key: `${segment.occurrence.eventId}-${segment.occurrence.occurrenceDate}`,
      color: segment.occurrence.type.color,
      isStart: segment.isStart,
      isEnd: segment.isEnd,
    });
    barsByDate.set(segment.date, forDay);
  }

  const out: MarkedDates = {};
  const dates = new Set<string>();
  barsByDate.forEach((_, date) => dates.add(date));
  dotsByDate.forEach((_, date) => dates.add(date));
  dates.forEach((date) => {
    out[date] = {
      marked: true,
      bars: barsByDate.get(date),
      dots: Array.from(dotsByDate.get(date)?.values() ?? []).slice(0, MAX_DOTS),
    };
  });

  out[selectedDate] = { ...(out[selectedDate] ?? {}), selected: true, selectedColor };
  return out;
}
```

- [ ] **Step 5: Tests laufen lassen und grün bestätigen**

Run: `bun test features/calendar/spans.test.ts`
Expected: PASS, 17 Tests (11 aus Task 1 plus 6 neue).

- [ ] **Step 6: Barrel-Export erweitern und committen**

In `features/calendar/index.ts` die Zeile aus Task 1 ersetzen durch:

```ts
export { toDaySegments, toDayMarkings, type DaySegment } from "./spans";
```

und die bestehende Typ-Export-Zeile um `SpanBar` erweitern:

```ts
export type { CalendarOccurrence, MarkedDates, MarkedDot, OccurrenceRrule, SpanBar } from "./types";
```

```bash
bun run typecheck
git add features/calendar/spans.ts features/calendar/spans.test.ts features/calendar/types.ts features/calendar/index.ts
git commit -m "feat(calendar): Spannen-Balken und Dots aus Tages-Segmenten aufbereiten"
```

---

### Task 3: Expansions-Fenster verbreitern

Ohne diesen Schritt bleibt eine Spanne, die vor dem sichtbaren Monat beginnt, **komplett** unsichtbar — Task 1 und 2 könnten sie gar nicht erst sehen.

**Files:**

- Modify: `features/calendar/expand.ts:35-42` (`expandRecurrence`), `:62-129` (`expandEvents`)
- Test: `features/calendar/expand.test.ts` (neu)

**Interfaces:**

- Consumes: nichts aus Task 1/2.
- Produces: `expandEvents(rows, rangeStart, rangeEnd, theme)` liefert zusätzlich Occurrences, deren Start vor `rangeStart` liegt, deren Spanne aber ins Fenster ragt. Signatur unverändert.

- [ ] **Step 1: Failing test schreiben**

Neue Datei `features/calendar/expand.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import type { Database } from "@/features/supabase/database.types";

import { lightTheme } from "@/design-system/themes";

import type { EventWithRelations } from "./expand";

import { expandEvents } from "./expand";

type EventRow = Database["public"]["Tables"]["events"]["Row"];

function makeRow(overrides: Partial<EventRow> = {}): EventWithRelations {
  const row: EventRow = {
    id: "evt-1",
    family_id: "fam-1",
    type_id: "type-1",
    child_id: null,
    parent_id: null,
    title: "Sommerurlaub",
    description: null,
    location: null,
    start_at: new Date("2026-06-10T09:00:00").toISOString(),
    end_at: new Date("2026-06-10T10:00:00").toISOString(),
    all_day: false,
    rrule_freq: null,
    rrule_interval: 1,
    rrule_byweekday: null,
    rrule_count: null,
    rrule_until: null,
    created_at: new Date("2026-01-01T00:00:00").toISOString(),
    created_by: null,
    updated_at: new Date("2026-01-01T00:00:00").toISOString(),
    ...overrides,
  };
  return { ...row, event_types: null, event_exceptions: [] };
}

const WINDOW_START = new Date("2026-06-01T00:00:00");
const WINDOW_END = new Date("2026-06-30T23:59:59");

describe("expandEvents window", () => {
  test("keeps an event that starts before the window but runs into it", () => {
    const row = makeRow({
      start_at: new Date("2026-05-20T09:00:00").toISOString(),
      end_at: new Date("2026-06-05T14:00:00").toISOString(),
    });
    const out = expandEvents([row], WINDOW_START, WINDOW_END, lightTheme);
    expect(out).toHaveLength(1);
    expect(out[0].occurrenceDate).toBe("2026-05-20");
  });

  test("drops an event whose span ends before the window", () => {
    const row = makeRow({
      start_at: new Date("2026-04-01T09:00:00").toISOString(),
      end_at: new Date("2026-04-03T14:00:00").toISOString(),
    });
    expect(expandEvents([row], WINDOW_START, WINDOW_END, lightTheme)).toEqual([]);
  });

  test("keeps a recurring occurrence that started before the window and runs into it", () => {
    // Weekly series from Mon 2026-05-25, each occurrence lasting three days.
    // Explicit UTC timestamps, like `recurrence.test.ts` — rrule computes in
    // UTC, so a local-time fixture would drift with the runner's timezone.
    const row = makeRow({
      start_at: "2026-05-25T09:00:00.000Z",
      end_at: "2026-05-27T14:00:00.000Z",
      rrule_freq: "weekly",
    });
    const out = expandEvents(
      [row],
      new Date("2026-06-02T00:00:00.000Z"),
      new Date("2026-06-30T23:59:59.000Z"),
      lightTheme,
    );
    // 06-01 → 06-03 straddles the window start and must survive.
    expect(out.map((o) => o.occurrenceDate)).toContain("2026-06-01");
  });

  test("a plain in-window event is unaffected", () => {
    const out = expandEvents([makeRow()], WINDOW_START, WINDOW_END, lightTheme);
    expect(out).toHaveLength(1);
    expect(out[0].occurrenceDate).toBe("2026-06-10");
  });
});
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `bun test features/calendar/expand.test.ts`
Expected: FAIL — die ersten beiden Erwartungen der ersten und der dritten Test schlagen fehl (`expected length 1, got 0` bzw. `toContain`), die anderen beiden Tests sind bereits grün.

- [ ] **Step 3: `expandRecurrence` um ein Suchfenster erweitern**

In `features/calendar/expand.ts` die Funktion `expandRecurrence` (Zeile 35–42) ersetzen durch:

```ts
/**
 * Occurrence starts inside the window — widened backwards by the event's own
 * duration, because a span that began before `rangeStart` still paints days
 * inside it. Nothing is guessed: shifting by exactly the duration is the
 * smallest window that cannot miss an intersecting occurrence.
 */
function expandRecurrence(
  row: EventRow,
  rangeStart: Date,
  rangeEnd: Date,
  durationMs: number,
): Date[] {
  const searchStart = new Date(rangeStart.getTime() - Math.max(0, durationMs));
  const rule = buildRule(row);
  if (!rule) {
    const start = new Date(row.start_at);
    return start >= searchStart && start <= rangeEnd ? [start] : [];
  }
  return rule.between(searchStart, rangeEnd, true);
}
```

- [ ] **Step 4: `expandEvents` anpassen**

In `expandEvents` die Reihenfolge so ändern, dass `durationMs` vor dem Expandieren feststeht, und nicht schneidende Occurrences verwerfen. Der Block ab Zeile 69 beginnt neu mit:

```ts
  for (const row of rows) {
    const masterStart = new Date(row.start_at);
    const masterEnd = new Date(row.end_at);
    const durationMs = masterEnd.getTime() - masterStart.getTime();

    const occurrences = expandRecurrence(row, rangeStart, rangeEnd, durationMs);
    if (!occurrences.length) continue;
```

(die alten Zeilen `const occurrences = expandRecurrence(row, rangeStart, rangeEnd);` sowie die drei `masterStart`/`masterEnd`/`durationMs`-Zeilen darunter entfallen — sie sind nach oben gewandert.)

Innerhalb der `for (const occurrenceStart of occurrences)`-Schleife direkt nach dem `if (ex?.action === "modified")`-Block, **vor** der `occurrenceDate`-Berechnung, einfügen:

```ts
// The widened search window (and a modified exception's shifted times)
// can produce occurrences that miss the range entirely — drop them here
// rather than letting the grid deal with off-window days.
if (resolved.endAt < rangeStart || resolved.startAt > rangeEnd) continue;
```

- [ ] **Step 5: Tests laufen lassen und grün bestätigen**

Run: `bun test features/calendar/expand.test.ts`
Expected: PASS, 4 Tests.

Run: `bun test`
Expected: PASS — alle bestehenden Kalender-Suiten bleiben grün (`recurrence`, `mutations`, `createMutation`, `dateRange`, `spans`).

- [ ] **Step 6: Commit**

```bash
bun run typecheck
git add features/calendar/expand.ts features/calendar/expand.test.ts
git commit -m "fix(calendar): hereinragende Spannen im Expansions-Fenster behalten"
```

---

### Task 4: Segmente durch die Hooks in den Screen reichen

**Files:**

- Modify: `features/calendar/hooks.ts:29-53` (`useFamilyEvents`), `:101-126` (`useMarkedDates`)
- Modify: `app-sections/(tabs)/kalender/KalenderScreen.tsx:60-81`

**Interfaces:**

- Consumes: `toDaySegments`, `toDayMarkings`, `DaySegment` aus Task 1/2.
- Produces:
  - `useFamilyEvents(visibleMonth)` liefert zusätzlich `segments: DaySegment[]` (Feld `data` bleibt `CalendarOccurrence[]` — `EventCreateScreen` hängt daran).
  - `useMarkedDates(segments: DaySegment[], selectedDate: string, selectedColor: string): MarkedDates`.

- [ ] **Step 1: `useFamilyEvents` um Segmente erweitern**

In `features/calendar/hooks.ts` das Interface und den Hook anpassen:

```ts
interface UseFamilyEventsResult {
  data: CalendarOccurrence[];
  /** One entry per covered calendar day, clipped to the same window as `data`. */
  segments: DaySegment[];
  isLoading: boolean;
  error: unknown;
}
```

Im Hook nach dem bestehenden `data`-`useMemo`:

```ts
const segments = useMemo(
  () => toDaySegments(data, rangeStart, rangeEnd),
  [data, rangeStart, rangeEnd],
);

return {
  data,
  segments,
  isLoading: query.isLoading,
  error: query.error,
};
```

Importe oben ergänzen:

```ts
import type { DaySegment } from "./spans";

import { toDayMarkings, toDaySegments } from "./spans";
```

(`import type { CalendarOccurrence, MarkedDates, MarkedDot } from "./types";` verliert `MarkedDot`, sobald Step 2 die Dot-Gruppierung aus dem Hook entfernt — beim Typecheck korrigieren, `no-unused-vars` schlägt sonst an.)

- [ ] **Step 2: `useMarkedDates` auf einen Wrapper eindampfen**

Den kompletten Body von `useMarkedDates` (Zeile 101–126) ersetzen durch:

```ts
export function useMarkedDates(
  segments: DaySegment[],
  selectedDate: string,
  selectedColor: string,
): MarkedDates {
  return useMemo(
    () => toDayMarkings(segments, selectedDate, selectedColor),
    [segments, selectedDate, selectedColor],
  );
}
```

- [ ] **Step 3: `KalenderScreen` auf Segmente umstellen (nur Verdrahtung)**

In `app-sections/(tabs)/kalender/KalenderScreen.tsx`:

Die Zeile `const { data: occurrences } = useFamilyEvents(visibleMonth);` ersetzen durch:

```tsx
const { segments } = useFamilyEvents(visibleMonth);
const markedDates = useMarkedDates(segments, selectedDate, theme.primarySoft);
```

(`occurrences` wird in diesem Screen danach nirgends mehr gebraucht — die Tagesliste läuft ab jetzt über `segments`. Die bestehende `markedDates`-Zeile darunter entfällt, sie ist oben mit aufgegangen.)

Den `dayEvents`-`useMemo` (Zeile 75–81) ersetzen durch:

```tsx
const dayEvents = useMemo(
  () =>
    segments
      .filter((s) => s.date === selectedDate)
      .sort((a, b) => {
        // Something running all day belongs above the day's appointments, not
        // at the position of a start time that may be days in the past.
        const rank = (s: DaySegment) => (s.occurrence.allDay || !s.isStart ? 0 : 1);
        return rank(a) - rank(b) || a.occurrence.startAt.getTime() - b.occurrence.startAt.getTime();
      }),
  [segments, selectedDate],
);
```

Import ergänzen: `type DaySegment` aus `@/features/calendar` in den bestehenden Import-Block aufnehmen.

- [ ] **Step 4: Zeilen-Rendering auf `seg.occurrence` umbiegen (noch ohne neue Labels)**

Im `dayEvents.map(...)`-Block die Signatur von `(occ) =>` auf `(seg) =>` ändern und als erste Zeile im Body

```tsx
const occ = seg.occurrence;
```

einfügen. Den React-Key auf

```tsx
key={`${occ.eventId}-${occ.occurrenceDate}-${seg.date}`}
```

ändern. Alles andere bleibt in diesem Schritt unverändert — insbesondere `params: { id: occ.eventId, occ: occ.occurrenceDate }`, das weiterhin den Anker nutzt.

- [ ] **Step 5: Typecheck, Test, Smoke-Check**

Run: `bun run typecheck`
Expected: keine Fehler.

Run: `bun test`
Expected: PASS.

Run: `bun run web` und den Kalender öffnen. Erwartung: Ein mehrtägiger Termin erscheint jetzt an **jedem** seiner Tage in der Tagesliste (noch mit der alten Zeitspalte — die Beschriftung kommt in Task 6) und trägt an jedem Tag einen Dot bzw. nach Task 5 einen Balken.

- [ ] **Step 6: Commit**

```bash
git add features/calendar/hooks.ts "app-sections/(tabs)/kalender/KalenderScreen.tsx"
git commit -m "feat(calendar): Tagesliste und Marker aus Tages-Segmenten speisen"
```

---

### Task 5: Balken im Monatsraster rendern

**Files:**

- Modify: `app-sections/(tabs)/kalender/CalendarDay.tsx`

**Interfaces:**

- Consumes: `SpanBar` aus `features/calendar/types.ts` (Task 2), geliefert über `marking.bars`.
- Produces: keine neuen Exporte.

- [ ] **Step 1: Marking-Typ an der Bibliotheksgrenze erweitern**

In `app-sections/(tabs)/kalender/CalendarDay.tsx` den Import ergänzen:

```tsx
import type { SpanBar } from "@/features/calendar";
```

und `CalendarDayProps` anpassen:

```tsx
interface CalendarDayProps {
  date?: DateData;
  state?: DayState;
  /**
   * `react-native-calendars` types `marking` narrowly but hands our own object
   * through untouched — `bars` is ours, added in `toDayMarkings`.
   */
  marking?: MarkingProps & { bars?: SpanBar[] };
  onPress?: (date?: DateData) => void;
}
```

- [ ] **Step 2: Balken auslesen und rendern**

Neben `dots` ergänzen:

```tsx
const bars = isDisabled ? [] : (marking?.bars ?? []);
```

Die Zellhöhe von 44 auf 52 anheben, damit Balken **und** Dot-Reihe unter die 36px-Pille passen:

```tsx
style={{ width: 44, height: 52, paddingVertical: 4 }}
```

Direkt nach dem Pill-`View` und **vor** dem Dots-Block einfügen:

```tsx
{
  bars.length > 0 ? (
    <View className="mt-1 w-full gap-0.5">
      {bars.map((bar) => (
        <View
          key={bar.key}
          style={{
            height: 3,
            backgroundColor: bar.color,
            // Flush edges are the signal: a bar that is neither start nor end
            // touches both cell borders and reads as one line across the week.
            marginLeft: bar.isStart ? 4 : 0,
            marginRight: bar.isEnd ? 4 : 0,
            borderTopLeftRadius: bar.isStart ? 2 : 0,
            borderBottomLeftRadius: bar.isStart ? 2 : 0,
            borderTopRightRadius: bar.isEnd ? 2 : 0,
            borderBottomRightRadius: bar.isEnd ? 2 : 0,
            opacity: isToday ? 0.9 : 1,
          }}
        />
      ))}
    </View>
  ) : null;
}
```

Den Dots-Block von `className="mt-1 flex-row gap-0.5"` auf

```tsx
<View className={bars.length > 0 ? "mt-0.5 flex-row gap-0.5" : "mt-1 flex-row gap-0.5"}>
```

ändern, damit die Zeile bei vorhandenen Balken nicht aus der Zelle wächst.

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: keine Fehler.

- [ ] **Step 4: Darstellung im Simulator prüfen**

Run: `bun run ios`

Prüfliste — die Zellbreiten-Frage ist das einzige offene Darstellungsrisiko der Spec (D5):

1. Mehrtägiger Termin innerhalb einer Woche: Berühren sich die Balken benachbarter Tage?
2. Über den Wochenumbruch: Endet der Balken bündig am Zeilenrand?
3. Auf der Today-Zelle (gefüllte Mint-Pille) und auf der Selected-Zelle: Bleibt der Balken sichtbar und die Zahl lesbar?
4. Light **und** Dark.
5. Wächst eine Kalenderzeile über den Kartenrand hinaus?

**Wenn sich die Balken nicht berühren:** die verbleibende Lücke ist laut Spec akzeptabel — die Linie liest sich auch mit minimalem Abstand als Spanne. Erst wenn die Lücke größer als etwa 4px ist, `marginHorizontal: -4` an durchlaufenden Kanten ergänzen und erneut prüfen. **Nicht** die Variante wechseln und **nicht** die Zellbreite von 44 verändern (Touch-Target).

Das Ergebnis der Prüfung in der Commit-Message festhalten.

- [ ] **Step 5: Commit**

```bash
git add "app-sections/(tabs)/kalender/CalendarDay.tsx"
git commit -m "feat(calendar): Spannen-Balken im Monatsraster rendern"
```

---

### Task 6: Tagesliste beschriften

**Files:**

- Modify: `features/i18n/locales/de.json`, `features/i18n/locales/en.json`
- Modify: `app-sections/(tabs)/kalender/KalenderScreen.tsx`

**Interfaces:**

- Consumes: `DaySegment` aus Task 1, die Verdrahtung aus Task 4.
- Produces: i18n-Keys `cal.span.allDay`, `cal.span.from`, `cal.span.until`, `cal.span.through`, `cal.span.dayOf`.

- [ ] **Step 1: i18n-Keys ergänzen**

In `features/i18n/locales/de.json` innerhalb des `cal`-Objekts, direkt nach dem `duration`-Block:

```json
"span": {
  "allDay": "Ganztägig",
  "from": "ab {{time}}",
  "until": "bis {{time}}",
  "through": "durchgehend",
  "dayOf": "Tag {{index}}/{{total}}"
},
```

In `features/i18n/locales/en.json` an derselben Stelle:

```json
"span": {
  "allDay": "All day",
  "from": "from {{time}}",
  "until": "until {{time}}",
  "through": "ongoing",
  "dayOf": "Day {{index}}/{{total}}"
},
```

- [ ] **Step 2: Label-Logik in die Zeile einsetzen**

In `app-sections/(tabs)/kalender/KalenderScreen.tsx` im `dayEvents.map`-Body die Zeilen `const durationMin = …` und `const timeLabel = …` ersetzen durch:

```tsx
const isSpan = seg.total > 1;
const durationMin = Math.max(0, Math.round((occ.endAt.getTime() - occ.startAt.getTime()) / 60_000));
// The left column answers "what happens on THIS day", not "when did the
// series start" — a continuation day showing 09:00 would simply be wrong.
const timeLabel = occ.allDay
  ? t("cal.span.allDay")
  : seg.isStart && seg.isEnd
    ? format(occ.startAt, "HH:mm")
    : seg.isStart
      ? t("cal.span.from", { time: format(occ.startAt, "HH:mm") })
      : seg.isEnd
        ? t("cal.span.until", { time: format(occ.endAt, "HH:mm") })
        : t("cal.span.through");
// Empty string rather than null: the label is interpolated into the row's
// accessibility label below, and a `string | null` there trips the
// type-aware lint rule for template expressions.
const subLabel = isSpan
  ? t("cal.span.dayOf", { index: seg.index + 1, total: seg.total })
  : occ.allDay
    ? // A 00:00–23:59 all-day range would report "24 Std." — a number nobody
      // entered. Better to show nothing.
      ""
    : formatDurationLabel(durationMin, t);
```

- [ ] **Step 3: Linke Spalte, Accent-Bar und a11y anpassen**

Die linke Spalte (`<View className="w-12">`) ersetzen durch:

```tsx
<View className="w-14">
  <Text variant="bodyEmph" style={{ fontVariant: ["tabular-nums"] }} numberOfLines={1}>
    {timeLabel}
  </Text>
  {subLabel ? (
    <Text variant="caption" tone="inkSecondary" numberOfLines={1}>
      {subLabel}
    </Text>
  ) : null}
</View>
```

Den Accent-Bar (`<View className="absolute bottom-2 left-1.5 top-2 w-1 rounded-full" …>`) ersetzen durch:

```tsx
<View
  className="absolute left-1.5 w-1"
  style={{
    backgroundColor: occ.type.color,
    // Flush to the card edge where the span continues — same language as the
    // bars in the month grid.
    top: seg.isStart ? 8 : 0,
    bottom: seg.isEnd ? 8 : 0,
    borderTopLeftRadius: seg.isStart ? 2 : 0,
    borderTopRightRadius: seg.isStart ? 2 : 0,
    borderBottomLeftRadius: seg.isEnd ? 2 : 0,
    borderBottomRightRadius: seg.isEnd ? 2 : 0,
  }}
/>
```

Am `Pressable` der Zeile ergänzen (Touch-Target bleibt unverändert weit über 44px):

```tsx
accessibilityRole="button"
accessibilityLabel={
  isSpan
    ? t("cal.a11y.eventSpan", { title: occ.title, day: subLabel, time: timeLabel })
    : t("cal.a11y.event", { title: occ.title, time: timeLabel })
}
```

Das Label ist Screenreader-sichtbarer Text und fällt damit unter Non-Negotiable Nr. 3 — auch die
Kommasetzung gehört in den Katalog, nicht ins Template-Literal. Dazu in beide Catalogs unter `cal`:

```json
"a11y": {
  "event": "{{title}}, {{time}}",
  "eventSpan": "{{title}}, {{day}}, {{time}}"
}
```

- [ ] **Step 4: Typecheck, Lint, Test**

Run: `bun run typecheck && bun lint && bun test`
Expected: alles grün.

- [ ] **Step 5: Beide Sprachen im Web prüfen**

Run: `bun run web`

Prüfen, auf DE **und** EN (Sprachumschalter in den Einstellungen):

1. Ein dreitägiger getakteter Termin: Tag 1 „ab 09:00 / Tag 1/3", Tag 2 „durchgehend / Tag 2/3", Tag 3 „bis 14:00 / Tag 3/3".
2. Ein mehrtägiger Ganztags-Termin: an jedem Tag „Ganztägig / Tag n/m".
3. Ein eintägiger Ganztags-Termin: „Ganztägig", **keine** Dauerzeile.
4. Ein normaler getakteter Termin: unverändert `09:00` + Dauer.
5. Ein laufender Termin steht über den getakteten Terminen des Tages.
6. Kein Label bricht um oder wird abgeschnitten.
7. Tap auf einen Folgetag öffnet das Detail-Sheet des richtigen Termins mit der korrekten Spanne.

- [ ] **Step 6: Commit**

```bash
git add features/i18n/locales/de.json features/i18n/locales/en.json "app-sections/(tabs)/kalender/KalenderScreen.tsx"
git commit -m "feat(calendar): Tagesliste zeigt die Tagesscheibe mehrtaegiger Termine"
```

---

### Task 7: Conflict-Detection über die volle Spanne

**Files:**

- Modify: `app-sections/event/EventCreateScreen.tsx:78-94`

**Interfaces:**

- Consumes: `useFamilyEvents(...).data` (unverändert `CalendarOccurrence[]`).
- Produces: keine neuen Exporte.

- [ ] **Step 1: Datums-Filter entfernen**

In `app-sections/event/EventCreateScreen.tsx` den `conflicts`-`useMemo` ersetzen durch:

```tsx
const occurrences = useFamilyEvents(startAt).data;
const conflicts = useMemo(() => {
  const checked = allDay ? toAllDayRange({ startAt, endAt }) : { startAt, endAt };
  const samePerson = (o: { childId: string | null; parentId: string | null }) => {
    if (member === null) return true; // family-wide event conflicts with everything
    if (o.childId === null && o.parentId === null) return true; // existing family-wide conflicts with anyone
    if (member.kind === "child" && o.childId === member.id) return true;
    if (member.kind === "parent" && o.parentId === member.id) return true;
    return false;
  };
  // `rangesOverlap` already compares absolute instants — the old
  // `occurrenceDate === startDate` guard was what hid multi-day collisions.
  return occurrences.filter(
    (o) => samePerson(o) && rangesOverlap(o.startAt, o.endAt, checked.startAt, checked.endAt),
  );
}, [occurrences, startAt, endAt, member, allDay]);
```

Der `format`-Import bleibt (die Warn-Box formatiert weiter Uhrzeiten); falls `parseISO` oder andere Importe dadurch ungenutzt werden, entfernt der Lint-Lauf in Step 2 die Zweifel.

- [ ] **Step 2: Typecheck und Lint**

Run: `bun run typecheck && bun lint`
Expected: keine Fehler, insbesondere kein `no-unused-vars`.

- [ ] **Step 3: Verhalten im Web prüfen**

Run: `bun run web`

1. Bestehenden Termin am Mittwoch 16:00–17:00 im Kalender haben.
2. Neuen Termin Montag 09:00 bis Freitag 14:00 anlegen (gleiches Familienmitglied oder „Niemand").
3. Erwartung: Die gelbe Kollisions-Box erscheint, obwohl die Kollision am **Mittwoch** und nicht am Starttag liegt.
4. Gegenprobe: Ein Termin am Samstag löst keine Warnung aus.

- [ ] **Step 4: Commit**

```bash
git add app-sections/event/EventCreateScreen.tsx
git commit -m "fix(calendar): Kollisionen ueber die gesamte Terminspanne pruefen"
```

---

### Task 8: TODO-Pflege und Gesamt-Verifikation

**Files:**

- Modify: `docs/TODO.md`

**Interfaces:** keine.

- [ ] **Step 1: Erledigte TODO-Einträge entfernen**

In `docs/TODO.md`, Abschnitt „Calendar (V1 …)", diese beiden Bullets **vollständig löschen** (nicht abhaken — die Datei ist Backlog, keine Historie):

- „**Mehrtägige Termine erscheinen nur an ihrem Starttag** …"
- „**Conflict-Detection prüft nur den Starttag** …"

- [ ] **Step 2: Neue Rest-Limits ergänzen**

Im selben Abschnitt anhängen:

```markdown
- **Kollisionsprüfung reicht nur so weit wie das geladene Monatsfenster** ([app-sections/event/EventCreateScreen.tsx](../app-sections/event/EventCreateScreen.tsx) — `conflicts`): Die Prüfung deckt seit der Multi-Day-Iteration die volle Terminspanne ab, arbeitet aber auf `useFamilyEvents(startAt)` — also dem Monat um den Starttag ±7 Tage. Eine Spanne, die darüber hinausreicht, wird nur im geladenen Ausschnitt geprüft. Saubere Lösung ist ein am Formular-Range ausgerichtetes Query-Fenster; das ist eine Änderung an der Query-Ebene und war bewusst nicht Teil der Iteration.
- **Balken-Budget im Monatsraster ist zwei pro Tag** ([features/calendar/spans.ts](../features/calendar/spans.ts) — `MAX_BARS`): Ab dem dritten mehrtägigen Termin an einem Tag fällt die Spanne in die Dot-Reihe zurück und verliert damit ihre visuelle Verbindung über die Tage. Mehr Balken brauchen mehr Zellhöhe im Raster — erst relevant, wenn drei parallele Spannen real vorkommen.
```

- [ ] **Step 3: COPY.md-Sammelpunkt erweitern**

Den bestehenden Bullet „**Neue Kalender-Keys fehlen in `docs/COPY.md`**" um die neuen Keys erweitern — im Satz mit der Key-Aufzählung ergänzen:

```markdown
… sowie `cal.span.allDay`/`from`/`until`/`through`/`dayOf` (Beschriftung mehrtägiger Termine in der Tagesliste).
```

Zusätzlich am Ende desselben Bullets anfügen:

```markdown
Ebenso kennt [patterns/calendar.md](../patterns/calendar.md) die Spannen-Darstellung noch nicht — die V1-Beschreibung nennt nur „bis zu 3 Farbdots" pro Tag, nicht den Spannen-Balken.
```

- [ ] **Step 4: Vollständige Verifikation**

Alle Befehle laufen lassen und die Ausgaben tatsächlich lesen — keine Erfolgsmeldung ohne gesehene Ausgabe:

```bash
bun run format:check
bun lint
bun run typecheck
bun test
bunx expo export --platform web --output-dir /tmp/eltern-web
```

Expected: alle fünf erfolgreich. `bun test` muss die neuen Suiten `spans.test.ts` (17 Tests) und `expand.test.ts` (4 Tests) enthalten.

- [ ] **Step 5: CodeRabbit-Review vor dem PR**

```bash
coderabbit review --base main
```

Jeden Fund entweder beheben oder mit Begründung bewusst verwerfen. Beheben in eigenen Commits (`fix(calendar): CodeRabbit-Findings — …`).

- [ ] **Step 6: Commit**

```bash
git add docs/TODO.md
git commit -m "docs(todo): Multi-Day-Punkte schliessen, neue Rest-Limits erfassen"
```

- [ ] **Step 7: PR öffnen**

```bash
git push -u origin feat/calendar-multi-day-spans
gh pr create --base main --title "feat(calendar): mehrtägige Termine im Monatsraster und in der Tagesliste"
```

PR-Body: Ziel, die vier Aufgabenpunkte mit Status (zwei davon bereits durch `6f644f0` erledigt), Link auf Spec und Plan, Ergebnis der Simulator-Prüfung aus Task 5, sowie die drei bekannten Rest-Limits aus `docs/TODO.md`.

---

## Reihenfolge und Abhängigkeiten

```text
Task 1 (Span-Mathematik)
  └─ Task 2 (Marker)  ──┐
Task 3 (Expansions-Fenster, unabhängig) ──┐
                                          ├─ Task 4 (Hooks + Screen-Verdrahtung)
                                          │     ├─ Task 5 (Balken im Raster)
                                          │     └─ Task 6 (Labels + i18n)
Task 7 (Conflict-Detection, unabhängig von 1–6)
Task 8 (Docs + Verifikation, zuletzt)
```

Task 3 und Task 7 hängen an keiner der anderen Aufgaben und können vorgezogen werden. Task 5 und Task 6 sind nach Task 4 unabhängig voneinander.
