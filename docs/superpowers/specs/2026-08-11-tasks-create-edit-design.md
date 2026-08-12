# Spec · Aufgaben anlegen und bearbeiten

**Datum:** 2026-08-11 · **Branch:** `feat/tasks-create-edit-form` · **Status:** freigegeben

## Ziel

Nutzer können Hausaufgaben und andere Tasks **anlegen**, **bearbeiten** und
**löschen**. Zwei neue Screens unter `app-sections/task/`, zwei neue Routen, und
damit sind alle vier Mutations aus `features/tasks` verdrahtet.

Schließt die Tasks-Reihe ab: Der Layer ist seit PR #63 lesend, seit PR #64
schreibfähig, und seit der letzten Iteration zeigt der
[AufgabenScreen](<../../../app-sections/(tabs)/aufgaben/AufgabenScreen.tsx>)
echte Daten — kann sie aber nur abhaken.

## Scope

**Drin:** `TaskCreateScreen` + `TaskEditScreen` mit geteiltem `TaskForm`, Routen
in Expo Router, Einstiegspunkte auf dem AufgabenScreen und in der Task-Zeile,
Löschen mit Bestätigung, reine Form-Helfer in `features/tasks/form.ts` samt
Tests, Umzug dreier Form-Bausteine nach `app-sections/shared/` inklusive
Web-Zweig für den Datums-Picker, neue `hw.*`-Keys in beiden Katalogen.

**Bewusst draußen:**

- **Dringlichkeits-Override.** `patterns/homework.md` sieht vor, einen
  `longTerm`-Task als urgent zu flaggen — die `tasks`-Tabelle hat dafür keine
  Spalte, und Dringlichkeit ist heute vollständig aus `due_date` abgeleitet
  ([stats.ts](../../../features/tasks/stats.ts)). Ein Override wäre eine zweite
  Wahrheitsquelle plus Migration plus Anpassung der Sektionierung: eigene
  Iteration, wenn der Bedarf real wird.
- **Erledigt-Schalter im Formular.** Status bleibt die Checkbox in der Zeile.
  `useToggleTaskDone` schreibt `is_done`, `completed_at` und `completed_by`
  gemeinsam (symmetrischer CHECK); ein zweiter Schreibweg im Formular müsste
  dieselbe Invariante noch einmal einhalten.
- **Task-Detail-Screen.** Der Zeilentap führt direkt ins Formular. Ein
  Lese-Sheet wie beim Kalender bringt für Tasks nichts dazu — es gibt keine
  Serien, keine Teilnehmer, keine Occurrence-Logik zu erklären.
- **Optimistisches Anlegen.** `useCreateTask` invalidiert weiterhin nur (siehe
  Kommentar in [mutations.ts](../../../features/tasks/mutations.ts)).
- **Voice-Add.** Der `hw.addVoice`-Button bleibt der Stub, der er ist.
- **Task-Reminder.** Keine Zustellung vorhanden.

Keine Migration, kein Types-Regen, kein Eingriff ins Handoff-Bundle.

## Ausgangslage

Der Daten-Layer ist vollständig. `useCreateTask` nimmt
`{ typeId, title, dueDate, childId?, description?, subject?, dueTime? }`,
`useUpdateTask` nimmt `TaskChanges` — `title`, `description`, `subject`,
`due_date`, `due_time`, `child_id`, `type_id`. Genau dieser Feldsatz ist das
Formular.

Drei Dinge, die die Aufgabenstellung nennt, haben keine Entsprechung im Schema:

- **Dringlichkeit** — keine Spalte, abgeleitet aus `due_date`.
- **Status** — `is_done` als Boolean, und der gehört der Zeilen-Checkbox.
- **Fach** — existiert als `tasks.subject` (Freitext, nullable). Der
  Spaltenkommentar nennt es „Homework-specific: NULL for non-homework task
  types"; das ist eine Erwartung an die Nutzung, keine Beschränkung.

Was die Aufgabenstellung **nicht** nennt, aber zwingend ins Formular muss:
`tasks.type_id` ist `not null`. Ohne Typ-Auswahl ist kein Insert möglich.

