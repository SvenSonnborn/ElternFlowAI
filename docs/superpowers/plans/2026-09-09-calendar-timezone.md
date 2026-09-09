# Zeitumstellung und `events.timezone` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Serientermin liegt zu jeder Jahreszeit auf derselben Uhrzeit — auch über die beiden Zeitumstellungen hinweg, und unabhängig davon, in welcher Zone das lesende Gerät steht.

**Architecture:** `events` bekommt eine Spalte `timezone` — die Zone, in der die Wanduhrzeit dieses Termins gilt. Ein neues Modul `features/calendar/timezone.ts` rechnet mit `Intl.DateTimeFormat` zwischen Instant und Wandzeit um. `rrule.ts` kapselt das vollständig: Regel und Fenster gehen als „floating" hinein (Wandzeit in den UTC-Komponenten), `rrule` iteriert damit DST-frei, die Ergebnisse kommen zonenbewusst als echte Instants zurück. `tzid` wird **nicht** gesetzt — es ist in `rrule@2.8.1` nur bei Prozess-Zeitzone UTC korrekt.

**Tech Stack:** Postgres (Supabase MCP `apply_migration`), TypeScript strict, `rrule@2.8.1`, `Intl.DateTimeFormat` (Hermes), `expo-localization`, `bun test`.

**Spec:** [docs/superpowers/specs/2026-09-09-calendar-silent-data-loss-design.md](../specs/2026-09-09-calendar-silent-data-loss-design.md) — §5. Dritter von vier PRs aus [Block 1 der Roadmap](../../roadmap.md#block-1--stiller-datenverlust-im-kalender); PR A (#117) und PR B (#118) sind gemergt.

## Global Constraints

- **Handoff-Bundle ist gesperrt** (CLAUDE.md Non-Negotiable 1): `design-system/{colors,typography,spacing,themes,components,index}.ts`, `docs/{HANDOFF,COPY,ICONS,README}.md`, `patterns/*.md` werden **nicht** angefasst.
- **Keine neuen Copy-Keys.** Die Zone ist im Formular unsichtbar; V1 nimmt an, dass der Anlegende in der Zone lebt, in der der Termin stattfindet. Ein Zonen-Picker wäre ein eigenes Feature (TODO-Eintrag in Task 7).
- **`tzid` wird nirgends gesetzt.** Begründung in Spec §1.1, nachgemessen. Wer es einbaut, macht den Fix zum No-op.
- **Docstrings** (CLAUDE.md → Documentation discipline): jede neue exportierte Funktion und jedes neue Modul bekommt einen JSDoc-Block **im selben Commit**. Inhalt ist das Nicht-Offensichtliche — Warum, Grenzfall, ADR-Verweis —, nicht die Wiederholung des Namens. Lokale Helfer in Testdateien sind ausgenommen.
- **Commits:** Conventional-Commits-Präfix, scoped, deutsch. **Niemals** ein `Co-Authored-By: Claude`-Trailer — Repo-Policy, ausnahmslos. `--no-verify` ist verboten.
- **Vor jedem Commit grün:** `bun run typecheck` · `bun lint` · `bun test` · `bun format:check`.
- **Testfixturen sind zonenrobust.** Der Runner läuft lokal unter `Europe/Berlin`, in CI unter `UTC`. Die Tests dieses PRs müssen unter **beiden** dasselbe liefern — genau das ist die Eigenschaft, die `tzid` nicht hat. Jede neue Suite wird zusätzlich einmal mit `TZ=UTC` und einmal mit `TZ=America/New_York` gefahren, und das Ergebnis kommt in den Report.
- **`docs/TODO.md` im selben Commit pflegen:** erledigte Einträge **löschen**, neu entstandene Grenzen anlegen.
- **Branch:** `fix/calendar-dst-timezone`, von `main`.
- **Push, PR-Erstellung, CodeRabbit-Lauf und Sichtprüfungen** sind **nicht** Teil der Tasks — sie gehen als Übergabe an den Menschen.

---

## File Structure

| Datei                                                                  | Verantwortung                                           | Task |
| ---------------------------------------------------------------------- | ------------------------------------------------------- | ---- |
| _(temporär)_ `features/calendar/__intlProbe.ts`                        | Gegenprobe, ob Hermes `Intl` mit `timeZone` trägt       | 0    |
| `supabase/migrations/<ts>_events_timezone.sql` (neu)                   | Spalte `timezone` + Check + Comment                     | 1    |
| `features/supabase/database.types.ts`                                  | neu generiert                                           | 1    |
| `features/calendar/timezone.ts` + `.test.ts` (neu)                     | Instant ↔ Wandzeit, mit Umstellungs-Grenzfällen         | 2    |
| `features/calendar/rrule.ts` + `.test.ts` (neu)                        | neuer Vertrag: `occurrencesBetween` · `allOccurrences`  | 3    |
| `features/calendar/expand.ts`                                          | Aufrufer #1; Dauer in Wandzeit                          | 3, 4 |
| `features/calendar/recurrence.ts`                                      | Aufrufer #2 (`consumedBefore`); `setRruleUntil`-Vertrag | 3, 5 |
| `features/calendar/createMutation.ts`                                  | `CreateEventVars.timezone`, beide Schreiber             | 6    |
| `features/calendar/deviceTimeZone.ts` (neu)                            | Gerätezone, mit Fallback-Kette                          | 6    |
| `app-sections/event/EventCreateScreen.tsx`                             | reicht die Gerätezone durch                             | 6    |
| `docs/decision-log.md`                                                 | **ADR-033** — Zonenmodell                               | 7    |
| `CLAUDE.md`, `docs/architecture.md`, `docs/TODO.md`, `docs/roadmap.md` | Doku nachziehen                                         | 7    |

---

## Task 0: Trägt `Intl` unter Hermes? — die Gegenprobe

**Files:**

- Create (temporär, wird am Ende desselben Tasks wieder gelöscht): `features/calendar/__intlProbe.ts`
- Modify (temporär): `app/_layout.tsx`

**Interfaces:**

- Consumes: nichts.
- Produces: **eine Feststellung**, kein Code. Alle folgenden Tasks hängen daran.

**Warum das zuerst kommt:** Das Repo nutzt heute an **keiner** Stelle `Intl` zur Laufzeit — `features/auth/avatarColor.ts` erwähnt `Intl.Segmenter` nur in einem Kommentar. Das ganze Zonenmodell steht und fällt damit, dass `Intl.DateTimeFormat` mit einer `timeZone`-Option und `formatToParts` unter Hermes auf iOS **und** Android funktioniert. Unter Bun zu bestehen beweist dafür **nichts** — Bun hat volles ICU, Hermes nicht zwingend.

Fällt die Probe aus, ist `@formatjs/intl-datetimeformat` samt Zonendaten der von Expo dokumentierte Ausweg. Das änderte das **Innere** von `features/calendar/timezone.ts` und die Bundle-Größe, nicht den übrigen Entwurf.

- [ ] **Step 1: Die Probe schreiben**

`features/calendar/__intlProbe.ts`:

```ts
/**
 * Wegwerf-Gegenprobe für Task 0: Trägt Hermes `Intl.DateTimeFormat` mit einer
 * `timeZone`-Option und `formatToParts`? Wird im selben Task wieder gelöscht.
 */
export function probeIntl(): string {
  const lines: string[] = [];
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Berlin",
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    for (const iso of ["2026-07-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z"]) {
      const parts = fmt.formatToParts(new Date(iso));
      lines.push(`${iso} → ${parts.map((p) => p.value).join("")}`);
    }
    lines.push(`resolvedOptions.timeZone = ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
  } catch (err) {
    lines.push(`WURF: ${String(err)}`);
  }
  return lines.join("\n");
}
```

- [ ] **Step 2: Sie im Start aufrufen**

In `app/_layout.tsx`, im Modulrumpf ganz oben (nach den Imports), temporär:

```tsx
import { probeIntl } from "@/features/calendar/__intlProbe";

