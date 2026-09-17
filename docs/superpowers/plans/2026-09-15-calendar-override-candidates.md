# D2 — Kandidatenmenge und Override-Vertrag: Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine per Override auf einen anderen Tag verschobene Occurrence ist an ihrem neuen Datum sichtbar, über ihren eigenen Link erreichbar, und ihre geänderte Beschreibung kommt an.

**Architecture:** `expandEvents` erzeugt Kandidaten künftig aus zwei Quellen statt einer: den Regel-Vorkommen aus `rule.between(...)` **und** den `modified`-Exceptions, deren Override-Intervall das Fenster schneidet, deren `occurrence_date` aber außerhalb der Regel-Menge liegt. Der Override-Vertrag selbst zieht in ein eigenes Modul (`override.ts`), weil er ab jetzt zwei Leser hat — die Auflösung in `expand.ts` und die Fensterweitung in `eventWindow.ts`. Die Tagesgrenzen-Rechnung, die dabei zum dritten Mal auftaucht, zieht als `zonedDayBounds` nach `timezone.ts`.

**Tech Stack:** TypeScript ~6.0 (strict), Bun 1.3.14 als Test-Runner (`bun:test`), `rrule@2.8.1` (ausschließlich über `features/calendar/rrule.ts`), `date-fns`, Supabase-generierte Typen aus `features/supabase/database.types.ts`.

**Spec:** [docs/superpowers/specs/2026-09-09-calendar-silent-data-loss-design.md](../specs/2026-09-09-calendar-silent-data-loss-design.md) — maßgeblich sind §6.2 (Kandidatenmenge), §6.3 (`description`), §6.5 (Tests), §6.6 (keine Datenmigration), §6.8 (D1/D2-Schnitt) und §6.9 (die drei am 2026-09-15 nachgemessenen Zusätze).

## Global Constraints

- **Jeder Fix bekommt einen Regressionstest, der vor dem Fix rot ist — vorgeführt, nicht behauptet.** Wo ein Test bewusst nur eine Grenze absichert und schon vor dem Fix grün ist, steht das ausdrücklich am Test und im Report. Ein als „rot" ausgegebener Test, der nie rot war, ist ein Task-Fehlschlag.
- **Alle Suiten laufen unter drei Runner-Zonen mit identischem Ergebnis:** `TZ=Europe/Berlin bun test`, `TZ=UTC bun test`, `TZ=America/New_York bun test`. Eine Abweichung zwischen den drei ist der Fehler, nicht ein einzelner falscher Wert (ADR-034 Consequences).
- **Grün vor dem Commit:** `bun run typecheck`, `bun lint`, `bun test`, `bun format:check`.
- **Jede neue oder umgeschriebene exportierte Funktion, Komponente und jedes neue Modul bekommt einen JSDoc-Block im selben Commit** (CLAUDE.md → Documentation discipline → Docstrings). Inhalt ist das Nicht-Offensichtliche: warum es so gebaut ist, welcher Grenzfall die Form bestimmt hat, welcher ADR dahintersteht. Ausgenommen sind lokale Helfer, die die Datei nicht verlassen — insbesondere die `makeRow()`/`ex()`-Fabriken in Testdateien.
- **Das Handoff-Bundle ist off-limits:** `design-system/{colors,typography,spacing,themes,components,index}.ts`, `docs/{HANDOFF,COPY,ICONS,README}.md`, `patterns/*.md`. D2 braucht keine davon.
- **Kein neuer UI-String.** D2 ändert keine sichtbare Copy; sollte doch einer nötig erscheinen, ist das ein Plan-Fehler und gehört gemeldet, nicht selbst erfunden (i18n-Keys stehen in `docs/COPY.md`, das off-limits ist).
- **`docs/TODO.md` im selben Commit pflegen:** erledigte Einträge **löschen** (nicht abhaken), neu entstandene Grenzen anlegen.
- **Commits:** Conventional-Commits-Prefix, scoped (`fix(calendar): …`, `docs(calendar): …`). **Niemals** einen `Co-Authored-By: Claude …`-Trailer. Pre-commit-Hooks (`lint-staged`) niemals mit `--no-verify` umgehen.
- **`rrule` wird nirgends direkt importiert** außer in `features/calendar/rrule.ts`. Wer Vorkommen braucht, ruft `occurrencesBetween(row, from, to)` oder `allOccurrences(row)` — beide liefern echte Instants (ADR-033).
- **`tzid` wird nicht gesetzt.** `rrule@2.8.1` rechnet `targetOffset − localOffset` und ist nur bei Prozess-Zeitzone UTC korrekt; in einer RN-App also nie.

## Ausgangslage: die vier Befunde, alle am 2026-09-15 nachgemessen

Gemessen an einer wöchentlichen Montagsserie ab `2026-06-01T07:00:00.000Z` (09:00 Berlin, 1 h), mit einer `modified`-Exception am Regel-Datum `2026-06-29`, per Override auf `2026-07-20T07:00:00.000Z` verschoben:

```text
Juli-Fenster (01.–31.07.)  keys: 2026-07-06, 2026-07-13, 2026-07-20, 2026-07-27
                                 ← die verschobene Occurrence (key 2026-06-29) FEHLT
Juni-Fenster (01.–30.06.)  keys: 2026-06-01, 2026-06-08, 2026-06-15, 2026-06-22
                                 ← sie fehlt hier ebenfalls: an beiden Daten unsichtbar
Juni+Juli-Fenster          moved: 2026-07-20  title=Verschoben  desc=Master-Notiz
                                 ← der Titel kommt aus dem Override, die Beschreibung NICHT
kaputtes override.start_at       WIRFT: "Invalid time value"
                                 ← der gesamte Kalenderbereich bleibt leer, nicht nur der Termin
eventLookupWindow(2027-10-18)    Fenster endet 2027-10-18T21:59:59.999Z
  bei Override auf 2027-10-25    Treffer FEHLT → Fallback zeigt 2026-06-01
                                 ← ein anderer Termin, ohne jede Meldung
```

Der Juli-Fall trägt nebenbei den Kollisionsfall aus Spec §6.5 Nr. 7 in einer einzigen Fixture: Die verschobene Occurrence landet auf dem 20.07., an dem die Serie **ohnehin** ein reguläres Vorkommen hat.

## File Structure

| Datei                                                  | Verantwortung                                                                                                                                                     | Task    |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `features/calendar/timezone.ts`                        | **+ `zonedDayBounds`** — Tagesanfang/-ende eines `yyyy-MM-dd`-Schlüssels als Instants in einer Zone. Die Umkehrung von `zonedDateKey`.                            | 1       |
| `features/calendar/eventWindow.ts`                     | Liest die Tagesgrenzen künftig aus `zonedDayBounds` (T1) und deckt zusätzlich das vom Override beanspruchte Intervall ab (T4).                                    | 1, 4    |
| `features/calendar/recurrence.ts`                      | `endOfDayInstant` liest aus `zonedDayBounds` statt selbst zu rechnen. Sonst unverändert.                                                                          | 1       |
| `features/calendar/override.ts`                        | **neu** — der Vertrag von `event_exceptions.override`: `isJsonObject`, `overrideDate`, `overrideInterval`. Ein Modul, weil der Vertrag ab D2 zwei Leser hat.      | 2       |
| `features/calendar/expand.ts`                          | `Resolved` führt `description`; `applyOverride` liest es und verwirft unparsbare Datumswerte; `expandEvents` mischt Exception-Kandidaten in die Occurrence-Menge. | 2, 3    |
| `features/calendar/optimisticEvents.ts`                | `applyOptimisticChanges` verschluckt `description` nicht mehr.                                                                                                    | 2       |
| `features/calendar/hooks.ts`                           | `useEvent` ruft `eventLookupWindow(row, occurrenceKey)` mit der Zeile statt mit drei Einzelwerten.                                                                | 4       |
| `app-sections/event/EventEditScreen.tsx`               | Derselbe Aufruf im Konflikt-Dialog.                                                                                                                               | 4       |
| `features/calendar/index.ts`                           | Barrel: `override.ts`-Exporte ergänzen.                                                                                                                           | 2       |
| `docs/decision-log.md`                                 | **ADR-035**.                                                                                                                                                      | 5       |
| `docs/TODO.md`                                         | Zwei Einträge löschen, einen umformulieren, zwei anlegen.                                                                                                         | 2, 3, 5 |
| `docs/roadmap.md`, `CLAUDE.md`, `docs/architecture.md` | Block 1 abschließen, Modul-Landkarte und Datenfluss nachziehen.                                                                                                   | 5       |

**Nicht in diesem PR** (Spec §7, unverändert): `all_day` im Override-Vertrag (🎨, braucht einen `cal.edit.*`-Copy-Key), Transaktionalität, Zonen-Picker, Datenmigration für Alt-Exceptions (§6.6 — sie sind nach dem Fix wirkungslos und harmlos).

---

### Task 1: `zonedDayBounds` nach `timezone.ts`, beide Bestandsaufrufer umstellen

**Files:**

- Modify: `features/calendar/timezone.ts` (neuer Export am Ende, neben `zonedDateKey`)
- Modify: `features/calendar/eventWindow.ts`
- Modify: `features/calendar/recurrence.ts:121-125` (`endOfDayInstant`)
- Test: `features/calendar/timezone.test.ts`

**Interfaces:**

- Consumes: `floatingToInstant(floating: Date, timeZone: string): Date` und `zonedDateKey(instant: Date, timeZone: string): string` aus demselben Modul.
- Produces: `zonedDayBounds(isoDate: string, timeZone: string): { start: Date; end: Date } | null` — von Task 3 (`expand.ts`) und Task 4 (`eventWindow.ts`) konsumiert.

