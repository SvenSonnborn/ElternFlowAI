# Der CAS-Fall trägt seine Zeile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `createSupabaseEventOps.updateMaster` liest bei null getroffenen Zeilen die fremde Fassung nach, statt `EventConflictError(null)` zu werfen — damit wird `EventConflictError.row` nicht-nullable und der Compiler beweist, dass der Konflikt-Dialog immer eine frische Basis-Version hat.

**Architecture:** Dieselbe Nachlese, die `useUpdateTask` seit ADR-031 und `deleteTask` seit ADR-036 machen, überträgt sich vom Aufgaben- auf den Kalender-Pfad. Der zusätzliche Roundtrip fällt **ausschließlich im Fehlerfall** an. Die Typ-Verengung, die daraus folgt, ist der eigentliche Gewinn: Zwei defensive Zweige in zwei Screens verschwinden, und „Deine Fassung speichern" kann nicht mehr in eine Schleife gegen dieselbe veraltete `baseVersion` laufen.

**Tech Stack:** TypeScript ~6.0 strict · Supabase JS · `bun test` (Buns Runner, `bun:test`-Importe) · React Native 0.86

**Spec:** [docs/superpowers/specs/2026-09-17-tasks-delete-path-conflict-gaps-design.md](../specs/2026-09-17-tasks-delete-path-conflict-gaps-design.md) — **§4** ist dieser PR. §1.3 begründet die Richtung (die Aufgaben machen dem Kalender diese Nachlese seit ADR-031 vor), §8 Decision 7 die Verengung.

