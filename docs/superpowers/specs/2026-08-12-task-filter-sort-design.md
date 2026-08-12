# Spec · Aufgaben filtern und sortieren

**Datum:** 2026-08-12 · **Branch:** `feat/task-filter-sort` · **Status:** freigegeben

## Ziel

Der [AufgabenScreen](<../../../app-sections/(tabs)/aufgaben/AufgabenScreen.tsx>)
bekommt eine Filterleiste über drei Dimensionen — Status, Fälligkeit, Kind —
und eine stabile, mehrstufige Sortierung. Der aktive Filter überlebt den
Tab-Wechsel, nicht den App-Neustart.

Schließt die Lücke, dass der Screen heute alles zeigt, was im Fenster liegt, und
dem Nutzer kein Werkzeug gibt, die Liste einzuengen.

## Scope

**Drin:** drei Chip-Reihen, ein Zustand-Store für den aktiven Filter, eine reine
Filter-Funktion im Layer, dreistufige Sortierung, zwei neue Sektionen
(`Überfällig`, `Zuletzt erledigt`), ein zweiter Leerzustand für „Filter trifft
nichts", zwölf neue i18n-Keys, ADR-011 und drei TODO-Einträge.

**Bewusst draußen:**

- **Mehrfachauswahl pro Dimension.** Jede Reihe ist Einfachauswahl mit `Alle` als
  Default. Mehrfachauswahl bräuchte eine andere Chip-Semantik (Toggle statt
  Radio) und einen sichtbaren Unterschied zwischen „nichts gewählt" und „alles
  gewählt".
- **Filter nach Aufgabentyp** (`task_types`). Die drei Typen (Hausaufgaben,
  Besorgung, Eltern-Aufgabe) korrelieren stark mit dem Kind-Filter — eine vierte
  Chip-Reihe wäre viel Platz für wenig zusätzliche Trennschärfe.
- **Archiv jenseits der 7 Tage.** `DONE_WINDOW_DAYS` bleibt bei 7; ein echter
  Verlauf braucht eine eigene, paginierte Query (offener Backlog-Eintrag).
- **Kind-_Gruppierung_** (V1 aus `patterns/homework.md`). Ein Kind-_Filter_
  ersetzt keinen Renderpfad mit Avatar-Headern; `useTasksByChild` bleibt
  ungenutzt.
- **Server-seitige Filterung.** Siehe Entscheidung 1.
- **Persistenz über den App-Neustart hinaus.** Siehe Entscheidung 5.

Keine Migration, kein Types-Regen, kein Eingriff ins Handoff-Bundle.

## Ausgangslage

[`useFamilyTasks()`](../../../features/tasks/queries.ts) lädt **alle** offenen
Aufgaben plus alles, was in den letzten sieben Tagen erledigt wurde, in _einen_
Cache-Eintrag, sortiert nach `due_date`. Der Screen leitet daraus drei Sektionen
ab ([`groupTasksByDue`](../../../features/tasks/stats.ts)) und drei Stat-Kacheln
([`computeTaskStats`](../../../features/tasks/stats.ts)).

Vier Beobachtungen prägen das Design:

- **Die Daten liegen schon vollständig im Cache.** Filtern ist damit eine reine
  Selektion, kein Datenzugriff.
- **`tasks` hat keine Prioritätsspalte.** „Dringlichkeit" ist in
  [patterns/homework.md](../../../patterns/homework.md) aus `due_date`
  abgeleitet (`today` / `thisWeek` / `longTerm`). Nach Fälligkeit aufsteigend zu
  sortieren _ist_ damit bereits nach Dringlichkeit sortiert — der Zusatz braucht
  eine eigene Bedeutung.
- **`due_time` ist unbenutzt.** Die Spalte existiert seit der ersten Migration,
  wird im Formular gepflegt, beeinflusst aber weder Sortierung noch Anzeige.
- **Überfällige Aufgaben sind unsichtbar.** `groupTasksByDue` klappt sie bewusst
  in „Heute fällig" hinein. Eine drei Tage überfällige Aufgabe sieht exakt aus
  wie eine, die heute Abend fällig ist.

