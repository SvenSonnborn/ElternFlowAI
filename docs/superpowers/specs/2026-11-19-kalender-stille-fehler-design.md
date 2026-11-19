# Kalender: stille Fehler im Schreibpfad (Roadmap Schritt 1) — Design

**Status:** Entwurf, abgestimmt im Gespräch mit Sven am 2026-11-19
**Date:** 2026-11-19
**Branch:** `fix/kalender-stille-fehler`, [roadmap.md](../../roadmap.md) Schritt 1
**Decision-Log:** ein ADR (058) am Branch-Ende

## 1. Worum es geht

Sechs Einträge aus [TODO.md](../../TODO.md), an denen der Kalender Daten verliert, versteckt oder zu wenig
warnt, ohne dass es jemand merkt:

| #   | TODO-Eintrag (Anfang)                                                                         | Was heute passiert                                                                                                                                                                                                     |
| --- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | „Der Forward-Split übernimmt keine Reminder“                                                  | „Diesen und alle folgenden“ spaltet eine neue Serie mit neuer Id ab. Ihre Erinnerungen sind weg, niemand sagt es.                                                                                                      |
| B   | „Auf einer per „Nur diesen“ verschobenen Occurrence bleibt der Recurrence-Editor verborgen …“ | Auf einer verschobenen Occurrence fehlen Wiederholung und Serienende im Formular, obwohl die Regel darstellbar ist.                                                                                                    |
| C   | „Conflict-Detection beim Bearbeiten“                                                          | Beim Anlegen erscheint ein Kollisionshinweis, beim Bearbeiten nicht.                                                                                                                                                   |
| D   | „Eine per Override weit verschobene Occurrence bleibt im Monatsraster unsichtbar …“           | Eine Occurrence, die per Override hinter `rrule_until` oder vor den Serienstart verschoben wurde, fehlt im Monat, in den sie verschoben wurde. Die Abfrage lädt die Serie dort gar nicht.                              |
| E   | „Ein Override nur mit `start_at` wird strenger gefenstert als aufgelöst“                      | `overrideInterval` setzt ein fehlendes Ende gleich dem Start; die Vorprüfung in `expandEvents` verwirft dadurch Occurrences, die der Filter dahinter behalten würde.                                                   |
| F   | „`events.timezone` wird nur formal validiert“                                                 | Eine formal gültige, aber unbekannte Zone wird gespeichert. Gelesen fällt sie still auf UTC zurück (`buildFormatter` in [timezone.ts](../../../features/calendar/timezone.ts)), der Termin steht zur falschen Uhrzeit. |

## 2. Ziele, Nicht-Ziele, Anti-Ziele

**Ziele**

- Alle sechs Fälle behoben, jeder mit einem Test, der den Fehler vorher nachstellt.
- Jeder der sechs TODO-Einträge verschwindet in dem Commit, der ihn löst.

**Nicht-Ziele**

- Kollisionsprüfung für die Folgetermine einer Serie — weder beim Anlegen noch beim Bearbeiten. Das ist
  der TODO-Eintrag „Die Kollisionsprüfung beim Anlegen sieht nur die erste Occurrence einer neuen Serie“
  und ein eigener Roadmap-Schritt (16).
- Erinnerungen pro Occurrence, Zustellung von Erinnerungen, „Wiederholung ab hier ändern“ — eigene
  TODO-Einträge, bleiben stehen.
- „Diesen und alle folgenden“ von einer verschobenen Occurrence aus. Die abgespaltene Serie übernimmt
  heute Datum, Uhrzeit und Texte des Overrides (`insertSplitEvent` bekommt die Formularwerte). Das ist
  dieselbe Fehlerklasse wie B Schritt 5, aber B macht diesen Weg nicht häufiger, denn eine
  Regeländerung erzwingt „Alle“. Außerdem bräuchte die Frage, wo die abgespaltene Serie beginnt, ein
  eigenes Design. Der Umsetzer trägt es im Commit von B als neuen Eintrag in `docs/TODO.md` ein.
- Das Lade-Prädikat lädt heute **jeden** vergangenen Einzeltermin der Familie (`rrule_until` ist dort
  `null`, also trifft `rrule_until.is.null` immer). Das ist eine Performance-Frage, kein stiller
  Datenfehler. Der Umsetzer trägt sie als neuen Eintrag in `docs/TODO.md` ein und ändert das Prädikat
  dafür nicht.