**Roadmap:** [docs/roadmap.md](../../roadmap.md) → Block 2, Punkt **2.2b** („Der Compare-and-Swap-Fall zeigt den Dialog ohne Vergleichszeilen und ohne frische Basis-Version").

## Global Constraints

- **Handoff-Bundle ist tabu**: `design-system/{colors,typography,spacing,themes,components,index}.ts`, `docs/{HANDOFF,COPY,ICONS,README}.md`, `patterns/*.md`. Dieser PR fasst keine davon an und braucht **keinen neuen Copy-Key** — jede Zeichenkette, die die Oberfläche zeigt, existiert bereits.
- **Kein `Co-Authored-By: Claude`-Trailer** in irgendeinem Commit.
- **Pre-Commit-Hooks (`lint-staged`) niemals mit `--no-verify` umgehen.**
- **Jede neue oder umgeschriebene exportierte Funktion/Konstante bekommt einen JSDoc-Block im selben Commit** — und zwar das Nicht-Offensichtliche (warum so gebaut, welcher Grenzfall, welcher ADR), nicht die Wiederholung des Namens.
- **Testrunner ist `bun test`**, nicht `jest`. Testdateien importieren aus `bun:test`.
- **Deutsche Testnamen und deutsche Kommentare**, wie im Bestand.
- **Gates vor jedem Commit grün**: `bun run typecheck`, `bun lint`, `bun test`, `bun format:check`.
- **Baseline dieses Branches:** 812 pass · 1 todo · 0 fail über 70 Dateien. Jede Task-Meldung nennt die Zahlen.

---

### Task 1: `updateMaster` liest die fremde Zeile nach

**Files:**

- Modify: `features/calendar/queries.ts:9` (`const SELECT` → `export const EVENT_SELECT`)
- Modify: `features/calendar/recurrence.test.ts:615-712` (Fake-Client + Tests)
- Modify: `features/calendar/recurrence.ts:397-410` (`updateMaster`)

**Interfaces:**

- Produces: `EVENT_SELECT` aus `features/calendar/queries.ts` — der Spaltenstring `"*, event_types(*), event_exceptions(*)"`, den `EventWithRelations` verlangt.
- Produces: `updateMaster` wirft bei null Zeilen `EventConflictError(current)` mit der frisch gelesenen Zeile, oder `EventNotFoundError(eventId)`, wenn auch die Nachlese leer ist.
- Consumes: nichts aus früheren Tasks.

**Kontext, der nicht im Diff steht:**

- `EVENT_SELECT` hieß bisher `SELECT` und war modul-privat. Der Name `SELECT` sagt außerhalb seiner Datei nichts mehr — daher die Umbenennung beim Export. Dasselbe ist in PR 1 mit `TASK_SELECT` in `features/tasks/queries.ts` passiert; das ist die Vorlage.
- **Gemessen, nicht vermutet:** `features/calendar/queries.ts` lädt unter `bun test` sauber, obwohl es `supabase` aus `@/features/supabase` zieht und die Client-Factory bei fehlenden ENV-Variablen beim Modul-Load wirft. Lokal kommen sie aus `.env.local` über mise, in CI aus dem `env:`-Block von `ci.yml`. `features/calendar/mutations.test.ts` lädt denselben Pfad heute schon transitiv und ist grün — der neue Import aus `recurrence.ts` fügt also kein neues Risiko hinzu. Es gibt auch keinen Zyklus: `queries.ts` importiert `recurrence.ts` nicht.
- Der bestehende Test **„maybeSingle liefert keine Zeile → EventConflictError, nicht die fremde Fassung"** (`recurrence.test.ts:676`) hält die **alte** Zusicherung fest (`row` ist `null`). Er wird nicht gelöscht, sondern **umgedreht** — er ist der rote Test dieses Tasks.

- [ ] **Step 1: `EVENT_SELECT` exportieren**

In `features/calendar/queries.ts` Zeile 9 ersetzen:

```ts
/**
 * Die Spalten, die `EventWithRelations` verlangt — beide gehören zusammen:
 * Fehlt hier eine Relation, ist der Typ eine Lüge, und `expandEvents` liest
 * `event_exceptions` ins Leere.
 *
 * Exportiert (und damit umbenannt — `SELECT` sagt außerhalb dieser Datei
 * nichts), seit `createSupabaseEventOps.updateMaster` im Konfliktfall
 * dieselbe Zeile nachliest, die auch die Queries laden. Ein zweiter,
 * handgeführter Spaltenstring dort wäre genau die Divergenz, die
 * `EventWithRelations` unbemerkt falsch werden ließe.
 */
export const EVENT_SELECT = "*, event_types(*), event_exceptions(*)";
```

Und die beiden Verwendungsstellen (`queries.ts:35` und `:43`) von `SELECT` auf `EVENT_SELECT` umstellen.

- [ ] **Step 2: Fake-Client um die Nachlese erweitern**

In `features/calendar/recurrence.test.ts` die Funktion `fakeUpdateClient` (ab Zeile ~630) **ersetzen** durch:

```ts
/**
 * Doppelgänger des Query-Builders, den `updateMaster` durchläuft — inzwischen
 * zwei Ketten statt einer: erst `.from().update().eq().eq().select().maybeSingle()`
 * (das Compare-and-Swap), im Konfliktfall dann `.from().select().eq().maybeSingle()`
 * (die Nachlese). Beide hängen an demselben `from()`, unterscheiden sich aber
 * an der ersten Methode — `update()` gegen `select()` —, und genau daran
 * trennt der Fake sie.
 *
 * `calls.rereadColumns === null` heißt: die Nachlese hat nicht stattgefunden.
 * Das ist die Zusicherung, die den Preis dieser Änderung festhält — ein
 * zusätzlicher Roundtrip ausschließlich im Fehlerfall.
 *
 * Kein `mock.module`: `createSupabaseEventOps` nimmt den Client als Parameter,
 * genau damit ein Test ihn ersetzen kann — gleiches Muster wie `fakeClient` in
 * `features/realtime/subscribe.test.ts`.
 */
function fakeUpdateClient(
  result: { data: { id: string } | null; error: unknown },
  reread: { data: EventWithRelations | null; error: unknown } = { data: null, error: null },
) {
  const calls = {
    table: "",
    updatePayload: undefined as unknown,
    eqCalls: [] as [string, unknown][],
    selectColumns: "",
    rereadColumns: null as string | null,
    rereadEqCalls: [] as [string, unknown][],
  };
  const updateBuilder = {
    eq(column: string, value: unknown) {
      calls.eqCalls.push([column, value]);
      return updateBuilder;
    },
    select(columns: string) {
      calls.selectColumns = columns;
      return updateBuilder;
    },
    maybeSingle: () => Promise.resolve(result),
  };
  const rereadBuilder = {
    eq(column: string, value: unknown) {
      calls.rereadEqCalls.push([column, value]);
      return rereadBuilder;
    },
    maybeSingle: () => Promise.resolve(reread),
  };
  const client = {
    from(table: string) {
      calls.table = table;
      return {
        update(payload: unknown) {
          calls.updatePayload = payload;
          return updateBuilder;
        },
        select(columns: string) {
          calls.rereadColumns = columns;
          return rereadBuilder;
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, calls };
}

/**
 * Die fremde Fassung, wie die Nachlese sie liefert — `EventRow` plus Relationen.
 * `updated_at` weicht bewusst von `MASTER_UPDATED_AT` ab: Genau das ist der
 * Zustand, den das Compare-and-Swap erkannt hat.
 */
function makeForeignRow(): EventWithRelations {
  return {
    ...makeMaster({ title: "Fremd geändert", updated_at: "2026-05-02T09:00:00.000Z" }),
    event_types: null,
    event_exceptions: null,
  };
}
```

Dazu die nötigen Importe oben in der Datei ergänzen:

```ts
import type { EventWithRelations } from "./expand";
```

und `EventNotFoundError` in den bestehenden Import aus `./errors` aufnehmen:

```ts
import { EventConflictError, EventNotFoundError } from "./errors";
```

Sowie `EVENT_SELECT` für die Spalten-Assertion:

```ts
import { EVENT_SELECT } from "./queries";
```

- [ ] **Step 3: Die vier Tests schreiben**

Den bestehenden Test **„maybeSingle liefert keine Zeile → EventConflictError, nicht die fremde Fassung"** (samt seines Kommentars) durch diese vier ersetzen; die drei übrigen Tests der `describe("createSupabaseEventOps")`-Suite bleiben unangetastet:

```ts
test("null Zeilen → EventConflictError MIT der fremden Fassung", async () => {
  const foreign = makeForeignRow();
  const { client, calls } = fakeUpdateClient(
    { data: null, error: null },
    { data: foreign, error: null },
  );
  const ops = createSupabaseEventOps(client);

  const error = await ops
    .updateMaster("evt-1", CHANGES, SEEN_UPDATED_AT)
    .catch((err: unknown) => err);

  // Vorher warf diese Stelle `EventConflictError(null)`: bekannt war nur,
  // *dass* jemand dazwischengeschrieben hat, nicht *was*. Der Dialog stand
  // dann ohne Vergleichszeilen und ohne frische Basis-Version da.
  expect(error).toBeInstanceOf(EventConflictError);
  expect((error as EventConflictError).row).toEqual(foreign);
  // Die Nachlese muss dieselben Spalten holen wie die Queries — sonst ist
  // die Zeile, die `showConflict` an `expandEvents` weitergibt, unvollständig.
  expect(calls.rereadColumns).toBe(EVENT_SELECT);
  expect(calls.rereadEqCalls).toEqual([["id", "evt-1"]]);
});

test("null Zeilen und die Zeile ist weg → EventNotFoundError, kein Konflikt", async () => {
  const { client } = fakeUpdateClient({ data: null, error: null }, { data: null, error: null });
  const ops = createSupabaseEventOps(client);

  const error = await ops
    .updateMaster("evt-1", CHANGES, SEEN_UPDATED_AT)
    .catch((err: unknown) => err);

  // „Weg" und „geändert" sind verschiedene Meldungen — dieselbe Trennung,
  // die der Pre-Flight in `mutations.ts` macht.
  expect(error).toBeInstanceOf(EventNotFoundError);
});

test("Treffer → keine Nachlese", async () => {
  const { client, calls } = fakeUpdateClient({ data: { id: "evt-1" }, error: null });
  const ops = createSupabaseEventOps(client);

  await ops.updateMaster("evt-1", CHANGES, SEEN_UPDATED_AT);

  // Der Preis dieser Änderung, festgehalten: ein zusätzlicher Roundtrip
  // ausschließlich im Fehlerfall. Im Normalfall kostet sie nichts.
  expect(calls.rereadColumns).toBeNull();
});

test("ein Fehler bei der Nachlese wird durchgereicht, nicht als Konflikt maskiert", async () => {
  const pgError = { message: "connection reset", code: "08006" };
  const { client } = fakeUpdateClient({ data: null, error: null }, { data: null, error: pgError });
  const ops = createSupabaseEventOps(client);

  const error = await ops
    .updateMaster("evt-1", CHANGES, SEEN_UPDATED_AT)
    .catch((err: unknown) => err);

  // Ein abgerissenes Netz darf nicht als „jemand anderes war schneller"
  // erscheinen — der Nutzer bekäme einen Vergleichs-Dialog für ein Problem,
  // das keiner ist.
  expect(error).toBe(pgError);
});
```

- [ ] **Step 4: Rot vorführen**

Run: `bun test features/calendar/recurrence.test.ts`

Erwartet: **3 Fehlschläge** — „null Zeilen → EventConflictError MIT der fremden Fassung" (`row` ist `null`, `rereadColumns` ist `null`), „null Zeilen und die Zeile ist weg → EventNotFoundError" (wirft `EventConflictError`) und „ein Fehler bei der Nachlese wird durchgereicht" (wirft `EventConflictError` statt `pgError`). „Treffer → keine Nachlese" ist schon grün — er hält den Normalfall fest, den dieser Fix nicht ändern darf.

Die Ausgabe (Zahlen + Namen der roten Tests) gehört in den Report.

- [ ] **Step 5: Die Nachlese implementieren**

In `features/calendar/recurrence.ts` den Import ergänzen:

```ts
import { EventConflictError, EventNotFoundError } from "./errors";
import { EVENT_SELECT } from "./queries";
```

(Die Import-Reihenfolge richtet sich nach der bestehenden ESLint-Sortierung der Datei — `bun lint:fix` sortiert notfalls nach.)

Dann `updateMaster` (Zeile ~397) ersetzen:

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
      if (data) return;

      // Null Zeilen heißt: zwischen dem Lesen und diesem Schreiben hat jemand
      // die Zeile angefasst oder gelöscht. Welches von beidem, sagt erst die
      // Nachlese — und *was* er geändert hat, braucht der Vergleichs-Dialog,
      // sonst steht er ohne Zeilen und ohne frische Basis-Version da und
      // „Deine Fassung speichern" schickt zwangsläufig wieder dieselbe
      // veraltete `baseVersion`. Derselbe Ablauf wie in `updateTask`
      // (ADR-031) und `deleteTask` (ADR-036); der zusätzliche Roundtrip fällt
      // ausschließlich hier im Fehlerfall an.
      const { data: current, error: readError } = await client
        .from("events")
        .select(EVENT_SELECT)
        .eq("id", eventId)
        .maybeSingle();
      if (readError) throw readError;
      if (!current) throw new EventNotFoundError(eventId);
      throw new EventConflictError(current);
    },