## Entscheidungen

### 1 · Client-seitig filtern, nicht per Query-Parameter

Der Filter ist eine reine Funktion über den bereits geladenen Rows. Ein
Chip-Tap wirkt sofort und ohne Netz.

Die Alternative — Filter in den Query-Key und in die `.eq()`/`.gte()`-Kette —
kostet pro Tap einen Roundtrip mit Spinner, vervielfacht die Cache-Einträge und
zwingt jede Mutation, statt eines Eintrags alle Varianten zu patchen. Bei einer
Datenmenge, die ohnehin komplett geladen wird, kauft man sich damit nur
Nachteile ein.

Ein Hybrid (Status server-seitig, weil `is_done` schon in der `.or()`-Klausel
steckt) wurde verworfen: er schafft zwei Orte, an denen „was ist sichtbar"
definiert ist.

### 2 · Fälligkeits-Chips sind Fenster, keine Eimer

Die vier Chips bilden die Zählweise der Stat-Kacheln ab, statt eine zweite
daneben zu stellen:

| Chip          | Prädikat                    | Kachel       |
| ------------- | --------------------------- | ------------ |
| `Überfällig`  | `due_date < heute`          | —            |
| `Heute`       | `due_date ≤ heute`          | Heute fällig |
| `Diese Woche` | `due_date ≤ Ende ISO-Woche` | Diese Woche  |
| `Langfristig` | `due_date > Ende ISO-Woche` | —            |

Die ersten drei Fenster sind ineinander geschachtelt (`Überfällig ⊂ Heute ⊂
Diese Woche`), `Langfristig` ist das Komplement zu `Diese Woche`. Das ist
Absicht: tippt man „Diese Woche", stehen exakt die Zeilen da, die die
gleichnamige Kachel behauptet. Die Chip-Reihe wird damit zum Drilldown der
Stat-Leiste, und [`computeTaskStats`](../../../features/tasks/stats.ts) bleibt
unangetastet.

Das Prädikat liest **nur `due_date`, unabhängig von `is_done`**. So hat auch die
Kombination „Erledigt + Diese Woche" eine definierte Bedeutung: „war diese Woche
fällig und ist erledigt". `Überfällig` liest sich für eine erledigte Aufgabe als
„war vor heute fällig".

### 3 · Überfällige bekommen eine eigene Sektion — auch ungefiltert

`groupTasksByDue` teilt die offenen Aufgaben künftig dreifach statt zweifach:
`overdue` (`due_date < heute`), `today` (`due_date == heute`), `upcoming`
(`due_date > heute`).

**Das ändert die Default-Ansicht, nicht nur die gefilterte.** Drei Gründe
sprechen dafür:

- Es ist die einzige Art, unter dem Filter `Überfällig` eine ehrliche
  Überschrift zu haben. Sonst stünden ausschließlich überfällige Zeilen unter
  „Heute fällig".
- Überfälligkeit ist heute nicht erkennbar — ein echter Mangel, kein
  kosmetischer.
- Filter und Sektionen teilen sich danach _eine_ Fälligkeits-Definition statt
  zweier, die auseinanderdriften können.

**Bewusst in Kauf genommen:** die Kachel sagt „3 Heute fällig", die Liste zeigt
„Überfällig 2" + „Heute fällig 1". Die Kachel zählt, was heute zu tun ist; die
Sektionen erklären, warum. Die billigere Alternative — Sektionen lassen, die
Überschrift nur bei aktivem Filter umbenennen — wurde verworfen, weil sie die
Überschrift von einer Beschreibung des Inhalts zu einer Funktion des UI-Zustands
macht.

### 4 · `due_time` ist der Dringlichkeits-Tiebreaker

Sortierung in drei Stufen:

```
due_date asc  →  due_time asc (NULL ans Ende)  →  title alphabetisch
```