if (__DEV__) {
  console.log("[INTL-PROBE]\n" + probeIntl());
}
```

- [ ] **Step 3: Auf iOS ausführen**

Run: `bun run ios`

Im Metro-Log nach `[INTL-PROBE]` suchen. **Erwartet:**

```
2026-07-01T00:00:00.000Z → 07/01/2026, 02:00:00
2026-01-01T00:00:00.000Z → 01/01/2026, 01:00:00
resolvedOptions.timeZone = <Zone des Simulators>
```

Die beiden Zeilen sind der eigentliche Beweis: **02:00 im Juli, 01:00 im Januar** — Hermes kennt die Sommerzeitregel von `Europe/Berlin`, nicht nur einen festen Offset. Kommt stattdessen zweimal `01:00` (oder zweimal `00:00`), ist die Zonendatenbank leer und die Probe **gescheitert**, auch ohne Wurf.

- [ ] **Step 4: Auf Android ausführen**

Run: `bun run android`

Dieselbe Erwartung. Android und iOS haben verschiedene Intl-Unterbauten (Java-ICU bzw. Apples ICU) — eine Plattform beweist die andere nicht.

- [ ] **Step 5: Ergebnis festhalten und entscheiden**

Beide Ausgaben **wörtlich** in den Report. Dann:

- **Beide Plattformen liefern 02:00/01:00** → weiter mit Task 1, `timezone.ts` benutzt natives `Intl`.
- **Eine Plattform scheitert** → Task 1 bis 7 bleiben gültig, aber `timezone.ts` bekommt in Task 2 zusätzlich `@formatjs/intl-datetimeformat` samt `add-all-tz`-Import als Polyfill, geladen einmalig im Root-Layout. Das ist eine neue Dependency und muss vor dem Einbau mit dem Menschen abgestimmt werden — **melde diesen Fall als `BLOCKED` zurück, statt ihn selbst zu entscheiden.**

- [ ] **Step 6: Probe restlos entfernen**

```bash
rm features/calendar/__intlProbe.ts
```

Und den `if (__DEV__)`-Block samt Import wieder aus `app/_layout.tsx` löschen.

Run: `git status --porcelain` — erwartet: **leer**. Dieser Task hinterlässt keinen Code, nur die Feststellung im Report.

---

## Task 1: Migration — `events.timezone`

**Files:**

- Create: `supabase/migrations/<zeitstempel>_events_timezone.sql`
- Modify: `features/supabase/database.types.ts` (generiert, nicht von Hand)

**Interfaces:**

- Consumes: nichts.
- Produces: `EventRow.timezone: string` — ab Task 3 von `rrule.ts` gelesen, ab Task 6 von den Schreibern gesetzt.

**Zum Dateinamen:** Der Zeitstempel folgt dem Bestand (`20260904075041_conflict_detection.sql`), also `yyyyMMddHHmmss`. Nimm die aktuelle UTC-Zeit; sie muss größer sein als die der letzten vorhandenen Migration.

- [ ] **Step 1: Migration schreiben**

```sql
-- Eltern Flow AI: Zeitzone je Termin
-- Spec: docs/superpowers/specs/2026-09-09-calendar-silent-data-loss-design.md (§5)

alter table public.events
  add column if not exists timezone text not null default 'Europe/Berlin';

-- Eine Prüfung gegen `pg_timezone_names` wäre genauer, ist aber als Subquery
-- in einem CHECK nicht erlaubt und als Funktion nicht `immutable`. Der Regex
-- fängt leere Strings und Tippfehler; die eigentliche Gültigkeit garantiert der
-- Client, der die Zone aus dem Betriebssystem liest.
alter table public.events
  drop constraint if exists events_timezone_iana;
alter table public.events
  add constraint events_timezone_iana
  check (timezone ~ '^(UTC|[A-Za-z_]+(/[A-Za-z0-9_+-]+){1,2})$');

comment on column public.events.timezone is
  'IANA-Zone, in der die Wanduhrzeit dieses Termins und seiner RRULE gilt. Bestimmt die Auswertung über Zeitumstellungen hinweg; die Anzeige rechnet daraus in die Zone des Lesers um. Der Default backfillt die Bestandszeilen — für eine DE-primäre App die einzige Zone, die nicht geraten ist. Siehe ADR-033.';
```

- [ ] **Step 2: Anwenden**

Über den Supabase-MCP-Server (`apply_migration`), wie bei `20260904075041_conflict_detection.sql`. Name: `events_timezone`.

- [ ] **Step 3: Gegenprobe in der laufenden Datenbank**

Per MCP `execute_sql`:

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'events' and column_name = 'timezone';
```

Erwartet: eine Zeile, `text`, `NO`, `'Europe/Berlin'::text`.

Und den Constraint prüfen:

```sql
select count(*) from public.events where timezone is null or timezone = '';
```

Erwartet: `0`.

- [ ] **Step 4: Types neu generieren**

Über den MCP-Server (`generate_typescript_types`), Ergebnis nach `features/supabase/database.types.ts`. **Nicht von Hand editieren.**

Run: `bun run typecheck`
Erwartet: **grün** — die Spalte ist `not null` mit Default, also in `Insert` optional; kein Aufrufer bricht.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations features/supabase/database.types.ts
git commit -m "feat(calendar): Spalte events.timezone anlegen

Die Zone, in der die Wanduhrzeit eines Termins und seiner RRULE gilt. Die
Geraetezone waere der falsche Ort — sie beschreibt, wo der Leser gerade ist,
nicht wo die Serie verankert wurde. Default backfillt die Bestandszeilen."
```

---

## Task 2: `features/calendar/timezone.ts`

**Files:**

- Create: `features/calendar/timezone.ts`
- Create: `features/calendar/timezone.test.ts`

**Interfaces:**

- Consumes: nichts. Das Modul hat **keine** Abhängigkeit außer `Intl` — insbesondere **nicht** `expo-localization` (das kommt in Task 6 in ein eigenes Modul, damit diese Tests unter Bun ohne native Module laufen).
- Produces:
  ```ts
  zoneOffsetMs(instant: Date, timeZone: string): number
  instantToFloating(instant: Date, timeZone: string): Date
  floatingToInstant(floating: Date, timeZone: string): Date
  ```

**Das Vorzeichen, einmal festgelegt:** `zoneOffsetMs` liefert `Wandzeit-als-UTC − Instant`. Für Berlin im Sommer also `+2 h`. Daraus folgt `instantToFloating = instant + offset` und `floatingToInstant = floating − offset`.

**Korrektur zur Spec:** §5.3 sagt, `floatingToInstant` brauche „zwei Durchläufe". Nachgemessen stimmt das nicht — ein naiver Zweipass (Offset an der Wandzeit schätzen, dann am Ergebnis korrigieren) liefert für die **doppelte Stunde** den _zweiten_ Zeitpunkt, während die Spec ausdrücklich den _ersten_ verlangt. Beide Sonden müssen **außerhalb** des Umstellungsfensters liegen. Gemessen:

```
Lücke   29.03. 02:30 → naiv 03:30 ✔   zwei Sonden 03:30 ✔
Doppelt 25.10. 02:30 → naiv 02:30 CET ✘   zwei Sonden 02:30 CEST ✔
Normal  01.07. 12:00 → beide gleich ✔
```

- [ ] **Step 1: Die Tests schreiben**

`features/calendar/timezone.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { floatingToInstant, instantToFloating, zoneOffsetMs } from "./timezone";

const BERLIN = "Europe/Berlin";

/** Eine Wandzeit als „floating" Date — die Komponenten stehen in UTC. */
function wall(iso: string): Date {
  return new Date(`${iso}Z`);
}