```

- [ ] **Step 6: Grün vorführen**

Run: `bun test features/calendar/recurrence.test.ts` → alle grün.
Run: `bun run typecheck && bun lint && bun test && bun format:check` → alle grün, 815 pass erwartet (812 + 3 neue; einer der vier ersetzt einen bestehenden).

- [ ] **Step 7: Commit**

```bash
git add features/calendar/queries.ts features/calendar/recurrence.ts features/calendar/recurrence.test.ts
git commit -m "fix(calendar): updateMaster liest die fremde Fassung nach statt null zu werfen"
```

---

### Task 2: `EventConflictError.row` wird nicht-nullable

**Files:**

- Modify: `features/calendar/errors.ts` (Konstruktor-Signatur + Docstring)
- Modify: `features/calendar/errors.test.ts:19` (die eine `new EventConflictError(null)`-Stelle)
- Modify: `app-sections/event/EventEditScreen.tsx` (`showConflict`)
- Modify: `app-sections/event/EventDetailScreen.tsx:186` (`errorAction`)
- Modify: `app-sections/shared/conflictStore.ts:52` (Kommentar an `ShowConflictOptions.rows`)
- Modify: `docs/TODO.md` (den erledigten Eintrag löschen)

**Interfaces:**

- Consumes: `updateMaster` wirft seit Task 1 nie mehr `EventConflictError(null)`.
- Produces: `EventConflictError.row: EventWithRelations` — nicht mehr nullable.

**Kontext, der nicht im Diff steht:**

- Die Verengung braucht **keinen eigenen Test**: Sie ist eine Compiler-Aussage, und `bun run typecheck` ist ihr Prüfer.
- **Achtung, gemessen — der Compiler findet nur die halbe Arbeit.** Probeweise verengt und `tsc --noEmit` laufen lassen: gemeldet werden **ausschließlich die beiden Stellen, die `null` übergeben** (`recurrence.ts:409`, in Task 1 schon weg, und `errors.test.ts:19`). Die drei Stellen, die auf `null` **prüfen** — `if (row)` und der `row ? … : vars.baseVersion`-Rückfall in `EventEditScreen`, `!err.row` in `EventDetailScreen` — meldet **niemand**: `@typescript-eslint/no-unnecessary-condition` steckt in `strictTypeChecked`, `eslint.config.js` lädt aber nur `recommendedTypeChecked`. Ein nachgeprüfter `bunx eslint` auf die drei Dateien war leer. Wer sich hier auf den Compiler verlässt, repariert eine Testdatei und hält den Task für fertig — die toten Zweige, deren Beseitigung der eigentliche Zweck ist (Spec §4.2), blieben stehen. **Deshalb zählt dieser Plan sie unten einzeln und wörtlich auf.**
- **`theirs` kann weiterhin `null` sein** — dann nämlich, wenn die Occurrence außerhalb des Suchfensters liegt. Dieser Zweig bleibt und behält seinen Sinn. Genau diese Unterscheidung war vorher unter dem gemeinsamen `null` begraben: `row === null` (CAS kannte die Fassung nicht) und `theirs === null` (Fassung bekannt, Occurrence nicht gefunden) sahen im Code gleich aus, waren aber verschiedene Zustände mit verschiedenen Möglichkeiten.
- Gemessen: **vier** Stellen im Repo konstruieren oder prüfen `EventConflictError` auf `null` — `recurrence.ts:409` (in Task 1 erledigt), `errors.test.ts:19`, `EventDetailScreen.tsx:186`, `EventEditScreen.tsx:346-436`. Dazu **ein Kommentar** in `conflictStore.ts:52`, den der Compiler _nicht_ findet.

- [ ] **Step 1: Den Typ verengen**

In `features/calendar/errors.ts` den Docstring-Absatz zu `row` und die Signatur ersetzen:

```ts
/**
 * Jemand anderes hat den Termin geändert, seit dieses Formular ihn geladen hat.
 *
 * Trägt die fremde Fassung mit, damit der Screen sie ohne zweiten Roundtrip
 * mit `expandEvents` auflösen und Feld für Feld gegen die eigene Eingabe
 * stellen kann — genau das, was der Vergleichs-Dialog zeigt (ADR-031).
 *
 * `row` ist **nicht** nullable, und das ist eine Zusicherung, kein Zufall:
 * Beide Wege hierher liefern die Zeile — der Pre-Flight in `mutations.ts` den
 * gerade geladenen Master, das Compare-and-Swap in `updateMaster` seit
 * ADR-037 eine Nachlese. Damit beweist der Compiler, was der Dialog braucht:
 * eine frische Basis-Version für „Deine Fassung speichern". Vorher konnte der
 * CAS-Fall `null` liefern, und der Wiederholungsversuch lief zwangsläufig
 * gegen dieselbe veraltete `baseVersion` — bis zum nächsten Refetch.
 */