**Anti-Ziele** (wäre ein Fehlschlag, auch wenn alles andere funktioniert)

- Ein einziger kaputter Wert in `event_exceptions.override` bringt das Laden des ganzen
  Familienkalenders zum Scheitern. Die neue Abfrage aus D darf an keinem Override-Inhalt werfen.
- Ein Gerät, das heute speichern kann, kann es nach F nicht mehr — insbesondere eines, dessen Zone als
  Offset-String (`+00:00`) ankommt (siehe die Migration
  [20260909131554_events_timezone_iana_widen.sql](../../../supabase/migrations/20260909131554_events_timezone_iana_widen.sql)).
- Die Kollisionslogik steht danach zweimal im Code, einmal pro Screen.

## 3. Die sechs Punkte

### A. Der Forward-Split übernimmt die Erinnerungen

**Sven hat entschieden:** Die abgespaltene Serie übernimmt die Erinnerungen der alten.

Szenario: Eine wöchentliche Serie „Klavier“ hat Erinnerungen 1 Tag und 1 Stunde vorher. Jemand ändert
ab dem 15.06. die Uhrzeit mit „Diesen und alle folgenden“. Danach haben beide Hälften dieselben beiden
Erinnerungen.

- Ort: `apply_event_change`, Zweig `insert_split_event` (heute in
  [20261026163759_calendar_transaction_rpc.sql](../../../supabase/migrations/20261026163759_calendar_transaction_rpc.sql)).
  Der Zweig merkt sich die Id der neuen Zeile und kopiert danach jede Zeile aus `public.reminders` mit
  `event_id = p_event_id` auf die neue Id.
- Kopiert werden `offset_minutes` und `recipient_parent_id`. `sent_at` bleibt leer. `family_id` setzt der
  bestehende Trigger `reminders_set_family_id`.
- Die alte Serie behält ihre Erinnerungen.
- Die Änderung kommt als neue Migration mit `create or replace function` und unveränderter Signatur.
  Postgres kennt kein teilweises Ersetzen, also steht der ganze Rumpf noch einmal da. Der Umsetzer
  übernimmt ihn wörtlich und ändert nur diesen Zweig. `security invoker`, Kommentar und Rechte bleiben,
  wie sie sind.
- RLS auf `reminders` gilt (Aufruf als `authenticated`). Lese- und Insert-Policy sind familienweit, nicht
  auf den Empfänger beschränkt. Die Kopie sieht und schreibt also jede Erinnerung der Serie (im
  Builder-Check nachgelesen).
- Ein wiederholter Aufruf mit derselben Kennung endet als `already_applied`, bevor ein Schritt läuft.
  Doppelte Kopien entstehen also nicht.

**Tests** (pgTAP in [apply_event_change.test.sql](../../../supabase/tests/database/apply_event_change.test.sql)):
Split einer Serie mit zwei Erinnerungen → die neue Serie hat beide, mit gleichem Offset und Empfänger,
`sent_at` leer, richtige `family_id`; die alte hat weiter beide. Split einer Serie ohne Erinnerungen →
die neue hat keine.

### B. Der Recurrence-Editor auf einer verschobenen Occurrence

Szenario aus dem TODO-Eintrag, dort nachgemessen: Wöchentliche Montagsserie ab 04.05.2026. Der 22.06.
ist per „Nur diesen“ auf Dienstag, 23.06. verschoben. Öffnet man diesen Termin zum Bearbeiten, fehlen
Wiederholung und Serienende. Bei 15.06. und 29.06. sind sie da.

Ursache: Das Formular prüft die Regel gegen den **verschobenen** Start (`source.startAt`). Für „wöchentlich
an einem Tag“ erkennt `rruleToRecurrence` die Option nur, wenn der Wochentag des Ankers der Regel-Tag ist.

**Soll (meine Festlegung):** Der Anker ist der Tag, den die Regel erzeugt hat — der `occurrenceKey` in
der Zone des Termins, den kein Override verschiebt.

1. **Hydration** in [EventEditScreen.tsx](../../../app-sections/event/EventEditScreen.tsx) (`initial`):
   `rruleToRecurrence` bekommt als Anker einen Zeitpunkt auf dem Regel-Tag, z. B. den Tagesbeginn aus
   `zonedDayBounds(occurrenceKey, timezone)`. `rruleToRecurrence` liest daraus nur den Wochentag. Liefert
   `zonedDayBounds` `null`, bleibt es beim heutigen Anker.
