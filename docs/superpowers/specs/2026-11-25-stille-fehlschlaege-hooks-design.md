# Stille Fehlschläge in Hooks und Formularen (Roadmap Schritt 2) — Design

**Status:** Entwurf, abgestimmt im Gespräch mit Sven am 2026-11-25
**Date:** 2026-11-25
**Branch:** `fix/stille-fehlschlaege-hooks`, [roadmap.md](../../roadmap.md) Schritt 2
**Decision-Log:** ein ADR (059) am Branch-Ende

## 1. Worum es geht

Vier Einträge aus [TODO.md](../../TODO.md), an denen außerhalb des Kalenders ein Fehler stumm bleibt
oder die App das Falsche fragt. Eltern müssen sich darauf verlassen können, dass ein Haken oder eine
gespeicherte Aufgabe angekommen ist, und dass die App nichts behauptet, was sie nicht weiß.

| #   | TODO-Eintrag (Anfang)                                                     | Was heute passiert                                                                                                                                        |
| --- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | „`useToggleTaskDone` hat keinen 0-Zeilen-Guard“                           | Abhaken unter RLS oder nach einer Fremdlöschung meldet `error: null`. Der Haken springt nach dem Refetch kommentarlos zurück oder die Zeile verschwindet. |
| B   | „Während eines laufenden Speicherns stimmt die Verwerfen-Rückfrage nicht“ | In den Aufgaben-Sheets fragen „Abbrechen“ und Wischen „Änderungen verwerfen?“, obwohl gespeichert wird; das Formular bleibt editierbar.                   |
| C   | „Die Familien-Queries haben keinen Sitzungs-Guard“                        | Ohne Sitzung fragen die Familien-Queries anonym ab, bekommen `42501` und bleiben im Fehlerzustand.                                                        |
| D   | „Die Aufgaben-Hälfte von `prepPending` blendet die Prep-Karte … aus“      | Scheitert ein Neuladen der Aufgaben, verschwindet die Prep-Karte, obwohl ein belegter Stand da ist.                                                       |

## 2. Ziele, Nicht-Ziele, Anti-Ziele

**Ziele**

- Jeder der vier Fälle meldet sich oder verhält sich ehrlich, mit vorhandenen Texten, wo es geht.
- Jeder Fix hat einen Test, der den Fehler vorher nachstellt.

**Nicht-Ziele**

- Termin-Sheets. Sie schließen seit ADR-027 beim Tippen auf „Speichern“; bei Serien verdeckt die
  Bereichsabfrage (`pickScope`) das Formular. Der TODO-Eintrag nennt `EventEditScreen` aus einer
  Zeit davor.
- Aufgaben-Sheets optimistisch schließen wie die Termin-Sheets (Ansatz B2 unten).
- Der Lösch-Fall in `updateTask` (`Error("Task no longer exists")`) bleibt bei `hw.error.generic`.
  Er wäre mit derselben Fehlerklasse wie in A ein Einzeiler, ist aber nicht Teil dieses Schritts.
- Ein eigener Text für „du gehörst nicht mehr zur Familie“ (eigener TODO-Eintrag, Designer).

**Anti-Ziele**

- Eine Rückfrage, die etwas anderes fragt, als gerade passiert.
- Eine Eingabe, die angenommen und dann stillschweigend verworfen wird.
- Ein Sitzungs-Guard, der eingeloggte Nutzer auch nur einen Render lang ohne Daten lässt, wo heute
  welche stehen.

## 3. Ansätze

**Aufgaben-Formulare während des Speicherns** (B), gewählt von Sven:

- **B1 — Sperren bis zur Antwort (gewählt).** Formular und „Abbrechen“ sind gesperrt, Wischen
  federt zurück, ohne zu fragen. Erfolg schließt das Sheet, ein Fehler gibt es wieder frei, mit
  Inline-Zeile wie heute. Kleiner Umbau, Fehlerbild bleibt vertraut.