„bis 8 Uhr abgeben" ist dringender als „irgendwann heute" — das ist die
Bedeutung, die „dann Dringlichkeit" ohne Prioritätsspalte tragen kann. Beide
Felder sind Strings in lexikalisch korrekter Ordnung (`YYYY-MM-DD`,
`HH:MM:SS`), es wird also nichts geparst.

Nebeneffekt: die Reihenfolge bei gleichem Datum ist erstmals deterministisch
statt „was Postgres zufällig liefert". Der Comparator wird von
`groupTasksByDue` **und** `groupTasksByChild` benutzt, beide profitieren.

Eine echte `tasks.priority`-Spalte wurde verworfen: Migration, zwei
Formularfelder, i18n, `database.types.ts`-Regen und Optimistic-Update-Anpassung
sind eine eigene Iteration, und ohne Nutzersignal ist unklar, ob eine manuell
gesetzte Priorität neben der Fälligkeit überhaupt gepflegt würde.

### 5 · Zustand-Store, App-Sitzung — kein `persist`

[features/tasks/filterStore.ts](../../../features/tasks/filterStore.ts) nach dem
Muster von [themeStore](../../../design-system/themeStore.ts). Der Filter
überlebt Tab-Wechsel und den Weg ins Formular und zurück, wird beim App-Start
auf `Alle` zurückgesetzt.

Gegen `useState` im Screen: die Filterlogik hinge am Component und wäre nicht
isoliert mit `bun test` prüfbar.

Gegen `zustand/middleware`-`persist` auf AsyncStorage: die Middleware wird im
Repo nirgends benutzt (selbst das Theme überlebt keinen Neustart), führt
Hydration-Handling und einen Web-Zweig ein — und wer vor einer Woche auf ein
Kind gefiltert hat, sähe beim Öffnen eine unvollständige Liste, ohne zu wissen
warum.

### 6 · Stat-Kacheln und `hw.sub` bleiben ungefiltert

Sie sind die Familienübersicht, nicht die Kopfzeile der Liste. Eine über einen
Kind- _und_ Fälligkeitsfilter gerechnete Wochenquote (`donePct`) wäre keine
Aussage mehr.

## Architektur

### Neue Datei: `features/tasks/filter.ts`

Reine Funktionen, kein React, kein Datumsformat aus der UI:

```ts
export type StatusFilter = "all" | "open" | "done";
export type DueFilter = "all" | "overdue" | "today" | "week" | "longTerm";

/**
 * Reservierte Sentinels der Kind-Dimension. `child_id` ist eine UUID und kann
 * mit keinem von beiden kollidieren, deshalb bleibt der Filterwert ein
 * schlichter String — das hält FilterChipRow generisch über Option-IDs.
 */
export const CHILD_ALL = "all";
export const CHILD_NONE = "none"; // Aufgaben ohne Kind: Eltern-Besorgungen

export interface TaskFilter {
  status: StatusFilter;
  due: DueFilter;
  childId: string;
}

export const DEFAULT_TASK_FILTER: TaskFilter;

/** UND-verknüpft über alle drei Dimensionen. `now` ist Parameter, damit die
 *  Tests deterministisch bleiben — wie bei computeTaskStats. */
export function filterTasks(rows: TaskWithType[], f: TaskFilter, now: Date): TaskWithType[];

/** true, sobald eine Dimension von ihrem Default abweicht. Steuert den
 *  Reset-Button und die Wahl des Leerzustands. */
export function isFiltered(f: TaskFilter): boolean;
```

### Geändert: `features/tasks/stats.ts`

`byDueDateAsc` wird zum dreistufigen Comparator (Entscheidung 4).
`groupTasksByDue` liefert fünf Eimer statt drei:

```ts
interface TaskSections {
  overdue: TaskWithType[]; //     NEU  offen, due_date < heute
  today: TaskWithType[]; //            offen, due_date == heute
  upcoming: TaskWithType[]; //         offen, due_date > heute
  doneToday: TaskWithType[]; //        erledigt heute
  doneRecent: TaskWithType[]; //  NEU  erledigt vor heute, im 7-Tage-Fenster
}
```

