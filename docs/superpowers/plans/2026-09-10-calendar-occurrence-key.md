# Der Occurrence-Schlüssel und seine Zone — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine per Override auf einen anderen Tag verschobene Occurrence lässt sich ein zweites Mal bearbeiten und löschen, und ihr Versions-Token sieht die Exception, die sie definiert. Und der Schlüssel, der das alles trägt, meint auf jedem Gerät dieselbe Zeile.

**Architecture:** `CalendarOccurrence` trennt zwei Begriffe, die heute einer sind. **`occurrenceKey`** ist das Datum, das die Regel erzeugt hat, gebildet in `row.timezone` — es benennt eine Zeile in `event_exceptions` und gehört damit dem Termin. **`occurrenceDate`** ist das aufgelöste Datum in der Zone des Lesers — es beantwortet, an welchem Tag der Termin im Raster erscheint. Alles, was schreibt oder eine Exception meint, schlüsselt auf den ersten; alles, was zeigt, auf den zweiten. Der Schreibpfad zieht in dieselbe Zone nach.

**Tech Stack:** TypeScript strict, `bun test`, `rrule@2.8.1`, `expo-router` (typed routes), Zustand, TanStack Query.

**Spec:** [docs/superpowers/specs/2026-09-09-calendar-silent-data-loss-design.md](../specs/2026-09-09-calendar-silent-data-loss-design.md) — §6.1, §6.7, §6.8. **PR D1 von zwei;** D2 (Kandidatenmenge, §6.2/§6.3) bekommt einen eigenen Plan, wenn der Schlüssel steht.

## Global Constraints

- **Handoff-Bundle ist gesperrt** (CLAUDE.md Non-Negotiable 1): `design-system/{colors,typography,spacing,themes,components,index}.ts`, `docs/{HANDOFF,COPY,ICONS,README}.md`, `patterns/*.md`.
- **Keine neuen Copy-Keys.** Dieser PR ändert Schlüssel und Zonen, keine Beschriftungen.
- **`occurrenceKey` in `row.timezone`, `occurrenceDate` in der Zone des Lesers.** Das ist die eine Regel, aus der alles Übrige folgt. Wer beim Umbau unsicher ist, welches Feld gemeint ist, stellt sich die Frage: _Meint diese Stelle eine Zeile in `event_exceptions` — oder einen Tag im Raster?_
- **Docstrings** (CLAUDE.md): das Nicht-Offensichtliche — Warum, Grenzfall, ADR-Verweis.
- **Commits:** Conventional-Commits-Präfix, scoped, deutsch. **Niemals** ein `Co-Authored-By: Claude`-Trailer. `--no-verify` ist verboten.
- **Vor jedem Commit grün:** `bun run typecheck` · `bun lint` · `bun test` · `bun format:check`.
- **Drei Zonenläufe** je Task mit neuen Tests: `bun test`, `TZ=UTC bun test`, `TZ=America/New_York bun test` — identisch. Bei diesem PR ist das keine Formsache: Die dritte Zone ist der Fall, den er behebt.
- **`docs/TODO.md` im selben Commit pflegen:** erledigte Einträge löschen, neue Grenzen anlegen.
- **Branch:** `fix/calendar-occurrence-key`, von `main`. Die Spec-Erweiterung (§6.7/§6.8) liegt bereits darauf.
- **Push, PR, CodeRabbit-Lauf und Sichtprüfungen** sind Übergabe an den Menschen, nicht Teil der Tasks.

---

## File Structure

| Datei                                             | Verantwortung                                            | Task |
| ------------------------------------------------- | -------------------------------------------------------- | ---- |
| `features/calendar/timezone.ts` + `.test.ts`      | `zonedDateKey` — Datumsschlüssel in einer Zone           | 1    |
| `features/calendar/types.ts`                      | `CalendarOccurrence.occurrenceKey` + `.timezone`         | 2    |
| `features/calendar/expand.ts`                     | bildet beide Schlüssel                                   | 2    |
| `features/calendar/sample.ts`                     | Fixtures setzen die neuen Felder                         | 2    |
| `features/calendar/version.ts`                    | Docstring + Parametername                                | 2    |
| `features/calendar/hooks.ts`                      | `useEvent` findet über den Schlüssel                     | 3    |
| `features/calendar/mutations.ts`                  | `UpdateEventVars`/`DeleteEventVars`                      | 3    |
| `features/calendar/recurrence.ts`                 | Scope-Arithmetik auf dem Schlüssel, `dateOnly` zonenfest | 3    |
| `features/calendar/optimisticEvents.ts`           | Overlay schlüsselt auf `occurrenceKey`                   | 3, 4 |
| `features/calendar/pendingDeletes.ts`             | dito                                                     | 3    |
| `features/calendar/spans.ts`                      | Gruppierungs-Key + `DaySegment`-Docstring                | 3    |
| `app-sections/(tabs)/{kalender,dashboard}/`       | React-Keys, Route-Parameter                              | 3    |
| `app-sections/(tabs)/dashboard/tomorrowPrep.ts`   | Key + durchgereichter Schlüssel                          | 3    |
| `app-sections/event/Event{Detail,Edit}Screen.tsx` | Route-Parameter, Schreibvariablen                        | 3    |
| `features/calendar/createMutation.ts`             | `recurrenceToRrule` in der Zone des Termins              | 4    |
| `docs/decision-log.md` u. a.                      | **ADR-034** + Doku                                       | 5    |

