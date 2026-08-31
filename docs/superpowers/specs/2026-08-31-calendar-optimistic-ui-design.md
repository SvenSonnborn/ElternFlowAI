# Optimistische Kalender-Updates — Design

**Status:** Approved (Brainstorming Phase)
**Date:** 2026-08-31
**Decision-Log:** wird als ADR-027 referenziert nach Implementation

---

## 1. Context

Kalender-Änderungen sollen sofort erscheinen, statt erst nach der Server-Antwort. Heute laufen alle drei Mutationen auf invalidate-and-refetch: `useCreateEvent`, `useUpdateEvent` und `useDeleteEvent` werfen ihr `invalidateQueries` in `onSuccess` und warten auf den Refetch. `docs/TODO.md` führt das seit der Kalender-V1 als offenen Punkt.

### Was der Auftrag annahm und was zutrifft

| Annahme                                     | Realität                                                                                                                                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Alle drei Mutationen brauchen `onMutate`    | **Löschen ist bereits sofort.** Seit [ADR-026](../../decision-log.md) blendet `useFamilyEvents` einen Termin im Undo-Fenster aus; das Ziel ist dort auf anderem Weg erreicht.                                            |
| `onMutate` patcht den Cache                 | Der Cache hält **Master-Zeilen**, die UI zeigt **Occurrences**. Dazwischen liegt `expandEvents`.                                                                                                                         |
| Anlegen ist optimistisch machbar wie üblich | Die Gegen-Präzedenz steht im Haus: `useCreateTask` lehnt Optimismus ausdrücklich ab (erfundene Id, gejointe Typ-Zeile, Rollback nimmt das gerade Angelegte weg). Zwei der drei Gründe entfallen hier — siehe Decision 4. |
| Der Nutzer sieht einen veralteten Kalender  | Nur kurz: Beide Sheets bleiben bis `onSuccess` offen und zeigen „Speichern…". Der veraltete Stand erscheint erst in dem Moment, in dem das Sheet zugeht und der Refetch noch läuft.                                      |

### Zielbild

Der Nutzer legt einen Termin an oder ändert einen: Das Sheet schließt sofort, und der Termin steht schon im Kalender — auch im Dashboard, weil beide denselben Hook lesen. Schlägt das Speichern danach fehl, verschwindet er wieder und ein Fehler-Toast trägt die Aktion, die ihn zurückbringt.

### Was explizit nicht abgedeckt ist

- **`useDeleteEvent`** — unverändert. Siehe Decision 2.
- **Die Vereinigung der beiden Overlays** (Pending-Deletes und optimistische Änderungen) — siehe Decision 8.
- **Aufgaben-Mutationen** — `useUpdateTask`/`useToggleTaskDone` sind bereits optimistisch, `useCreateTask` bewusst nicht.
- **Der Detail-Screen** (`useEvent`, eigener Query-Key) — siehe Decision 7.

---

## 2. Architektur

```text
   Screen ──▶ useCreateEvent / useUpdateEvent
                    │ onMutate: Eintrag anlegen
                    │ onError:  Eintrag entfernen  (Rollback)
                    │ onSettled: invalidieren, DANN entfernen
                    ▼
        ┌──────────────────────────────────┐
        │ optimisticEvents (Zustand)       │  features/calendar — voll typisiert
        │  create: synthetische Master-Zeile│
        │  update: eventId+Datum+Scope+Δ   │
        └───────────────┬──────────────────┘
                        │ nach expandEvents auflegen
                        ▼
   fetchEventsInRange ──▶ expandEvents ──▶ withOptimistic ──▶ withoutPendingDeletes ──▶ data
                                              (patchen)          (löschen gewinnt)
```

### 2.1 Der Store — `features/calendar/optimisticEvents.ts`

```ts
export type OptimisticEvent =
  | { id: string; kind: "create"; row: EventWithRelations }
  | {
      id: string;
      kind: "update";
      eventId: string;
      occurrenceDate: string;
      scope: EditScope;
      changes: EventChanges;
    };
```

Kalender-eigen, nicht in `features/shared/`: Aufgaben brauchen es nicht. Damit entfällt der `target: unknown`-Kniff samt Cast, den der Pending-Delete-Store braucht — hier ist alles durchtypisiert.

Der Store hält `entries`, `add(entry) => id`, `remove(id)`. Keine Timer, kein Watchdog: Anders als beim Undo-Fenster gibt es hier keine Frist, die abläuft — der Eintrag lebt genau so lange wie die Mutation.

### 2.2 Die Anwendung — reine Funktionen