`doneRecent` wird **gerendert, sobald irgendein Filter aktiv ist**. Im
ungefilterten Default-Zustand bleibt die Sektion weg, damit die Standardansicht
beim Tagesrhythmus bleibt und nicht um eine Woche Historie wächst.

> Ursprünglich war die Bedingung enger gefasst — nur bei Status = `done`. Das
> ließ Zeilen verschwinden, die der Filter durchgelassen hatte: Status `Alle` +
> Fälligkeit `Überfällig` auf eine gestern erledigte überfällige Aufgabe landet
> in `doneRecent`, und der Screen meldete „Keine Treffer“, obwohl es einen gab.
> Im finalen Review korrigiert, siehe ADR-011 Decision 3.

### Neue Datei: `features/tasks/filterStore.ts`

Zustand-Store mit `status`, `due`, `childId`, den drei Settern und `reset()`.

### Neuer Hook in `features/tasks/queries.ts`

```ts
/** useFamilyTasks → filterTasks → groupTasksByDue, gegen dasselbe `useToday()`
 *  wie die bestehenden Selektoren. */
export function useFilteredTaskSections(): TaskSections;
```

`useTasksSections` bleibt bestehen (ungefiltert) — der Screen benutzt künftig
den neuen Hook, aber der alte ist Teil der öffentlichen Layer-API und die
Stat-Kacheln lesen weiter ungefiltert.

### Neues Primitive: `app-sections/shared/FilterChipRow.tsx`

Generische Einfachauswahl-Chipreihe, dreimal instanziiert:

```ts
interface FilterChipRowProps {
  /** Gruppen-Label für Screenreader; visuell nicht gerendert. */
  accessibilityLabel: string;
  options: { id: string; label: string; dotColor?: string }[];
  selectedId: string;
  onSelect: (id: string) => void;
}
```

Optisch 1:1 die „Ohne Kind"-Pille aus
[MemberPicker](../../../app-sections/shared/MemberPicker.tsx) — `h-9`,
`rounded-pill`, `border`, aktiv `primarySoft`/`primary`/`primaryStrong`, inaktiv
`cardSubtle`/`line`/`inkSecondary`. Kein neues visuelles Vokabular.

- **Touch-Target:** die 36px-Höhe kommt per `hitSlop={{ top: 4, bottom: 4 }}` auf
  44 — derselbe Kniff wie in
  [TypePicker](../../../app-sections/shared/TypePicker.tsx).
- **Umbruch:** `flex-wrap`, nicht horizontaler Scroll, damit „Langfristig" nicht
  hinter der Kante verschwindet.
- **A11y:** `accessibilityRole="button"` plus
  `accessibilityState={{ selected }}` je Chip, wie in `TypePicker` und
  `MemberPicker`. `dotColor` rendert den 8px-Punkt nur in der Kind-Reihe.

### Screen: `AufgabenScreen.tsx`

Die Leiste sitzt zwischen Stat-Kacheln und Liste, **nur im Erfolgs-Zweig** — bei
Ladefehler gibt es nichts zu filtern.

```
[3 Heute fällig] [7 Diese Woche] [62% Quote]

Alle · Offen · Erledigt
Alle · Überfällig · Heute · Diese Woche · Langfristig
Alle · ●Ben · ●Mia · Ohne Kind
                              Filter zurücksetzen ⟲   ← nur wenn isFiltered()

Überfällig
  ☐ Vokabeltest üben        9. Aug
Heute fällig
  ☐ Mathe AB S.42          12. Aug
```

- Die **Kind-Reihe entfällt komplett**, wenn die Familie keine Kinder hat —
  analog zum Early-Return in `MemberPicker`.
- **Reset:** ein `Button` mit `variant="ghost"`, `tone="neutral"` und
  Default-Größe (`md`, `h-11` — `sm` wäre mit 36px unter dem Touch-Target),
  rechtsbündig unter der letzten Chip-Reihe, gerendert nur wenn `isFiltered()`.
  Derselbe Button trägt auch den gefilterten Leerzustand.