---

## Task 1: `zonedDateKey` — ein Datumsschlüssel in einer Zone

**Files:**

- Modify: `features/calendar/timezone.ts`
- Modify: `features/calendar/timezone.test.ts`

**Interfaces:**

- Consumes: `instantToFloating` (bereits im Modul).
- Produces: `zonedDateKey(instant: Date, timeZone: string): string` — `yyyy-MM-dd` **in dieser Zone**.

**Die Falle, die diese Funktion existieren lässt:** `instantToFloating` gibt ein `Date` zurück, dessen **UTC**-Komponenten die Wandzeit tragen. `format(floating, "yyyy-MM-dd")` aus `date-fns` liest mit **lokalen** Gettern und liefert damit erneut das Datum des Lesers — der Fehler wäre nur eine Ebene tiefer gerutscht. Der Schlüssel muss aus den UTC-Komponenten gelesen werden.

- [ ] **Step 1: Die Tests schreiben**

Ans Ende von `features/calendar/timezone.test.ts`:

```ts
describe("zonedDateKey", () => {
  test("nimmt das Datum der Zone, nicht das des Lesers", () => {
    // 2026-06-02T22:30Z ist in Berlin bereits der 3. Juni (00:30 MESZ),
    // in New York noch der 2. (18:30 EDT).
    const instant = new Date("2026-06-02T22:30:00.000Z");
    expect(zonedDateKey(instant, "Europe/Berlin")).toBe("2026-06-03");
    expect(zonedDateKey(instant, "America/New_York")).toBe("2026-06-02");
    expect(zonedDateKey(instant, "UTC")).toBe("2026-06-02");
  });

  test("die Umstellung verschiebt den Schlüssel nicht", () => {
    // 25.10.2026, 00:30Z — Berlin steht auf 02:30 MESZ, der Tag ist derselbe.
    expect(zonedDateKey(new Date("2026-10-25T00:30:00.000Z"), "Europe/Berlin")).toBe("2026-10-25");
  });

  test("über die Datumsgrenze hinweg", () => {
    const silvester = new Date("2026-12-31T23:00:00.000Z");
    expect(zonedDateKey(silvester, "Europe/Berlin")).toBe("2027-01-01");
    expect(zonedDateKey(silvester, "America/New_York")).toBe("2026-12-31");
  });
});
```

`zonedDateKey` in die bestehende Importzeile der Testdatei aufnehmen.

- [ ] **Step 2: Rot bestätigen**

Run: `bun test features/calendar/timezone.test.ts`
Erwartet: Fehlschlag, `zonedDateKey` existiert nicht.

- [ ] **Step 3: Die Funktion schreiben**

Ans Ende von `features/calendar/timezone.ts`:

```ts
/**
 * Der Kalendertag eines Zeitpunkts **in dieser Zone**, als `yyyy-MM-dd`.
 *
 * Der Schlüssel von `event_exceptions.occurrence_date` — er benennt eine Zeile
 * in der Datenbank und gehört deshalb dem Termin, nicht dem Leser (ADR-034).
 * Für die Anzeige ist er der falsche Wert: dort zählt, an welchem Tag der
 * Termin *für diesen Leser* im Raster erscheint.
 *
 * Gelesen wird aus den **UTC**-Komponenten des floating `Date`. `date-fns`
 * `format` läse hier mit lokalen Gettern und lieferte erneut das Datum des
 * Lesers — der Fehler wäre nur eine Ebene tiefer gerutscht.
 */
export function zonedDateKey(instant: Date, timeZone: string): string {
  return instantToFloating(instant, timeZone).toISOString().slice(0, 10);
}
```

- [ ] **Step 4: Grün bestätigen, drei Zonen**

```bash
bun test features/calendar/timezone.test.ts
TZ=UTC bun test features/calendar/timezone.test.ts
TZ=America/New_York bun test features/calendar/timezone.test.ts
```

Alle drei identisch. In den Report.

- [ ] **Step 5: Gates und Commit**

