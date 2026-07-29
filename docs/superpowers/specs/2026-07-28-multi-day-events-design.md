# Design: Mehrtägige Termine über Monatsraster und Tagesliste

**Datum:** 2026-07-28
**Branch:** `feat/calendar-multi-day-spans`
**Issue:** Termine über mehrere Tage korrekt anzeigen (`enhancement`, `calendar`)
**Status:** Freigegeben (Brainstorming)

## Ziel

Termine können über mehrere Tage gehen und werden im Kalender an **jedem** überdeckten Tag
angezeigt — mit einer sichtbaren Verbindung über die Spanne statt drei zusammenhanglosen
Einträgen. Ganztägige Mehrtages-Termine fallen dabei auf denselben Codepfad.

## Kontext / Ist-Zustand

Zwei der vier Aufgabenpunkte sind bereits erledigt und werden hier nur zur Abgrenzung genannt:

- **`end_date` im Create/Edit-Form** ist seit `6f644f0` fertig. [features/calendar/dateRange.ts](../../../features/calendar/dateRange.ts)
  liefert `applyRangePick` (Start-Verschiebung zieht das Ende mit), `isDateRangeInvalid`,
  `isTimeRangeInvalid`, `toAllDayRange` und `isMultiDay`; beide Formulare haben Von-/Bis-Datumsfelder.
- **Das Detail-Sheet zeigt die Spanne bereits korrekt** ([EventDetailScreen.tsx](../../../app-sections/event/EventDetailScreen.tsx),
  Zeitzeile via `isMultiDay`). Keine Änderung nötig.

