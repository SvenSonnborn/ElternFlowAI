# Spec · AufgabenScreen auf Live-Daten

**Datum:** 2026-08-11 · **Branch:** `feat/aufgaben-live-data` · **Status:** freigegeben

## Ziel

[AufgabenScreen](<../../../app-sections/(tabs)/aufgaben/AufgabenScreen.tsx>) zeigt
echte Tasks aus `features/tasks` statt `features/sample-data`, gruppiert nach
Fälligkeit, mit funktionierender Checkbox, Pull-to-Refresh und Empty-States.

Schließt die letzte Lücke der Tasks-Reihe: Der Daten-Layer ist seit PR #63
lesend und seit PR #64 schreibfähig, wird aber von keinem Screen benutzt.

## Scope

**Drin:** Datenquelle tauschen, V2-Gruppierung, Stat-Leiste aus `useTasksStats`,
Abhaken per `useToggleTaskDone`, Pull-to-Refresh, Empty-/Error-/Loading-States,
drei neue und ein geänderter i18n-Key.

**Bewusst draußen:**

- **Aufgaben anlegen.** Kein `useCreateTask` im Screen — ein Formular mit Typ-,
  Kind- und Datumsauswahl ist eine eigene Iteration.
- **Bearbeiten und Löschen.** `useUpdateTask`/`useDeleteTask` bleiben ungenutzt;
  sie brauchen ein Detail-Sheet, das es nicht gibt.
- **Task-Reminder.** Die `reminders`-Tabelle kennt `task_id`, aber es gibt keine
  Zustellung (offener Backlog-Eintrag).
