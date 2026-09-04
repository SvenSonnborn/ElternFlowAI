# Conflict-Detection: `updated_at` beleben, Vergleich vor dem Schreiben — Design

**Status:** Approved (Brainstorming Phase)
**Date:** 2026-09-04
**Issue:** [#52](https://github.com/SvenSonnborn/ElternFlowAI/issues/52) — „Realtime: Zwei-Client-Test und Conflict-Detection V1"
**Decision-Log:** wird als ADR-031 referenziert nach Implementation; ergänzt [ADR-030](../../decision-log.md), löst nichts ab

---

## 1. Context

[ADR-030](../../decision-log.md) (Issue #51) hat den Live-Sync geliefert: Ein `after`-Trigger sendet Zeilenänderungen an `events` und `event_exceptions` per `realtime.broadcast_changes()` auf das private Topic `family:<familyId>`, [features/realtime/](../../../features/realtime/) hängt als Sync-Schicht darüber, Kalender und Dashboard aktualisieren sich von selbst. Der letzte Absatz jenes ADRs benennt, was offen blieb:

> **Conflict-Detection bleibt offen.** Zwei gleichzeitige Edits derselben Zeile gewinnt weiterhin der letzte Schreiber; das ist #52.

Das ist dieses Issue. Es ist die dritte und letzte der drei Realtime-Iterationen (#50 → #51 → **#52**).

Der Auftrag nennt vier Punkte: Testsetup mit zwei Clients, Änderung in A und Prüfung in B, „Konflikt-Detection: `updated_at`-Vergleich vor Update", Toast/Alert bei Konflikt. Drei seiner Annahmen tragen so nicht.

| Annahme                                           | Realität                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| „`updated_at`-Vergleich" ist Client-Arbeit        | **`events.updated_at` wird nie hochgezählt.** Die Spalte existiert seit [20260529091933_calendar.sql](../../../supabase/migrations/20260529091933_calendar.sql) mit `default now()`, aber kein Trigger fasst sie an — geprüft gegen `pg_trigger` der laufenden Datenbank: auf `events` hängt allein `broadcast_events_changes`. Der Vergleich schlüge heute **nie** an. Die Vorbedingung ist eine Migration (§2). |
| Ein Vergleich auf `events` deckt einen Termin ab  | `event_exceptions` hat gar kein `updated_at` — nur `created_at`. Der Scope „Nur diesen Termin" schreibt aber genau dorthin (`modifyOccurrence`). Ohne Spalte **und** Trigger bliebe der bei Serien häufigste Pfad ungeschützt (§2, §3).                                                                                                                                                                           |
| „Toast/Alert bei Konflikt" — im Screen anzuzeigen | `EventEditScreen.onSave` ruft `goBackOrToKalender()` **vor** `save(vars)` ([EventEditScreen.tsx:236](../../../app-sections/event/EventEditScreen.tsx)). Das Sheet ist unmontiert, bevor der Server antwortet; ein Dialog als lokaler State würde nie gezeichnet. Er braucht einen Wirt im Root-Layout (§5).                                                                                                       |
| „Abhängigkeit: Subscription in `useFamilyEvents`" | Die Subscription liegt seit ADR-030 Decision 5 in `useFamilyRealtime` im Root-Layout, nicht in `useFamilyEvents`. Die Abhängigkeit besteht inhaltlich — der Live-Sync ist es, der die fremde Fassung überhaupt sichtbar macht —, nur nicht an der genannten Stelle.                                                                                                                                               |

### Zielbild

Zwei Elternteile haben denselben Termin gleichzeitig im Bearbeiten-Sheet. A speichert zuerst. Wenn B danach speichert, **überschreibt B nicht mehr stillschweigend**: B sieht einen Dialog, der Feld für Feld nebeneinanderstellt, was jetzt gespeichert ist und was B geschrieben hat, und entscheidet. Ändert A etwas, das B gar nicht anfasst, passiert nichts — B speichert durch. Dasselbe gilt für Aufgaben. Beim Löschen greift derselbe Guard, meldet sich aber als Toast, weil dort kein Formular mehr steht, das zu vergleichen wäre.

---

## 2. Die Migration

Eine idempotente Datei. Drei Dinge.

### 2.1 Die Trigger-Funktion

```sql
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
```

Zwei Eigenschaften, die als Kommentar ins SQL gehören:

- **Kein `security definer`.** Anders als `broadcast_family_change` fasst diese Funktion nur `NEW` an und schreibt in keine fremde Tabelle. Erhöhte Rechte wären hier ausschließlich Angriffsfläche.
- **`set search_path = ''`** bleibt trotzdem gesetzt, weil es Hausstandard ist; `now()` liegt in `pg_catalog` und wird auch bei leerem Suchpfad implizit gefunden.

### 2.2 `before update`, nicht `after`

```sql
drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at
before update on public.events
for each row execute function public.set_updated_at();
```

Analog auf `public.tasks` und `public.event_exceptions`.

`before` ist nicht Geschmackssache. Ein `after`-Trigger sieht die Zeile, nachdem sie geschrieben wurde; sein `NEW` zu ändern hat keine Wirkung mehr. Und die Reihenfolge zu ADR-030 fällt damit richtig aus: Postgres führt alle `before row`-Trigger vor allen `after row`-Triggern aus, also läuft `set_updated_at` **vor** `broadcast_family_change`. Der Broadcast trägt das neue `updated_at` bereits in `record` — was heute niemand liest, aber der Vertrag ist damit ohne weiteres Zutun konsistent.

### 2.3 Die neue Spalte

```sql
alter table public.event_exceptions
  add column if not exists updated_at timestamptz not null default now();
```

**Kein Backfill.** Bestandszeilen in `events` und `tasks` tragen ein `updated_at`, das faktisch ihr `created_at` ist; neue `event_exceptions`-Zeilen bekommen `now()`. Beides ist folgenlos, weil die Basis-Version **immer** aus der Zeile stammt, die der Client gerade gelesen hat: Der erste Vergleich ist per Konstruktion konsistent, egal welcher Wert dort steht, und ab dem ersten fremden Schreibvorgang bewegt sich der Wert.

`families`, `parents` und `children` tragen dasselbe tote `updated_at`. Sie bleiben draußen — kein Schreibpfad dieser Iteration berührt sie —, und der Befund geht in `docs/TODO.md`.

---

## 3. Das Versions-Token

`features/calendar/version.ts`:

```ts
export function occurrenceVersion(row: EventWithRelations, occurrenceDate: string): string;
//  → `${row.updated_at}|${exception(occurrenceDate)?.updated_at ?? "-"}`
```

Das Token deckt **genau die Zeilen ab, die dieses Speichern anfassen wird**: die Master-Zeile und die Exception an diesem Datum. Zwei Alternativen wurden verworfen:

- **Nur `events.updated_at`** übersieht jede fremde Änderung am Scope „Nur diesen Termin" — der bei Serien häufigste Fall.
- **Die ganze Serie** (`max` über alle Exceptions) übersieht nichts, meldet aber einen Konflikt, wenn jemand eine _andere_ Occurrence derselben Serie ändert. Dieser Fehlalarm wäre häufiger als der echte Fall, und die Filterung über den Feldvergleich (§4) fängt ihn nicht ab: Die fremde Änderung an Occurrence _12. Januar_ ändert nichts an der Auflösung des _5. Januar_, wohl aber die eigene Eingabe — der Vergleich fände also sehr wohl Abweichungen und zeigte den Dialog.

`CalendarOccurrence` bekommt `version: string`, gesetzt in [expand.ts](../../../features/calendar/expand.ts) mit derselben Funktion und demselben Schlüssel (`occurrenceDate` nach Auflösung, nicht `lookupDate`). Bei Aufgaben ist die Version schlicht `task.updated_at` — eine Zeile, keine Ausnahmen, kein eigenes Modul.

### Bekannte Lücke

Verschiebt ein Override eine Occurrence auf einen anderen Tag, fallen Versions-Schlüssel (`occurrenceDate`, aufgelöst) und Inhalts-Schlüssel (`lookupDate`, regelerzeugt) auseinander: Eine fremde Änderung an der inhaltsgebenden Exception würde übersehen. Das ist keine neue Eigenheit — `modifyOccurrence` schreibt in diesem Fall ohnehin eine **zweite** Exception-Zeile am neuen Datum, statt die bestehende zu ändern. Der Versions-Schlüssel folgt damit dem, was der Schreibvorgang tut, und die Lücke wird hier erstmals benannt statt eingeführt. Eintrag in `docs/TODO.md`.

---

## 4. Wo geprüft wird

### 4.1 Kalender — Pre-Flight

`updateEvent` und `deleteEvent` lesen den Master ohnehin (`deps.fetchMaster`), weil `applyEditScope`/`applyDeleteScope` ihn für die RRULE-Arithmetik brauchen. Der Vergleich ist damit kostenlos und steht direkt hinter der vorhandenen Existenzprüfung:

```ts
const master = await deps.fetchMaster(vars.eventId);
if (!master) throw new EventNotFoundError(vars.eventId);
if (occurrenceVersion(master, vars.occurrenceDate) !== vars.baseVersion) {
  throw new EventConflictError(master);
}
```

Eine Stelle, alle vier Scopes — auch der mehrstufige Forward-Split, der `updateMaster` gar nicht ruft. Die Fehlerklasse trägt den **rohen `EventWithRelations`-Row**: Der Screen expandiert ihn mit `expandEvents([row], …)` genau so, wie `useEvent` es tut. Keine zweite Auflösungslogik, die von `expand.ts` wegdriften könnte.

`UpdateEventVars` und `DeleteEventVars` bekommen dafür `baseVersion: string`.

### 4.2 Kalender — CAS als Absicherung

Zwischen Lesen und Schreiben liegt ein TOCTOU-Fenster von Millisekunden. `updateMaster` schließt es, wo es vier Zeilen kostet:

```ts
updateMaster: async (eventId, changes, recurrence, seenUpdatedAt) => {
  const { data, error } = await client
    .from("events")
    .update(recurrence ? { ...changes, ...recurrence } : changes)
    .eq("id", eventId)
    .eq("updated_at", seenUpdatedAt)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new EventConflictError(null);
};
```

**`seenUpdatedAt` ist `master.updated_at` aus dem gerade gelesenen Row — nicht `vars.baseVersion`.** Der Unterschied ist der ganze Zweck dieser Absicherung: Der Pre-Flight vergleicht gegen das, was das _Formular_ gesehen hat (Fenster: Minuten), das CAS gegen das, was _dieser Schreibvorgang_ eine Zeile vorher gelesen hat (Fenster: Millisekunden). Mit `vars.baseVersion` prüfte das CAS dieselbe Bedingung zweimal und schlösse das Fenster nicht, das es schließen soll. `applyEditScope` hat `master` bereits in Scope und reicht den Wert an alle drei `updateMaster`-Aufrufstellen durch; `EventOps.updateMaster` bekommt dafür einen vierten Parameter.

Verglichen wird nur der Master-Anteil, nicht das ganze Token aus §3 — `updated_at` ist eine Spalte, `.eq` kann nichts anderes vergleichen. Das genügt, weil dieser Pfad ausschließlich die Master-Zeile schreibt.

`EventConflictError` nimmt entsprechend `EventWithRelations | null`. `null` heißt: erkannt, aber ohne die fremde Fassung zur Hand — der Screen behandelt das als Konflikt ohne Vergleichszeilen (§5.4).

Der Forward-Split (`insertSplitEvent` → `setRruleCount` → `deleteExceptionsFromDate`) und der Exception-`upsert` bekommen **kein** CAS. Der `upsert` trägt kein `.eq`, und den `onConflict`-Vertrag der Unique-Constraint dafür aufzubrechen wäre ein Eingriff in korrekten, getesteten Code für ein Fenster von Millisekunden. Der Pre-Flight deckt beide Pfade.

### 4.3 Aufgaben — CAS als Detektor

`useUpdateTask` liest heute nicht vorher; ein Pre-Flight wäre ein Roundtrip, den niemand zahlt. Die vorhandene `.select("id").maybeSingle()`-Kette bekommt stattdessen `.eq("updated_at", vars.baseVersion)`. Kommen null Zeilen zurück, wird **erst dann** gelesen:

- Zeile weg → der heutige `Error("Task no longer exists")`, unverändert.
- Zeile da → `TaskConflictError(row)`, mit der fremden Fassung für den Vergleich.

Im Normalfall kein zusätzlicher Roundtrip.

### 4.4 Fehlerklassen

`EventConflictError` neben `EventNotFoundError` in [errors.ts](../../../features/calendar/errors.ts), `TaskConflictError` analog in [features/tasks/errors.ts](../../../features/tasks/errors.ts). Beide werden an `name` erkannt, nicht an einer Meldung — dieselbe Begründung, die im Docstring von `EventNotFoundError` steht. Je ein Zweig in `mapEventError`/`mapTaskError` auf `cal.error.conflict` bzw. `hw.error.conflict`.

---

## 5. Der Dialog

### 5.1 Ein Wirt im Root-Layout, ein Store ohne Context

`EventEditScreen.onSave` schließt das Sheet **vor** dem Speichern, damit die optimistische Änderung sofort im Kalender steht (ADR-027). Ein Dialog als lokaler State wäre unmontiert, wenn der Server antwortet. Dieselbe Lehre hat ADR-025 für den Toast gezogen.

Also dieselbe Bauform:

```
app-sections/shared/conflictStore.ts     Zustand-Store, Modulebene, kein Context
app-sections/shared/ConflictDialog.tsx   die Darstellung
app-sections/shared/ConflictDialogHost.tsx   der Wirt, montiert neben <ToastProvider>
```

Der `catch`-Block in `save()` ist eine Closure und überlebt den Unmount — genau wie die Retry-Aktion, die dort heute schon steht. Er expandiert die fremde Fassung (mit dem beim Rendern eingefangenen `theme`), baut die Vergleichszeilen und legt sie in den Store.

### 5.2 Bauform

`Modal transparent` + zentrierte Card auf `theme.overlay` — dieselbe Bauform wie [DateTimePickerSheet.web.tsx](../../../app-sections/shared/DateTimePickerSheet.web.tsx), und damit auf iOS, Android **und Web** identisch. Das ist Voraussetzung, nicht Komfort: `Alert.alert` ist unter react-native-web ein No-Op (`static alert() {}`), der Zwei-Browser-Test aus §7 sähe den Dialog nie.

Nur vorhandene Tokens — `DS.components.card`, `button`, `bottomSheet.scrimColor`. Der Dialog hat kein Pattern-Doc; es wird auch keins erfunden. Touch-Targets ≥ 44.

### 5.3 Zwei Wege, nicht drei

| Aktion                      | Wirkung                                                                                                                                                                                             |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Deine Fassung speichern** | Schickt dieselben `vars` erneut, mit der frischen Version als Basis. Kein `force`-Flag, kein Bypass — ein echter zweiter Versuch, der erneut kollidieren kann, wenn ein Dritter dazwischenschreibt. |
| **Andere Fassung behalten** | Schließt. Der Realtime-Refetch hat die fremde Fassung längst im Kalender; die eigenen Eingaben sind verworfen.                                                                                      |
| Scrim-Tap                   | Wie „behalten". Nichts tun heißt hier: die fremde Fassung gilt.                                                                                                                                     |

Ein drittes „Abbrechen" fällt mit dem zweiten zusammen, sobald das Sheet zu ist — es gibt kein Formular mehr, in das es zurückführen könnte. Echte drei Wege bekäme man nur, indem der Edit-Screen erst nach der Server-Antwort schließt; das nähme dem optimistischen Sofort-Schließen aus ADR-027 seinen Zweck.

### 5.4 Der Vergleich, und wann er ausbleibt

Eine reine Funktion pro Feature entscheidet, was abweicht:

```ts
// features/calendar/conflict.ts
export function differingEventFields(
  theirs: CalendarOccurrence,
  mine: EventChanges,
): EventFieldKey[];
// features/tasks/conflict.ts
export function differingTaskFields(theirs: TaskWithType, mine: TaskChanges): TaskFieldKey[];
```

Sie liefern Schlüssel, keine Zeichenketten. Formatiert wird im Screen, der Locale, Datumsformat und die ohnehin geladenen Kind- und Typ-Listen hat; die Zeilenbeschriftungen sind die vorhandenen `cal.edit.field*`- und `hw.*`-Keys. Der Dialog selbst ist stumpf: er zeichnet `{ label, theirs, mine }[]`.

**Ist die Liste leer, erscheint kein Dialog und der Schreibvorgang läuft durch.** Das ist kein Sonderfall, sondern das, was den Mechanismus benutzbar macht: Ein Versionssprung ohne inhaltliche Abweichung — jemand hat dasselbe geändert, oder etwas, das ich gar nicht anfasse — darf niemanden anhalten. Beim CAS-Fall ohne fremde Fassung (§4.2, `EventConflictError(null)`) gibt es nichts zu vergleichen; dort erscheint der Dialog ohne Zeilen, weil die Alternative — stilles Durchwinken — genau der Fehler wäre, gegen den diese Iteration gebaut ist.

---

## 6. Löschen: Toast statt Dialog

Der Guard aus §4.1 greift in `deleteEvent` unverändert. Die Oberfläche nicht.

Seit ADR-026 löscht die App verzögert: Der Schreibvorgang läuft fünf Sekunden nach dem Tap aus `useFlushPendingDeletes`, der Nutzer ist längst auf einem anderen Screen und hat den Termin nicht mehr vor sich. Ein Feldvergleich hätte dort nichts zu vergleichen, und ein modaler Dialog aus dem Nichts wäre auf einem fremden Screen ein Übergriff.

Stattdessen der Weg, für den `mapEventError` ausdrücklich gebaut wurde (siehe seinen Docstring): der Key `cal.error.conflict` im vorhandenen Fehler-Toast, mit einer Aktion **„Trotzdem löschen"**, die dieselbe Löschung mit frischer Basis-Version wiederholt. Ein Bauteil, das schon steht, statt eines zweiten.

---

## 7. Zwei-Client-Verifikation

`bun run web` auf Port 8081, zwei `launch_persistent_context` (Python-Playwright) mit getrennten User-Data-Dirs. Der Entwickler meldet sich einmal je Kontext selbst an — nach Passwörtern wird nicht gefragt, die Sitzungen überleben weitere Läufe.

| #   | Schritt                                                         | Erwartung                                                                   |
| --- | --------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1   | A und B öffnen denselben Termin im Bearbeiten-Sheet             | beide zeigen dieselbe Fassung                                               |
| 2   | B ändert den Titel und speichert                                | **A sieht die Änderung live im Kalender hinter dem Sheet** (prüft #51 nach) |
| 3   | A ändert den Titel abweichend und speichert                     | Konflikt-Dialog in A, eine Zeile „Titel"                                    |
| 4   | A wählt „Deine Fassung speichern"                               | B aktualisiert sich innerhalb des 300-ms-Sammelfensters                     |
| 5   | Gegenprobe: A wählt „Andere Fassung behalten"                   | A behält Bs Fassung, kein Schreibvorgang                                    |
| 6   | Gegenprobe: B ändert den **Ort**, A ändert den **Titel**        | Dialog mit genau **einer** Zeile „Ort"                                      |
| 7   | A plant eine Löschung, B ändert innerhalb des 5-s-Undo-Fensters | Fehler-Toast in A mit „Trotzdem löschen"                                    |
| 8   | Schritte 1–6 auf einer Aufgabe                                  | gleiches Verhalten                                                          |

Schritt 6 ist der wichtigste: Er prüft, dass der Mechanismus **nicht** anschlägt, wo er nicht soll. Ein Konflikt-Guard, der zu oft meldet, wird weggeklickt und ist dann schlechter als keiner.

> **Korrektur nach dem Lauf.** Die ursprüngliche Erwartung in Zeile 6 lautete „kein Dialog — die Felder überschneiden sich nicht". Sie ist **falsch**: A's Formular schickt den vollen Feldsatz, A's Speichern drehte B's Ortsänderung also tatsächlich zurück — das gehört gemeldet. Richtig ist genau **eine** Zeile („Ort"); A's eigene Titeländerung überschreibt niemanden und darf nicht gelistet werden. Getragen wird das vom dreiwertigen Vergleich (`base`/`mine`/`theirs`), den [ADR-031](../../decision-log.md) Decision 7 beschreibt — §5.4 dieses Dokuments beschreibt noch den zweiwertigen Entwurf. Die Zeile ist oben an Ort und Stelle korrigiert, statt die falsche Erwartung als Falle für den nächsten Leser stehen zu lassen (dieselbe Regel wie ADR-030 Decision 4). Protokoll beider Läufe: [2026-09-04-conflict-detection-verification.md](../plans/2026-09-04-conflict-detection-verification.md).

Screenshots je Schritt; Ergebnis in den ADR.

---

## 8. Tests

Alles unter `bun test`, alles reine Funktionen:

| Datei                                       | Deckt ab                                                                                                                                 |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `features/calendar/version.test.ts`         | `occurrenceVersion`: ohne Exception, mit Exception, mit Exception an anderem Datum                                                       |
| `features/calendar/conflict.test.ts`        | `differingEventFields`: leer bei Gleichheit, je Feld, mehrere Felder                                                                     |
| `features/tasks/conflict.test.ts`           | `differingTaskFields`, dasselbe Raster                                                                                                   |
| `features/calendar/mutations.test.ts`       | `updateEvent`/`deleteEvent` werfen `EventConflictError` bei Versionsabweichung — die Deps sind schon injizierbar (`fetchMaster` + `ops`) |
| `features/calendar/errors.test.ts`          | neuer Zweig in `mapEventError`                                                                                                           |
| `features/tasks/errors.test.ts`             | neuer Zweig in `mapTaskError`                                                                                                            |
| `app-sections/shared/conflictStore.test.ts` | Store-Verhalten nach dem Vorbild von `toastStore.test.ts`                                                                                |
| `features/i18n/catalogs.test.ts`            | DE/EN-Parität der neuen Keys (bestehende Suite, keine Änderung nötig)                                                                    |

`ConflictDialog` und `ConflictDialogHost` bleiben ungetestet — es gibt im Repo keinen Pfad, auf dem React-Komponenten unter `bun test` rendern (dieselbe Lücke wie bei `useFamilyRealtime`, ADR-030). Der Schnitt ist genau darauf gelegt: Store und Vergleichsfunktionen sind prüfbar, die Komponente ist stumpf.

---

## 9. Copy

Neuer Abschnitt `conflict.*` in [docs/COPY.md](../../COPY.md) und beiden Katalogen. **Familienweit, nicht `cal.*`** — Kalender und Aufgaben benutzen denselben Dialog; dieselbe Begründung wie `sync.*` in ADR-030 Decision 15.

| Key                     | DE                                                                         |
| ----------------------- | -------------------------------------------------------------------------- |
| `conflict.title`        | Gleichzeitig bearbeitet                                                    |
| `conflict.body.event`   | Jemand anderes hat diesen Termin geändert, während du ihn bearbeitet hast. |
| `conflict.body.task`    | Jemand anderes hat diese Aufgabe geändert, während du sie bearbeitet hast. |
| `conflict.theirs`       | Jetzt gespeichert                                                          |
| `conflict.mine`         | Deine Fassung                                                              |
| `conflict.keepMine`     | Deine Fassung speichern                                                    |
| `conflict.keepTheirs`   | Andere Fassung behalten                                                    |
| `conflict.deleteAnyway` | Trotzdem löschen                                                           |
| `cal.error.conflict`    | Jemand anderes hat den Termin geändert.                                    |
| `hw.error.conflict`     | Jemand anderes hat die Aufgabe geändert.                                   |

Feldnamen kommen **nicht** dazu: der Dialog beschriftet seine Zeilen mit den vorhandenen `cal.edit.field*`- und `hw.*`-Keys.

Bewusst nicht „Ihre Fassung": im Deutschen liest sich das als Höflichkeitsform und verstößt gegen die Du-Regel (CLAUDE.md, Brand voice). „Andere Fassung" ist eindeutig.

`docs/COPY.md` gehört dem Designer und ist gesperrt (CLAUDE.md, Non-Negotiable 1). Für diesen Abschnitt wurde die Bearbeitung am 2026-09-03 ausdrücklich erteilt — derselbe Vorgang wie bei `sync.*`, und aus demselben Grund: ein Katalog-Key ohne Deck-Eintrag wäre genau die stille Divergenz, die die Regel verhindern soll. Der ADR hält die Freigabe fest, damit ein Diff-Leser sie findet.

---

## 10. Decisions

1. **Der `updated_at`-Vergleich braucht zuerst einen Trigger.** Die Spalte war seit dem ersten Kalender-Schema tot. Ohne §2 wäre das Feature ein stiller No-Op — schlimmer als keins, weil es Sicherheit behauptet, die es nicht liefert.
2. **`before update`, nicht `after`.** Ein `after`-Trigger kann `NEW` nicht mehr ändern; und `before` läuft garantiert vor `broadcast_family_change`, sodass der Broadcast das neue `updated_at` schon trägt.
3. **Das Token deckt genau die Zeilen ab, die geschrieben werden** — Master plus Exception an diesem Datum. Nicht weniger (sonst ist der häufigste Serien-Pfad blind), nicht die ganze Serie (sonst meldet es beim Bearbeiten einer anderen Occurrence).
4. **Pre-Flight ist der Detektor im Kalender, CAS die Absicherung.** Der Master-Fetch ist ohnehin da und liefert zugleich die Vergleichsdaten; das CAS auf `updateMaster` kostet vier Zeilen und schließt das Restfenster, wo es geht. Der Exception-`upsert` bleibt unangetastet.
5. **Bei Aufgaben ist es umgekehrt.** Dort gibt es keinen Fetch, den man mitbenutzen könnte; CAS ist frei, ein Pre-Flight kostete einen Roundtrip pro Speichern. Gelesen wird nur im Konfliktfall.
6. **Der Dialog wohnt im Root-Layout, nicht im Screen.** Das Edit-Sheet ist weg, bevor der Server antwortet — dieselbe Lehre wie beim Toast (ADR-025).
7. **`Modal` statt `Alert`.** `Alert.alert` ist unter react-native-web ein No-Op; der Zwei-Browser-Test des Issues wäre damit nicht durchführbar.
8. **Zwei Wege, nicht drei.** „Abbrechen" fällt mit „Andere Fassung behalten" zusammen, sobald kein Formular mehr steht.
9. **Leerer Feldvergleich heißt: kein Dialog.** Ein Guard, der bei jedem Versionssprung meldet, wird weggeklickt.
10. **Löschen meldet sich als Toast.** Verzögertes Löschen (ADR-026) heißt: kein Screen, kein Formular, nichts zu vergleichen.
11. **`conflict.*` statt `cal.*`.** Ein Dialog für zwei Features, wie `sync.*` eine Zeile für alle.

---

## 11. Folgen für die Dokumentation

- **ADR-031** in [docs/decision-log.md](../../decision-log.md) — ergänzt ADR-030, löst nichts ab. Schließt die drei Realtime-Iterationen ab.
- **CLAUDE.md** — `features/calendar/version.ts` und `conflict.ts`, `features/tasks/conflict.ts`, die drei neuen `app-sections/shared`-Dateien in der Ordnerübersicht; der Realtime-Absatz im Tech-Stack bekommt den Satz, dass Conflict-Detection jetzt steht.
- **docs/COPY.md** — der `conflict.*`-Abschnitt (freigegeben, §9).
- **docs/TODO.md** — **Zeile 86 entfällt** (der Aufgaben-Defekt „zwei Eltern überschreiben sich" ist damit erledigt). Drei neue Einträge:
  - `families`/`parents`/`children` haben dasselbe tote `updated_at`.
  - Der verschobene-Occurrence-Fall aus §3.
  - `applyOverride` in [expand.ts](../../../features/calendar/expand.ts) liest `description` nicht zurück, obwohl `modifyOccurrence` es schreibt. Betrifft den Vergleich direkt: bei Scope „Nur diesen" zeigt die fremde Fassung immer die Master-Beschreibung.

---

## 12. Was diese Iteration nicht liefert

- **Kein Merge.** Der Nutzer wählt eine Fassung ganz, nicht Feld für Feld. Ein Feld-Merge braucht eine Auswahl pro Zeile und eine dritte, zusammengesetzte Fassung — deutlich mehr UI für einen Fall, den es erst zu beobachten gilt.
- **Keine Anzeige, _wer_ geändert hat.** `events` trägt `created_by`, aber kein `updated_by`. Das wäre eine weitere Spalte plus Trigger plus ein Join auf `parents`; die Copy sagt bewusst „jemand anderes".
- **Kein Guard auf `useToggleTaskDone` und `useToggleReminder`.** Beide schreiben genau ein Feld, das der Nutzer unmittelbar vor sich sieht; ein Konflikt dort ist ein doppelter Haken, kein Datenverlust.
- **Kein Guard beim Anlegen.** Zwei gleichzeitig angelegte Termine sind zwei Termine, kein Konflikt. Die Überschneidungs-Warnung im Anlegen-Formular ist ein anderes Feature mit demselben deutschen Wort (siehe `patterns/calendar.md`, „Conflict detection" — dort geht es um Zeitkollisionen).
- **Kein Test des Dialogs.** Es gibt keinen Render-Pfad unter `bun test` (§8).