export class EventConflictError extends Error {
  constructor(readonly row: EventWithRelations) {
    super("Event was modified by someone else");
    this.name = "EventConflictError";
  }
}
```

- [ ] **Step 2: Den Compiler das melden lassen, was er sieht**

Run: `bun run typecheck`
Erwartet: **genau ein** Fehler, `TS2345` an `features/calendar/errors.test.ts:19` („Argument of type 'null' is not assignable to parameter of type 'EventWithRelations'"). Mehr nicht — siehe die Messung im Kontext oben. Die Ausgabe gehört in den Report; weicht sie ab (mehr oder weniger Fehler), ist das eine Meldung wert, bevor es weitergeht.

- [ ] **Step 3: `errors.test.ts` auf eine echte Zeile umstellen**

`features/calendar/errors.test.ts:19` — statt `null` eine minimale Zeile. Oben in der Datei ergänzen:

```ts
import type { EventWithRelations } from "./expand";

/**
 * Minimal, aber vollständig: `mapEventError` liest aus dem Fehler nur `name`,
 * die Zeile ist hier reines Typ-Futter. Ein `as` wäre die kürzere Lüge —
 * dieser Test soll bemerken, wenn `EventWithRelations` wächst.
 */
const ROW: EventWithRelations = {
  id: "evt-1",
  family_id: "fam-1",
  type_id: "type-1",
  child_id: null,
  parent_id: null,
  title: "Termin",
  description: null,
  location: null,
  start_at: "2026-05-04T16:30:00.000Z",
  end_at: "2026-05-04T17:30:00.000Z",
  all_day: false,
  timezone: "Europe/Berlin",
  rrule_freq: null,
  rrule_interval: 1,
  rrule_byweekday: null,
  rrule_until: null,
  rrule_count: null,
  created_by: null,
  created_at: "2026-04-20T00:00:00.000Z",
  updated_at: "2026-05-01T00:00:00.000Z",
  event_types: null,
  event_exceptions: null,
};
```

und Zeile 19 zu:

```ts
expect(mapEventError(new EventConflictError(ROW))).toBe("cal.error.conflict");
```

- [ ] **Step 4: `EventDetailScreen.errorAction` geradeziehen**

`app-sections/event/EventDetailScreen.tsx:186`:

```ts
if (!(err instanceof EventConflictError)) return undefined;
```

(Die zweite Hälfte `|| !err.row` entfällt ersatzlos. Der Kommentarblock darüber bleibt unverändert — er beschreibt weiterhin korrekt, warum „Trotzdem löschen" statt eines Dialogs erscheint.)

- [ ] **Step 5: `showConflict` geradeziehen**

`app-sections/event/EventEditScreen.tsx`. Vier zusammenhängende Änderungen innerhalb der Funktion:

**(a)** Den `row`-Block (ab dem Kommentar „Kein `row` heißt: …") ersetzen. Der einleitende Kommentar entfällt, das `let`/`if (row)` wird zu einer Zuweisung:

```ts
// Fenster wie `useEvent` (`features/calendar/hooks.ts`): an der Zeile
// selbst verankert und um das angeforderte Datum geweitet — nicht an
// den geänderten Eingabewerten aus `vars.changes`. Sonst fiele jede
// Verschiebung des Termins um mehr als seine eigene Dauer (ein
// anderer Tag, mehrere Stunden) aus dem Fenster, und `theirs` würde
// `null`, obwohl die fremde Fassung bekannt ist — ausgerechnet beim
// häufigsten echten Konfliktfall („wir haben beide verschoben").
// Dieselbe Begründung wie dort: eine weit in der Zukunft liegende
// Occurrence (>1 Jahr) würde sonst abgeschnitten. Die Zonenbehandlung
// muss dabei zonen-genau sein: `eventLookupWindow` bildet Tagesanfang
// und -ende des angeforderten Regel-Tags in `row.timezone`, nicht in
// der Zone des Lesers — ein lokal gebildetes Fenster kann eine
// Occurrence nahe Mitternacht in `row.timezone` verfehlen, `theirs`
// würde `null`, obwohl die fremde Fassung bekannt ist (Befund B,
// PR #121). Seit ADR-035 deckt das Fenster außerdem das
// Override-Intervall der angeforderten Occurrence ab.
const row = err.row;
const { start: windowStart, end: windowEnd } = eventLookupWindow(row, vars.occurrenceKey);
// Match auf `occurrenceKey`: Nur der Schlüssel identifiziert dieselbe
// Occurrence zuverlässig, wenn eine Verschiebung ihn vom aufgelösten
// Anzeigedatum hat auseinanderlaufen lassen (ADR-034) — derselbe Grund
// wie beim `find` in `useEvent` (`features/calendar/hooks.ts`).
const theirs: CalendarOccurrence | null =
  expandEvents([row], windowStart, windowEnd, theme).find(
    (o) => o.occurrenceKey === vars.occurrenceKey,
  ) ?? null;