- **B2 — Sofort schließen wie bei Terminen.** Das Fenster entfällt ganz, aber eine neue Aufgabe
  erscheint erst nach der Antwort (`useCreateTask` ist bewusst nicht optimistisch), jeder Fehler
  wird zum Toast, und der Konfliktpfad im Bearbeiten-Sheet müsste umgebaut werden.

**Sitzungs-Guard** (C), meine Entscheidung:

- **`enabled` an der Sitzung (gewählt).** Ein Flag pro Query; Keys, Invalidierung und Realtime
  bleiben unberührt. Nutzerwechsel deckt schon `qc.clear()` beim Abmelden ab.
- **Nutzerbezogene Keys.** Trennt Nutzer auch ohne `clear()`, ändert aber jeden Key und damit jede
  Invalidierung und den Realtime-Pfad. Für den Zweck zu viel.

**Abhaken einer verschwundenen Aufgabe** (A), meine Entscheidung:

- **Melden mit `hw.notFound` (gewählt).** „Aufgabe nicht gefunden“ steht schon im Katalog und
  passt; kein neuer Copy-Key.
- **Still als Erfolg wie `deleteTask`/`missing`.** Beim Löschen ist das Ziel (Aufgabe weg)
  erreicht, beim Abhaken nicht. Die Zeile verschwände ohne Erklärung.

## 4. Die vier Punkte

### A. Abhaken mit 0-Zeilen-Guard

- Der Schreibpfad von `useToggleTaskDone` wandert als reine Funktion `toggleTaskDone` neben
  `updateTask`/`deleteTask` hinter `TaskOps` (neue Op, die meldet, ob eine Zeile getroffen wurde,
  über `.select("id")`). Damit läuft er unter `bun test` wie die beiden anderen.
- Keine Zeile getroffen → `fetchRow` liest nach: Zeile weg → neue `TaskGoneError`; Zeile da →
  `TaskForbiddenError` (RLS).
- `mapTaskError`: `TaskGoneError` → `hw.notFound`. `TaskForbiddenError` bleibt bei
  `hw.error.notAuthenticated`.
- `TaskRow` bleibt unverändert: `onError` zeigt den Text schon an, `onError` der Mutation rollt den
  optimistischen Patch zurück, `onSettled` lädt neu.
- Der Docstring an `TaskOps`, der die fehlende Prüfung erwähnt, wird nachgezogen.

### B. Aufgaben-Formulare sperren, solange gespeichert wird

Gilt für `TaskCreateScreen` und `TaskEditScreen`.

- **Formular:** `TaskForm` bekommt `disabled`. Textfelder werden `editable={false}` (das graut sie
  über `Field` schon ein), Typ, Kind, Datum, Uhrzeit und „Uhrzeit entfernen“ nehmen keine Eingabe
  an. Beim Speichern schließt die Tastatur, damit ein fokussiertes Feld keine Tasten mehr annimmt.
- **„Abbrechen“** ist während des Speicherns `disabled`. „Löschen“ ist es im Bearbeiten-Sheet
  schon.
- **`useDiscardGuard`** bekommt einen zweiten Zustand „speichert“: Die Sperre greift dann auch
  ohne Änderungen, und statt der Rückfrage passiert nichts. Wischen auf iOS federt zurück, die
  Zurück-Taste auf Android tut nichts. Der Android-Sonderfall bleibt: Natives Wegwischen geht durch.