```bash
bun run typecheck && bun lint && bun format:check && bun test
git add features/calendar/timezone.ts features/calendar/timezone.test.ts
git commit -m "feat(calendar): Datumsschluessel in der Zone eines Termins

zonedDateKey liest aus den UTC-Komponenten des floating Date. date-fns format
laese dort mit lokalen Gettern und lieferte erneut das Datum des Lesers."
```

---

## Task 2: `occurrenceKey` entsteht

**Files:**

- Modify: `features/calendar/types.ts` · `features/calendar/expand.ts` · `features/calendar/sample.ts` · `features/calendar/version.ts`
- Modify: `features/calendar/expand.test.ts` · `features/calendar/version.test.ts`

**Interfaces:**

- Consumes: `zonedDateKey` aus Task 1.
- Produces: `CalendarOccurrence.occurrenceKey: string` und `CalendarOccurrence.timezone: string`. Ab Task 3 lesen alle Schreibpfade den ersten; den zweiten braucht das Overlay in Task 5, weil es sonst keine Zone kennt.

- [ ] **Step 1: Die Tests schreiben**

Ans Ende von `features/calendar/expand.test.ts`:

```ts
describe("occurrenceKey", () => {
  test("ohne Override sind Schlüssel und Anzeigedatum gleich", () => {
    const out = expandEvents([makeRow()], WINDOW_START, WINDOW_END, lightTheme);
    expect(out[0].occurrenceKey).toBe(out[0].occurrenceDate);
  });

  test("der Schlüssel folgt der Zone des Termins, das Anzeigedatum der des Lesers", () => {
    // Täglicher Berliner Termin um 00:30 Ortszeit. Unter einer westlichen
    // Runner-Zone liegt derselbe Zeitpunkt noch am Vortag.
    const row = makeRow({
      start_at: "2026-06-01T22:30:00.000Z",
      end_at: "2026-06-01T23:00:00.000Z",
      rrule_freq: "daily",
      timezone: "Europe/Berlin",
    });
    const out = expandEvents(
      [row],
      new Date("2026-06-01T00:00:00.000Z"),
      new Date("2026-06-05T00:00:00.000Z"),
      lightTheme,
    );
    // Der Schlüssel ist unabhängig von der Runner-Zone.
    expect(out.map((o) => o.occurrenceKey)).toEqual([
      "2026-06-02",
      "2026-06-03",
      "2026-06-04",
      "2026-06-05",
    ]);
    // Und er trägt die Zone des Termins mit.
    expect(out[0].timezone).toBe("Europe/Berlin");
  });

  test("ein Override auf einen anderen Tag trennt die beiden", () => {
    const row = makeRow({
      start_at: "2026-06-01T09:00:00.000Z",
      end_at: "2026-06-01T10:00:00.000Z",
      rrule_freq: "weekly",
      timezone: "Europe/Berlin",
    });
    row.event_exceptions = [
      {
        id: "ex-1",
        event_id: row.id,
        occurrence_date: "2026-06-15",
        action: "modified",
        override: {
          start_at: "2026-06-18T09:00:00.000Z",
          end_at: "2026-06-18T10:00:00.000Z",
        } as never,
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-02T00:00:00.000Z",
      },
    ];
    const out = expandEvents(
      [row],
      new Date("2026-06-14T00:00:00.000Z"),
      new Date("2026-06-20T00:00:00.000Z"),
      lightTheme,
    );
    const moved = out.find((o) => o.occurrenceKey === "2026-06-15");
    expect(moved?.occurrenceDate).toBe("2026-06-18");
  });
});
```

In `features/calendar/version.test.ts` zusätzlich ein Test, der die eigentliche Wirkung festhält:

```ts
test("das Token einer verschobenen Occurrence sieht ihre Exception", () => {
  // Vor ADR-034 schlüsselte `occurrenceVersion` auf das aufgelöste Datum und
  // fand die Exception am Regel-Datum nicht — eine fremde Änderung daran blieb
  // beim Vergleich unsichtbar.
  const rows = row([exception("2026-06-15", "2026-06-02T09:00:00.000Z")]);
  expect(occurrenceVersion(rows, "2026-06-15")).toBe(
    "2026-06-01T10:00:00.000Z|2026-06-02T09:00:00.000Z",
  );
});
```

- [ ] **Step 2: Rot bestätigen**

Run: `bun test features/calendar/`
Erwartet: die neuen Tests failen (`occurrenceKey` existiert nicht). Die Fehlerliste in den Report.

- [ ] **Step 3: `types.ts` erweitern**

In `CalendarOccurrence`, direkt vor `occurrenceDate`:

```ts
/**
 * Das Datum, das die **Regel** erzeugt hat, gebildet in `timezone` — der
 * Schlüssel von `event_exceptions.occurrence_date`.
 *
 * Ohne Override gleich `occurrenceDate`; das ist der Normalfall. Verschiebt
 * eine Exception die Occurrence auf einen anderen Tag, fallen beide
 * auseinander, und **dieser** Wert benennt weiterhin die Zeile, die den
 * Inhalt bestimmt. Alles, was schreibt oder eine Exception meint, schlüsselt
 * hierauf (ADR-034).
 */
occurrenceKey: string;
/**
 * Das **aufgelöste** Datum, in der Zone des Lesers — an welchem Tag dieser
 * Termin für ihn im Raster erscheint. Für Anzeige und Rasterplatzierung, nie
 * als Schlüssel.
 */
occurrenceDate: string;
/** Die Zone, in der die Wanduhrzeit dieses Termins gilt (`events.timezone`). */
timezone: string;
```

- [ ] **Step 4: `expand.ts` beide Schlüssel bilden lassen**

Der Exception-Lookup benutzt heute `format(occurrenceStart, "yyyy-MM-dd")`. Das ist bereits der Regel-Datums-Schlüssel — nur in der falschen Zone. Ersetze ihn:

```ts
// Der Schlüssel der Exception-Zeile: das Regel-Datum in der Zone des
// Termins. `format` läse hier in der Zone des Lesers und griffe auf einem
// Gerät westlich des Termins einen Tag daneben (ADR-034).
const occurrenceKey = zonedDateKey(occurrenceStart, row.timezone);
const ex = exceptions.get(occurrenceKey);
```

Und unten, bei der Bildung des Anzeigedatums, den Kommentar richtigstellen und beide Werte mitgeben:

```ts
      // Das Anzeigedatum folgt dem aufgelösten Start und der Zone des Lesers:
      // es beantwortet, an welchem Tag der Termin hier im Raster erscheint.
      // Der Schlüssel oben tut das ausdrücklich nicht.
      const occurrenceDate = format(resolved.startAt, "yyyy-MM-dd");

      out.push({
        eventId: row.id,
        occurrenceKey,
        occurrenceDate,
        timezone: row.timezone,
        …
        version: occurrenceVersion(row, occurrenceKey),
```

Import ergänzen: `zonedDateKey` aus `./timezone`.

- [ ] **Step 5: `sample.ts` und `version.ts`**

`sample.ts` baut `CalendarOccurrence`-Fixtures und braucht die zwei neuen Felder. Setze `occurrenceKey` auf denselben Wert wie `occurrenceDate` (die Fixtures haben keine Overrides) und `timezone` auf `"Europe/Berlin"`.

`version.ts`: Der Docstring erklärt heute ausdrücklich, der Schlüssel sei „das **aufgelöste** Datum", und verweist auf `docs/TODO.md` als offene Grenze. Beides ist mit diesem Task erledigt. Schreib den Absatz um — er soll sagen, dass auf das Regel-Datum geschlüsselt wird, dass das dieselbe Zeile trifft, die `modifyOccurrence` schreibt, und auf ADR-034 verweisen. Benenne den Parameter zu `occurrenceKey` um.

- [ ] **Step 6: Grün bestätigen, drei Zonen**

```bash
bun test features/calendar/
TZ=UTC bun test features/calendar/
TZ=America/New_York bun test features/calendar/
```

**Erwartung: noch nicht alles grün.** Andere Suiten werden rot, weil sie `CalendarOccurrence`-Objekte ohne die neuen Felder bauen — das ist der Typecheck, der seine Arbeit tut. Ergänze die Felder in den betroffenen **Fabriken**, nicht in einzelnen Erwartungen. Schreib die Liste der betroffenen Dateien in den Report.

- [ ] **Step 7: Gates und Commit**

```bash
bun run typecheck && bun lint && bun format:check && bun test
git add features/calendar/types.ts features/calendar/expand.ts features/calendar/sample.ts features/calendar/version.ts features/calendar/expand.test.ts features/calendar/version.test.ts
git commit -m "feat(calendar): occurrenceKey trennt Regel-Datum von Anzeigedatum

Der Schluessel benennt eine Zeile in event_exceptions und entsteht deshalb in
der Zone des Termins; das Anzeigedatum bleibt in der Zone des Lesers. Ohne
Override sind beide gleich — das ist der Normalfall."
```

---

## Task 3: Feature-Schicht **und** Oberfläche schlüsseln um

