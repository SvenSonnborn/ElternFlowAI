# Spec · Tasks-Daten-Layer

**Datum:** 2026-07-29 · **Branch:** `feat/tasks-data-layer` · **Status:** freigegeben

## Ziel

Ein Daten-Layer für `tasks` unter `features/tasks/`, der in Screens nutzbar ist:
`useFamilyTasks`, `useTasksByChild`, `useTasksStats` plus die Typen `TaskRow` /
`TaskInsert` / `TaskUpdate`. Dazu ein dokumentierter RLS-Check, der belegt, dass
Eltern nur Tasks ihrer eigenen Familie sehen und bearbeiten können.

## Scope

**Drin:** Query-Layer, Ableitungslogik, Typen, Unit-Tests, RLS-Nachweis.

**Bewusst draußen** — jeweils eigene Iteration, wandert als Eintrag nach
[docs/TODO.md](../../TODO.md):

- **Screen-Rewire.** [AufgabenScreen](<../../../app-sections/(tabs)/aufgaben/AufgabenScreen.tsx>)
  bleibt vorerst auf `@/features/sample-data`. Der Umbau braucht einen Abgleich
  mit [patterns/homework.md](../../../patterns/homework.md) und Loading-/Empty-/
  Error-States.
- **Mutations.** Kein `useCreateTask` / `useToggleTaskDone` / `useDeleteTask`.
  Der Layer ist in dieser Iteration lesend.

Kein UI, keine neuen i18n-Keys, kein Eingriff ins Handoff-Bundle, keine
Migration.

## Ausgangslage

Die Tabelle existiert seit
[20260529092651_tasks.sql](../../../supabase/migrations/20260529092651_tasks.sql),
die Policies wurden in
[20260529100841_pr3_review_fixes.sql](../../../supabase/migrations/20260529100841_pr3_review_fixes.sql)
verschärft. `Row` / `Insert` / `Update` sind in
`features/supabase/database.types.ts` bereits generiert — es braucht keinen
Types-Regen.

Relevante Spalten: `family_id`, `type_id` → `task_types`, `child_id` (nullable —
Eltern-Aufgaben und Besorgungen hängen an keinem Kind), `title`, `subject`,
`due_date` (`date`, **ohne** Zeitzone), `due_time` (`time`, optional),
`is_done`, `completed_at`, `completed_by`.

Ein CHECK (`tasks_completed_consistency`) hält `is_done` und
`completed_at`/`completed_by` symmetrisch — relevant erst für die
Mutations-Iteration, hier nur als Lesegarantie: bei `is_done = true` ist
`completed_at` nie NULL.

## Architektur

### Dateilayout — `features/tasks/`

| Datei           | Inhalt                                                                                         |
| --------------- | ---------------------------------------------------------------------------------------------- |
| `types.ts`      | `TaskRow`, `TaskInsert`, `TaskUpdate`, `TaskTypeRow`, `TaskWithType`, `TaskGroup`, `TaskStats` |
| `queries.ts`    | `taskKeys`-Factory, `fetchFamilyTasks()`, die drei Hooks                                       |
| `stats.ts`      | reine Ableitungen: `groupTasksByChild(tasks)`, `computeTaskStats(tasks, now)`                  |
| `stats.test.ts` | `bun:test`-Suite gegen `stats.ts`                                                              |
| `index.ts`      | Barrel                                                                                         |

Fetcher **und** Hooks liegen zusammen in `queries.ts` — analog
[features/auth/familyQueries.ts](../../../features/auth/familyQueries.ts).
`features/calendar/` trennt `queries.ts` von `hooks.ts`; beide Konventionen
existieren im Repo, hier gewinnt die kompaktere, weil der Layer klein ist und
die Aufgabe die Datei so benannt hat.

Die Ableitungslogik wandert nach `stats.ts`, weil dort die Fehler sitzen
(Wochengrenzen, Überfälligkeit, Division durch Null). Als reine Funktionen mit
injiziertem `now` sind sie ohne React und ohne Netz testbar.

### Query & Datenfenster

Eine einzige Netz-Query:

```ts
const SELECT = "*, task_types(*)";

// offen (unabhängig vom Datum) ODER in den letzten 7 Tagen erledigt
.or(`is_done.eq.false,completed_at.gte.${doneSince}`)
.order("due_date", { ascending: true })
```

`doneSince` = `startOfDay(now) - 7 Tage`, als ISO-String.

Das Fenster ist bewusst nicht parametrisiert. Tasks haben keine
Monatsnavigation wie der Kalender; ein Aufrufer müsste sich einen Zeitraum
ausdenken, und überfällige Tasks außerhalb davon würden lautlos verschwinden.
Offene Tasks sind deshalb immer vollständig geladen, erledigte nur so weit
zurück, wie „Erledigt heute" und die Wochenquote sie brauchen.

