# Kalender-Korrekturen (Roadmap 8.3) — Design

**Status:** Entschieden ohne Rückfragen (Sven, 2026-11-12: „entscheide du“)
**Date:** 2026-11-12
**Branch:** `fix/kalender-korrekturen`, [roadmap.md](../../roadmap.md) 8.3
**Decision-Log:** ein kurzer ADR (056) am Branch-Ende

## 1. Worum es geht

Die drei offenen Einträge aus 8.3, alle aus [TODO.md](../../TODO.md) und alle im Kalender:

1. **Kein Kompositions-Test für die Kalender-Filterkette:** Kein Test schickt echte `expandEvents`-Ausgabe durch den Löschfilter.
2. **`typeLabelsForSlug` liefert keine Bezeichnung, solange i18next nicht initialisiert ist.** Der TODO-Eintrag nennt `undefined`; mit i18next 26 ist es ein leerer String. Nachgeprüft am 2026-11-12: `t` und `getFixedT(…)` geben vor `init()` beide `""` zurück und ignorieren den `defaultValue`. `labelDe`/`labelEn` sind dann leer.
3. **Die Kollisionsprüfung reicht nur so weit wie das geladene Monatsfenster:** `EventCreateScreen` prüft auf `useFamilyEvents(startAt)`, also auf dem Monat des Starts ±7 Tage. Ein Termin, der darüber hinausreicht, wird nur im geladenen Ausschnitt geprüft.

Was der Code am 2026-11-12 zeigt und die Einträge verschiebt:

- **Punkt 1 ist zum Teil erledigt.** Seit [ADR-051](../../decision-log.md) laufen in [optimisticEvents.test.ts](../../../features/calendar/optimisticEvents.test.ts) echte `expandEvents`-Ausgaben durch `visibleOccurrences`, also durch genau die Kette aus `useFamilyEvents` samt Löschfilter. Allerdings nur mit Einzelterminen, und Löschungen nur mit Scope `this`. Es fehlen die Serie, die Scopes `forward` und `all` und die per Exception verschobene Occurrence.
- **Punkt 1 und 2 hängen zusammen.** Unter `bun test` initialisiert niemand das globale i18next; nur `app/_layout.tsx` und `testing/renderScreen.tsx` importieren `@/features/i18n`. Jeder `bun`-Test, der `expandEvents` mit einer Zeile ohne `label`-Objekt aufruft, bekommt über `readLabel` → `typeLabelsForSlug` heute eine leere Bezeichnung. Das fällt nicht auf, weil kein Test sie liest.

## 2. Ziele, Nicht-Ziele, Anti-Ziele

**Ziele**

1. Ein Test schickt eine wöchentliche Serie durch das echte `expandEvents` und danach durch `visibleOccurrences` mit offenen Löschungen in allen drei Scopes. Er wird rot, wenn Expansion und Filter über verschiedene Felder schlüsseln.
2. `typeLabelsForSlug` liefert nie eine leere Bezeichnung.
3. Die Kollisionswarnung beim Anlegen sieht jeden Termin, der die geprüfte Spanne berührt, egal wie weit sie reicht.

**Nicht-Ziele**

- **Kollisionen späterer Occurrences einer neuen Serie.** Geprüft wird heute nur die erste Occurrence (`checked` ist `startAt`–`endAt`). Das steht in keinem TODO-Eintrag; es kommt als neuer Eintrag nach [TODO.md](../../TODO.md), im Commit von Punkt 3.
- **Kollisionsprüfung beim Bearbeiten.** Hat ihren eigenen TODO-Eintrag (Conflict-Detection in `EventEditScreen`) und bleibt dort.
- **Vorige Daten stehen lassen (`placeholderData`), solange ein neues Fenster lädt.** `useFamilyEvents` ist mit Kalender und Dashboard geteilt, dort hätte das andere Folgen. Dass die Warnung beim Wechsel in einen neuen Monat kurz fehlt, ist für einen Hinweis hinnehmbar.
- **`getFixedT` oder Dependency-Injection für `typeLabelsForSlug`.** Siehe §3.2.

**Anti-Ziele**, also Fehlschläge, auch wenn es läuft:

- Kalender-Tab oder Dashboard laden ein anderes Fenster als heute oder fetchen öfter.
- Jede Uhrzeit-Änderung im Formular löst einen neuen Fetch aus.
- Ein neuer Test, der gegen den alten Code nicht rot werden kann.

## 3. Entscheidungen

Alle drei sind meine Entscheidungen; Sven hat sie mir überlassen.

### 3.1 Kompositions-Test

- **Ort:** `optimisticEvents.test.ts`, im Block „visibleOccurrences mit dem echten expandEvents“. Dort liegen die Zeilen-Fixture und die echte Pipeline schon; `visibleOccurrences` legt die Reihenfolge fest (erst filtern, dann patchen). [pendingDeletes.test.ts](../../../features/calendar/pendingDeletes.test.ts) bleibt der Einheitstest von `hidesOccurrence`/`withoutPendingDeletes`.
- **Fälle**, auf einer wöchentlichen Serie mit mindestens vier Occurrences im Fenster:
  1. `this` auf der zweiten: genau die fehlt.
  2. `forward` ab der zweiten: nur die erste bleibt.
  3. `all`: nichts bleibt.
  4. Eine Exception verschiebt die zweite Occurrence hinter die dritte; `forward` ab der dritten: Die verschobene bleibt sichtbar, weil ihr `occurrenceKey` vor der Grenze liegt, auch wenn ihr Anzeigedatum dahinter liegt. Das ist der Fall, den vor [ADR-034](../../decision-log.md) der Vergleich über das Anzeigedatum falsch ausblendete.
