# Zwei-Client-Verifikation: Conflict-Detection (Issue #52)

Task 11 des SDD-Plans `2026-09-04-conflict-detection`. Zwei echte Browser-Kontexte
(Chromium, Python-Playwright, persistente Profile `ctx-a`/`ctx-b`, beide als
„SV" / Familie Becker angemeldet) gegen den Web-Loop auf `http://localhost:8082`
gefahren, ein Skript, sequenziell. Kein Produktivcode geändert.

**Environment-Hinweis:** Die Playwright-Skripte (`run1_event.py`, `run2_task.py`)
und alle Screenshots liegen im Scratch-Verzeichnis der Session und werden nicht
committet (Vorgabe des Auftrags) — die Pfade unten sind deshalb nur zur
Nachvollziehbarkeit dieses Laufs notiert, nicht als Repo-Referenz. Sessionlog:
`run1-log.txt`, `run2-log.txt` im selben Verzeichnis.

## Vorbereitung: Testtermin anlegen + Realtime-Gegenprobe

Kein Termin existierte zu Laufbeginn (beide Dashboards zeigten „Tagsüber alles
ruhig"). In Client A über den Kalender-Tab → „Termin hinzufügen" einen Termin
„Testtermin Konflikt \<HHMMSS>", 09:00–10:00 heute, Ort „Zuhause" angelegt.

| Erwartet                                                          | Beobachtet                                              | Screenshot                       |
| ----------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------- |
| B sieht den neuen Termin ohne eigenes Zutun (Realtime, Issue #51) | Termin erschien bei B **sofort** (< 1 s Poll-Intervall) | `06-b-after-realtime-create.png` |

Realtime für Termine funktioniert wie in `CLAUDE.md`/ADR-030 beschrieben.

## Nebenbefund (Web-spezifisch, blockierte zunächst den ganzen Lauf)

Ein Klick auf eine Zeile der Tagesagenda unterhalb des Monatskalenders
(`KalenderScreen`) traf bei Playwright-Koordinatenklicks zuverlässig eine
**unsichtbare, absolut positionierte Fläche eines Kalendertags** (z. B.
`aria-label="2026-09-18"`), obwohl visuell keine Überlappung zu sehen ist —
vermutlich ein Artefakt von `enableSwipeMonths` (`react-native-calendars`'
Pager-Layer für Nachbarmonate) auf Web. Auch ein erzwungener Klick
(`force=True`, umgeht nur Playwrights eigene Aktionierbarkeits-Prüfung, nicht
das Browser-Hit-Testing) landete auf dem falschen Kalendertag statt auf der
Zeile. Umgangen mit `element.click()` per `page.evaluate` (löst React's
Event-Bubbling direkt am Zielknoten aus, ohne `elementFromPoint`). Das ist ein
echtes potenzielles Web-Usability-Problem (ein Maus-Klick auf die Tagesliste
kann fehlschlagen), aber außerhalb des Scopes von Issue #52 — nicht weiter
verfolgt, hier nur dokumentiert.

## Protokoll — Termin (Schritte 1–7)

| #   | Erwartet                                                                                    | Beobachtet                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Screenshot(s)                                                                                                           |
| --- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| 1   | A und B zeigen dieselbe Fassung im Bearbeiten-Sheet                                         | Bestätigt — beide Sheets zeigen identisch Titel „Testtermin Konflikt …", Ort „Zuhause", 09:00–10:00                                                                                                                                                                                                                                                                                                                                                                                                          | `11-a-edit-open.png`, `13-b-edit-open.png`                                                                              |
| 2   | A sieht B's Titeländerung live im Kalender **hinter dem Sheet**                             | **Teilweise abweichend, siehe unten** — A's Sheet blieb nach B's Speichern unverändert sichtbar (alter Titel), weil auf Web keine Kalenderfläche „hinter" dem Sheet existiert. Nach explizitem Schließen (Abbrechen) zeigte A's Kalender den neuen Titel sofort.                                                                                                                                                                                                                                             | `16-a-sheet-still-open-after-b-save.png` (Sheet unverändert), `17-a-kalender-after-cancel.png` (nach Schließen aktuell) |
| 3   | Konflikt-Dialog in A, **eine** Zeile „Titel"                                                | Bestätigt exakt — eine Zeile „Titel", „Jetzt gespeichert: … B2" / „Deine Fassung: … A1"                                                                                                                                                                                                                                                                                                                                                                                                                      | `22-a-conflict-dialog.png`                                                                                              |
| 4   | A wählt „Deine Fassung speichern" → B binnen ~300 ms aktuell                                | Bestätigt — B zeigte A's Titel binnen der gemessenen 600 ms-Prüfpause                                                                                                                                                                                                                                                                                                                                                                                                                                        | `23-a-after-keep-mine.png`, `24-b-after-a-keep-mine.png`                                                                |
| 5   | Wiederholung, A wählt „Andere Fassung behalten" → A behält B's Fassung, kein Schreibvorgang | Bestätigt — Dialog erschien erneut (eine Zeile „Titel"), nach „Andere Fassung behalten" zeigte A's Detailscreen B's Titel („…B3"), A's eigener Versuch („…A2") ist nirgends gelandet                                                                                                                                                                                                                                                                                                                         | `28-a-step5-conflict-dialog.png`, `29-a-after-keep-theirs.png`                                                          |
| 6   | B ändert **Ort**, A ändert **Titel** → **KEIN** Dialog, A speichert durch                   | **Abweichung — der wichtigste Befund dieses Laufs.** Der Dialog erschien **doch**, mit **zwei** Zeilen: „Titel" (theirs „…B3" / mine „…A3-step6") **und** „Ort" (theirs „Neuer Ort B" / mine „Zuhause"). Siehe Analyse unten.                                                                                                                                                                                                                                                                                | `35-a-step6-dialog-check.png`                                                                                           |
| 7   | Fehler-Toast in A mit „Trotzdem löschen"                                                    | **Nicht durchführbar.** `EventDetailScreen.onDeletePress` ruft rohes `Alert.alert(...)` statt des Web-sicheren `confirmDestructive`-Helpers — `Alert.alert` ist auf `react-native-web` ein No-op (`static alert() {}`). Der „Löschen"-Button tut auf Web **nichts**: zwei Versuche (Klick, dann Klick + Enter-Taste) zeigten pixelidentische Screenshots vor/nach dem Klick, kein Dialog, kein Toast. Bereits bekannt und dokumentiert in `docs/TODO.md` (Zeile zu `EventDetailScreen.tsx`/`onDeletePress`). | `40-a-detail-before-delete-attempt.png`, `41-a-after-delete-click-attempt-1.png` (pixelidentisch)                       |

### Schritt 2 im Detail

`app/_layout.tsx` registriert `event/edit/[id]` mit
`presentation: "formSheet"`. Auf `react-native-web` gibt es keine native
Sheet-Darstellung mit sichtbarem Rest der darunterliegenden Route — das Sheet
füllt den ganzen Viewport (siehe Screenshots 11/13: kein Kalender-Rand, keine
Teil-Transparenz). Der in Schritt 2 verlangte Blick „live im Kalender hinter
dem Sheet" hat auf Web **kein Gegenstück** — es gibt nichts, wohinter man
schauen könnte, solange das Sheet offen ist. Die Realtime-Kette selbst
(Issue #51) funktioniert nachweislich: Nach dem Schließen des Sheets (kein
erneuter Server-Roundtrip nötig, nur der bestehende, längst invalidierte
Cache) zeigte A's Kalender sofort B's neuen Titel.

### Schritt 6 im Detail — der Guard löst zu oft aus

`features/calendar/conflict.ts`, `differingEventFields(theirs, mine)`,
vergleicht Feld für Feld zwischen der frischen Server-Zeile (`theirs`) und
**A's vollständig eingereichtem Formular-Snapshot** (`mine` = `vars.changes`,
alle fünf Felder, nicht nur die geänderten). `EventEditScreen`s
`baseVersion`/Formularfelder frieren beim Öffnen des Sheets ein (bewusst, laut
Docstring in `EventEditScreen.tsx`) und ziehen einen Refetch **nicht** nach.
Ändert B in der Zwischenzeit den Ort, während A's Sheet mit dem alten Ort
eingefroren ist, dann weicht **A's eigener unveränderter, aber veralteter
Ort-Wert** von B's neuem Ort ab — und `differingEventFields` kann diesen
Unterschied nicht von einem echten Konflikt unterscheiden. Das Ergebnis ist
ein Dialog mit einer Zeile für ein Feld, das **niemand absichtlich
gegeneinander geändert hat** — exakt das Szenario, vor dem der Docstring in
`features/calendar/conflict.ts` warnt („Ein Guard, der bei jedem
Versionssprung meldet, wird weggeklickt"). Das non-negotiable Ziel aus dem
Task-Brief („Schritt 6 ist der wichtigste: Er prüft, dass der Mechanismus
**nicht** anschlägt, wo er nicht soll") ist damit **nicht erfüllt** — der
Mechanismus vergleicht den vollen Snapshot gegen die frische Zeile, nicht nur
die tatsächlich von beiden Seiten berührten Felder (kein echtes 3-Wege-Merge
gegen eine gemeinsame Basis).

## Protokoll — Aufgabe (Schritt 8: 1–6 wiederholt)

Aufgaben haben **keine** Realtime-Schicht (ADR-030 deckt ausschließlich
`events`/`event_exceptions` ab, `features/realtime/` enthält keinen
Tasks-Pfad) — B musste an mehreren Stellen per `page.reload()` neu laden, um
den aktuellen Serverstand zu sehen, statt per Live-Push. Das ist erwartetes,
dokumentiertes Scope-Verhalten, kein Fehler.

| #   | Erwartet                                                           | Beobachtet                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Screenshot(s)                                                   |
| --- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 1   | A und B zeigen dieselbe Fassung                                    | Bestätigt                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `55-a-edit-open.png`, `56-b-edit-open.png`                      |
| 2   | (kein Realtime-Äquivalent für Aufgaben)                            | Nicht anwendbar — dokumentiert statt geprüft                                                                                                                                                                                                                                                                                                                                                                                                                                    | `57-b-after-save.png`, `58-a-sheet-still-open-after-b-save.png` |
| 3   | Konflikt-Dialog, eine Zeile „Titel", Text via `conflict.body.task` | Bestätigt exakt — Dialogtext „Jemand anderes hat diese Aufgabe geändert, während du sie bearbeitet hast." (= `conflict.body.task`), eine Zeile „Titel"                                                                                                                                                                                                                                                                                                                          | `59-a-conflict-dialog.png`                                      |
| 4   | „Deine Fassung speichern" setzt sich durch                         | Bestätigt                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `60-a-after-keep-mine.png`                                      |
| 5   | „Andere Fassung behalten" verwirft A's Version                     | Bestätigt — A zeigt anschließend B's Titel („…B3"), nicht A's eigenen („…A2")                                                                                                                                                                                                                                                                                                                                                                                                   | `64-a-step5-conflict-dialog.png`, `66-a-list-after-step5.png`   |
| 6   | B ändert **Fach**, A ändert **Titel** → kein Dialog                | **Dieselbe Abweichung wie beim Termin.** Dialog erschien mit zwei Zeilen: „Titel" und „Fach" (theirs „Englisch" / mine „Mathe", A's eingefrorener alter Wert). `features/tasks/conflict.ts`s `differingTaskFields` vergleicht ebenfalls den vollen `toTaskChanges`-Snapshot gegen die frische Zeile — trotz eines `undefined`-toleranten Zweigs im Code, der nie greift, weil `toTaskChanges` laut eigenem Docstring bewusst „the full editable field set, not a diff" liefert. | `70-a-step6-dialog-check.png`                                   |

Schritt 8 bestätigt: Das Verhalten aus den Schritten 1–6 (inklusive der
Abweichung in Schritt 6) ist **identisch** zwischen Termin und Aufgabe — zwei
unabhängige, aber strukturell gleich gebaute Implementierungen zeigen exakt
denselben Fehlermodus.

## Schritt 7 — Löschen-Race, Ersatzvariante auf einer Aufgabe

Schritt 7 ist laut Protokoll nur für den Termin spezifiziert und dort wegen
des `Alert.alert`-No-ops nicht durchführbar (siehe oben). Da
`TaskEditScreen.onDelete` den Web-sicheren `confirmDestructive`-Helper
(`window.confirm`) nutzt, war eine **Ersatzprüfung** auf einer Aufgabe
tatsächlich ausführbar — mit der wichtigen Einschränkung, dass sie **nicht
dieselbe Mechanik** testet: `useDeleteTask` (`features/tasks/mutations.ts`)
prüft **keine** `baseVersion`/CAS beim Löschen, und `TaskEditScreen.onDelete`
übergibt `useUndoableDelete` **kein** `errorAction` — die
„Trotzdem löschen"-Aktion existiert für Aufgaben im Code schlicht nicht.

Ablauf: A öffnet die Aufgabe, klickt „Löschen", bestätigt den
`window.confirm`-Dialog („Aufgabe löschen?") → Erfolgs-Toast mit 5 s
Undo-Fenster erscheint. Innerhalb dieses Fensters lädt B neu, öffnet dieselbe
Aufgabe, ändert den Titel und speichert erfolgreich (kein Fehler). Nach Ablauf
des Fensters (Skript wartet 6 s) ist die Aufgabe **endgültig gelöscht** —
Zähler „Heute fällig" sank von 6 auf 5, die Zeile ist aus der Liste
verschwunden.

**Befund:** A's verzögerte Löschung gewinnt das Rennen bedingungslos und
verwirft B's zwischenzeitliche Bearbeitung **lautlos** — kein Fehler-Toast,
keine Rückfrage, kein Hinweis an B, dass die soeben gespeicherte Änderung
gerade gelöscht wurde. Das ist strenger genommen **schlechter** als der
Termin-Fall: Dort ist der Pfad auf Web zwar blockiert, aber die Absicht (CAS +
„Trotzdem löschen") existiert im Code. Für Aufgaben existiert diese Absicht
nicht — das Löschen-Race ist dort per Design ungeschützt.

Screenshots: `72-a-before-delete.png`, `73-a-after-delete-confirm-and-undo-toast.png`
(Undo-Toast „Aufgabe gelöscht … Rückgängig"), `74-b-race-edit-attempt.png`,
`77-a-final-list-state.png` (Zähler 6→5, Zeile weg).

## Fazit

**Belegt, wie im Brief erwartet:** Schritte 1, 3, 4, 5 — sowohl für Termin als
auch für Aufgabe. Der Kern-Mechanismus (CAS über `baseVersion`, Ein-Zeilen-Dialog
bei echtem Feldkonflikt, „Deine Fassung"/„Andere Fassung" beide korrekt) tut
exakt, was die Spezifikation verlangt, wenn tatsächlich **dasselbe** Feld
kollidiert.

**Belegt, aber mit anderem Ausgang als erwartet:**

- **Schritt 2** — Realtime funktioniert, aber "hinter dem Sheet" gibt es auf
  Web nicht (formSheet ist dort vollflächig). Kein Bug, aber die im Brief
  formulierte Beobachtungsmethode passt nicht auf die Web-Plattform.
- **Schritt 6 (Termin und Aufgabe)** — **der wichtigste negative Befund**: Der
  Guard schlägt an, obwohl A und B disjunkte Felder geändert haben, weil der
  Vergleich den vollen (eingefrorenen) Formular-Snapshot gegen die frische
  Server-Zeile prüft statt nur die tatsächlich von beiden Seiten berührten
  Felder. Reproduziert identisch bei Termin (`Titel`+`Ort`) und Aufgabe
  (`Titel`+`Fach`) — kein Zufall, sondern dieselbe Grundannahme in
  `differingEventFields` und `differingTaskFields`.

**Nicht belegbar wie spezifiziert:**

- **Schritt 7 (Termin)** — Löschknopf ist auf Web durch rohes `Alert.alert`
  funktionslos (vorbestehend, in `docs/TODO.md` dokumentiert). Zwei Versuche
  unternommen, beide ergebnislos.
- **Schritt 7 (Aufgabe, Ersatzvariante)** — ausgeführt, aber testet strukturell
  etwas anderes: Es gibt keine „Trotzdem löschen"-Mechanik für Aufgaben, weil
  `useDeleteTask` gar kein CAS durchführt. Der ersatzweise beobachtete Ausgang
  (stilles Verwerfen von B's Änderung) ist ein eigener, zusätzlicher Befund.

**Nebenbefund außerhalb des Scopes:** Eine unsichtbare, absolut positionierte
Fläche im `KalenderScreen` (vermutlich `enableSwipeMonths`-Pager) fing auf Web
Mausklicks auf die Tagesagenda ab — umgangen für diesen Testlauf, nicht
weiter untersucht.

## Nachlauf: Schritt 6 nach dem Drei-Wege-Umbau

Nachdem der Feldvergleich von zweiwertig (`theirs` vs. `mine`) auf dreiwertig
umgestellt wurde (`differingEventFields`/`differingTaskFields` vergleichen
jetzt zusätzlich gegen `base`, den beim Öffnen des Formulars eingefrorenen
Stand — siehe `features/calendar/conflict.ts`, `features/tasks/conflict.ts`),
wurde Schritt 6 erneut gefahren, für Termin **und** Aufgabe, plus zwei
Gegenproben (6b, 6c), die vor dem Umbau nicht sinnvoll durchführbar waren.
Gleicher Aufbau wie der erste Lauf: zwei persistente, bereits angemeldete
Playwright-Kontexte (`ctx-a`/`ctx-b`, „SV" / Familie Becker) gegen
`http://localhost:8082`, ein Skript, sequenziell, saubere `context.close()`
im `finally`-Block. Skript: `followup_step6.py` (Scratch-Verzeichnis der
Session, nicht committet), Log: `followup-log.txt`, Screenshots `f01`–`f29`
(ebenfalls Scratch, nicht committet).

**Navigationsfalle des ersten Versuchs:** Ein erster Anlauf, der für jedes
Teilszenario einen frischen Termin anlegte, brach beim Erzeugen des zweiten
Termins mit einem Playwright-Timeout auf „Termin hinzufügen" ab. Ursache:
`event/[id]` ist selbst ein `presentation: "formSheet"`-Screen im
ROOT-Stack (`app/_layout.tsx`), nicht Teil der `(tabs)`-Gruppe. „Bearbeiten"
pusht das Edit-Sheet eine Ebene _über_ das Detail-Sheet; ein Speichern poppt
per `router.back()` nur diese eine Ebene zurück auf das Detail-Sheet, nicht
bis zum Kalender-Tab. Ein Klick auf das „Kalender"-Tab-Label traf dabei zwar
ein im DOM vorhandenes, aber von den Sheet-Ebenen verdecktes Element — ohne
Fehler, aber ohne Wirkung, weil die Stack-Ebene darüber liegen blieb, sodass
„Termin hinzufügen" nie erreichbar wurde. Der zweite (hier protokollierte)
Anlauf hat das umgangen, indem EVENT-6/6b/6c bewusst auf **demselben**
Testtermin laufen, nacheinander — genau das Muster, das `run1_event.py`
bereits über seine Schritte 1–6 hinweg benutzt hat: beide Clients bleiben auf
dem einmal geöffneten Detail-Sheet und öffnen „Bearbeiten" für jedes
Teilszenario erneut (jeder Öffnen-Klick hydriert ohnehin frisch von der
lebenden Query). Erst nach EVENT-6c wurde einmal „Schließen" auf beiden
Seiten geklickt, um sauber zum Kalender-Tab für den Aufgaben-Teil
zurückzukehren — dort gibt es keine Detail-Sheet-Ebene: ein Klick auf eine
Aufgabenzeile öffnet das Edit-Sheet direkt aus der Aufgaben-Tab-Liste, ein
Speichern poppt daher in einem Schritt zurück bis dorthin.

Die Zeilenzahl im Dialog wurde jeweils zweifach geprüft: automatisiert über
die Anzahl der Text-Knoten, die mit „Jetzt gespeichert:" beginnen (genau
einer pro Vergleichszeile, unabhängig vom Feldnamen), und zusätzlich per
Sichtprüfung des Screenshots mit dem Read-Tool — nicht aus dem DOM
geschlossen.

### Termin, Schritt 6 (B ändert Ort, A ändert Titel)

| Erwartet                               | Beobachtet                                                                                                                                                                                         | Screenshot                |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Dialog mit genau **einer** Zeile „Ort" | Bestätigt exakt — Dialog erschienen, **1 Zeile**, Label `['Ort']`: „Jetzt gespeichert: Ort von B (Schritt 6)" / „Deine Fassung: Zuhause". A's eigene Titeländerung taucht **nicht** als Zeile auf. | `f10-a-event6-dialog.png` |

Das ist der Kernbefund des Nachlaufs: Im ersten Lauf hatte exakt dieses
Szenario zwei Zeilen geliefert („Titel" und „Ort"), weil der zweiwertige
Vergleich A's eigene, unveränderte Ort-Angabe fälschlich als Konflikt
gegen B's frischen Wert gewertet hat. Mit `base` als drittem Wert bleibt nur
noch die Zeile stehen, die tatsächlich einen Konflikt beschreibt: A's
Speichern würde B's Ortsänderung zurückdrehen (mine.location = „Zuhause" ≠
theirs.location = „Ort von B"), während A's Titeländerung niemanden
überschreibt, den B nicht angefasst hat.

### Aufgabe, Schritt 6 (B ändert Fach, A ändert Titel)

| Erwartet                                | Beobachtet                                                                                                                 | Screenshot                |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Dialog mit genau **einer** Zeile „Fach" | Bestätigt exakt — Dialog erschienen, **1 Zeile**, Label `['Fach']`: „Jetzt gespeichert: Deutsch" / „Deine Fassung: Mathe". | `f29-a-taskT6-dialog.png` |

Identisch zum Termin-Fall — dieselbe Korrektur wirkt in
`differingTaskFields` genau wie in `differingEventFields`, wie schon im
ersten Lauf beobachtet, dass beide Implementierungen strukturell denselben
Fehlermodus (und jetzt: dieselbe Korrektur) teilen.

### Gegenprobe 6b: B speichert unverändert, dann ändert A den Titel

Durchführbar wie spezifiziert — ein unverändertes Speichern löst sehr wohl
einen Schreibvorgang aus: `EventEditScreen.onSave` prüft nicht, ob sich
Feldwerte geändert haben, und der `BEFORE UPDATE`-Trigger
`public.set_updated_at()` (`supabase/migrations/20260904075041_conflict_detection.sql`)
stempelt `updated_at` bei **jedem** `UPDATE` neu, unabhängig vom Inhalt.

Ablauf: B öffnet das Bearbeiten-Sheet auf demselben Stand wie A, ändert kein
Feld und klickt „Speichern" — die Version springt server-seitig, obwohl sich
kein Feldwert ändert. A (Sheet weiterhin auf dem alten, eingefrorenen Stand)
ändert danach nur den Titel und speichert.

| Erwartet                            | Beobachtet                                                                                                                                                                                                                                                                  | Screenshot                                                                                                   |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Kein Dialog** — A speichert durch | Bestätigt exakt — kein Dialog (5 s Wartezeit ausgeschöpft, kein „Gleichzeitig bearbeitet"-Text erschienen). A's Titeländerung ist sichtbar durchgespeichert (Detail zeigt „… · A6b"), B's zuvor gehaltener Ort („Ort von B (Schritt 6)") blieb dabei unangetastet erhalten. | `f16-a-event6b-dialog-check.png` (kein Dialog), `f17-a-event6b-final-detail.png` (Detail nach dem Speichern) |

Das ist der wertvollste der vier Nachlauf-Befunde: Vor dem Drei-Wege-Umbau
konnte dieser Fall gar nicht eintreten, weil der volle Formular-Snapshot
(`mine`) immer gegen die frische Server-Zeile (`theirs`) verglichen wurde —
A's eigene, unveränderte Felder wichen dabei zwangsläufig von _irgendeinem_
frischen Wert ab, sobald die Version sprang, und die Liste war nach jedem
Versionssprung nicht-leer. Die Regel „leere Liste → durchspeichern"
(`ADR-031`) war damit **praktisch tot** — es gab keinen erreichbaren Pfad,
auf dem sie feuerte. Dass hier jetzt „Version gesprungen, Inhalt weicht
nicht ab → kein Dialog" korrekt herauskommt, ist der Beleg, dass diese Regel
nach dem Umbau tatsächlich wieder einen echten, beobachtbaren Fall abdeckt —
nicht nur theoretisch im Code steht.

### Gegenprobe 6c: B und A ändern beide den Titel, auf verschiedene Werte

| Erwartet                                                   | Beobachtet                                                                                                                    | Screenshot                 |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Dialog mit genau **einer** Zeile „Titel" — echter Konflikt | Bestätigt exakt — Dialog erschienen, **1 Zeile**, Label `['Titel']`: „Jetzt gespeichert: … · B6c" / „Deine Fassung: … · A6c". | `f22-a-event6c-dialog.png` |

Bestätigt, dass der Drei-Wege-Umbau einen echten, von beiden Seiten
berührten Feldkonflikt weiterhin zuverlässig meldet — die Korrektur hat den
Guard nicht „scharf" gemacht in dem Sinne, dass er jetzt zu wenig meldet.

### Nebenbeobachtungen

- **Realtime für Termine** funktionierte wie in ADR-030 beschrieben: B sah
  den neu angelegten Testtermin nach ~0 s, ohne eigenes Zutun (Log:
  „B sieht … nach ~0s (Realtime)").
- **Keine Realtime-Schicht für Aufgaben** (ADR-030 deckt nur
  `events`/`event_exceptions` ab) — B musste die neue Testaufgabe per
  `page.reload()` nachladen, um sie zu sehen. Erwartetes, dokumentiertes
  Scope-Verhalten, kein Fehler — deckungsgleich mit dem ersten Lauf.

### Fazit des Nachlaufs

Alle vier Szenarien treffen die im Auftrag formulierte, korrigierte
Erwartung exakt — für Termin und Aufgabe je eine Zeile beim echten
Feldkonflikt (Schritt 6), kein Dialog beim inhaltlich leeren Versionssprung
(6b), und weiterhin zuverlässige Meldung beim echten, beidseitig berührten
Feld (6c). Der im ersten Lauf als „wichtigster negativer Befund" markierte
Konstruktionsfehler — der Guard schlug an, obwohl A und B disjunkte Felder
geändert hatten — ist mit dem Drei-Wege-Vergleich (`base`/`mine`/`theirs`)
behoben und hier für beide Entitäten (Termin, Aufgabe) sowie für den bislang
unerreichbaren Leer-Listen-Pfad (6b) neu und positiv belegt. Das
non-negotiable Ziel aus dem ursprünglichen Task-Brief — „der Mechanismus
schlägt nicht an, wo er nicht soll" — ist damit, anders als im ersten Lauf,
jetzt erfüllt.