```ts
/** Legt die optimistischen Änderungen auf den expandierten Strom. */
export function withOptimistic(
  occurrences: CalendarOccurrence[],
  entries: readonly OptimisticEvent[],
  expand: (rows: EventWithRelations[]) => CalendarOccurrence[],
): CalendarOccurrence[];

/** Ob dieser Eintrag die gegebene Occurrence betrifft. */
export function patchesOccurrence(
  entry: Extract<OptimisticEvent, { kind: "update" }>,
  occurrence: { eventId: string; occurrenceDate: string },
): boolean;
```

`expand` wird injiziert statt importiert: `expandEvents` braucht `rangeStart`, `rangeEnd` und `theme`, die alle im Hook liegen — so bleibt `withOptimistic` eine reine Funktion, die ein Test mit einem Stub bedienen kann.

`patchesOccurrence` unterscheidet dieselben drei Scopes wie `hidesOccurrence` — `this` genau diese Occurrence, `forward` alle ab dem Datum einschließlich, `all` alle des Events. Der Datumsvergleich läuft wie dort auf den `YYYY-MM-DD`-Strings.

### 2.3 Wie ein Update-Patch aussieht

Das ist der inhaltliche Kern und der Ort, an dem eine naheliegende Implementierung falsch wäre.

`expandEvents` leitet die Zeiten einer Occurrence **aus der Master-Zeile** ab: Die RRULE-Expansion trägt die Tageszeit des Masters, die Dauer ist `end_at − start_at` ([expand.ts:104-113](../../../features/calendar/expand.ts)). Daraus folgt:

| Scope     | Was der Server tut                                                           | Was die Anzeige zeigt                                                                                                      | Der Patch                                                                                                   |
| --------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `this`    | schreibt eine `modified`-Exception, `EventChanges` **ist** das Override-JSON | `applyOverride` setzt `title`, `location`, `startAt`, `endAt` — **nicht** `description`                                    | Literalwerte aus `changes` übernehmen, `description` ausgenommen                                            |
| `all`     | schreibt alle fünf Felder auf den Master                                     | `title`, `location` **und** `description` ändern sich; jede Occurrence bekommt die **neue Tageszeit** und behält ihr Datum | alle fünf Felder patchen; Tageszeit und Dauer aus `changes` ableiten und pro Occurrence-Datum neu verankern |
| `forward` | spaltet die Serie in zwei Master-Zeilen                                      | ab dem Stichtag dasselbe wie `all`                                                                                         | wie `all`, aber nur ab `occurrenceDate`                                                                     |

Ein Patch, der bei `all` stumpf `changes.start_at` in jede Occurrence schreibt, zöge die ganze Serie auf einen Tag zusammen.

**Und `description` wird bei `this` nicht gepatcht.** `expandEvents` liest das Feld **immer** von der Master-Zeile ([expand.ts:130](../../../features/calendar/expand.ts)), auch bei einer `modified`-Exception — `applyOverride` kennt es nicht. Der Server schreibt eine geänderte Beschreibung zwar ins Override-JSON, die Anzeige übernimmt sie aber nie. Ein optimistischer Patch, der sie zeigte, erzeugte genau das Flackern, das dieses Feature abstellen soll: erst da, dann vom Refetch weggenommen. **Das Overlay spiegelt, was `expandEvents` anzeigt — nicht, was der Server schreibt.**

### 2.4 Die Verdrahtung in den Hooks

`onMutate` legt den Eintrag an und gibt seine Id als Kontext zurück; `onError` entfernt ihn; `onSettled` invalidiert und entfernt ihn **danach**:

```ts
onSettled: async (_data, _err, _vars, id) => {
  await qc.invalidateQueries({ queryKey: calendarKeys.all });
  if (id) removeOptimistic(id);
},
```

Die Reihenfolge ist keine Kosmetik: Wird der Eintrag vor dem Refetch entfernt, blitzt der alte Stand für einen Frame durch — dieselbe Lehre, die `useDeleteEvent` in [ADR-026](../../decision-log.md) gezogen hat.

`useCreateEvent` ruft dafür selbst `useEventTypes()` und schlägt `vars.typeId` nach. Es baut daraus eine
**synthetische `EventWithRelations`-Zeile** — dieselbe Form, die `fetchEventsInRange` liefert —, und `withOptimistic`
schickt sie durch **dasselbe `expandEvents`**, das auch die echten Zeilen expandiert.

Das ist der Unterschied zwischen Wiederverwendung und Nachbildung: Die Anzeige-Logik wird nicht ein zweites Mal
geschrieben, sondern ein zweites Mal _aufgerufen_. Ein neu angelegter **Serientermin** erscheint dadurch mit allen
seinen Occurrences im Fenster statt nur mit der ersten — hätte der Eintrag eine fertige Occurrence getragen, poppte
der Rest erst mit dem Refetch nach, und genau das soll das Feature abstellen. Die Range-Grenze fällt gratis ab,
weil `expandEvents` sie ohnehin anwendet.

Erfunden wird nur die `id` der Zeile (Präfix `optimistic-`, damit sie in Logs erkennbar ist).

