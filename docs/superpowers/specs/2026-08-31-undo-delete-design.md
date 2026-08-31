# Rückgängig nach dem Löschen — Design

**Status:** Approved (Brainstorming Phase)
**Date:** 2026-08-31
**Decision-Log:** wird als ADR-026 referenziert nach Implementation

---

## 1. Context

Gelöschte Termine und Aufgaben sollen sich für einen kurzen Moment zurückholen lassen. Der Auftrag nennt drei Zutaten: eine verzögerte Delete-Mutation, einen Toast mit „Rückgängig"-Aktion, und beim Rückgängig ein Abbrechen der Mutation samt Wiederherstellung des lokalen Zustands.

Die [Toast-Komponente](../../../app-sections/shared/Toast.tsx) ist seit [ADR-025](../../decision-log.md) fertig und hat **null Aufrufer**. Dieses Feature wird ihr erster — das erlaubt an zwei Stellen eine saubere Entscheidung statt eines Kompromisses mit Bestandsverhalten (Decisions 8 und 9).

### Was der Auftrag annahm und was zutrifft

| Annahme                                | Realität                                                                                                                                                                                                             |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Meal-Plan-Einträge kommen „evtl." dazu | [features/meals/](../../../features/meals/) enthält **keine einzige Mutation** — kein `useMutation`, kein Delete. Es gibt dort nichts rückgängig zu machen.                                                          |
| „lokalen State wiederherstellen"       | Bei einer Mutation, die nie gelaufen ist, gibt es keinen Zustand wiederherzustellen. Das Item wird nur **versteckt**; Rückgängig heißt, das Verstecken zu beenden (Decision 1).                                      |
| Ein Delete ist ein Delete              | Beim Kalender sind es drei Operationen: `applyDeleteScope` schreibt je nach Scope eine Exception, kürzt die RRULE oder löscht die Master-Zeile ([recurrence.ts:113](../../../features/calendar/recurrence.ts#L113)). |

Die letzte ist die folgenreiche und zugleich das stärkste Argument für den gewählten Ansatz: Keine dieser drei Operationen ließe sich verlässlich zurück-mutieren, aber eine Mutation, die nie feuert, muss auch nicht zurückgenommen werden.

### Zielbild

Bestätigt der Nutzer eine Löschung, verschwindet das Item sofort aus jeder Liste, der Screen navigiert zurück, und unten steht fünf Sekunden lang ein Toast mit einem sichtbar ablaufenden Countdown und einer „Rückgängig"-Taste. Drückt er sie, ist das Item da, als wäre nichts gewesen — es hat den Server nie verlassen. Drückt er sie nicht, läuft die Löschung wie bisher.

### Was explizit nicht abgedeckt ist

- **Meal-Plan-Einträge** — es gibt keine Meal-Mutationen. Auch **kein** TODO-Eintrag dafür: erst müsste das Löschen selbst existieren.
- **Kinderprofile** (`child.deleteConfirmMsg`) und **Einladungslinks** (`familie.inviteRevoke*`) — nicht im Auftrag. Bei Kinderprofilen käme hinzu, dass ihre Bestätigungs-Copy im Handoff-Deck steht (siehe Decision 7).
- **Persistenz offener Löschungen** über einen App-Neustart hinweg — verworfen, siehe Decision 4.
- **Die `solid`-Variante des Toasts** — bleibt offen, wartet weiter auf den Allergie-Konflikt.

---

## 2. Architektur

```text
                 ┌──────────────────────────────┐
   Screen ──────▶│ useUndoableDelete()          │  app-sections/shared
   (Sheet)       │  · Toast zeigen (Undo-Aktion)│
                 │  · Fehler-Toast              │
                 └───────────┬──────────────────┘
                             │ schedule(kind, target, run)
                             ▼
                 ┌──────────────────────────────┐
                 │ pendingDeletes (Zustand)     │  features/shared — RN-frei
                 │  · Timer  · undo  · flush    │
                 └───┬──────────────────────┬───┘
        target lesen │                      │ nach UNDO_WINDOW_MS: run()
                     ▼                      ▼
      ┌──────────────────────┐   ┌───────────────────────┐
      │ useFamilyTasks       │   │ useDeleteTask         │
      │ useFamilyEvents      │   │ useDeleteEvent        │
      │  (filtern heraus)    │   │  (unverändert)        │
      └──────────────────────┘   └───────────────────────┘
```

Ein Store, zwei Filter, ein Timer. Die Delete-Mutationen selbst bleiben, was sie sind — sie werden nur später gerufen.

### 2.1 Der Store — `features/shared/pendingDeletes.ts`

```ts
export type PendingDeleteKind = "task" | "event";

export interface PendingDelete {
  id: string;
  kind: PendingDeleteKind;
  /** Vom besitzenden Feature interpretiert. Siehe Decision 2. */
  target: unknown;
  /** Was nach Ablauf des Fensters passiert. */
  run: () => Promise<void>;
}

interface PendingDeleteState {
  entries: PendingDelete[];
  /** Versteckt sofort, ruft `run` nach `delayMs`. Gibt die Id zurück. */
  schedule: (
    kind: PendingDeleteKind,
    target: unknown,
    run: () => Promise<void>,
    delayMs?: number,
  ) => string;
  /** Timer abbrechen, Eintrag entfernen — das Item ist im nächsten Render zurück. */
  undo: (id: string) => void;
  /** Alle offenen Löschungen sofort ausführen. Ruft der AppState-Hook. */
  flush: () => void;
}

export const UNDO_WINDOW_MS = 5000;
```

Bewusst **ohne `react-native`-Import**, aus demselben Grund wie [toastStore.ts](../../../app-sections/shared/toastStore.ts): so laufen die Tests unter Bun ohne die Mocks aus `bun.test.preload.ts`.

`schedule` nimmt `delayMs` mit Default `UNDO_WINDOW_MS`, damit die Tests mit einem 10-ms-Fenster auskommen, statt sich auf Fake-Timer zu verlassen, die Buns Runner nur teilweise trägt.

Der Eintrag verschwindet, **nachdem** `run()` gesettled ist — auch im Fehlerfall. Das ist die einzige Stelle, an der das Item wieder sichtbar wird; ein separater Rollback existiert nicht.

### 2.2 Der AppState-Hook — `features/shared/useFlushPendingDeletes.ts`

Eigene Datei, weil sie `react-native` importiert und der Store das nicht tun soll. Hängt einen `AppState`-Listener ein und ruft `flush()` beim Wechsel auf **`background`** — ausdrücklich **nicht** auf `inactive`. Auf iOS tritt `inactive` auch beim Herunterziehen des Kontrollzentrums, bei einer Anruf-Einblendung und in der App-Switcher-Vorschau auf; dort zu committen nähme dem Nutzer das Fenster weg, ohne dass er die App verlassen hat. Wird einmal in [app/\_layout.tsx](../../../app/_layout.tsx) gerufen.

### 2.3 Die Filter

**Tasks** — [features/tasks/queries.ts](../../../features/tasks/queries.ts), in `useFamilyTasks`: Set-Lookup auf `id`. Ein Selektor `usePendingTaskIds(): Set<string>` in `features/tasks/pendingDeletes.ts` macht den einen dokumentierten Cast von `target`.

**Events** — [features/calendar/hooks.ts](../../../features/calendar/hooks.ts), in `useFamilyEvents` **nach** `expandEvents`. Das Prädikat ist rein und liegt in `features/calendar/pendingDeletes.ts`:

```ts
export interface PendingEventDelete {
  eventId: string;
  occurrenceDate: string; // YYYY-MM-DD
  scope: EditScope; // "this" | "forward" | "all"
}

/** Ob diese offene Löschung die gegebene Occurrence verdeckt. */
export function hidesOccurrence(
  pending: PendingEventDelete,
  occurrence: { eventId: string; date: string },
): boolean;
```

| Scope     | verdeckt                                                         |
| --------- | ---------------------------------------------------------------- |
| `this`    | genau diese Occurrence (Event-Id **und** Datum)                  |
| `forward` | alle Occurrences des Events ab `occurrenceDate` (einschließlich) |
| `all`     | alle Occurrences des Events                                      |

Das sind exakt die drei Fälle, die `applyDeleteScope` serverseitig unterscheidet. Bei einem Einzeltermin fallen `this`, `forward` und `all` zusammen — das Prädikat braucht dafür keinen Sonderfall, weil es nur eine Occurrence gibt.

Weil der Filter im Hook sitzt und nicht im Screen, zieht auch die Konflikt-Prüfung in [EventCreateScreen](../../../app-sections/event/EventCreateScreen.tsx) mit, die auf `useFamilyEvents` aufsetzt: ein Termin im Löschfenster zählt dort nicht mehr als Konflikt. Dasselbe gilt für das Dashboard, das denselben Hook liest.

**Nicht gefiltert wird `useEvent`** — der Detail-Fetch mit eigenem Query-Key (`calendarKeys.one`). Siehe Decision 6.

### 2.4 Der Aufruf-Hook — `app-sections/shared/useUndoableDelete.ts`

```ts
interface UndoableDeleteArgs {
  kind: PendingDeleteKind;
  target: unknown;
  /** Toast-Titel, z. B. t("hw.delete.undoTitle"). */
  title: string;
  /** Toast-Message: Item-Titel, bei Serien mit Scope-Zusatz. */
  message: string;
  run: () => Promise<void>;
  errorTitle: string;
  formatError: (err: unknown) => string;
}
```

Liegt in `app-sections/`, **nicht** in `features/`: er braucht `useToast()`, und `features/*` importiert nirgends aus `app-sections/*`. Diese Richtung umzudrehen wäre die teuerste Zeile dieses Auftrags.

Er zeigt den Toast, merkt sich dessen Id, und baut das `run`, das der Store ausführt: Toast schließen → `mutateAsync` → im Fehlerfall Fehler-Toast.

---

## 3. Entscheidungen

**Decision 1 — Verstecken statt Cache-Manipulation.** Der Store hält, was „im Fenster" ist; die beiden Listen-Hooks filtern es heraus. Rückgängig entfernt den Eintrag — es gab nie eine Cache-Änderung, die man zurücknehmen müsste. Die Alternative (optimistisch aus dem Cache patchen, Snapshot merken, bei Undo zurückschreiben, wie `useDeleteTask` es heute für seinen kurzen Mutationslauf tut) scheitert am Kalender: der Range-Cache hält **Master-Zeilen**, keine Occurrences. Ein `scope: "this"`-Delete auf einer Serie müsste eine synthetische Exception in die gecachte Zeile schreiben, damit `expandEvents` die Occurrence fallen lässt — also Server-Semantik im Client nachbauen. Dazu überholt jeder Refetch im Fenster den Snapshot, und das Undo schriebe veraltete Daten zurück.

**Decision 2 — `target: unknown` mit einem Cast pro Feature.** Ein typisiertes Union in `features/shared` müsste `EditScope` aus `features/calendar` importieren und damit die Abhängigkeitsrichtung umdrehen (`features/tasks` importiert bereits `features/shared`). Eine generische Store-Fabrik pro Feature wäre voll typisiert, bräuchte aber eine Registry, damit `flush()` alle Instanzen erreicht — mehr Maschinerie als der eine Cast wert ist. `kind` ist der Diskriminator, der ihn absichert; jedes Feature macht ihn genau einmal, in seinem eigenen Selektor, mit Kommentar.

**Decision 3 — Der Timer gehört dem Store, nicht dem Toast.** Der Toast bekommt `durationMs = UNDO_WINDOW_MS` und zeichnet den Countdown, aber er ist Darstellung. Hinge der Commit am Toast-Lebenszyklus, entschiede die Stapel-Obergrenze (`max: 2`) mit darüber, ob eine Löschung stattfindet — ein dritter Toast verdrängt den ältesten, und mit ihm die Löschung.

**Decision 4 — Beim Wechsel in den Hintergrund wird sofort committet.** Damit ist das Löschen deterministisch: entweder der Nutzer drückt innerhalb des Fensters Rückgängig, oder es passiert wirklich. Die Alternative — Timer einfach laufen lassen — hieße, dass ein App-Kill im Fenster die Mutation verschluckt: das Item ist lokal weg, kommt aber beim nächsten Refetch wieder, ohne dass der Nutzer etwas getan hätte. Persistenz in AsyncStorage wurde verworfen: eine Löschung, die Stunden später still nachfeuert, ist schlechter nachvollziehbar als eine, die beim Verlassen der App abschließt.

**Decision 5 — Der Bestätigungsdialog bleibt, Undo kommt dazu.** Bewusst gegen die übliche Lesart, nach der Undo die Bestätigung _ersetzt_. Beim Serientermin wählt der Dialog ohnehin den Scope (dieser / ab hier / alle), lässt sich also nicht ersatzlos streichen; und ein zweiter Ausstieg schadet bei einer Löschung nicht. Die Kosten sind ein zusätzlicher Tap, den der Bestand schon hatte.

**Decision 6 — `useEvent` wird nicht gefiltert.** Ihn mitzufiltern hieße, den Detail-Screen für die Dauer des Fensters auf „nicht gefunden" zu werfen, obwohl der Nutzer ihn gerade verlässt. Erreichbar wäre der Zustand ohnehin nur per Deep Link auf ein Event, das man in derselben Sitzung eben gelöscht hat.

Bei Tasks liegt der Fall anders und braucht keine Ausnahme: `useTask` ist ein Selektor **auf** `useFamilyTasks` ([queries.ts:104](../../../features/tasks/queries.ts#L104)), filtert also automatisch mit. Der `hydrated`-Guard in [TaskEditScreen.tsx:128](../../../app-sections/task/TaskEditScreen.tsx#L128) fängt das bereits ab — er existiert genau für diese Lücke, die `onMutate` heute schon reißt.

**Decision 7 — Die Bestätigungs-Copy wird korrigiert, nicht behalten.** `cal.delete.confirmBody` und `hw.delete.confirmBody` sagen heute beide _„Diese Aktion kann nicht rückgängig gemacht werden."_ Das wird durch dieses Feature unwahr. Beide Keys stehen **nicht** in [COPY.md](../../COPY.md) — sie sind vom Engineering hinzugekommen; das Deck führt nur `child.deleteConfirmMsg` mit derselben Aussage, und Kinderprofile bleiben außen vor. Das Handoff-Bundle wird also nicht angefasst.

**Decision 8 — Ein Druck auf die Toast-Aktion schließt den Toast.** Heute ruft [Toast.tsx:213](../../../app-sections/shared/Toast.tsx#L213) nur `entry.action.onPress`; der Toast bliebe nach „Rückgängig" stehen. Da es noch keinen Aufrufer gibt, wird das zum Standardverhalten statt zu einem Flag — es gibt keine Aktion, nach der ein Stehenbleiben richtig wäre. Der Schließweg ist `close()`, also mit Ausblend-Animation, nicht `dismiss()`.

**Decision 9 — Die Timer-Leiste wird gebaut.** `progressBar: { height: 2.5, opacity: 0.35 }` steht in `DS.components.toast` und in [patterns/toast.md](../../../patterns/toast.md), war aber nicht Teil von ADR-025. Beim Undo ist der Countdown zum ersten Mal funktional statt dekorativ: er sagt dem Nutzer, wie lange die Ausstiegsluke offen ist. `Animated` mit `scaleX` 1 → 0 über `entry.durationMs`, `useNativeDriver: true`, dazu `transformOrigin: "left"` als Style — RN unterstützt die Eigenschaft seit 0.74, das Repo steht auf 0.86. Ohne sie skalierte die Leiste um ihre Mitte und liefe von beiden Seiten nach innen zu. Läuft nur, wenn `durationMs != null`. Bei „Bewegung reduzieren" entfällt sie ganz statt zu springen.

**Decision 10 — Fünf Sekunden statt der drei aus dem Auftrag.** Die 3200 ms, die das Pattern für `success` nennt, gelten für eine Bestätigung, die man nur zur Kenntnis nimmt. Hier muss der Nutzer sie bemerken, lesen, hinlangen und treffen — während der Screen sich unter ihm gewechselt hat, weil wir zurücknavigieren.

**Decision 11 — Variante `success`, Position `bottom`.** `bottom` (Offset 96 + Home-Indicator, räumt die Tab-Bar), weil bei einer Aktion mit Ablaufdatum Daumenreichweite mehr zählt als der Pattern-Default `top`. `success` statt `info` **wegen des Glyphs**: `info` trägt `sparkles` ([Toast.tsx:23](../../../app-sections/shared/Toast.tsx#L23)), und Funkeln ist in dieser Designsprache an KI vergeben. Eine Löschbestätigung mit KI-Icon wäre falsch; `check` sagt korrekt „was du wolltest, ist passiert".

Der Toast überschreibt `durationMs` explizit und verletzt damit bewusst die Pattern-Regel _„ein Toast mit Aktion läuft nie ab"_ — hier **ist** das Ablaufen die Semantik. [toastStore.ts:59](../../../app-sections/shared/toastStore.ts#L59) sanktioniert den Vorrang des expliziten Werts bereits als Regel 1.

**Decision 12 — Der Fehlerfall wandert vom `Alert` zum Toast.** Schlägt die Löschung nach Ablauf des Fensters fehl, steht der Nutzer längst woanders; ein `Alert.alert` fünf Sekunden später auf einem fremden Screen wäre ein Überfall. Stattdessen: Eintrag raus (das Item ist im selben Moment wieder da) und ein `error`-Toast mit den bestehenden Keys `cal.delete.error` / `hw.delete.error`. Fehler-Toasts laufen nie ab und tragen ihr ✕.

---

## 4. Copy

Neue Keys, DE kanonisch, EN gespiegelt:

| Key                           | DE               | EN            |
| ----------------------------- | ---------------- | ------------- |
| `action.undo`                 | Rückgängig       | Undo          |
| `cal.delete.undoTitle`        | Termin gelöscht  | Event deleted |
| `cal.delete.undoScopeForward` | ab {{date}}      | from {{date}} |
| `cal.delete.undoScopeAll`     | ganze Serie      | entire series |
| `hw.delete.undoTitle`         | Aufgabe gelöscht | Task deleted  |

Geänderte Keys (Decision 7):

| Key                      | vorher                                             | nachher                                        |
| ------------------------ | -------------------------------------------------- | ---------------------------------------------- |
| `cal.delete.confirmBody` | Diese Aktion kann nicht rückgängig gemacht werden. | Du kannst das direkt danach rückgängig machen. |
| `hw.delete.confirmBody`  | Diese Aktion kann nicht rückgängig gemacht werden. | Du kannst das direkt danach rückgängig machen. |

EN jeweils: _You can undo this right afterwards._

Entfallende Keys: `cal.delete.deleting` und `hw.delete.deleting` („Lösche…") — siehe Abschnitt 5.

Die Toast-Message ist der Item-Titel, bei Serien mit `·` und dem Scope-Zusatz: „Bens Fußballtraining · ganze Serie". Ohne diese Angabe wäre der Toast Dekoration; das Pattern verlangt die Spezifika, an denen sich das Ergebnis prüfen lässt. Das `·` ist Interpunktion nach Hausbrauch, keine Copy.

---

## 5. Änderungen im Bestand

- **[features/calendar/mutations.ts](../../../features/calendar/mutations.ts)** — `useDeleteEvent.onSuccess` macht heute `void qc.invalidateQueries(…)`. Das wird ein `return`, wie `useDeleteTask` es schon tut: der Store entfernt den Eintrag erst, wenn `mutateAsync` durch ist; ohne das Warten blitzt das Item für einen Frame zurück, bevor der Refetch es erneut entfernt. (`useUpdateEvent` bleibt unangetastet — außerhalb des Auftrags.)
- **Toter Code an beiden Löschknöpfen.** `deleteMutation.isPending` wird nie mehr sichtbar wahr: der Screen ist weg, bevor die Mutation startet. Die `isPending`-Guards, die Deaktivierung und die „Lösche…"-Beschriftung in [EventDetailScreen](../../../app-sections/event/EventDetailScreen.tsx) und [TaskEditScreen](../../../app-sections/task/TaskEditScreen.tsx) entfallen samt ihrer Keys. Doppel-Taps sind ausgeschlossen, weil sofort zurücknavigiert wird.
- **Sheet-Interaktion, bewusst so gelassen.** Beide Löschknöpfe sitzen in `formSheet`-Screens ([\_layout.tsx:33](../../../app/_layout.tsx#L33) und [:85](../../../app/_layout.tsx#L85)) — genau die Konstellation, für die [TODO.md](../../TODO.md) notiert, dass Toasts hinter dem Sheet landen. Hier harmlos: wir navigieren sofort zurück, das Sheet ist in ~300 ms weg, das Fenster dauert 5 s. Der Toast schiebt sich also hinter dem schließenden Sheet hervor. Kein zweiter `ToastProvider` nötig.

### TODO-Bilanz

| Eintrag                                                                                     | Wird                                                                                     |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| „Undo nach Delete (Snackbar mit Re-Insert-Logic)"                                           | gelöscht — eingelöst; die Klammer beschreibt zudem einen Ansatz, den Decision 1 verwirft |
| „Noch kein Aufrufer" für `useToast()`                                                       | gelöscht — dieses Feature ist er                                                         |
| „`solid` und der Timer-Balken sind nicht gebaut"                                            | auf `solid` verkürzt (Decision 9)                                                        |
| „Toast-Component statt `Alert.alert` für transiente Hinweise (Edit-Save-Done, Delete-Done)" | auf den Save-Fall verkürzt                                                               |

---

## 6. Tests

Zwei neue Suites, beide reines TypeScript unter `bun test`.

**`features/shared/pendingDeletes.test.ts`**

- `schedule` legt einen Eintrag an und gibt seine Id zurück
- `undo` entfernt den Eintrag **und** verhindert, dass `run` je läuft
- nach Ablauf von `delayMs` läuft `run` genau einmal
- der Eintrag verschwindet erst, nachdem `run` gesettled ist
- ein fehlgeschlagenes `run` entfernt den Eintrag ebenfalls (kein Zombie)
- `flush` führt alle offenen Löschungen sofort aus und leert die Liste
- zwei parallele Löschungen stören einander nicht

**`features/calendar/pendingDeletes.test.ts`** — `hidesOccurrence`

- `this` verdeckt nur die Occurrence mit passendem Datum, nicht die Nachbarn
- `forward` verdeckt den Stichtag selbst (Randfall) und alles danach, nichts davor
- `all` verdeckt jede Occurrence des Events
- kein Scope greift auf ein fremdes Event
- Einzeltermin: alle drei Scopes verdecken die eine Occurrence

Für die Toast-Timer-Leiste kein eigener Test — sie ist Animation ohne Verzweigung; geprüft wird sie in der Web-Sichtprüfung.

**Sichtprüfung** (Web, wie bei ADR-025): Aufgabe löschen → Toast unten mit ablaufender Leiste → Rückgängig → Aufgabe ist zurück. Serientermin mit Scope „alle" → Toast nennt „ganze Serie". Fenster auslaufen lassen → Item bleibt weg. Beides in Light und Dark.

---

## 7. Dateien

**Neu**

```
features/shared/pendingDeletes.ts
features/shared/pendingDeletes.test.ts
features/shared/useFlushPendingDeletes.ts
features/calendar/pendingDeletes.ts
features/calendar/pendingDeletes.test.ts
features/tasks/pendingDeletes.ts
app-sections/shared/useUndoableDelete.ts
```

**Geändert**

```
features/shared/index.ts               Barrel
features/calendar/hooks.ts             Filter in useFamilyEvents
features/calendar/mutations.ts         onSuccess gibt das Invalidate zurück
features/calendar/index.ts             Barrel
features/tasks/queries.ts              Filter in useFamilyTasks
features/tasks/index.ts                Barrel
app-sections/shared/Toast.tsx          Aktion schließt · Timer-Leiste
app-sections/shared/index.ts           Barrel
app-sections/event/EventDetailScreen.tsx
app-sections/task/TaskEditScreen.tsx
app/_layout.tsx                        useFlushPendingDeletes()
features/i18n/locales/de.json
features/i18n/locales/en.json
docs/decision-log.md                   ADR-026
docs/TODO.md                           siehe TODO-Bilanz
CLAUDE.md                              Ordnerstruktur
```
