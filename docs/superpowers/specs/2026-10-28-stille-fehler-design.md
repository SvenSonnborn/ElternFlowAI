# Stille Fehler — Design

**Status:** Approved (Brainstorming)
**Date:** 2026-10-28
**Branch:** `fix/stille-fehler`, der erste Branch der am 2026-10-28 neu geordneten Reihenfolge (vor Roadmap 8.3)
**Decision-Log:** ein kurzer ADR (049) am Branch-Ende

## 1. Worum es geht

Drei Fehler, die nirgends in der Roadmap stehen, liefern heute **still** falsche Daten oder Urteile. Niemand bekommt eine Meldung, und die App sieht dabei plausibel aus:

1. **Allergie-Urteil.** Ist eine der Allergie-Abfragen pausiert (Web offline) oder deaktiviert, gelten die Allergien der Familie als „keine". Der Rezept-Browser zeigt dann „sicher", und beim Einplanen kommt kein Allergie-Hinweis. TanStack v5 meldet `isLoading` nur, wenn die Query aussteht **und** gerade lädt.
2. **Ganztägige Termine.** `toAllDayRange` ([dateRange.ts](../../../features/calendar/dateRange.ts)) schnappt in der Zone des **Geräts** auf 00:00/23:59. Ein ganztägiger Termin am 15.06. in `Europe/Berlin`, unverändert gespeichert von einem Gerät in `America/New_York`, wird zu „14.06. 06:00 bis 16.06. 05:59" in Berliner Zeit. Der Fehler wird gespeichert und erreicht alle Familienmitglieder.
3. **Detail-Sheet.** `useEvent` ([hooks.ts](../../../features/calendar/hooks.ts)) fällt mit `?? expanded[0]` auf die erste Occurrence der Serie zurück, wenn die angeforderte nicht gefunden wird. Das passiert nach „dieser und folgende" und bei einem kaputten `occ`-Link. Ein anschließendes „Löschen → Nur diesen" trifft dann die falsche Occurrence.

Dazu zwei kleine Fehler aus demselben Bereich:

4. Wechselt eine Aufgabe den Typ, zeigt `TaskRow` bis zum Refetch Farbe und Namen des alten Typs. `applyUpdate` in [optimistic.ts](../../../features/tasks/optimistic.ts) setzt `type_id`, aber nicht das eingebettete `task_types`.
5. Der Fehler beim Schalten einer Erinnerung zeigt die rohe Server-Meldung (`EventDetailScreen.onReminderToggle`, `body: err.message`), oft eine englische PostgREST-Meldung.

## 2. Ziele, Nicht-Ziele, Anti-Ziele

**Ziele**

1. Fehlen die Familien-Allergien, ohne dass sie gerade laden, gilt das als **unbekannt** und nicht als „keine". Das gilt für jedes Urteil.
2. Wer einen ganztägigen Termin unverändert speichert, bekommt ihn bit-genau so zurück, in jeder Gerätezone.
3. `useEvent` zeigt bei einer Serie nie eine andere Occurrence als die angeforderte.
4. Nach dem Speichern einer Serien-Änderung landet der Nutzer nicht auf einem verwaisten Detail-Sheet.
5. Die zwei kleinen Fehler sind behoben.
6. Für jeden der fünf Punkte gibt es einen Test, der vor dem Fix rot ist.

**Nicht-Ziele**

- **Das Anzeige-Modell ganztägiger Termine** bleibt, wie es ist (meine Entscheidung). Ein Leser in New York sieht einen Berliner Ganztages-Termin weiterhin von 18:00 bis 17:59 seiner Zeit, also über zwei seiner Tage. Ganztägig als zonenloses Datum zu behandeln, berührt Expansion, Raster und Formular und ist ein eigenes Thema. Der TODO-Eintrag zur unsichtbar benutzten Gerätezone steht schon.
- **Alte Deep-Links aus der Zeit vor ADR-034**, die zufällig die Nachbar-Occurrence treffen: Der TODO-Eintrag bleibt, sein Text wird an das neue Verhalten angepasst.
- **Der 0-Zeilen-Guard für `useToggleTaskDone`** fällt aus diesem Branch heraus (meine Entscheidung). Wer eine von jemand anderem gelöschte Aufgabe abhakt, sieht sie nach dem Refetch verschwinden. `useDeleteTask` behandelt `missing` genauso still als Erfolg. Eine Meldung bräuchte einen neuen Copy-Key. Der TODO-Eintrag bleibt und bekommt diese Begründung.
- Neue Copy. Jeder Fix kommt mit vorhandenen Keys aus.

