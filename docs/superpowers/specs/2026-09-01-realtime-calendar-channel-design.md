# Realtime-Kanal für den Kalender — Design

**Status:** Approved (Brainstorming Phase)
**Date:** 2026-09-01
**Issue:** [#50](https://github.com/SvenSonnborn/ElternFlowAI/issues/50) — „Realtime: Supabase Realtime für events aktivieren"
**Decision-Log:** wird als ADR-028 referenziert nach Implementation

---

## 1. Context

Der Auftrag nennt drei Zutaten: Supabase Realtime in der Datenbank aktivieren, Kanäle für `events` und `event_exceptions` definieren, eine Test-Subscription in einem Debug-Screen. Er ist das erste von drei aufeinander aufbauenden Issues:

| Issue | Inhalt                                                      |
| ----- | ----------------------------------------------------------- |
| #50   | **dieses** — Replikation, Kanal-Schicht, Debug-Screen       |
| #51   | `useFamilyEvents` um die Subscription erweitern (Live-Sync) |
| #52   | Zwei-Client-Test und Conflict-Detection V1                  |

Diese Reihenfolge bestimmt den Zuschnitt: **#50 liefert das Fundament, nicht den sichtbaren Live-Sync.** Nach diesem Issue fließen Änderungen aus der Datenbank bis in den Debug-Screen — nicht in den Kalender. Der Kalender ist #51, und dort liegt auch die eigentliche Schwierigkeit, weil eine eingehende Invalidierung sich mit zwei bestehenden Overlays vertragen muss (`pendingDeletes` aus [ADR-026](../../decision-log.md), `optimisticEvents` aus [ADR-027](../../decision-log.md)).

### Was der Auftrag annahm und was zutrifft

| Annahme                                              | Realität                                                                                                                                                                                                                                              |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| „Supabase Realtime in der DB aktivieren"             | Realtime ist auf einem Supabase-Projekt bereits an; die Publikation `supabase_realtime` existiert. Zu tun ist, **zwei Tabellen in sie aufzunehmen** — der Dashboard-Schalter „Replication" und `alter publication … add table` sind derselbe Vorgang. |
| „Kanäle **für** `events` **und** `event_exceptions`" | Zwei Tabellen brauchen keine zwei Kanäle. Ein Supabase-Kanal trägt beliebig viele `postgres_changes`-Bindings; ein Topic mit zwei Bindings ist ein WebSocket-Topic, ein Lebenszyklus, ein Status (Decision 2).                                        |
| „Abhängigkeiten: keine"                              | Stimmt für den Code. Das **Anwenden** der Migration hängt an einem authentifizierten Supabase-MCP- oder CLI-Zugang, den diese Session nicht hat (siehe §7).                                                                                           |
| Ein DELETE ist ein Change wie jeder andere           | RLS greift bei `postgres_changes` **nicht auf DELETE** — Postgres kann eine bereits gelöschte Zeile nicht mehr gegen eine Policy prüfen. Der Payload trägt dann nur den Primärschlüssel, und zwar für **alle** abonnierten Clients (Decision 4).      |

### Zielbild

Ein angemeldetes Familienmitglied öffnet unter `__DEV__` den Realtime-Debug-Screen und sieht: Kanal-Topic, Verbindungsstatus, und eine Liste, in die jede fremde Änderung an `events` oder `event_exceptions` der eigenen Familie innerhalb von Sekundenbruchteilen einläuft — mit Tabelle, Typ und Id. Damit ist die Übertragungsstrecke bewiesen, bevor #51 sie an den Kalender hängt.

---

## 2. Architektur

```text
  Postgres                     Supabase Realtime              App
 ┌──────────────┐   WAL      ┌────────────────────┐  WS  ┌──────────────────────────┐
 │ events       │──────────▶ │ publication         │─────▶│ subscribeToCalendar-     │
 │ event_       │            │ supabase_realtime   │      │ Changes()   ← RN-frei    │
 │ exceptions   │            │  + RLS je Abonnent  │      │  · 1 Topic, 2 Bindings   │
 └──────────────┘            │    (nicht bei DEL)  │      │  · normalizeChange()     │
                             └────────────────────┘      └────────┬─────────────────┘
                                                                   │ CalendarChange
                                                                   ▼
                                                    ┌──────────────────────────────┐
                                                    │ useCalendarRealtime()        │
                                                    │  dünner useEffect + Status   │
                                                    └───────┬──────────────────────┘
                                                            │
                                     ┌──────────────────────┴───────────────────────┐
                                     ▼                                              ▼
                        ┌──────────────────────────┐                   ┌─────────────────────────┐
                        │ RealtimeDebugScreen      │                   │ useFamilyEvents  (#51)  │
                        │  app-sections/debug/     │                   │  noch nicht verdrahtet  │
                        └──────────────────────────┘                   └─────────────────────────┘
```

Die Schichtung folgt dem Port-Muster, das `features/calendar/recurrence.ts` mit `createSupabaseEventOps` bereits benutzt: alles Prüfbare liegt in reinen Funktionen und einer React-freien Kernfunktion, der Hook darüber ist so dünn, dass er nichts mehr verstecken kann.

---

## 3. Die Migration

`supabase/migrations/20260901093000_realtime_calendar.sql`

```sql
-- Idempotent, weil Postgres kein `create publication if not exists` kennt und
-- `alter publication … add table` auf ein bereits aufgenommenes Ziel fehlschlägt.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'events'
  ) then
    alter publication supabase_realtime add table public.events;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'event_exceptions'
  ) then
    alter publication supabase_realtime add table public.event_exceptions;
  end if;
end $$;
```

**Kein `replica identity full`.** Es würde `payload.old` mit den vorherigen Spaltenwerten füllen — aber nur bei Tabellen ohne RLS. Beide Tabellen hier haben `enable row level security` **und** `force row level security`; `payload.old` trägt deshalb so oder so ausschließlich den Primärschlüssel. Die Zeile wäre reine Kosmetik mit Replikations-Kosten. Ein SQL-Kommentar hält das an Ort und Stelle fest, damit die Frage nicht in jeder Folge-Iteration neu aufkommt.

---

## 4. Die Datenschicht — `features/calendar/realtime.ts`

### 4.1 Typen

```ts
export type CalendarRealtimeTable = "events" | "event_exceptions";
export type CalendarChangeType = "INSERT" | "UPDATE" | "DELETE";

export interface CalendarChange {
  table: CalendarRealtimeTable;
  type: CalendarChangeType;
  /** Primärschlüssel der geänderten Zeile. Bei DELETE das einzige belastbare Feld. */
  rowId: string | null;
  /**
   * Die Event-Id, die #51 zum Invalidieren braucht: bei `events` die eigene `id`,
   * bei `event_exceptions` die `event_id` aus `new`.
   *
   * **Bei DELETE immer `null`** — RLS greift dort nicht, der Payload trägt nur den
   * Primärschlüssel, und der einer Exception verrät ihre Event-Id nicht. Die Grenze
   * steht im Typ, damit #51 sie nicht übersieht (Decision 4).
   */
  eventId: string | null;
  receivedAt: number;
}

export type CalendarRealtimeStatus =
  | "idle" // kein familyId → keine Subscription
  | "subscribing"
  | "subscribed"
  | "timedOut"
  | "error"
  | "closed";
```

### 4.2 Reine Funktionen

```ts
export function calendarChannelTopic(familyId: string): string; // `calendar:${familyId}`
export function toRealtimeStatus(state: REALTIME_SUBSCRIBE_STATES): CalendarRealtimeStatus;
export function normalizeChange(
  table: CalendarRealtimeTable,
  payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
  now?: () => number,
): CalendarChange;
```

`normalizeChange` bekommt die Tabelle aus dem Binding statt aus `payload.table` — das Binding ist typisiert, `payload.table` ist ein `string`, und eine Zuweisung von `string` auf die Union bräuchte eine Behauptung, die nichts prüft.

### 4.3 Die Kernfunktion

```ts
export function subscribeToCalendarChanges(opts: {
  client: SupabaseClient<Database>;
  familyId: string;
  onChange: (change: CalendarChange) => void;
  onStatus?: (status: CalendarRealtimeStatus) => void;
  now?: () => number;
}): () => void;
```

Ein Topic, zwei Bindings:

| Binding | schema   | table              | filter                    |
| ------- | -------- | ------------------ | ------------------------- |
| 1       | `public` | `events`           | `family_id=eq.<familyId>` |
| 2       | `public` | `event_exceptions` | — (RLS filtert)           |

`event_exceptions` hat keine `family_id`-Spalte und kann serverseitig nicht nach Familie gefiltert werden; RLS filtert INSERT und UPDATE dort korrekt über die `exists (… events … current_family_id())`-Policy. Die Spalte zu denormalisieren wurde erwogen und verworfen (Decision 3).

Der Rückgabewert ist die Abmeldung: `void client.removeChannel(channel)`.

### 4.4 Der Hook

```ts
export function useCalendarRealtime(
  familyId: string | null,
  onChange: (change: CalendarChange) => void,
): { status: CalendarRealtimeStatus };
```

`familyId` kommt als **Parameter**, nicht aus einem `useCurrentParent()` im Hook — das hält ihn frei von der Query-Abhängigkeit und komponierbar; der Debug-Screen und später `useFamilyEvents` beschaffen die Id selbst.

Zwei Details, die nicht offensichtlich sind und deshalb Kommentare bekommen:

- **Der Kanal wird im Effekt frisch erzeugt und im Cleanup entsorgt**, nie über Renders hinweg wiederverwendet. React 19 hängt im StrictMode jeden Effekt einmal ab und wieder an; ein wiederverwendeter Kanal liefe beim zweiten `subscribe()` in „tried to subscribe multiple times".
- **`onChange` liegt in einer Ref.** `react-hooks/exhaustive-deps` steht in diesem Repo auf `error`; stünde der Callback in der Dependency-Liste, baute jeder Render mit frischer Closure die Subscription neu auf.

Ohne `familyId` passiert nichts und der Status bleibt `idle` — der reguläre Zustand während `useCurrentParent()` noch lädt und nach dem Abmelden.

Ein `supabase.realtime.setAuth()` ruft der Hook **nicht**: `supabase-js` schiebt den Zugriffstoken bei jedem Auth-Wechsel selbst an den Socket, und abonniert wird ohnehin erst, wenn `familyId` steht — was eine aufgelöste `parents`-Query und damit eine authentifizierte Sitzung voraussetzt.

---

## 5. Der Debug-Screen

Route nach der Konvention aus CLAUDE.md: `app/debug/realtime.tsx` ist ein dünner Re-Export, die Implementierung liegt in `app-sections/debug/RealtimeDebugScreen.tsx`. Dazu ein `Stack.Screen`-Eintrag in `app/_layout.tsx` (`presentation: "card"`), wie ihn die anderen Routen dort auch haben.

**Inhalt:** Kopfzeile mit Zurück-Knopf · Status-Badge (Farbe aus `theme.success`/`warning`/`danger`) · Familie-Id und Kanal-Topic · Zähler · Liste der letzten 50 Änderungen, neueste oben, je Zeile Uhrzeit · Tabelle · Typ · Id · „Leeren"-Knopf · eine Hinweiskarte, die die DELETE-Lücke benennt, damit niemand sie für einen Fehler des Screens hält.

Gebaut aus `Screen`/`Card`/`Text`/`Button` aus `@/design-system/ui` mit Theme-Tokens, Touch-Targets ≥ 44 × 44. Der Voice-FAB spielt keine Rolle — die Route liegt außerhalb von `(tabs)`.

**Copy hartkodiert deutsch**, mit file-level `/* eslint-disable i18next/no-literal-string */` und einem Kommentar, der die Ausnahme begründet: Die i18n-Kataloge tragen Designer-Copy aus `docs/COPY.md`; ein Dev-Screen, der im Release-Build nicht existiert, hat dort nichts zu suchen. Das ist dieselbe Abwägung wie bei `sample.*` in [ADR-020](../../decision-log.md), nur mit umgekehrtem Ausgang — dort brauchten Fixtures übersetzbare Copy, hier braucht ein Werkzeug keine.

**Einstieg:** eine Zeile im Settings-Sheet, gerendert nur unter `__DEV__`. Navigiert nach dem dort etablierten Muster (`if (router.canGoBack()) router.back(); router.push("/debug/realtime")`), damit der Screen nicht hinter dem Formsheet hängt.

---

## 6. Tests

`features/calendar/realtime.test.ts`, Stub-Client nach dem Muster von `features/meals/queries.test.ts` und `features/calendar/reminders.test.ts` (`mock.module("@/features/supabase", …)`), also ohne React-Rendering:

- `calendarChannelTopic` bildet `calendar:<familyId>`.
- `normalizeChange` für alle sechs Kombinationen aus zwei Tabellen × INSERT/UPDATE/DELETE — insbesondere, dass `eventId` bei DELETE `null` ist und bei `event_exceptions`-INSERT/UPDATE aus `new.event_id` kommt.
- `toRealtimeStatus` bildet `SUBSCRIBED`/`CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED` ab.
- `subscribeToCalendarChanges` registriert genau zwei Bindings mit den Werten aus der Tabelle in §4.3 — Schema, Tabelle, Filter.
- Die zurückgegebene Funktion ruft `removeChannel` mit genau dem erzeugten Kanal.
- Eingehende Payloads erreichen `onChange` normalisiert.

**Der Hook selbst bleibt ungetestet.** Im Repo gibt es keinen Pfad, auf dem React-Komponenten unter `bun test` rendern: `@testing-library/react-native` liegt als devDependency, wird von keiner Suite benutzt, und `features/calendar/hooks.ts` ist unter Bun nicht einmal ladbar (das nativewind-Runtime scheitert beim Modul-Laden, in `docs/TODO.md` festgehalten). Nach dem Split ist der Hook ein `useEffect` um `subscribeToCalendarChanges` — die Zerlegung ist die Antwort auf die fehlende Testbarkeit, nicht ihr Opfer. Als Follow-up in `docs/TODO.md`.

---

## 7. Was diese Iteration nicht beweist

- **Das Anwenden der Migration.** Der Supabase-MCP-Server ist in dieser Session nicht authentifiziert; die Migration wird geschrieben, nicht gefahren. Danach greift zwingend der Versions-Abgleich aus [supabase/SETUP.md](../../../supabase/SETUP.md): Der MCP-Server vergibt einen eigenen Timestamp und ignoriert den Dateinamen — bleibt die Divergenz stehen, hielte die CLI die Migration für nicht angewendet und führe sie bei `db push` erneut, und die Basis-Migrationen beginnen mit `drop table … cascade`.
- **„Live übertragen" am echten Datenstrom.** Ein fehlendes Publikations-Mitglied ist kein Verbindungsfehler: Der Kanal meldet `subscribed`, es kommt nur nie ein Event. Der grüne Status beweist also die Socket-Verbindung, nicht die Replikation — bewiesen ist die Strecke erst nach dem `apply_migration`, und genau deshalb zeigt der Debug-Screen Ereignisse statt nur einen Status.
- **Der Zwei-Client-Beweis.** Zwei Geräte, eine Familie, eine Änderung — das ist #52 und braucht ohnehin einen zweiten angemeldeten Account.

Verifiziert wird in dieser Iteration: `bun run check` (format · lint · typecheck), `bun test`, und dass der Debug-Screen rendert und die Subscription anläuft — auf Web als schnellem Loop und in beiden Simulatoren.

---

## 8. Decisions

1. **Fundament, nicht Live-Sync.** #50 endet an der Kanal-Schicht plus Debug-Screen; `useFamilyEvents` wird nicht angefasst. Die Verzahnung einer eingehenden Invalidierung mit dem optimistischen Overlay ([ADR-027](../../decision-log.md)) und den offenen Löschungen ([ADR-026](../../decision-log.md)) ist kein Anhängsel: Ein Realtime-Refetch mitten im Undo-Fenster darf den gerade gelöschten Termin nicht zurückholen. Das verdient eine eigene Iteration mit eigener Entscheidung — #51.

2. **Ein Topic, zwei Bindings statt zwei Kanäle.** Ein Kanal trägt beliebig viele `postgres_changes`-Bindings. Zwei Topics kosteten zwei WebSocket-Abonnements pro Client und zwei Zustände, die #51 ohnehin immer gemeinsam braucht; getrennt abonnieren will sie niemand. Der Wortlaut des Auftrags („Kanäle … definieren") ist damit erfüllt — definiert sind zwei Bindings.

3. **`family_id` wird nicht auf `event_exceptions` denormalisiert.** Der Reiz wäre Symmetrie: beide Bindings serverseitig gefiltert. Der Gewinn wäre aber allein Bandbreite — RLS filtert INSERT und UPDATE dort bereits korrekt —, und den einzigen Fall, der wirklich unsauber bleibt (DELETE), löste die Spalte nicht mit, weil RLS bei DELETE gar nicht erst läuft. Dafür kostete sie eine Schema-Änderung an einer bestehenden Tabelle samt Backfill und Synchron-Trigger. YAGNI.

4. **Die DELETE-Lücke steht im Typ, nicht in einem Kommentar.** Postgres Changes wendet RLS nicht auf DELETE an, und der Payload trägt nur den Primärschlüssel. Konkret heißt das zweierlei: Ein Client bekommt Lösch-Ereignisse **fremder** Familien zu sehen (nur die Id — keine Titel, keine Orte, keine Kind-Zuordnung), und er kann eine gelöschte Exception nicht ihrem Event zuordnen. Beides ließe sich in einem Docstring vergraben; stattdessen ist `eventId` als `string | null` typisiert, sodass #51 die Fallunterscheidung nicht übersehen **kann**. Der Debug-Screen benennt sie zusätzlich sichtbar, damit ein leeres Feld nicht als Fehler gelesen wird.

5. **Reine Kernfunktion, dünner Hook.** Nicht Stil, sondern die einzige Form, in der dieses Feature im Repo prüfbar ist (§6). Nebeneffekt: `subscribeToCalendarChanges` nimmt den Client als Parameter, ein Test braucht also nicht einmal `mock.module`, um ihn zu ersetzen.

6. **Kein `replica identity full`.** Bei aktivem RLS bleibt `payload.old` auf den Primärschlüssel beschränkt; die Einstellung erhöhte nur das WAL-Volumen. Wird im SQL kommentiert, damit #52 (Conflict-Detection) die Frage nicht ohne die Antwort neu stellt.

7. **Der Debug-Screen bleibt im Repo, statt weggeworfen zu werden.** #51 und #52 brauchen genau dieses Fenster in den Datenstrom, und ein Werkzeug, das man zum dritten Mal neu baut, war beim ersten Mal zu früh gelöscht. Der Preis ist eine dauerhafte Route — gedeckelt dadurch, dass ihr Einstieg unter `__DEV__` steht.

8. **Keine `debug.*`-Keys in den i18n-Katalogen.** Nicht-verhandelbar #3 aus CLAUDE.md verlangt i18n für UI-Strings und verweist auf `docs/COPY.md` als Quelle — ein Deck, das nach Screens gegliedert ist und für einen Dev-Screen keinen Eintrag hat und haben soll. Die Kataloge tragen ausgelieferte Copy; dieser Screen wird nicht ausgeliefert. Die Ausnahme wird per file-level `eslint-disable` sichtbar gemacht, nicht per Zeilen-Ausnahme versteckt.

---

## 9. Folgen für die Dokumentation

- **ADR-028** in `docs/decision-log.md`.
- **`docs/TODO.md`:** Die bestehende Zeile „Realtime-Subscription auf `events` / `event_exceptions` für Multi-User-Sync" beschreibt #51 und wird darauf zugespitzt statt gelöscht. Neu dazu: der ungetestete Hook, die DELETE-Lücke als offene Frage für #51, und dass es keinen Reconnect-Backoff gibt (der Realtime-Client bringt seinen eigenen mit — was er nicht bringt, ist eine sichtbare Rückmeldung nach dauerhaftem Scheitern).
- **CLAUDE.md:** `features/calendar/`-Zeile um den Realtime-Kanal ergänzen, `app-sections/debug/` und `app/debug/` in die Ordnerstruktur, und die Supabase-Zeile im Tech-Stack, die Realtime bisher als „nächste Iteration" führt.
- **`docs/architecture.md`** bekommt einen kurzen Absatz zur Realtime-Strecke. Der Rest des Dokuments ist erkennbar veraltet (drei Themes statt zwei, „no Supabase" unter „What's not here yet"); das zu sanieren gehört nicht in diese Iteration und wird als TODO notiert.