**Warum jetzt:** Die Rechnung „Tagesanfang und -ende als Instants in der Zone des Termins" steht nach D1 an zwei Stellen und käme mit Task 3 zum dritten Mal. Der Docstring in `eventWindow.ts` hält heute ausdrücklich fest, sie sei mit `endOfDayInstant` „bewusst nicht zusammengelegt" — bei zwei Vorkommen war das richtig, die Repo-Regel („Geparkt: wartet auf ein drittes Vorkommen", `docs/roadmap.md`) macht das dritte zum Auslöser. Spec §6.9 Nr. 3.

**Dieser Task ändert kein Verhalten.** Dass die Umstellung verhaltensgleich ist, beweisen die bestehenden Suiten `eventWindow.test.ts` (8 Tests) und `recurrence.test.ts` — sie müssen unverändert grün bleiben. Der neue Test deckt den einen Fall ab, den keiner der beiden Bestandsaufrufer je hatte.

- [ ] **Step 1: Den neuen Test schreiben**

Ans Ende von `features/calendar/timezone.test.ts` anfügen. `zonedDayBounds` in die bestehende Import-Liste ganz oben aufnehmen (`zonedDateKey` ist dort bereits importiert):

```ts
describe("zonedDayBounds", () => {
  test("die Grenzen entstehen in der übergebenen Zone, nicht in der des Lesers", () => {
    const bounds = zonedDayBounds("2026-06-15", BERLIN);
    // 00:00 Berlin am 15.06. (CEST, +2 h) = 22:00Z am 14.06.
    expect(bounds?.start.toISOString()).toBe("2026-06-14T22:00:00.000Z");
    // 23:59:59.999 Berlin am 15.06. = 21:59:59.999Z am 15.06.
    expect(bounds?.end.toISOString()).toBe("2026-06-15T21:59:59.999Z");
  });

  test("an einem Tag ohne lokale Mitternacht beginnt der Tag um 01:00, nicht am Vortag um 23:00", () => {
    // `America/Santiago` stellt am 2026-09-06 um 00:00 vor — die Stunde
    // existiert dort nicht (nachgemessen; `America/Havana` 2026-03-08 und
    // `Asia/Beirut` 2026-03-29 verhalten sich gleich). `floatingToInstant`
    // nimmt in der Lücke den SPÄTEREN Zeitpunkt, also 01:00 desselben Tages.
    // Die Gegenregel („früherer gewinnt") ergäbe 23:00 des VORTAGES — die
    // Tagesgrenze läge dann einen ganzen Tag daneben, und genau das prüft die
    // zweite Assertion.
    const bounds = zonedDayBounds("2026-09-06", "America/Santiago");
    expect(bounds?.start.toISOString()).toBe("2026-09-06T04:00:00.000Z");
    expect(zonedDateKey(bounds!.start, "America/Santiago")).toBe("2026-09-06");
  });

  test("ein formwidriger Schlüssel ergibt null, damit der Aufrufer entscheidet", () => {
    // Kein Wurf und kein Ratewert: `eventLookupWindow` fällt auf sein
    // Standardfenster zurück, `endOfDayInstant` wirft — die Entscheidung
    // gehört den Aufrufern, nicht dieser Funktion.
    expect(zonedDayBounds("kaputt", BERLIN)).toBeNull();
    expect(zonedDayBounds("2026-6-1", BERLIN)).toBeNull();
    expect(zonedDayBounds("", BERLIN)).toBeNull();
  });

  test("ein Date.UTC-Überlauf wird bewusst nicht abgefangen", () => {
    // `"2026-13-45"` entspricht dem Muster, rollt aber über: Monat 13 =
    // Januar 2027, Tag 45 = 14. Februar. Das ist keine Eingabe-Validierung,
    // sondern nur eine Totalitätsgarantie für die Form — dasselbe Verhalten,
    // das `eventLookupWindow` seit PR #121 hat und das dessen Test
    // ausdrücklich festhält. Wer echte Validierung braucht, baut sie an der
    // Route (siehe docs/TODO.md).
    expect(zonedDayBounds("2026-13-45", BERLIN)?.start.toISOString()).toBe(
      "2027-02-13T23:00:00.000Z",
    );
  });
});
```

- [ ] **Step 2: Den Test laufen lassen und rot sehen**

```bash
TZ=Europe/Berlin bun test features/calendar/timezone.test.ts
```

Erwartet: FAIL — `zonedDayBounds` existiert nicht (TypeScript-/Laufzeitfehler beim Import).

- [ ] **Step 3: `zonedDayBounds` implementieren**

An das Ende von `features/calendar/timezone.ts`, direkt hinter `zonedDateKey`:

```ts
/**
 * Die Form, die `zonedDateKey` erzeugt und die `event_exceptions.occurrence_date`
 * trägt. Bewusst nur ein **Form**-Test: `"2026-13-45"` besteht ihn und rollt in
 * `Date.UTC` über — das ist Totalität, keine Validierung (siehe unten).
 */
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Tagesanfang und Tagesende eines `yyyy-MM-dd`-Schlüssels als **Instants** in
 * dieser Zone — die Umkehrung von `zonedDateKey`.
 *
 * Dritte Fundstelle derselben Rechnung, deshalb hier statt bei einem der
 * Aufrufer: `eventLookupWindow` ([eventWindow.ts](./eventWindow.ts)) braucht
 * beide Grenzen, `endOfDayInstant` ([recurrence.ts](./recurrence.ts)) nur das
 * Ende, und die Prüfung „ist dieses `occurrence_date` überhaupt ein Vorkommen
 * der Regel?" in [expand.ts](./expand.ts) wieder beide (ADR-035, Spec §6.9).
 * Bei zwei Vorkommen war die Trennung richtig und im Docstring von
 * `eventWindow.ts` auch so begründet; das dritte kippt sie.
 *
 * **`null` statt eines Wurfs**, weil die Aufrufer verschieden auf einen
 * formwidrigen Schlüssel antworten müssen: `eventLookupWindow` fällt auf sein
 * Standardfenster zurück — ein kaputter `occ`-Routenparameter soll irgendeine
 * Occurrence zeigen statt den Screen zu zerlegen —, `endOfDayInstant` wirft,
 * weil ein aus Müll abgeleitetes `until` eine Serie still am falschen Datum
 * kürzte. Diese Entscheidung gehört den Aufrufern, nicht dieser Funktion.
 *
 * Der Tagesanfang ist nicht durchweg `00:00`: In Zonen, die um Mitternacht
 * umstellen, existiert die Stunde nicht (nachgemessen: `America/Santiago`
 * 2026-09-06, `America/Havana` 2026-03-08, `Asia/Beirut` 2026-03-29 — überall
 * springt die Uhr von 23:59:59 auf 01:00). `floatingToInstant` wählt dort nach
 * seiner Lücken-Regel den **späteren** Zeitpunkt, also 01:00 desselben Tages;
 * die Gegenregel ergäbe 23:00 des Vortages und damit eine Grenze, die einen
 * Tag daneben liegt.
 */
export function zonedDayBounds(
  isoDate: string,
  timeZone: string,
): { start: Date; end: Date } | null {
  if (!DATE_KEY_PATTERN.test(isoDate)) return null;
  const [year, month, day] = isoDate.split("-").map(Number);
  return {
    start: floatingToInstant(new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0)), timeZone),
    end: floatingToInstant(new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999)), timeZone),
  };
}
```

- [ ] **Step 4: Den Test laufen lassen und grün sehen**

```bash
TZ=Europe/Berlin bun test features/calendar/timezone.test.ts
TZ=America/New_York bun test features/calendar/timezone.test.ts
```

Erwartet: beide PASS, identische Zahlen.

- [ ] **Step 5: `eventWindow.ts` auf `zonedDayBounds` umstellen**

`features/calendar/eventWindow.ts` vollständig ersetzen durch:

```ts
import { addDays, max as dateMax, min as dateMin } from "date-fns";

import { zonedDayBounds } from "./timezone";

/**
 * Das Suchfenster, mit dem ein einzelner Master expandiert wird, um eine
 * angeforderte Occurrence zu finden — gebraucht von `useEvent`
 * ([hooks.ts](./hooks.ts)) für den Routen-Parameter `occ` und von
 * `EventEditScreen`s Konflikt-Dialog für die fremde Fassung.
 *
 * Ohne `occurrenceKey` genügt ein Jahr um den Serienstart. Mit einem
 * `occurrenceKey` muss das Fenster zusätzlich sicher den angeforderten
 * Regel-Tag abdecken — sonst läuft `expandEvents` bei einer weit in der
 * Zukunft liegenden Occurrence (>366 Tage) leer, `find` schlägt fehl, und der
 * `expanded[0]`-Fallback zeigt eine **andere** Occurrence derselben Serie.
 *
 * Die Tagesgrenzen kommen aus `zonedDayBounds` ([timezone.ts](./timezone.ts))
 * und entstehen dort in `timeZone`, nicht in der Zone des Lesers (ADR-034,
 * Befund B aus PR #121): Ein Leser westlich der Terminzone verpasste sonst den
 * frühen Teil des angeforderten Tages — ein Berliner Termin um 23:30 liegt für
 * einen Leser in `America/New_York` schon am Vortag —, das Fenster verfehlte
 * die Occurrence, und `find` liefe ins Leere. Ein Schlüssel, der nicht der Form
 * `yyyy-MM-dd` entspricht, liefert dort `null` und fällt hier auf dasselbe
 * Standardfenster zurück wie gar kein Schlüssel. Das ist **keine**
 * Eingabe-Validierung, sondern nur Totalität: Die eigentliche Validierung —
 * einen kaputten `occ`-Link als solchen melden, statt still eine andere
 * Occurrence zu zeigen — gehört an die Route und bleibt offen, siehe
 * `docs/TODO.md`.
 *
 * Als eigenes Modul statt inline in `hooks.ts`: `hooks.ts` importiert über
 * `design-system/ThemeProvider` transitiv `nativewind`, das beim Laden
 * `Appearance` liest — außerhalb eines echten RN/Web-Runtimes wirft das unter
 * `bun test` (`react-native-css-interop`). Diese reine Funktion bleibt davon
 * getrennt und ist ohne Hook-Render-Pfad testbar.
 */
export function eventLookupWindow(
  masterStart: Date,
  occurrenceKey: string | undefined,
  timeZone: string,
): { start: Date; end: Date } {
  const bounds = occurrenceKey ? zonedDayBounds(occurrenceKey, timeZone) : null;
  if (!bounds) {
    return { start: addDays(masterStart, -1), end: addDays(masterStart, 366) };
  }
  return {
    start: dateMin([addDays(masterStart, -1), bounds.start]),
    end: dateMax([addDays(masterStart, 366), bounds.end]),
  };
}
```

Beachten: Der Absatz „Verwandt, aber bewusst nicht zusammengelegt: `endOfDayInstant` …" und der Absatz zum `^\d{4}-\d{2}-\d{2}$`-Guard aus dem alten Docstring sind **absichtlich** verschwunden — beide Aussagen stehen jetzt an `zonedDayBounds`, wo die Rechnung lebt. Sie stehen zu lassen wäre eine Doppelung, die beim nächsten Fix auseinanderläuft.

- [ ] **Step 6: `endOfDayInstant` in `recurrence.ts` umstellen**

`features/calendar/recurrence.ts`, die Funktion an Zeile 121 (den bestehenden Docstring darüber behalten und um den Wurf-Absatz ergänzen):

```ts
function endOfDayInstant(isoDate: string, timeZone: string): string {
  const bounds = zonedDayBounds(isoDate, timeZone);
  // Hier wird bewusst geworfen statt zurückgefallen — anders als in
  // `eventLookupWindow`, das denselben Schlüssel bei formwidriger Eingabe auf
  // sein Standardfenster abbildet: Ein aus Müll abgeleitetes `until` kürzte
  // eine Serie still am falschen Datum, und das ist die Schadensklasse, gegen
  // die dieser ganze Block antritt. Vor ADR-035 warf die Rechnung an dieser
  // Stelle ebenfalls, nur mit einer nichtssagenden Meldung aus `Intl`.
  if (!bounds) throw new RangeError(`endOfDayInstant: kein Datumsschlüssel — "${isoDate}"`);
  return bounds.end.toISOString();
}
```

Den Import anpassen: `zonedDayBounds` in den bestehenden `./timezone`-Import aufnehmen. `floatingToInstant` bleibt importiert, falls es noch andere Verwender in der Datei hat — sonst entfernen, `bun lint` meldet es.

- [ ] **Step 7: Die Bestandssuiten grün sehen — das ist der eigentliche Beweis**

```bash
TZ=Europe/Berlin bun test features/calendar/
TZ=UTC bun test features/calendar/
TZ=America/New_York bun test features/calendar/
bun run typecheck && bun lint && bun format:check
```

Erwartet: `eventWindow.test.ts` und `recurrence.test.ts` unverändert grün, gleiche Testzahl unter allen drei Zonen. Bleibt hier etwas rot, ist die Umstellung **nicht** verhaltensgleich — dann nicht den Test anpassen, sondern die Implementierung.

- [ ] **Step 8: Commit**

```bash
git add features/calendar/timezone.ts features/calendar/timezone.test.ts \
        features/calendar/eventWindow.ts features/calendar/recurrence.ts
git commit -m "refactor(calendar): Tagesgrenzen einer Zone als zonedDayBounds zusammenfuehren"
```

---

### Task 2: `description` im Override-Vertrag, kaputte Datumswerte verwerfen

**Files:**

- Create: `features/calendar/override.ts`
- Create: `features/calendar/override.test.ts`
- Modify: `features/calendar/expand.ts` (`Resolved`, `applyOverride`, `expandEvents`)
- Modify: `features/calendar/optimisticEvents.ts` (`applyOptimisticChanges` + Docstring)
- Modify: `features/calendar/index.ts` (Barrel)
- Test: `features/calendar/expand.test.ts`, `features/calendar/optimisticEvents.test.ts`
- Modify: `docs/TODO.md`

**Interfaces:**

- Consumes: nichts aus Task 1.
- Produces:
  - `isJsonObject(j: Json | null | undefined): j is { [k: string]: Json | undefined }`
  - `overrideDate(value: Json | undefined): Date | null`
  - `overrideInterval(override: Json | null): { start: Date; end: Date } | null`

  Task 3 konsumiert `overrideInterval`, Task 4 ebenfalls.

**Warum ein eigenes Modul:** Der Vertrag von `event_exceptions.override` bekommt mit D2 zwei Leser — `applyOverride` löst eine Occurrence auf, `eventLookupWindow` (Task 4) weitet sein Suchfenster um das beanspruchte Intervall. Beide brauchen dieselbe Antwort auf „ist das überhaupt ein Datum?". Das Modul jetzt anzulegen statt in Task 4 nachzuziehen erspart eine zweite Umbaurunde an `expand.ts`.

- [ ] **Step 1: Die roten Tests schreiben**

**(a)** In `features/calendar/expand.test.ts`, als neuer `describe`-Block am Ende:

```ts
describe("Override-Vertrag (ADR-035)", () => {
  /** Wöchentliche Montagsserie ab 01.06.2026, 09:00 Berlin, eine Stunde lang. */
  function weeklySeries(): EventWithRelations {
    return makeRow({
      id: "evt-series",
      description: "Master-Notiz",
      start_at: "2026-06-01T07:00:00.000Z",
      end_at: "2026-06-01T08:00:00.000Z",
      rrule_freq: "weekly",
      timezone: "Europe/Berlin",
    });
  }

  test("eine im Override geänderte Beschreibung gewinnt gegen die Master-Zeile", () => {
    // Der Spalten-Comment der Migration nennt `description` seit dem ersten
    // Tag als anerkannten Key, `modifyOccurrence` schreibt ihn auch — gelesen
    // wurde er bis ADR-035 nie. Eine per „Nur diesen" geänderte Beschreibung
    // erreichte die Anzeige also nie (Spec §6.3).
    const row = weeklySeries();
    row.event_exceptions = [
      {
        id: "ex-1",
        event_id: row.id,
        occurrence_date: "2026-06-15",
        action: "modified",
        override: {
          start_at: "2026-06-15T07:00:00.000Z",
          end_at: "2026-06-15T08:00:00.000Z",
          title: "Sondertermin",
          description: "Override-Notiz",
          location: null,
        },
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-02T00:00:00.000Z",
      },
    ];
    const out = expandEvents(
      [row],
      new Date("2026-06-01T00:00:00.000Z"),
      new Date("2026-06-30T23:59:59.000Z"),
      lightTheme,
    );
    const patched = out.find((o) => o.occurrenceKey === "2026-06-15");
    expect(patched?.description).toBe("Override-Notiz");
    // Die Nachbar-Occurrence bleibt bei der Master-Beschreibung.
    expect(out.find((o) => o.occurrenceKey === "2026-06-08")?.description).toBe("Master-Notiz");
  });

  test("ein explizites null im Override löscht die Beschreibung", () => {
    const row = weeklySeries();
    row.event_exceptions = [
      {
        id: "ex-2",
        event_id: row.id,
        occurrence_date: "2026-06-15",
        action: "modified",
        override: { description: null },
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-02T00:00:00.000Z",
      },
    ];
    const out = expandEvents(
      [row],
      new Date("2026-06-01T00:00:00.000Z"),
      new Date("2026-06-30T23:59:59.000Z"),
      lightTheme,
    );
    expect(out.find((o) => o.occurrenceKey === "2026-06-15")?.description).toBeNull();
  });

  test("ein kaputtes Override-Datum leert nicht den ganzen Kalender", () => {
    // Gemessen vor dem Fix: `applyOverride` nahm `new Date("kein-datum")`
    // unbesehen, `format(resolved.startAt, …)` quittierte die Invalid Date mit
    // `RangeError: Invalid time value` — und weil `expandEvents` alle Zeilen
    // des Fensters in EINER Schleife abarbeitet, blieb der gesamte
    // Kalenderbereich leer statt nur dieser eine Termin. Dieselbe
    // Schadensklasse wie eine unbekannte Zone (Befund D, ADR-033), dieselbe
    // Antwort: der kaputte Wert wird verworfen, die Occurrence erscheint zu
    // ihrer Regel-Zeit.
    const row = weeklySeries();
    row.event_exceptions = [
      {
        id: "ex-3",
        event_id: row.id,
        occurrence_date: "2026-06-15",
        action: "modified",
        override: { start_at: "kein-datum", title: "Trotzdem da" },
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-02T00:00:00.000Z",
      },
    ];
    const healthy = makeRow({ id: "evt-healthy", start_at: "2026-06-10T07:00:00.000Z" });

    let out: ReturnType<typeof expandEvents> = [];
    expect(() => {
      out = expandEvents(
        [row, healthy],
        new Date("2026-06-01T00:00:00.000Z"),
        new Date("2026-06-30T23:59:59.000Z"),
        lightTheme,
      );
    }).not.toThrow();

    // Die Nachbarzeile überlebt …
    expect(out.map((o) => o.eventId)).toContain("evt-healthy");
    // … und die betroffene Occurrence wird nicht stillschweigend verworfen,
    // sondern zeigt ihre Regel-Zeit mit dem intakten Rest des Overrides.
    const affected = out.find((o) => o.occurrenceKey === "2026-06-15");
    expect(affected?.startAt.toISOString()).toBe("2026-06-15T07:00:00.000Z");
    expect(affected?.title).toBe("Trotzdem da");
  });
});
```

**(b)** `features/calendar/override.test.ts` neu anlegen:

```ts
import { describe, expect, test } from "bun:test";

import { overrideDate, overrideInterval } from "./override";

describe("overrideDate", () => {
  test("liest einen ISO-String", () => {
    expect(overrideDate("2026-06-15T07:00:00.000Z")?.toISOString()).toBe(
      "2026-06-15T07:00:00.000Z",
    );
  });

  test("verwirft alles, was kein parsbares Datum ist", () => {
    expect(overrideDate("kein-datum")).toBeNull();
    expect(overrideDate(undefined)).toBeNull();
    expect(overrideDate(null)).toBeNull();
    expect(overrideDate(42)).toBeNull();
  });
});

describe("overrideInterval", () => {
  test("liefert Start und Ende, wenn beide da sind", () => {
    const interval = overrideInterval({
      start_at: "2026-07-20T07:00:00.000Z",
      end_at: "2026-07-20T08:00:00.000Z",
    });
    expect(interval?.start.toISOString()).toBe("2026-07-20T07:00:00.000Z");
    expect(interval?.end.toISOString()).toBe("2026-07-20T08:00:00.000Z");
  });

  test("ohne brauchbaren Start gibt es kein Intervall", () => {
    // Ein Override ohne `start_at` verschiebt nichts — es gibt also nichts zu
    // fenstern und keinen Kandidaten zu erzeugen.
    expect(overrideInterval({ title: "Nur ein neuer Titel" })).toBeNull();
    expect(overrideInterval({ start_at: "kein-datum" })).toBeNull();
    expect(overrideInterval(null)).toBeNull();
  });

  test("ohne brauchbares Ende gilt der Start auch als Ende", () => {
    const interval = overrideInterval({ start_at: "2026-07-20T07:00:00.000Z" });
    expect(interval?.end.toISOString()).toBe("2026-07-20T07:00:00.000Z");
  });
});
```

**(c)** In `features/calendar/optimisticEvents.test.ts` den bestehenden Test **„lässt die Beschreibung stehen, obwohl der Server sie schreibt"** (im `describe("applyOptimisticChanges · Serie mit Scope \`this\`")`, aktuell Zeilen 212–224) vollständig ersetzen durch:

```ts
test("patcht die Beschreibung — seit ADR-035 überlebt sie den Weg", () => {
  // Bis ADR-035 wurde sie hier bewusst verschluckt: `applyOverride` kannte
  // den Key nicht, `expandEvents` las `description` immer von der
  // Master-Zeile, und sie zu zeigen hieß, sie eine Sekunde später vom
  // Refetch wegnehmen zu lassen. Seit der Override-Vertrag das Feld führt,
  // zeigt der Refetch denselben Wert — die Ausnahme ist damit hinfällig.
  const out = applyOptimisticChanges(
    occ(),
    "this",
    changes({ title: "Neuer Titel", description: "Neue Notiz" }),
  );
  expect(out.title).toBe("Neuer Titel");
  expect(out.description).toBe("Neue Notiz");
});
```

- [ ] **Step 2: Die Tests laufen lassen und rot sehen**

```bash
TZ=Europe/Berlin bun test features/calendar/expand.test.ts features/calendar/override.test.ts features/calendar/optimisticEvents.test.ts
```

Erwartet, jeweils namentlich im Report festhalten:

- `override.test.ts` — Import schlägt fehl, das Modul existiert nicht.
- „eine im Override geänderte Beschreibung gewinnt" — FAIL, liefert `"Master-Notiz"`.
- „ein explizites null im Override löscht die Beschreibung" — FAIL, liefert `"Master-Notiz"`.
- „ein kaputtes Override-Datum leert nicht den ganzen Kalender" — FAIL mit `RangeError: Invalid time value`.
- „patcht die Beschreibung — seit ADR-035 …" — FAIL, liefert `"Trikot einpacken"`.

- [ ] **Step 3: `features/calendar/override.ts` anlegen**