2. **Speichern** (`buildRecurrenceChanges`): Hat der Nutzer das **Datum** im Formular nicht geändert
   (gleicher Kalendertag in der Zone des Termins wie beim Öffnen), baut `recurrenceToRrule` die Regel mit
   demselben Regel-Anker. Hat er das Datum geändert, gilt wie heute der Start aus dem Formular.
   Begründung: Eine Regeländerung erzwingt Scope „alle“, und dort behält der Master sein Datum
   (`anchoredChanges` in [recurrence.ts](../../../features/calendar/recurrence.ts)). Das Formular-Datum
   entscheidet in diesem Pfad nur über den Wochentag. Ein unverändertes Datum auf einer verschobenen
   Occurrence ist ein Override-Rest, keine Absicht. Ein geändertes Datum ist eine.
3. **Konflikt-Dialog:** `mineRuleSide` in `showConflict` rechnet mit demselben Anker wie das Speichern,
   damit der Dialog zeigt, was geschrieben würde.
4. Der lange Kommentar über `initial`, der auf `docs/TODO.md` verweist, wird auf den neuen Stand
   gebracht.
5. **Unter „Alle“ geht nur Geändertes in die Serie (Sven hat entschieden).** Der Builder-Check hat
   gezeigt: Unter Scope „Alle“ schreibt das Speichern heute **jedes** Formularfeld in den Master. Auf einer
   Occurrence mit Override stammen diese Werte aus dem Override. B macht den Weg dorthin viel häufiger,
   weil eine Regeländerung auf einer verschobenen Occurrence jetzt möglich ist und „Alle“ erzwingt.
   - Szenario: „Klavier“ montags 16:00–17:00, Ort „Musikschule“. Der 22.06. ist per „Nur diesen“ auf
     Dienstag, 23.06., 18:00–19:00 verschoben, Ort „Musikschule Raum 2“. Jemand öffnet den 23.06. und
     ändert nur die Anzahl. Heute (auf einer Verschiebung am selben Wochentag schon möglich) liegt danach
     die ganze Serie um 18:00 in „Raum 2“.
   - Soll: Unter „Alle“ übernimmt jedes Feld, das der Nutzer gegenüber dem geöffneten Stand nicht geändert
     hat, den Wert des Masters statt des Formulars. Das gilt mit und ohne Regeländerung. Felder: Titel,
     Ort, Notiz und die Uhrzeit. Die Uhrzeit ist **eine** Einheit aus Startzeit und Dauer, gemessen in der
     Zone des Termins. Weicht eins von beiden vom geöffneten Stand ab, gilt die Uhrzeit des Formulars wie
     heute (`anchoredChanges` verankert sie am Datum des Masters). Sonst behält der Master Start und Ende.
     Eine reine Datumsänderung zählt hier nicht. Den Wochentag regelt Schritt 2, das Datum
     `anchoredChanges`.
   - Auf einer unverschobenen Occurrence ändert sich nichts, weil Formular und Master dort bis aufs Datum
     gleich sind.
   - Wo der Umsetzer das baut, ist seine Wahl. Bedingung: Optimistische Anzeige, Konflikt-Dialog und
     Schreibpfad sehen dasselbe Ergebnis. Die Entscheidung „geändert oder nicht“ ist eine reine Funktion
     mit `bun test`.
   - Unverändert bleibt die bestehende Regel, dass eine Regeländerung alle Ausnahmen löscht. Im Szenario
     liegt der 22.06. danach wieder auf Montag.

**Abnahme:**

- Im Szenario oben zeigt der 23.06. „Wöchentlich“ und das Serienende-Feld. Ändert man nur die Anzahl und
  speichert, bleibt `rrule_byweekday` `[1]` (Montag). Die Serie wandert nicht auf Dienstag.
- Regressionsschutz: Auf einer **unverschobenen** Montags-Occurrence das Datum auf Mittwoch ändern und die
  Anzahl ändern ergibt `rrule_byweekday` `[3]`, wie heute.
- Szenario aus Schritt 5, nur die Anzahl geändert: Der Master steht danach auf 16:00–17:00, Ort
  „Musikschule“, Titel unverändert.
- Dieselbe Occurrence, nur den Titel geändert, „Alle“ gewählt: neuer Titel, sonst 16:00–17:00 und
  „Musikschule“.