describe("zoneOffsetMs", () => {
  test("Sommerzeit sind zwei Stunden, Winterzeit eine", () => {
    expect(zoneOffsetMs(new Date("2026-07-01T00:00:00.000Z"), BERLIN)).toBe(2 * 3600_000);
    expect(zoneOffsetMs(new Date("2026-01-01T00:00:00.000Z"), BERLIN)).toBe(1 * 3600_000);
  });

  test("UTC hat keinen Offset", () => {
    expect(zoneOffsetMs(new Date("2026-07-01T00:00:00.000Z"), "UTC")).toBe(0);
  });

  test("Millisekunden des Instants verfälschen den Offset nicht", () => {
    // `formatToParts` kennt keine Millisekunden; ohne Sekunden-Trunkierung
    // käme hier ein um 123 ms verschobener Offset heraus.
    expect(zoneOffsetMs(new Date("2026-07-01T00:00:00.123Z"), BERLIN)).toBe(2 * 3600_000);
  });
});

describe("instantToFloating", () => {
  test("trägt die Wandzeit in die UTC-Komponenten", () => {
    const floating = instantToFloating(new Date("2026-07-01T10:00:00.000Z"), BERLIN);
    expect(floating.toISOString()).toBe("2026-07-01T12:00:00.000Z");
  });

  test("erhält die Millisekunden", () => {
    const floating = instantToFloating(new Date("2026-07-01T10:00:00.250Z"), BERLIN);
    expect(floating.toISOString()).toBe("2026-07-01T12:00:00.250Z");
  });
});

describe("floatingToInstant", () => {
  test("Rundlauf: instant → floating → instant", () => {
    for (const iso of [
      "2026-01-15T08:30:00.000Z",
      "2026-07-15T08:30:00.000Z",
      "2026-10-25T00:30:00.000Z",
    ]) {
      const instant = new Date(iso);
      expect(floatingToInstant(instantToFloating(instant, BERLIN), BERLIN).toISOString()).toBe(iso);
    }
  });

  test("Sprung-Lücke: 29.03. 02:30 existiert nicht → 03:30", () => {
    // Die Uhr springt von 02:00 auf 03:00. Gewählt wird der spätere Zeitpunkt,
    // dieselbe Richtung, die `new Date(y, m, d, 2, 30)` lokal nimmt.
    const instant = floatingToInstant(wall("2026-03-29T02:30:00"), BERLIN);
    expect(instant.toISOString()).toBe("2026-03-29T01:30:00.000Z");
    expect(instantToFloating(instant, BERLIN).toISOString()).toBe("2026-03-29T03:30:00.000Z");
  });

  test("doppelte Stunde: 25.10. 02:30 gibt es zweimal → der erste zählt", () => {
    // 00:30Z ist noch Sommerzeit (+2), 01:30Z schon Winterzeit (+1). Genommen
    // wird der frühere: ein Termin, der vor der Umstellung angelegt wurde, war
    // in deren Regime gemeint.
    expect(floatingToInstant(wall("2026-10-25T02:30:00"), BERLIN).toISOString()).toBe(
      "2026-10-25T00:30:00.000Z",
    );
  });

  test("außerhalb jeder Umstellung ist es die schlichte Umkehrung", () => {
    expect(floatingToInstant(wall("2026-07-01T12:00:00"), BERLIN).toISOString()).toBe(
      "2026-07-01T10:00:00.000Z",
    );
  });
});
```

- [ ] **Step 2: Rot bestätigen**

Run: `bun test features/calendar/timezone.test.ts`
Erwartet: **Fehlschlag mit `Cannot find module './timezone'`.**

- [ ] **Step 3: Das Modul schreiben**

`features/calendar/timezone.ts`:

```ts
/**
 * Umrechnung zwischen **Instant** (einem Zeitpunkt) und **Wandzeit** (dem, was
 * eine Uhr in einer bestimmten Zone zeigt).
 *
 * Die Wandzeit wird als „floating" `Date` dargestellt: ihre Komponenten stehen
 * in den **UTC**-Feldern. `2026-07-01T12:00:00.000Z` heißt hier also „12:00
 * Wandzeit", nicht „12:00 UTC". Das klingt schief, ist aber genau die Form, in
 * der `rrule` rechnen soll: die Bibliothek liest `dtstart` mit UTC-Gettern und
 * rechnet absolut — auf Wandzeit angewandt ist das DST-frei, und „18:00" bleibt
 * über eine Umstellung hinweg stehen (ADR-033).
 *
 * Warum nicht `rrule`s `tzid`: `rrule@2.8.1` rechnet in `dateInTimeZone`
 * `targetOffset − localOffset` und ist damit nur korrekt, wenn die
 * Prozess-Zeitzone UTC ist. Eine React-Native-App läuft in der Gerätezone, dort
 * ist die Option ein No-op. Nachgemessen in Spec §1.1.
 */

/**
 * Ein `Intl.DateTimeFormat` je Zone. Die Konstruktion ist der teure Teil, das
 * Formatieren nicht — und `expandEvents` ruft das pro Occurrence auf.
 */
const FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = FORMATTERS.get(timeZone);
  if (cached) return cached;
  const created = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  FORMATTERS.set(timeZone, created);
  return created;
}

/**
 * Der Offset der Zone **zu diesem Zeitpunkt**, in Millisekunden, als
 * `Wandzeit-als-UTC − Instant`. Berlin im Sommer ergibt `+2 h`.
 *
 * Zwei Eigenheiten, die beide einen Test haben:
 *
 * - `hour12: false` liefert in manchen ICU-Versionen `24` statt `00` für
 *   Mitternacht; `% 24` fängt das ab.
 * - `formatToParts` kennt keine Millisekunden. Der Instant wird deshalb auf
 *   volle Sekunden abgeschnitten, bevor er abgezogen wird — sonst trüge der
 *   Offset die Millisekunden des Eingabewerts.
 */
export function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const at = (type: string): number => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    at("year"),
    at("month") - 1,
    at("day"),
    at("hour") % 24,
    at("minute"),
    at("second"),
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Instant → Wandzeit in `timeZone`, als floating `Date`. */
export function instantToFloating(instant: Date, timeZone: string): Date {
  return new Date(instant.getTime() + zoneOffsetMs(instant, timeZone));
}

/** Sicher außerhalb jedes Umstellungsfensters — keine Zone schaltet zweimal in 26 Stunden. */
const PROBE_MS = 26 * 3600_000;

/**
 * Wandzeit → Instant.
 *
 * An zwei Stunden im Jahr ist das nicht eindeutig, und beide Fälle brauchen
 * eine bewusste Antwort:
 *
 * - **Doppelte Stunde** (Berlin, 25.10., 02:30 gibt es zweimal): genommen wird
 *   der **frühere** Zeitpunkt, noch in der Sommerzeit. Ein Termin, der vor der
 *   Umstellung angelegt wurde, war in deren Regime gemeint.
 * - **Sprung-Lücke** (Berlin, 29.03., 02:30 existiert nicht): genommen wird der
 *   **spätere** Zeitpunkt, also 03:30 — dieselbe Richtung, die auch
 *   `new Date(y, m, d, 2, 30)` in der lokalen Zone wählt.
 *
 * Deshalb **zwei Sonden weit vor und weit nach** der gesuchten Wandzeit statt
 * eines Zweipasses am Wert selbst: Ein Zweipass konvergiert in der doppelten
 * Stunde auf den zweiten Zeitpunkt, weil beide Zwischenschritte hinter der
 * Umstellung landen — nachgemessen, er liefert dort 02:30 CET statt 02:30 CEST.
 */