> **Korrektur vom 2026-09-14.** Dieser Task war ursprünglich in zwei geteilt — erst die Feature-Schicht, dann die Oberfläche. Das geht nicht: Die Umbenennung von `UpdateEventVars.occurrenceDate` zu `occurrenceKey` ist eine **Interface-Änderung**, die beide Seiten zugleich erzwingt. Ein erster Lauf endete folgerichtig mit grünen Tests und vier `tsc`-Fehlern in `EventEditScreen.tsx` — ein Zustand, den die Gate-Regel nicht committen lässt. Die Arbeit wurde verworfen und die beiden Tasks zusammengelegt. Der Commit wird dadurch größer; das ist der Preis dafür, dass er überhaupt grün sein kann.

**Files:** `features/calendar/{hooks,mutations,recurrence,optimisticEvents,pendingDeletes,spans}.ts` und ihre Testdateien · `app-sections/(tabs)/kalender/KalenderScreen.tsx` · `app-sections/(tabs)/dashboard/DashboardScreen.tsx` · `app-sections/(tabs)/dashboard/tomorrowPrep.ts` (+ Test) · `app-sections/event/EventDetailScreen.tsx` · `app-sections/event/EventEditScreen.tsx`

**Interfaces:**

- Consumes: `CalendarOccurrence.occurrenceKey` aus Task 2, `zonedDateKey` aus Task 1.
- Produces: `UpdateEventVars.occurrenceKey` und `DeleteEventVars.occurrenceKey` (umbenannt von `occurrenceDate`); `ApplyEditScopeArgs.occurrenceKey`, `ApplyDeleteScopeArgs.occurrenceKey`; der Route-Parameter `occ` trägt ab hier den **Schlüssel**.

**Die Umbenennung ist nicht mechanisch — für jede Stelle gilt die Frage aus den Global Constraints.** Diese Tabelle beantwortet sie vorab:

| Stelle                                                 | wird            | Grund                                            |
| ------------------------------------------------------ | --------------- | ------------------------------------------------ |
| `hooks.ts` → `useEvent`s `find`                        | `occurrenceKey` | der Route-Parameter benennt eine Exception-Zeile |
| `mutations.ts` → beide Vars, beide `occurrenceVersion` | `occurrenceKey` | Schreibpfad                                      |
| `recurrence.ts` → beide `apply*Scope`-Args             | `occurrenceKey` | Schreibpfad                                      |
| `recurrence.ts` → `consumedBefore`, `dayBefore`        | `occurrenceKey` | vergleicht Regel-Daten miteinander               |
| `optimisticEvents.ts` → `matchesScope`, `canApply…`    | `occurrenceKey` | identifiziert die betroffene Occurrence          |
| `pendingDeletes.ts` → Eintrag und Vergleich            | `occurrenceKey` | dito                                             |
| `spans.ts` → `groupSpans`-Key                          | `occurrenceKey` | **Identität**, siehe unten                       |
| `spans.ts` → `DaySegment.date`                         | **bleibt**      | der Tag, den das Segment malt                    |
| `undoDeleteMessage.ts` → `formatDate(occurrenceDate)`  | **bleibt**      | zeigt dem Nutzer ein Datum an                    |
| React-Keys in beiden Tab-Screens                       | `occurrenceKey` | **Identität**, siehe unten                       |
| Route-Parameter `occ` beim Navigieren (3 Screens)      | `occurrenceKey` | benennt die Exception-Zeile                      |
| `tomorrowPrep.ts` → `key` und durchgereichtes Feld     | `occurrenceKey` | dito                                             |
| `EventDetailScreen` → Schreib- und Konfliktpfad        | `occurrenceKey` | Schreibpfad                                      |
| `EventEditScreen` → `initial`, `vars`, `find`, Version | `occurrenceKey` | Schreibpfad                                      |
| `EventDetailScreen` → `formatDate(…)` im Undo-Text     | **bleibt**      | zeigt dem Nutzer ein Datum an                    |
| `EventEditScreen` → `parseISO(…)` als Fensterrand      | **bleibt**      | grenzt ein Fenster ab, benennt keine Zeile       |