- Jeder Fall prüft die `occurrenceKey`s des Ergebnisses, nicht nur die Anzahl.
- **Rot-Beleg:** Fall 4 muss rot werden, wenn `hidesOccurrence` probeweise auf `occurrenceDate` statt `occurrenceKey` vergleicht. Der Plan schreibt diesen Gegenlauf als Schritt vor; er wird nicht committet.

### 3.2 `typeLabelsForSlug`: ein Init-Guard

- Vor dem Nachschlagen: Ist i18next nicht initialisiert, liefert die Funktion `{ de: slug, en: slug }`. Das ist derselbe Wert, den heute der `defaultValue` bei fehlendem Key liefert (der Slug selbst, nicht der Alias).
- Warum kein `getFixedT`-Paar: Es löst das Problem nicht. Auch das fixierte `t` liest vor der Initialisierung nichts; das Paar würde nur die zwei `lng`-Optionen ersetzen. Der Guard setzt an der Ursache an und ändert keinen Aufrufer.
- **Tests:**
  - `features/calendar/palette.test.ts` (neu, `bun`): sichert zuerst zu, dass i18next dort nicht initialisiert ist. Sonst prüfte der Test still den anderen Zweig, sobald je ein `bun`-Test i18n lädt. Achtung: `isInitialized` ist vor `init()` `undefined`, nicht `false`; also `toBeFalsy()`, und der Guard prüft auf „nicht wahr“. Danach erwartet er den Slug für DE und EN, auch für einen Alias-Slug wie `training`.
  - `features/calendar/palette.jest.ts` (neu, `jest`): importiert `@/features/i18n` und erwartet die Katalogwerte, für einen Alias-Slug und einen Slug ohne Key. So deckt ein Test den initialisierten Zweig ab, und ein vertauschter Guard fiele auf.

### 3.3 Kollisionsfenster: Monate vom Start bis zum Ende

- **`useFamilyEvents(firstMonth, lastMonth = firstMonth)`:** Das Fenster reicht von `startOfMonth(firstMonth)` − 7 Tage bis `endOfMonth(lastMonth)` + 7 Tage. Kalender und Dashboard rufen weiter mit einem Argument auf und bekommen dieselben Query-Keys wie heute.
- **`EventCreateScreen`** ruft `useFamilyEvents(startAt, <das spätere von startAt und endAt>)` auf. Mit dem späteren der beiden kehrt sich das Fenster bei ungültiger Eingabe (Ende vor Start) nicht um.
- **Warum Monatsgrenzen statt genau der Formular-Spanne:** Endet ein Termin im selben Monat, in dem er beginnt (der Normalfall), bleibt der Key exakt der heutige: wie bisher ein Cache-Treffer mit dem Kalender-Tab, kein Fetch. Ein neuer Fetch kommt nur, wenn Start oder Ende eine Monatsgrenze überqueren. Ein Fenster genau an der Formular-Spanne wäre bei jeder Uhrzeit-Änderung ein neuer Key.
- **Warum kein eigener Hook:** Die Kollisionsprüfung braucht dieselbe Kette (Expansion, Overlay, Löschfilter, die Ansichtsregel aus ADR-051). Ein zweiter Hook müsste sie kopieren, oder man müsste sie für einen einzigen Aufrufer herauslösen.
- **Keine Obergrenze:** `fetchEventsInRange` filtert nur nach oben (`start_at ≤ Ende`; Serien über `rrule_until`). Ein späteres Ende lädt also nur zusätzlich die Termine bis dorthin, und `expandEvents` wächst linear mit dem Fenster. Mehrjährige Spannen legt niemand absichtlich an.
- **Invalidierung:** Das längere Fenster ist eine weitere Range-Query unter `calendarKeys.eventsRoot` und damit eine weitere Ansicht im Sinne von ADR-051. Realtime, Mutationen und die Ansichtsregel greifen ohne Sonderfall.
- **Tests:**
  - `features/calendar/hooks.jest.tsx`: Mit zwei Argumenten in verschiedenen Monaten bekommt `fetchEventsInRange` als Ende `endOfMonth(lastMonth)` + 7 Tage. Mit einem Argument bleibt das Fenster wie heute.
  - `app-sections/event/EventCreateScreen.jest.tsx`: Der vorhandene Mock von `useFamilyEvents` zeichnet seine Argumente auf. Liegt das Ende in einem späteren Monat, kommt dieser Monat als zweites Argument an.

## 4. Reihenfolge und Abschluss

1. §3.2 zuerst, damit der Kompositions-Test auf ehrlichen Bezeichnungen läuft.
2. §3.1.
3. §3.3.

Jeder Schritt ist ein Commit. Er löscht seinen TODO-Eintrag und bringt seine Docstrings und Kommentare mit (`useFamilyEvents` beschreibt heute „sichtbarer Monat plus 7 Tage“). Am Branch-Ende kommen ADR-056 (vor allem die Fensterregel aus §3.3 und der Init-Guard) und Roadmap 8.3 inklusive „Die nächsten Branches“. Beschreibt [architecture.md](../../architecture.md) das Fenster von `useFamilyEvents`, wird es dort nachgezogen. `CLAUDE.md` (Non-negotiable 3) sagt noch, das modulweite `t` liefere vor `init()` `undefined`; das wird zu „einen leeren String“ korrigiert, als redaktionelle Reparatur. ADR-020 bleibt, wie es ist.
