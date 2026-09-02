# Live-Sync für den Kalender: Broadcast from Database — Design

**Status:** Approved (Brainstorming Phase)
**Date:** 2026-09-01
**Issue:** [#51](https://github.com/SvenSonnborn/ElternFlowAI/issues/51) — „Realtime: `useFamilyEvents` um Subscription erweitern"
**Decision-Log:** wird als ADR-030 referenziert nach Implementation; löst [ADR-028](../../decision-log.md) in den Decisions 2, 3, 4 und 6 ab

---

## 1. Context

[ADR-028](../../decision-log.md) (Issue #50) hat das Fundament gelegt: `events` und `event_exceptions` liegen in der Publikation `supabase_realtime`, [features/calendar/realtime.ts](../../decision-log.md#adr-028--realtime-für-den-kalender-ein-kanal-pro-familie-delete-bleibt-unzuordenbar-2026-09-01) hält einen `postgres_changes`-Kanal pro Familie, ein Dev-Screen unter `/debug/realtime` zeigt den Strom. Der Kalender abonniert ihn nicht — das ist dieses Issue.

Der Auftrag nennt vier Zutaten: den Hook um `supabase.channel(...).on(...)` erweitern, bei INSERT/UPDATE/DELETE invalidieren, beim Unmount aufräumen, Race-Conditions abfangen. Vier seiner Annahmen tragen so nicht.

| Annahme                                                         | Realität                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| „Die Subscription gehört in `useFamilyEvents`"                  | Der Hook hat **drei** Aufrufer — [KalenderScreen](<../../../app-sections/(tabs)/kalender/KalenderScreen.tsx>), [DashboardScreen](<../../../app-sections/(tabs)/dashboard/DashboardScreen.tsx>) (beide gleichzeitig gemountet) und [EventCreateScreen](../../../app-sections/event/EventCreateScreen.tsx). Im Hook hieße das drei Kanäle auf einem Topic (Decision 4). |
| „Race-Condition-Schutz: eigene Events ignorieren"               | Nicht nötig, und ein Schutz wäre schädlich. Beide Overlays sind Anzeige-Filter **hinter** der Query; ein Refetch kann weder eine offene Löschung zurückholen noch einen optimistischen Eintrag verschlucken (Decision 5).                                                                                                                                             |
| Ein DELETE ist über `postgres_changes` zuzuordnen               | Nein — RLS greift dort nicht auf DELETE, der Payload trägt nur die Row-Id, und das Ereignis erreicht **jeden** angemeldeten Client, auch fremder Familien. Das ist der Grund, warum dieses Issue den Transport wechselt (Decision 1).                                                                                                                                 |
| „Abhängigkeit: Realtime aktiviert" — der Rest ist Client-Arbeit | Der tragfähige Entwurf liegt in der Datenbank: Trigger + `realtime.broadcast_changes()` auf einem privaten Kanal, autorisiert über RLS auf `realtime.messages`.                                                                                                                                                                                                       |

### Zielbild

Zwei angemeldete Mitglieder derselben Familie haben die App offen. Legt A einen Termin an, ändert oder löscht ihn, erscheint die Änderung bei B innerhalb von Sekundenbruchteilen — auf Kalender **und** Dashboard, ohne Pull-to-Refresh. Kommt der Kanal dauerhaft nicht durch, sagt die App es, statt still veraltete Daten zu zeigen; kommt er zurück, holt sie das Verpasste nach. Und: Ein Client hört **ausschließlich** Ereignisse seiner eigenen Familie — auch Löschungen.

---

## 2. Architektur

```text
  Postgres                                   Supabase Realtime            App
 ┌────────────────────────┐                 ┌────────────────────┐      ┌───────────────────────────┐
 │ events                 │  AFTER I/U/D    │ realtime.messages  │  WS  │ subscribeToFamilyChanges  │
 │ event_exceptions       │ ─── trigger ──▶ │  + RLS: topic =    │ ───▶ │  private: true            │
 │                        │  broadcast_     │    family:<id>     │      │  on("broadcast", I/U/D)   │
 │ (NICHT mehr in der     │  changes()      │                    │      │  normalizeBroadcast()     │
 │  Publikation)          │                 └────────────────────┘      └────────────┬──────────────┘
 └────────────────────────┘                                                          │ FamilyChange
                                                                                     ▼
                                                            ┌────────────────────────────────────┐
                                                            │ useFamilyRealtime()                │
                                                            │  ein Mountpunkt in ThemedStack     │
                                                            │  · 300 ms Sammelfenster            │
                                                            │  · dispatch → QueryKey[]           │
                                                            │  · Status → realtimeStatus-Store   │
                                                            └───────┬─────────────────┬──────────┘
                                                                    │                 │
                                              qc.invalidateQueries  │                 │  degraded
                                                                    ▼                 ▼
                                             ┌──────────────────────────────┐  ┌──────────────────┐
                                             │ useFamilyEvents (3 Aufrufer) │  │ <SyncNotice />   │
                                             │  Overlays unverändert        │  │ Kalender · Dash  │
                                             └──────────────────────────────┘  └──────────────────┘
```

Die Sync-Schicht sitzt **über** den Features, nicht neben ihnen: `features/realtime` darf `features/calendar` kennen, nicht umgekehrt. Alles Prüfbare liegt in reinen Funktionen — derselbe Schnitt wie in ADR-028 Decision 5 und aus demselben Grund (kein Render-Pfad unter `bun test`).

---

## 3. Die Migration

`supabase/migrations/20260902065203_realtime_family_broadcast.sql` — idempotent, drei Teile.

### 3.1 Rücknahme der Publikation

```sql
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'events'
  ) then
    alter publication supabase_realtime drop table public.events;
  end if;
  -- dito event_exceptions
end $$;
```

Das ist der eigentliche Verschluss des Lecks. Solange die Tabellen in der Publikation liegen, kann **jeder** angemeldete Client `postgres_changes` abonnieren und Lösch-Ereignisse fremder Familien mithören — unabhängig davon, was unser eigener Code tut. Die Migration aus #50 bleibt als Historie stehen; diese kehrt sie um.

### 3.2 Realtime Authorization

```sql
create policy "family members receive family broadcasts"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and (select realtime.topic()) = 'family:' || public.current_family_id()::text
);
```

`public.current_family_id()` existiert seit `20260529090123_helpers_and_core.sql`, ist `security definer` und an `authenticated` gegrantet. Ein Client ohne Parent-Zeile (während des Onboardings) bekommt `null`, der Vergleich schlägt fehl, der Join wird abgelehnt — genau das gewünschte Verhalten.

Es gibt **keine** `insert`-Policy. Clients senden nicht auf diesen Kanal; alle Nachrichten kommen aus dem Trigger, der als `security definer` läuft und RLS damit nicht unterliegt. Eine Insert-Policy nachzureichen wäre der Schritt, den #52 prüft, falls Conflict-Detection Client-Broadcasts braucht.

### 3.3 Trigger

> **Korrektur (2026-09-02, nach der Umsetzung).** Hier stand ursprünglich eine flach nach `TG_OP` verzweigte Fassung mit `case when TG_TABLE_NAME = 'events' then NEW.id else NEW.event_id end`, wie die Supabase-Doku sie nahelegt. Die ist in PL/pgSQL nicht lauffähig: Feldzugriffe auf `NEW`/`OLD` werden für die **gesamte** Expression gegen den tatsächlich gebundenen Record-Typ aufgelöst, unabhängig davon, welcher `when`-Zweig zur Laufzeit gälte — `events` hat keine Spalte `event_id`, `event_exceptions` keine `family_id`. Angewendet brach sie bei **jeder** Mutation mit `ERROR 42703: record "new" has no field "event_id"` ab, und weil der Trigger `after` läuft, scheiterte damit die Mutation selbst. Der Block unten ist deshalb durch die tatsächlich gebaute, nach Tabelle **und dann** nach `TG_OP` verschachtelte Fassung aus [20260902065203_realtime_family_broadcast.sql](../../../supabase/migrations/20260902065203_realtime_family_broadcast.sql) ersetzt — ein bekannt fehlerhafter Codeschnipsel in einem Designdokument ist eine Falle für den nächsten Leser. Begründung im Detail: [ADR-030](../../decision-log.md), Decision 4.

```sql
create or replace function public.broadcast_family_change()
returns trigger
security definer
set search_path = ''
language plpgsql
as $$
declare
  fid uuid;
  eid uuid;
begin
  -- Bewusst KEIN `coalesce(NEW.x, OLD.x)`, obwohl die Supabase-Doku es so zeigt:
  -- In einem Row-Trigger auf DELETE ist `NEW` nicht zugewiesen, und ein
  -- Feldzugriff darauf kann mit `record "new" is not assigned yet` abbrechen —
  -- ausgerechnet im Fall, für den dieser ganze Entwurf gebaut ist.
  --
  -- Ebenso bewusst KEIN `case when TG_TABLE_NAME = 'events' then NEW.family_id end`
  -- in einer flachen Verzweigung nach TG_OP: PL/pgSQL löst Feldzugriffe auf
  -- NEW/OLD für die gesamte Expression gegen den tatsächlich gebundenen
  -- Record-Typ auf — unabhängig davon, welcher WHEN-Zweig zur Laufzeit
  -- genommen würde. `events` hat keine Spalte `event_id`, `event_exceptions`
  -- keine Spalte `family_id`; eine solche CASE-Expression wirft deshalb bei
  -- jedem Aufruf mit "record ... has no field ...", ganz gleich welcher Zweig
  -- inhaltlich gemeint war. Erst nach Tabelle, dann nach TG_OP verschachteln
  -- stellt sicher, dass kein Ausdruck je ein Feld berührt, das der gebundene
  -- Zeilentyp nicht hat.
  if TG_TABLE_NAME = 'events' then
    if TG_OP = 'DELETE' then
      fid := OLD.family_id;
      eid := OLD.id;
    else
      fid := NEW.family_id;
      eid := NEW.id;
    end if;
  else
    -- `event_exceptions` trägt keine `family_id`; sie hängt am Event.
    if TG_OP = 'DELETE' then
      eid := OLD.event_id;
    else
      eid := NEW.event_id;
    end if;
    select e.family_id into fid from public.events e where e.id = eid;
  end if;

  -- Kaskade: `on delete cascade` räumt die Exceptions NACH der Master-Zeile ab,
  -- der Lookup läuft dann ins Leere. Das DELETE-Broadcast des Events selbst
  -- deckt den Fall bereits ab; ohne diesen Ausstieg entstünde das Topic
  -- `family:` ohne Id, das niemand abonniert.
  if fid is null then
    return null;
  end if;

  perform realtime.broadcast_changes(
    'family:' || fid::text,  -- topic
    TG_OP,                   -- event
    TG_OP,                   -- operation
    TG_TABLE_NAME,           -- table
    TG_TABLE_SCHEMA,         -- schema
    NEW,                     -- new record
    OLD                      -- old record
  );
  return null;
end;
$$;

comment on function public.broadcast_family_change() is
  'AFTER-Trigger für Realtime: sendet Zeilenänderungen auf das private Topic family:<family_id>. Eine Funktion für alle familiengebundenen Tabellen — Aufgaben und Essen anzuschließen heißt, den TG_TABLE_NAME-Zweig zu erweitern und einen Trigger zu setzen. Kosten: jede Mutation schreibt zusätzlich eine Zeile in realtime.messages (Supabase partitioniert tagesweise und löscht > 3 Tage selbst).';

drop trigger if exists broadcast_events_changes on public.events;
create trigger broadcast_events_changes
after insert or update or delete on public.events
for each row execute function public.broadcast_family_change();

drop trigger if exists broadcast_event_exceptions_changes on public.event_exceptions;
create trigger broadcast_event_exceptions_changes
after insert or update or delete on public.event_exceptions
for each row execute function public.broadcast_family_change();
```

Eine Funktion für beide Tabellen: Der einzige Unterschied ist, woher die `family_id` kommt. Aufgaben und Essen anzuschließen heißt später, den `if`-Zweig zu erweitern und einen Trigger zu setzen — keine zweite Policy, kein zweites Abo, kein zweiter Kanal.

Weil der Trigger die **alte Zeile noch sieht**, trägt auch ein DELETE `family_id` und `event_id`. Damit fällt die Fallunterscheidung aus ADR-028 Decision 4 ersatzlos weg.

**Kosten, die im SQL kommentiert gehören:** Jede Termin-Mutation schreibt zusätzlich eine Zeile in `realtime.messages` — etwas Schreiblatenz pro Mutation statt WAL-Mitlesen ohne Trigger. Supabase partitioniert die Tabelle tagesweise und löscht Partitionen älter als drei Tage selbst. `replica identity full` bleibt aus und ist jetzt endgültig gegenstandslos, weil `OLD` aus dem Trigger kommt und nicht aus dem WAL (korrigiert ADR-028 Decision 6).

---

## 4. Die Sync-Schicht — `features/realtime/`

```text
features/realtime/
├─ topic.ts               familyTopic(familyId) → `family:<id>`
├─ normalize.ts           Broadcast-Payload → FamilyChange
├─ subscribe.ts           subscribeToFamilyChanges({ client, familyId, onChange, onStatus })
├─ coalesce.ts            mergeInvalidationKeys(changes[]) → QueryKey[]
├─ reconnect.ts           shouldRefetchAfterResubscribe(prev, next) · isDegraded(status, elapsedMs)
├─ status.ts              Zustand-Store: status · degraded
├─ dispatch.ts            FamilyChange[] → QueryKey[] (kennt die Feature-Mapper)
├─ useFamilyRealtime.ts   der eine Hook
└─ index.ts
```

`topic` · `normalize` · `subscribe` · `coalesce` · `reconnect` importieren **kein** Feature und bleiben damit unter `bun test` ladbar. Nur `dispatch.ts` kennt den Kalender.

[features/calendar/realtime.ts](../../decision-log.md#adr-028--realtime-für-den-kalender-ein-kanal-pro-familie-delete-bleibt-unzuordenbar-2026-09-01) und sein Test entfallen; das Barrel `features/calendar/index.ts` verliert den Re-Export.

### 4.1 Typen

```ts
export type FamilyChangeType = "INSERT" | "UPDATE" | "DELETE";

export interface FamilyChange {
  /** `TG_TABLE_NAME` aus dem Trigger. Bewusst `string`: die Sync-Schicht kennt
   *  die Tabellen der Features nicht, die Mapper prüfen selbst. */
  table: string;
  type: FamilyChangeType;
  /** Primärschlüssel der betroffenen Zeile — bei DELETE aus `old_record`.
   *  Anders als unter `postgres_changes` ist er **nie** die einzige Information. */
  rowId: string | null;
  record: Record<string, unknown> | null;
  oldRecord: Record<string, unknown> | null;
  receivedAt: number;
}
```

`CalendarChange.eventId: string | null` aus ADR-028 entfällt mit seinem Modul — die Null-Variante war die DELETE-Lücke, und die gibt es nicht mehr.

Der Statustyp heißt `RealtimeStatus` (`idle` · `subscribing` · `subscribed` · `timedOut` · `error` · `closed`) und wohnt samt `toRealtimeStatus()` in `status.ts`, weil der Store ihn hält und `subscribe.ts` wie `reconnect.ts` ihn nur benutzen. `idle` bleibt wie in ADR-028 Decision 9 **abgeleitet**, nicht gespeichert.

### 4.2 Subscribe

```ts
export async function subscribeToFamilyChanges({
  client,
  familyId,
  onChange,
  onStatus,
  now,
}: SubscribeArgs): Promise<() => void> {
  // Pflicht für Realtime Authorization: ohne setAuth() kennt der Socket den
  // Zugriffstoken nicht, und die RLS-Policy auf realtime.messages lehnt den
  // Join ab. Korrigiert die Notiz in ADR-028, ein setAuth() sei verzichtbar —
  // für `postgres_changes` stimmte sie, für private Kanäle nicht.
  await client.realtime.setAuth();

  const channel = client.channel(familyTopic(familyId), { config: { private: true } });
  for (const type of ["INSERT", "UPDATE", "DELETE"] as const) {
    channel.on("broadcast", { event: type }, (payload) => {
      onChange(normalizeBroadcast(type, payload, now));
    });
  }
  onStatus?.("subscribing");
  channel.subscribe((state) => onStatus?.(toRealtimeStatus(state)));
  return () => {
    void client.removeChannel(channel);
  };
}
```

Der Rückgabewert ist die Abmeldung. Die Funktion ist jetzt `async` — der Aufrufer im Effekt muss deshalb den Abbruch behandeln, wenn das `await` erst nach dem Unmount durchläuft (Decision 8).

Der Kanal wird bei jedem Effekt-Lauf frisch erzeugt und im Cleanup entsorgt, nie wiederverwendet: React hängt im StrictMode jeden Effekt einmal ab und wieder an, und ein zweites `subscribe()` auf demselben Kanal wirft.

### 4.3 Der Mountpunkt

`useFamilyRealtime()` wird **einmal** in `ThemedStack` aufgerufen ([app/\_layout.tsx](../../../app/_layout.tsx)), neben `useFlushPendingDeletes()` und **vor** `<AuthGate>`: Der Gate rendert bei Redirects `<Redirect>` statt seiner Kinder, ein Abo darunter würde bei jedem Routenwechsel ab- und wieder aufgebaut. Der Hook liest `useCurrentParent()`; ohne `family_id` (abgemeldet, Onboarding) passiert nichts.

### 4.4 Sammelfenster

Eingehende Änderungen laufen in eine Ref, ein `setTimeout` von **300 ms** schließt das Fenster, dann ein Durchgang: `dispatch` bildet je Änderung die Schlüssel, `mergeInvalidationKeys` die Vereinigung, `qc.invalidateQueries` läuft je Schlüssel einmal.

Der Gewinn ist nicht Kosmetik: Ein Serien-Delete mit Scope `this` schreibt eine Exception **und** rührt die Master-Zeile an, ein Scope-Wechsel schreibt mehrere Zeilen. Ohne Fenster wären das drei bis vier Refetches derselben Range-Query.

---

## 5. Der Kalender-Mapper — `features/calendar/realtimeKeys.ts`

```ts
export function calendarInvalidationKeys(change: FamilyChange): QueryKey[] {
  if (change.table !== "events" && change.table !== "event_exceptions") return [];
  const eventId =
    change.table === "events"
      ? change.rowId
      : stringField(change.record ?? change.oldRecord, "event_id");
  return eventId ? [calendarKeys.eventsRoot, calendarKeys.one(eventId)] : [calendarKeys.eventsRoot];
}
```

`calendarKeys` bekommt zwei Präfix-Konstanten dazu:

```ts
eventsRoot: ["calendar", "events"] as const,   // deckt jede range(start, end)
oneRoot:    ["calendar", "event"] as const,    // deckt jede one(id)
```

Bewusst **nicht** `calendarKeys.all`: Das ist der Präfix `["calendar"]` und zöge `types` und `reminders` mit, die von einer Termin-Änderung nie betroffen sind — `event_types` ist eine Nachschlagetabelle, `reminders` eine eigene Tabelle ohne Trigger.

Die bestehenden `onSettled`-Blöcke in [mutations.ts](../../../features/calendar/mutations.ts) und [createMutation.ts](../../../features/calendar/createMutation.ts) bleiben auf `calendarKeys.all`. Sie zu verengen wäre richtig, ist aber eine eigene Änderung mit eigenem Risiko und geht als Zeile nach `docs/TODO.md`.

---

## 6. Die Overlays bleiben unangetastet

Die Sorge in `docs/TODO.md` und ADR-028 Decision 1 — eine eingehende Invalidierung müsse sich mit `pendingDeletes` und `optimisticEvents` „vertragen" — trifft ein Design, das ADR-027 ausdrücklich **nicht** gewählt hat.

- **Offene Löschung (ADR-026).** Die Mutation ist verzögert, nicht ausgeführt: Die Zeile steht serverseitig noch und kam auch bisher mit jedem Refetch zurück. `withoutPendingDeletes` filtert sie aus dem frisch geladenen Satz genauso heraus wie aus dem alten ([hooks.ts:81-86](../../../features/calendar/hooks.ts#L81-L86)). Ein Realtime-Refetch mitten im Undo-Fenster ist folgenlos.
- **Optimistischer Eintrag (ADR-027).** Das Overlay patcht das **Ergebnis** der Expansion, nicht den Query-Cache. Ein Refetch zwischen `onMutate` und Server-Antwort liefert Daten ohne die Zeile — sichtbar bleibt sie trotzdem, weil `withOptimistic` danach läuft. `onSettled` gibt den Eintrag weiterhin erst nach seiner eigenen Invalidierung frei; daran ändert sich nichts.
- **Eigene Echos.** Werden **nicht** unterdrückt. Ein zusätzlicher Refetch nach der eigenen Mutation ist nie falsch, nur doppelt, und das Sammelfenster fängt den Großteil ab. Eine Unterdrückung bräuchte einen Actor im Payload und verschluckte fremde Änderungen, die zufällig im selben Fenster liegen — mehr Risiko als Gewinn.

Diese Analyse gehört in den ADR, nicht nur in den Code: Sie ist der Grund, warum an der auffälligsten Stelle des Issues **nichts** steht.

---

## 7. Reconnect und Sichtbarkeit

**Nachholen.** Verpasste Broadcasts werden nicht nachgeliefert — nach jeder Unterbrechung ist der Cache stumm veraltet. Ein Statuswechsel _zurück_ auf `subscribed` (also aus `closed`/`timedOut`/`error`, **nicht** beim ersten Abonnieren) invalidiert deshalb einmalig `calendarKeys.eventsRoot` und `calendarKeys.oneRoot` — die Schlüsselmenge, die ein Broadcast hätte tragen können. Die Entscheidung steckt in `shouldRefetchAfterResubscribe(prev, next)` und ist damit prüfbar. Ein eigenes `AppState`-Handling braucht es nicht: Beim Zurückholen der App bricht der Socket ohnehin ab und baut sich neu auf — derselbe Übergang.

**Sichtbarkeit.** `isDegraded(status, elapsedMs)` ist wahr, wenn der Kanal **länger als 10 Sekunden** nicht `subscribed` ist. Die Schwelle ist der Punkt: Ein normaler Reconnect nach Bildschirmsperre dauert unter einer Sekunde; ohne sie blitzte bei jedem App-Wechsel ein Banner auf.

`<SyncNotice />` in [app-sections/shared/](../../../app-sections/shared/) — eine schmale Zeile unter der `TopBar` auf **Kalender und Dashboard**, den beiden Screens mit Termindaten. Gebaut aus `Icon` (`alert-triangle`, laut [docs/ICONS.md](../../ICONS.md) die Warn-Rolle), `Text` und den Warn-Tokens des Themes. Kein neues Pattern, keine neue Farbe, kein Overlay, kein Blockieren der Interaktion.

**Copy.** Zwei neue Keys, Du-Form, in beiden Katalogen:

| Key                  | DE                                                      | EN                                        |
| -------------------- | ------------------------------------------------------- | ----------------------------------------- |
| `sync.offline.title` | Keine Verbindung                                        | No connection                             |
| `sync.offline.hint`  | Du siehst möglicherweise nicht die neuesten Änderungen. | You may not be seeing the latest changes. |

Das Namespace ist `sync.*` und nicht `cal.*`, weil der Kanal familienweit ist und Aufgaben und Essen später dieselbe Zeile benutzen werden. **`docs/COPY.md` bekommt den passenden Deck-Eintrag** — die Datei gehört dem Designer und ist sonst gesperrt; die Bearbeitung ist für diesen Eintrag ausdrücklich freigegeben (Konversation vom 2026-09-01). Ein Katalog-Key ohne Deck-Eintrag wäre genau die stille Divergenz, die die Regel verhindern soll.

---

## 8. Debug-Screen

[RealtimeDebugScreen](../../../app-sections/debug/RealtimeDebugScreen.tsx) zieht auf den neuen Transport um: Topic `family:<id>`, Status aus dem Store, Liste der rohen `FamilyChange`-Objekte mit Tabelle, Typ und Row-Id. Der `__DEV__`-Redirect-Guard und die hartkodierte Copy bleiben (ADR-028 Decisions 7 und 8). Der Screen ist das Fenster, das #52 für die Conflict-Detection braucht.

---

## 9. Tests

Alle unter `bun test`, alle rein:

| Datei                                    | Prüft                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| `features/realtime/topic.test.ts`        | `familyTopic`                                                                               |
| `features/realtime/normalize.test.ts`    | Alle drei Operationen; fehlende `record`/`old_record`; Nicht-String-Ids; `receivedAt`       |
| `features/realtime/coalesce.test.ts`     | Dedup über einen Serien-Delete; leere Eingabe; Reihenfolgestabilität                        |
| `features/realtime/reconnect.test.ts`    | `shouldRefetchAfterResubscribe` (erstes Abo → nein, Wiederkehr → ja); `isDegraded`-Schwelle |
| `features/calendar/realtimeKeys.test.ts` | `events` vs. `event_exceptions`; DELETE mit `old_record`; fremde Tabelle → `[]`             |

`features/calendar/realtime.test.ts` entfällt mit seinem Modul. `useFamilyRealtime` selbst bleibt ungetestet — dieselbe Lücke wie bisher (kein Render-Pfad für RN-Komponenten unter `bun test`), sie bleibt in `docs/TODO.md` stehen.

---

## 10. Prüfung

1. `bun format:check` → `bun lint` → `bun run typecheck` → `bun test` → `bunx expo export --platform web`
2. **Migration anwenden** über den Supabase-MCP-Server, danach der Versions-Abgleich aus `supabase/SETUP.md` §3 (der MCP-Server vergibt einen eigenen Timestamp und ignoriert den Dateinamen). Braucht einen gültigen PAT in `.env.local`; fehlt er, geht die Migration wie bei ADR-028 unangewendet in den Commit und wird als Consequence vermerkt.
3. **Zwei-Fenster-Lauf im Web-Bundle**: zwei angemeldete Browserprofile derselben Familie, Termin in A anlegen / ändern / löschen, Ankunft in B beobachten. Zusätzlich der Gegenbeweis: ein drittes Profil einer **anderen** Familie darf nichts sehen.
4. **iOS-Simulator**: Sichtung von `<SyncNotice />` (Flugmodus an, 10 s warten) und des Debug-Screens — den hat nativ laut `docs/TODO.md` noch nie jemand gesehen.
5. `coderabbit review --base main` vor dem PR.

---

## 11. Decisions

1. **Broadcast from Database statt Postgres Changes.** `postgres_changes` wendet RLS nicht auf DELETE an: Der Payload trägt nur die Row-Id, und das Ereignis erreicht jeden angemeldeten Client. Das ist zweierlei — funktional keine gezielte Invalidierung, datenschutzseitig Existenz und Zeitpunkt fremder Löschungen —, und dazu eine Lastverstärkung: Jede Löschung irgendwo löst bei jedem Client einen Refetch aus. Der Trigger sieht die alte Zeile noch und gibt `family_id` **und** `event_id` mit; die Autorisierung läuft über RLS auf `realtime.messages`. Supabase führt Broadcast inzwischen selbst als die empfohlene Methode. Löst ADR-028 Decisions 3 und 4 ab.

2. **Ein Topic pro Familie: `family:<familyId>`, nicht `calendar:<familyId>`.** Ein WebSocket-Abo statt eines pro Feature, eine RLS-Policy statt einer pro Feature, und Aufgaben oder Essen anzuschließen ist später ein Trigger. Preis: Der Kalender-Client bekommt Ereignisse zugestellt, die ihn nichts angehen, und filtert sie in `dispatch` weg — bei einer Familie eine vernachlässigbare Menge. Löst ADR-028 Decision 2 ab.

3. **Die Tabellen verlassen die Publikation.** Ohne diesen Schritt bliebe das Leck offen, egal was der Client tut: Jeder angemeldete Nutzer könnte `postgres_changes` selbst abonnieren. Der Verschluss gehört in die Datenbank, nicht in eine Konvention.

4. **Ein Mountpunkt statt einer Subscription pro Hook.** `useFamilyEvents` hat drei Aufrufer, zwei davon dauerhaft gemountet. Der Issue-Titel wird damit nicht wörtlich erfüllt; sein Ziel — „Kalender-Query invalidiert sich automatisch" — schon, und zwar für alle drei Aufrufer statt dreifach.

5. **Kein Sonderfall für die Overlays, keine Echo-Unterdrückung.** Begründung in §6. Die auffälligste Sorge des Issues löst sich am Design von ADR-026 und ADR-027 auf, nicht an neuem Code.

6. **Invalidierung auf `["calendar","events"]` + `one(id)`, nicht auf `calendarKeys.all`.** Der `all`-Präfix zöge `types` und `reminders` mit, die eine Termin-Änderung nie betrifft.

7. **300 ms Sammelfenster.** Eine Scope-Löschung fasst mehrere Zeilen an; ohne Fenster wären das mehrere Refetches derselben Query. Die Verzögerung liegt unter der Wahrnehmungsschwelle für „sofort".

8. **`subscribeToFamilyChanges` ist `async`.** `setAuth()` ist für private Kanäle Pflicht und asynchron. Der Effekt muss deshalb einen Abbruch-Marker führen: Läuft das `await` erst nach dem Unmount durch, wird der eben erzeugte Kanal sofort wieder entfernt, statt verwaist stehen zu bleiben.

9. **Die Sync-Schicht steht über den Features.** `features/realtime/dispatch.ts` importiert `features/calendar`; die Primitive darunter importieren kein Feature. Die Alternative — eine Registry, bei der jedes Feature sich beim Laden anmeldet — wäre ein impliziter Seiteneffekt beim Modul-Import und in Tests schwerer zu fassen als ein expliziter Import.

10. **`sync.*` statt `cal.*` für die Offline-Copy**, weil der Kanal familienweit ist und die Zeile später für Aufgaben und Essen dieselbe sein wird.

---

## 12. Folgen für die Dokumentation

- **ADR-030** im Decision-Log: löst ADR-028 in den Decisions 2, 3, 4 und 6 ab; 5, 7, 8 und 9 bleiben gültig. ADR-028 wird **nicht** bearbeitet.
- **`docs/architecture.md`**: Realtime-Abschnitt auf Broadcast + familienweites Topic umschreiben.
- **`CLAUDE.md`**: Realtime-Satz im Tech-Stack-Absatz, neuer Ordner `features/realtime/` in der Ordnerstruktur, `sync.*` in der i18n-Aufzählung.
- **`docs/COPY.md`**: Deck-Eintrag für `sync.*` (ausdrücklich freigegeben).
- **`docs/TODO.md`**: Es entfallen die Zeilen zu „`useFamilyEvents` abonniert den Kanal noch nicht", „DELETE-Ereignisse sind keinem Event zuzuordnen", „Kein sichtbares Scheitern nach dauerhaftem Verbindungsverlust" und — nach der Simulator-Sichtung — „Der Debug-Screen ist nur auf Web gesichtet". Es bleibt die Zeile zum ungetesteten Hook (umbenannt auf `useFamilyRealtime`). Neu dazu: die verengte Invalidierung der Mutations-`onSettled`-Blöcke.

---

## 13. Was diese Iteration nicht liefert

- **Keine Conflict-Detection.** Zwei gleichzeitige Edits derselben Zeile gewinnt weiterhin der letzte Schreiber. Das ist #52.
- **Kein Live-Sync für Aufgaben und Essen.** Der Kanal trägt sie, der Trigger nicht. Ein späteres Issue setzt einen Trigger und einen Mapper — mehr nicht.
- **Kein Nachliefern verpasster Ereignisse.** Der Reconnect-Refetch holt den _Zustand_ nach, nicht die Ereignisse. Broadcast Replay wäre eine eigene Entscheidung.
- **Keine Anzeige, _wer_ etwas geändert hat.** Der Payload trüge es, die UI zeigt es nicht — das wäre ein Designer-Thema ohne Pattern.