`patterns/homework.md` beschreibt kein Anlege- oder Bearbeiten-Formular — der
Pattern-Doc kennt nur die drei Listen-Varianten und den Voice-Add-Flow. Diese
Iteration folgt deshalb dem etablierten **Kalender-Formularmuster**
(`EventCreateScreen`/`EventEditScreen`): Sheet-Präsentation, Pflichtfelder oben,
Abbrechen rechts in der Kopfzeile, Speichern unten über einer Trennlinie. Das
ist eine bewusste Ergänzung des Handoff-Bundles, keine stille Abweichung; der
Pattern-Doc gehört dem Designer und wird nicht editiert.

## Architektur

```
app/task/new.tsx              → re-export TaskCreateScreen
app/task/edit/[id].tsx        → re-export TaskEditScreen

app-sections/task/
├─ TaskCreateScreen.tsx   Defaults + useCreateTask
├─ TaskEditScreen.tsx     Hydration + useUpdateTask + useDeleteTask
└─ TaskForm.tsx           Reine Darstellung: Werte rein, Callbacks raus

features/tasks/form.ts        Reine Helfer (Validierung, Serialisierung)
features/tasks/form.test.ts
```

Beide Screens teilen sich `TaskForm`. Der Kalender dupliziert seine beiden
Formulare, weil sie sich unterscheiden (Ganztägig-Switch und Kollisionshinweis
nur beim Anlegen, Scope-Dialog nur beim Bearbeiten). Bei Tasks ist der Feldsatz
identisch; unterschiedlich sind nur Defaults, Mutation und der Löschen-Button.
Zwei Kopien desselben Formulars würden garantiert auseinanderdriften.

`TaskForm` hält **keinen** State und ruft **keine** Mutation. Es bekommt einen
`TaskFormState` plus einen `onChange`-Callback pro Feld und die Fehlermeldungen
als bereits übersetzte Strings. Damit ist es ohne Query-Client verständlich, und
die beiden Screens bleiben die einzigen Stellen, an denen Daten fließen.

### Routen

In [app/\_layout.tsx](../../../app/_layout.tsx), analog zu `event/new` und
`event/edit/[id]`:

| Route            | Präsentation | Detent |
| ---------------- | ------------ | ------ |
| `task/new`       | `formSheet`  | 0.9    |
| `task/edit/[id]` | `formSheet`  | 0.85   |

Dazu wie dort: `headerShown: false`, `gestureEnabled`, `sheetCornerRadius: 26`,
`sheetGrabberVisible`, `sheetExpandsWhenScrolledToEdge: false`,
`contentStyle: { backgroundColor: theme.card }`.

Die Dateien in `app/` bleiben Ein-Zeilen-Re-Exports (Routing-Konvention aus
CLAUDE.md).

### Einstiegspunkte

**Anlegen** — Button `hw.add` auf dem AufgabenScreen, direkt über dem
Sprach-Button, `tone="primary"`, `block`. `router.push("/task/new")`. Der
Button steht **außerhalb** des Lade-/Fehler-Zweigs: eine Aufgabe anzulegen muss
auch dann gehen, wenn die Liste gerade nicht lädt.

**Bearbeiten** — Der Zeilenkörper in
[TaskRow.tsx](<../../../app-sections/(tabs)/aufgaben/TaskRow.tsx>) wird
pressbar: `router.push({ pathname: "/task/edit/[id]", params: { id: task.id } })`.
Die Checkbox bleibt ihre eigene `Pressable` mit 44×44 — sie liegt vor dem
Zeilenkörper und fängt ihre Taps selbst ab. Der Zeilenkörper bekommt
`accessibilityRole="button"` und als Label den Task-Titel; die Checkbox behält
ihre `checkbox`-Rolle.

Kein Einstieg über das Dashboard in dieser Iteration.

### Formularfelder

