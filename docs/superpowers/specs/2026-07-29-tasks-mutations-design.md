# Spec · Tasks-Mutations

**Datum:** 2026-07-29 · **Branch:** `feat/tasks-mutations` · **Status:** freigegeben

## Ziel

Der Tasks-Layer wird schreibfähig: `useCreateTask`, `useUpdateTask`,
`useDeleteTask`, `useToggleTaskDone`. Drei davon aktualisieren den Cache
optimistisch. Fehler werden klassifiziert, aber nicht dargestellt — das bleibt
Sache des Screens.

Baut auf dem lesenden Layer aus
[2026-07-29-tasks-data-layer-design.md](./2026-07-29-tasks-data-layer-design.md)
auf.

## Scope

**Drin:** die vier Mutations, Optimistic Updates für Toggle/Update/Delete,
`mapTaskError`, `useTaskTypes`, vier neue i18n-Keys, Unit-Tests für die reinen
Module.

**Bewusst draußen:**

- **Screen-Rewire.** [AufgabenScreen](<../../../app-sections/(tabs)/aufgaben/AufgabenScreen.tsx>)
  bleibt auf `@/features/sample-data`. Der Eintrag in `docs/TODO.md` bleibt
  stehen.
- **Toast-Komponente.** Es gibt keine; `Alert.alert` ist die Konvention des
  Repos. Der offene Toast-Eintrag in `docs/TODO.md` bleibt stehen.
- **Realtime, Undo-nach-Delete.** Eigene Iterationen, stehen bereits im
  Backlog.

Keine Migration, kein Types-Regen, kein Eingriff ins Handoff-Bundle.

## Ausgangslage

Der lesende Layer liegt in `features/tasks/`: `types.ts`, `stats.ts`,
`queries.ts`, `index.ts`. `useFamilyTasks` cacht unter
`["tasks", "family", doneSince]`, wobei `doneSince` mit dem Kalendertag
wechselt.

Zwei Konventionen des Repos geben den Rahmen vor:

**Mutations stellen keine Fehler dar.**
[features/calendar/mutations.ts](../../../features/calendar/mutations.ts)
kennt kein `Alert`; die Screens rufen es im `onError`
([EventDetailScreen.tsx](../../../app-sections/event/EventDetailScreen.tsx)).
[features/auth/errors.ts](../../../features/auth/errors.ts) liefert dafür mit
`mapAuthError(err) → i18n-Key` das Muster.

**Optimistic Updates gibt es noch nirgends.** Die Calendar-Mutations
invalidieren und laden neu; Optimistic UI steht dort als offener Eintrag in
`docs/TODO.md`. Dieser Layer ist damit der erste — die Mechanik wird deshalb
hier festgelegt und nicht aus einem Vorbild übernommen.

Relevante Constraints der Tabelle:

- `tasks_completed_consistency` ist **symmetrisch**: `is_done = true` verlangt
  `completed_at IS NOT NULL`, `is_done = false` verlangt `completed_at IS NULL`.
  Eine Teilschreibung wird von der DB abgelehnt.
- `type_id` ist NOT NULL → ohne einen Weg an eine Task-Type-ID wäre
  `useCreateTask` nicht aufrufbar.
- RLS validiert bei INSERT und UPDATE zusätzlich, dass `child_id`, `type_id`,
  `created_by` und `completed_by` auf Datensätze der eigenen Familie zeigen.

## Architektur

### Dateilayout

| Datei                                | Verantwortung                                  |
| ------------------------------------ | ---------------------------------------------- |
| `features/tasks/mutations.ts`        | die vier Hooks, Vars-Typen, Cache-Verdrahtung  |
| `features/tasks/optimistic.ts`       | reine Cache-Updater                            |
| `features/tasks/optimistic.test.ts`  | Tests dagegen                                  |
| `features/tasks/errors.ts`           | `mapTaskError`, `MissingParentError`           |
| `features/tasks/errors.test.ts`      | Tests dagegen                                  |
| `features/tasks/queries.ts`          | **Änderung:** `useTaskTypes`, `taskKeys.types` |
| `features/tasks/index.ts`            | **Änderung:** Barrel                           |
| `features/i18n/locales/{de,en}.json` | **Änderung:** vier `hw.error.*`-Keys           |
| `docs/TODO.md`                       | **Änderung:** Backlog-Pflege                   |

Dieselbe Trennung wie bei `stats.ts`: was Fehler trägt — Cache-Patching,
Fehlerklassifikation — liegt als reine Funktion in einem eigenen Modul und ist
ohne React und ohne Netz testbar. `mutations.ts` bleibt Verdrahtung.

### Die vier Hooks

```ts
useCreateTask():     UseMutationResult<TaskRow, unknown, CreateTaskVars>
useUpdateTask():     UseMutationResult<void, unknown, UpdateTaskVars>
useDeleteTask():     UseMutationResult<void, unknown, DeleteTaskVars>
useToggleTaskDone(): UseMutationResult<void, unknown, ToggleTaskDoneVars>
```