**Anti-Ziele**

- **Ein Fix verschiebt den stillen Fehler nur an eine andere Stelle.** Ein Beispiel: Die Allergie-Regel gilt im Rezept-Browser, aber nicht beim Einplanen oder beim Ausweichgericht auf dem Dashboard.
- **Ein Einzeltermin wird nach einer Verschiebung als „existiert nicht mehr" gemeldet.**
- **Neue Termine verhalten sich anders als heute.** `EventCreateScreen` schnappt in `deviceTimeZone()`, das Ergebnis muss gleich bleiben.
- **Das Schließen nach einer Serien-Änderung schließt zu viel**, zum Beispiel einen Tab-Wechsel oder ein leerer Stack, oder es hängt bei einem Kaltstart-Deep-Link.

## 3. Entwurf

### 3.1 Familien-Allergien: unbekannt statt „keine"

Die Regel steht **an einer Stelle**, in [judge.ts](../../../features/meals/allergens/judge.ts) bzw. im Zustand, den `useFamilyAllergies` liefert. Die drei Abfragen sind Elternteil, Kinder und Eltern. Die Zeilen gelten von oben nach unten, die erste passende entscheidet (meine Entscheidung):

| Zustand                                           | `judgeWithAllergyState` | `allergyCheck` (Einplanen)                          |
| ------------------------------------------------- | ----------------------- | --------------------------------------------------- |
| eine der drei Abfragen hat einen Fehler           | `unverified`            | `unknown`: Nachfrage „konnten nicht geprüft werden" |
| alle drei haben Daten                             | Urteil über `keys`      | wie heute                                           |
| Daten fehlen, mindestens eine Abfrage lädt gerade | `unverified`            | `loading`: Einplanen wartet                         |
| Daten fehlen, keine lädt (pausiert, deaktiviert)  | `unverified`            | `unknown`: Nachfrage „konnten nicht geprüft werden" |

- „Lädt gerade" heißt: die Abfrage holt in diesem Moment (TanStack `isFetching`). Das gilt über die ganze Kette. Solange `useCurrentParent` lädt, sind Kinder und Eltern deaktiviert, weil die `family_id` fehlt. Das zählt als „lädt" und nicht als „unbekannt".
- Ein gescheitertes Neuladen mit alten Daten bleibt ein Fehler, wie heute.
- Den pausierten Fall behandle ich wie einen Fehler und nicht wie „lädt". Offline wartete das Einplanen sonst ohne Ende. Mit der vorhandenen Nachfrage kann der Nutzer bewusst „Trotzdem hinzufügen".

Betroffene Aufrufer, laut Suche alle, die es gibt: [useRecipeJudge.ts](../../../features/meals/useRecipeJudge.ts), [useMealAlternative.ts](../../../features/meals/useMealAlternative.ts), [planningSteps.ts](../../../features/meals/planningSteps.ts) über [useMealPlanning.ts](../../../app-sections/meal/useMealPlanning.ts) (`allergiesLoading`).

### 3.2 `toAllDayRange` in der Zone des Termins

`toAllDayRange(range, timeZone)` bekommt die Zone als Pflichtparameter:

- Anfang: 00:00 des Tages `zonedDateKey(range.startAt, timeZone)` in `timeZone`
- Ende: 23:59:00.000 des Tages `zonedDateKey(range.endAt, timeZone)` in `timeZone`

Die Bausteine stehen in [timezone.ts](../../../features/calendar/timezone.ts) (`zonedDateKey`, `zonedDayBounds`, `floatingToInstant`). Das Ende bleibt bei 23:59, wie heute (`spans.ts` verlässt sich darauf).

Aufrufer:

- `EventEditScreen` übergibt die Zone des Termins.
- `EventCreateScreen` übergibt an beiden Stellen, beim Speichern und bei der Kollisionsprüfung, dieselbe Zone, mit der der neue Termin gespeichert wird (`deviceTimeZone()`).

Was die Garantie umfasst (meine Entscheidung):

- **Unverändert speichern** ergibt bit-genau denselben Termin.
- **Verschieben aus einer anderen Zone:** Der Termin wandert um so viele Tage, wie er im Formular verschoben wurde, weil `applyRangePick` die Uhrzeit des Starts behält. Ein Test deckt das ab.
- **Sommerzeit-Lücke:** Liegt das Ziel zwischen zwei Sommerzeit-Umstellungen, die in den beiden Zonen an verschiedenen Tagen liegen, kann das Ergebnis um einen Tag abweichen. Das gehört zum Anzeige-Modell, siehe Nicht-Ziele.
- **Keine Reparatur alter Termine:** Termine, die der alte Fehler schon verschoben hat, bleiben so. Man kann sie von gewollten nicht unterscheiden, und der Fix verschiebt sie nicht weiter.

Danach die Kommentare nachziehen, die das alte Verhalten beschreiben: `EventEditScreen` beim Konflikt-Dialog („auf Mitternacht in der **Gerätezone** geschnappt") und [recurrenceConflictRows.ts](../../../app-sections/event/recurrenceConflictRows.ts). Bleibt die Wochentags-Begründung dort stehen, muss sie mit dem neuen Schnappen noch stimmen.

### 3.3 `useEvent`: kein stiller Rückfall

Neue Regel für die Wahl der Occurrence (meine Entscheidung):

- **Termin ohne Wiederholungsregel:** Es gibt genau eine Occurrence. `occ` wird ignoriert, sie wird immer gezeigt. Das deckt den verschobenen Einzeltermin ab, dessen alter Schlüssel noch in der Route steht.
- **Serie mit `occ`:** genau die Occurrence mit diesem `occurrenceKey`, sonst `null`.
- **Serie ohne `occ`:** die erste Occurrence, wie heute.

`eventLookupWindow` deckt den Tag aus `occ` ab und dazu den Override genau dieser Occurrence. Jede gültige Occurrence wird also gefunden, und `null` heißt wirklich, dass es sie nicht (mehr) gibt.

`null` führt im Detail-Sheet in den vorhandenen Zustand „Der Termin existiert nicht mehr." (`cal.error.eventGone`) und im Bearbeiten-Sheet in dessen vorhandenen `!occurrence`-Zweig. Ein kaputter `occ`-Link landet damit ebenfalls dort. Das ist die Meldung, die der TODO-Eintrag zum unvalidierten `occ` verlangt, ohne neue Copy.

Die Wahl wird eine reine Funktion neben `eventLookupWindow` und ist dort unter `bun test` testbar, weil `hooks.ts` unter Bun nicht lädt. Dazu kommt der fehlende Hook-Test für `useEvent` unter `jest` (`*.jest.ts`, ADR-042).

Die langen Kommentare in `useEvent` und `eventLookupWindow`, die den `expanded[0]`-Rückfall beschreiben, werden auf das neue Verhalten gekürzt.

### 3.4 Nach einer Serien-Änderung beide Sheets schließen

Sven hat entschieden: Speichert `EventEditScreen` einen **wiederkehrenden** Termin mit Scope `forward` oder `all` (dazu zählt eine Regeländerung), schließen Bearbeiten- und Detail-Sheet gemeinsam. Der Nutzer landet dort, wo er das Detail geöffnet hat: im Kalender oder auf dem Dashboard.

- Scope `this` und nicht wiederkehrende Termine: wie heute, zurück ins Detail-Sheet. Der `occurrenceKey` bleibt dort gültig.
- Beide schließen nur, wenn direkt unter dem Bearbeiten-Sheet das Detail-Sheet **desselben Termins** liegt (meine Entscheidung). Sonst gilt das Verhalten von heute: zurück, falls möglich, sonst `router.replace("/(tabs)/kalender")`.
- Bearbeiten wird heute nur aus dem Detail-Sheet geöffnet (`EventDetailScreen`, `router.push`). Der Root-Stack hat keinen Anker (`unstable_settings`), ein Kaltstart-Deep-Link auf `/event/edit/[id]` steht also allein und landet im `replace`.
- Das Schließen passiert im selben Moment wie heute das Schließen des Bearbeiten-Sheets, also optimistisch nach ADR-027 und nicht erst nach dem Server. Fehler-Toast und Konflikt-Dialog laufen wie heute über die Hosts an der Wurzel.

### 3.5 `task_types` im optimistischen Update

Ändert `TaskChanges` die `type_id`, setzt `applyUpdate` auch das eingebettete `task_types` auf die Zeile des neuen Typs. Die kommt aus dem Query-Cache der Aufgabentypen. Vorbild ist `useCreateEvent`, das den Event-Typ aus dem Cache liest. Steht der Typ nicht im Cache, wird `task_types` `null` statt alt (meine Entscheidung): lieber kurz kein Badge als ein falsches.

### 3.6 Erinnerungs-Fehler übersetzen

`onReminderToggle` zeigt als Body `t(mapEventError(err))` statt `err.message`. Die Keys passen (`eventGone` bei 23503, `notAuthenticated` bei 42501, `network`, `generic`), neue Copy ist nicht nötig. Der Titel `cal.detail.reminderError` bleibt.

## 4. Prüfen

- `bun test`: reine Funktionen (Allergie-Zustand und beide Urteile, `toAllDayRange` mit Rundlauf aus `America/New_York` und unverändertem Ergebnis in der Gerätezone, Occurrence-Wahl, `applyUpdate`). Jeder Test muss vor dem Fix rot sein.
- `bun run test:rn`: `useEvent`-Hook-Test. Das Schließen nach einer Serien-Änderung prüft der vorhandene `EventEditScreen`-Komponententest, sofern sich der Router dort sinnvoll beobachten lässt. Sonst bleibt es beim Sichtlauf.
- Sichtlauf (Web gegen lokale Supabase, `Web (lokal)`): Serien-Änderung „dieser und folgende" schließt beide Sheets. „Nur diesen" kehrt ins Detail zurück. `?occ=kaputt` zeigt „existiert nicht mehr". Das Schließen zweier `formSheet`s zusätzlich im iOS-Simulator, weil es nativ anders stapelt als auf Web.
- `bun run typecheck`, `bun lint`, `bun format:check`, dann `coderabbit review --base main`.

## 5. Doku am Branch-Ende

- ADR-049, kurz: kein stiller Rückfall in `useEvent`, Ganztägig in der Zone des Termins, Allergien „unbekannt statt keine".
- `docs/TODO.md`: die Einträge dieses Branches löschen (Reminder-Fehler, Split-Rückfall, unvalidiertes `occ`, `toAllDayRange`, `task_types`, Allergien, `useEvent`-Test). Anpassen: alte Deep-Links und `useToggleTaskDone`. Präzisieren: „Toast statt `showAlert`" und „Conflict-Detection beim Anlegen/Editieren", beide halb erledigt.
- `docs/roadmap.md`: die neue Reihenfolge der nächsten Branches, 8.1 als erledigt, der Block-9-Punkt `RCT_USE_PREBUILT_RNCORE` als entfallen (Verweis auf ADR-048).
- `docs/eltern-flow-ai-project-structure.md`: `scripts/` aufnehmen.
- `docs/architecture.md`, falls es den `useEvent`-Rückfall oder `toAllDayRange` beschreibt.

## 6. Dem Builder überlassen

- Die Form des Allergie-Zustands (`keys: … | null`, ein zusätzliches Feld o. ä.), solange die Regel an einer Stelle steht.
- Wie `EventEditScreen` erkennt, dass das Detail-Sheet darunter liegt, und wie es beide schließt (`router.dismiss(2)` o. ä., Expo-Router-58-API über context7 prüfen).
- Name und Ort der reinen Occurrence-Wahl-Funktion.
- Reihenfolge und Zuschnitt der Plan-Aufgaben.