- **Voice-Add.** Bleibt der deaktivierte Stub, den er heute ist.
- **V1/V2-Umschalter.** `patterns/homework.md` sieht ihn im Goal-Abschnitt vor
  („browse by child or by status, switchable"), aber ohne zweiten Renderpfad
  gibt es nichts umzuschalten.

Keine Migration, kein Types-Regen, kein Eingriff ins Handoff-Bundle.

## Ausgangslage

Der Screen rendert heute **V1** aus `patterns/homework.md` — Gruppierung nach
Kind mit Avatar-Header je Gruppe — vollständig aus `homeworkByChild`,
`homeworkStats` und `children` des Mocks. Die Aufgabe beschreibt dagegen **V2**:
„Heute fällige, diese Woche fällige und erledigte Tasks". Beide Key-Sätze liegen
bereits im Katalog (`hw.dueToday`, `hw.thisWeek`, `hw.upcoming`, `hw.doneToday`,
`hw.longTerm`).

Der Layer liefert `useFamilyTasks`, `useTasksByChild`, `useTasksStats`,
`useTaskTypes` und die vier Mutations. Was fehlt, ist eine Ableitung nach
Fälligkeit — `useTasksByChild` bedient V1 und bleibt von diesem Screen ungenutzt.

Drei Dinge im bestehenden Code haben keine Entsprechung in echten Daten:

- **`item.tone`** — der Mock trägt pro Zeile eine Fachfarbe. Real gibt es
  `tasks.subject` (Freitext, nullable) und `task_types.color`.
- **`titleEn`/`subjectEn`** — der Mock hält beide Sprachen pro Datensatz und
  schaltet über `i18n.language` um. Echte Tasks haben einen Titel.
- **Das Glocken-Icon** — rein dekorativ, ohne jede Reminder-Verdrahtung.

## Architektur

### Neue Ableitung: `groupTasksByDue`

In [features/tasks/stats.ts](../../../features/tasks/stats.ts), neben
`groupTasksByChild` — gleiche Natur (reine Ableitung aus Liste + `now`), teilt
dessen Sortierer und die `parseISO`-Disziplin.

```ts
export interface TaskSections {
  today: TaskWithType[];
  upcoming: TaskWithType[];
  doneToday: TaskWithType[];
}

export function groupTasksByDue(tasks: TaskWithType[], now: Date): TaskSections;
```

| Sektion     | Inhalt                                                           |
| ----------- | ---------------------------------------------------------------- |
| `today`     | offen, `due_date <= Ende heute` — überfällige fallen hier hinein |
| `upcoming`  | **alle** übrigen offenen, nicht nur diese Woche                  |
| `doneToday` | erledigt, `completed_at` liegt heute                             |

`today` folgt derselben Regel wie `dueToday` in `computeTaskStats`: laut
`patterns/homework.md` ist `today`, was `due ≤ end of today` ist — ein seit
Tagen überfälliger Task ist nicht weniger dringend als einer von heute.

`upcoming` nimmt bewusst **alles** Offene nach heute auf, nicht nur die laufende
Woche. Eine Sektion „diese Woche" ließe langfristige Aufgaben aus jeder Liste
fallen; sie wären dann nirgends sichtbar. Die Wochenzahl steht ohnehin in der
Stat-Leiste. Damit gilt: jeder offene Task ist in genau einer Sektion.

Sortierung: `today` und `upcoming` nach `due_date` aufsteigend, `doneToday` nach
`completed_at` absteigend — zuletzt Erledigtes oben.

`now` ist Parameter, kein `Date.now()` im Modul — wie bei `computeTaskStats`,
damit die Tests deterministisch bleiben.

### `useFamilyTasks` gibt `refetch` heraus

Für Pull-to-Refresh braucht der Screen mehr als heute:

```ts
interface UseFamilyTasksResult {
  data: TaskWithType[];
  isLoading: boolean;
  isRefetching: boolean;
  error: unknown;
  refetch: () => void;
}
```

`refetch` wird auf `() => void` verengt statt die React-Query-Signatur
durchzureichen — der Screen übergibt sie direkt an `onRefresh`, und niemand soll
sich auf das zurückgegebene Promise verlassen.

### `Screen` lernt `refreshControl`

[design-system/ui/Screen.tsx](../../../design-system/ui/Screen.tsx) rendert eine
`ScrollView` ohne Prop-Durchreichung. Neu:

```ts
interface ScreenProps extends ViewProps {
  scroll?: boolean;
  refreshControl?: ReactElement;
  className?: string;
  contentClassName?: string;
}
```

Durchgereicht wird nur im `scroll`-Zweig; ohne `scroll` ist das Prop
wirkungslos. Erster `RefreshControl` im Repo — es gibt keine Konvention, an die
anzuschließen wäre. `design-system/ui/` ist Claude-owned, die SPEC-Dateien des
Handoff-Bundles bleiben unberührt.

### Screen-Aufbau

**TopBar** — `hw.title` plus `hw.sub` mit lokalisiertem Wochentag (siehe i18n).

**Stat-Leiste** — unverändert im Aussehen, gespeist aus `useTasksStats`:
`dueToday` (warning), `thisWeek` (primary), `donePct` als Prozent (success).

**Drei Sektionen** — Überschrift plus Zeilen. Eine leere Sektion wird
**ausgeblendet**, nicht als leere Überschrift gerendert.

| Sektion        | Key            |
| -------------- | -------------- |
| Heute fällig   | `hw.dueToday`  |
| Demnächst      | `hw.upcoming`  |
| Erledigt heute | `hw.doneToday` |

**Zeile** — Card mit:

- Checkbox links, **interaktiv**: Tap ruft `useToggleTaskDone`. Trefferfläche
  mindestens 44×44 (CLAUDE.md-Non-negotiable #4), auch wenn das Kästchen
  optisch 20 px bleibt.
- kleiner `ChildAvatar` (`size="sm"`, 24 px) mit Name und Farbe des Kindes aus
  `useFamilyChildren`; Tasks ohne `child_id` (Eltern-Aufgaben, Besorgungen)
  bekommen keinen.
- Pill mit `task.subject`; ist die Spalte `null`, das Label aus `task_types`
  in der aktiven Sprache. Farbe aus `task_types.color`.
- Urgent-Pill (`hw.dueToday`, tone `warn`), wenn offen und `due_date ≤ heute`.
- Titel, bei `is_done` durchgestrichen und `inkTertiary`.
- Caption `hw.due` mit dem formatierten Fälligkeitsdatum.

Das **Glocken-Icon entfällt**. Es war dekorativ und suggeriert eine
Erinnerungsfunktion, die für Tasks nirgends verdrahtet ist.

Der `lang`-Switch mit `titleEn`/`subjectEn` entfällt ebenfalls — den gab es nur,
weil der Mock beide Sprachen pro Datensatz hielt.

Der Voice-Button bleibt unverändert stehen.

### Zustände

| Zustand                    | Darstellung                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Erste Ladung (`isLoading`) | `ActivityIndicator`, keine Stat-Leiste                                                                              |
| Fehler (`error`)           | Card mit `hw.loadError` als Titel, `t(mapTaskError(error))` als Ursache darunter, Button `action.retry` → `refetch` |
| Alles leer                 | Card mit `hw.empty.title` / `hw.empty.sub`, Stat-Leiste bleibt sichtbar                                             |
| Refetch (`isRefetching`)   | Spinner im `RefreshControl`, Inhalt bleibt stehen                                                                   |

Ein Fehler beim Abhaken zeigt `Alert.alert(t(mapTaskError(err)))` im `onError`
— genau die Arbeitsteilung, für die `mapTaskError` gebaut wurde: der Layer
klassifiziert, der Screen stellt dar.

### i18n

**Neu**, nach dem Muster von `dash.empty.*`:

| Key              | DE                                             | EN                                          |
| ---------------- | ---------------------------------------------- | ------------------------------------------- |
| `hw.empty.title` | Nichts zu tun                                  | Nothing to do                               |
| `hw.empty.sub`   | Sobald Aufgaben anstehen, findest du sie hier. | Tasks will show up here once there are any. |
| `hw.loadError`   | Aufgaben konnten nicht geladen werden.         | Tasks could not be loaded.                  |

`action.retry` („Erneut versuchen") existiert und wird wiederverwendet.

**Geändert:** `hw.sub` lautet heute `"Mittwoch · {{open}} offen · {{done}}
erledigt"` — der Wochentag ist im Katalog **hartcodiert**. Mit Mock-Daten fiel
das nie auf; live stünde dort dauerhaft „Mittwoch". Neu:
`"{{weekday}} · {{open}} offen · {{done}} erledigt"`.

Der Wochentag kommt aus `format(now, "EEEE", { locale })` mit `de` bzw. `enUS`
aus `date-fns/locale`. **Das ist ein neues Muster im Repo** — date-fns läuft
bisher überall mit Default-Locale, und `features/calendar/locale.ts` ist
handgepflegte Copy für `react-native-calendars`, kein date-fns-Locale. Der
Import ist per-Locale und damit tree-shakebar.

Beides — die drei neuen Keys und die Formänderung an `hw.sub` — betrifft
designer-eigene Copy und geht als TODO-Eintrag an `docs/COPY.md`.

### Tests

`groupTasksByDue` in `stats.test.ts`, mit fixem `now`:

- überfälliger Task landet in `today`, nicht in `upcoming`
- heute fälliger Task in `today`, morgen fälliger in `upcoming`
- langfristiger Task (Monate hin) bleibt in `upcoming` — verschwindet nicht
- heute erledigter Task in `doneToday`, gestern erledigter in keiner Sektion
- `today`/`upcoming` nach `due_date` aufsteigend, `doneToday` nach
  `completed_at` absteigend
- leere Eingabe → drei leere Arrays
- jeder offene Task liegt in genau einer Sektion

Der Screen selbst bleibt ungetestet. Es gibt keine verlässlich laufende
RN-Komponenten-Testinfrastruktur — `bun test` fährt reine Funktionen, und der
`jest-expo`-Pfad ist laut CLAUDE.md über SDK-Bumps hinweg wiederholt gebrochen.

## Backlog-Pflege

- **Entfernen:** „`AufgabenScreen` hängt weiter an `sample-data`" — erledigt.
- **Ergänzen:** neue/geänderte `hw.*`-Keys fehlen in `docs/COPY.md`.
- **Ergänzen:** Bearbeiten/Löschen im Screen nicht verdrahtet — `useUpdateTask`
  und `useDeleteTask` warten auf ein Detail-Sheet.
- **Ergänzen:** Das Glocken-Icon der Zeile ist entfallen; Task-Reminder brauchen
  erst die Zustellung aus der Notifications-Iteration.
  Nichts davon betrifft `features/sample-data/homework.ts` — siehe nächster
  Abschnitt, die Datei geht mit.

## Toter Mock wird gelöscht

`homeworkByChild` und `homeworkStats` haben genau einen Konsumenten: den
Screen, den diese Iteration umbaut. Danach ist
`features/sample-data/homework.ts` vollständig tot — mitsamt der Typen
`HomeworkItem` und `HomeworkByChild` in `features/sample-data/types.ts` und der
`export * from "./homework"`-Zeile im Barrel. Alle drei werden gelöscht.

Verwaister Mock ist nicht harmlos: er sieht aus wie eine Datenquelle, die noch
jemand benutzt, und lädt beim nächsten Screen dazu ein, wieder daran
anzudocken. Der Rest von `features/sample-data` bleibt unangetastet —
`recipe`, `weeklyMeals`, `children` und die Dashboard-Daten haben weiter
Konsumenten.

## Offene Punkte

Keine.