```

**(b)** Der Kommentarblock über `const fields` schließt heute mit einem Satz über den `row === null`-Fall. Dieser letzte Satz („Genau die Überlegung, die den `row === null`-Fall (`theirs === null`) schon heute in den Dialog statt ins Durchspeichern schickt.") wird ersetzt durch:

```ts
// Genau die Überlegung, die auch `theirs === null` (Occurrence außerhalb
// des Suchfensters) in den Dialog statt ins Durchspeichern schickt.
```

**(c)** Der Kommentar in `onKeepMine` wird auf den einen verbliebenen Fall eingedampft:

```ts
        onKeepMine: () => {
          save({
            ...vars,
            // `theirs` fehlt nur noch aus einem Grund: die fremde Fassung lag
            // außerhalb des Suchfensters. `row` ist seit ADR-037 immer da, die
            // frische Version also immer berechenbar — ohne erneut zu
            // expandieren. Der tote Rückfall auf `vars.baseVersion`, der diesen
            // Versuch zwangsläufig erneut kollidieren ließ, ist damit weg.
            baseVersion: theirs?.version ?? occurrenceVersion(row, vars.occurrenceKey),
          });
        },
```

**(d)** Der `rows: theirs === null ? [] : fields.map(…)` bleibt **unverändert** — `theirs` kann weiterhin `null` sein.

- [ ] **Step 6: Den Kommentar in `conflictStore.ts` nachziehen**

`app-sections/shared/conflictStore.ts:50-54` — der Kommentar nennt einen Zustand, den es nach dieser Änderung nicht mehr gibt:

```ts
/**
 * Leer heißt nicht „kein Dialog" — das entscheidet der Aufrufer, bevor er
 * hierher kommt. Leer heißt: die fremde Fassung liegt vor, aber die
 * betroffene Occurrence lag außerhalb des Suchfensters, es gibt also nichts
 * zu vergleichen. Bis ADR-037 hieß leer auch noch „der Compare-and-Swap
 * kennt die fremde Fassung gar nicht" — dieser Fall existiert nicht mehr.
 */