Offen ist damit genau der Punkt aus [docs/TODO.md](../../TODO.md) („Mehrtägige Termine erscheinen
nur an ihrem Starttag"):

- [features/calendar/expand.ts](../../../features/calendar/expand.ts) erzeugt pro Serien-Occurrence
  **einen** `CalendarOccurrence` am Startdatum. Folgetage bekommen weder Dot noch Zeile.
- `useMarkedDates` ([features/calendar/hooks.ts](../../../features/calendar/hooks.ts)) gruppiert
  strikt nach `occurrenceDate`, das Monatsraster kennt also nur den Starttag.
- [KalenderScreen.tsx](<../../../app-sections/(tabs)/kalender/KalenderScreen.tsx>) filtert die
  Tagesliste mit `occurrenceDate === selectedDate`.
- Die Conflict-Detection in [EventCreateScreen.tsx](../../../app-sections/event/EventCreateScreen.tsx)
  filtert ebenfalls auf `occurrenceDate === startDate` (eigener TODO-Punkt, hängt daran).

### Der Constraint, der die Architektur bestimmt

`CalendarOccurrence.occurrenceDate` ist **kein reines Anzeigedatum**. Es ist der Schlüssel für
`event_exceptions.occurrence_date` — [recurrence.ts](../../../features/calendar/recurrence.ts)
schreibt damit `cancelOccurrence` / `modifyOccurrence` und rechnet in `consumedBefore` die
Serienposition daraus. Ein zweites Segment mit einem _anderen_ `occurrenceDate` für denselben
Serientermin würde „Nur diesen Termin löschen/ändern" von einem Folgetag aus auf das falsche
Datum schreiben.

**Konsequenz:** `occurrenceDate` bleibt in jedem Fall das Anker-Datum (Serien-Startdatum der
Occurrence). Der Tag, an dem ein Segment hängt, ist ein _neues, separates_ Feld.

## Scope

**In Scope:** Monatsraster + Tagesliste des bestehenden `KalenderScreen`, Expansions-Logik,
Conflict-Detection über die volle Spanne, TODO-Pflege.

**Out of Scope:** Wochen-Grid (V2 in [patterns/calendar.md](../../../patterns/calendar.md)) und
Agenda-View (V3) sind nicht gebaut und bleiben eigene Iterationen. Ebenso: Kollisionsprüfung über
Monatsgrenzen hinweg, `all_day`-Toggle im Edit-Form (eigener TODO-Eintrag).

## Design-Entscheidungen

### D1 — Eigener Segment-Layer statt Fan-out in `expand.ts`

`expandEvents` bleibt bei einem Ergebnis pro Serien-Occurrence. Eine neue reine Funktion
`toDaySegments(occurrences, rangeStart, rangeEnd)` in `features/calendar/spans.ts` fächert auf
Kalendertage auf. Screens konsumieren Segmente, Mutationen weiterhin Occurrences.

Verworfen: Fan-out direkt in `expandEvents` (ein Typ statt zwei, aber jeder Consumer müsste ab
dann deduplizieren — `useEvent`s `find(o => o.occurrenceDate === occ)` griffe sonst ein beliebiges
Segment, und zwar still, in genau der Datei, an der Delete-/Edit-Scope hängt). Ebenfalls
verworfen: Fan-out inline im Screen (dieselbe Logik dreimal, nur über einen RN-Renderer testbar).

### D2 — `DaySegment`

```ts
export interface DaySegment {
  occurrence: CalendarOccurrence; // unverändert — occurrenceDate bleibt Anker/Exception-Key
  date: string; // yyyy-MM-dd — der Kalendertag, den dieses Segment belegt
  index: number; // 0-basiert, absolut zur echten Spanne (nicht zum sichtbaren Fenster)
  total: number; // echte Länge der Spanne in Kalendertagen
  isStart: boolean;
  isEnd: boolean;
}
```

`index` und `total` sind **absolut**, auch wenn das Monatsfenster die Spanne beschneidet: „Tag
12/20" bleibt wahr, wenn nur die Tage 12–20 im sichtbaren Monat liegen. `isStart`/`isEnd` werden
nicht aus `index`/`total` abgeleitet, sondern gegen die echten Spannengrenzen gesetzt — am
beschnittenen Rand ist beides `false`, und genau das signalisiert der UI „läuft weiter".

### D3 — Tagesberechnung: die vier Edge-Cases an einer Stelle

`toDaySegments` ist die einzige Stelle, die entscheidet, welche Tage eine Spanne belegt:

1. **Kalendarisch zählen.** `differenceInCalendarDays(lastDay, startAt) + 1`, nicht
   `(end - start) / 86_400_000`. Sonst zählen die DST-Übergänge (letzter Sonntag im März/Oktober)
   falsch, weil ein Tag dort 23 bzw. 25 Stunden hat.
2. **Mitternacht ist exklusiv.** Fällt `endAt` exakt auf 00:00 und ist `endAt > startAt`, wird für
   die Tagesberechnung 1 ms abgezogen. Ein Termin 20:00–00:00 belegt damit einen Tag, nicht zwei.
   Gilt nur für getaktete Termine; all-day-Ranges enden bei 23:59 und sind nicht betroffen.
3. **Ganztägig mehrtägig braucht keinen Sonderfall.** `toAllDayRange` normalisiert bereits auf
   00:00 … 23:59, die Spanne fällt damit auf `total = n` wie jede andere. Kein zweiter Codepfad,
   `allDay` beeinflusst nur die Beschriftung (D6).
4. **Beschnitt statt Kappung.** Die Schleife läuft nur über den Schnitt aus Spanne und sichtbarem
   Fenster (max. ~46 Tage). Ein vertipptes Enddatum 2099 erzeugt dadurch keine Segment-Flut; es
   erzeugt lediglich ein absurd hohes `total` in der Beschriftung, was die korrekte Darstellung
   einer falschen Eingabe ist.

### D4 — Expansions-Fenster in `expand.ts` verbreitern

Ohne diesen Fix bleibt das Ziel unerreicht: `expandRecurrence` verwirft heute jede Occurrence,
deren Start vor `rangeStart` liegt. Ein dreiwöchiger Urlaub, der zehn Tage vor dem sichtbaren
Monat beginnt, erscheint dadurch **überhaupt nicht** — auch nicht an seinen Tagen im Monat.

Fix: das Suchfenster pro Row um deren eigene Dauer nach vorn schieben
(`searchStart = rangeStart - durationMs`, für den rekurrenten wie den nicht-rekurrenten Zweig),
und anschließend Occurrences verwerfen, deren Spanne `[startAt, endAt]` den Bereich
`[rangeStart, rangeEnd]` nicht schneidet. Exakt und ohne magische Konstante.

**Keine Query-Änderung nötig:** `fetchEventsInRange` filtert nur mit `lte("start_at", endIso)`
plus `rrule_until`-Bedingung, hat also gar keine untere Schranke auf `start_at`. Die Row war
bereits geladen — nur der Expander hat sie weggeworfen.

### D5 — Monatsraster: Balken für Spannen, Dots für Eintagesfliegen

`useMarkedDates` liefert pro Tag zusätzlich `bars`. Aufteilung:

- Segmente mit `total === 1` → Dots wie bisher, max. 3, dedupliziert nach Typ-Slug.
- Segmente mit `total > 1` → Balken, max. 2 pro Tag. Was darüber hinausgeht, fällt in die Dot-Reihe
  zurück (Dot in der Typfarbe, gemeinsam mit den Eintages-Dots auf 3 gedeckelt), damit ein voller
  Tag nicht stillschweigend Termine verschluckt.

`MarkedDates` ist unser eigener Typ ([types.ts](../../../features/calendar/types.ts)) und wird um
`bars` erweitert; `SpanBar = { key: string; color: string; isStart: boolean; isEnd: boolean }`.
**Der endgültige Vertrag ist `bars?: (SpanBar | null)[]`** — die `null`-Lücken kamen mit N1 dazu
(siehe Nachtrag), damit eine Spanne ihre Spur behält. Typ, Hook, Renderer und Tests führen
durchgängig diese Variante.
Der einzige Cast steht an der Bibliotheksgrenze in `CalendarDay` (`marking?: MarkingProps & { bars?: (SpanBar | null)[] }`),
weil `react-native-calendars` `MarkingProps` fest typisiert, das Objekt aber unverändert
durchreicht.

Darstellung in [CalendarDay.tsx](<../../../app-sections/(tabs)/kalender/CalendarDay.tsx>): 3px hoher
Balken in der Typfarbe unter der Zahl-Pill, links gerundet bei `isStart`, rechts bei `isEnd`,
sonst bündig bis zur Zellkante. Über einen Wochenumbruch hinweg endet der Balken bündig am Rand
und liest sich damit als „geht weiter". Die Dot-Reihe rückt darunter.

**Bekanntes Risiko:** ob die Balken benachbarter Zellen sich berühren, hängt daran, wie
`react-native-calendars` die sieben Zellen in der Wochenzeile verteilt — unser `Pressable` ist auf
`width: 44` fixiert, die Zeile kann breiter sein. Wird im Simulator verifiziert. Fallback: die
verbleibende Lücke akzeptieren; die durchgehende Linie liest sich auch mit minimalem Abstand als
Spanne. Der Fallback ist explizit kein Grund, die Variante zu wechseln.

Kein neuer Legendeneintrag — die Balken nutzen dieselben Typfarben wie die Dots.

### D6 — Tagesliste: die linke Spalte zeigt diesen Tag, nicht die Serie

Heute zeigt die linke Spalte Startzeit + Gesamtdauer. An einem Folgetag wäre „09:00" schlicht
falsch. Neue Belegung (Spaltenbreite 48 → 56, damit „Ganztägig" und „ab 09:00" ohne Umbruch passen):

| Fall                 | Zeile 1       | Zeile 2 (statt Dauer) |
| -------------------- | ------------- | --------------------- |
| ganztägig (`allDay`) | „Ganztägig"   | `Tag 2/3`             |
| Startag einer Spanne | „ab 09:00"    | `Tag 1/3`             |
| Zwischentag          | „durchgehend" | `Tag 2/3`             |
| Endtag               | „bis 14:00"   | `Tag 3/3`             |
| eintägig, getaktet   | `09:00`       | Dauer (unverändert)   |
| eintägig, ganztägig  | „Ganztägig"   | — (keine Dauer)       |

`Tag n/m` ersetzt die Dauer nur bei `total > 1`. Bei einem ganztägigen Eintages-Termin entfällt
die Dauerzeile, weil „24 Std." aus einer 00:00–23:59-Normalisierung eine erfundene Zahl wäre.

Weitere Änderungen an der Zeile:

- **Sortierung:** laufende und ganztägige Segmente zuerst (Sortierrang 0), danach getaktete nach
  Uhrzeit. Ein Termin, der den ganzen Tag läuft, gehört über den Terminen des Tages, nicht an die
  Position seiner Startzeit von vorgestern.
- **Accent-Bar der Karte:** an durchlaufenden Kanten bündig bis zum Kartenrand statt gerundet mit
  Abstand — dieselbe visuelle Sprache wie der Balken im Raster.
- **Navigation:** Tap führt weiter mit `occ: occurrence.occurrenceDate` (Anker, **nicht**
  `segment.date`), damit Scope-Dialog und Exceptions korrekt greifen.
- **React-Key:** `${eventId}-${occurrenceDate}-${date}`.
- **a11y:** Die Zeile bekommt ein `accessibilityLabel`, das Titel, Spannen-Position und Zeitraum
  zusammenfasst, weil „durchgehend" ohne Kontext vorgelesen nichtssagend ist. Touch-Target bleibt
  unverändert über 44px.

### D7 — Fünf neue i18n-Keys, COPY.md-Nachtrag als TODO

Neu in [de.json](../../../features/i18n/locales/de.json) + [en.json](../../../features/i18n/locales/en.json):

| Key                | DE                      | EN                      |
| ------------------ | ----------------------- | ----------------------- |
| `cal.span.allDay`  | Ganztägig               | All day                 |
| `cal.span.from`    | ab {{time}}             | from {{time}}           |
| `cal.span.until`   | bis {{time}}            | until {{time}}          |
| `cal.span.through` | durchgehend             | ongoing                 |
| `cal.span.dayOf`   | Tag {{index}}/{{total}} | Day {{index}}/{{total}} |

`docs/COPY.md` gehört laut CLAUDE.md dem Designer und ist off-limits. Die Keys kommen deshalb in
die Catalogs, der Nachtrag in die Copy-Deck-Tabelle wird an den bestehenden COPY.md-Sammelpunkt in
`docs/TODO.md` angehängt — genau so wurden die Kalender-Keys der vorigen Iteration behandelt.

### D8 — Conflict-Detection über die volle Spanne

`rangesOverlap` in `EventCreateScreen` vergleicht bereits absolute Zeitpunkte; die eigentliche
Einschränkung war der vorgeschaltete `occurrenceDate === dateStr`-Filter. Der fällt weg, geprüft
wird die vollständige (bei `allDay` über `toAllDayRange` normalisierte) geplante Spanne gegen alle
geladenen Occurrences. Die Prüfung bleibt auf Occurrence-Ebene, braucht also kein Dedupe über
Segmente. `samePerson` bleibt unverändert.

**Rest-Limit:** `useFamilyEvents(startAt)` lädt nur den Monat um den Starttag ±7 Tage. Eine Spanne,
die weiter hinausreicht, wird nur im geladenen Ausschnitt geprüft. Wird als neuer TODO-Eintrag
festgehalten statt hier gelöst — die saubere Lösung ist ein am Formular-Range ausgerichtetes
Query-Fenster, und das ist eine eigene Änderung an der Query-Ebene.

## Betroffene Dateien

| Datei                                             | Änderung                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------- |
| `features/calendar/spans.ts`                      | **neu** — `DaySegment`, `SpanBar`, `toDaySegments`, `coveredDays` |
| `features/calendar/spans.test.ts`                 | **neu** — Edge-Cases aus D3                                       |
| `features/calendar/expand.test.ts`                | **neu** — hereinragende / nicht schneidende Spanne                |
| `features/calendar/expand.ts`                     | Suchfenster um Dauer verbreitern, Nicht-Schnitt verwerfen (D4)    |
| `features/calendar/types.ts`                      | `MarkedDates` um `bars` erweitern                                 |
| `features/calendar/hooks.ts`                      | `useMarkedDates` liefert Dots **und** Balken (D5)                 |
| `features/calendar/index.ts`                      | Barrel-Export für `spans.ts`                                      |
| `app-sections/(tabs)/kalender/CalendarDay.tsx`    | Balken-Rendering unter der Zahl-Pill                              |
| `app-sections/(tabs)/kalender/KalenderScreen.tsx` | Tagesliste auf Segmente, Spalten-Labels, Sortierung, Keys         |
| `app-sections/event/EventCreateScreen.tsx`        | Conflict-Filter auf volle Spanne (D8)                             |
| `features/i18n/locales/{de,en}.json`              | fünf `cal.span.*`-Keys                                            |
| `docs/TODO.md`                                    | zwei erledigte Punkte entfernen, drei neue Rest-Limits ergänzen   |

Nicht angefasst: `recurrence.ts`, `mutations.ts`, `createMutation.ts`, `queries.ts`,
`EventDetailScreen.tsx`, `EventEditScreen.tsx`, `dateRange.ts` sowie das gesamte Handoff-Bundle.

## Tests

`bun test` (Buns Runner, `bun:test`-Imports wie in den bestehenden Kalender-Suiten).

`spans.test.ts`:

- eintägiger Termin → 1 Segment, `total: 1`, `isStart && isEnd`
- 3-Tage-Spanne → 3 Segmente, `index` 0…2, Flags nur an den Rändern
- 20:00–00:00 → 1 Segment (Mitternacht exklusiv)
- ganztägig über 3 Tage (00:00–23:59) → 3 Segmente
- Spanne ragt links ins Fenster → nur sichtbare Tage, `index`/`total` bleiben absolut, `isStart: false`
- Spanne ragt rechts hinaus → analog, `isEnd: false`
- Spanne über den DST-Übergang Ende März → Tageszahl bleibt kalendarisch korrekt

`expand.test.ts` (klein gehalten, zwei Fälle):

- Occurrence, die vor `rangeStart` beginnt und ins Fenster ragt, wird geliefert
- Occurrence, deren Spanne das Fenster nicht schneidet, wird verworfen

Manuell im Simulator (per `bun run ios`, weil die Zellbreiten-Frage aus D5 web-seitig nicht
repräsentativ ist): Balkenkontinuität innerhalb einer Woche, über den Wochenumbruch, auf der
Today-Zelle und auf der Selected-Zelle, in Light und Dark.

Vor dem PR zusätzlich: `bun run typecheck`, `bun lint`, `bun format:check` sowie
`coderabbit review --base main` gemäß CLAUDE.md.

## Nachtrag aus der Verifikation (2026-07-28)

Drei Punkte, die erst die Sichtprüfung am laufenden Kalender gezeigt hat. Sie ergänzen D5/D6,
widersprechen ihnen nicht:

- **N1 — Spannen bekommen eine feste Spur.** D5 sagte nur „max. 2 Balken pro Tag". Ohne feste
  Spurzuweisung liegt ein Balken an Tagen, die er allein belegt, in Zeile 0 und an Tagen mit einer
  früheren Spanne in Zeile 1 — die Linie springt mitten in der Spanne die Zeile und zerstört genau
  die Kontinuität, für die es die Balken gibt. `toDayMarkings` weist jeder Spanne jetzt die
  niedrigste über ihre gesamte Länge freie Spur zu und hält sie dort; freie Spuren darüber bleiben
  als `null`-Loch erhalten, damit die Zeilenposition stabil bleibt. `MarkedDates.bars` ist deshalb
  `(SpanBar | null)[]`.
- **N2 — Balken laufen über die Monatsgrenze weiter.** Dots werden auf Nachbarmonats-Tagen
  (`state === "disabled"`) unterdrückt; für Balken wäre das falsch, weil ein Balken mit bündiger
  „geht weiter"-Kante, hinter der nichts folgt, schlechter liest als ein gedimmter. Balken rendern
  dort mit `opacity: 0.4`.
- **N3 — Die Zeitspalte trägt 72px und kleinere Span-Labels.** Bei 56px und `bodyEmph` wurde
  „from 09:00" zu „from 0…" abgeschnitten; DE „durchgehend" hätte es genauso getroffen (beide
  11 Zeichen). Reine Uhrzeiten und „Ganztägig" bleiben `bodyEmph`, die beschreibenden Phrasen
  (`ab …`/`bis …`/`durchgehend`) laufen auf `caption`. **Das ist eine typografische Entscheidung
  im Designer-Territorium** — wenn der Designer die Spalte lieber breiter oder die Copy kürzer
  hätte, ist das die Stelle zum Nachziehen.

## Risiken

- **Zellbreite im Raster** (D5) — Sichtprüfung ergab: benachbarte Balken lassen ~1px Luft, die
  Linie liest sich bei realer Größe trotzdem durchgehend. Der in D5 dokumentierte Fallback greift,
  die Variante bleibt. Auf iOS noch nicht gegengeprüft.
- **`useEvent` bleibt bewusst auf Occurrence-Ebene.** Detail- und Edit-Screen sehen nie Segmente.
  Das ist Absicht (D1) und muss beim Review als solches gelesen werden, nicht als Lücke.
- **Über-Fetching in `fetchEventsInRange`** (keine untere `start_at`-Schranke) bleibt bestehen. Es
  ist hier sogar hilfreich (D4), aber es bleibt eine Altlast — kein Teil dieser Iteration.