---

## 3. Entscheidungen

**Decision 1 — Anzeige modellieren, nicht Speicherung.** Das Overlay liegt auf dem expandierten Occurrence-Strom, nicht auf den gecachten Master-Zeilen. Die Alternative — `onMutate` mit `setQueriesData` über alle `calendarKeys.range`-Einträge, wie `patchTaskCaches` es bei den Aufgaben tut — scheiterte an derselben Stelle wie beim Löschen: Um eine Änderung an _einer_ Occurrence sichtbar zu machen, müsste eine `event_exceptions`-Zeile synthetisiert werden, für `forward` die Serie gespalten. Das ist die Client-Nachbildung von `applyEditScope`, die [ADR-026](../../decision-log.md) Decision 2 für `applyDeleteScope` bereits verworfen hat. Dazu überholt jeder Refetch im offenen Fenster einen Snapshot-basierten Rollback.

**Decision 2 — `useDeleteEvent` bleibt unangetastet.** Das Ziel des Auftrags ist dort erfüllt: Ein gelöschter Termin verschwindet sofort, weil das Undo-Fenster ihn ausblendet. `onMutate` nachzurüsten brächte keine sichtbare Verbesserung und holte die verworfene Nachbildung zurück.

**Decision 3 — Näherung statt Exaktheit bei Serien.** Die optimistische Anzeige muss gut aussehen, nicht dem entsprechen, was der Server schreibt; der Refetch korrigiert innerhalb einer Sekunde. Konkret nicht abgedeckt: eine per Exception verschobene Occurrence im `forward`-Fall — das Overlay vergleicht aufgelöste Daten, der Server rechnet auf Regel-Daten. Dieselbe Divergenz ist für den Lösch-Filter bereits in `docs/TODO.md` notiert; sie ist selbstheilend und kostet ein sichtbares Zurechtrücken.

**Decision 4 — Anlegen ist hier optimistisch machbar, anders als bei Aufgaben.** `useCreateTask`s Docstring nennt drei Gründe. Zwei entfallen: Die gejointe Zeile ist da (`useEventTypes()` im Hook), und der Rollback nimmt dem Nutzer nichts, weil der Fehler-Toast die Daten hält und zurückschickt (Decision 5). Es bleibt die erfundene Id — sie lebt nur bis zum Refetch und wird nie geschrieben.

**Decision 5 — Der Fehler-Toast kommt aus dem Screen, nicht aus dem Hook, und nicht aus einem Per-Call-Callback.** `features/*` darf nicht aus `app-sections/*` importieren, wo `useToast()` liegt. Und ein Per-Call-`onError` liefe nie: Das Sheet ist unmontiert, bevor die Mutation antwortet, und TanStack Query ruft Per-Call-Callbacks dann nicht mehr — das ist in `features/tasks/mutateAsyncSurvivesUnmount.test.ts` festgehalten. Der Screen ruft deshalb `mutateAsync(vars).catch(…)` in einer Closure, die den Unmount überlebt, und die Retry-Aktion schickt dieselben `vars` erneut. Derselbe Bau wie `useUndoableDelete`.

**Decision 6 — Keine visuelle Sonderbehandlung der optimistischen Occurrence.** Kein Ausgrauen, kein Spinner, kein Platzhalter-Stil: Sie soll echt aussehen, das ist der Zweck. Bleibt sie es nicht, sagt es der Toast. Als Folge verlieren `cal.create.saving` und `cal.edit.saving` ihre letzte Verwendung und entfallen mit ihren Keys — die Sheets schließen sofort, statt einen Ladezustand zu zeigen.

**Decision 7 — `useEvent` bekommt kein Overlay.** Der Detail-Screen liest einen eigenen Query-Key (`calendarKeys.one`). Ihn mitzupatchen hieße, dasselbe Overlay ein zweites Mal anzuwenden, für einen Screen, den der Nutzer im selben Moment verlässt. Erreichbar wäre die Abweichung nur, wenn er innerhalb des Refetch-Fensters zurück in die Detailansicht navigiert.

**Decision 8 — Zwei Overlays, nicht eins.** Pending-Deletes und optimistische Änderungen operieren auf demselben Strom und haben verwandte Form; sie zu vereinen wäre der sauberere Zug. Bewusst nicht jetzt: Der Pending-Delete-Store ist gerade durch eine vollständige Review-Runde gegangen, und Löschen steht nicht zur Disposition. Als TODO festgehalten, fällig beim dritten Overlay.

**Decision 9 — Die Reihenfolge der beiden Overlays ist Semantik.** Erst patchen, dann filtern: Eine Löschung gewinnt gegen eine gleichzeitige Bearbeitung. Andersherum bliebe ein gelöschter Termin sichtbar, weil der Patch ihn wieder einführte.

---

## 4. Copy