```

- [ ] **Step 7: Gates**

Run: `bun run typecheck && bun lint && bun test && bun format:check` → alle grün. Testzahl unverändert gegenüber Task 1 (815 pass).

Laufen die Kalender-Suiten zusätzlich unter zwei fremden Zonen mit identischem Ergebnis (Spec §9):

```bash
TZ=UTC bun test features/calendar
TZ=America/New_York bun test features/calendar
```

- [ ] **Step 8: `docs/TODO.md` pflegen — einen Eintrag löschen, einen anlegen**

**Löschen:** den Eintrag **„Der Compare-and-Swap-Fall zeigt den Dialog ohne Vergleichszeilen und ohne frische Basis-Version"** — er steht im Abschnitt **`## Calendar (V1 …)`** (nachgeprüft: Zeile 24, nicht im Abschnitt „Conflict-Detection", wie man vermuten würde) und ist **eine** sehr lange Zeile. **Vollständig entfernen**, nicht abhaken. Der Eintrag direkt darüber („Eine reine Änderung der Wiederholungsregel …") bleibt: Der ist PR 3.

**Anlegen** im Abschnitt **`## Weitere Out-of-Scope-Items`** (der Catch-all; einen Tooling- oder CI-Abschnitt gibt es nicht): Der Linter meldet keine überflüssigen Null-Prüfungen. `eslint.config.js` lädt `tseslint.configs.recommendedTypeChecked`; `@typescript-eslint/no-unnecessary-condition` steckt in `strictTypeChecked` und ist damit aus. Genau in diesem PR nachgemessen: Nach der Verengung von `EventConflictError.row` meldete `tsc` nur die zwei Stellen, die `null` **übergeben** — die drei Stellen, die auf `null` **prüfen**, blieben in Compiler _und_ Linter stumm und mussten von Hand gefunden werden. Die Regel einzuschalten ist kein Einzeiler (sie schlägt repo-weit an und braucht einen eigenen Durchgang), deshalb vertagt; der Eintrag hält fest, dass Typ-Verengungen hier ihre toten Zweige nicht selbst aufzeigen. Format: ein Spiegelstrich, mit Verweis auf [eslint.config.js](../eslint.config.js) und den Grund.