```ts
import type { Json } from "@/features/supabase/database.types";

/**
 * Der Vertrag von `event_exceptions.override`.
 *
 * Die Spalte ist freies `jsonb`; ihr Comment in
 * [20260529091933_calendar.sql](../../supabase/migrations/20260529091933_calendar.sql)
 * nennt seit der ersten Migration fünf anerkannte Keys — `title`,
 * `description`, `start_at`, `end_at`, `location`. Wer sie liest, muss mit
 * allem rechnen, was tatsächlich darinsteht: Der einzige App-seitige Schreiber
 * ist `modifyOccurrence` ([recurrence.ts](./recurrence.ts)) mit ISO-Strings,
 * aber direkte DB-Schreibzugriffe, ein künftiger serverseitiger Writer und
 * Migrationen sind es nicht.
 *
 * Eigenes Modul, weil der Vertrag seit ADR-035 zwei Leser hat: `applyOverride`
 * ([expand.ts](./expand.ts)) löst eine Occurrence auf, `eventLookupWindow`
 * ([eventWindow.ts](./eventWindow.ts)) weitet sein Suchfenster um das vom
 * Override beanspruchte Intervall. Beide brauchen dieselbe Antwort auf „ist
 * das überhaupt ein Datum?", und zwei Antworten darauf liefen beim nächsten
 * Fix auseinander.
 */

/** Ein JSON-Objekt (kein Array, kein `null`) — der Türsteher vor jedem Key-Zugriff. */
export function isJsonObject(j: Json | null | undefined): j is { [k: string]: Json | undefined } {
  return typeof j === "object" && j !== null && !Array.isArray(j);
}

/**
 * Ein Datumswert aus dem Override-JSON, oder `null`.
 *
 * Ein nicht parsbarer String ergab bis ADR-035 eine `Invalid Date`, die
 * `format(resolved.startAt, …)` in `expandEvents` mit `RangeError: Invalid time
 * value` quittierte — und weil dort alle Zeilen des Fensters in einer Schleife
 * laufen, blieb der **gesamte** Kalenderbereich leer statt nur der eine Termin
 * (nachgemessen, Spec §6.9). Dieselbe Schadensklasse wie eine unbekannte Zone
 * (Befund D, ADR-033) und dieselbe Antwort: verwerfen, damit der Rest steht.
 */
export function overrideDate(value: Json | undefined): Date | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Das Intervall, das ein Override beansprucht — oder `null`, wenn er keines
 * beansprucht.
 *
 * Ohne brauchbares `start_at` gibt es kein Intervall: Ein Override, der nur
 * Titel oder Beschreibung ändert, verschiebt nichts, erzeugt also weder einen
 * Kandidaten (§6.2) noch eine Fensterweitung (§6.9 Nr. 2).
 *
 * Fehlt oder bricht `end_at`, gilt der Start auch als Ende. Das macht die
 * Vorprüfung in `expandEvents` in diesem einen Fall **strenger** als den
 * Fensterfilter dahinter, der stattdessen das Regel-Ende der Occurrence
 * heranzieht. Über den App-Schreibpfad ist der Fall nicht erreichbar —
 * `modifyOccurrence` schreibt `EventChanges` vollständig, also immer beide
 * Felder. Ein Override nur mit `start_at` kann heute nur von außen entstehen;
 * die Abweichung steht als Grenze in `docs/TODO.md`.
 */
export function overrideInterval(override: Json | null): { start: Date; end: Date } | null {
  if (!isJsonObject(override)) return null;
  const start = overrideDate(override.start_at);
  if (!start) return null;
  return { start, end: overrideDate(override.end_at) ?? start };
}
```

- [ ] **Step 4: `expand.ts` auf den Vertrag umstellen**

Vier Änderungen in `features/calendar/expand.ts`:

1. Den lokalen `isJsonObject`-Helfer **löschen** und stattdessen importieren — `readLabel` benutzt ihn weiter:

```ts
import { isJsonObject, overrideDate } from "./override";
```

2. `Resolved` um `description` erweitern:

```ts
interface Resolved {
  title: string;
  description: string | null;
  location: string | null;
  startAt: Date;
  endAt: Date;
}
```

3. `applyOverride` ersetzen:

```ts
function applyOverride(base: Resolved, override: Json | null): Resolved {
  if (!isJsonObject(override)) return base;
  const next: Resolved = { ...base };
  if (typeof override.title === "string") next.title = override.title;
  // `description` und `location` teilen sich dieselbe Form: ein String setzt,
  // ein explizites `null` löscht, ein fehlender Key lässt den Master-Wert
  // stehen. Der Spalten-Comment der Migration nennt beide Keys seit dem ersten
  // Tag; `description` wurde bis ADR-035 trotzdem nie gelesen, eine per „Nur
  // diesen" geänderte Beschreibung erreichte die Anzeige also nie.
  if (typeof override.description === "string") next.description = override.description;
  else if (override.description === null) next.description = null;
  if (typeof override.location === "string") next.location = override.location;
  else if (override.location === null) next.location = null;
  // Unparsbare Datumswerte werden verworfen statt als Invalid Date
  // weitergereicht — siehe `overrideDate`.
  const start = overrideDate(override.start_at);
  if (start) next.startAt = start;
  const end = overrideDate(override.end_at);
  if (end) next.endAt = end;
  return next;
}
```

4. In `expandEvents` den Basiswert und das Ergebnis nachziehen:

```ts
let resolved: Resolved = {
  title: row.title,
  description: row.description,
  location: row.location,
  startAt: occurrenceStart,
  endAt: floatingToInstant(
    new Date(instantToFloating(occurrenceStart, row.timezone).getTime() + floatingDurationMs),
    row.timezone,
  ),
};
```

und im `out.push({ … })` die Zeile `description: row.description,` ersetzen durch `description: resolved.description,`.

- [ ] **Step 5: `optimisticEvents.ts` nachziehen**

In `applyOptimisticChanges` die Zeile

```ts
    description: viaException ? occurrence.description : changes.description,
```

ersetzen durch

```ts
    description: changes.description,
```