- Dieselbe Occurrence, Uhrzeit auf 17:00–18:00 geändert, „Alle“ gewählt: Der Master liegt montags
  17:00–18:00, Ort „Musikschule“.
- Regressionsschutz: Auf einer unverschobenen Occurrence nur den Titel ändern und „Alle“ wählen ergibt
  dasselbe wie heute.

**Tests:** in [EventEditScreen.jest.tsx](../../../app-sections/event/EventEditScreen.jest.tsx) oder an
reinen Funktionen mit `bun test`, die der Umsetzer dafür herauszieht. Mindestens alle Abnahmefälle.

### C. Kollisionshinweis beim Bearbeiten

**Sven hat entschieden:** Der Bearbeiten-Screen zeigt dieselbe nicht-blockierende Zeile wie das Anlegen.
Er nutzt dieselbe Copy (`cal.create.conflict`), kollidiert nicht mit sich selbst und prüft nur die
bearbeitete Occurrence. Die Folgetermine einer Serie kommen mit Schritt 16.

Szenario: Mia hat dienstags 16:00–17:00 Schwimmen. Jemand öffnet Mias Klavierstunde am selben Dienstag
und schiebt sie von 18:00 auf 16:30. Unter den Zeitfeldern erscheint „Kollision mit Schwimmen ·
16:00–17:00“. Speichern bleibt möglich ([patterns/calendar.md](../../../patterns/calendar.md), „Conflict
detection“: „Allow override“).

**Details (meine Festlegungen):**

- **Eine Logik für beide Screens.** Die Prüfung aus `EventCreateScreen` (`rangesOverlap`, `samePerson`,
  der `conflicts`-Memo) zieht in eine reine Funktion unter `app-sections/event/`, die beide Screens
  aufrufen. Das Anlegen verhält sich danach genau wie vorher.
- **Person:** die des bearbeiteten Termins (`childId`/`parentId`). Das Formular ändert die Person nicht.
  Es gilt dieselbe Regel wie beim Anlegen: Familienweite Termine (beide `null`) kollidieren mit allen.
- **Geprüfte Spanne:** die, die das Formular zeigt, also `finalRange`. Bei ganztägigen Terminen ist sie
  auf die Zone des Termins eingerastet (beim Anlegen ist es die Zone des Geräts, weil der Termin dort neu
  entsteht). Den Scope wählt der Nutzer erst nach dem Tippen auf Speichern. Unter „Alle“ verwirft
  `anchoredChanges` eine Datumsänderung, dann weicht das Gespeicherte vom Formular ab. Der Hinweis
  blockiert nichts und folgt dem Formular.
- **Nicht mit sich selbst:** Ausgenommen ist genau die Occurrence mit gleicher `eventId` **und** gleichem
  `occurrenceKey`. Andere Occurrences derselben Serie zählen normal: Schiebt jemand per „Nur diesen“
  den Dienstag auf den Mittwoch, auf dem dieselbe Serie schon liegt, ist das eine echte Kollision.
- **Ladefenster:** wie beim Anlegen, `useFamilyEvents(startAt, endAt > startAt ? endAt : startAt)` mit
  den vorhandenen `Date`-Objekten. Das Memo in `useFamilyEvents` hängt an der Referenz (Kommentar im
  Anlege-Screen).
- **Darstellung:** dieselbe `View`/`Text`-Kombination wie beim Anlegen, an derselben Stelle unter den
  Zeitfeldern. Kein neuer Copy-Key, `docs/COPY.md` bleibt unberührt.

**Tests:** die reine Funktion mit `bun test`: gleiche Person, familienweit gegen Person, andere Person
(keine Kollision), die bearbeitete Occurrence selbst (keine), eine andere Occurrence derselben Serie
(Kollision), Kanten, die sich nur berühren (Ende = Start, keine), ganztägig. Dazu ein Test in
`EventEditScreen.jest.tsx`, dass die Zeile bei einer echten Kollision erscheint und beim unveränderten
Öffnen eines Termins ohne fremde Überschneidung nicht.

### D. Weit verschobene Occurrences laden

Szenarien aus dem TODO-Eintrag: Eine Serie mit `rrule_until` im Juni, deren letzte Occurrence per
Override auf den August verschoben ist, lädt für ein August-Fenster nicht. Ebenso eine Serie, die 2027
beginnt, aber eine Occurrence per Override auf 2026 zurückverschoben hat. Die clientseitige
Kandidatenmenge (ADR-035) würde beide zeigen. Sie bekommt die Zeilen nur nie.