| Feld             | Spalte        | Pflicht | Steuerelement                          |
| ---------------- | ------------- | ------- | -------------------------------------- |
| Typ              | `type_id`     | ja      | Pills (`TypePicker`)                   |
| Kind             | `child_id`    | nein    | Avatare + „Ohne Kind" (`MemberPicker`) |
| Titel            | `title`       | **ja**  | `Field`                                |
| Fach             | `subject`     | nein    | `Field`, Freitext                      |
| Fälligkeitsdatum | `due_date`    | **ja**  | `Field` → `DateTimePickerSheet`        |
| Uhrzeit          | `due_time`    | nein    | `Field` → Picker, entfernbar           |
| Notizen          | `description` | nein    | `Field`, mehrzeilig                    |

Reihenfolge im Screen: Typ, Kind, Titel, Fach, Datum + Uhrzeit nebeneinander,
Notizen. Pflichtfelder zuerst, wie im Kalender-Formular.

**Typ** — Default beim Anlegen ist `hausaufgaben`, sonst die erste gelieferte
Zeile; gesetzt über dasselbe „hydrate once"-Muster wie `EventCreateScreen`
(`typeHydrated`-Flag statt Effekt). Beim Bearbeiten kommt der Wert aus der Task.

**Kind** — Nur Kinder, keine Eltern: `tasks` kennt kein `parent_id`. Die
„Ohne Kind"-Auswahl schreibt `child_id: null` und deckt Besorgungen und
Eltern-Aufgaben ab.

**Fach** — immer sichtbar, auch bei Typ `besorgung`. Ein typabhängiges Ein- und
Ausblenden würde die Frage aufwerfen, was mit einem bereits eingetragenen Fach
passiert, wenn der Typ wechselt — löschen wäre Datenverlust, behalten wäre ein
unsichtbarer Wert. Ein optionales Feld, das leer bleiben darf, hat dieses
Problem nicht.

**Uhrzeit** — leer heißt „—". Ist eine Uhrzeit gesetzt, erscheint darunter ein
Text-Button `hw.form.clearTime`, der sie wieder auf `null` setzt. Ohne den
Button wäre `due_time` einmal gesetzt nie wieder zu entfernen.

### Validierung

Als reine Funktionen in `features/tasks/form.ts`, nicht im Screen — dieselbe
Trennung wie `stats.ts` und `optimistic.ts`, und damit unter Test:

```ts
export interface TaskFormState {
  typeId: string | null;
  childId: string | null;
  title: string;
  subject: string;
  dueDate: Date;
  dueTime: Date | null;
  notes: string;
}

export interface TaskFormErrors {
  title?: TaskFormErrorKey;
  typeId?: TaskFormErrorKey;
  dueDate?: TaskFormErrorKey;
}

export function emptyTaskForm(now: Date): TaskFormState;
export function taskToForm(task: TaskWithType): TaskFormState;
export function validateTaskForm(state: TaskFormState): TaskFormErrors;
export function toCreateVars(state: TaskFormState): CreateTaskVars | null;
export function toTaskChanges(state: TaskFormState): TaskChanges | null;
```

Beide Serialisierer geben `null` zurück, wenn der State nicht validiert oder
`typeId` fehlt — `type_id` ist `not null`, und ein `CreateTaskVars` mit `null`
darin gibt es nicht. Die Screens prüfen das Ergebnis, bevor sie die Mutation
rufen; das ist der Typ-Backstop hinter dem deaktivierten Speichern-Button.

Die Fehler kommen als **i18n-Keys** zurück, nicht als fertige Strings —
Präzedenz ist `mapTaskError` in [errors.ts](../../../features/tasks/errors.ts):
der Layer klassifiziert, der Screen übersetzt.

| Regel                             | Key                      |
| --------------------------------- | ------------------------ |
| `title.trim()` ist leer           | `hw.error.titleRequired` |
| `typeId` ist `null`               | `hw.error.typeRequired`  |
| `dueDate` ist kein gültiges Datum | `hw.error.dateRequired`  |

Das Datum ist per Konstruktion gesetzt — der Picker kann es nicht leeren, und
beim Anlegen steht es auf heute. Die Prüfung greift trotzdem: `taskToForm` läuft
über `parseISO(task.due_date)`, und eine Zeile mit kaputtem `due_date` würde
sonst als `Invalid Date` durchs Formular und in `format()` laufen. `isValid` aus
`date-fns` ist die Prüfung.