**Kein explizites `.eq("family_id", …)`.** Die Isolation macht RLS
(`force row level security` + `family_id = current_family_id()`), genau wie
`fetchEventsInRange` es im Kalender hält. Deshalb braucht `useFamilyTasks()`
auch kein `familyId`-Argument. Ein zusätzlicher Client-Filter würde eine
zweite, stillschweigend divergierende Definition von „meine Familie" schaffen —
die Policy ist die einzige Wahrheit.

`task_types(*)` kommt joined mit, damit Slug, Label, Icon und Farbe des
Task-Typs ohne zweiten Request verfügbar sind (Muster: `event_types(*)` im
Kalender). **Kind**-Stammdaten kommen bewusst nicht mit — dafür gibt es
`useFamilyChildren` in `features/auth`; ein zweiter Join würde dieselben Rows
pro Task duplizieren.

### Die drei Hooks

```ts
useFamilyTasks(): { data: TaskWithType[]; isLoading: boolean; error: unknown }
useTasksByChild(): TaskGroup[]
useTasksStats(): TaskStats
```

`useTasksByChild` und `useTasksStats` rufen intern `useFamilyTasks` und leiten
per `useMemo` ab. Ein Roundtrip, ein Cache-Eintrag — Liste und Stats können
nicht auseinanderlaufen.

**`TaskGroup`** — eine Gruppe je `child_id`:

```ts
interface TaskGroup {
  childId: string | null;
  tasks: TaskWithType[];
  openCount: number;
}
```

Die `childId: null`-Gruppe (Eltern-Aufgaben, Besorgungen) steht immer am Ende.
Kind-Gruppen erscheinen in der Reihenfolge ihres ersten Auftretens in der nach
`due_date` sortierten Liste — der Screen ordnet sie später ohnehin an seiner
eigenen `useFamilyChildren`-Reihenfolge aus. Innerhalb einer Gruppe: offene
Tasks zuerst nach `due_date` aufsteigend, danach erledigte nach `completed_at`
absteigend.

Screens, die nur ein Kind brauchen (Child-Profile), picken ihre Gruppe aus dem
Array. Kein optionaler `childId`-Parameter, der den Rückgabetyp umschaltet.

**`TaskStats`:**

```ts
interface TaskStats {
  dueToday: number; // offen, due_date <= Ende heute — inkl. überfällig
  thisWeek: number; // offen, due_date <= Ende der ISO-Woche
  donePct: number; // 0..100, gerundet
  open: number; // alle offenen
  doneToday: number; // completed_at liegt heute
}
```

`dueToday` zählt überfällige Tasks mit. Das folgt der Urgency-Ableitung in
[patterns/homework.md](../../../patterns/homework.md) (`today` if `due ≤ end of
today`) — ein seit drei Tagen überfälliger Task ist nicht weniger dringend als
einer von heute.

`thisWeek` schließt `dueToday` ein — es ist ein `<=`-Fenster, keine disjunkte
Klasse. Die Urgency-Ableitung im Pattern ist zwar eine Kaskade (`thisWeek` nur,
wenn nicht `today`), die aber den Dringlichkeits-Pill **einer Zeile** einfärbt,
nicht die Zähler der Stat-Leiste. Für die Zähler entscheidet der Mock des
Designers: [features/sample-data/homework.ts](../../../features/sample-data/homework.ts)
führt `dueToday: 2`, `thisWeek: 3`, `open: 4`. Disjunkt gelesen wären das 2 + 3
= 5 Tasks bei nur 4 offenen — ein Widerspruch. Inklusiv gelesen geht es auf.

Das Feldset von `TaskStats` ist bewusst deckungsgleich mit `homeworkStats` aus
demselben Mock (`doneToday` entspricht dort `doneTodayLabel`). Der spätere
Screen-Rewire wird damit ein Austausch der Datenquelle, keine Umschreibung der
Render-Logik.

`donePct` bezieht sich auf die **laufende ISO-Woche**: Zähler = Tasks mit
`completed_at` in dieser Woche, Nenner = Zähler + offene Tasks mit `due_date <=`
Wochenende. Nenner 0 → `donePct = 0` (nicht `NaN`, nicht 100).

### Zeitzonen

`due_date` ist ein `date` ohne Zeitzone und wird als **lokaler Kalendertag**
gelesen — als String verglichen bzw. per `parseISO` in lokale Mitternacht
überführt, nie über `new Date(row.due_date)` (das interpretiert `YYYY-MM-DD`
als UTC-Mitternacht und verschiebt den Tag westlich von Greenwich um eins).
`completed_at` ist `timestamptz` und wird direkt verglichen.
Wochengrenzen kommen aus date-fns mit `weekStartsOn: 1` (ISO, Montag).

Alle Ableitungen nehmen `now` als Parameter — kein `Date.now()` in `stats.ts`.
Das macht die Tests deterministisch.

### Fehlerbehandlung