**Soll (meine Festlegung):** Das Laden eines Fensters liefert zusätzlich jede Serie, die eine
`modified`-Exception hat, deren Override-Intervall das Fenster schneidet. Den Rest erledigt
`expandEvents` schon.

- **Wo:** eine SQL-Funktion in `public`, etwa `events_in_range(p_start, p_end)` (beide `timestamptz`),
  Rückgabe `setof public.events`, `stable`, `security invoker`, leerer `search_path`. `fetchEventsInRange`
  ([queries.ts](../../../features/calendar/queries.ts)) ruft sie per `.rpc(...)` und hängt
  `.select(EVENT_SELECT)` an, damit Typ-, Exception- und Rückgabeform gleich bleiben. Gegen eine zweite
  Abfrage mit Zusammenführen im Client spricht, dass PostgREST JSON-Zeitstempel nur als Text vergleichen
  kann. Ein Override mit Offset (`+02:00`) sortierte dann falsch.
- **Prädikat:** das heutige (`start_at <= p_end` und `rrule_until` leer oder `>= p_start`) **oder** es
  gibt eine `modified`-Exception mit `override_start <= p_end` und `override_end >= p_start`.
  `override_start` ist `override->>'start_at'` als `timestamptz`. `override_end` ist
  `override->>'end_at'` als `timestamptz`. Fehlt es oder ist es unbrauchbar, gilt
  `override_start + (end_at - start_at)` des Masters, dieselbe Regel wie E. Über eine Zeitumstellung ist
  diese absolute Dauer bis zu eine Stunde kürzer als die Wandzeit-Dauer. Der Umsetzer polstert sie
  deshalb auf, etwa um eine Stunde (siehe „Lieber zu viel“).
- **Sicherer Cast:** Ein Wert, der sich nicht als Zeitstempel lesen lässt (`"kaputt"`,
  `"2026-02-30T07:00:00Z"`, eine Zahl, ein fehlender Schlüssel), macht die Exception für dieses
  Prädikat nur unwirksam. Er wirft nie (Anti-Ziel). Die Technik wählt der Umsetzer, etwa eine
  Hilfsfunktion mit Exception-Block oder eine Musterprüfung vor dem Cast.
- **Lieber zu viel als zu wenig:** Die Funktion darf mehr Zeilen liefern, als der Client zeigt.
  `expandEvents` filtert ohnehin noch einmal nach Fenster. Weniger darf sie nicht liefern. Wo SQL und
  `overrideDate` ([override.ts](../../../features/calendar/override.ts)) einen exotischen Wert
  verschieden lesen, ist das hinnehmbar, solange ISO-8601 mit und ohne Offset auf beiden Seiten gleich
  gelesen wird. Der App-Schreibpfad schreibt nur ISO.
- **Rechte:** RLS von `events` und `event_exceptions` greift über `security invoker`. Ausführen darf nur
  `authenticated` (`revoke all` von `public` und `anon`, `grant execute` an `authenticated`). Das Inventar in
  [security.test.sql](../../../supabase/tests/database/security.test.sql) („anon darf keine Funktion in
  public ausführen“) muss grün bleiben. Eine Hilfsfunktion für den Cast liegt so, dass sie das auch
  bleibt.
- **Typen:** `features/supabase/database.types.ts` neu erzeugen. Das installierte `postgrest-js` typisiert
  RPCs, die Tabellenzeilen liefern (`SetofOptions` im generierten Typ). Damit ist auch das Einbetten
  hinter `.rpc()` typisiert. Offen ist nur, ob die gepinnte Supabase-CLI diese Angabe erzeugt. Das prüft
  der Umsetzer am generierten Typ. Ohne `any` und ohne `as`-Cast auf das Ergebnis.
- Query-Key, Realtime-Invalidierung und der Aufrufer `useFamilyEvents` bleiben unverändert. Kein neuer
  Index, die Datenmengen pro Familie sind klein.

**Tests:**