und im Docstring darüber den Punkt 2 („**Überlebt `description` den Weg?**") ersetzen. Der Block beginnt mit „Zwei Unterscheidungen tragen die Funktion:" — daraus wird:

```
 * **Eine Unterscheidung trägt die Funktion: literale Zeiten oder neu
 * verankerte?** Trifft die Änderung die Master-Zeile *einer Serie* (`all`,
 * `forward`), schreibt der Server dort `start_at`/`end_at`, und `expandEvents`
 * trägt deren **Tageszeit** in jede Occurrence, während jede ihr eigenes Datum
 * behält. Ein stumpfes Übernehmen zöge die Serie auf einen Tag zusammen. Beim
 * Einzeltermin und bei einer Exception (`this` auf einer Serie) gelten dagegen
 * die Literalwerte — dort verschiebt eine Datumsänderung den Termin
 * tatsächlich.
 *
 * `description` war bis ADR-035 eine zweite Unterscheidung: `applyOverride`
 * kannte den Key nicht, `expandEvents` las das Feld immer von der Master-Zeile,
 * und eine per Exception geänderte Beschreibung hier zu zeigen hieß, sie eine
 * Sekunde später vom Refetch wegnehmen zu lassen — genau das Flackern, gegen
 * das dieses Feature antritt. Seit der Override-Vertrag das Feld führt, zeigt
 * der Refetch denselben Wert, und die Eingabe gilt in beiden Fällen.
```

Die Variable `viaException` wird weiter für `isException` gebraucht — **nicht** entfernen.

- [ ] **Step 6: Barrel ergänzen**

In `features/calendar/index.ts`, bei den übrigen `export { … } from "./…"`-Zeilen alphabetisch einsortiert:

```ts
export { isJsonObject, overrideDate, overrideInterval } from "./override";
```

- [ ] **Step 7: Alle Tests grün sehen**

```bash
TZ=Europe/Berlin bun test features/calendar/
TZ=UTC bun test features/calendar/
TZ=America/New_York bun test features/calendar/
bun run typecheck && bun lint && bun format:check
```

Erwartet: alles PASS, identische Zahlen unter den drei Zonen.

- [ ] **Step 8: `docs/TODO.md` pflegen**

Zwei Änderungen, beide in **diesem** Commit:

1. Den Eintrag **„`applyOverride` kennt `description` nicht"** (Calendar-Sektion) **vollständig löschen** — er ist erledigt.
2. Im Eintrag **„Ganztägig ist im Edit-Form nicht umschaltbar"** den Halbsatz „`applyOverride` in [expand.ts](../features/calendar/expand.ts) kennt den Key nicht, der Override-Vertrag müsste also mitwachsen" ersetzen durch: „`applyOverride` in [expand.ts](../features/calendar/expand.ts) kennt `all_day` nicht — der Override-Vertrag müsste um genau diesen Key wachsen, wie er es mit [ADR-035](./decision-log.md) für `description` getan hat. Der Code-Teil ist damit vorgezeichnet; Blocker bleibt allein der `cal.edit.*`-Copy-Key."

Zusätzlich anlegen (Calendar-Sektion), als neue Grenze aus diesem Task:

```markdown
- **Ein Override nur mit `start_at` wird strenger gefenstert als aufgelöst** ([features/calendar/override.ts](../features/calendar/override.ts) — `overrideInterval`, [features/calendar/expand.ts](../features/calendar/expand.ts)): Fehlt `end_at` im Override-JSON, setzt `overrideInterval` das Ende gleich dem Start. Die Vorprüfung der Kandidatenmenge verwirft damit ein Intervall, das der Fensterfilter dahinter — der stattdessen das Regel-Ende der Occurrence heranzieht — behalten würde. Über den App-Schreibpfad nicht erreichbar: `modifyOccurrence` schreibt `EventChanges` vollständig, also immer beide Felder. Vertagt, bis es einen zweiten Schreiber gibt (serverseitiger Writer, Migration); dann ist die richtige Form absehbar statt geraten.
```

- [ ] **Step 9: Commit**

```bash
git add features/calendar/override.ts features/calendar/override.test.ts \
        features/calendar/expand.ts features/calendar/expand.test.ts \
        features/calendar/optimisticEvents.ts features/calendar/optimisticEvents.test.ts \
        features/calendar/index.ts docs/TODO.md
git commit -m "fix(calendar): description in den Override-Vertrag aufnehmen"
```

---

### Task 3: Die Kandidatenmenge — verschobene Occurrences werden sichtbar

**Files:**

- Modify: `features/calendar/expand.ts` (neuer Helfer + Umbau in `expandEvents`)
- Test: `features/calendar/expand.test.ts`
- Modify: `docs/TODO.md`

**Interfaces:**

- Consumes: `zonedDayBounds(isoDate, timeZone)` aus Task 1, `overrideInterval(override)` aus Task 2, dazu die bestehenden `occurrencesBetween(row, from, to)` (`./rrule`) und `zonedDateKey(instant, timeZone)` (`./timezone`).
- Produces: nichts für spätere Tasks — die Änderung bleibt in `expandEvents` gekapselt.

**Der Befund, nachgemessen:** Kandidaten kommen heute ausschließlich aus `rule.between(...)`. Verschiebt ein Override eine Occurrence in einen Monat, in dem ihr _ursprüngliches_ `occurrence_date` nicht liegt, entsteht der Kandidat nie — der Termin ist **an beiden Daten unsichtbar** (Messung oben). Spec §6.2.

**Die Regel (Spec §6.2, wörtlich):** Ein Exception-Kandidat entsteht für jede Exception mit `action = 'modified'` **und** gesetztem `override.start_at` **und** einem überschriebenen Intervall, das das Fenster schneidet, **und** einem `occurrence_date`, das ein echtes Vorkommen der Regel ist, **und** das nicht schon in der Regel-Menge liegt. Dedupliziert wird auf `occurrence_date` (= `occurrenceKey`).

Die vierte Bedingung ist nicht Vorsicht ohne Anlass: Verwaiste Exceptions überleben den Löschpfad (`deleteAllExceptions` läuft nur bei `ruleDiffers`, `deleteExceptionsFromDate` nur ab dem Schnitt). Ohne die Prüfung erzeugte eine solche Zeile einen **Phantom-Termin** an einem Datum, an dem die Serie gar nicht stattfindet.

- [ ] **Step 1: Die Tests schreiben**

In `features/calendar/expand.test.ts` als neuer `describe`-Block am Ende. Die Fixture ist genau die aus der Messung oben — die verschobene Occurrence landet dabei auf einem Tag, an dem die Serie **ohnehin** ein Vorkommen hat, und trägt damit den Kollisionsfall aus Spec §6.5 Nr. 7 gleich mit:

```ts
describe("Kandidatenmenge aus event_exceptions (ADR-035)", () => {
  const JUNI_START = new Date("2026-06-01T00:00:00.000Z");
  const JUNI_END = new Date("2026-06-30T23:59:59.000Z");
  const JULI_START = new Date("2026-07-01T00:00:00.000Z");
  const JULI_END = new Date("2026-07-31T23:59:59.000Z");

  /**
   * Wöchentliche Montagsserie ab 01.06.2026, 09:00 Berlin. Die Occurrence vom
   * 29.06. ist per Override auf den 20.07. verschoben — einen Montag, an dem
   * die Serie ohnehin stattfindet.
   */
  function movedSeries(): EventWithRelations {
    const row = makeRow({
      id: "evt-series",
      description: "Master-Notiz",
      start_at: "2026-06-01T07:00:00.000Z",
      end_at: "2026-06-01T08:00:00.000Z",
      rrule_freq: "weekly",
      timezone: "Europe/Berlin",
    });
    row.event_exceptions = [
      {
        id: "ex-moved",
        event_id: row.id,
        occurrence_date: "2026-06-29",
        action: "modified",
        override: {
          start_at: "2026-07-20T07:00:00.000Z",
          end_at: "2026-07-20T08:00:00.000Z",
          title: "Verschoben",
          description: "Override-Notiz",
          location: null,
        },
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-02T00:00:00.000Z",
      },
    ];
    return row;
  }

  test("ROT VOR DEM FIX: sie erscheint im Fenster ihres aufgelösten Datums", () => {
    const row = movedSeries();
    const out = expandEvents([row], JULI_START, JULI_END, lightTheme);
    const moved = out.find((o) => o.occurrenceKey === "2026-06-29");
    expect(moved).toBeDefined();
    expect(moved?.occurrenceDate).toBe("2026-07-20");
    expect(moved?.title).toBe("Verschoben");
    // Der Kandidat läuft durch dieselbe Auflösung wie ein Regel-Vorkommen —
    // Exception-Flag und Versions-Token inklusive (ADR-034).
    expect(moved?.isException).toBe(true);
    expect(moved?.version).toBe(`${row.updated_at}|2026-06-02T00:00:00.000Z`);
  });

  test("ROT VOR DEM FIX: der Kollisionsfall — zwei Einträge am selben Anzeigetag", () => {
    // Die verschobene Occurrence (Schlüssel 29.06.) landet auf dem 20.07., an
    // dem die Serie ohnehin ein reguläres Vorkommen hat (Schlüssel 20.07.).
    // Beide müssen überleben und sich im Schlüssel unterscheiden — das ist
    // genau der Grund, aus dem `occurrenceKey` in ADR-034 die Identität wurde.
    const out = expandEvents([movedSeries()], JULI_START, JULI_END, lightTheme);
    const sameDay = out.filter((o) => o.occurrenceDate === "2026-07-20");
    expect(sameDay.map((o) => o.occurrenceKey).sort()).toEqual(["2026-06-29", "2026-07-20"]);
  });

  test("GRENZWÄCHTER (vor dem Fix bereits grün): sie erscheint NICHT im Fenster ihres Regel-Datums", () => {
    // Heute grün, weil der Fensterfilter die verschobene Occurrence verwirft.
    // Der Test hält fest, dass die neue Kandidatenmenge sie nicht zusätzlich
    // an ihrem alten Datum zurückbringt — „an beiden Daten sichtbar" wäre
    // derselbe Fehler mit umgekehrtem Vorzeichen.
    const out = expandEvents([movedSeries()], JUNI_START, JUNI_END, lightTheme);
    expect(out.map((o) => o.occurrenceKey)).not.toContain("2026-06-29");
  });

  test("GRENZWÄCHTER (vor dem Fix bereits grün): in einem Fenster über beide Daten genau einmal", () => {
    // Hier liegt das Regel-Datum bereits in der Regel-Menge; die Deduplizierung
    // muss verhindern, dass der Kandidatenpfad eine zweite Kopie beisteuert.
    const out = expandEvents([movedSeries()], JUNI_START, JULI_END, lightTheme);
    expect(out.filter((o) => o.occurrenceKey === "2026-06-29")).toHaveLength(1);
  });

  test("eine verwaiste Exception an einem Nicht-Vorkommen erzeugt keinen Phantom-Termin", () => {
    // 30.06.2026 ist ein DIENSTAG — kein Vorkommen der Montagsserie. Solche
    // Zeilen überleben den Löschpfad (`deleteAllExceptions` läuft nur bei
    // `ruleDiffers`, `deleteExceptionsFromDate` nur ab dem Schnitt). Ohne die
    // Prüfung „ist das überhaupt ein Vorkommen der Regel?" erschiene hier ein
    // Termin an einem Tag, an dem die Serie nie stattfand (Spec §6.2).
    const row = movedSeries();
    row.event_exceptions = [
      ...(row.event_exceptions ?? []),
      {
        id: "ex-orphan",
        event_id: row.id,
        occurrence_date: "2026-06-30",
        action: "modified",
        override: {
          start_at: "2026-07-21T07:00:00.000Z",
          end_at: "2026-07-21T08:00:00.000Z",
          title: "Phantom",
        },
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-02T00:00:00.000Z",
      },
    ];
    const out = expandEvents([row], JULI_START, JULI_END, lightTheme);
    expect(out.map((o) => o.title)).not.toContain("Phantom");
    expect(out.map((o) => o.occurrenceKey)).not.toContain("2026-06-30");
  });

  test("eine cancelled-Exception erzeugt keinen Kandidaten", () => {
    const row = movedSeries();
    row.event_exceptions = [
      {
        id: "ex-cancelled",
        event_id: row.id,
        occurrence_date: "2026-06-29",
        action: "cancelled",
        override: null,
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-02T00:00:00.000Z",
      },
    ];
    const out = expandEvents([row], JULI_START, JULI_END, lightTheme);
    expect(out.map((o) => o.occurrenceKey)).not.toContain("2026-06-29");
  });

  test("eine Serie, deren einziges sichtbares Vorkommen ein Kandidat ist, verschwindet nicht", () => {
    // Das `if (!occurrences.length) continue;` stand vor dem Fix VOR der
    // Kandidatenberechnung. Eine Serie ohne Regel-Vorkommen im Fenster wurde
    // damit übersprungen, bevor die verschobene Occurrence überhaupt in Frage
    // kam. Fenster: nur der 20.07. selbst, an dem kein Regel-Vorkommen der
    // Dienstagsserie liegt.
    const row = makeRow({
      id: "evt-lonely",
      start_at: "2026-06-02T07:00:00.000Z", // Dienstag
      end_at: "2026-06-02T08:00:00.000Z",
      rrule_freq: "weekly",
      timezone: "Europe/Berlin",
    });
    row.event_exceptions = [
      {
        id: "ex-lonely",
        event_id: row.id,
        occurrence_date: "2026-06-30", // Dienstag, echtes Vorkommen
        action: "modified",
        override: {
          start_at: "2026-07-20T07:00:00.000Z", // Montag — kein Regel-Tag
          end_at: "2026-07-20T08:00:00.000Z",
          title: "Einzelgänger",
        },
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-02T00:00:00.000Z",
      },
    ];
    const out = expandEvents(
      [row],
      new Date("2026-07-20T00:00:00.000Z"),
      new Date("2026-07-20T23:59:59.000Z"),
      lightTheme,
    );
    expect(out.map((o) => o.title)).toEqual(["Einzelgänger"]);
  });
});
```

- [ ] **Step 2: Die Tests laufen lassen und die vier roten sehen**

```bash
TZ=Europe/Berlin bun test features/calendar/expand.test.ts
```

Erwartet, namentlich im Report festhalten:

- „ROT VOR DEM FIX: sie erscheint im Fenster ihres aufgelösten Datums" — FAIL, `moved` ist `undefined`.
- „ROT VOR DEM FIX: der Kollisionsfall" — FAIL, nur `["2026-07-20"]`.
- „eine verwaiste Exception …" — PASS (heute grün; sie wird erst durch den Fix zum Wächter).
- „eine cancelled-Exception …" — PASS (heute grün, ebenfalls Wächter).
- „eine Serie, deren einziges sichtbares Vorkommen ein Kandidat ist" — FAIL, leeres Array.
- Die beiden GRENZWÄCHTER — PASS.

Läuft einer der als GRENZWÄCHTER markierten Tests rot, ist die Fixture falsch, nicht der Code — dann die Fixture reparieren, bevor es weitergeht.

- [ ] **Step 3: Den Kandidaten-Helfer implementieren**

In `features/calendar/expand.ts`, direkt unterhalb von `expandRecurrence`:

```ts
/**
 * Die Regel-Vorkommen zu den `modified`-Exceptions, die per Override **in**
 * dieses Fenster geschoben wurden, ihr eigenes Regel-Datum aber außerhalb
 * haben.
 *
 * Ohne sie ist eine so verschobene Occurrence **an beiden Daten unsichtbar**:
 * am Regel-Datum verwirft sie der Fensterfilter (sie liegt dort nicht mehr), am
 * neuen Datum entsteht sie nie, weil `rule.between(...)` nur Regel-Daten kennt
 * (nachgemessen, Spec §6.2). Erreichbar über `EventEditScreen` mit Scope „Nur
 * diesen".
 *
 * Zurückgegeben wird das **Regel**-Vorkommen, nicht der Override-Start: Der
 * Aufrufer schickt es durch dieselbe Auflösung wie jedes andere Vorkommen, und
 * nur so trägt die Occurrence hinterher denselben `occurrenceKey`, dasselbe
 * Versions-Token und dieselbe Exception-Kennzeichnung wie auf dem regulären
 * Weg (ADR-034).
 *
 * Die Reihenfolge der Prüfungen ist Absicht — billig vor teuer: Der
 * Fensterschnitt und die Deduplizierung kosten nichts, der abschließende
 * `occurrencesBetween`-Aufruf einen zusätzlichen rrule-Durchlauf. Der ist
 * unverzichtbar: Verwaiste Exceptions überleben den Löschpfad
 * (`deleteAllExceptions` läuft nur bei `ruleDiffers`, `deleteExceptionsFromDate`
 * nur ab dem Schnitt), und ohne die Prüfung erzeugte eine solche Zeile einen
 * Phantom-Termin an einem Datum, an dem die Serie gar nicht stattfindet. Er
 * kostet auch selten etwas: Verschobene Exceptions sind die Ausnahme, und die
 * Regel-Schlüsselmenge wird erst gebaut, wenn die erste eine Prüfung braucht.
 */
function movedExceptionOccurrences(
  row: EventRow,
  exceptions: EventExceptionRow[],
  ruleOccurrences: Date[],
  rangeStart: Date,
  rangeEnd: Date,
): Date[] {
  const out: Date[] = [];
  let ruleKeys: Set<string> | null = null;
  for (const ex of exceptions) {
    if (ex.action !== "modified") continue;
    const interval = overrideInterval(ex.override);
    if (!interval) continue;
    // Derselbe Schnitt, den der Filter in `expandEvents` gleich noch einmal
    // zieht — hier nur, um den rrule-Aufruf unten zu sparen.
    if (interval.end < rangeStart || interval.start > rangeEnd) continue;
    ruleKeys ??= new Set(ruleOccurrences.map((o) => zonedDateKey(o, row.timezone)));
    if (ruleKeys.has(ex.occurrence_date)) continue;
    const bounds = zonedDayBounds(ex.occurrence_date, row.timezone);
    if (!bounds) continue;
    const onThatDay = occurrencesBetween(row, bounds.start, bounds.end).find(
      (o) => zonedDateKey(o, row.timezone) === ex.occurrence_date,
    );
    if (onThatDay) out.push(onThatDay);
  }
  return out;
}
```

Die Importe in `expand.ts` entsprechend ergänzen:

```ts
import { overrideInterval } from "./override"; // isJsonObject/overrideDate stehen dort schon aus Task 2
import { zonedDateKey, zonedDayBounds } from "./timezone"; // zu den bestehenden Importen hinzufügen
```

- [ ] **Step 4: `expandEvents` umbauen**

Der Block in `expandEvents` von `const occurrences = expandRecurrence(...)` bis `if (!occurrences.length) continue;` wird ersetzt. **Die Reihenfolge ist der Kern dieses Schritts:** Der `exceptions`-Wert muss vor die Kandidatenberechnung, und der `!occurrences.length`-Abbruch dahinter — sonst überspringt die Schleife eine Serie, deren einziges sichtbares Vorkommen ein Kandidat ist.

Vorher:

```ts
    const occurrences = expandRecurrence(
      row,
      rangeStart,
      rangeEnd,
      Math.max(durationMs, floatingDurationMs),
    );
    if (!occurrences.length) continue;

    const typeRow = row.event_types;
    …
    const exceptions = new Map((row.event_exceptions ?? []).map((ex) => [ex.occurrence_date, ex]));
```

Nachher:

```ts
    const exceptionRows = row.event_exceptions ?? [];
    const ruleOccurrences = expandRecurrence(
      row,
      rangeStart,
      rangeEnd,
      Math.max(durationMs, floatingDurationMs),
    );
    // Zwei Quellen statt einer (ADR-035). Sortiert, damit die Ausgabe
    // unabhängig davon geordnet bleibt, aus welcher Quelle ein Vorkommen kam —
    // `useEvent`s `expanded[0]`-Fallback liest sonst je nach Exception-Lage ein
    // anderes Vorkommen.
    const occurrences = [
      ...ruleOccurrences,
      ...movedExceptionOccurrences(row, exceptionRows, ruleOccurrences, rangeStart, rangeEnd),
    ].sort((a, b) => a.getTime() - b.getTime());
    // Der Abbruch steht bewusst NACH der Kandidatenberechnung: Eine Serie, die
    // im Fenster kein Regel-Vorkommen hat, kann trotzdem eine hierher
    // verschobene Occurrence haben.
    if (!occurrences.length) continue;

    const typeRow = row.event_types;
    …
    const exceptions = new Map(exceptionRows.map((ex) => [ex.occurrence_date, ex]));
```

Den Typ-Alias `EventExceptionRow` gibt es in `expand.ts` bereits (oben bei den anderen Aliassen) — er wird jetzt auch außerhalb von `EventWithRelations` gebraucht.

- [ ] **Step 5: Alle Tests grün sehen**

```bash
TZ=Europe/Berlin bun test features/calendar/
TZ=UTC bun test features/calendar/
TZ=America/New_York bun test features/calendar/
bun run typecheck && bun lint && bun format:check
```

Erwartet: alles PASS, identische Zahlen unter den drei Zonen. Besonders auf `spans.test.ts` und `pendingDeletes.test.ts` achten — sie konsumieren `expandEvents`-Ausgabe.

- [ ] **Step 6: `docs/TODO.md` pflegen**

Den Eintrag **„Aus dem Fenster verschobene `modified`-Exceptions verschwinden"** (Calendar-Sektion) **vollständig löschen** — er ist mit diesem Commit erledigt.

- [ ] **Step 7: Commit**

```bash
git add features/calendar/expand.ts features/calendar/expand.test.ts docs/TODO.md
git commit -m "fix(calendar): verschobene Occurrences aus event_exceptions als Kandidaten aufnehmen"
```

---

### Task 4: Eine verschobene Occurrence über ihren eigenen Link erreichbar machen

**Files:**

- Modify: `features/calendar/eventWindow.ts`
- Modify: `features/calendar/hooks.ts:111-125` (`useEvent`)
- Modify: `app-sections/event/EventEditScreen.tsx:358-371` (Konflikt-Dialog)
- Test: `features/calendar/eventWindow.test.ts`

**Interfaces:**

- Consumes: `zonedDayBounds` (Task 1), `overrideInterval` (Task 2), `EventWithRelations` aus `./expand`.
- Produces: **geänderte Signatur** `eventLookupWindow(row: EventWithRelations, occurrenceKey?: string): { start: Date; end: Date }` — vorher `(masterStart: Date, occurrenceKey: string | undefined, timeZone: string)`.

**Der Befund, nachgemessen:** Wöchentliche Serie ab 2026-06-01, Exception am Regel-Datum 2027-10-18, per Override auf 2027-10-25 verschoben. `eventLookupWindow` liefert ein Fenster bis `2027-10-18T21:59:59.999Z` — das Ende des angeforderten Regel-Tages. `expandEvents` erzeugt die Occurrence, `applyOverride` schiebt sie hinter `rangeEnd`, der Fensterfilter verwirft sie, `find` läuft leer, und der `expanded[0]`-Fallback zeigt **das erste Vorkommen der Serie (2026-06-01)** — einen anderen Termin, ohne jede Meldung. Spec §6.9 Nr. 2.

Das ist dieselbe Klasse wie Befund B aus D1, der genau diese Funktion für den **unverschobenen** Fall repariert hat. Task 3 hilft hier nicht: Das Regel-Datum liegt bereits im Fenster, der reguläre Pfad erzeugt die Occurrence — sie fällt erst _nach_ der Auflösung heraus.

**Warum die Signatur die Zeile nimmt statt eines vierten Parameters:** Von den dann vier Werten kämen alle vier aus derselben Zeile (`start_at`, `timezone`, `event_exceptions` — und der Schlüssel als einziger von außen). Beide Aufrufer haben die Zeile ohnehin zur Hand. Die Signatur zu erweitern statt zu ersetzen hieße, dieselbe Zeile drei- statt einmal zu zerlegen.

- [ ] **Step 1: Die bestehenden Tests auf die neue Signatur umstellen**

In `features/calendar/eventWindow.test.ts` ganz oben eine Fixture-Fabrik ergänzen und die acht bestehenden Aufrufe umschreiben. Die Fabrik (lokaler Testhelfer, kein Docstring nötig):

```ts
import { describe, expect, test } from "bun:test";

import type { Database } from "@/features/supabase/database.types";

import type { EventWithRelations } from "./expand";

import { eventLookupWindow } from "./eventWindow";

type EventRow = Database["public"]["Tables"]["events"]["Row"];
type EventExceptionRow = Database["public"]["Tables"]["event_exceptions"]["Row"];

// Montag, 04.05.2026, 18:30 Europe/Berlin (CEST, +2 h → 16:30 UTC) — derselbe
// Fixture-Stil wie `recurrence.test.ts`.
const MASTER_START = new Date("2026-05-04T16:30:00.000Z");

function makeRow(overrides: Partial<EventRow> = {}): EventWithRelations {
  const row: EventRow = {
    id: "evt-1",
    family_id: "fam-1",
    type_id: "type-1",
    child_id: null,
    parent_id: null,
    title: "Serie",
    description: null,
    location: null,
    start_at: MASTER_START.toISOString(),
    end_at: new Date(MASTER_START.getTime() + 3600_000).toISOString(),
    all_day: false,
    timezone: "Europe/Berlin",
    rrule_freq: "weekly",
    rrule_interval: 1,
    rrule_byweekday: null,
    rrule_count: null,
    rrule_until: null,
    created_at: "2026-01-01T00:00:00.000Z",
    created_by: null,
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
  return { ...row, event_types: null, event_exceptions: [] };
}

function movedException(
  occurrenceDate: string,
  startIso: string,
  endIso: string,
): EventExceptionRow {
  return {
    id: `ex-${occurrenceDate}`,
    event_id: "evt-1",
    occurrence_date: occurrenceDate,
    action: "modified",
    override: { start_at: startIso, end_at: endIso, title: "Verschoben" },
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-02T00:00:00.000Z",
  };
}
```

Die bestehenden Aufrufe werden dann mechanisch umgeschrieben — **die erwarteten Werte ändern sich in keinem einzigen Fall**:

| vorher                                                                                              | nachher                                                                                                               |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `eventLookupWindow(MASTER_START, undefined, "Europe/Berlin")`                                       | `eventLookupWindow(makeRow())`                                                                                        |
| `eventLookupWindow(MASTER_START, "2026-06-15", "Europe/Berlin")`                                    | `eventLookupWindow(makeRow(), "2026-06-15")`                                                                          |
| `eventLookupWindow(farPastMaster, "2026-09-10", "America/Los_Angeles")`                             | `eventLookupWindow(makeRow({ start_at: "2024-01-01T00:00:00.000Z", timezone: "America/Los_Angeles" }), "2026-09-10")` |
| `eventLookupWindow(laterMaster, "2026-09-10", "America/Los_Angeles")`                               | `eventLookupWindow(makeRow({ start_at: "2026-09-15T00:00:00.000Z", timezone: "America/Los_Angeles" }), "2026-09-10")` |
| die vier formwidrigen Schlüssel, z. B. `eventLookupWindow(MASTER_START, "kaputt", "Europe/Berlin")` | `eventLookupWindow(makeRow(), "kaputt")`                                                                              |

Bleibt eine der erwarteten Zahlen nach der Umstellung nicht stehen, ist die Fabrik falsch (meist `start_at` oder `timezone`), nicht die Funktion.

- [ ] **Step 2: Die neuen Tests schreiben**

Als eigener `describe`-Block ans Ende von `features/calendar/eventWindow.test.ts`:

```ts
describe("eventLookupWindow deckt das Override-Intervall mit ab (ADR-035)", () => {
  test("ROT VOR DEM FIX: ein Override hinter dem Fensterende weitet das Fenster", () => {
    // Regel-Datum 2027-10-18 liegt >366 Tage nach dem Serienstart, das Fenster
    // endet also am Ende dieses Regel-Tages. Der Override schiebt die
    // Occurrence auf den 25.10. — ohne Weitung verwirft der Fensterfilter in
    // `expandEvents` sie, `find` läuft leer, und der `expanded[0]`-Fallback
    // zeigt stillschweigend das erste Vorkommen der Serie (nachgemessen).
    const row = makeRow({
      start_at: "2026-06-01T07:00:00.000Z",
      end_at: "2026-06-01T08:00:00.000Z",
    });
    row.event_exceptions = [
      movedException("2027-10-18", "2027-10-25T07:00:00.000Z", "2027-10-25T08:00:00.000Z"),
    ];
    const { end } = eventLookupWindow(row, "2027-10-18");
    expect(end.getTime()).toBeGreaterThanOrEqual(new Date("2027-10-25T08:00:00.000Z").getTime());
  });

  test("ROT VOR DEM FIX: ein Override vor dem Fensteranfang weitet es in die Gegenrichtung", () => {
    const row = makeRow({
      start_at: "2027-06-07T07:00:00.000Z",
      end_at: "2027-06-07T08:00:00.000Z",
    });
    row.event_exceptions = [
      movedException("2027-06-14", "2026-01-05T07:00:00.000Z", "2026-01-05T08:00:00.000Z"),
    ];
    const { start } = eventLookupWindow(row, "2027-06-14");
    expect(start.getTime()).toBeLessThanOrEqual(new Date("2026-01-05T07:00:00.000Z").getTime());
  });

  test("GRENZWÄCHTER: ein Override ohne start_at weitet nichts", () => {
    const row = makeRow();
    row.event_exceptions = [
      {
        id: "ex-title-only",
        event_id: row.id,
        occurrence_date: "2026-06-15",
        action: "modified",
        override: { title: "Nur ein neuer Titel" },
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-02T00:00:00.000Z",
      },
    ];
    const { start, end } = eventLookupWindow(row, "2026-06-15");
    expect(start.toISOString()).toBe("2026-05-03T16:30:00.000Z");
    expect(end.toISOString()).toBe("2027-05-05T16:30:00.000Z");
  });

  test("GRENZWÄCHTER: der Override einer ANDEREN Occurrence weitet nichts", () => {
    // Nur die angeforderte Occurrence zählt — sonst zöge eine einzige weit
    // verschobene Exception das Fenster jeder anderen Occurrence derselben
    // Serie mit sich, und `expandEvents` expandierte für jeden Detail-Aufruf
    // Jahre statt Tage.
    const row = makeRow();
    row.event_exceptions = [
      movedException("2027-10-18", "2030-01-01T07:00:00.000Z", "2030-01-01T08:00:00.000Z"),
    ];
    const { end } = eventLookupWindow(row, "2026-06-15");
    expect(end.toISOString()).toBe("2027-05-05T16:30:00.000Z");
  });
});
```

- [ ] **Step 3: Die Tests laufen lassen**

```bash
TZ=Europe/Berlin bun test features/calendar/eventWindow.test.ts
```

Erwartet: die acht umgestellten Bestandstests PASS (sonst ist die Fabrik falsch), die beiden GRENZWÄCHTER PASS, die beiden „ROT VOR DEM FIX" FAIL. Im Report namentlich festhalten.

- [ ] **Step 4: `eventLookupWindow` umbauen**

In `features/calendar/eventWindow.ts` — Importe und Funktion:

```ts
import { addDays, max as dateMax, min as dateMin } from "date-fns";

import type { EventWithRelations } from "./expand";

import { overrideInterval } from "./override";
import { zonedDayBounds } from "./timezone";
```

```ts
export function eventLookupWindow(
  row: EventWithRelations,
  occurrenceKey?: string,
): { start: Date; end: Date } {
  const masterStart = new Date(row.start_at);
  const bounds = occurrenceKey ? zonedDayBounds(occurrenceKey, row.timezone) : null;
  if (!bounds) {
    return { start: addDays(masterStart, -1), end: addDays(masterStart, 366) };
  }

  const starts = [addDays(masterStart, -1), bounds.start];
  const ends = [addDays(masterStart, 366), bounds.end];

  // Ein Override kann genau diese Occurrence aus dem Fenster schieben, das um
  // ihr Regel-Datum gebaut wurde. `expandEvents` erzeugt sie dann zwar, der
  // Fensterfilter verwirft sie aber wieder, `find` läuft leer, und der
  // `expanded[0]`-Fallback zeigt stillschweigend eine ANDERE Occurrence
  // derselben Serie (nachgemessen, Spec §6.9 Nr. 2) — dieselbe Klasse wie
  // Befund B aus PR #121, nur für den verschobenen Fall.
  //
  // Nur der Override DIESER Occurrence weitet: Sonst zöge eine einzige weit
  // verschobene Exception das Fenster jedes Detail-Aufrufs derselben Serie mit
  // sich, und `expandEvents` expandierte Jahre statt Tage.
  //
  // Beide Grenzen bekommen beide Werte, weil ein Override in jede Richtung
  // verschieben kann — `dateMin`/`dateMax` greifen sich das jeweilige Extrem.
  const interval = overrideInterval(
    (row.event_exceptions ?? []).find(
      (ex) => ex.occurrence_date === occurrenceKey && ex.action === "modified",
    )?.override ?? null,
  );
  if (interval) {
    starts.push(interval.start, interval.end);
    ends.push(interval.start, interval.end);
  }

  return { start: dateMin(starts), end: dateMax(ends) };
}
```

Den Docstring aus Task 1 behalten und um einen Absatz ergänzen, der die Weitung und die beiden Gründe („nur diese Occurrence", „beide Richtungen") benennt.

- [ ] **Step 5: Die beiden Aufrufer nachziehen**

`features/calendar/hooks.ts`, in `useEvent`:

```ts
const { start: fallbackStart, end: fallbackEnd } = eventLookupWindow(row, occurrenceKey);
```

Die Zeile `const start = new Date(row.start_at);` darüber entfällt, sofern sie sonst nirgends gebraucht wird — `bun lint` meldet es. Den Kommentarblock darüber um einen Satz ergänzen: dass das Fenster seit ADR-035 zusätzlich das Override-Intervall der angeforderten Occurrence abdeckt.

`app-sections/event/EventEditScreen.tsx`, im Konflikt-Dialog:

```ts
const { start: windowStart, end: windowEnd } = eventLookupWindow(row, vars.occurrenceKey);
```

Die Zeile `const rowStart = new Date(row.start_at);` darüber entfällt. Den bestehenden Kommentar sinngemäß erhalten — er begründet, warum das Fenster an der Zeile hängt und nicht an den geänderten Eingabewerten; diese Begründung gilt unverändert.

- [ ] **Step 6: Alles grün sehen**

```bash
TZ=Europe/Berlin bun test
TZ=UTC bun test
TZ=America/New_York bun test
bun run typecheck && bun lint && bun format:check
```

Erwartet: alles PASS, identische Zahlen unter den drei Zonen.

- [ ] **Step 7: Commit**

```bash
git add features/calendar/eventWindow.ts features/calendar/eventWindow.test.ts \
        features/calendar/hooks.ts app-sections/event/EventEditScreen.tsx
git commit -m "fix(calendar): Suchfenster deckt das Override-Intervall der angeforderten Occurrence ab"
```

---

### Task 5: ADR-035 und die Dokumentation nachziehen

**Files:**

- Modify: `docs/decision-log.md` (neuer Eintrag ans Ende — ältere ADRs **nie** umschreiben)
- Modify: `docs/roadmap.md` (Abschnitt 1.3, Kopfzeile von Block 1)
- Modify: `CLAUDE.md` (Modul-Landkarte unter `features/calendar/`)
- Modify: `docs/architecture.md` (Kalender-Datenfluss)
- Modify: `docs/TODO.md` (nur, falls Task 2/3 etwas übersehen haben)

**Interfaces:** keine — reiner Dokumentations-Task.

- [ ] **Step 1: ADR-035 schreiben**

Ans Ende von `docs/decision-log.md`, im Format der bestehenden Einträge (`## ADR-0NN — Titel (YYYY-MM-DD)`, dann Fließtext-Kontext, dann `### Decisions` als nummerierte Liste, dann `### Consequences` als Aufzählung):

```markdown
## ADR-035 — Der Override-Vertrag: Kandidaten aus `event_exceptions`, `description` im Vertrag (2026-09-15)
```

Der Kontext-Teil muss diese Punkte tragen — jeder davon ist am 2026-09-15 nachgemessen, und die Messwerte gehören in den Text, nicht nur die Schlussfolgerung:

- Die Kandidatenmenge kam ausschließlich aus `rule.between(...)`. Eine per Override auf einen anderen Monat verschobene Occurrence war **an beiden Daten unsichtbar** — am Regel-Datum verwirft sie der Fensterfilter, am neuen entsteht sie nie. Messwerte: Juli-Fenster zeigt `2026-07-06/13/20/27`, die verschobene (Schlüssel `2026-06-29`) fehlt; Juni-Fenster zeigt `2026-06-01/08/15/22`, sie fehlt ebenso.
- Der Kollisionsfall fällt dabei mit an: Die verschobene Occurrence landet auf dem 20.07., an dem die Serie ohnehin stattfindet. Dass beide überleben, trägt `occurrenceKey` als Identität — die Entscheidung aus [ADR-034](../../decision-log.md#adr-034--der-occurrence-schlüssel-occurrencekey-trennt-regel-datum-von-anzeigedatum-2026-09-14), die hier ihren ersten echten Anwendungsfall bekommt.
- `description` stand seit der ersten Migration im Spalten-Comment als anerkannter Key und wurde von `modifyOccurrence` auch geschrieben — `applyOverride` las ihn nie. Eine per „Nur diesen" geänderte Beschreibung erreichte die Anzeige nie; `applyOptimisticChanges` verschluckte sie folgerichtig ebenfalls, mit einem Kommentar, der genau das begründete.
- Ein kaputtes `override.start_at` ließ `expandEvents` mit `RangeError: Invalid time value` werfen — und weil dort alle Zeilen des Fensters in einer Schleife laufen, blieb der **gesamte** Kalenderbereich leer statt nur der eine Termin. Über den App-Schreibpfad nicht erreichbar, über direkte DB-Schreibzugriffe schon.
- Eine weit entfernte verschobene Occurrence war über ihren eigenen Link nicht erreichbar: `eventLookupWindow` endete am Regel-Tag, der Override schob sie darüber hinaus, `find` lief leer, und der `expanded[0]`-Fallback zeigte **das erste Vorkommen der Serie** — ein anderer Termin, ohne Meldung. Dieselbe Klasse wie Befund B aus PR #121, der dieselbe Funktion für den unverschobenen Fall repariert hat.

Die `### Decisions` (nummeriert, jede mit ihrer Begründung):

1. **Die Kandidatenmenge hat zwei Quellen.** Regel-Vorkommen aus `occurrencesBetween` plus die Regel-Vorkommen der `modified`-Exceptions, deren Override-Intervall das Fenster schneidet und deren `occurrence_date` nicht schon in der Regel-Menge liegt. Dedupliziert wird auf `occurrenceKey`.
2. **Ein Exception-Kandidat entsteht nur an einem echten Vorkommen der Regel.** Verwaiste Exceptions überleben den Löschpfad; ohne die Prüfung erzeugten sie Phantom-Termine. Geprüft wird mit einem gezielten `occurrencesBetween` über den Tag in der Zone des Termins — ein zusätzlicher rrule-Aufruf pro verschobener Exception, und die sind selten.
3. **Zurückgegeben wird das Regel-Vorkommen, nicht der Override-Start.** Nur so läuft der Kandidat durch dieselbe Auflösung wie jedes andere Vorkommen und trägt hinterher denselben `occurrenceKey`, dasselbe Versions-Token und dieselbe Exception-Kennzeichnung.
4. **`description` kommt in den Override-Vertrag, `all_day` nicht.** Ersteres ist reine Code-Arbeit — die Spalten-Doku nennt den Key längst. Zweiteres braucht einen `cal.edit.*`-Copy-Key und damit den Designer; es bleibt als Eintrag in `docs/TODO.md`.
5. **Der Vertrag bekommt ein eigenes Modul (`override.ts`).** Seit D2 hat er zwei Leser — die Auflösung in `expand.ts` und die Fensterweitung in `eventWindow.ts` —, und zwei Antworten auf „ist das überhaupt ein Datum?" liefen beim nächsten Fix auseinander.
6. **Ein unparsbarer Datumswert wird verworfen, nicht durchgereicht.** Dieselbe Antwort wie bei einer unbekannten Zone (Befund D, ADR-033): Ein Termin zur Regel-Zeit ist ungleich besser als ein leerer Kalender.
7. **Das Suchfenster einer angeforderten Occurrence deckt ihr Override-Intervall mit ab** — und nur ihres, nicht das jeder anderen Exception derselben Serie, sonst expandierte jeder Detail-Aufruf Jahre statt Tage.
8. **Die Tagesgrenzen-Rechnung zieht als `zonedDayBounds` nach `timezone.ts`.** Drittes Vorkommen, damit fällig nach der Repo-Regel. Sie liefert `null` statt zu werfen, weil die Aufrufer verschieden antworten müssen: `eventLookupWindow` fällt auf sein Standardfenster zurück, `endOfDayInstant` wirft — ein aus Müll abgeleitetes `until` kürzte eine Serie still am falschen Datum.
9. **Keine Datenmigration für Alt-Exceptions** (Spec §6.6). Zeilen, die unter dem alten Verhalten als zweite, wirkungslose Exception am aufgelösten Datum entstanden sind, bleiben wirkungslos: Ihr `occurrence_date` ist kein Vorkommen der Regel, Decision 2 hält sie draußen. Sie aufzuräumen bräuchte eine serverseitige RRULE-Auswertung, die es nicht gibt.

Die `### Consequences`:

- Welche Tests vor dem Fix rot waren (die vier aus Task 3 Step 2 und Task 4 Step 3, plus die vier aus Task 2 Step 2) und dass alle Suiten unter `Europe/Berlin`, `UTC` und `America/New_York` dieselbe Zahl liefern — die tatsächliche Zahl aus dem letzten Lauf eintragen, nicht die aus diesem Plan.
- Die beiden erledigten `docs/TODO.md`-Einträge namentlich, mit dem Hinweis, dass sie entfernt sind.
- Die neu entstandene Grenze aus Task 2 Step 8 (Override nur mit `start_at`).
- Dass Roadmap 1.3 damit vollständig ist und Block 1 (fünf PRs: #117 · #118 · #119 · #121 · dieser) abgeschlossen.
- Dass `all_day` als einziger Punkt des Override-Vertrags offen bleibt und 🎨-blockiert ist.

- [ ] **Step 2: `docs/roadmap.md` nachziehen**

1. In der Überschrift von Abschnitt **1.3** „**D1 erledigt, D2 offen**" ersetzen durch „**erledigt**".
2. Den D2-Unterpunkt umschreiben: aus der Problembeschreibung im Futur wird die Lösungsbeschreibung im Perfekt, mit Verweis auf ADR-035 — genau so, wie es der D1-Unterpunkt direkt darüber vormacht. Die drei Zusätze aus Spec §6.9 dabei benennen, damit der Umfang des PRs ablesbar bleibt.
3. In der Kopfzeile von Block 1 „**5 PRs (1.3 zählt doppelt: D1 gelandet, D2 offen)**" ersetzen durch „**5 PRs (1.3 zählt doppelt)**".
4. Die Anker-Verlinkung auf 1.3 prüfen: Ändert sich die Überschrift, ändert sich der Anker. `grep -n "13-das-override-modell" docs/` findet die Verweise — auch der in ADR-034s Consequences zeigt darauf. **Das ist eine rein editorische Reparatur eines toten Links, keine inhaltliche Änderung an ADR-034** und deshalb ausdrücklich erlaubt (CLAUDE.md → Documentation discipline).

- [ ] **Step 3: `CLAUDE.md` nachziehen**

In der Ordner-Landkarte unter `features/calendar/` die Zeilenliste um `override.ts` ergänzen und `expand.ts`/`timezone.ts` um ihre neue Fracht:

```
├─ calendar/             Queries · Mutations · RRULE-Expansion · Reminder · Pending-Deletes · Optimistic-Overlay
│                        · rrule.ts (Vertrag: `occurrencesBetween`/`allOccurrences`, wertet in Wandzeit aus, ADR-033)
│                        · timezone.ts (Instant↔Wandzeit-Umrechnung, `zonedDayBounds`) · deviceTimeZone.ts
│                        · override.ts (Vertrag von `event_exceptions.override`, ADR-035)
│                        · realtimeKeys.ts (Änderung → Query-Keys, ADR-030)
│                        · version.ts (Versions-Token, schlüsselt auf `occurrenceKey`, ADR-034) · conflict.ts (Feldvergleich, ADR-031)
```

Im Fließtext des Abschnitts „Tech stack (locked)" den Satz über den Occurrence-Schlüssel (ADR-034) um einen Satz zu ADR-035 ergänzen: dass die Kandidatenmenge seither auch `event_exceptions` einbezieht und `description` im Override-Vertrag steht.

- [ ] **Step 4: `docs/architecture.md` nachziehen**

Im Abschnitt zum Kalender-Datenfluss die Stelle, die `expandEvents` beschreibt, um die zweite Kandidatenquelle ergänzen. Zuerst `grep -n "expandEvents\|Kandidat\|occurrenceKey" docs/architecture.md`, um die richtige Stelle zu finden — den bestehenden Aufbau nicht umstellen, nur ergänzen.

- [ ] **Step 5: Grün und konsistent**

```bash
bun format:check && bun lint
grep -rn "applyOverride kennt \`description\`" docs/ || echo "TODO-Eintrag sauber entfernt"
grep -rn "Aus dem Fenster verschobene" docs/ || echo "TODO-Eintrag sauber entfernt"
```

Beide `grep` müssen ins Leere laufen. Finden sie noch etwas, ist ein Eintrag in Task 2/3 stehen geblieben — hier nachholen.

- [ ] **Step 6: Commit**

```bash
git add docs/decision-log.md docs/roadmap.md docs/architecture.md CLAUDE.md docs/TODO.md
git commit -m "docs(calendar): ADR-035 zum Override-Vertrag, Roadmap-Block 1 abschliessen"
```

---

## Abschluss des PRs

Nach Task 5 — nicht als eigener Task, sondern als Abschlussschritt des Controllers:

1. **Voller Durchlauf unter drei Zonen**, Zahlen vergleichen:

```bash
TZ=Europe/Berlin bun test && TZ=UTC bun test && TZ=America/New_York bun test
bun run typecheck && bun lint && bun format:check
```

2. **Lokaler CodeRabbit-Durchlauf vor dem Öffnen des PRs** (Spec §10, CLAUDE.md):

```bash
coderabbit review --base main
```

Findings abarbeiten oder bewusst mit Begründung verwerfen.

3. **Sichtprüfung am Simulator** — Web reicht nicht (der Termin-Löschpfad ist auf react-native-web nicht auslösbar, das ist Block 3). Der entscheidende Durchgang:
   - Serientermin anlegen, eine Occurrence mit Scope „Nur diesen" auf einen Tag **im Folgemonat** verschieben.
   - In den Folgemonat blättern: Der Termin **muss dort erscheinen**. Vor diesem PR war er an beiden Daten unsichtbar.
   - Ihn dort öffnen, die Beschreibung ändern, speichern, erneut öffnen: Die Beschreibung **muss stehen**. Vor diesem PR verschwand sie ohne Meldung.
   - In den Ursprungsmonat blättern: Er darf dort **nicht** zusätzlich erscheinen.

## Self-Review

**Spec-Abdeckung.** §6.2 → Task 3. §6.3 → Task 2. §6.5 Nr. 1/2/3/5/7 → Task 3; Nr. 4 (`occurrenceKey` vs. `occurrenceDate`) und Nr. 6 sind bereits durch D1 abgedeckt (`expand.test.ts` → „ein Override auf einen anderen Tag trennt die beiden"), Nr. 6 zusätzlich durch Task 2. Der von §6.5 geforderte `spans.test.ts`-Fall („beide Occurrences überleben die Gruppierung") **existiert bereits** aus D1 (`describe("groupSpans key identity (ADR-034)")`) — er wird hier nicht dupliziert, sondern durch Task 3 Schritt 5 im Regressionslauf mitgeführt. Ebenso der `version.test.ts`- und der `recurrence.test.ts`-Fall. §6.6 → Decision 9 in ADR-035, kein Code. §6.9 Nr. 1 → Task 2, Nr. 2 → Task 4, Nr. 3 → Task 1. §7 bleibt unangetastet.

**Platzhalter.** Keine. Jeder Code-Schritt trägt den Code, jeder Test die Assertions, jede Datei ihren Pfad. Die einzigen Stellen ohne wörtlichen Text sind Task 5 Steps 3 und 4 — dort steht, welche Aussage hinzukommt und mit welchem `grep` die Stelle zu finden ist, weil der umgebende Text sich bis dahin geändert haben kann.

**Typ-Konsistenz.** `zonedDayBounds(isoDate: string, timeZone: string): { start: Date; end: Date } | null` (T1) wird in T3 und T4 mit genau dieser Signatur gerufen. `overrideInterval(override: Json | null): { start: Date; end: Date } | null` (T2) ebenso in T3 und T4. `eventLookupWindow` wechselt in T4 von drei Positionsparametern auf `(row, occurrenceKey?)`; beide Aufrufer und alle acht Bestandstests wandern **in demselben Task** mit — eine Signaturänderung über zwei Tasks zu verteilen war der Planfehler, an dem der D1-Lauf einmal gescheitert ist.

**Task-Kollisionen.** `expand.ts` wird von T2 und T3 angefasst, `eventWindow.ts` von T1 und T4, `docs/TODO.md` von T2, T3 und T5 — jeweils sequenziell, nie gleichzeitig. Kein Task konsumiert etwas, das ein späterer erst erzeugt.