Speichern ist deaktiviert, solange ein Fehler offen ist oder die Mutation läuft.
Fehlermeldungen hängen am Feld (`Field`-`error`-Prop), nicht in einer Sammelzeile.

### Serialisierung

`due_date` ist ein Postgres-`date`, `due_time` eine `time`:

- `dueDate` → `format(state.dueDate, "yyyy-MM-dd")` — **lokal**, nie
  `toISOString()`. Eine ISO-Konvertierung würde am Abend in UTC+2 auf den
  Vortag rutschen.
- `dueTime` → `format(state.dueTime, "HH:mm:ss")` oder `null`.
- Beim Hydrieren zurück über `parseISO(task.due_date)` und, für die Uhrzeit,
  `parse(task.due_time, "HH:mm:ss", referenceDate)`. `parseISO` statt
  `new Date()`, aus demselben Grund wie in `TaskRow` — `new Date("2026-08-11")`
  liest UTC-Mitternacht und verschiebt den Tag.
- Leere Freitextfelder werden zu `null`, nicht zu `""` — `state.subject.trim() || null`
  für `subject` und `state.notes.trim() || null` für `description`, konsistent mit
  `EventCreateScreen`. `title` ist Pflichtfeld und wird nur getrimmt, nie genullt.

`toTaskChanges` schickt **immer den vollen bearbeitbaren Feldsatz**, nicht nur
die geänderten Felder. Ein Diff wäre hier nur Aufwand: `applyUpdate` merged
ohnehin, und die Menge ist klein genug, dass ein vollständiger `UPDATE` keine
Kosten hat.

### Datenquelle des Edit-Screens

Es gibt keine Einzel-Query für eine Task. Statt eine zweite anzulegen, kommt
`useTask(id)` als **Selektor über `useFamilyTasks()`** nach
[queries.ts](../../../features/tasks/queries.ts):

```ts
export function useTask(taskId: string): {
  data: TaskWithType | undefined;
  isLoading: boolean;
  error: unknown;
  refetch: () => void;
};
```

`error` und `refetch` reicht der Hook mit durch, damit der Edit-Screen einen
fehlgeschlagenen Ladevorgang von „gibt es nicht" unterscheiden kann — sonst
meldet er dem Nutzer beim Offline-Deep-Link, seine Aufgabe sei weg.

Eine Query, ein Cache-Eintrag — und damit derselbe, den die vier Mutations
bereits patchen. Ein eigener `taskKeys.detail(id)`-Eintrag wäre eine zweite
Kopie derselben Zeile, die niemand invalidiert.

Preis: Das Fenster von `useFamilyTasks` umfasst alle offenen und alle vor
weniger als sieben Tagen erledigten Aufgaben — was außerhalb liegt, ist im
Edit-Screen nicht erreichbar. Das trifft nur den Deep-Link auf eine lange
erledigte Aufgabe; aus der Liste heraus ist jede angezeigte Zeile per
Definition im Cache. Dieser Fall bekommt die Not-Found-Karte.

### Zustände

| Zustand                 | Darstellung                                                             |
| ----------------------- | ----------------------------------------------------------------------- |
| Edit lädt (`isLoading`) | Platzhalter-Block wie in `EventEditScreen`                              |
| Laden fehlgeschlagen    | Karte `hw.loadError` + `t(mapTaskError(error))` + Button `action.retry` |
| Task nicht gefunden     | Karte `hw.notFound` + Button `action.back`                              |
| Mutation läuft          | Speichern-Button zeigt `hw.*.saving`, ist deaktiviert                   |
| Mutationsfehler         | Caption in `danger` unter dem Formular, Text `t(mapTaskError(err))`     |
| Erfolg                  | zurück zur Liste                                                        |

Zurück heißt `router.back()`, wenn es eine History gibt, sonst `router.replace`
auf den Aufgaben-Tab: Beide Screens sind per Deep-Link direkt erreichbar, und
nach einem Cold-Start gibt es nichts, wohin `back()` führen könnte.

