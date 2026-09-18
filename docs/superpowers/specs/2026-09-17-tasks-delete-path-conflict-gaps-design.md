# Aufgaben-Löschpfad und die zwei Konfliktlücken — Design

**Status:** Approved (Brainstorming Phase)
**Date:** 2026-09-17
**Auftrag:** [docs/roadmap.md](../../roadmap.md) → [Block 2 — Aufgaben-Löschpfad & Konfliktlücken](../../roadmap.md#block-2--aufgaben-löschpfad--konfliktlücken)
**Decision-Log:** drei ADRs nach Implementation statt der ursprünglich geplanten zwei — **036** der Aufgaben-Schreibpfad bekommt den Schnitt des Kalenders (PR 1), **037** der Compare-and-Swap-Fall trägt seine Zeile (PR 2), **038** die Regel im Vergleich (PR 3). Ein gemeinsamer ADR-037 für PR 2 **und** PR 3 ginge nicht: PR 2 merged vor PR 3, ADR-037 wäre dann schon Historie, und CLAUDE.md verbietet das Umschreiben älterer ADRs — ohnehin der sauberere Schnitt, denn es sind zwei Verträge: einer über das, was ein Konflikt-Fehler mitträgt, einer über das Vokabular des Vergleichs. Alle drei ergänzen [ADR-031](../../decision-log.md) (Conflict-Detection) — mit **einer** Ausnahme, die nicht untergehen darf: ADR-037 löst zusätzlich eine einzelne Aussage daraus ab, den letzten Satz von Decision 12 über den CAS-Fall ohne fremde Fassung, den es nach PR 2 nicht mehr gibt. ADR-031 bleibt unverändert stehen; die Supersession ist in ADR-037s Status-Abschnitt ausgewiesen. ADR-036 und ADR-038 ergänzen ohne Ablösung

---

## 1. Context

Block 2 fasst sechs Einträge aus `docs/TODO.md` an: **dieselbe Schadensklasse wie Block 1, nur bei Aufgaben** — plus die beiden Löcher, die ADR-031 bewusst außerhalb von Task 8 gelassen hat. **Fünf davon werden in dieser Iteration erledigt** (drei unter 2.1, je einer unter 2.2a und 2.2b). Der sechste ist 2.3; er wartet auf einen Copy-Key und wird deshalb nicht hier gezählt, sondern wandert sichtbar zu Block 3 — genau so führt ihn auch [roadmap.md](../../roadmap.md), dessen Block-2-Zeile „5" nennt und den Toggle-Eintrag in Block 3 mitzählt.

Vor dem Entwurf habe ich die tragenden Behauptungen nachgestellt. Zwei Ergebnisse weichen von dem ab, was `TODO.md` und `roadmap.md` notieren, und beide ändern die Arbeit.

### 1.1 Befund: der Regel-Vergleich verliert mehr als die Regel

`TODO.md` beschreibt die Lücke so: „Ändern zwei Eltern denselben Termin ausschließlich am Rhythmus, ist die Feldliste leer, `showConflict` speichert also lautlos durch." Das stimmt in der Mechanik, ist aber **einmal zu breit und einmal zu schmal** gefasst.

**Zu breit.** Der Verlust setzt voraus, dass **A die Regel ebenfalls angefasst hat**. `vars.recurrence` entsteht nur bei `recurrenceDirty` ([EventEditScreen.tsx:199-202](../../../app-sections/event/EventEditScreen.tsx)); sonst ruft `applyEditScope` `updateMaster` ohne `recurrence`, die `rrule_*`-Spalten stehen gar nicht im UPDATE, und B's Regeländerung überlebt. Der blinde Vergleich allein verliert nichts — er verliert erst zusammen mit einem Schreibvorgang, der die Regel mitführt.

**Zu schmal.** Führt A die Regel mit, verliert der Schreibvorgang mehr als die Regel. Bei abweichender Regel ruft `applyEditScope` **zuerst** `deleteAllExceptions(eventId)` ([recurrence.ts:291-293](../../../features/calendar/recurrence.ts)) — jede „Nur diesen"-Änderung und jede abgesagte Occurrence der **ganzen Serie** ist weg, bevor A's Regel geschrieben wird. Ohne Dialog, ohne Meldung. Das ist derselbe Verlust, den Block 1 gerade sichtbar gemacht hat, nur ausgelöst über einen Pfad, den Block 1 nicht angefasst hat.

Nachgemessen an `differingEventFields` (Wegwerf-Test, danach gelöscht):

| Szenario                                      | Feldliste   | Folge                                                                 |
| --------------------------------------------- | ----------- | --------------------------------------------------------------------- |
| A und B ändern beide nur den Rhythmus         | `[]`        | Auto-Retry mit frischer Version → A gewinnt, alle Exceptions gelöscht |
| A ändert Titel **und** Regel, B nur die Regel | `[]`        | dasselbe                                                              |
| Gegenprobe: B ändert den Titel                | `["title"]` | Dialog erscheint                                                      |

Zeile 2 belegt, was der TODO-Eintrag vermutet hatte: Der Drei-Wege-Vergleich aus ADR-031 Task 13 hat die Lücke **schärfer** gemacht. Vorher meldete der zweiwertige Vergleich A's eigene Titeländerung unfreiwillig mit, der Dialog erschien — aus dem falschen Grund, aber er erschien. Dieses zufällige Sicherheitsnetz ist ersatzlos entfallen.

### 1.2 Befund: ein Parent-Guard fängt den Abmelde-Fall nicht

Naheliegender Gedanke für den 0-Zeilen-Guard beim Löschen: `useDeleteTask` prüft wie `useToggleTaskDone` vorab auf einen geladenen Parent und wirft sonst `MissingParentError` — dann bekäme der Abmelde-Fall einen Namen statt im „schon weg"-Zweig zu verschwinden. **Das trägt nicht.**

`useCurrentParent` ist eine Query ([useCurrentParent.ts:29-36](../../../features/auth/useCurrentParent.ts)); ihr Wert wird beim Rendern in die Closure gefangen. Die Löschung läuft seit ADR-026 fünf Sekunden **nach** dem Unmount des Screens — der Guard sähe den Wert des letzten Renders, nicht den abgemeldeten Zustand. Er wäre eine Prüfung, die genau in dem Moment blind ist, für den sie gebaut wäre.

Nötig ist er auch nicht: `useSignOut` ruft `flush()` **vor** `signOut` ([features/auth/mutations.ts:80](../../../features/auth/mutations.ts)), ausdrücklich damit das DELETE noch angemeldet läuft. Der Abmelde-Fall ist damit bereits abgedeckt — an der richtigen Stelle, im Abmelde-Pfad statt in der Mutation.

Was bleibt, ist eine echte Grenze: **Eine RLS-Ablehnung ohne Abmeldung** (der Elternteil wurde aus der Familie entfernt, während der Undo-Timer lief) ist vom Client aus **nicht** von „die Zeile ist schon weg" zu unterscheiden. Unter RLS liefert ein DELETE null Zeilen ohne Fehler, und die Nachlese per SELECT liefert ebenfalls nichts. Beide Wege enden im selben Zustand. Diese Grenze wird benannt, nicht kaschiert (§6, TODO-Eintrag).

### 1.3 Was die Aufgaben vom Kalender erben — und was umgekehrt

Die beiden Features haben denselben Schreibpfad ungleich weit gebaut, und zwar über Kreuz:

|                              | Kalender                                                               | Aufgaben                                         |
| ---------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------ |
| Injizierbarer Deps-Schnitt   | ja (`fetchMaster` + `EventOps`)                                        | **nein**                                         |
| Automatisierter Test des CAS | ja ([mutations.test.ts](../../../features/calendar/mutations.test.ts)) | **nein** — nur ein beobachteter Zwei-Client-Lauf |
| CAS beim **Löschen**         | ja (Pre-Flight in `deleteEvent`)                                       | **nein**                                         |
| Fremde Fassung im CAS-Fehler | **nein** (`EventConflictError(null)`)                                  | ja (`useUpdateTask` liest nach)                  |

Jede Zeile dieser Tabelle ist ein TODO-Eintrag. Die letzte ist der Grund, warum PR 2 klein ist: Die Aufgaben machen dem Kalender dort seit ADR-031 vor, was ihm fehlt — die Nachlese nach null Zeilen. PR 2 überträgt sie, PR 1 überträgt die andere Richtung.

### 1.4 Nachtrag aus dem Whole-Branch-Review von PR 1

Im Whole-Branch-Review von PR 1 wurde geprüft, ob `createSupabaseEventOps.deleteMaster` denselben 0-Zeilen-Guard trägt, den PR 1 für Aufgaben gerade eingeführt hat. Gemessen an [`features/calendar/recurrence.ts:392-395`](../../../features/calendar/recurrence.ts): nein. Der Aufruf ist unverändert `client.from("events").delete().eq("id", eventId)` — kein `.select()`, kein Versions-Filter. Das ist derselbe Fehler, den PR 1 für Aufgaben gerade geschlossen hat, im Kalender aber weiterhin unangetastet. PR 2 verengt in diesem Block nur `updateMaster`, PR 3 rührt an den Vergleich — keines von beiden schließt diese Lücke. Sie ist bereits durch den stehenden TODO-Eintrag „Fünf Schreib-Ops laufen ohne bedingte Versionsprüfung" (`docs/TODO.md`) erfasst; dies ist ein Verweis darauf, kein neuer Rückstand.

Damit kippt eine weitere Zeile der Tabelle in §1.3 zugunsten der Aufgaben: „CAS beim Löschen" stand dort für den Kalender als „ja", gestützt allein auf den minütlichen Pre-Flight in `deleteEvent` — `deleteMaster` selbst hat, wie eben belegt, gar kein eigenes CAS. Aufgaben haben mit PR 1 ein echtes, atomares CAS auf Op-Ebene bekommen (`.eq("updated_at", …)` plus `.select("id")`, direkt in `deleteRow`). Der Kalender bleibt beim schwächeren, minütlichen Fenster.

### Zielbild

Nach Block 2 gilt für **beide** Features dasselbe: Ein Schreibvorgang, der eine fremde Änderung überschriebe, meldet sich; ein Löschvorgang, der eine fremde Änderung überschriebe, meldet sich; und beide Pfade sind ohne Netz testbar.

---

## 2. Schnitt und Reihenfolge

Drei PRs, in dieser Reihenfolge:

| PR  | Inhalt                                                                                    | Roadmap | Löst … Einträge |
| --- | ----------------------------------------------------------------------------------------- | ------- | --------------- |
| 1   | `features/tasks/mutations.ts` — Deps-Schnitt, 0-Zeilen-Guard, Lösch-CAS, Testsuite        | 2.1     | 3               |
| 2   | `updateMaster` liefert die fremde Zeile mit; `EventConflictError.row` wird nicht-nullable | 2.2b    | 1               |
| 3   | Die Wiederholungsregel wird Teil des Konflikt-Vergleichs                                  | 2.2a    | 1               |

**Warum PR 1 zuerst:** Größter Nutzerschaden. Eine Aufgabe, die jemand anderes gerade bearbeitet hat, verschwindet heute endgültig, ohne dass dieser Jemand ein Wort davon erfährt — beobachtet im Zwei-Client-Lauf.

**Warum PR 2 vor PR 3:** PR 2 ist der kleinere und verbessert die Diagnostizierbarkeit des größeren. Solange der CAS-Fall den Dialog ohne Vergleichszeilen zeigt, ist bei jedem Dialog ohne Zeilen unklar, ob der Vergleich nichts fand oder die fremde Fassung fehlte. Nach PR 2 ist die fremde Fassung immer bekannt und die Basis-Version immer frisch; ein Dialog ohne Zeilen hat seither nur noch Ursachen, die sich benennen lassen — Occurrence außerhalb des Suchfensters, Basis nicht hydriert, erschöpftes Auto-Retry-Limit (ADR-037). _(Korrigiert 2026-09-18: Hier stand, „keine Zeilen" heiße nach PR 2 nur noch eines. Das stimmte nicht; dieselbe Behauptung wurde in PR 2 in ADR-037 und §9 berichtigt und an dieser Stelle übersehen.)_

Der Schnitt trennt die PRs nach **Verträgen**, nicht nach Dateien. PR 1 fasst `features/tasks/` und `TaskEditScreen` an. PR 2 und PR 3 teilen zwei Produktionsdateien — `features/calendar/recurrence.ts` (PR 2 `updateMaster`, PR 3 `ruleDiffers`) und `EventEditScreen` (PR 2 die Null-Zweige in `showConflict`, PR 3 die Regel-Zeilen) —, PR 3 fasst außerdem `features/calendar/conflict.ts`, das neue `rule.ts` und einen Helfer neben dem Screen an. PR 3 setzt deshalb auf PR 2 auf; die Reihenfolge ist nicht beliebig. _(Korrigiert 2026-09-18: Hier stand, die drei PRs teilten keine Produktionsdatei und seien in jeder Reihenfolge mergebar.)_

An den **Dokumenten** arbeiten sie dagegen sehr wohl gemeinsam: `docs/TODO.md`, `docs/roadmap.md` und `docs/decision-log.md` fassen alle drei an (je ein ADR, §7). Das ist kein Merge-Risiko im Sinne widersprüchlicher Änderungen — jeder PR löscht oder ergänzt seine eigenen Zeilen —, aber es heißt, dass der zweite und dritte PR nach einem Merge des ersten neu gegen `main` gelesen werden müssen, statt blind gerebast zu werden.

---

## 3. PR 1 — Der Aufgaben-Schreibpfad

### 3.1 Der Deps-Schnitt

Neu in [features/tasks/mutations.ts](../../../features/tasks/mutations.ts):

```ts
export interface TaskOps {
  /** Die Zeile samt `task_types`-Join — die Form, die `TaskConflictError` trägt. */
  fetchRow: (taskId: string) => Promise<TaskWithType | null>;
  /**
   * Compare-and-Swap-Update. `true`, wenn die Zeile getroffen wurde, `false`
   * bei null Zeilen. Das *Klassifizieren* von null Zeilen bleibt draußen —
   * dafür gibt es `fetchRow` im selben Deps-Objekt.
   */
  updateRow: (taskId: string, changes: TaskChanges, seenUpdatedAt: string) => Promise<boolean>;
  deleteRow: (taskId: string, seenUpdatedAt: string) => Promise<boolean>;
}

export function createSupabaseTaskOps(client: SupabaseClient<Database>): TaskOps;

export async function updateTask(vars: UpdateTaskVars, deps: TaskOps): Promise<void>;
export async function deleteTask(vars: DeleteTaskVars, deps: TaskOps): Promise<void>;
```

Die Hooks werden dünne Hüllen, genau wie `useUpdateEvent`/`useDeleteEvent`:

```ts
mutationFn: (vars: UpdateTaskVars) => updateTask(vars, createSupabaseTaskOps(supabase)),
```

Die optimistischen `onMutate`/`onError`/`onSettled`-Zweige bleiben unverändert am Hook — sie sind React-Query-Mechanik, nicht Schreibpfad.

**Eine bewusste Asymmetrie zum Kalender.** Dort wirft `updateMaster` den `EventConflictError` **in** der Op; hier melden die Ops nur `true`/`false` und die Klassifikation liegt in der reinen Funktion. Grund: Die Klassifikation braucht einen zweiten Aufruf (`fetchRow`), und eine Op, die eine andere Op ruft, ist keine Op mehr. Genau diese Verschränkung ist der Grund, warum PR 2 im Kalender **in** `createSupabaseEventOps` hineingreifen muss statt in die reine Funktion. Die Asymmetrie ist damit kein Versehen, sondern die Lehre aus PR 2, vorweggenommen für das Feature, das den Schnitt gerade erst bekommt.

`useCreateTask` und `useToggleTaskDone` bleiben unangetastet. Die Datei trägt damit vorerst zwei Idiome — der Preis dafür, zwei Pfade nicht ohne Anlass umzubauen. Ein Kommentar an `TaskOps` sagt, welche der vier Mutationen darüber laufen und warum die anderen nicht.

### 3.2 `useUpdateTask` — verhaltensgleich, nur testbar

Der Ablauf bleibt Zeile für Zeile derselbe: CAS-Update → bei null Zeilen Nachlese → Zeile weg = `Error("Task no longer exists")` (fällt durch `mapTaskError` auf `hw.error.generic`) → Zeile da = `TaskConflictError(current)`. Die Kommentare, die diese Entscheidungen tragen, wandern mit in die reine Funktion. **Keine Verhaltensänderung** — dieser Teil ist reiner Umzug, und der Test dahinter ist der eigentliche Gewinn.

### 3.3 `useDeleteTask` — der eigentliche Fix

`DeleteTaskVars` bekommt `baseVersion: string`, und der Ablauf spiegelt `updateTask` mit **einem** Unterschied:

```ts
export async function deleteTask(vars: DeleteTaskVars, deps: TaskOps): Promise<void> {
  const hit = await deps.deleteRow(vars.taskId, vars.baseVersion);
  if (hit) return;
  const current = await deps.fetchRow(vars.taskId);
  if (!current) return; // schon weg — das Ziel ist erreicht
  throw new TaskConflictError(current);
}
```

**Warum „schon weg" beim Löschen ein Erfolg ist und beim Speichern nicht.** Beim Speichern geht der _Inhalt_ verloren: Der Nutzer hat etwas getippt, das nirgendwo mehr ankommt, und er steht noch vor dem Formular. Beim Löschen ist die _Absicht_ erfüllt — die Aufgabe ist weg, unabhängig davon, wessen DELETE sie erwischt hat. Ein Toast „Löschen fehlgeschlagen" über einer Aufgabe, die nicht mehr existiert, wäre schlicht falsch. Die Grenze dieser Regel steht in §1.2 und wird als TODO-Eintrag festgehalten.

Damit deckt der 0-Zeilen-Guard beide TODO-Einträge auf einmal ab: Er macht das stille „gelingt, löscht nichts" unmöglich, **und** er ist zugleich der Konflikt-Detektor — dieselbe Doppelrolle, die `.eq("updated_at", …)` in `useUpdateTask` seit ADR-031 hat.

### 3.4 `TaskEditScreen.onDelete`

Zwei Änderungen am Aufrufer:

1. **Die eingefrorene `baseVersion` mitschicken**, nicht `task.updated_at` aus der lebenden Query. Dieselbe Invariante wie beim Speichern (ADR-031 Decision 6): Maßgeblich ist der Stand, den der Nutzer _gesehen_ hat. Ein Refetch, der Millisekunden nach der Hydration landet, darf die Prüfung nicht entwerten. `onDelete` steigt aus, solange `baseVersion == null` ist — derselbe Guard wie `onSave`.

2. **`errorAction` am Fehler-Toast**, gespiegelt von [EventDetailScreen.tsx:190-220](../../../app-sections/event/EventDetailScreen.tsx):

```ts
errorAction: (err) => {
  if (!(err instanceof TaskConflictError)) return undefined;
  return {
    label: t("conflict.deleteAnyway"),
    onPress: () => {
      deleteMutation
        .mutateAsync({ taskId, baseVersion: err.row.updated_at })
        .catch((retryErr: unknown) => { /* Fehler-Toast */ });
    },
  };
},
```

Die frische Basis-Version kommt aus der Fassung, die der Fehler mitträgt — kein `force`-Flag, kein Bypass. Der Retry läuft ohne eigenes Undo-Fenster (der Nutzer hat gerade ausdrücklich entschieden) und **ohne** zweite „Trotzdem löschen"-Aktion (eine Aktion, die sich selbst nachreicht, baute eine Kette, die nur wächst). Beide Regeln stehen so schon im Termin-Pfad; hier gilt Wort für Wort dasselbe.

Kein Dialog, sondern eine Toast-Aktion — aus dem Grund, den ADR-031 für den Termin-Pfad nennt: Das Löschen läuft fünf Sekunden verzögert, der Nutzer ist längst woanders, und ein Feldvergleich hätte dort nichts zu vergleichen.

**Kein neuer Copy-Key.** `conflict.deleteAnyway` („Trotzdem löschen") existiert, `hw.delete.error` existiert, `hw.error.conflict` existiert.

### 3.5 Tests

Neu: `features/tasks/mutations.test.ts`, gebaut nach dem Muster von [features/calendar/mutations.test.ts](../../../features/calendar/mutations.test.ts) — `makeOps()` mit `mock()`-Funktionen, Fixture-Fabriken für `TaskWithType`.

Die Fälle, die vorher nicht prüfbar waren:

- `updateTask`: CAS trifft → kein `fetchRow`, kein Wurf. **Der Roundtrip-Vertrag**: der Normalfall liest nicht nach.
- `updateTask`: CAS verfehlt, Zeile da → `TaskConflictError`, und `err.row` ist die nachgelesene Zeile.
- `updateTask`: CAS verfehlt, Zeile weg → Wurf, der auf `hw.error.generic` mappt (nicht auf `staleReference` — die bewusste Entscheidung aus dem bestehenden Kommentar).
- `deleteTask`: CAS trifft → kein `fetchRow`.
- `deleteTask`: CAS verfehlt, Zeile da → `TaskConflictError`. **Rot vor dem Fix** (heute gibt es keine `baseVersion`).
- `deleteTask`: CAS verfehlt, Zeile weg → **kein** Wurf. Der Test, der die Entscheidung aus §3.3 festhält.
- `deleteRow` bekommt die **eingefrorene** `baseVersion` durchgereicht, nicht irgendeine andere — der Wächter gegen ein späteres „wir nehmen doch die frische".

Dazu ein Wächter, den der Kalender nicht hat und der hier billig ist: `createSupabaseTaskOps` hängt an jede der drei Ops die erwartete PostgREST-Kette. Ein Test, der `updateRow`/`deleteRow` gegen einen Fake-Client fährt und prüft, dass `.eq("updated_at", …)` **und** `.select("id")` gesetzt sind — ohne beides ist das CAS wirkungslos, und beides ist eine Zeile, die jemand beim Umbauen versehentlich entfernt.

---

## 4. PR 2 — Der CAS-Fall trägt seine Zeile

### 4.1 Der Fix

`createSupabaseEventOps.updateMaster` liest bei null Zeilen nach, statt blind `null` zu werfen — dieselbe Nachlese, die `useUpdateTask` seit ADR-031 macht:

```ts
updateMaster: async (eventId, changes, seenUpdatedAt, recurrence) => {
  const { data, error } = await client.from("events").update(…).eq("id", eventId)
    .eq("updated_at", seenUpdatedAt).select("id").maybeSingle();
  if (error) throw error;
  if (data) return;

  const { data: current, error: readError } = await client
    .from("events").select(EVENT_SELECT).eq("id", eventId).maybeSingle();
  if (readError) throw readError;
  if (!current) throw new EventNotFoundError(eventId);
  throw new EventConflictError(current);
},
```

`EVENT_SELECT` ist das heute modul-private `SELECT` aus [queries.ts:9](../../../features/calendar/queries.ts) (`"*, event_types(*), event_exceptions(*)"`) — beim Export umbenannt, weil `SELECT` als Name außerhalb seiner Datei nichts mehr aussagt. Die Relationen sind Pflicht, nicht Zierde: `showConflict` gibt die Zeile an `eventLookupWindow` und `expandEvents` weiter, und beide lesen `event_exceptions`. Nachgeprüft: `queries.ts` importiert `recurrence.ts` nicht, der Import entsteht also ohne Zyklus.

Der Preis ist ein zusätzlicher Roundtrip **ausschließlich im Fehlerfall** — im Normalfall kostet die Änderung nichts. Dieselbe Rechnung wie bei den Aufgaben.

### 4.2 Die Typ-Verengung

Nach 4.1 kann `EventConflictError.row` nicht mehr `null` sein: Die einzige Stelle, die je `null` übergab, war `updateMaster` ([recurrence.ts:409](../../../features/calendar/recurrence.ts)), und der Pre-Flight in `mutations.ts` übergibt immer den geladenen Master. Der Konstruktor-Parameter wird auf `EventWithRelations` verengt.

Damit fallen zwei defensive Zweige ersatzlos weg:

- `showConflict` in `EventEditScreen`: `const row = err.row; let theirs = null; if (row) { … }` wird geradlinig. Der `theirs === null`-Zweig beim Rendern der `rows` und der `?? vars.baseVersion`-Rückfall in `onKeepMine` verschwinden mit.
- `EventDetailScreen.errorAction`: `if (!(err instanceof EventConflictError) || !err.row)` verliert die zweite Hälfte.

Der Gewinn ist nicht die gesparte Zeile, sondern dass der **Compiler** beweist, was der TODO-Eintrag fordert: Der Dialog hat immer eine frische Basis-Version, „Deine Fassung speichern" kann nicht mehr in eine Endlosschleife gegen dieselbe veraltete `baseVersion` laufen.

`theirs` kann weiterhin `null` sein — dann nämlich, wenn die Occurrence außerhalb des Suchfensters liegt. Dieser Zweig bleibt, und er behält seinen Sinn: `row` ist dann bekannt, die frische Version also berechenbar (`occurrenceVersion(row, key)`), nur die Vergleichszeilen fehlen. Genau diese Unterscheidung war vorher unter dem gemeinsamen `null` begraben.

### 4.3 Tests

- `updateMaster` gegen einen Fake-Client: null Zeilen + vorhandene Zeile → `EventConflictError` mit genau dieser Zeile. **Rot vor dem Fix** (heute `row === null`).
- null Zeilen + fehlende Zeile → `EventNotFoundError`.
- Treffer → keine Nachlese (der Roundtrip-Vertrag).
- `updateEvent`/`deleteEvent` in `mutations.test.ts` bleiben grün — der Pre-Flight ist nicht betroffen.

Die Typ-Verengung braucht keinen eigenen Test: Sie ist eine Compiler-Aussage, und `bun run typecheck` ist ihr Prüfer.

---

## 5. PR 3 — Die Regel im Vergleich

### 5.0 Nachtrag vor der Umsetzung (2026-09-18)

Vor dem Plan für PR 3 habe ich die tragenden Behauptungen dieses Abschnitts erneut gegen `main` gemessen. Drei weichen ab; die Unterabschnitte unten sind entsprechend nachgezogen.

1. **Das `until`-Phantom gibt es heute nicht.** §5.1 begründete den Zeitvergleich mit einem beobachtbaren Fehler (Server `…+00:00` gegen Formular `…Z`). Gemessen: Das Formular reicht `until` als Server-String unverändert durch (`rrule_until: parsedCount == null ? (initial?.rruleUntil ?? null) : null` in `EventEditScreen`), das Optimistic-Overlay fasst `rrule_until` nicht an, Realtime invalidiert nur. Kein aktueller Pfad bringt zwei Schreibweisen in denselben Vergleich. Der Zeitvergleich bleibt — als Absicherung, nicht als Bugfix.
2. **Die Anzeige aus §5.3 ist mit den vorhandenen Keys nicht zu bauen.** `cal.create.fieldRecurrenceCount` ist eine **Beschriftung** („Endet nach … Terminen"), kein Wert mit `{{count}}` und ohne Plural. Und „Option + Anzahl" kann ein Serienende per Datum nicht ausdrücken — das setzen zwei alltägliche Aktionen: „ab hier löschen" auf einer unbegrenzten Serie und Bearbeiten mit „dieser und folgende". Die eine Zeile nach Spec zeigte dann zwei gleiche Werte. **Entschieden (2026-09-18): zwei Zeilen, keine neuen Keys** — §5.3 und Decision 10.
3. **Die geplante Form existiert schon.** `RuleShape` hätte dieselben fünf Felder wie `OccurrenceRrule` in `features/calendar/types.ts`, die jede Occurrence als `occ.rrule` trägt; und `RecurrenceChanges` hat genau die fünf `rrule_*`-Spalten einer Zeile, `ruleOfRow` und `ruleOfChanges` wären also dieselbe Funktion. `rule.ts` exportiert deshalb nur `ruleOf` und `sameRule` auf `OccurrenceRrule` (§5.1).

### 5.1 Ein Regel-Vergleich, nicht zwei

Es gibt bereits einen: `ruleDiffers(master, next)` in [recurrence.ts:197-208](../../../features/calendar/recurrence.ts), privat, entscheidet über `deleteAllExceptions`. Ein zweiter, leicht anders gebauter Vergleich für den Dialog wäre genau die Divergenz, vor der CLAUDE.md warnt — und hier besonders folgenreich: Die beiden würden über _dieselbe_ Frage („hat sich die Regel geändert?") verschieden urteilen, einmal beim Löschen der Exceptions und einmal beim Melden des Konflikts.

Deshalb ein eigenes Modul `features/calendar/rule.ts` mit zwei Lesern — dasselbe Muster und derselbe Anlass wie bei `override.ts` in ADR-035:

```ts
type RuleColumns = Pick<
  EventRow,
  "rrule_freq" | "rrule_interval" | "rrule_byweekday" | "rrule_count" | "rrule_until"
>;

/** Die Regel aus den fünf `rrule_*`-Spalten — einer Zeile ebenso wie `RecurrenceChanges`. */
export function ruleOf(columns: RuleColumns): OccurrenceRrule;
export function sameRule(a: OccurrenceRrule, b: OccurrenceRrule): boolean;
```

Die Form ist `OccurrenceRrule` aus `types.ts`, kein neuer Typ: Jede `CalendarOccurrence` trägt sie bereits als `occ.rrule` (gebaut in `expand.ts`), eine Occurrence braucht also keinen eigenen Umwandler (§5.0, Punkt 3).

`ruleDiffers` wird zu `!sameRule(ruleOf(master), ruleOf(next))` und bleibt als benannter Aufrufer stehen.

**Zwei Feinheiten, die `sameRule` erbt und eine, die es korrigiert.** `byweekday` vergleicht als Menge, nicht als Liste (so wie `ruleDiffers` es schon tut) — die Reihenfolge ist keine Information. `until` vergleicht dagegen künftig als **Zeitpunkt**, nicht als Zeichenkette — wie `sameInstant` in `conflict.ts` für Start und Ende. **Das ist eine Absicherung, kein Bugfix** (§5.0, Punkt 1): Heute erreicht kein Pfad den Vergleich mit zwei Schreibweisen, weil das Formular `until` als Server-String durchreicht. Der Stringvergleich beruht aber auf einer Annahme über die Herkunft beider Seiten, die niemand prüft; der Zeitvergleich macht sie überflüssig. Gleiche Zeichenketten gelten als gleich, bevor überhaupt geparst wird — die Änderung macht also nur Paare gleich, die vorher verschieden waren, nie umgekehrt. Sie wirkt auch auf `ruleDiffers` und bekommt dort einen eigenen Test. `null` wird vor der Umrechnung abgefangen (`new Date(null)` ist die Epoche, nicht `NaN`).

### 5.2 Der Vergleich

`EventConflictField` bekommt `"recurrence"`, `differingEventFields` einen vierten Parameter:

```ts
export function differingEventFields(
  theirs: CalendarOccurrence,
  mine: EventChanges,
  base: CalendarOccurrence,
  mineRecurrence?: RecurrenceChanges | null,
): EventConflictField[];
```

Die Regel folgt dem Muster, das `differingTaskFields` für seine optionalen Felder schon hat:

```ts
if (
  mineRecurrence != null &&
  !sameRule(theirs.rrule, base.rrule) &&
  !sameRule(theirs.rrule, ruleOf(mineRecurrence))
) {
  out.push("recurrence");
}
```

`mineRecurrence == null` heißt: Der Schreibvorgang fasst die `rrule_*`-Spalten gar nicht an, er kann also mit keiner fremden Fassung kollidieren — exakt die Begründung, mit der `differingTaskFields` seine `undefined`-Felder überspringt, und exakt der Fall aus §1.1, der zu Unrecht als Schaden gezählt wurde.

Damit ist die Feldliste im gemessenen Szenario nicht mehr leer, der Auto-Retry entfällt, und der Dialog erscheint — mit dem Unterschied zwischen A's und B's Regel als Zeile.

### 5.3 Die Darstellung

**Zwei Zeilen, keine neuen Keys** (entschieden 2026-09-18, §5.0 Punkt 2). Je Bedienelement des Formulars eine Zeile — der Nutzer hat einen Radio-Button und ein Anzahl-Feld angefasst:

| Zeile      | Label (vorhanden)                                           | Wert                                                                                                                                                   |
| ---------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Option     | `cal.create.fieldRecurrence` („Wiederholung")               | `cal.recur.<option>` aus `rruleToRecurrence(…)`; „—", wenn die Regel keiner der fünf Optionen entspricht                                               |
| Serienende | `cal.create.fieldRecurrenceCount` („Endet nach … Terminen") | die Zahl; `cal.create.recurrenceCountUnlimited` („Unbegrenzt"), wenn weder Anzahl noch Enddatum gesetzt sind; „—", wenn die Serie an einem Datum endet |

Eine Zeile erscheint nur, wenn sich ihre beiden Werte **sichtbar** unterscheiden — verglichen wird der angezeigte Text, nicht die Regel. Zeigt keine der beiden einen Unterschied, obwohl `differingEventFields` einen gemeldet hat (er liegt dann in einem Teil der Regel, den das Formular nicht darstellt: Intervall, Wochentage, zwei verschiedene Enddaten), erscheint die Options-Zeile trotzdem. Ein erkannter Konflikt ohne Zeile wäre ein Dialog, der etwas meldet und nichts zeigt.

„Unbegrenzt" nur, wenn auch kein Enddatum gesetzt ist: Eine Serie, die jemand per „ab hier löschen" an einem Datum beendet hat, hat keine Anzahl — sie als „Unbegrenzt" zu beschriften, wäre falsch. Das „—" ist dort ehrlich, aber karg; ein Wert „endet am …" bräuchte einen neuen Key (§5.4).

Der Wochentag für `rruleToRecurrence` wird geprüft wie bei der Hydration: für die fremde Fassung gegen `theirs.startAt` in `theirs.timezone`, für die eigene gegen den Start, mit dem das Formular die Regel gebaut hat (`vars.changes.start_at`), in `vars.timezone`. So hält die Hin-und-Rück-Abbildung, die `createMutation.test.ts` festhält.

Die Zeilen baut ein reiner Helfer neben dem Screen, `app-sections/event/recurrenceConflictRows.ts` — Vorbild `submitLock.ts` —, weil `EventEditScreen` selbst unter `bun test` nicht ladbar ist und die Zeilenlogik Zweige hat, die einen Test verdienen. `formatField` bekommt `"recurrence"` nicht: Seine Signatur (`field, source`) passt nicht, weil die Regel nicht in `EventChanges` steckt.

Ein Sonderfall kann nicht auftreten: **A's Regel ist nicht darstellbar** — der Editor ist bei einer Regel außerhalb der fünf V1-Optionen gar nicht sichtbar (`recurrenceEditable`), `vars.recurrence` bleibt dann null, und die Zeile entsteht nicht. **B's Regel** kann es sein (ein anderer Client, ein direkter DB-Schreibvorgang); dann zeigt die fremde Seite „—".

### 5.4 Was der Dialog nicht sagt

Wählt der Nutzer „Deine Fassung speichern", gewinnt A's Regel — und `deleteAllExceptions` löscht die Ausnahmen der Serie (§1.1). Der Dialog benennt diese Folge **nicht**; dafür bräuchte es einen neuen Copy-Key. Die Entscheidung ist damit informiert über _das_, was kollidiert, nicht über alles, was daran hängt. Das ist besser als heute (gar keine Entscheidung) und schlechter als möglich — und geht als 🎨-Eintrag in `docs/TODO.md`.

Dasselbe gilt für eine zweite Folge, die beim Nachmessen vor PR 3 auffiel (§5.0): Hat B die Serie per „ab hier löschen" an einem Datum beendet, trägt A's Schreibvorgang das `until` aus dem Stand, den A's Formular geladen hat — also keins. „Deine Fassung speichern" macht B's Kürzung damit rückgängig, die gelöschten Termine kehren zurück. Die Serienende-Zeile zeigt dann „—" gegen „Unbegrenzt": ein Hinweis, keine Erklärung. Derselbe 🎨-Eintrag nimmt beide Folgen auf.

### 5.5 Tests

Neu in `features/calendar/rule.test.ts`:

- `sameRule` über alle fünf Felder, je ein Unterschied.
- `byweekday` in anderer Reihenfolge ist **dieselbe** Regel; `null` und `[]` sind dasselbe.
- `until` in PostgREST-Format und als `toISOString()` ist **derselbe** Zeitpunkt; `null` gegen `null` gleich, `null` gegen einen Wert verschieden.
- `ruleOf` bildet die fünf Spalten ab.

In `recurrence.test.ts`, als Beleg der Verhaltensänderung an `ruleDiffers`: ein `master.rrule_until` in PostgREST-Format gegen dasselbe Instant als `…Z` löst **kein** `deleteAllExceptions` aus. **Rot vor dem Fix** — an einer konstruierten Eingabe, denn kein heutiger Pfad erzeugt sie (§5.0). Die bestehenden `ruleDiffers`-Fälle bleiben grün.

Neu in `conflict.test.ts` — die drei gemessenen Szenarien aus §1.1, jetzt mit dem erwarteten Ergebnis:

- A und B ändern beide die Regel → `["recurrence"]`. **Rot vor dem Fix** (heute `[]`).
- A ändert Titel und Regel, B nur die Regel → `["recurrence"]`. **Rot vor dem Fix.**
- A ändert die Regel **nicht** (`mineRecurrence` null), B schon → `[]`. **GRENZWÄCHTER**: Dieser Fall darf keinen Dialog erzeugen, sonst meldet jede fremde Regeländerung einen Konflikt bei einem Nutzer, der die Regel gar nicht anfasst.
- A und B ändern die Regel **identisch** → `[]`. Zweiter Grenzwächter: gleiches Ergebnis ist kein Konflikt.

Neu in `app-sections/event/recurrenceConflictRows.test.ts`: nur die Anzahl weicht ab → nur die Serienende-Zeile; nur die Option → nur die Options-Zeile; fremdes Enddatum gegen eigene unbegrenzte Serie → „—" gegen „Unbegrenzt", **nie** „Unbegrenzt" für eine Serie mit Enddatum; kein sichtbarer Unterschied → die Options-Zeile trotzdem; nicht darstellbare fremde Regel → „—".
---

## 6. Was diese Iteration nicht liefert

- **2.3 „Toggle-Fehler ist auf Web unsichtbar"** ([TaskRow.tsx](<../../../app-sections/(tabs)/aufgaben/TaskRow.tsx>)) bleibt 🎨-blockiert. `showAlert` liegt bereit, es fehlt allein der Titel-String, und `docs/COPY.md` gehört dem Designer. Der Eintrag bleibt in `TODO.md` und wandert mit dem Designer-Paket in Block 3.
- **Kein Transaktions-RPC.** Die nicht-transaktionalen Mehrfach-Schreibvorgänge in `applyEditScope`/`applyDeleteScope` bleiben, wie sie sind — das ist Block 7, und Pre-Flight plus CAS decken den Normalfall ab.
- **Keine Warnung über gelöschte Exceptions** im Konflikt-Dialog (§5.4).
- **Keine Unterscheidung von RLS-Ablehnung und „schon gelöscht"** beim Aufgaben-Löschen (§1.2). Beide Grenzen gehen als neue Einträge in `docs/TODO.md`, im selben Commit, der sie einführt.
- **`useCreateTask` und `useToggleTaskDone`** bekommen keinen Deps-Schnitt und bleiben untestbar.

---

## 7. Folgen für die Dokumentation

- **`docs/TODO.md`**: fünf Einträge gelöscht (drei in PR 1, je einer in PR 2 und PR 3), vier neue angelegt — zwei in PR 1 (die RLS-Grenze aus §6 und der fehlende 0-Zeilen-Guard in `useToggleTaskDone`), einer in PR 2 (die fehlende `no-unnecessary-condition`-Regel, beim Verengen gefunden), der 🎨-Eintrag aus §5.4 in PR 3. Je im selben Commit.
- **`docs/roadmap.md`**: Block 2 abgehakt, 2.1–2.2 mit dem Ergebnis versehen; 2.3 bleibt offen und wandert sichtbar zu Block 3.
- **`docs/decision-log.md`**: ADR-036, ADR-037 und ADR-038 angehängt.
- **`CLAUDE.md`**: Der Absatz zu Conflict-Detection nennt heute nur den Kalender („der Kalender prüft die Version im Pre-Flight …, Aufgaben genau umgekehrt"). Nach PR 1 stimmt das nicht mehr — Aufgaben haben dann beim Löschen dasselbe CAS. Der Satz wird nachgezogen. Dazu in der Ordnerübersicht: `features/tasks/` um den `TaskOps`-Schnitt, `features/calendar/` um `rule.ts`.
- **`docs/architecture.md`**: der Schreibpfad-Abschnitt, falls er den Aufgaben-Pfad beschreibt.

---

## 8. Decisions

1. **Reihenfolge PR 1 → PR 2 → PR 3.** Größter Nutzerschaden zuerst; innerhalb des Kalenders der kleinere Fix vor dem größeren, weil er dessen Diagnose verbessert.

2. **Der Deps-Schnitt umfasst nur `update` und `delete`.** `useCreateTask` und `useToggleTaskDone` werden ohne Anlass nicht umgebaut; die Datei trägt vorerst zwei Idiome, und ein Kommentar sagt, warum.

3. **Die Ops melden `true`/`false`, die reine Funktion klassifiziert.** Umgekehrt (wie im Kalender) müsste eine Op eine zweite Op rufen — genau die Verschränkung, die PR 2 im Kalender teuer macht.

4. **„Die Zeile ist schon weg" ist beim Löschen ein Erfolg, beim Speichern ein Fehler.** Beim Löschen ist die Absicht erfüllt; beim Speichern geht Inhalt verloren.

5. **Kein Parent-Guard in `useDeleteTask`.** Er sähe wegen der Closure den Stand vor dem Unmount und wäre blind für genau den Fall, für den er gebaut wäre; der Abmelde-Fall ist über `flush()` in `useSignOut` bereits abgedeckt (§1.2).

6. **`TaskEditScreen` schickt die eingefrorene `baseVersion`, nicht die lebende.** Dieselbe Invariante wie beim Speichern (ADR-031 Decision 6).

7. **`EventConflictError.row` wird nicht-nullable.** Der Compiler beweist damit, was der TODO-Eintrag fordert; tote Zweige, die kein Test erreichen kann, verschwinden.

8. **Ein Regel-Vergleich für das ganze Feature, in `rule.ts`.** Zwei Leser, dasselbe Muster wie `override.ts` in ADR-035. `ruleDiffers` bleibt als benannter Aufrufer.

9. **`rrule_until` vergleicht als Zeitpunkt, nicht als Zeichenkette.** Seit ADR-033 ist es ein Instant. Als Absicherung, nicht als Bugfix: Heute bringt kein Pfad zwei Schreibweisen in denselben Vergleich (§5.0), aber der Stringvergleich hängt an einer ungeprüften Annahme über die Herkunft beider Seiten. Gleiche Zeichenketten bleiben gleich, bevor geparst wird. Die Änderung wirkt auch auf `ruleDiffers` und bekommt dort einen eigenen Test.

10. **Die Regel wird zwei Dialogzeilen, nicht fünf — und nicht eine.** Geändert am 2026-09-18 (§5.0): Ursprünglich stand hier „eine Zeile", mit der Begründung, der Nutzer habe einen Radio-Button angefasst, keine fünf Spalten. Die Begründung trägt weiter, sie zählt nur richtig: Das Formular hat **zwei** Bedienelemente für die Regel, Option und Anzahl, und beide haben vorhandene Beschriftungen. Eine Zeile konnte Unterschiede allein in Anzahl oder Enddatum nicht zeigen und hätte zwei gleiche Werte nebeneinandergestellt. Fünf Zeilen bräuchten weiterhin fünf neue Copy-Keys und damit den Designer.

11. **`mineRecurrence == null` ist nie ein Konflikt.** Ohne Regel im Schreibvorgang stehen die `rrule_*`-Spalten nicht im UPDATE; es gibt nichts zu überschreiben.

---

## 9. Definition of Done

Je PR:

- Ein Regressionstest, der **vor** dem Fix rot ist — vorgeführt, nicht behauptet.
- `bun run typecheck`, `bun lint`, `bun test`, `bun format:check` grün.
- Die Kalender- und Aufgaben-Suiten laufen unter drei Runner-Zonen (`Europe/Berlin`, `UTC`, `America/New_York`) mit identischem Ergebnis. Diese Iteration fasst zwar keine Zonenlogik an — aber `rule.ts` vergleicht Zeitpunkte, und Block 1 hat fünf Befunde geliefert, die nur unter einer fremden Zone sichtbar waren.
- `docs/TODO.md` im selben Commit gepflegt: erledigte Einträge gelöscht, neue Grenzen angelegt.
- Jede neue exportierte Funktion mit JSDoc-Block, im selben Commit (CLAUDE.md → Docstrings).
- Lokaler CodeRabbit-Durchlauf (`coderabbit review --base main`) vor dem Öffnen des PRs.

Für den Block:

- Das Löschen einer Aufgabe, die jemand anderes im Undo-Fenster geändert hat, zeigt denselben Fehler-Toast mit „Trotzdem löschen" wie der Termin-Pfad.
- Eine reine Rhythmus-Änderung durch zwei Clients erzeugt einen Dialog statt eines stillen Overwrites — und die Exceptions der Serie überleben, solange niemand „Deine Fassung speichern" wählt.
- Der zeilenlose Konflikt-Dialog verschwindet nicht (Occurrence außerhalb des Fensters, noch nicht hydrierte Basis, erschöpftes Auto-Retry-Limit bleiben möglich) — aber er hat jetzt in jedem Fall eine frische Basis-Version, weil `row` nicht mehr fehlen kann.
- `features/tasks/mutations.ts` hat eine Testsuite; der Zwei-Client-Lauf ist nicht mehr der einzige Beleg für das Task-CAS.
- Eine Sichtprüfung am Simulator über beide Pfade: Aufgabe löschen (Konflikt und Normalfall), Serienrhythmus gleichzeitig ändern. Web reicht für den Aufgaben-Löschpfad, nicht für den Termin-Pfad (Block 3).