- Die Leiste kostet realistisch vier Chip-Zeilen (≈ 170px) über der Liste. Das
  ist der Preis für Auffindbarkeit ohne aufklappbares Panel.
- Der Sektions-Aufbau (`groups`-Array) wächst von drei auf fünf Einträge;
  leere Sektionen fallen wie bisher per `filter` weg.

### `TaskRow`: `urgent: boolean` → `urgency`

Die Zeile kennt heute nur „dringend oder nicht" und leitet daraus **beides** ab:
die Warn-Tönung der Card und die Pille mit dem Label `hw.dueToday`. Mit der
neuen `overdue`-Sektion reicht das nicht mehr — eine überfällige Zeile würde
sonst „Heute fällig" behaupten.

```ts
urgency: "none" | "today" | "overdue";
```

- `today` und `overdue` tönen die Card beide `variant="tinted" tint="warning"`.
  Ein eigener Danger-Tint scheidet aus: `Card`s `TintTone` kennt ihn nicht, und
  `design-system/ui` folgt darin dem Handoff-Bundle.
- Die Pille trägt die Unterscheidung: `hw.dueToday` mit `tone="warn"` gegen
  `hw.overdue` mit `tone="danger"` — beide Töne existieren in
  [Pill](../../../app-sections/shared/Pill.tsx).
- `none` bleibt unverändert: keine Tönung, keine Pille.

### Zwei unterscheidbare Leerzustände