- [ ] **Step 9: Commit**

```bash
git add features/calendar/errors.ts features/calendar/errors.test.ts \
  app-sections/event/EventEditScreen.tsx app-sections/event/EventDetailScreen.tsx \
  app-sections/shared/conflictStore.ts docs/TODO.md
git commit -m "refactor(calendar): EventConflictError.row ist nicht mehr nullable"
```

---

### Task 3: Dokumentation

**Files:**

- Modify: `docs/decision-log.md` (ADR-037 anhängen, ans Dateiende)
- Modify: `docs/roadmap.md` (Block 2, Punkt 2.2 — der zweite Spiegelstrich)
- Modify: `CLAUDE.md` (der Conflict-Detection-Satz im Tech-Stack-Absatz)
- Modify: `docs/superpowers/specs/2026-09-17-tasks-delete-path-conflict-gaps-design.md` (Kopfzeile: ADR-Nummerierung)

**Kontext, der nicht im Diff steht — eine Abweichung von der Spec:**

Die Spec kündigt im Kopf **einen** ADR-037 für PR 2 **und** PR 3 an. Das geht nicht: PR 2 merged vor PR 3, ADR-037 wäre dann Historie, und CLAUDE.md verbietet das Umschreiben älterer ADRs. Also **ADR-037 für diesen PR** (die Nachlese + die Verengung), **ADR-038 für PR 3** (die Regel im Vergleich). Das ist ohnehin der sauberere Schnitt — es sind zwei Verträge: einer über das, was ein Konflikt-Fehler mitträgt, einer über das Vokabular des Vergleichs. Die Kopfzeile der Spec wird entsprechend korrigiert (eine Planungsangabe, keine Entscheidung — Korrektur an Ort und Stelle, kein ablösender ADR).

- [ ] **Step 1: ADR-037 anhängen**

Ans Ende von `docs/decision-log.md`, im Format der Nachbarn (`## ADR-0NN — Titel (Datum)`, dann Kontext, nummerierte Decisions, Consequences). Inhalt:

- **Kontext**: `updateMaster`s Compare-and-Swap wusste, _dass_ jemand dazwischengeschrieben hatte, nicht _was_. Der Dialog erschien dann ohne Vergleichszeilen **und** ohne frische Basis-Version — „Deine Fassung speichern" schickte zwangsläufig dieselbe veraltete `baseVersion` und scheiterte erneut, bis der nächste Refetch durch war. Seltener Fall (verlangt einen fremden Schreibvorgang exakt zwischen dem Pre-Flight-Fetch in `updateEvent` und dem CAS in `updateMaster`), aber ein sackgassenartiger.
- **Decision 1**: Die Nachlese bei null Zeilen — dieselbe, die `updateTask` seit ADR-031 und `deleteTask` seit ADR-036 machen. Der Kalender erbt sie von den Aufgaben; die Gegenrichtung war PR 1.
- **Decision 2**: Der zusätzliche Roundtrip fällt ausschließlich im Fehlerfall an, festgehalten im Test „Treffer → keine Nachlese".
- **Decision 3**: Leere Nachlese heißt `EventNotFoundError`, nicht `EventConflictError` — „weg" und „geändert" sind verschiedene Meldungen, dieselbe Trennung wie im Pre-Flight.
- **Decision 4**: `EVENT_SELECT` wird exportiert statt in `recurrence.ts` neu geschrieben. Ein zweiter, handgeführter Spaltenstring ließe `EventWithRelations` unbemerkt falsch werden. Vorlage: `TASK_SELECT` aus ADR-036.
- **Decision 5**: `EventConflictError.row` wird nicht-nullable. Der Compiler beweist, was der TODO-Eintrag forderte; zwei defensive Zweige, die kein Test je erreichen konnte, verschwinden.
- **Decision 6**: `theirs` bleibt nullable. Occurrence außerhalb des Suchfensters ist ein anderer Zustand als „Fassung unbekannt" — vorher lagen beide unter demselben `null`, jetzt ist nur noch einer davon möglich und er ist behandelbar (`row` ist da, die Version also berechenbar).
- **Consequences**: Der zeilenlose Dialog verschwindet nicht — es bleiben drei Auslöser (Occurrence außerhalb des Suchfensters, fehlende hydrierte Basis, erschöpftes Auto-Retry-Limit) —, aber er hat jetzt in jedem Fall eine frische Basis-Version; was verschwindet, ist der eine Auslöser, bei dem die fremde Fassung unbekannt war. Zwei Grenzen bleiben benannt: (a) „Fünf Schreib-Ops laufen ohne bedingte Versionsprüfung" (`docs/TODO.md`) — `deleteMaster`, `modifyOccurrence`, `cancelOccurrence`, `setRruleCount` und `setRruleUntil` schreiben weiterhin unbedingt, das ist Block 7; (b) die Verengung hat ihre eigenen toten Zweige nicht aufgezeigt — `no-unnecessary-condition` ist im Repo aus, sie mussten von Hand gefunden werden (neuer TODO-Eintrag). Ergänzt ADR-031, löst nichts ab.