export function floatingToInstant(floating: Date, timeZone: string): Date {
  const wall = floating.getTime();
  const offsetBefore = zoneOffsetMs(new Date(wall - PROBE_MS), timeZone);
  const offsetAfter = zoneOffsetMs(new Date(wall + PROBE_MS), timeZone);
  if (offsetBefore === offsetAfter) return new Date(wall - offsetBefore);

  const candidates = [wall - offsetBefore, wall - offsetAfter];
  const valid = candidates.filter(
    (candidate) => instantToFloating(new Date(candidate), timeZone).getTime() === wall,
  );
  // Beide gültig → doppelte Stunde, der frühere gewinnt.
  // Keiner gültig → Lücke, die spätere Wandzeit gewinnt (der spätere Instant).
  if (valid.length === 2) return new Date(Math.min(...valid));
  if (valid.length === 1) return new Date(valid[0]);
  return new Date(Math.max(...candidates));
}
```

- [ ] **Step 4: Grün bestätigen, in drei Zonen**

```bash
bun test features/calendar/timezone.test.ts
TZ=UTC bun test features/calendar/timezone.test.ts
TZ=America/New_York bun test features/calendar/timezone.test.ts
```

Erwartet: **dreimal identisch grün.** Die Erwartungen sind absolute UTC-Strings und dürfen von der Runner-Zone nicht abhängen — genau das ist die Eigenschaft, die dieses Modul liefern soll. Alle drei Läufe in den Report.

- [ ] **Step 5: Gates und Commit**

```bash
bun run typecheck && bun lint && bun format:check && bun test
git add features/calendar/timezone.ts features/calendar/timezone.test.ts
git commit -m "feat(calendar): Modul fuer Instant-Wandzeit-Umrechnung

zoneOffsetMs liest Intl.DateTimeFormat.formatToParts; floatingToInstant sondiert
weit vor und weit nach der gesuchten Wandzeit, statt am Wert selbst zu
konvergieren — ein Zweipass liefert in der doppelten Oktoberstunde den zweiten
statt des ersten Zeitpunkts. Beide Umstellungs-Grenzfaelle haben einen Test."
```

---

## Task 3: `rrule.ts` — neuer Vertrag, beide Aufrufer migriert

**Files:**

- Modify: `features/calendar/rrule.ts`
- Create: `features/calendar/rrule.test.ts`
- Modify: `features/calendar/expand.ts` — `expandRecurrence`
- Modify: `features/calendar/recurrence.ts` — `consumedBefore`

**Interfaces:**

- Consumes: `instantToFloating`, `floatingToInstant` aus Task 2; `EventRow.timezone` aus Task 1.
- Produces:
  ```ts
  occurrencesBetween(row: EventRow, from: Date, to: Date): Date[]   // echte Instants, inklusive Grenzen
  allOccurrences(row: EventRow): Date[]                             // echte Instants
  ```
  `buildRule` wird **nicht mehr exportiert**.

**Die beiden Aufrufer sind namentlich bekannt** (in `docs/roadmap.md` 1.4 festgehalten, per Suche bestätigt): `expandRecurrence` in `expand.ts` (`between`) und `consumedBefore` in `recurrence.ts` (`all`). Weitere gibt es nicht. Beide bekommen echte Instants zurück und dürfen ihre lokalen Getter behalten.

- [ ] **Step 1: Die Tests schreiben**

`features/calendar/rrule.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import type { Database } from "@/features/supabase/database.types";

import { allOccurrences, occurrencesBetween } from "./rrule";
import { instantToFloating } from "./timezone";

type EventRow = Database["public"]["Tables"]["events"]["Row"];

const BERLIN = "Europe/Berlin";