```ts
interface CreateTaskVars {
  typeId: string;
  title: string;
  /** `YYYY-MM-DD`, lokaler Kalendertag. */
  dueDate: string;
  childId?: string | null;
  description?: string | null;
  subject?: string | null;
  dueTime?: string | null;
}

interface UpdateTaskVars {
  taskId: string;
  changes: TaskChanges;
}

interface DeleteTaskVars {
  taskId: string;
}

interface ToggleTaskDoneVars {
  taskId: string;
  done: boolean;
}
```

`family_id` und `created_by` stehen **nicht** in `CreateTaskVars`. Sie kommen
aus `useCurrentParent()`. Der Aufrufer kann sie damit nicht falsch setzen, und
eine fremde Familie würde RLS ohnehin ablehnen — der Parameter wäre eine
Fehlerquelle ohne Nutzen.

`TaskChanges` ist bewusst eng:

```ts
type TaskChanges = Pick<
  TaskUpdate,
  "title" | "description" | "subject" | "due_date" | "due_time" | "child_id" | "type_id"
>;
```

`is_done`, `completed_at` und `completed_by` fehlen darin absichtlich. Die drei
Spalten gehen ausschließlich durch `useToggleTaskDone`, das sie gemeinsam
setzt:

| `done`  | `is_done` | `completed_at`             | `completed_by` |
| ------- | --------- | -------------------------- | -------------- |
| `true`  | `true`    | `new Date().toISOString()` | `parent.id`    |
| `false` | `false`   | `null`                     | `null`         |

Weil der CHECK symmetrisch ist, gäbe es sonst zwei Wege, ihn zu erfüllen, die
auseinanderlaufen können. So gibt es einen.

`useCreateTask` gibt die eingefügte Zeile zurück (`.select().single()`) — ein
späterer Screen braucht die `id`, um direkt ins Detail zu springen. Die anderen
drei geben `void` zurück.

### Fehlender Parent

`useCreateTask` und `useToggleTaskDone` brauchen `parent.id`. Ist
`useCurrentParent()` noch nicht geladen oder liefert `null`, wirft die
`mutationFn` **vor** dem Netzzugriff eine `MissingParentError`. `mapTaskError`
erkennt sie über `name` und bildet sie auf `hw.error.notAuthenticated` ab.

Das ist ehrlicher als ein Request, den RLS anschließend mit 42501 ablehnt: der
Fehler entsteht lokal, also wird er auch lokal benannt.

### Optimistic-Mechanik

Das Standardmuster von React Query, für Toggle, Update und Delete:

1. `onMutate`: `await qc.cancelQueries({ queryKey: taskKeys.all })`, Snapshot
   über `qc.getQueriesData`, dann `qc.setQueriesData` mit dem passenden
   Updater. Der Snapshot geht als Kontext weiter.
2. `onError`: Snapshot zurückschreiben, Fehler weiterwerfen.
3. `onSettled`: `qc.invalidateQueries({ queryKey: taskKeys.all })`.

Ziel ist immer `{ queryKey: taskKeys.all }` — also **jeder** Tasks-Cache-Eintrag
unabhängig vom `doneSince`-Suffix. Den exakten Key in der Mutation nachzubauen
würde die Tageslogik aus `useToday` duplizieren; zwei Kopien derselben
Datumsrechnung driften auseinander, sobald eine sich ändert.

`useCreateTask` bleibt invalidate-and-refetch. Eine optimistische neue Zeile
bräuchte eine erfundene `id` **und** die gejointe `task_types`-Zeile, und ein
Rollback ließe genau die Zeile wieder verschwinden, die der Nutzer eben angelegt
hat — der unangenehmste Rollback von allen, für den kleinsten Gewinn.

Abhaken **entfernt keine Zeile**: ein frisch erledigter Task fällt ins
7-Tage-Fenster für Erledigtes und bleibt sichtbar.

Die Updater in `optimistic.ts`:

```ts
applyToggle(
  tasks: TaskWithType[],
  taskId: string,
  done: boolean,
  completedAt: string | null,
  completedBy: string | null,
): TaskWithType[]

applyUpdate(tasks: TaskWithType[], taskId: string, changes: TaskChanges): TaskWithType[]

applyDelete(tasks: TaskWithType[], taskId: string): TaskWithType[]
```

Trifft die `taskId`, geben alle drei ein **neues** Array zurück und mutieren
weder Eingabe noch Elemente; trifft sie nicht, kommt die Eingabe unverändert
und identisch zurück (siehe nächster Absatz). `completedAt`/`completedBy` sind
Parameter statt intern erzeugt —
derselbe Grund wie bei `computeTaskStats(tasks, now)`: die Tests bleiben
deterministisch.