- [ ] **Step 2: Roadmap**

In `docs/roadmap.md`, Abschnitt **2.2**, den zweiten Spiegelstrich („Der Compare-and-Swap-Fall zeigt den Dialog …") als erledigt markieren — Muster von 2.1 übernehmen: der Spiegelstrich bleibt stehen, darunter ein kurzer Absatz **„Umgesetzt als ADR-037."** mit dem Ergebnis. Der erste Spiegelstrich (die Wiederholungsregel) bleibt offen; die Überschrift `### 2.2` bleibt deshalb **ohne** „erledigt", bis PR 3 landet.

- [ ] **Step 3: CLAUDE.md**

Im Tech-Stack-Absatz (Supabase, der lange Absatz um Zeile 71) diese Teilzeichenkette:

```text
der Kalender prüft die Version im Pre-Flight und sichert `updateMaster` per Compare-and-Swap ab, Aufgaben genau umgekehrt
```

ersetzen durch:

```text
der Kalender prüft die Version im Pre-Flight und sichert `updateMaster` per Compare-and-Swap ab — das seit [ADR-037](docs/decision-log.md) bei null getroffenen Zeilen die fremde Fassung nachliest, weshalb `EventConflictError.row` nicht mehr `null` sein kann —, Aufgaben genau umgekehrt
```

Sonst nichts an diesem Absatz; er ist bereits sehr lang.

- [ ] **Step 4: Spec-Kopfzeile korrigieren**

In `docs/superpowers/specs/2026-09-17-tasks-delete-path-conflict-gaps-design.md`, Zeile „**Decision-Log:** zwei ADRs nach Implementation …": aus `037 die zwei von ADR-031 offen gelassenen Löcher (PR 2 + PR 3)` werden **drei** ADRs — 036 (PR 1), 037 (PR 2), 038 (PR 3) — mit der Begründung aus dem Kontext dieses Tasks in einem Halbsatz.

- [ ] **Step 5: Gates + Commit**

Run: `bun format:check` (die Doku-Dateien laufen durch Prettier) — bei Bedarf `bun format`.

```bash
git add docs/decision-log.md docs/roadmap.md CLAUDE.md \
  docs/superpowers/specs/2026-09-17-tasks-delete-path-conflict-gaps-design.md
git commit -m "docs(calendar): ADR-037 zur Nachlese im CAS-Fall, Roadmap 2.2b abschliessen"
```

---

## Definition of Done (aus Spec §9)

- [x] Ein Regressionstest, der **vor** dem Fix rot ist — Task 1 Step 4, vorgeführt statt behauptet.
- [ ] `bun run typecheck`, `bun lint`, `bun test`, `bun format:check` grün.
- [ ] Die Kalender-Suiten laufen unter `Europe/Berlin`, `UTC` und `America/New_York` mit identischem Ergebnis.
- [ ] `docs/TODO.md` im selben Commit gepflegt (Task 2 Step 8): ein Eintrag gelöscht, **ein neuer angelegt** — die fehlende `no-unnecessary-condition`-Regel, gefunden beim Verengen. Die Grenzen aus Spec §6 gehören dagegen zu PR 1 (erledigt) und PR 3, nicht hierher.
- [ ] Jede neue exportierte Konstante mit JSDoc-Block (`EVENT_SELECT`).
- [ ] Lokaler CodeRabbit-Durchlauf (`coderabbit review --base main`) vor dem Öffnen des PRs.