Heute gibt es nur `hw.empty` („Nichts zu tun"). Das ist die falsche Botschaft,
wenn zehn Aufgaben offen sind und bloß der Filter nichts trifft.

- `isFiltered() === false` → `hw.empty.*` wie bisher.
- `isFiltered() === true` → `hw.filter.empty.*` plus derselbe Reset-Button als
  Weg zurück.

## i18n

Zwölf neue Keys, DE ist kanonisch:

| Key                     | DE                                              | EN                                      |
| ----------------------- | ----------------------------------------------- | --------------------------------------- |
| `hw.overdue`            | Überfällig                                      | Overdue                                 |
| `hw.doneRecent`         | Zuletzt erledigt                                | Recently done                           |
| `hw.filter.all`         | Alle                                            | All                                     |
| `hw.filter.open`        | Offen                                           | Open                                    |
| `hw.filter.done`        | Erledigt                                        | Done                                    |
| `hw.filter.today`       | Heute                                           | Today                                   |
| `hw.filter.reset`       | Filter zurücksetzen                             | Clear filters                           |
| `hw.filter.empty.title` | Keine Treffer                                   | No matches                              |
| `hw.filter.empty.sub`   | Für diese Filter gibt es gerade keine Aufgaben. | No tasks match these filters right now. |
| `hw.filter.a11y.status` | Status filtern                                  | Filter by status                        |
| `hw.filter.a11y.due`    | Fälligkeit filtern                              | Filter by due date                      |
| `hw.filter.a11y.child`  | Nach Kind filtern                               | Filter by child                         |

`hw.overdue` bedient **Chip und Sektionsüberschrift** — derselbe Begriff, kein
zweiter Key.

Wiederverwendet ohne Änderung: `hw.thisWeek` und `hw.longTerm` (beide bisher
ungenutzt) als Chip-Label, `hw.dueToday` / `hw.upcoming` / `hw.doneToday` als
Sektionsüberschriften, `hw.form.noChild` („Ohne Kind") als Chip der Kind-Reihe.

`hw.filter.today` ist bewusst ein eigener Key und nicht `hw.dueToday`: der Chip
braucht „Heute", die Überschrift „Heute fällig".

## Tests (`bun test`)

- **`features/tasks/filter.test.ts` (neu):** jedes Status-, Fälligkeits- und
  Kind-Prädikat einzeln; die Verschachtelung der Fälligkeits-Fenster
  (`Überfällig ⊂ Heute ⊂ Diese Woche`, `Langfristig` disjunkt); UND-Verknüpfung
  über mehrere Dimensionen; `CHILD_NONE` trifft `child_id === null`;
  `isFiltered` für Default und jede Einzelabweichung; Tagesgrenzen mit fixem
  `now`.
- **`features/tasks/stats.test.ts` (erweitert):** die drei Sortierstufen inkl.
  `due_time: null` ans Ende und alphabetischem Titel-Tiebreaker; `overdue` vs.
  `today` an der Mitternachtsgrenze; `doneRecent` vs. `doneToday`; dass
  `groupTasksByChild` denselben stabilen Comparator erbt.

## Dokumentation (gleicher Commit)

- **ADR-011** in [docs/decision-log.md](../../decision-log.md) — die
  Entscheidungen 1 bis 5 mit Begründung und Konsequenzen.
- **[docs/TODO.md](../../TODO.md)**, drei Einträge:
  - `patterns/homework.md` kennt keine Filterleiste, und der V2-Abschnitt nennt
    drei Sektionen, während der Screen jetzt bis zu fünf rendert. Mit dem
    Designer abstimmen, damit der Pattern-Doc die Anatomie mitführt.
  - Die zwölf neuen Keys fehlen in der designer-eigenen
    [docs/COPY.md](../../COPY.md) — dieselbe Baustelle wie `set.footer` und die
    Kalender-Keys.
  - Der bestehende Eintrag zum V1/V2-Umschalter wird **ergänzt**, nicht gelöscht:
    `useTasksByChild` ist weiterhin ungenutzt; ein Kind-_Filter_ ersetzt keine
    Kind-_Gruppierung_.

## Berührte Dateien

| Datei                                             | Art      |
| ------------------------------------------------- | -------- |
| `features/tasks/filter.ts`                        | neu      |
| `features/tasks/filter.test.ts`                   | neu      |
| `features/tasks/filterStore.ts`                   | neu      |
| `features/tasks/stats.ts`                         | geändert |
| `features/tasks/stats.test.ts`                    | geändert |
| `features/tasks/types.ts`                         | geändert |
| `features/tasks/queries.ts`                       | geändert |
| `features/tasks/index.ts`                         | geändert |
| `app-sections/shared/FilterChipRow.tsx`           | neu      |
| `app-sections/shared/index.ts`                    | geändert |
| `app-sections/(tabs)/aufgaben/AufgabenScreen.tsx` | geändert |
| `app-sections/(tabs)/aufgaben/TaskRow.tsx`        | geändert |
| `features/i18n/locales/de.json` · `en.json`       | geändert |
| `docs/decision-log.md` · `docs/TODO.md`           | geändert |

## Abnahmekriterien

1. Drei Chip-Reihen über der Liste; jede Einfachauswahl mit `Alle` als Default;
   die Kind-Reihe fehlt, wenn die Familie keine Kinder hat.
2. Jeder Chip erreicht 44×44 (36px Höhe + `hitSlop`).
3. Ein Chip-Tap wirkt ohne Netzwerk-Request und ohne Spinner.
4. Der Filter überlebt einen Tab-Wechsel und den Weg ins Aufgaben-Formular und
   zurück; ein App-Neustart setzt ihn auf `Alle`.
5. „Diese Woche" liefert genau so viele offene Aufgaben, wie die gleichnamige
   Stat-Kachel zählt.
6. Sobald ein Filter aktiv ist, erscheinen „Erledigt heute“ und „Zuletzt
   erledigt“; im ungefilterten Default-Zustand nur „Erledigt heute“.
7. Überfällige Aufgaben stehen unter „Überfällig", auch ohne aktiven Filter,
   und tragen die Pille „Überfällig" statt „Heute fällig".
8. Bei gleichem `due_date` sortiert die frühere `due_time` nach oben, Zeilen
   ohne Uhrzeit stehen alphabetisch am Ende.
9. Trifft der Filter nichts, erscheint `hw.filter.empty.*` mit Reset — nicht
   „Nichts zu tun".
10. Kein hartcodierter String im Screen; `bun run typecheck`, `bun lint`,
    `bun test` und `bunx expo export --platform web` laufen durch.