`fetchFamilyTasks` wirft den Supabase-`error` (Muster:
`fetchEventsInRange`); React Query fängt ihn. Die Hooks reichen
`{ data, isLoading, error }` durch. Bei Fehler oder noch nicht geladenen Daten
liefern die Ableitungen neutrale Werte — `[]` bzw. Nullen —, damit ein
konsumierender Screen keine Sonderfälle für „noch nichts da" braucht.

### Tests

`stats.test.ts` deckt `groupTasksByChild` und `computeTaskStats` mit fixem `now`
ab. Abgedeckte Fälle:

- Gruppierung inkl. `null`-Gruppe am Ende, Sortierung innerhalb der Gruppe
- `openCount` zählt nur offene
- `dueToday` inkl. überfällig; Task mit `due_date` morgen zählt nicht
- `thisWeek` an der Wochengrenze (Sonntag drin, Montag danach draußen)
- `donePct` bei leerem Nenner → 0
- Leere Eingabe → `[]` / Nullen

Netz-Layer und Hooks bleiben ungetestet — sie enthalten nach dem Auslagern der
Logik nur noch Verdrahtung, und ein Supabase-Mock würde vor allem den Mock
testen.

## RLS-Check

Read-only gegen das Remote-Projekt ausgeführt am 2026-07-29, abgeglichen mit den
beiden Migrationen. **Kein Finding.**

**1 · RLS ist aktiv und erzwungen.** `pg_class` meldet für `public.tasks` (und
`public.task_types`) `relrowsecurity = true` **und** `relforcerowsecurity =
true`. `force` schließt die Lücke, dass der Tabelleneigentümer Policies sonst
umgeht.

**2 · Vier Policies, alle nur für `authenticated`.** Der `anon`-Rolle ist keine
Policy zugeordnet — ein nicht eingeloggter Client sieht bei aktiviertem RLS
nichts, unabhängig vom Query.

| Kommando | `USING`                           | `WITH CHECK`                                  |
| -------- | --------------------------------- | --------------------------------------------- |
| SELECT   | `family_id = current_family_id()` | —                                             |
| INSERT   | —                                 | `family_id = current_family_id()` + Ref-Check |
| UPDATE   | `family_id = current_family_id()` | `family_id = current_family_id()` + Ref-Check |
| DELETE   | `family_id = current_family_id()` | —                                             |

Der Ist-Stand in `pg_policy` stimmt Ausdruck für Ausdruck mit den Migrationen
überein.

**3 · Sehen.** SELECT ist auf `family_id = current_family_id()` beschränkt.
Damit sind Tasks fremder Familien nicht lesbar — auch nicht indirekt: eine
Query auf einen fremden Task per `.eq("id", …)` liefert null Zeilen, kein
Fehler.

**4 · Bearbeiten.** UPDATE prüft beide Richtungen: `USING` verhindert den
Zugriff auf fremde Zeilen, `WITH CHECK` verhindert das Wegschieben einer
eigenen Zeile in eine fremde Familie. Zusätzlich validiert `WITH CHECK`, dass
`child_id`, `type_id`, `created_by` und `completed_by` auf Datensätze der
eigenen Familie zeigen (`type_id` erlaubt zusätzlich globale Task-Typen mit
`family_id IS NULL`) — ein Task kann also nicht an ein fremdes Kind gehängt
werden. INSERT trägt dieselbe `WITH CHECK`-Klausel.

**5 · Fail-closed ohne Familie.** `current_family_id()` liefert für einen
eingeloggten User ohne Familie NULL. `family_id = NULL` ist in SQL NULL, nicht
true — die Policy lässt keine Zeile durch. Der Zustand ist über den
Onboarding-Abbruch real erreichbar und verhält sich damit sicher.

**6 · Advisors.** `get_advisors` (security) meldet zu `tasks` nichts. Die vier
offenen Hinweise sind vorbestehend und tasks-fremd: drei
`SECURITY DEFINER`-Funktionen (`current_family_id`, `create_family`,
`accept_invitation` — alle absichtlich so, `current_family_id` muss es sein, um
in den Policies zu funktionieren) und die deaktivierte
HaveIBeenPwned-Passwortprüfung. Letzteres ist ein Projekt-Setting ohne Bezug zu
dieser Iteration.

**Konsequenz für den Query-Layer:** Der Client braucht keinen eigenen
`family_id`-Filter. Diese Spec verlässt sich darauf.

## Nicht-Ziele

- Realtime-Subscription auf `tasks`
- Optimistic UI (ohne Mutations gegenstandslos)
- Serverseitige Aggregation per RPC — bei Familien-Datenmengen (Dutzende Rows)
  ist die Client-Ableitung schneller als der Roundtrip
- Gamification / XP aus `patterns/homework.md` — braucht Schema, das es nicht
  gibt
- pgTAP-Testsuite für RLS — eigene Infrastruktur (lokaler Stack, CI-Step),
  deutlich über diese Iteration hinaus

## Offene Punkte

Keine. Die Kanten, die es gab — Screen-Rewire, Mutations —, sind explizit aus
dem Scope genommen und landen in `docs/TODO.md`.