function row(overrides: Partial<EventRow> = {}): EventRow {
  return {
    id: "evt-1",
    family_id: "fam-1",
    type_id: "type-1",
    child_id: null,
    parent_id: null,
    title: "Sport",
    description: null,
    location: null,
    // 06.10.2026, 18:00 Berlin.
    start_at: "2026-10-06T16:00:00.000Z",
    end_at: "2026-10-06T17:00:00.000Z",
    all_day: false,
    rrule_freq: "weekly",
    rrule_interval: 1,
    rrule_byweekday: null,
    rrule_until: null,
    rrule_count: null,
    timezone: BERLIN,
    created_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Die Wandzeit einer Occurrence in der Zone des Termins, als `HH:mm`. */
function wallClock(instant: Date, timeZone: string): string {
  const floating = instantToFloating(instant, timeZone);
  return floating.toISOString().slice(11, 16);
}

describe("occurrencesBetween über die Umstellungen", () => {
  test("Oktober: die Uhrzeit bleibt 18:00, obwohl der Offset wechselt", () => {
    const out = occurrencesBetween(
      row(),
      new Date("2026-10-01T00:00:00.000Z"),
      new Date("2026-11-10T23:59:59.000Z"),
    );
    expect(out.map((d) => wallClock(d, BERLIN))).toEqual([
      "18:00",
      "18:00",
      "18:00",
      "18:00",
      "18:00",
      "18:00",
    ]);
    // Und der Instant zieht tatsächlich mit: vor der Umstellung 16:00Z, danach 17:00Z.
    expect(out[0].toISOString()).toBe("2026-10-06T16:00:00.000Z");
    expect(out[3].toISOString()).toBe("2026-10-27T17:00:00.000Z");
  });

  test("März: dieselbe Prüfung in der Gegenrichtung", () => {
    // 09.03.2026, 08:00 Berlin (Winterzeit, +1).
    const out = occurrencesBetween(
      row({ start_at: "2026-03-09T07:00:00.000Z", end_at: "2026-03-09T08:00:00.000Z" }),
      new Date("2026-03-01T00:00:00.000Z"),
      new Date("2026-04-15T23:59:59.000Z"),
    );
    expect(out.map((d) => wallClock(d, BERLIN))).toEqual([
      "08:00",
      "08:00",
      "08:00",
      "08:00",
      "08:00",
      "08:00",
    ]);
    expect(out[0].toISOString()).toBe("2026-03-09T07:00:00.000Z");
    expect(out[3].toISOString()).toBe("2026-03-30T06:00:00.000Z");
  });

  test("ein Einzeltermin liefert sich selbst, wenn er im Fenster liegt", () => {
    const single = row({ rrule_freq: null });
    expect(
      occurrencesBetween(
        single,
        new Date("2026-10-01T00:00:00.000Z"),
        new Date("2026-10-31T00:00:00.000Z"),
      ),
    ).toHaveLength(1);
    expect(
      occurrencesBetween(
        single,
        new Date("2026-11-01T00:00:00.000Z"),
        new Date("2026-11-30T00:00:00.000Z"),
      ),
    ).toHaveLength(0);
  });

  test("rrule_until begrenzt die Serie", () => {
    const out = occurrencesBetween(
      row({ rrule_until: "2026-10-20T23:59:59.000Z" }),
      new Date("2026-10-01T00:00:00.000Z"),
      new Date("2026-11-10T00:00:00.000Z"),
    );
    expect(out).toHaveLength(3);
  });
});

describe("allOccurrences", () => {
  test("eine gezählte Serie liefert genau count Vorkommen, alle mit derselben Uhrzeit", () => {
    const out = allOccurrences(row({ rrule_count: 6 }));
    expect(out).toHaveLength(6);
    expect(new Set(out.map((d) => wallClock(d, BERLIN)))).toEqual(new Set(["18:00"]));
  });

  test("ein Einzeltermin liefert genau sich selbst", () => {
    expect(allOccurrences(row({ rrule_freq: null })).map((d) => d.toISOString())).toEqual([
      "2026-10-06T16:00:00.000Z",
    ]);
  });
});

describe("Unabhängigkeit von der Zone des Termins", () => {
  test("dieselbe Wanduhrzeit in New York ergibt andere Instants, aber dieselbe Uhrzeit", () => {
    const ny = row({ timezone: "America/New_York", start_at: "2026-10-06T22:00:00.000Z" });
    const out = occurrencesBetween(
      ny,
      new Date("2026-10-01T00:00:00.000Z"),
      new Date("2026-11-30T23:59:59.000Z"),
    );
    expect(new Set(out.map((d) => wallClock(d, "America/New_York")))).toEqual(new Set(["18:00"]));
  });
});
```

- [ ] **Step 2: Rot bestätigen**

Run: `bun test features/calendar/rrule.test.ts`
Erwartet: Fehlschlag, weil `occurrencesBetween`/`allOccurrences` nicht existieren.

- [ ] **Step 3: `rrule.ts` umbauen**

Vollständiger neuer Inhalt von `features/calendar/rrule.ts`:

```ts
import { Frequency, RRule } from "rrule";

import type { Database } from "@/features/supabase/database.types";

import { floatingToInstant, instantToFloating } from "./timezone";

type EventRow = Database["public"]["Tables"]["events"]["Row"];

const FREQ_MAP: Record<NonNullable<EventRow["rrule_freq"]>, Frequency> = {
  daily: RRule.DAILY,
  weekly: RRule.WEEKLY,
  monthly: RRule.MONTHLY,
  yearly: RRule.YEARLY,
};

/**
 * Die Regel einer Zeile, **in Wandzeit**.
 *
 * `dtstart` und `until` gehen als „floating" hinein (Wandzeit in den
 * UTC-Komponenten, siehe `timezone.ts`). `rrule` liest sie mit UTC-Gettern und
 * rechnet absolut — auf Wandzeit angewandt ist das DST-frei, „18:00" bleibt
 * über eine Umstellung hinweg stehen. Die Ergebnisse sind entsprechend
 * ebenfalls floating und müssen von den Exporten unten zurückgerechnet werden.
 *
 * **`tzid` wird bewusst nicht gesetzt.** `rrule@2.8.1` rechnet dafür
 * `targetOffset − localOffset` und ist damit nur bei Prozess-Zeitzone UTC
 * korrekt; in einer RN-App, die in der Gerätezone läuft, ist die Option ein
 * No-op. Nachgemessen — Spec §1.1, ADR-033.
 *
 * Modulintern: der Floating-Raum verlässt diese Datei nicht.
 */
function buildFloatingRule(row: EventRow): RRule | null {
  if (!row.rrule_freq) return null;
  return new RRule({
    freq: FREQ_MAP[row.rrule_freq],
    interval: row.rrule_interval || 1,
    dtstart: instantToFloating(new Date(row.start_at), row.timezone),
    until: row.rrule_until ? instantToFloating(new Date(row.rrule_until), row.timezone) : null,
    count: row.rrule_count ?? null,
    byweekday: row.rrule_byweekday?.length ? row.rrule_byweekday.map((n) => n - 1) : null,
  });
}

/**
 * Alle Vorkommen im Fenster, als **echte Instants** — Grenzen inklusive.
 *
 * Ein Einzeltermin (`rrule_freq IS NULL`) ist ein Vorkommen: er liefert seinen
 * eigenen Start, wenn er ins Fenster fällt. Das war schon vorher die Semantik
 * des Aufrufers in `expand.ts` und wandert hier herein, damit beide Exporte
 * dieselbe Regel kennen.
 */
export function occurrencesBetween(row: EventRow, from: Date, to: Date): Date[] {
  const rule = buildFloatingRule(row);
  const start = new Date(row.start_at);
  if (!rule) return start >= from && start <= to ? [start] : [];
  const floatingFrom = instantToFloating(from, row.timezone);
  const floatingTo = instantToFloating(to, row.timezone);
  return rule
    .between(floatingFrom, floatingTo, true)
    .map((d) => floatingToInstant(d, row.timezone));
}

/**
 * Alle Vorkommen der Serie, als echte Instants.
 *
 * Nur für begrenzte Serien aufrufen (`rrule_count` oder `rrule_until` gesetzt) —
 * bei einer unbegrenzten liefe `all()` gegen `rrule`s interne Obergrenze. Der
 * einzige Aufrufer, `consumedBefore` in `recurrence.ts`, ruft es ausschließlich
 * für gezählte Serien.
 */
export function allOccurrences(row: EventRow): Date[] {
  const rule = buildFloatingRule(row);
  if (!rule) return [new Date(row.start_at)];
  return rule.all().map((d) => floatingToInstant(d, row.timezone));
}
```

- [ ] **Step 4: Aufrufer #1 — `expand.ts`**

In `features/calendar/expand.ts`: den Import `import { buildRule } from "./rrule";` ersetzen durch `import { occurrencesBetween } from "./rrule";`, und `expandRecurrence` auf den neuen Vertrag ziehen:

```ts
function expandRecurrence(
  row: EventRow,
  rangeStart: Date,
  rangeEnd: Date,
  durationMs: number,
): Date[] {
  const searchStart = new Date(rangeStart.getTime() - Math.max(0, durationMs));
  return occurrencesBetween(row, searchStart, rangeEnd);
}
```

Der Einzeltermin-Zweig entfällt hier — `occurrencesBetween` trägt ihn jetzt selbst (siehe dessen Docstring).

- [ ] **Step 5: Aufrufer #2 — `recurrence.ts`**

In `features/calendar/recurrence.ts`: `import { buildRule } from "./rrule";` ersetzen durch `import { allOccurrences } from "./rrule";`, und `consumedBefore`:

```ts
function consumedBefore(master: EventRow, occurrenceDate: string): number {
  if (!master.rrule_freq) return 0;
  // `allOccurrences` ist hier sicher: nur für zählbegrenzte Serien aufgerufen.
  return allOccurrences(master).filter((d) => dateOnly(d) < occurrenceDate).length;
}
```

Der `if (!rule) return 0;`-Zweig wird zur expliziten `rrule_freq`-Prüfung — `allOccurrences` gäbe für einen Einzeltermin sonst `[start]` zurück und zählte ihn mit.

- [ ] **Step 6: Grün bestätigen, in drei Zonen**

```bash
bun test features/calendar/
TZ=UTC bun test features/calendar/
TZ=America/New_York bun test features/calendar/
```

Erwartet: dreimal grün. **Wenn Bestandstests rot werden, prüfe sie einzeln, statt sie anzupassen** — die Fixtures in `expand.test.ts` und `recurrence.test.ts` tragen bisher keine `timezone`-Spalte; TypeScript zeigt das, und der Default gehört in die jeweilige Fabrik (`timezone: "Europe/Berlin"`), nicht in jede einzelne Erwartung.

- [ ] **Step 7: Den unrichtig gewordenen Kommentar mitziehen**

`features/calendar/expand.test.ts` trägt an der Serien-Fixture:

> Explicit UTC timestamps, like `recurrence.test.ts` — rrule computes in UTC, so a local-time fixture would drift with the runner's timezone.

Das stimmt so nicht mehr: `rrule` rechnet jetzt in Wandzeit, und die Zone steht in der Zeile. Ersetze den Kommentar durch eine Aussage, die den neuen Vertrag beschreibt — dass die Fixtures absolute Instants sind und die Auswertung an `row.timezone` hängt, nicht an der Runner-Zone.

- [ ] **Step 8: Gates und Commit**

```bash
bun run typecheck && bun lint && bun format:check && bun test
git add features/calendar/rrule.ts features/calendar/rrule.test.ts features/calendar/expand.ts features/calendar/expand.test.ts features/calendar/recurrence.ts
git commit -m "fix(calendar): Serien in Wandzeit auswerten statt absolut

buildRule wird modulintern; nach aussen gehen occurrencesBetween und
allOccurrences, die floaten und zurueckrechnen. Damit bleibt eine woechentliche
Serie ueber beide Zeitumstellungen auf derselben Uhrzeit — vorher sprang sie um
eine Stunde. Beide Aufrufer sind mitgezogen."
```

---

## Task 4: Die Dauer gehört ebenfalls in die Wandzeit

**Files:**

- Modify: `features/calendar/expand.ts` — `expandEvents`
- Modify: `features/calendar/expand.test.ts`

**Interfaces:**

- Consumes: `instantToFloating`, `floatingToInstant` aus Task 2.
- Produces: nichts Neues.

**Der Fall:** `expandEvents` rechnet `durationMs = masterEnd − masterStart` **absolut** und addiert sie auf jeden Occurrence-Start. Bei einem einstündigen Termin ist das gleichwertig. Bei einem **mehrtägigen**, der eine Umstellung überspannt, nicht: das Ende verschöbe sich um eine Stunde gegen die Wandzeit. Ein Termin, der Freitag 09:00 beginnt und Montag 14:00 endet, endete nach dem 25.10. um 13:00.

- [ ] **Step 1: Den Test schreiben**

Ans Ende von `features/calendar/expand.test.ts`:

```ts
describe("Dauer über eine Zeitumstellung", () => {
  test("ein mehrtägiges Vorkommen behält seine Wandzeit-Dauer", () => {
    // Wöchentlich ab Freitag 16.10.2026, 09:00 Berlin bis Montag 19.10., 14:00.
    // Das Vorkommen ab Freitag 23.10. läuft über die Umstellung am 25.10.
    const row = makeRow({
      start_at: "2026-10-16T07:00:00.000Z",
      end_at: "2026-10-19T12:00:00.000Z",
      rrule_freq: "weekly",
      timezone: "Europe/Berlin",
    });
    const out = expandEvents(
      [row],
      new Date("2026-10-20T00:00:00.000Z"),
      new Date("2026-10-27T00:00:00.000Z"),
      lightTheme,
    );
    expect(out).toHaveLength(1);
    // Start bleibt 09:00 Wandzeit (07:00Z, noch Sommerzeit), Ende 14:00 Wandzeit
    // — und das ist nach der Umstellung 13:00Z, nicht 12:00Z.
    expect(out[0].startAt.toISOString()).toBe("2026-10-23T07:00:00.000Z");
    expect(out[0].endAt.toISOString()).toBe("2026-10-26T13:00:00.000Z");
  });
});
```

- [ ] **Step 2: Rot bestätigen**

Run: `bun test features/calendar/expand.test.ts`
Erwartet: der neue Test failt am `endAt` (`2026-10-26T12:00:00.000Z` statt `13:00`). Kommt stattdessen ein Fehler beim Anlegen der Fixture, fehlt `timezone` in `makeRow` — dann dort ergänzen und erneut laufen lassen.

- [ ] **Step 3: `expandEvents` umstellen**

In `features/calendar/expand.ts`, im Schleifenrumpf von `expandEvents`: die absolute Dauer durch eine Wandzeit-Dauer ersetzen.

```ts
const masterStart = new Date(row.start_at);
const masterEnd = new Date(row.end_at);
// Absolut für das Suchfenster (dort geht es um echte Zeitspannen), in
// Wandzeit für das Ende jeder Occurrence: ein mehrtägiger Termin über eine
// Umstellung soll seine Wanduhrzeit behalten, nicht seine Millisekunden.
const durationMs = masterEnd.getTime() - masterStart.getTime();
const floatingDurationMs =
  instantToFloating(masterEnd, row.timezone).getTime() -
  instantToFloating(masterStart, row.timezone).getTime();
```

Und die Berechnung des Endes:

```ts
let resolved: Resolved = {
  title: row.title,
  location: row.location,
  startAt: occurrenceStart,
  endAt: floatingToInstant(
    new Date(instantToFloating(occurrenceStart, row.timezone).getTime() + floatingDurationMs),
    row.timezone,
  ),
};
```

Der Import oben: `import { floatingToInstant, instantToFloating } from "./timezone";`

- [ ] **Step 4: Grün bestätigen, in drei Zonen**

```bash
bun test features/calendar/
TZ=UTC bun test features/calendar/
TZ=America/New_York bun test features/calendar/
```

- [ ] **Step 5: Gates und Commit**

```bash
bun run typecheck && bun lint && bun format:check && bun test
git add features/calendar/expand.ts features/calendar/expand.test.ts
git commit -m "fix(calendar): Dauer eines Vorkommens in Wandzeit rechnen

Ein mehrtaegiger Termin ueber eine Umstellung endete eine Stunde zu frueh, weil
die absolute Dauer auf den neuen Start addiert wurde. Das Suchfenster bleibt
absolut — dort geht es um echte Zeitspannen."
```

---

## Task 5: `setRruleUntil` bekommt einen Tagesende-Instant

**Files:**

- Modify: `features/calendar/recurrence.ts` — `EventOps.setRruleUntil`, `applyDeleteScope`, `applyEditScope`, `createSupabaseEventOps`
- Modify: `features/calendar/recurrence.test.ts`

**Interfaces:**

- Consumes: `floatingToInstant` aus Task 2.
- Produces: `EventOps.setRruleUntil(eventId: string, untilIso: string)` — der Parameter wechselt von `yyyy-MM-dd` zu einem **ISO-Instant**.

**Der Fall:** Heute wird `dayBefore(occurrenceDate)` als nacktes `yyyy-MM-dd` in eine `timestamptz`-Spalte geschrieben. Postgres castet das in der Session-Zone (UTC) zu Mitternacht. Unter der Wandzeit-Auswertung aus Task 3 liegt der Serienschnitt damit bei 02:00 Ortszeit statt am Tagesende — ein Vorkommen am Cutoff-Tag um 18:00 fiele heraus. Dass es bisher nicht auffällt, liegt allein daran, dass `dayBefore` bei wöchentlichen Serien auf einen Tag ohne Vorkommen zeigt; bei einer täglichen fällt es sofort auf.

- [ ] **Step 1: Den Test schreiben**

In `features/calendar/recurrence.test.ts`, ans Ende:

```ts
describe("setRruleUntil bekommt einen Tagesende-Instant", () => {
  test("tägliche Serie, forward gelöscht ab dem 15.06. → der 14.06. bleibt vollständig", async () => {
    const ops = makeOps();
    const master = makeMaster({
      rrule_freq: "daily",
      rrule_byweekday: null,
      // 01.06.2026, 18:00 Berlin.
      start_at: "2026-06-01T16:00:00.000Z",
      end_at: "2026-06-01T17:00:00.000Z",
      timezone: "Europe/Berlin",
    });

    await applyDeleteScope({
      ops,
      scope: "forward",
      eventId: "evt-1",
      occurrenceDate: "2026-06-15",
      isRecurring: true,
      master,
    });

    // 14.06. 23:59:59.999 Berlin = 21:59:59.999 UTC — nicht 2026-06-14T00:00:00Z,
    // und erst recht nicht der nackte Datumsstring.
    expect(ops.setRruleUntil).toHaveBeenCalledWith("evt-1", "2026-06-14T21:59:59.999Z");
  });

  test("das Vorkommen am Cutoff-Tag überlebt die Grenze", () => {
    // Gegenprobe auf der Auswertungsseite: mit dem Tagesende-UNTIL liefert die
    // Regel den 14.06. noch, mit Mitternacht-UTC nicht.
    const truncated = {
      ...makeMaster({
        rrule_freq: "daily",
        rrule_byweekday: null,
        start_at: "2026-06-01T16:00:00.000Z",
        end_at: "2026-06-01T17:00:00.000Z",
        timezone: "Europe/Berlin",
      }),
      rrule_until: "2026-06-14T21:59:59.999Z",
    };
    const last = allOccurrences(truncated).at(-1);
    expect(last?.toISOString()).toBe("2026-06-14T16:00:00.000Z");
  });
});
```

Der zweite Test braucht oben `import { allOccurrences } from "./rrule";`.

- [ ] **Step 2: Rot bestätigen**

Run: `bun test features/calendar/recurrence.test.ts`
Erwartet: der erste Test failt (`"2026-06-14"` statt des Instants).

- [ ] **Step 3: Den Helfer und die Aufrufer umstellen**

In `features/calendar/recurrence.ts`, neben `dayBefore`:

```ts
/**
 * Das Ende des Tages `isoDate` **in der Zone des Termins**, als ISO-Instant.
 *
 * `setRruleUntil` schrieb früher den nackten Datumsstring in eine
 * `timestamptz`-Spalte; Postgres castet ihn in der Session-Zone (UTC) zu
 * Mitternacht. Seit die Regel in Wandzeit ausgewertet wird (ADR-033), schnitte
 * das die Serie um 02:00 Ortszeit statt am Tagesende — bei einer täglichen
 * Serie verschwände das Vorkommen des Cutoff-Tages.
 */
function endOfDayInstant(isoDate: string, timeZone: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const floating = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
  return floatingToInstant(floating, timeZone).toISOString();
}
```

Import ergänzen: `import { floatingToInstant } from "./timezone";`

Die `EventOps`-Signatur:

```ts
/** `untilIso` ist ein **Instant**, kein Datumsstring — siehe `endOfDayInstant`. */
setRruleUntil: (eventId: string, untilIso: string) => Promise<void>;
```

Beide Aufrufstellen (in `applyDeleteScope` und `applyEditScope`) von

```ts
await ops.setRruleUntil(eventId, cutoff);
```

auf

```ts
await ops.setRruleUntil(eventId, endOfDayInstant(cutoff, master.timezone));
```

Der Vergleich `cutoff < dateOnly(new Date(master.start_at))` bleibt unverändert — er arbeitet weiter auf Datumsschlüsseln, nicht auf Instants.

- [ ] **Step 4: Bestandstests beurteilen**

Zwei vorhandene Tests erwarten `setRruleUntil(…, "2026-06-14")` (in `applyDeleteScope` und `applyEditScope`, jeweils der `scope=forward`-Fall). Beide sind **nachzuziehen**, nicht zu löschen — sie prüfen weiterhin, dass der Schnitt am Vortag liegt, nur mit dem präziseren Wert. Der erwartete Instant hängt an der `timezone` der jeweiligen Fixture; wenn `makeMaster` `Europe/Berlin` führt, ist es `"2026-06-14T21:59:59.999Z"`.

- [ ] **Step 5: Grün bestätigen, in drei Zonen**

```bash
bun test features/calendar/
TZ=UTC bun test features/calendar/
TZ=America/New_York bun test features/calendar/
```

- [ ] **Step 6: Gates und Commit**

```bash
bun run typecheck && bun lint && bun format:check && bun test
git add features/calendar/recurrence.ts features/calendar/recurrence.test.ts
git commit -m "fix(calendar): Serienschnitt am Tagesende statt um Mitternacht UTC

setRruleUntil bekam einen nackten Datumsstring in eine timestamptz-Spalte;
Postgres machte daraus Mitternacht UTC, also 02:00 Ortszeit. Seit die Regel in
Wandzeit ausgewertet wird, verschwaende damit das Vorkommen des Cutoff-Tages
einer taeglichen Serie."
```

---

## Task 6: Der Create-Pfad schreibt die Zone

**Files:**

- Create: `features/calendar/deviceTimeZone.ts`
- Create: `features/calendar/deviceTimeZone.test.ts`
- Modify: `features/calendar/createMutation.ts` — `CreateEventVars`, `createEvent`, `optimisticEventRow`
- Modify: `features/calendar/createMutation.test.ts`
- Modify: `app-sections/event/EventCreateScreen.tsx`
- Modify: `features/calendar/index.ts` (Barrel), falls `deviceTimeZone` von dort exportiert werden soll

**Interfaces:**

- Consumes: `EventRow.timezone` aus Task 1.
- Produces: `deviceTimeZone(): string`; `CreateEventVars.timezone: string`.

**Warum ein eigenes Modul:** `deviceTimeZone` importiert `expo-localization`, also ein natives Modul. In `timezone.ts` würde das dessen Tests unter Bun mitziehen. Der Schnitt hält `timezone.ts` abhängigkeitsfrei.

- [ ] **Step 1: Das Modul schreiben**

`features/calendar/deviceTimeZone.ts`:

```ts
import { getCalendars } from "expo-localization";

/** Letzter Ausweg, wenn weder Expo noch `Intl` eine Zone nennen. DE-primäre App. */
const FALLBACK = "Europe/Berlin";

/**
 * Die IANA-Zone des Geräts — die Zone, in der ein neu angelegter Termin
 * verankert wird.
 *
 * Drei Stufen, weil jede für sich ausfallen kann: `expo-localization` liefert
 * `timeZone` als `string | null`, und `Intl.DateTimeFormat().resolvedOptions()`
 * kann in einer ICU-losen Umgebung einen leeren Wert melden. V1 nimmt an, dass
 * der Anlegende in der Zone lebt, in der der Termin stattfindet — ein
 * Zonen-Picker wäre ein eigenes Feature (siehe `docs/TODO.md`).
 */
export function deviceTimeZone(): string {
  const fromExpo = getCalendars()[0]?.timeZone;
  if (fromExpo) return fromExpo;
  const fromIntl = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return fromIntl || FALLBACK;
}
```

- [ ] **Step 2: Den Test schreiben**

`features/calendar/deviceTimeZone.test.ts` — mit `mock.module` für das native Modul, gleiches Muster wie `features/calendar/reminders.test.ts`:

```ts
import { describe, expect, mock, test } from "bun:test";

let calendars: { timeZone: string | null }[] = [{ timeZone: "Europe/Berlin" }];

void mock.module("expo-localization", () => ({ getCalendars: () => calendars }));

// Nach dem Modul-Mock importiert — ein statischer Import würde darüber
// hochgezogen. Gleiches Muster wie in `reminders.test.ts`.
const { deviceTimeZone } = await import("./deviceTimeZone");

describe("deviceTimeZone", () => {
  test("nimmt die Zone von expo-localization", () => {
    calendars = [{ timeZone: "America/New_York" }];
    expect(deviceTimeZone()).toBe("America/New_York");
  });

  test("fällt auf Intl zurück, wenn Expo nichts liefert", () => {
    calendars = [{ timeZone: null }];
    expect(deviceTimeZone()).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  test("fällt auf Europe/Berlin zurück, wenn auch die Liste leer ist", () => {
    calendars = [];
    // Unter Bun liefert `Intl` immer eine Zone; geprüft wird hier nur, dass ein
    // leeres Expo-Ergebnis nicht wirft.
    expect(deviceTimeZone()).toBeTruthy();
  });
});
```

- [ ] **Step 3: `createMutation.ts` erweitern**

`CreateEventVars` bekommt das Feld — direkt nach `allDay`:

```ts
/** IANA-Zone, in der die Wanduhrzeit dieses Termins gilt. Siehe `deviceTimeZone`. */
timezone: string;
```

In `createEvent`, im `insert`-Objekt direkt nach `all_day: vars.allDay,`:

```ts
    timezone: vars.timezone,
```

In `optimisticEventRow`, an derselben Stelle der Feldliste:

```ts
    timezone: vars.timezone,
```

- [ ] **Step 4: Den Aufrufer versorgen**

In `app-sections/event/EventCreateScreen.tsx`, im `vars`-Literal (nach `allDay,`):

```tsx
      timezone: deviceTimeZone(),
```

Import ergänzen — aus dem Kalender-Barrel, wie die übrigen Kalender-Importe dieses Screens: `deviceTimeZone` in die bestehende `@/features/calendar`-Importliste aufnehmen und in `features/calendar/index.ts` exportieren.

- [ ] **Step 5: Die Fixtures der Bestandstests nachziehen**

`createMutation.test.ts` und `eventColumns.test.ts` bauen `CreateEventVars`. Beide brauchen `timezone` in ihrer Fabrik. **`eventColumns.test.ts` ist dabei die eigentliche Prüfung:** Sein Spaltenvergleich schlägt fehl, solange einer der drei Schreiber das Feld nicht setzt — genau dafür wurde er in PR A gebaut.

- [ ] **Step 6: Grün bestätigen**

```bash
bun test features/calendar/
TZ=UTC bun test features/calendar/
```

- [ ] **Step 7: Gates und Commit**

```bash
bun run typecheck && bun lint && bun format:check && bun test
git add features/calendar/deviceTimeZone.ts features/calendar/deviceTimeZone.test.ts features/calendar/createMutation.ts features/calendar/createMutation.test.ts features/calendar/eventColumns.test.ts features/calendar/index.ts app-sections/event/EventCreateScreen.tsx
git commit -m "feat(calendar): neue Termine tragen die Zone des Geraets

CreateEventVars bekommt timezone, gespeist aus expo-localization mit Intl- und
Europe/Berlin-Fallback. createEvent und optimisticEventRow schreiben sie beide —
die Spaltenpruefung aus eventColumns.test.ts erzwingt das."
```

---

## Task 7: ADR-033 und die Doku

**Files:**

- Modify: `docs/decision-log.md`
- Modify: `docs/TODO.md`
- Modify: `docs/roadmap.md`
- Modify: `CLAUDE.md`
- Modify: `docs/architecture.md`

**Warum dieser Task als Gliederung und nicht als fertiger Text vorliegt:** Er ist der einzige, dessen Inhalt von einem Ergebnis abhängt, das beim Planen noch nicht vorlag — dem Ausgang der Hermes-Gegenprobe aus Task 0 und den tatsächlichen Zahlen aus den Tasks 2 bis 5. Ein hier vorformulierter ADR wäre eine Vermutung, die jemand später gegen die Wirklichkeit prüfen müsste. Die Decisions stehen deshalb vollständig als Liste, der Fließtext entsteht beim Schreiben.

- [ ] **Step 1: ADR-033 anhängen**

Ans **Ende** von `docs/decision-log.md` (niemals einen älteren ADR umschreiben). Gliederung des Hauses: `### Status` · `### Context` · `### Decisions` · `### Consequences`; Querverweise auf den vollen, slugifizierten Überschriften-Anker — ADR-032 als unmittelbares Vorbild.

Inhalt, mindestens:

- **Status:** Accepted. Ergänzt ADR-008 (Recurrence-V1) und ADR-032 (Serienanker); löst nichts ab. Zweiter von drei ADRs aus Block 1.
- **Context:** Der gemessene Fehler in beiden Richtungen (Okt 18:00 → 17:00; März 08:00 → 09:00). Und der Grund, warum der naheliegende Fix ausscheidet: `rrule@2.8.1` rechnet in `dateInTimeZone` `targetOffset − localOffset`, `tzid` ist damit nur bei Prozess-Zeitzone UTC korrekt — in einer RN-App also nie. Die Messtabelle aus Spec §1.1 gehört hier hinein.
- **Decisions:**
  1. Die Zone ist eine **Spalte** auf `events`, nicht die Gerätezone — sonst wertete dasselbe Ereignis auf zwei Geräten verschieden aus, und ein serverseitiger Reminder-Worker könnte es gar nicht.
  2. Die Regel wird in **Wandzeit** ausgewertet; das Floating verlässt `rrule.ts` nicht. `tzid` wird nirgends gesetzt.
  3. Die **doppelte Stunde** nimmt den früheren Zeitpunkt, die **Sprung-Lücke** den späteren — und warum `floatingToInstant` dafür zwei Sonden außerhalb des Umstellungsfensters braucht statt eines Zweipasses.
  4. Die **Dauer** eines Vorkommens ist eine Wandzeit-Dauer; das Suchfenster bleibt absolut.
  5. `setRruleUntil` schreibt einen **Tagesende-Instant** in der Zone des Termins.
  6. Die Zone ist im Formular **unsichtbar** und kommt vom Gerät.
- **Consequences:** Erstmalige Laufzeit-Abhängigkeit von `Intl` (mit dem Ergebnis der Gegenprobe aus Task 0); ein Zonen-Picker fehlt; Termine, die vor dieser Migration angelegt wurden, tragen alle `Europe/Berlin`.

- [ ] **Step 2: `docs/TODO.md`**

Den erledigten Eintrag **vollständig entfernen**:

> **Serientermine zeigen nach der Zeitumstellung eine Stunde falsch** …

Und die neuen Grenzen anlegen — je ein Bullet, mit Datei-/Bereichsbezug und Begründung, warum vertagt:

- **Kein Zonen-Picker im Termin-Formular** (`app-sections/event/EventCreateScreen.tsx`, `features/calendar/deviceTimeZone.ts`): Die Zone kommt unsichtbar vom Gerät. Wer einen Termin in einer anderen Zone anlegt (Urlaub, Reise), bekommt die falsche. Braucht ein Feld, einen Copy-Key und eine Anzeige der Zone am Termin — eigenes Feature.
- **Bestandstermine tragen pauschal `Europe/Berlin`** (`supabase/migrations/<ts>_events_timezone.sql`): Der Default backfillt alle vorhandenen Zeilen. Für eine DE-primäre App die einzige nicht geratene Wahl, aber falsch für jeden Termin, der in einer anderen Zone gemeint war. Ohne Zonen-Picker gibt es keinen Weg, das zu korrigieren.
- **`events.timezone` wird nicht validiert** (dieselbe Migration): Der Check ist ein Formregex, keine Prüfung gegen `pg_timezone_names` — die wäre als Subquery in einem `CHECK` nicht erlaubt. Ein Client, der eine formal gültige, real unbekannte Zone schreibt, fällt erst zur Laufzeit auf (`Intl` wirft dann `RangeError`).

- [ ] **Step 3: `docs/roadmap.md`**

Überschrift 1.4 auf `— **erledigt**` setzen und den Rumpf auf den umgesetzten Stand ziehen — dieselbe Behandlung, die 1.1 und 1.2 bekommen haben: was tatsächlich gebaut wurde, mit Verweis auf ADR-033, statt einer Beschreibung im Futur. Insbesondere das Ergebnis der Hermes-Gegenprobe aus Task 0 festhalten.

- [ ] **Step 4: `CLAUDE.md`**

Im Ordnerbaum unter `features/calendar/` die beiden neuen Module ergänzen (`timezone.ts`, `deviceTimeZone.ts`) und den `rrule.ts`-Vertrag benennen. Im Tech-Stack-Absatz zum Kalender einen Satz zum Zonenmodell.

- [ ] **Step 5: `docs/architecture.md`**

Im Kalender-Abschnitt den Datenfluss um die Zone ergänzen: `events.timezone` → `rrule.ts` (floating) → echte Instants → Anzeige in der Zone des Lesers.

- [ ] **Step 6: Gates und Commit**

```bash
bun format:check
git add docs/decision-log.md docs/TODO.md docs/roadmap.md CLAUDE.md docs/architecture.md
git commit -m "docs: ADR-033 zum Zonenmodell, TODO, Roadmap und Handbuch nachziehen"
```

---

## Übergabe an den Menschen

Nicht Teil der Tasks, aber vor dem Merge fällig:

1. `coderabbit review --base main`
2. `git push -u origin fix/calendar-dst-timezone` und PR gegen `main`
3. **Sichtprüfung am Simulator** (Web reicht nicht): eine wöchentliche Serie im Oktober anlegen, die über den 25.10. läuft, und im Kalender prüfen, dass alle Vorkommen dieselbe Uhrzeit zeigen. Gegenprobe im März über den 29.03.
4. Ein zweiter Durchgang mit auf eine andere Zone gestelltem Gerät — der Termin muss dort zur **umgerechneten** Ortszeit erscheinen, nicht zur gespeicherten Wandzeit.
