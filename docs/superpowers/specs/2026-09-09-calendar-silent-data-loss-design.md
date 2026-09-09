# Stiller Datenverlust im Kalender: Zonenmodell und Occurrence-Schlüssel — Design

**Status:** Approved (Brainstorming Phase)
**Date:** 2026-09-09
**Auftrag:** [docs/roadmap.md](../../roadmap.md) → [Block 1 — Stiller Datenverlust im Kalender](../../roadmap.md#block-1--stiller-datenverlust-im-kalender)
**Decision-Log:** wird als ADR-032 referenziert nach Implementation; ergänzt [ADR-008](../../decision-log.md) (Recurrence-V1) und [ADR-031](../../decision-log.md) (Conflict-Detection), löst nichts ab

---

## 1. Context

Block 1 der Roadmap bündelt die Einträge aus `docs/TODO.md`, bei denen **Termine ohne jede Fehlermeldung verschwinden oder ein Speichern folgenlos bleibt**. Vier Baustellen, alle in [features/calendar/](../../../features/calendar/), alle unblockiert.

Vor dem Entwurf habe ich jede Behauptung nachgestellt — Wegwerf-Tests gegen den echten `expandEvents`/`buildRule`-Pfad unter `TZ=Europe/Berlin`. Zwei Ergebnisse weichen von dem ab, was `TODO.md` und `roadmap.md` notieren, und beide ändern die Arbeit.

### 1.1 Befund: `tzid` löst die Zeitumstellung nicht

Die Roadmap schlägt für 1.4 vor, `rrule` die Regel „in Ortszeit auswerten" zu lassen, indem `tzid` als zusätzliche Option gesetzt wird. **Das funktioniert mit `rrule@2.8.1` nicht in dieser App.**

`rezonedDate` rechnet in [dateutil.js](../../../node_modules/rrule/dist/esm/dateutil.js) `targetOffset − localOffset` und zieht die Differenz vom Ergebnis ab:

```js
const tzOffset = dateInTargetTZ.getTime() - dateInLocalTZ.getTime();
return new Date(date.getTime() - tzOffset);
```

Der Term ist nur dann der gesuchte Offset, wenn `localOffset` null ist — also wenn die **Prozess-Zeitzone UTC** ist. Gemessen mit einer wöchentlichen Serie ab `2026-10-06 18:00` Berlin und `tzid: "Europe/Berlin"`:

| Prozess-TZ         | Ergebnis                 |                               |
| ------------------ | ------------------------ | ----------------------------- |
| `UTC`              | 18:00 Berlin durchgehend | ✔ korrekt                     |
| `Europe/Berlin`    | unverändert falsch       | ✘ `tzid` ist ein reiner No-op |
| `America/New_York` | 14:00 Berlin             | ✘                             |

Eine React-Native-App läuft in der **Gerätezone**, nicht in UTC. Der Zweig „TZ = Ortszeit" ist genau der Produktionsfall — und dort ändert die Option nichts. Der Fix muss die Zonenauswertung selbst in die Hand nehmen.

Der Fehler selbst ist in beiden Umstellungsrichtungen bestätigt:

```
wöchentlich ab 2026-10-06 18:00 → 06.10./13.10./20.10. 18:00, ab 27.10. 17:00
wöchentlich ab 2026-03-09 08:00 → 09.03./16.03./23.03. 08:00, ab 30.03. 09:00
```

### 1.2 Befund: das Override-Modell hat vier Symptome, nicht zwei

`TODO.md` nennt zwei (Unsichtbarkeit einer verschobenen Occurrence; der Versions-Schlüssel greift daneben). Nachgestellt mit einer wöchentlichen Serie ab `2026-06-01`, deren Vorkommen am `2026-06-29` per Override auf den `2026-07-02` verschoben wurde:

| Prüfung                                | Beobachtet                                                                  |
| -------------------------------------- | --------------------------------------------------------------------------- |
| Juni-Fenster                           | `06-01, 06-08, 06-15, 06-22` — der 29.06. fehlt ✔ **korrekt**               |
| Juli-Fenster                           | `07-06, 07-13, 07-20, 07-27` — **der 02.07. fehlt** ✘                       |
| Versions-Token der Occurrence          | `2026-06-01T00:00:00.000Z\|-` — **ohne die Exception, die sie definiert** ✘ |
| Zweites Bearbeiten (Titel „Umbenannt") | Titel bleibt „Sport" — **wirkungslos, meldet Erfolg** ✘                     |
| Löschen mit Scope „Nur diesen"         | Occurrence bleibt sichtbar — **ebenfalls wirkungslos** ✘                    |

Die letzten beiden stehen in keinem TODO-Eintrag. Sie sind kein eigener Fehler, sondern dieselbe Ursache aus der Schreibrichtung gesehen.

### 1.3 Die eine Ursache hinter 1.2 und dem Override-Modell

Zwei Größen tragen im Kalender denselben Namen und werden stillschweigend füreinander eingesetzt:

- **Das Regel-Datum** — was `rule.between()` erzeugt hat. Es ist der Schlüssel von `event_exceptions.occurrence_date`.
- **Das aufgelöste Datum** — wo der Termin nach Anwendung des Overrides tatsächlich liegt. Es bestimmt Anzeige, Rasterplatzierung und Route-Parameter.

[expand.ts:127](../../../features/calendar/expand.ts) berechnet das aufgelöste Datum korrekt neu und schreibt es als `occurrenceDate` in die `CalendarOccurrence` — den Exception-Lookup drei Zeilen darüber macht es aber über das Regel-Datum. Alles, was danach kommt (`occurrenceVersion`, der Route-Parameter `occ`, `modifyOccurrence`, `cancelOccurrence`), liest `occurrenceDate` und trifft damit das falsche Datum, sobald die beiden auseinanderfallen.

Dieselbe Doppelbelegung liegt einer Ebene tiefer in `events.start_at`: Die Spalte ist zugleich Startzeit des Termins **und** `dtstart` der Serie. Deshalb verschiebt ein Speichern mit Scope „alle" den Serienanker.

### Zielbild

Ein Serientermin liegt zu jeder Jahreszeit auf derselben Uhrzeit. Wer eine einzelne Occurrence auf einen anderen Tag verschiebt, findet sie dort — und kann sie dort ein zweites Mal ändern oder löschen. Wer bei einer laufenden Serie „Alle Termine" wählt, verliert keine vergangenen Vorkommen. Und was eine abgespaltene Serienhälfte an Zuordnung trug, trägt sie danach immer noch.

---

## 2. Schnitt und Reihenfolge

Vier PRs. Die Roadmap sortiert 1.4 (Zeitumstellung) ans Ende mit dem Argument „höchstes Risiko zuletzt". **Diese Spec tauscht 1.4 und 1.3.**

| PR  | Inhalt                                    | Aufwand | Roadmap-Punkt |
| --- | ----------------------------------------- | ------- | ------------- |
| 1   | `insertSplitEvent` verliert `parent_id`   | S       | 1.1           |
| 2   | „Alle Termine" verschiebt den Serienstart | M       | 1.2           |
| 3   | Zeitumstellung + `events.timezone`        | L       | 1.4           |
| 4   | Das Override-Modell                       | L       | 1.3           |

Begründung des Tauschs: PR 3 schreibt den **Vertrag** von [rrule.ts](../../../features/calendar/rrule.ts) neu — `buildRule` wird modulintern, nach außen gehen `occurrencesBetween`/`allOccurrences`. PR 4 baut seine Kandidatenmenge genau auf diesem Vertrag auf. In der umgekehrten Reihenfolge entstünde die Kandidaten-Logik gegen Regel-Daten, die noch eine Stunde falsch sind, und müsste danach vollständig neu verifiziert werden. PR 4 ist außerdem der mit der größten Streuung (Route-Parameter, rund zehn Aufrufstellen); er gehört auf einen bereits stabilen Expander.

PR 1 und PR 2 sind von beiden unabhängig und können jederzeit dazwischen laufen.

---

## 3. PR 1 — `insertSplitEvent` verliert `parent_id`

### 3.1 Der Fix

[recurrence.ts](../../../features/calendar/recurrence.ts) → `createSupabaseEventOps.insertSplitEvent` führt fünfzehn Spalten und lässt `parent_id` aus. Verifiziert gegen die Spaltenliste von `EventRow`: es ist die einzige fehlende, alles andere ist entweder generiert (`id`, `created_at`, `updated_at`) oder kommt bewusst aus `changes`.

```ts
family_id: master.family_id,
type_id: master.type_id,
child_id: master.child_id,
parent_id: master.parent_id,   // ← neu
```

### 3.2 Der Test ist die eigentliche Arbeit

Ein Test, der `parent_id` prüft, verhindert dieselbe Auslassung bei der nächsten neuen Spalte nicht. Deshalb prüft er die **Schlüsselmenge**, nicht einen Schlüssel:

```
insert-Payload-Keys  ==  EventRow-Keys  −  { id, created_at, updated_at }
```

Die Allowlist steht namentlich im Test, mit je einem Satz Begründung. Eine künftig hinzugefügte Spalte lässt den Test rot werden und zwingt zur Entscheidung, statt still durchzurutschen.

Das Testdouble ist da: [recurrence.test.ts](../../../features/calendar/recurrence.test.ts) hat mit `fakeUpdateClient` bereits einen Fake-Supabase-Client, der `table`, Payload und `eq`-Aufrufe mitschreibt. Ein `fakeInsertClient` daneben ist dieselbe Bauform.

**Warum die Ops-Ebene und nicht `applyEditScope`:** die vorhandenen Split-Tests mocken `EventOps` — die Auslassung liegt unterhalb dieser Grenze und ist von dort aus grundsätzlich nicht sichtbar.

### 3.3 Dieselbe Invariante, zweite Stelle

[createMutation.ts](../../../features/calendar/createMutation.ts) trägt die Regel bereits als Kommentar, aber ohne Test:

> Die Feldliste spiegelt bewusst den `insert` in `createEvent` direkt darüber: Weicht sie ab, zeigt der Kalender etwas anderes an, als gleich gespeichert wird.

`createEvent` und `optimisticEventRow` kommen in denselben Helfer. Drei Schreiber, eine Prüfung. Das zahlt sich in PR 3 sofort aus: die neue Spalte `timezone` muss in allen dreien landen, und der Test sagt es, statt dass es jemand merken muss.

### 3.4 Nicht in diesem PR

`reminders` hängen an `event_id`; die abgespaltene Serienhälfte erbt keine. Das ist derselbe Fehlertyp, aber eine andere Tabelle und eine andere Entscheidung (kopieren oder nicht?). Kommt als Eintrag nach `docs/TODO.md`.

---

## 4. PR 2 — „Alle Termine" verschiebt den Serienstart

### 4.1 Der Schaden

`applyEditScope`s letzter Zweig schreibt `changes.start_at` unbedingt auf die Master-Zeile. `changes.start_at` ist aber aus `EventEditScreen`s `range.startAt` gebaut, hydriert mit dem Datum der **bearbeiteten Occurrence**. Da `buildRule` `dtstart` aus derselben Spalte ableitet, wandert der Serienanker mit.

Nachgestellt — Serie ab `2026-06-01`, bearbeitet wird die Occurrence vom `2026-08-03`:

```
vorher : 14 Vorkommen, erstes 2026-06-01
nachher:  5 Vorkommen, erstes 2026-08-03
→ 9 Vorkommen serverseitig weg, ohne Fehler oder Meldung
```

Trägt die Serie ein `rrule_count`, verschiebt sich zusätzlich das Zählfenster, weil COUNT relativ zu `dtstart` läuft.

### 4.2 Die Regel: `all` verankert nie neu, `forward` immer

```
scope === "all" auf einer Serie:
    start_at = Datum von master.start_at + Uhrzeit von changes.start_at
    end_at   = start_at + (changes.end_at − changes.start_at)

scope === "all" auf einem Einzeltermin:
    changes literal — dort verschiebt eine Datumsänderung den Termin tatsächlich
```

Das ist Zeile für Zeile dasselbe, was `applyOptimisticChanges` in [optimisticEvents.ts](../../../features/calendar/optimisticEvents.ts) für die Anzeige schon tut (`withTimeOfDay`, dann Dauer addieren). Nach dem Fix sagen Anzeige und Schreibpfad dasselbe; heute widersprechen sie sich, und die Anzeige hat recht.

### 4.3 Zwei Zweige, die _nicht_ betroffen sind

`scope === "forward"` fällt in zwei Fällen auf denselben `updateMaster`-Aufruf:

- `master.rrule_count != null` und `consumed === 0`
- `cutoff < dateOnly(master.start_at)`

Beide heißen: der Schnitt liegt am oder vor dem Serienanfang, die „Schwanzhälfte" ist die ganze Serie. Ein Neu-Verankern ist dort die **Bedeutung** von „ab diesem Termin", nicht ein Fehler. Diese Fälle behalten die Literalwerte.

Daraus folgt eine Konsequenz für die Umsetzung: der Merge darf **nicht** am Zweig festgemacht werden (`if (scope === "all")` am Ende der Funktion), weil beide Forward-Fälle durch denselben Code laufen. Er gehört als expliziter Parameter an die Stelle, die den Scope kennt — etwa eine lokale `anchoredChanges(master, changes, isRecurring)`-Hilfsfunktion, die nur der echte `all`-Pfad und der `recurrence`-Pfad aufrufen.

### 4.4 Der `recurrence`-Zweig gehört dazu

Eine Regeländerung erzwingt Scope „alle" (`EventEditScreen.onSave`) und ruft `updateMaster(eventId, changes, …, recurrence)` — derselbe unbedingte Schreibvorgang, derselbe Schaden. Dass die Serie ohnehin neu definiert wird, ändert nichts daran: die Vorkommen vor der bearbeiteten Occurrence verschwinden trotzdem.

Nebenwirkung, die bewusst hingenommen wird: `buildRecurrenceChanges` leitet `rrule_byweekday` aus dem Formular-`startAt` ab, also aus dem Wochentag der bearbeiteten Occurrence. Bleibt `dtstart` auf dem alten Datum, können Anker und Wochentagsliste auf verschiedene Wochentage zeigen. `rrule` behandelt `dtstart` dann als reinen Startpunkt und liefert das erste Vorkommen am nächsten passenden Wochentag — kein Datenverlust, nur ein um wenige Tage späterer Serienbeginn.

### 4.5 Was der Nutzer verliert

Ändert jemand bei Scope „alle" das **Datum**, wird diese Änderung verworfen. Das ist die bewusst getroffene Entscheidung (siehe §9, Decision 3): stumm eine Datumsangabe fallenzulassen ist ungleich billiger als stumm neun Vorkommen zu löschen, und die Anzeige verspricht ohnehin schon das Verworfene. Ein sichtbarer Hinweis bräuchte einen neuen Copy-Key und damit den Designer — der Eintrag geht nach `docs/TODO.md` und in das 🎨-Paket der Roadmap.

### 4.6 Tests

In [recurrence.test.ts](../../../features/calendar/recurrence.test.ts), gegen `EventOps`-Mocks:

1. `scope=all` auf einer Serie, Occurrence später als `dtstart`, geänderte Uhrzeit → `updateMaster` bekommt das **Datum des Masters** und die **neue Uhrzeit**.
2. Dasselbe mit geänderter Dauer → `end_at − start_at` bleibt die neue Dauer.
3. `scope=all` auf einem Einzeltermin → `changes` unverändert durchgereicht.
4. `scope=forward`, `consumed === 0` → `changes` unverändert (kein Merge).
5. `scope=forward`, `cutoff < dtstart` → `changes` unverändert.
6. `recurrence`-Zweig → derselbe Merge wie in (1).

Dazu ein Test in `expand.test.ts`, der das Ganze abschließend prüft: Master vor und nach dem Merge durch `expandEvents` schicken und zeigen, dass die Anzahl der Vorkommen im Fenster gleich bleibt.

---

## 5. PR 3 — Zeitumstellung und `events.timezone`

### 5.1 Warum eine Spalte und nicht die Gerätezone

Die Regel braucht eine Zone, in der ihre Wanduhrzeit gilt. Die Gerätezone zu nehmen wäre billiger, ist aber der falsche Ort: sie beschreibt, **wo der Leser gerade ist**, nicht **wo die Serie verankert wurde**. Zwei Konsequenzen, die die Spalte rechtfertigen:

- Verreist ein Elternteil, wechselt seine Gerätezone. Ohne Spalte änderte sich damit die Auswertung derselben Serie — für diesen Client, nicht für den anderen. Zwei Geräte zeigten unterschiedliche Termine.
- Der Server (künftiger Reminder-Worker, pg_cron) hat gar keine Gerätezone. Ohne Spalte könnte er die Serie nicht auswerten.

Die Spalte ist damit die Sorte Entscheidung, die man einmal trifft und nie zurücknimmt.

### 5.2 Die Migration

Neue Datei, idempotent, Hausstandard.

```sql
alter table public.events
  add column if not exists timezone text not null default 'Europe/Berlin';

alter table public.events
  drop constraint if exists events_timezone_iana;
alter table public.events
  add constraint events_timezone_iana
  check (timezone ~ '^(UTC|[A-Za-z_]+(/[A-Za-z0-9_+-]+){1,2})$');

comment on column public.events.timezone is
  'IANA-Zone, in der die Wanduhrzeit dieses Termins und seiner RRULE gilt. '
  'Bestimmt die Auswertung über Zeitumstellungen hinweg; die Anzeige rechnet '
  'daraus in die Zone des Lesers um. Siehe ADR-032.';
```

Zum Check: eine Prüfung gegen `pg_timezone_names` wäre genauer, aber als Subquery in einem `CHECK` nicht erlaubt und als Funktion nicht `immutable`. Der Regex fängt Tippfehler und leere Strings; die eigentliche Gültigkeit garantiert der Client, der die Zone aus dem Betriebssystem liest. Diese Begründung gehört als Kommentar neben den Constraint.

`default 'Europe/Berlin'` backfillt die Bestandszeilen. Das ist für eine DE-primäre App die einzige Zone, die nicht geraten ist — jede Alternative (aus `start_at` ableiten, NULL zulassen) wäre schlechter.

Danach `features/supabase/database.types.ts` neu generieren.

### 5.3 `features/calendar/timezone.ts` — neues Modul

Drei Funktionen, mit Tests, ohne neue Dependency:

```ts
/** Offset der Zone zu diesem Zeitpunkt, in Millisekunden. */
zoneOffsetMs(instant: Date, timeZone: string): number

/** Instant → Wanduhrzeit, als „floating" Date (Wandzeit in den UTC-Komponenten). */
instantToFloating(instant: Date, timeZone: string): Date

/** Wanduhrzeit → Instant. Zweistufig, damit ein Übergang nicht danebengreift. */
floatingToInstant(floating: Date, timeZone: string): Date
```

`zoneOffsetMs` liest `Intl.DateTimeFormat(…, { timeZone }).formatToParts`, baut daraus ein `Date.UTC` und zieht den Instant ab. `floatingToInstant` braucht zwei Durchläufe, weil der Offset selbst vom gesuchten Zeitpunkt abhängt: erst mit dem Offset an der Wandzeit schätzen, dann mit dem Offset an der Schätzung korrigieren.

Die beiden Grenzfälle bekommen je einen Test und je einen Satz im Docstring:

- **Sprung-Lücke** (29.03., 02:00–03:00 existiert nicht): die Wandzeit 02:30 hat keinen Instant. Ergebnis ist 03:30 — die Richtung, die der Nutzer erwartet, und dieselbe, die `new Date(y, m, d, 2, 30)` lokal wählt.
- **Doppelte Stunde** (25.10., 02:00–03:00 zweimal): die Wandzeit 02:30 hat zwei Instants. Genommen wird der **erste** (noch Sommerzeit), weil ein Termin, der vor der Umstellung angelegt wurde, in deren Regime gemeint war.

### 5.4 `rrule.ts` — neuer Vertrag

Das Floating verlässt das Modul nicht. `buildRule` wird intern; exportiert werden:

```ts
occurrencesBetween(row: EventRow, from: Date, to: Date): Date[]
allOccurrences(row: EventRow): Date[]
```

Innen:

1. `dtstart` = `instantToFloating(new Date(row.start_at), row.timezone)`
2. `until` = ebenso, falls gesetzt
3. `from`/`to` ebenso gefloatet
4. `rrule` iteriert damit in reiner Wandzeit — die Bibliothek rechnet absolut, und absolute Arithmetik auf Wandzeit ist genau das Richtige: über eine Umstellung hinweg bleibt „18:00" stehen
5. jedes Ergebnis zurück durch `floatingToInstant`

`tzid` wird **nicht** gesetzt (§1.1).

Aufrufer sind zwei: `expandRecurrence` in [expand.ts](../../../features/calendar/expand.ts) und `consumedBefore` in [recurrence.ts](../../../features/calendar/recurrence.ts). Beide bekommen echte Instants zurück und dürfen ihre lokalen Getter behalten.

### 5.5 Die Dauer muss in Wandzeit gerechnet werden

`expandEvents` berechnet heute `durationMs = masterEnd − masterStart` absolut und addiert sie auf jeden Occurrence-Start. Für einen einstündigen Termin ist das gleichwertig. Für einen **mehrtägigen**, der eine Umstellung überspannt, nicht: das Ende verschöbe sich um eine Stunde gegen die Wandzeit.

Die Dauer wird deshalb ebenfalls in Floating-Raum genommen und das Ende erst danach zurückgerechnet. Ein Test deckt genau diesen Fall ab (Vorkommen Fr → Mo über den 25.10.).

### 5.6 `setRruleUntil` schreibt heute ein nacktes Datum

`applyDeleteScope`/`applyEditScope` rufen `ops.setRruleUntil(eventId, dayBefore(occurrenceDate))` mit einem `yyyy-MM-dd`-String in eine `timestamptz`-Spalte. Postgres castet ihn in der Session-Zone (UTC) zu Mitternacht. Unter der neuen Zonenauswertung liegt der Schnitt damit bei 02:00 Ortszeit statt am Tagesende — ein Vorkommen am Cutoff-Tag um 18:00 fiele heraus.

Dass es heute nicht auffällt, liegt allein daran, dass `dayBefore` bei den üblichen wöchentlichen Serien auf einen Tag ohne Vorkommen zeigt. Bei einer täglichen Serie fällt es sofort auf.

`setRruleUntil` bekommt deshalb einen expliziten Tagesende-Instant in der Zone des Termins. Die Signatur wechselt von „Datumsstring" zu „ISO-Instant"; `applyDeleteScope`/`applyEditScope` rechnen ihn aus `dayBefore(occurrenceDate)` und `master.timezone`.

### 5.7 Der Create-Pfad

`CreateEventVars` bekommt `timezone`. Gespeist wird sie beim Anlegen aus der Gerätezone:

```
expo-localization → getCalendars()[0].timeZone
   ↓ (null)
Intl.DateTimeFormat().resolvedOptions().timeZone
   ↓ (leer)
"Europe/Berlin"
```

`expo-localization` ist bereits Dependency ([features/i18n/index.ts](../../../features/i18n/index.ts) nutzt `getLocales`). Die Zone ist im Formular **nicht sichtbar** — V1 nimmt an, dass der Anlegende in der Zone lebt, in der der Termin stattfindet. Ein Zonen-Picker wäre ein eigenes Feature und geht als TODO-Eintrag ab.

`createEvent` **und** `optimisticEventRow` schreiben das Feld. Der Feldlisten-Test aus PR 1 erzwingt das, statt es dem Gedächtnis zu überlassen.

### 5.8 Risiko: `Intl` unter Hermes

Das Repo nutzt heute an keiner Stelle `Intl` zur Laufzeit — das neue Modul ist die erste. `Intl.DateTimeFormat` mit `timeZone` und `formatToParts` muss auf iOS **und** Android tatsächlich funktionieren; unter Bun zu bestehen beweist dafür nichts.

**Das ist Task 0 des PRs**, vor jeder anderen Zeile: eine Gegenprobe am Simulator und am Emulator, die eine bekannte Zone durch `zoneOffsetMs` schickt und den Offset an einem Sommer- und einem Winterdatum prüft.

Fällt sie aus, ist `@formatjs/intl-datetimeformat` samt Zonendaten der von Expo dokumentierte Ausweg. Das änderte das Innere von `timezone.ts` und die Bundle-Größe, nicht den Rest des Entwurfs — deshalb steht die Prüfung am Anfang und nicht am Ende.

### 5.9 Tests

- `timezone.ts`: Offset an einem Sommer- und einem Winterdatum · Rundlauf `instant → floating → instant` · Sprung-Lücke · doppelte Stunde.
- `rrule.ts`: wöchentliche Serie über den 25.10. **und** über den 29.03., je mit `TZ` des Runners auf `Europe/Berlin`, `UTC` und einer dritten Zone — der Test muss unabhängig von der Runner-Zone dasselbe liefern. Genau das ist die Eigenschaft, die `tzid` nicht hat.
- `expand.test.ts`: die Uhrzeit einer Serie bleibt über beide Umstellungen konstant; ein mehrtägiges Vorkommen über den 25.10. behält seine Wandzeit-Dauer.
- `recurrence.test.ts`: `setRruleUntil` bekommt einen Tagesende-Instant, nicht ein nacktes Datum.

Die bestehenden Fixtures nutzen explizite UTC-Zeitstempel mit dem Kommentar „rrule computes in UTC, so a local-time fixture would drift with the runner's timezone". Dieser Kommentar wird mit dem PR unrichtig und muss mitgezogen werden.

---

## 6. PR 4 — Das Override-Modell

### 6.1 Zwei Namen für zwei Dinge

`CalendarOccurrence` bekommt neben `occurrenceDate` ein zweites Feld:

```ts
/** Das Datum, das die Regel erzeugt hat. Schlüssel von `event_exceptions.occurrence_date`. */
occurrenceKey: string;
/** Das Datum, an dem die Occurrence tatsächlich liegt — nach Anwendung des Overrides. */
occurrenceDate: string;
```

Ohne Override sind beide gleich; das ist der Normalfall und bleibt unverändert.

**Auf `occurrenceKey` schlüsseln** — überall dort, wo eine Zeile in `event_exceptions` gemeint ist:

| Stelle                                                    | heute     | danach          |
| --------------------------------------------------------- | --------- | --------------- |
| `occurrenceVersion(row, …)`                               | aufgelöst | `occurrenceKey` |
| Route-Parameter `occ` (Detail, Edit)                      | aufgelöst | `occurrenceKey` |
| `useEvent(id, occ)` — `find`                              | aufgelöst | `occurrenceKey` |
| `DeleteEventVars`/`UpdateEventVars`                       | aufgelöst | `occurrenceKey` |
| `modifyOccurrence`, `cancelOccurrence`                    | aufgelöst | `occurrenceKey` |
| `consumedBefore`, `deleteExceptionsFromDate`, `dayBefore` | aufgelöst | `occurrenceKey` |
| `pendingDeletes`, Optimistic-Store                        | aufgelöst | `occurrenceKey` |

**Auf `occurrenceDate` bleiben** — alles, was den Termin _zeigt_: Rasterplatzierung und Tagesliste ([spans.ts](../../../features/calendar/spans.ts) → `DaySegment.date`), Sortierung, `tomorrowPrep`s Anzeigedatum.

**Identität ist `occurrenceKey`, nicht `occurrenceDate`.** Das betrifft drei Stellen, die heute das aufgelöste Datum als Anker benutzen:

- `groupSpans` in `spans.ts` (`${eventId}-${occurrenceDate}`)
- die React-Keys in `KalenderScreen.tsx` und `DashboardScreen.tsx` (`${eventId}-${occurrenceDate}-${date}`)
- der Key in `tomorrowPrep.ts` (`event-${eventId}-${occurrenceDate}`)

Alle drei müssen auf `occurrenceKey` wechseln, und zwar aus einem konkreten Grund: Ein Override kann eine Occurrence auf einen Tag schieben, an dem **die Serie ohnehin stattfindet** — die verschobene 29.06. landet auf dem 06.07., wo das reguläre Vorkommen bereits liegt. Beide trügen dann dasselbe aufgelöste Datum, der Key kollidierte, und eine der beiden verschwände aus der Liste. Der `spans.ts`-Kommentar nennt genau diese Klasse („Two occurrences of the same series can share a day…") und verlässt sich dafür heute auf `occurrenceDate` als Anker — der ist es nach diesem PR nicht mehr. Der Docstring an `DaySegment`, der `occurrenceDate` ausdrücklich zum „series anchor" und zum „key behind `event_exceptions.occurrence_date`" erklärt, wird damit unrichtig und muss mit.

**Wer `CalendarOccurrence` baut**, muss das Feld setzen: `expandEvents` ([expand.ts](../../../features/calendar/expand.ts)) und die Fixtures in [sample.ts](../../../features/calendar/sample.ts). `applyOptimisticChanges` erbt es über den Spread — und darf es, anders als `occurrenceDate`, **nicht** neu berechnen: eine optimistisch verschobene Occurrence wandert im Raster, bleibt aber dieselbe Exception-Zeile.

### 6.2 Die Kandidatenmenge

`expandRecurrence` liefert heute ausschließlich, was `rule.between()` erzeugt. Neu:

```
candidates = { Regel-Vorkommen im gefensterten Bereich }
           ∪ { Exception-Kandidaten }

Ein Exception-Kandidat entsteht für jede Exception mit
  action = 'modified'
  UND override.start_at gesetzt
  UND das überschriebene Intervall schneidet das Fenster
  UND ihr occurrence_date ist ein echtes Vorkommen der Regel
  UND ihr occurrence_date liegt nicht schon in der Regel-Menge

Dedupliziert wird auf occurrence_date (= occurrenceKey).
```

Die vierte Bedingung ist nicht Vorsicht ohne Anlass: verwaiste Exceptions können den Löschpfad überleben (`deleteAllExceptions` läuft nur, wenn `ruleDiffers`; `deleteExceptionsFromDate` nur ab dem Schnitt). Ohne die Prüfung erzeugte eine solche Zeile einen Phantom-Termin an einem Datum, an dem die Serie gar nicht stattfindet. Geprüft wird sie mit einem `occurrencesBetween(row, tagesbeginn, tagesende)` — ein zusätzlicher rrule-Aufruf pro verschobener Exception, und verschobene Exceptions sind selten.

Der Basiswert für einen Exception-Kandidaten ist die Wandzeit des Masters am `occurrence_date`; `applyOverride` ersetzt Start und Ende ohnehin vollständig, sonst gäbe es den Kandidaten nicht.

### 6.3 `applyOverride` kennt `description`

Der Spalten-Comment der Migration nennt den Key seit dem ersten Tag:

> Recognised keys: title, description, start_at, end_at, location.

`applyOverride` liest ihn nicht, `Resolved` führt das Feld nicht, und `expandEvents` nimmt `description` deshalb immer von der Master-Zeile. Der Server legt eine geänderte Beschreibung folgerichtig ins Override-JSON, wo sie nie wieder gelesen wird — ein stiller Verlust derselben Klasse.

Mit dem Fix fällt zugleich die Sonderbehandlung in `applyOptimisticChanges` weg, die `description` heute absichtlich verschluckt („Sie hier zu zeigen hieße, sie eine Sekunde später vom Refetch wegnehmen zu lassen"). Der Kommentar dort wird unrichtig und muss mit.

### 6.4 Was das behebt

| Symptom                                                  | behoben durch |
| -------------------------------------------------------- | ------------- |
| Verschobene Occurrence ist an beiden Daten unsichtbar    | §6.2          |
| Versions-Token übersieht die inhaltsgebende Exception    | §6.1          |
| Zweites Bearbeiten bleibt wirkungslos, meldet Erfolg     | §6.1          |
| Löschen einer verschobenen Occurrence bleibt wirkungslos | §6.1          |
| Geänderte Beschreibung wird nie angezeigt                | §6.3          |

### 6.5 Tests

In `expand.test.ts` — jeder Fall ist der nachgestellte Befund aus §1.2:

1. Verschobene Occurrence erscheint im Fenster ihres **aufgelösten** Datums.
2. Sie erscheint **nicht** im Fenster ihres Regel-Datums.
3. Sie erscheint in einem Fenster, das beide Daten enthält, genau **einmal**.
4. Ihr `occurrenceKey` ist das Regel-Datum, ihr `occurrenceDate` das aufgelöste.
5. Eine verwaiste Exception an einem Nicht-Vorkommen erzeugt **keinen** Kandidaten.
6. `description` aus dem Override gewinnt gegen die Master-Zeile.
7. Eine Occurrence, die per Override auf den Tag eines **regulären** Vorkommens geschoben wird, ergibt zwei Einträge mit gleichem `occurrenceDate` und verschiedenem `occurrenceKey` — der Kollisionsfall aus §6.1.

In `spans.test.ts`: derselbe Fall durch `toDaySegments`/`toDayMarkings` — beide Occurrences überleben die Gruppierung.

In `version.test.ts`: das Token einer verschobenen Occurrence enthält den `updated_at`-Stempel ihrer Exception.

In `recurrence.test.ts`: `modifyOccurrence` und `cancelOccurrence` bekommen den `occurrenceKey`, nicht das aufgelöste Datum.

### 6.6 Migrationsfrage für Bestandsdaten

Zeilen, die unter dem alten Verhalten entstanden sind — eine zweite, wirkungslose Exception am aufgelösten Datum —, bleiben nach dem Fix wirkungslos: ihr `occurrence_date` ist kein Vorkommen der Regel, die Prüfung aus §6.2 hält sie draußen. Sie sind Datenmüll, aber harmlos. **Keine Datenmigration.** Ein Aufräum-Statement ginge nur mit einer serverseitigen RRULE-Auswertung, die es nicht gibt.

---

## 7. Was diese Iteration nicht liefert

- **Keine Transaktionalität.** `deleteAllExceptions` vor `updateMaster` bleibt ein Verlustfenster, die fünf unbedingten Schreib-Ops bleiben unbedingt. Das ist Block 7 (Transaktions-RPC) und hat eine eigene Spec verdient.
- **Kein Zonen-Picker** im Formular. Die Zone kommt vom Gerät und ist unsichtbar.
- **Kein Hinweis**, wenn eine Datumsänderung unter Scope „alle" verworfen wird — braucht einen Copy-Key vom Designer.
- **Kein `all_day`-Toggle** im Bearbeiten-Formular. Er erweitert denselben Override-Vertrag, braucht aber einen `cal.edit.*`-Copy-Key und ist damit 🎨-blockiert.
- **Keine Reminder-Übernahme** in die abgespaltene Serienhälfte.

Alle fünf gehen als Einträge nach `docs/TODO.md`.

---

## 8. Folgen für die Dokumentation

| Datei                                                             | Änderung                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [docs/decision-log.md](../../decision-log.md)                     | **ADR-032** — Zonenmodell (Spalte statt Gerätezone, Floating-Auswertung, warum `tzid` ausscheidet) und Occurrence-Schlüssel (`occurrenceKey` vs. `occurrenceDate`)                                                                                                     |
| [CLAUDE.md](../../../CLAUDE.md)                                   | `features/calendar/`-Beschreibung: `timezone.ts` ergänzen, `rrule.ts`-Vertrag nennen                                                                                                                                                                                   |
| [docs/architecture.md](../../architecture.md)                     | Kalender-Datenfluss: die zwei Datumsbegriffe benennen                                                                                                                                                                                                                  |
| [docs/TODO.md](../../TODO.md)                                     | fünf Einträge entfernen, fünf neue anlegen (§7)                                                                                                                                                                                                                        |
| [docs/roadmap.md](../../roadmap.md)                               | Block 1 abhaken; den `tzid`-Vorschlag in 1.4 korrigieren, damit er niemanden erneut in die Irre führt                                                                                                                                                                  |
| `version.ts`, `optimisticEvents.ts`, `spans.ts`, `expand.test.ts` | Docstrings/Kommentare, die durch den Fix unrichtig werden — namentlich `DaySegment` („series anchor"), `occurrenceVersion` („das **aufgelöste** Datum"), `applyOptimisticChanges` („`description` … kennt es nicht") und der Fixture-Kommentar „rrule computes in UTC" |

---

## 9. Decisions

1. **Reihenfolge 1.1 → 1.2 → 1.4 → 1.3.** Der Zonen-PR schreibt den `rrule.ts`-Vertrag; der Override-PR baut darauf. Andersherum entstünde die Kandidaten-Logik gegen falsche Regel-Daten.

2. **`tzid` scheidet aus.** `rrule@2.8.1` rechnet `targetOffset − localOffset` und ist nur bei Prozess-TZ UTC korrekt — in einer RN-App also nie. Stattdessen: Floating-Auswertung, gekapselt in `rrule.ts`.

3. **`all` verankert nie neu, `forward` immer.** Bei Scope „alle" behält der Master sein Datum und übernimmt nur die Uhrzeit; die Datumsänderung wird verworfen. Das deckt sich mit dem, was das optimistische Overlay heute schon anzeigt.

4. **Die Zone ist eine Spalte, nicht die Gerätezone.** Sonst wertete dasselbe Ereignis auf zwei Geräten verschieden aus, und ein serverseitiger Reminder-Worker könnte es gar nicht.

5. **Regel-Datum und aufgelöstes Datum bekommen zwei Namen.** Alles, was eine `event_exceptions`-Zeile meint, schlüsselt auf `occurrenceKey`; alles, was den Termin zeigt, auf `occurrenceDate`.

6. **Ein Exception-Kandidat entsteht nur an einem echten Vorkommen der Regel.** Verwaiste Exceptions dürfen keine Phantom-Termine erzeugen.

7. **`description` kommt in den Override-Vertrag, `all_day` nicht.** Ersteres ist reine Code-Arbeit — die Spalten-Doku nennt den Key längst. Zweiteres braucht einen Copy-Key und damit den Designer.

8. **Keine Datenmigration für Alt-Exceptions.** Sie sind nach dem Fix wirkungslos und harmlos; sie aufzuräumen bräuchte eine serverseitige RRULE-Auswertung, die es nicht gibt.

9. **`Intl`-Verfügbarkeit unter Hermes ist Task 0 von PR 3.** Sie am Ende zu prüfen hieße, den PR fertig zu bauen, bevor bekannt ist, ob sein Fundament trägt.

---

## 10. Definition of Done

Je PR:

- Ein Regressionstest, der **vor** dem Fix rot ist — vorgeführt, nicht behauptet.
- `bun run typecheck`, `bun lint`, `bun test`, `bun format:check` grün.
- Sichtprüfung der Serienbearbeitung am Simulator. Web reicht hier nicht: der Termin-Löschpfad ist auf react-native-web gar nicht auslösbar (`Alert.alert` ist dort ein No-op) — das ist Block 3.
- `docs/TODO.md` im selben Commit gepflegt: erledigte Einträge gelöscht, neue Grenzen angelegt.
- Lokaler CodeRabbit-Durchlauf (`coderabbit review --base main`) vor dem Öffnen des PRs.

Für den Block:

- Eine Serie über beide Zeitumstellungen zeigt durchgehend dieselbe Uhrzeit.
- Eine verschobene Occurrence ist an ihrem neuen Datum sichtbar, ein zweites Mal änderbar und löschbar.
- Ein Speichern mit „Alle Termine" auf einer laufenden Serie verliert kein vergangenes Vorkommen.
- Eine mit „Ab diesem Termin" abgespaltene Serienhälfte behält ihre Personenzuordnung.