Fehler laufen über `mapTaskError` — kein roher `error.message` im UI, anders als
in den Kalender-Formularen, die die Supabase-Meldung anhängen. Die
Klassifizierung liegt bereits in `features/tasks`. Zwei Fälle sind dabei
auseinanderzuhalten:

- **`hw.error.staleReference`** („Kind oder Aufgabentyp existiert nicht mehr")
  gilt ausschließlich für eine ins Leere zeigende **Fremdschlüssel-Referenz**
  — `child_id` oder `type_id` (Postgres 23503).
- **`hw.error.generic`** deckt die **verschwundene Task-Zeile** ab: Löscht ein
  anderes Familienmitglied die Aufgabe, während jemand sie bearbeitet, trifft
  das `UPDATE` keine Zeile. Supabase meldet dafür keinen Fehler, deshalb
  erkennt `useUpdateTask` den Fall selbst und wirft — mit einem einfachen
  `Error`, den `mapTaskError` auf `generic` abbildet. `staleReference` wäre hier
  falsch: seine Copy benennt Kind und Aufgabentyp, nicht die Aufgabe selbst.

### Löschen

Unten im Edit-Screen, unter dem Speichern-Button und optisch abgesetzt:
`variant="soft"`, `tone="danger"`. Tap öffnet die Rückfrage mit
`hw.delete.confirmTitle` / `hw.delete.confirmBody`, Bestätigung ruft
`useDeleteTask` und geht zurück zur Liste. Fehlschlag zeigt `hw.delete.error`
plus `t(mapTaskError(err))`.

Beide Dialoge laufen über die Helfer aus `app-sections/shared/confirmDialog.ts`
— `confirmDestructive` für die Ja/Nein-Rückfrage, `showAlert` für die
Fehlermeldung —, nicht über `Alert.alert` direkt: `Alert` ist auf
react-native-web für beide Fälle ein No-op, ein Löschen hinter einem
Alert-Callback würde dort still nie feuern und ein Fehlschlag unbemerkt bleiben
(ADR-010, Decision 6). Kopfzeilen und Ablauf folgen `EventDetailScreen`.

## Geteilte Form-Bausteine

Drei Komponenten wandern von `app-sections/event/` nach
`app-sections/shared/`. Grund ist nicht Ordnungsliebe, sondern die
Schichtgrenze: Ein Task-Screen, der `app-sections/event/` importiert, koppelt
zwei Features aneinander, die nichts miteinander zu tun haben — und `MemberPicker`
und `TypePicker` sind bereits heute generisch genug, dass die Kopplung reine
Formsache wäre.

### `DateTimePickerSheet` → `shared/`, neutrale API + Web-Zweig

Heute ist das Sheet an `DateRange` und `RangeField` aus `features/calendar`
gebunden und entscheidet selbst, welches Ende des Bereichs es bearbeitet. Neu:

```ts
interface DateTimePickerSheetProps {
  /** `null` rendert nichts. */
  mode: "date" | "time" | null;
  value: Date;
  onPick: (selected: Date) => void;
  onClose: () => void;
}
```

Die Range-Logik (`isEndField`, Auswahl von `startAt` vs. `endAt`,
`applyRangePick`) zieht in die beiden Event-Screens — sie ist Kalender-Wissen und
gehört dorthin. Beide Screens halten ihren `RangeField`-State unverändert und
mappen ihn beim Rendern auf `mode` + `value`.

Dazu eine **Plattform-Datei** `DateTimePickerSheet.web.tsx` mit
`<input type="date">` bzw. `type="time"` in derselben Modal-Hülle. Metro wählt
sie auf Web automatisch, `@react-native-community/datetimepicker` landet dort
gar nicht erst im Bundle. Das erledigt den offenen Backlog-Eintrag „Datums-/
Zeit-Picker rendert auf Web nicht" — für Aufgaben **und** Kalender, weil beide
dieselbe Komponente benutzen. Ohne diesen Zweig wäre das neue Formular auf Web
nicht bedienbar und damit auch nicht per `bun run web` prüfbar, dem schnellsten
Smoke-Test-Weg des Repos.

Der Web-Zweig arbeitet mit `yyyy-MM-dd`- und `HH:mm`-Strings, wie das native
`<input>` sie erwartet, und gibt über `onPick` ein `Date` zurück — die API des
Sheets bleibt auf beiden Plattformen identisch.

### `MemberPicker` → `shared/`

Unverändert übernommen; die eine Call-Site in `EventCreateScreen` bekommt einen
neuen Import. Aufgaben übergeben ausschließlich `kind: "child"`-Optionen und
lesen aus der Auswahl nur die `id`.

### `TypePicker` → `shared/`, generalisiert

Heute löst die Komponente Farbe und Label selbst auf — über `eventColorFor` und
`typeLabelsForSlug`, also über Kalender-Wissen. Neu nimmt sie die fertigen Werte
entgegen:

```ts
interface TypePickerItem {
  id: string;
  label: string;
  color: string;
}
```

Der Kalender mappt seine `event_types` weiterhin über
`eventColorFor`/`typeLabelsForSlug`, Aufgaben über `taskTypeColorFor` und die
neuen `hw.type.*`-Keys. Die Pill-Darstellung — Farbpunkt, Rahmen, Auswahlzustand
— existiert danach einmal statt zweimal.

Warum die Labels aus dem Katalog und nicht aus `task_types.label`: Die jsonb-
Spalte ist mit ausschließlich `{"de": …}` geseedet
(`20260529091455_type_lookups.sql`), ein Label daraus stünde im englischen UI
auf Deutsch. Genau derselbe Grund, aus dem `typeLabelsForSlug` beim Kalender
über `cal.legend.*` geht — und aus dem die Task-Zeile heute gar kein Typ-Label
zeigt. Fallback bei unbekanntem Slug ist der Slug selbst.

## i18n

Neu in [de.json](../../../features/i18n/locales/de.json) und
[en.json](../../../features/i18n/locales/en.json):

| Key                      | DE                                                 | EN                     |
| ------------------------ | -------------------------------------------------- | ---------------------- |
| `hw.add`                 | Neue Aufgabe                                       | New task               |
| `hw.create.title`        | Aufgabe hinzufügen                                 | Add task               |
| `hw.create.save`         | Hinzufügen                                         | Add                    |
| `hw.create.saving`       | Speichere…                                         | Saving…                |
| `hw.edit.title`          | Aufgabe bearbeiten                                 | Edit task              |
| `hw.edit.save`           | Speichern                                          | Save                   |
| `hw.edit.saving`         | Speichere…                                         | Saving…                |
| `hw.notFound`            | Aufgabe nicht gefunden                             | Task not found         |
| `hw.form.fieldType`      | Typ                                                | Type                   |
| `hw.form.fieldChild`     | Kind                                               | Child                  |
| `hw.form.noChild`        | Ohne Kind                                          | No child               |
| `hw.form.fieldTitle`     | Titel                                              | Title                  |
| `hw.form.fieldSubject`   | Fach                                               | Subject                |
| `hw.form.fieldDue`       | Fällig am                                          | Due date               |
| `hw.form.fieldDueTime`   | Uhrzeit                                            | Time                   |
| `hw.form.clearTime`      | Uhrzeit entfernen                                  | Remove time            |
| `hw.form.fieldNotes`     | Notizen                                            | Notes                  |
| `hw.error.titleRequired` | Bitte einen Titel eingeben                         | Please enter a title   |
| `hw.error.typeRequired`  | Bitte einen Typ wählen                             | Please pick a type     |
| `hw.error.dateRequired`  | Bitte ein Fälligkeitsdatum wählen                  | Please pick a due date |
| `hw.delete.confirmTitle` | Aufgabe löschen?                                   | Delete task?           |
| `hw.delete.confirmBody`  | Diese Aktion kann nicht rückgängig gemacht werden. | This cannot be undone. |
| `hw.delete.confirmOk`    | Löschen                                            | Delete                 |
| `hw.delete.deleting`     | Lösche…                                            | Deleting…              |
| `hw.delete.error`        | Löschen fehlgeschlagen                             | Delete failed          |
| `hw.type.hausaufgaben`   | Hausaufgaben                                       | Homework               |
| `hw.type.besorgung`      | Besorgung                                          | Errand                 |
| `hw.type.elternAufgabe`  | Eltern-Aufgabe                                     | Parent task            |

`action.cancel` (Kopfzeile) und `action.back` (Not-Found-Karte) werden
wiederverwendet; keine Anleihen aus dem `cal.*`-Namensraum. Die neuen
`hw.error.*`-Keys liegen neben den bestehenden vier aus `mapTaskError` — beide
Sätze sind Fehler-Keys für denselben Screen-Bereich, das Nebeneinander ist
gewollt.

Der Slug `eltern-aufgabe` wird für den Key zu `elternAufgabe` normalisiert
(Bindestrich → camelCase), damit der Key-Pfad nicht mit i18next-Konventionen
kollidiert. Die Normalisierung passiert im Task-Screen beim Mappen, nicht im
Katalog.

Alle Keys gehen als TODO-Eintrag an `docs/COPY.md` — die Datei gehört dem
Designer, wie bei den Kalender- und Settings-Keys.

## Tests

`features/tasks/form.test.ts`, `bun:test`, gegen die reinen Helfer:

- `validateTaskForm` — leerer Titel, Titel nur aus Leerzeichen, fehlender Typ,
  ungültiges Datum; gültiger State liefert ein leeres Fehlerobjekt.
- `taskToForm` — `due_date` landet als lokales Datum (kein Tagesversatz),
  gesetztes und fehlendes `due_time`, `null`-Freitextfelder werden zu `""`.
- `toCreateVars` — `due_date` als `yyyy-MM-dd`, leere Freitextfelder als `null`,
  gesetztes `due_time` als `HH:mm:ss`.
- `toTaskChanges` — voller Feldsatz, `child_id: null` bei „Ohne Kind".
- Round-Trip: `taskToForm` → `toTaskChanges` liefert die Ausgangswerte zurück.
- Tagesgrenze: ein `dueDate` am späten Abend serialisiert auf denselben
  Kalendertag (der Fall, den `toISOString()` kaputtmachen würde).

Die Screens selbst bleiben ungetestet — es gibt keine verlässlich laufende
RN-Komponenten-Testinfrastruktur (siehe CLAUDE.md zu `bun test` vs. `jest-expo`).

## Verifikation

`bun run typecheck`, `bun lint`, `bun test`, `bun format:check`, dazu
`bunx expo export --platform web`. Manueller Klick-Durchlauf auf Web:

1. Aufgabe anlegen — Pflichtfeld-Fehler erscheinen und verschwinden, Datum und
   Uhrzeit lassen sich wählen, die Zeile taucht in der richtigen Sektion auf.
2. Aufgabe bearbeiten — Formular ist korrekt vorbelegt, Änderung schlägt in der
   Liste durch, Uhrzeit lässt sich entfernen.
3. Aufgabe löschen — Bestätigung erscheint, Zeile verschwindet.
4. **Gegenprobe Kalender** — Termin anlegen und bearbeiten funktioniert nach
   dem Umzug der drei Komponenten unverändert, inklusive Datums- und
   Zeitauswahl auf Web (dort neu).

Vor dem PR ein lokaler `coderabbit review --base main`.

## Doku-Pflege

- **ADR-010** in [decision-log.md](../../decision-log.md): Form-Bausteine nach
  `app-sections/shared/`, Web-Zweig per Plattform-Datei, Verzicht auf ein
  Dringlichkeitsfeld.
- **`docs/TODO.md` — entfernen:** „Aufgaben lassen sich nicht anlegen,
  bearbeiten oder löschen" und „Datums-/Zeit-Picker rendert auf Web nicht".
- **`docs/TODO.md` — ergänzen:** neue `hw.*`-Keys fehlen in `docs/COPY.md`;
  `patterns/homework.md` kennt kein Formular; kein Einstieg vom Dashboard aus.
- **CLAUDE.md:** neuer Ordner `app-sections/task/` und die beiden Routen in der
  Ordnerstruktur; `app-sections/shared/` führt jetzt Form-Bausteine.

## Offene Punkte

Keine.