- pgTAP: die beiden Szenarien oben, je für das Zielfenster geliefert.
- Eine `cancelled`-Exception weitet nichts.
- Ein kaputter Override wirft nicht. Die Serie kommt nur über das alte Prädikat oder gar nicht.
- Integrationstest in [calendar.db.ts](../../../supabase/tests/integration/calendar.db.ts): Eine fremde
  Familie sieht über die Funktion nichts. Dafür bekommt `fetchEventsInRange` wie `fetchEventById` einen
  injizierbaren `client`.

### E. `overrideInterval` erbt die Dauer

**Soll (meine Festlegung):** `overrideInterval` bekommt die Basisdauer als zweiten Parameter. Fehlt
`end_at` oder ist es unbrauchbar, endet das Intervall bei Start + Basisdauer, wie es `applyOverride` in
[expand.ts](../../../features/calendar/expand.ts) schon tut.

- Aufrufer sind die Kandidaten-Vorprüfung in `expandEvents` und `eventLookupWindow` in
  [eventWindow.ts](../../../features/calendar/eventWindow.ts). Beide kennen die Master-Zeile.
- **Abnahme:** Die Vorprüfung ist nie strenger als der Fensterfilter dahinter. Über eine Zeitumstellung
  weichen absolute und Wandzeit-Dauer um bis zu eine Stunde ab. Der Umsetzer wählt die Dauer so, dass
  das Intervall der Vorprüfung das der Auflösung immer einschließt; `expandEvents` nimmt für denselben
  Zweck schon das Maximum beider Dauern.
- Der Docstring von `overrideInterval` beschreibt die Asymmetrie heute als offene Grenze und wird
  angepasst.

**Tests:** in `override.test.ts`/`expand.test.ts`. Ein Override nur mit `start_at`, weit verschoben. Das
Fenster enthält nur das geerbte Ende, also den Bereich zwischen Start und Start + Dauer, nicht den
Start. Die Occurrence ist da.

### F. `events.timezone` gegen echte Zonen prüfen

**Soll (meine Festlegung):** Ein Trigger `before insert or update of timezone` auf `public.events`
lehnt eine Zone ab, die weder als `name` in `pg_timezone_names` steht noch ein Offset-String
`[+-]HH:MM` ist.

- Ein `CHECK` geht nicht: Eine Subquery ist dort verboten, und eine Funktion darüber wäre nicht
  `immutable` (TODO-Eintrag).
- **Beim Update** prüft der Trigger nur, wenn sich der Wert ändert (`is distinct from old.timezone`).
  Bestehende Zeilen bleiben damit bearbeitbar, auch falls eine Altlast existiert. Mit einer Ausnahme: Der
  Forward-Split legt eine neue Zeile mit der Zone des Masters an. Bei einer Altlast-Zone scheiterte er
  mit `23514`. Deshalb ist die leere Datenprüfung unten Voraussetzung fürs Ausrollen. Eine
  Sonderregel im Trigger gibt es dafür nicht.
- Fehler mit `errcode '23514'` (`check_violation`), wie der bestehende `CHECK`. Die Meldung nennt die
  Zone.
- Der bestehende `CHECK` `events_timezone_iana` bleibt. Er prüft die Form, der Trigger die Existenz.
- Die Trigger-Funktion ist für niemanden direkt aufrufbar (`revoke execute` von `public`, `anon` und
  `authenticated`), wie die anderen Trigger-Funktionen in Abschnitt 7 der Kalender-RPC-Migration.
- Der Docstring von `buildFormatter` in [timezone.ts](../../../features/calendar/timezone.ts) begründet
  heute, warum eine Prüfung gegen `pg_timezone_names` ausscheidet: Offset-Strings stehen nicht in der
  Liste. Der Trigger lässt sie durch, der Docstring wird angepasst. Der UTC-Fallback bleibt, für
  Altbestand und andere Schreiber.
- **Restrisiko, im Gespräch benannt:** Kennt ein Gerät eine Zone, die die Zonendatenbank des Servers
  (noch) nicht kennt, scheitert dort das Anlegen. Dafür steht kein Termin mehr still zur falschen
  Uhrzeit.
- **Datenprüfung vor dem Ausrollen:** Lokal und — nur mit Svens OK — live: Gibt es Zeilen, deren Zone
  weder in `pg_timezone_names` steht noch ein Offset-String ist? Lokal muss das Ergebnis leer sein.
  Findet sich live etwas, hält der Umsetzer an und fragt Sven.

**Tests** (pgTAP):