Eine unbekannte `taskId` lässt das Array unverändert, statt zu werfen. Der
Cache ist eine Momentaufnahme; dass eine Zeile darin fehlt, während der Server
sie kennt, ist ein normaler Zustand, kein Fehler.

### Fehlerklassifikation

```ts
export type TaskErrorKey =
  "hw.error.notAuthenticated" | "hw.error.staleReference" | "hw.error.network" | "hw.error.generic";

export function mapTaskError(input: unknown): TaskErrorKey;
```

| Signal                                                             | Key                |
| ------------------------------------------------------------------ | ------------------ |
| `MissingParentError` (über `name`)                                 | `notAuthenticated` |
| SQLSTATE `42501` — RLS hat abgelehnt                               | `notAuthenticated` |
| SQLSTATE `23503` — FK verletzt, Kind oder Typ existiert nicht mehr | `staleReference`   |
| `AbortError` / `/network\|fetch failed\|aborted/i`                 | `network`          |
| sonst                                                              | `generic`          |

Klassifiziert wird die **Ursache**, nicht die Operation — welcher Titel
darüber steht, entscheidet der Screen. Genau wie `mapAuthError`.

`23514` (CHECK verletzt) bekommt keinen eigenen Key. Der Constraint kann nur
brechen, wenn dieser Layer die drei Completion-Spalten inkonsistent schreibt —
das wäre ein Bug hier, keine Situation, die man dem Nutzer erklären kann.
`generic` plus der `console.error` ist die richtige Antwort darauf.

Geloggt werden nur `code`, `name` und `hasMessage` — nie der Rohwert. Supabase-
Fehlermeldungen können den gesendeten Payload enthalten, und Task-Titel sind
privat ("Ben: Attest für Schulpsychologe abgeben").

Die Mutations werfen weiter und zeigen nichts. Der spätere Screen macht:

```ts
onError: (err) => Alert.alert(t(mapTaskError(err)));
```

### `useTaskTypes`

Ein Lookup-Hook in `queries.ts`, analog `useEventTypes`:

```ts
taskKeys.types = ["tasks", "types"] as const;
useTaskTypes(): UseQueryResult<TaskTypeRow[], Error>  // staleTime 5 min
```

`task_types` führt globale Zeilen (`family_id IS NULL`) und familieneigene;
die RLS-Policy gibt beide frei, sortiert wird nach `slug`. Ohne diesen Hook
käme kein Aufrufer an eine `type_id`, und `useCreateTask` wäre tot.

### i18n

Vier neue Keys im `hw.*`-Namespace, DE kanonisch, EN gespiegelt:

| Key                         | DE                                                        |
| --------------------------- | --------------------------------------------------------- |
| `hw.error.notAuthenticated` | Bitte erneut anmelden.                                    |
| `hw.error.staleReference`   | Kind oder Aufgabentyp existiert nicht mehr.               |
| `hw.error.network`          | Verbindung fehlgeschlagen. Bitte später erneut versuchen. |
| `hw.error.generic`          | Etwas ist schiefgelaufen. Bitte später erneut versuchen.  |

Du-Form, keine Ausrufezeichen — Markenstimme laut CLAUDE.md.
[docs/COPY.md](../../COPY.md) gehört dem Designer, die Keys werden dort per
TODO-Eintrag nachgetragen (gleiche Baustelle wie `set.footer` und die
Kalender-Keys).

### Tests

`optimistic.test.ts`:

- `applyToggle` auf `done` setzt alle drei Spalten; auf `undone` räumt es alle
  drei
- `applyToggle`/`applyUpdate` lassen andere Zeilen unberührt
- `applyUpdate` überschreibt nur die übergebenen Felder
- `applyDelete` entfernt genau eine Zeile
- unbekannte `taskId` lässt das Array bei allen dreien unverändert
- keine der drei Funktionen mutiert Eingabe-Array oder -Elemente

`errors.test.ts`: die fünf Zweige aus der Tabelle plus Nicht-Objekt-Eingabe
(`null`, `undefined`, String) → `generic`.

Keine Tests für `mutations.ts` und `useTaskTypes`. Nach dem Auslagern der Logik
ist beides Verdrahtung, und es gibt im Repo keine React-Hook-Testinfrastruktur
(`bun test` fährt reine Funktionen) — dieselbe Begründung wie beim lesenden
Layer.

## Backlog-Pflege

- **Entfernen:** „Tasks-Layer ist lesend" — mit dieser Iteration erledigt.
- **Ergänzen:** `hw.error.*` fehlen in `docs/COPY.md` (Designer trägt nach).
- **Ergänzen:** `useCreateTask` ist nicht optimistisch — bewusst, siehe oben;
  relevant erst, wenn ein Screen die Latenz beim Anlegen spürbar macht.

## Offene Punkte

Keine.