**Warum `groupSpans` die Identität braucht:** Ein Override kann eine Occurrence auf einen Tag schieben, an dem die Serie **ohnehin stattfindet** — die verschobene 15.06. landet auf dem 18.06., wo das reguläre Vorkommen schon liegt. Beide trügen dann dasselbe `occurrenceDate`, der Gruppierungs-Key kollidierte, und eine der beiden verschwände aus der Liste. Der Kommentar dort nennt diese Klasse bereits („Two occurrences of the same series can share a day…") und verlässt sich für die Eindeutigkeit auf `occurrenceDate` — was nach diesem PR nicht mehr trägt.

- [ ] **Step 1: Den Kollisionstest zuerst**

In `features/calendar/spans.test.ts`: zwei Occurrences derselben Serie mit **gleichem** `occurrenceDate` und **verschiedenem** `occurrenceKey` durch `toDaySegments` schicken und festhalten, dass **beide** überleben. Bau die Fixture so, dass der Test mit dem heutigen `occurrenceDate`-Key rot ist, und halte das Rot fest.

- [ ] **Step 2: `dateOnly` in `recurrence.ts` zonenfest machen**

`consumedBefore` vergleicht `dateOnly(d) < occurrenceKey`, und `dateOnly` liest lokal. Sobald der Schlüssel in der Zone des Termins entsteht, vergleicht diese Zeile zwei verschiedene Datumsräume. Ersetze `dateOnly(d)` durch `zonedDateKey(d, master.timezone)` — an **beiden** Stellen, also auch beim `cutoff < dateOnly(new Date(master.start_at))`-Vergleich. Der Docstring von `consumedBefore` sagt heute ausdrücklich, verglichen werde „als local `yyyy-MM-dd`, weil `expand.ts` den Schlüssel so bildet" — das wird unrichtig und muss mit.

- [ ] **Step 3: Die sechs Feature-Module umschlüsseln**

Nach der Tabelle oben. `applyOptimisticChanges` verdient dabei besondere Aufmerksamkeit: Es schreibt heute `occurrenceDate: format(startAt, "yyyy-MM-dd")` neu — das bleibt richtig (eine optimistisch verschobene Occurrence wandert im Raster). Der **`occurrenceKey` darf dabei nicht neu berechnet werden**; er kommt über den Spread und bleibt, was er war: dieselbe Exception-Zeile. Ein Kommentar soll das festhalten.

- [ ] **Step 4: Grün bestätigen, drei Zonen**

```bash
bun test features/calendar/
TZ=UTC bun test features/calendar/
TZ=America/New_York bun test features/calendar/
```

Bestandstests, die rot werden, **einzeln beurteilen**: Eine Fixture, die nur ein Feld ergänzen muss, ist Nacharbeit; eine Erwartung, die sich inhaltlich ändert, ist ein Befund und gehört in den Report.

- [ ] **Step 5: Die Oberfläche nachziehen**

Nach den UI-Zeilen der Tabelle oben. **Zum Route-Parameter:** Ein Deep-Link aus der Zeit vor diesem PR trägt ein aufgelöstes Datum. `useEvent` findet dann nichts und fällt auf `expanded[0]` zurück — dasselbe Verhalten wie heute bei einem unbekannten `occ`. Kein Datenverlust, aber der Nutzer landet auf einer anderen Occurrence. Halte das als Kommentar am Fallback fest; der TODO-Eintrag dazu kommt in Task 5.

- [ ] **Step 6: Prüfen, dass im Schreibpfad kein `occurrenceDate` übrig ist**

```bash
grep -rn "occurrenceDate" --include="*.tsx" --include="*.ts" app-sections | grep -v "\.test\."
```

Jede verbleibende Stelle muss sich mit „zeigt einem Menschen ein Datum" oder „grenzt ein Fenster ab" begründen lassen. Liste samt Begründung in den Report.

- [ ] **Step 7: Gates und Commit**

```bash
bun run typecheck && bun lint && bun format:check && bun test
git add features/calendar app-sections
git commit -m "refactor(calendar): Schreibpfad und Identitaet schluesseln auf occurrenceKey

Alles, was eine Zeile in event_exceptions meint, benutzt jetzt das Regel-Datum;
das aufgeloeste Datum bleibt der Anzeige. Damit trifft ein zweites Bearbeiten
oder Loeschen einer verschobenen Occurrence wieder ihre eigene Exception."
```

## Task 4: Der Schreibpfad rechnet in der Zone des Termins

**Files:** `features/calendar/recurrence.ts` (`anchoredChanges`) · `features/calendar/optimisticEvents.ts` (`withTimeOfDay`) · `features/calendar/createMutation.ts` (`recurrenceToRrule`) und die zugehörigen Testdateien.

**Interfaces:**

- Consumes: `CalendarOccurrence.timezone` aus Task 2, `EventRow.timezone`.
- Produces: `recurrenceToRrule(opt, startAt, timeZone)` — dritter Parameter.

**Der Fall, gemessen und in `docs/TODO.md` benannt:** Ein reines Öffnen-und-Speichern mit Scope „alle" von einem Gerät, dessen Zone von `events.timezone` abweicht, verschiebt die ganze Serie um eine Stunde. Drei Stellen nehmen Wanduhrkomponenten in der Zone des Lesers:

- `anchoredChanges` — `start.setHours(newStart.getHours(), …)`
- `withTimeOfDay` — dasselbe Muster im Overlay
- `recurrenceToRrule` — `startAt.getDay()` bestimmt `rrule_byweekday`, ausgewertet wird die Regel aber in `row.timezone`

**Die Bindung, die das bisher blockiert hat, ist mit Task 3 gelöst:** Der TODO-Eintrag begründet, `consumedBefore` und der Startdatums-Vergleich arbeiteten bewusst im selben Geräte-Datumsraum wie `occurrenceDate`. Seit Task 3 liegen sie im Raum des Termins — alle drei können nachziehen, ohne dass etwas auseinanderfällt.

- [ ] **Step 1: Die Tests zuerst**

Für jede der drei Stellen ein Test, der unter einer **anderen** Runner-Zone als der Terminzone läuft und die Wandzeit in der Terminzone prüft. Konkret mindestens:

1. `applyEditScope` mit Scope „alle", unveränderter Eingabe, Master `2026-10-06 18:00 Europe/Berlin`: `updateMaster` bekommt ein `start_at`, das in Berlin weiterhin 18:00 ist — unter **jeder** Runner-Zone.
2. `applyOptimisticChanges` für dieselbe Konstellation: die Occurrence behält ihre Berliner Wandzeit.
3. `recurrenceToRrule("weekly", startAt, "Europe/Berlin")` für einen Zeitpunkt, der in Berlin auf einen anderen Wochentag fällt als in der Runner-Zone (z. B. Sonntag 23:30 Berlin = Sonntag 17:30 New York, aber Montag 00:30 Berlin = Sonntag 18:30 New York): das `rrule_byweekday` folgt Berlin.

Alle drei müssen **vor** dem Fix unter `TZ=America/New_York` rot sein und unter `TZ=Europe/Berlin` grün — genau diese Asymmetrie ist der Fehler. Halte beides fest.

- [ ] **Step 2: Die drei Stellen umstellen**

Das Muster ist dreimal dasselbe: in den Floating-Raum der **Terminzone** gehen, dort die Komponenten mischen, zurückrechnen.

`withTimeOfDay` in `optimisticEvents.ts`:

```ts
/**
 * Nimmt das Datum von `day` und die Uhrzeit von `time` — beides als Wandzeit in
 * `timeZone` gelesen, nicht in der Zone des Lesers. Sonst verschöbe ein
 * Speichern von einem Gerät in einer anderen Zone die ganze Serie (ADR-034).
 */
function withTimeOfDay(day: Date, time: Date, timeZone: string): Date {
  const floatingDay = instantToFloating(day, timeZone);
  const floatingTime = instantToFloating(time, timeZone);
  const merged = new Date(floatingDay);
  merged.setUTCHours(
    floatingTime.getUTCHours(),
    floatingTime.getUTCMinutes(),
    floatingTime.getUTCSeconds(),
    floatingTime.getUTCMilliseconds(),
  );
  return floatingToInstant(merged, timeZone);
}
```

`anchoredChanges` in `recurrence.ts` — dieselbe Rechnung, nur inline und mit `master.timezone`:

```ts
const newStart = new Date(changes.start_at);
const floatingMaster = instantToFloating(new Date(master.start_at), master.timezone);
const floatingNew = instantToFloating(newStart, master.timezone);
const merged = new Date(floatingMaster);
merged.setUTCHours(
  floatingNew.getUTCHours(),
  floatingNew.getUTCMinutes(),
  floatingNew.getUTCSeconds(),
  floatingNew.getUTCMilliseconds(),
);
const start = floatingToInstant(merged, master.timezone);
const durationMs = new Date(changes.end_at).getTime() - newStart.getTime();
```

`recurrenceToRrule` in `createMutation.ts` bekommt die Zone als dritten Parameter; der Wochentag kommt aus dem floating `Date`:

```ts
export function recurrenceToRrule(
  opt: RecurrenceOption,
  startAt: Date,
  timeZone: string,
): RruleFields {
  …
    case "weekly": {
      // Der Wochentag gilt in der Zone des Termins — dort wird die Regel auch
      // ausgewertet. `startAt.getDay()` läse ihn in der Zone des Lesers und
      // träfe für einen Termin nahe Mitternacht den falschen Tag (ADR-034).
      // `getUTCDay()` auf dem floating `Date` ist der Wochentag der Wandzeit.
      const isoWeekday = ((instantToFloating(startAt, timeZone).getUTCDay() + 6) % 7) + 1;
      return { rrule_freq: "weekly", rrule_interval: 1, rrule_byweekday: [isoWeekday] };
    }
```

Die Aufrufer versorgen die Zone: `anchoredChanges` aus `master.timezone`, `withTimeOfDay` aus `occurrence.timezone`, `recurrenceToRrule` aus `vars.timezone` beim Anlegen und aus der Zone des bearbeiteten Termins im Bearbeiten-Formular.

Die Docstrings von `anchoredChanges` und `canApplyOptimistically` tragen beide einen Absatz über die Gerätezone, der damit unrichtig wird. Beide mitziehen.

- [ ] **Step 3: Grün bestätigen, drei Zonen** — und dieses Mal ist die dritte der eigentliche Beleg.

- [ ] **Step 4: Gates und Commit**

```bash
bun run typecheck && bun lint && bun format:check && bun test
git add features/calendar app-sections
git commit -m "fix(calendar): Schreibpfad rechnet in der Zone des Termins

anchoredChanges, withTimeOfDay und recurrenceToRrule nahmen Wanduhrkomponenten
in der Zone des Lesers. Ein Oeffnen-und-Speichern von einem Geraet in einer
anderen Zone verschob damit die ganze Serie um eine Stunde."
```

---

## Task 5: ADR-034 und die Doku

**Files:** `docs/decision-log.md` · `docs/TODO.md` · `docs/roadmap.md` · `CLAUDE.md` · `docs/architecture.md`

**Wie bei ADR-033 liegt hier eine Gliederung, kein fertiger Text** — der Inhalt hängt an dem, was die Tasks 1 bis 5 tatsächlich ergeben haben, insbesondere an den Testzahlen und an den beim Umbau aufgefallenen Grenzen.

- [ ] **Step 1: ADR-034 anhängen** — ans Ende von `docs/decision-log.md`, Gliederung des Hauses (`### Status` · `### Context` · `### Decisions` · `### Consequences`), ADR-033 als Vorbild, Querverweise auf den vollen slugifizierten Anker. Prüf, dass 034 die nächste freie Nummer ist, und schreib **keinen** älteren ADR um.

Decisions, mindestens:

1. `occurrenceKey` (Regel-Datum) und `occurrenceDate` (aufgelöstes Datum) sind zwei Felder. Alles, was eine `event_exceptions`-Zeile meint, schlüsselt auf den ersten.
2. Der Schlüssel entsteht in `row.timezone`, das Anzeigedatum in der Zone des Lesers — mit dem gemessenen Beispiel des Berliner 00:30-Termins.
3. Identität ist der Schlüssel, nicht das Anzeigedatum: Gruppierung und React-Keys, weil ein Override auf einen Tag mit regulärem Vorkommen fallen kann.
4. Der Route-Parameter `occ` trägt den Schlüssel; alte Deep-Links fallen auf die erste Occurrence zurück.
5. Der Schreibpfad rechnet in der Zone des Termins — und warum die Bindung an den Geräte-Datumsraum mit Decision 2 entfällt.

- [ ] **Step 2: `docs/TODO.md`** — die erledigten Einträge **löschen**: „Eine auf einen anderen Tag verschobene Occurrence fällt aus dem Versions-Schlüssel" (Conflict-Detection-Sektion) und „Der Schreibpfad rechnet mit der Gerätezone des Bearbeitenden". Neue Grenzen anlegen: der Deep-Link-Fallback aus Task 4, und — falls beim Umbau aufgefallen — was sonst offen bleibt.

- [ ] **Step 3: `docs/roadmap.md`** — 1.3 **nicht** auf „erledigt" setzen: D2 (Kandidatenmenge) fehlt noch. Stattdessen den Abschnitt teilen, sichtbar machen, welche Hälfte steht, und auf ADR-034 verweisen.

- [ ] **Step 4: `CLAUDE.md` und `docs/architecture.md`** — den Kalender-Abschnitt um die beiden Datumsbegriffe ergänzen. `architecture.md` trägt seit ADR-033 einen Satz, dass `occurrenceDate` als Persistenz-Schlüssel dieselbe Zonenabhängigkeit hat; der wird mit diesem PR unrichtig und muss auf den neuen Stand.

- [ ] **Step 5: Gates und Commit**

```bash
bun format:check
git add docs CLAUDE.md
git commit -m "docs: ADR-034 zum Occurrence-Schluessel, TODO, Roadmap und Handbuch nachziehen"
```

---

## Übergabe an den Menschen

1. `coderabbit review --base main`
2. Push und PR gegen `main`
3. **Sichtprüfung am Simulator** (Web reicht nicht): eine wöchentliche Serie anlegen, eine Occurrence mit Scope „Nur diesen" auf einen anderen Tag verschieben, sie dort **erneut** öffnen und umbenennen — die Umbenennung muss greifen. Danach dieselbe Occurrence löschen; sie muss verschwinden und wegbleiben.
4. Ein zweiter Durchgang mit auf eine andere Zone gestelltem Gerät: dieselbe Serie bearbeiten und speichern, ohne etwas zu ändern — die Uhrzeit darf sich nicht verschieben.