- `Europe/Berlin`, `UTC`, ein Legacy-Alias aus `pg_timezone_names` und `+00:00` werden angenommen.
- `Mars/Olympus` wird mit `23514` abgelehnt, beim Insert wie beim Update der Zone.
- Ein Update eines anderen Feldes an einer Zeile mit unbekannter Zone geht durch. Die Zeile entsteht im
  Test bei abgeschaltetem Trigger.

## 4. Für alle Punkte

- **Migrationen:** neu über `supabase migration new`. Wie viele, entscheidet der Umsetzer. Nach jeder
  DB-Änderung `supabase db reset`, `bun run test:db` und neue Typen.
- **Live** spielt der Umsetzer nichts ein. Das Ausrollen passiert am Branch-Ende mit Sven. Die Migrationen
  gehen live, bevor der PR gemergt wird. Nach D ruft der Client nur noch die neue Funktion. Fehlt sie auf
  dem Server, lädt der ganze Kalender nicht. Einen Rückfallweg im Client gibt es nicht: Es gibt keine
  ausgelieferten Builds, die vor dem Ausrollen gegen live laufen müssten.
- **Prüfbefehle:** `bun run typecheck`, `bun lint`, `bun test`, `bun run test:rn`, `bun run test:db`,
  `bun format:check` (alle über `mise exec --`).
- **Doku im Code:** JSDoc für jede neue oder umgeschriebene Export-Funktion. Die sechs TODO-Einträge gehen
  im lösenden Commit raus, der für C steht unter „Conflict-Detection“. Der neue TODO-Eintrag zum
  Lade-Prädikat (Nicht-Ziele) kommt in den Commit von D.
- **Doku am Branch-Ende:** ADR-058 mit den Entscheidungen aus Abschnitt 6.
  [architecture.md](../../architecture.md) bekommt das Laden über die SQL-Funktion. Die Roadmap wird
  nachgezogen.

## 5. Dem Umsetzer überlassen

- Reihenfolge der Punkte und Zuschnitt der Commits und Migrationen.
- Namen der neuen Funktionen, Technik des sicheren Casts, Form des Ankers in B (Hilfsfunktion oder
  inline).
- Welche Dauer E genau nimmt, solange die Abnahme hält.
- Wo die gemeinsame Kollisionsfunktion liegt und wie sie heißt, solange sie unter `app-sections/event/`
  bleibt und rein ist.

## 6. Entscheidungen

**Von Sven:**

- A: Die abgespaltene Serie übernimmt die Erinnerungen.
- B: Unter „Alle“ gehen nur die Felder in die Serie, die der Nutzer geändert hat. Unveränderte behalten
  den Wert des Masters (nach dem Builder-Check gefragt).
- C: Gleiche nicht-blockierende Zeile und Copy wie beim Anlegen, nicht mit sich selbst, nur die
  bearbeitete Occurrence, Folgetermine erst mit Schritt 16.
- D, E, F: die technische Richtung (SQL-seitige Erweiterung des Lade-Prädikats, geerbte Dauer,
  Zonenprüfung per Trigger mit Offset-Ausnahme) im Gespräch bestätigt.

**Meine (bitte beim Lesen prüfen):**

- A: `sent_at` wird nicht mitkopiert. Die alte Serie behält ihre Erinnerungen.
- B: Regel-Anker = `occurrenceKey`. Beim Speichern gilt er nur, solange das Datum im Formular
  unverändert ist, sonst das Formular-Datum. Beim „geändert?“ ist die Uhrzeit eine Einheit aus Startzeit
  und Dauer, eine reine Datumsänderung zählt nicht.
  „Diesen und alle folgenden“ von einer verschobenen Occurrence bleibt draußen (neuer TODO-Eintrag).
- C: Person aus dem bearbeiteten Termin. Andere Occurrences derselben Serie zählen als Kollision. Die
  Logik wird für beide Screens gemeinsam herausgezogen. Geprüft wird die Spanne im Formular, nicht die
  nach dem Scope gespeicherte.
- D: SQL-Funktion statt zweiter Abfrage. Lieber zu viel laden als zu wenig. Kein neuer Index. Das
  Einzeltermin-Prädikat bleibt (TODO). Migration live vor dem Merge, kein Rückfallweg im Client.
- F: Prüfung beim Update nur bei geänderter Zone. Fehlercode `23514`. Den Forward-Split einer
  Altlast-Zeile sichert die Datenprüfung ab, keine Sonderregel im Trigger.