| Key                           | DE                                       | EN                    |
| ----------------------------- | ---------------------------------------- | --------------------- |
| `cal.create.error.saveFailed` | Termin konnte nicht angelegt werden      | Couldn't create event |
| `cal.edit.error.saveFailed`   | Änderung konnte nicht gespeichert werden | Couldn't save changes |

Die Meldung darunter liefert `mapEventError` (`cal.error.*`, seit [ADR-026](../../decision-log.md)). Die Aktion trägt das bestehende `action.retry`.

Entfallende Keys: `cal.create.saving`, `cal.edit.saving` (Decision 6).

---

## 5. Änderungen im Bestand

- **[features/calendar/hooks.ts](../../../features/calendar/hooks.ts)** — `useFamilyEvents` legt das Overlay zwischen `expandEvents` und `withoutPendingDeletes`.
- **[features/calendar/createMutation.ts](../../../features/calendar/createMutation.ts)** und **[mutations.ts](../../../features/calendar/mutations.ts)** — `onMutate`/`onError`/`onSettled` in `useCreateEvent` und `useUpdateEvent`. `useUpdateEvent`s `onSuccess` (heute `void qc.invalidateQueries(…)`) geht dabei in `onSettled` auf und wird zurückgegeben.
- **Beide Sheets** — schließen sofort statt auf `onSuccess` zu warten; `mutateAsync(vars).catch(…)` mit Fehler-Toast und Retry; die `isPending`-Beschriftungen fallen.

### TODO-Bilanz

| Eintrag                                                                        | Wird                                                                                                                                 |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| „**Optimistic UI** in den Calendar-Mutations (aktuell invalidate-and-refetch)" | gelöscht — eingelöst, mit der Ausnahme für `useDeleteEvent` im ADR begründet                                                         |
| neu                                                                            | Vereinigung der beiden Occurrence-Overlays (Decision 8)                                                                              |
| neu                                                                            | `applyOverride` kennt `description` nicht — der Server schreibt sie pro Occurrence, die Anzeige liest sie vom Master (Abschnitt 2.3) |

---

## 6. Tests

`features/calendar/optimisticEvents.test.ts`, reines TypeScript unter `bun test`:

- **Zeit-Neuverankerung bei `all`**: geänderte Uhrzeit verschiebt die Tageszeit **jeder** Occurrence, jedes Datum bleibt. Der Test, der die naheliegende Fehlimplementierung fängt — Serie zieht sich auf einen Tag zusammen.
- **Dauer bleibt erhalten**, wenn nur die Startzeit sich ändert.
- **Der `description`-Sonderfall**: Scope `this` mit geändertem Titel **und** geänderter Beschreibung zeigt den neuen Titel und die **alte** Beschreibung — deckungsgleich mit dem, was der Refetch bringt.
- **Scope `forward`** patcht den Stichtag einschließlich und nichts davor; **`this`** genau eine Occurrence; **`all`** alle des Events und keine eines fremden.
- **Create eines Serientermins** erscheint mit allen Occurrences im Fenster, nicht nur der ersten.
- **Create außerhalb des Fensters** erscheint nicht (fällt aus `expandEvents` ab — der Test hält es fest, damit eine spätere Umstellung es nicht verliert).
- **Overlay-Reihenfolge**: eine zugleich bearbeitete und gelöschte Occurrence ist weg.
- **Store**: anlegen · `remove` beim Rollback · leere Liste gibt die Eingabe unverändert zurück (Referenz, mit `toBe`).

**Sichtprüfung** (Web für Anlegen/Bearbeiten von Einzelterminen; Simulator für die Serien-Scopes, weil `Alert.alert` auf react-native-web ein No-op ist — siehe `docs/TODO.md`): Termin anlegen → steht sofort im Kalender und im Dashboard, kein Sprung, wenn der Refetch landet. Serientermin mit „alle" auf eine andere Uhrzeit → alle Occurrences verschieben sich, keine zieht sich auf einen Tag. Speichern bei abgeschaltetem Netz → Termin verschwindet, Fehler-Toast mit „Erneut versuchen", Netz an, Retap → Termin ist da.

---

## 7. Dateien

**Neu**

```
features/calendar/optimisticEvents.ts
features/calendar/optimisticEvents.test.ts
```

**Geändert**

```
features/calendar/hooks.ts             Overlay in useFamilyEvents
features/calendar/createMutation.ts    onMutate/onError/onSettled
features/calendar/mutations.ts         onMutate/onError/onSettled (nur useUpdateEvent)
features/calendar/index.ts             Barrel
app-sections/event/EventCreateScreen.tsx
app-sections/event/EventEditScreen.tsx
features/i18n/locales/{de,en}.json
docs/decision-log.md                   ADR-027
docs/TODO.md                           siehe TODO-Bilanz
CLAUDE.md                              Ordnerstruktur
```