- **Verlassen während des Speicherns** (nur Android-Wischen und der Konfliktpfad): Beide Screens
  merken sich in einer Ref, ob sie noch stehen. Erfolg navigiert nur, solange der Screen steht,
  sonst gar nicht (heute navigiert `TaskEditScreen` dann ein zweites Mal). Ein Fehler kommt
  inline, solange der Screen steht, sonst als Toast.
  - `TaskEditScreen` hat diese Logik für den Konfliktpfad schon (`leftAfterConflict`); die Ref
    deckt künftig beide Wege ab.
  - `TaskCreateScreen` wechselt von `mutate` mit Per-Call-Callbacks auf `mutateAsync`, wie
    `TaskEditScreen` (Per-Call-Callbacks feuern nach dem Unmount nicht, siehe
    `mutateAsyncSurvivesUnmount.test.ts`). Heute verliert ein Fehler nach dem Wegwischen die
    Aufgabe stumm.
  - Toast-Titel beim Anlegen: neuer Key `hw.create.error.saveFailed` („Aufgabe konnte nicht
    hinzugefügt werden“ / „Couldn't add the task“), Meldung `t(mapTaskError(err))`. Der
    bestehende `hw.edit.error.saveFailed` sagt „Änderung“ und passt nicht. Den Nachtrag in
    `docs/COPY.md` deckt der TODO-Eintrag „Neue Formular-Keys fehlen“ (`hw.create.*`) schon ab.

### C. Sitzungs-Guard für die Familien-Queries

- Ein kleiner Hook in `features/auth/session.ts` liefert „angemeldet“ (`status ===
"authenticated"`), und jede Familien-Query ohne andere Sitzungsbindung trägt ihn in `enabled`,
  bei bestehendem `enabled` verundet:
  `useFamilyEvents`, `useEvent`, `useEventTypes`, `useEventReminders`, `useFamilyTasks`,
  `useTaskTypes`, `useMealPlans`, `useRecipe`, `useRecipes`.
- Nicht nötig: die Queries in `familyQueries.ts` und `useCurrentParent` (an Ids aus der Sitzung
  gebunden) und `useMealAlternative` (an die Familien-Allergien gebunden).
- Import aus `@/features/auth/session`, nicht aus dem Barrel: Das Barrel zieht unter `bun test`
  nativewind nach (deshalb mockt `mutations.test.ts` es).
- Eine abgeschaltete Query ohne Daten hat `isLoading: false`. Sichtbar wird das nur in einem Pfad,
  der ohne Sitzung gemountet bleibt, und den hängt `AuthGate` heute ab (ADR-040).

### D. `prepPending` liest `hasData` auch für die Aufgaben

- `useFamilyTasks` gibt wie `useFamilyEvents` `hasData` (`query.data !== undefined`) zurück.
- `DashboardScreen`: `prepPending = !hasData || !tasks.hasData`. Der Docstring-Satz zur
  Termin-Hälfte gilt dann für beide Hälften.

## 5. Tests

- A: `toggleTaskDone` gegen Fake-Ops in `mutations.test.ts` (getroffen, weg, verboten,
  DB-Fehler); `mapTaskError(TaskGoneError)` in `errors.test.ts`.
- B: `TaskCreateScreen.jest.tsx` und `TaskEditScreen.jest.tsx`: Während des Speicherns sind Felder
  und „Abbrechen“ gesperrt; Erfolg nach dem Unmount navigiert nicht; Fehler nach dem Unmount zeigt
  den Toast. `useDiscardGuard` mit „speichert“: keine Rückfrage, Entfernen bleibt gesperrt.
- C: ohne Sitzung kein `queryFn`-Aufruf, mit Sitzung wie bisher (Hook-Test unter `test:rn`).
- D: `DashboardScreen.jest.tsx`: Aufgaben-Refetch scheitert mit alten Daten → Prep-Karte bleibt.

## 6. Dem Umsetzer überlassen

- Name des Sitzungs-Hooks und der neuen Op an `TaskOps`.
- Wie `TaskForm` die Picker sperrt (eigene `disabled`-Props an `TypePicker`/`MemberPicker` oder
  ein umschließendes `View` mit `pointerEvents`), solange Touch und Screenreader nichts auslösen.
- Ob `leftAfterConflict` umbenannt oder durch die allgemeine Ref ersetzt wird.
- StrictMode: Die Mounted-Ref setzt sich im Effekt auf `true` und im Cleanup auf `false`.

## 7. Am Branch-Ende

- Die vier TODO-Einträge löschen, Schritt 2 aus [roadmap.md](../../roadmap.md) entfernen.
- ADR-059: Konvention für Formulare während des Speicherns (B1), Sitzungs-Guard über `enabled`,
  `hw.notFound` für das Abhaken einer verschwundenen Aufgabe.
