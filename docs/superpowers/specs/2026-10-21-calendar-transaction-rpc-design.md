# Transaktions-RPC für den Kalender und lokale Supabase (Block 7) — Design

**Status:** Approved (Brainstorming)
**Date:** 2026-10-21
**Auftrag:** [docs/roadmap.md](../../roadmap.md) → [Block 7 — Transaktions-RPC für den Kalender](../../roadmap.md#block-7--transaktions-rpc-für-den-kalender)
**Decision-Log:** ein ADR (044) am Branch-Ende. Er löst die „bewusste Grenze" aus ADR-031 ab, ADR-031 selbst bleibt unverändert.

## 1. Worum es geht

Vier Lücken, alle mit derselben Ursache: Ein Speichervorgang besteht aus mehreren unabhängigen Schreibzugriffen, und der Server weiß nicht, was der Client gesehen hat.

1. **Fünf Schreib-Ops prüfen nicht beim Schreiben.** `modifyOccurrence`, `cancelOccurrence`, `deleteMaster`, `setRruleCount` und `setRruleUntil` in `createSupabaseEventOps` ([features/calendar/recurrence.ts](../../../features/calendar/recurrence.ts)) schreiben unbedingt. Der Pre-Flight in `updateEvent`/`deleteEvent` ([mutations.ts](../../../features/calendar/mutations.ts)) prüft nur gegen den Stand, den er selbst eine Zeile vorher gelesen hat. Was danach kommt, überschreibt der letzte Schreiber still.
2. **Das Verlustfenster beim Regelwechsel.** `applyEditScope` löscht im Zweig `recurrence` zuerst alle Exceptions und schreibt dann per Compare-and-Swap den Master. Scheitert der zweite Schritt an einer fremden Änderung, sind die Exceptions weg und die Regel ist alt.
3. **„Erneut versuchen" ist nicht idempotent** (Issue [#111](https://github.com/SvenSonnborn/ElternFlowAI/issues/111), Serverhälfte). Ging der erste Versuch durch und nur die Antwort verloren, legt der Retry einen Termin doppelt an oder teilt eine Serie ein zweites Mal.
4. **Aufgabe löschen ohne Rechte sieht aus wie Erfolg.** `deleteTask` ([features/tasks/mutations.ts](../../../features/tasks/mutations.ts)) hält null getroffene Zeilen plus leere Nachlese für „schon gelöscht". Wurde der Elternteil währenddessen aus der Familie entfernt, liefert RLS genau dasselbe Bild. `docs/TODO.md` hat den Eintrag ausdrücklich auf diesen Block vertagt.

Dazu kommt, was diese Arbeit erst sicher macht: **eine lokale Supabase.** Bisher ging jede Migration ungetestet direkt ins Live-Projekt (Schema-Plan vom 29.05.: „direkt gegen die Remote-DB via MCP … keine lokale Supabase-Instanz nötig"). Live gibt es nur ein Projekt, und darauf liegen Svens echte Familiendaten.

## 2. Svens Vorgaben

- **Alles in diesem Branch** (`fix/calendar-transaction-rpc`): lokale Supabase, die vier Lücken, Sicherheitsdurchgang.
- **Die lokale Supabase ist identisch mit der Live-Version.** Was zum Prüfen fehlt, wird bei Sven erfragt.
- **Claude macht alles, auch die Live-Migration.** Reihenfolge: entwickeln → lokal testen → Abnahme durch Sven → Claude spielt die Migration live ein → Merge. Sven führt selbst nichts aus.
- **Sicherheit auf aktuellem Stand:** Policies, Rechte und Funktionen sollen einem Angriff standhalten, nicht nur funktionieren.

## 3. Ziele, Nicht-Ziele, Anti-Ziele

**Ziele**

1. Eine lokale Supabase in Docker, reproduzierbar aus dem Repo, nachweislich gleich mit live (Abschnitt 4).
2. Jede Änderung an einem bestehenden Termin läuft als **eine** Transaktion, die vor dem ersten Schreibzugriff Master und betroffene Exception gegen den gesehenen Stand prüft (Abschnitt 5).
3. Jeder Schreibvorgang im Kalender ist bei Wiederholung idempotent: Anlegen, Bearbeiten und Löschen in allen Scopes (Abschnitt 6).
4. Das Löschen einer Aufgabe unterscheidet „gelöscht", „schon weg" und „keine Berechtigung mehr" (Abschnitt 7).
5. Sicherheitsdurchgang über alles Neue und über die Befunde des Supabase-Security-Advisors (Abschnitt 8).
6. Datenbank-Tests laufen lokal und in der CI (Abschnitt 9).

**Nicht-Ziele** (bleiben bzw. kommen in `docs/TODO.md`)

- Die zweite Hälfte von #111: `onSettled` räumt den optimistischen Eintrag ab, obwohl `invalidateQueries` auch bei gescheitertem Refetch auflöst. Laut Roadmap eine eigene Runde am Overlay-Modell (ADR-027 Decision 1).
- Die 🎨-Lücken im Konflikt-Dialog: Er zeigt nicht, dass ein Regelwechsel alle Exceptions löscht oder dass die andere Seite die Occurrence abgesagt hat. Beides braucht Copy-Keys des Designers.
- Andere Schreibwege (Aufgaben speichern, Essensplan, Familie) auf RPCs umstellen.
- Native Läufe (iOS/Android) gegen die lokale Supabase. Der Zwei-Client-Lauf läuft im Web.
- Die Performance-Hinweise des Advisors (13 Fremdschlüssel ohne Index, 14 ungenutzte Indizes): ein TODO-Eintrag, kein Teil dieses Blocks.

**Anti-Ziele.** Daran scheitert der Block, auch wenn alles andere funktioniert:

- Echte Familiendaten landen in der lokalen Datenbank, oder ein Test schreibt ins Live-Projekt. Auf live wird nur beim Rollout geschrieben, und nur Schema und Konfiguration (4.2, 10).
- Ein Retry führt eine Operation zweimal aus, oder ein Konflikt hinterlässt einen halben Schreibvorgang.
- Die Live-Migration bricht den Code, der dann noch auf `main` liegt. Sie läuft vor dem Merge und muss rückwärtskompatibel sein.
- RLS wird umgangen oder aufgeweicht, etwa durch eine `security definer`-Funktion, die Familiengrenzen selbst nachbaut.
- Neue UI-Texte ohne Designer. `docs/COPY.md` gehört ihm, die Oberfläche bleibt wie sie ist.

## 4. Lokale Supabase

### 4.1 Einrichtung

- **Supabase-CLI** über `mise.toml` gepinnt, wie Node, Bun und Java (ADR-016). Vor dem Pin prüfen, dass das GitHub-Release der Version existiert (Lehre aus dem mise-Pin in `native-build.yml`).
- **`supabase/config.toml`** eingecheckt.
  - Postgres-Major gleich live (17).
  - Die über die API freigegebenen Schemas wie live.
  - Auth-Einstellungen wie live (4.2).
  - Nicht gebrauchte Dienste abgeschaltet, Liste vom Builder; Auth, REST, Realtime und Datenbank bleiben an.
- **`supabase/seed.sql`**:
  - eine Testfamilie mit zwei Eltern (A, B, bestätigte Accounts) und mindestens einem Kind
  - ein Einzeltermin, eine unbegrenzte Wochenserie mit einer `modified`-Exception, eine zählbegrenzte Serie
  - zwei Aufgaben

  Die Passwörter gelten nur lokal und stehen in `supabase/SETUP.md`.

- **Docker Desktop** muss laufen. Claude darf es starten (`open -a Docker`).
- **Zweites Metro, Solo-Prozess „Metro (lokal)"**:
  - Port 8082, `EXPO_PUBLIC_SUPABASE_URL` und Anon-Key der lokalen Instanz.
  - Läuft über `mise exec --` wie alle Solo-Befehle. Sven gibt ihn einmal im Solo-UI frei.
  - Der Builder stellt sicher, dass die beiden Metro-Instanzen keine gecachten Bundles mit der falschen URL tauschen: Expo inlined `EXPO_PUBLIC_*` beim Transformieren. Beleg vor jedem Lauf: Das auf 8082 ausgelieferte Bundle enthält die lokale URL und nicht die Live-URL.
- **Abgleich der Migrationsversionen** (`supabase/SETUP.md` §3): Zwei Dateien tragen lokal einen anderen Zeitstempel als live.

  | Lokale Datei                                    | Version live     |
  | ----------------------------------------------- | ---------------- |
  | `20260909115403_events_timezone.sql`            | `20260909115548` |
  | `20260909131523_events_timezone_iana_widen.sql` | `20260909131554` |

  Beide werden auf die Live-Version umbenannt. Der Pfad in ADR-033 wird als redaktionelle Reparatur nachgezogen.

### 4.2 „Identisch" heißt

Gleich sein müssen **Schema und Konfiguration**, nicht die Daten (meine Entscheidung: Echte Familiendaten verlassen das Live-Projekt nie). Im Einzelnen:

- **Datenbank:** Tabellen und Spalten (Typ, Nullbarkeit, Default), Constraints, Indizes, RLS-Schalter (`enable` und `force`), Policies (Befehl, Rollen, `using`, `with check`), Funktionen (Definition, `security definer`, `search_path`, Rechte), Trigger, Tabellenrechte, Publikationen, Extensions mit Version, Policies auf `realtime.messages`.
- **Migrationshistorie:** Dateinamen = Versionen in `supabase_migrations.schema_migrations`.
- **Auth:**
  - Registrierung erlaubt ja/nein
  - E-Mail-Bestätigung
  - Passwortregeln
  - JWT-Laufzeit
  - OTP-Laufzeit
  - sichere Passwortänderung
  - Redirect-URLs, soweit lokal sinnvoll
  - Schutz vor geleakten Passwörtern

**Erlaubte Abweichungen** stehen als Liste mit Begründung in `supabase/SETUP.md`. Erwartet sind:

- Postgres-Minor
- vom Plattform-Image mitgebrachte Extensions (live z. B. `pg_stat_statements`)
- `site_url`
- SMTP, lokal Mailpit
- die Seed-Daten

Alles andere ist ein Befund und wird behoben, bevor Block-7-Code entsteht. **Maßstab ist live,** denn das ist, was läuft (meine Entscheidung):

- **Live hat etwas, das die Migrationen nicht erzeugen** (z. B. eine Änderung im Dashboard): Es kommt als idempotente Nachzieh-Migration ins Repo. Lokal stellt sie den Live-Stand her. Live wird sie beim Rollout zusammen mit der Block-7-Migration eingespielt, damit die Historien gleich bleiben, und ändert dort nichts.
- **Die Migrationen erzeugen etwas, das live fehlt oder anders ist:**
  - Fehlt es live, ist das ein Fehler auf live. Die Korrektur gehört in die Block-7-Migration, und der ADR nennt sie.
  - Ist es live nur anders, weil eine Datei nach dem Einspielen geändert wurde, wird die Datei nach dem Kriterium aus ADR-030 Decision 16 korrigiert.
- **Schreibzugriffe auf live** sind damit ausschließlich Migrationen und die eine Auth-Einstellung aus Abschnitt 8. Alle laufen beim Rollout (Abschnitt 10), keiner vorher, und keiner berührt Familiendaten.

### 4.3 Der Abgleich

- **`supabase/parity.sql`:** eine Abfrage über `pg_catalog`, die die Punkte aus 4.2 als sortierte, normalisierte Zeilen ausgibt. Funktionsrümpfe gehen als Hash ein, damit die Ausgabe vergleichbar bleibt. Claude fährt sie live über den Supabase-MCP (nur lesend) und lokal gegen die Docker-Datenbank und vergleicht die Ausgaben.
- **Auth-Konfiguration** über die Management-API (`GET /v1/projects/{ref}/config/auth`) mit dem PAT, der schon in `.env.local` liegt. Ausgaben mit Geheimnissen (SMTP, Hooks, externe Provider) werden vor dem Vergleich herausgefiltert und nie geloggt.
- **Zusätzlich, wenn die CLI es ohne Datenbank-Passwort kann:** `supabase db diff` bzw. `db dump` gegen das verlinkte Projekt als zweite, unabhängige Meinung. Will die CLI das Passwort, fragt Claude Sven danach. Es gehört dann in `.env.local` und wird nie committet.
- **Der Abgleich läuft dreimal:**
  1. Nach der Einrichtung, vor dem ersten Block-7-Code.
  2. Vor der Live-Migration.
  3. Nach der Live-Migration.

## 5. Die Transaktions-RPC

### 5.1 Form

Die Logik, _welche_ Schritte ein Scope braucht, bleibt im Client: `applyEditScope` und `applyDeleteScope` mit ihren Grenzfällen (Anker, `consumedBefore`, `endOfDayInstant`, Zeitzonen). RRULE-Expansion in SQL nachzubauen hieße, getestete Logik zu verdoppeln. Neu ist ein **aufzeichnender `EventOps`** (`createRecordingEventOps`). Er führt nichts aus, sondern sammelt die Aufrufe als Schritte. `updateEvent`/`deleteEvent` schicken diese Schritte dann in **einem** Aufruf an `public.apply_event_change`, die sie in einer Transaktion ausführt (meine Entscheidung).

```
apply_event_change(
  p_request_id                uuid,
  p_event_id                  uuid,
  p_occurrence_key            date,
  p_seen_master_updated_at    timestamptz,
  p_seen_exception_updated_at timestamptz,   -- null = „an diesem Schlüssel lag keine Exception"
  p_steps                     jsonb          -- Array, siehe 5.3
) returns text                               -- 'applied' | 'already_applied'
```

### 5.2 Ablauf in der Funktion

1. Ohne `auth.uid()` (anonym) → Abbruch.
2. `p_request_id` **zuerst** verbuchen, in derselben Transaktion (`insert … on conflict do nothing`). Ist sie schon da → `'already_applied'`, ohne weitere Prüfung (Abschnitt 6). Weil der Eintrag am Anfang steht, wartet ein zweiter, gleichzeitiger Aufruf mit derselben Kennung (ein Retry, während der verlorene erste Versuch noch läuft) am eindeutigen Schlüssel auf den ersten. Committet der erste, meldet der zweite `'already_applied'`. Rollt der erste zurück, läuft der zweite normal weiter. Stünde die Verbuchung am Ende, meldete der zweite einen Konflikt gegen die eigene, erfolgreiche Änderung.
3. Master mit `for update` sperren. Fehlt die Zeile (gelöscht oder per RLS unsichtbar) → Fehler „nicht gefunden".
4. Exception an `p_occurrence_key` mit `for update` sperren, immer in der Reihenfolge Master vor Exception, damit sich zwei Transaktionen nicht gegenseitig blockieren.
5. Master-`updated_at` ≠ `p_seen_master_updated_at`, oder der Exception-Stand ≠ `p_seen_exception_updated_at` → Fehler „Konflikt". Der Exception-Stand zählt als abweichend, wenn eine Zeile neu da ist, verschwunden ist oder sich geändert hat. Ein Fehler rollt auch die Verbuchung aus Schritt 2 zurück, es bleibt also nichts stehen.
6. Schritte der Reihe nach ausführen. Scheitert einer, rollt die Transaktion alles zurück. Das schließt Lücke 2.
7. `'applied'` zurückgeben.

„Nicht gefunden" und „Konflikt" haben je einen eigenen, dokumentierten SQLSTATE außerhalb der Postgres-Standardklassen. Die Codes wählt der Builder. Der Client bildet sie auf die bestehenden Fehler ab:

- **Konflikt:** Der Client liest nach (`fetchEventById`, dieselbe Zeilenform wie heute) und wirft `EventConflictError(row)`. Die Zeilenform hat damit weiter genau eine Heimat (`EVENT_SELECT`).
- **Nicht gefunden:** `EventNotFoundError`.

Der Konflikt-Dialog, „Trotzdem löschen" und alle Toasts bleiben unverändert.

### 5.3 Die Schritte

Erlaubt sind genau die Operationen aus `EventOps`, als Objekte `{ "op": "...", ... }`:

| `op`                     | Argumente                        |
| ------------------------ | -------------------------------- |
| `update_master`          | `changes`, optional `recurrence` |
| `modify_occurrence`      | `override`                       |
| `cancel_occurrence`      | —                                |
| `delete_master`          | —                                |
| `delete_all_exceptions`  | —                                |
| `delete_exceptions_from` | —                                |
| `set_rrule_until`        | `until`                          |
| `set_rrule_count`        | `count`                          |
| `insert_split_event`     | `changes`, `rrule_count`         |

Regeln (alle serverseitig erzwungen):

- **Kein Schritt trägt eine Event-ID oder einen Occurrence-Schlüssel.** Alle wirken auf `p_event_id`, und `modify_occurrence`, `cancel_occurrence` und `delete_exceptions_from` nehmen `p_occurrence_key`. Ein Aufruf kann also weder einen zweiten Termin anfassen noch auf eine Exception schreiben, die die Prüfung in 5.2 nicht abgedeckt hat. Heute rufen `applyEditScope`/`applyDeleteScope` diese drei Ops ohnehin immer mit dem Schlüssel der bearbeiteten Occurrence auf. Der aufzeichnende `EventOps` prüft das und wirft bei einem anderen Schlüssel, statt ihn still zu ersetzen.
- **`insert_split_event` übernimmt** Familie, Typ, Kind, Elternteil, `all_day`, Zone, Regelfelder, `rrule_until` und `created_by` aus dem gesperrten Master, nicht vom Client. Vom Client kommen nur `changes` und `rrule_count`. Das spiegelt `insertSplitEvent` heute.
- **Whitelist.** Unbekannte `op` oder unbekannte Schlüssel in `changes`, `recurrence` oder `override` → Abbruch mit `22023`.
  - `changes` und `override`: `title`, `start_at`, `end_at`, `location`, `description`.
  - `recurrence`: die fünf `rrule_*`-Felder.
- **Höchstens 4 Schritte** je Aufruf (heute braucht kein Pfad mehr als 3), und nur ein Element-Typ: Objekt.
- Die bestehenden Tabellen-Constraints (`events_rrule_count_xor_until`, Zonen-Regex, Längen) gelten unverändert. Ihre Verletzung bricht die ganze Transaktion ab.

### 5.4 Der Client

- **Bleibt:** `applyEditScope`/`applyDeleteScope` mit allen ihren Tests. Sie bekommen nur einen anderen `EventOps`.
- **Entfällt:**
  - der Versionsvergleich in `updateEvent`/`deleteEvent`, er wandert in die Funktion
  - das clientseitige Compare-and-Swap mit Nachlese in `updateMaster`
  - `createSupabaseEventOps` als ausführende Implementierung

  Der Fetch des Masters bleibt, weil die Schritte aus ihm berechnet werden. Die Funktion prüft gegen `baseVersion`, also das, was das Formular gesehen hat. Weil `updated_at` nie zurückläuft, prüft das zugleich, dass die Schritte aus einem unveränderten Master berechnet wurden.

- **`baseVersion`** (`occurrenceVersion`, [version.ts](../../../features/calendar/version.ts)) wird in die beiden Zeitstempel zerlegt. Das passiert neben `occurrenceVersion`, damit das Format eine Heimat hat.

### 5.5 Grenze: andere Occurrences derselben Serie

Die Prüfung deckt Master und **eine** Exception ab, die an `p_occurrence_key`. Das ist der Zuschnitt aus ADR-031 und die Definition of Done der Roadmap. `delete_all_exceptions` (Regelwechsel) und `delete_exceptions_from` („dieser und folgende") löschen aber auch Exceptions **anderer** Occurrences.

Ändert B die Occurrence Y, während A von X aus den Rhythmus ändert, ändert B's Schreibzugriff `events.updated_at` nicht. Die Funktion sieht also keinen Konflikt, und B's Änderung an Y fällt weg, so wie heute.

Das bleibt so (meine Entscheidung). Ein Regelwechsel verwirft alle Exceptions per Definition: Hätte B seine Änderung eine Minute früher gemacht, wäre sie genauso weg. Was fehlt, ist der Hinweis an A, dass daran Exceptions hängen. Das ist der bestehende 🎨-Eintrag zum Konflikt-Dialog in `docs/TODO.md`.

Ein serienweites Versions-Token würde den Fall zwar erkennen, aber `showConflict` fände an X kein abweichendes Feld und speicherte still durch. Abfangen ließe er sich nur mit neuer Oberfläche und neuer Copy. Der 🎨-Eintrag wird um diesen gleichzeitigen Fall ergänzt.

## 6. Idempotenz

- **Kennung pro Absicht.** Jede Nutzer-Absicht (Speichern, Löschen-Commit nach dem Undo-Fenster, „Trotzdem löschen", „Deine Fassung speichern") bekommt beim Erzeugen ihrer `vars` eine zufällige UUID v4 (`requestId`).
  - Jedes erneute Senden **derselben** `vars` trägt dieselbe Kennung. Heute tun das genau zwei Stellen: „Erneut versuchen" im Fehler-Toast von `EventCreateScreen` und `EventEditScreen` (`save(vars)`). Mutationen haben in TanStack Query keinen automatischen Retry (`app/_layout.tsx` setzt `retry: 1` nur für Queries), und die Löschwege bieten keinen Retry an.
  - Die Funktion ist trotzdem für alle Wege idempotent, weil das in 5.2 nichts extra kostet. Eine Retry-Aktion für das Löschen kommt nicht dazu, die Oberfläche bleibt wie sie ist (meine Entscheidung). Ohne Aufrufer entfällt damit auch ein eigener Clientweg für „Retry nach erfolgreichem Löschen".
  - Verbucht wird nur ein erfolgreicher Durchlauf. Ein abgelehnter Versuch (Konflikt) rollt seine Verbuchung zurück, die Kennung darf danach also wiederverwendet werden.
- **Quelle der UUID:** kryptografisch zufällig (`crypto.randomUUID` bzw. `expo-crypto`). Der Builder wählt, was auf allen drei Plattformen sicher verfügbar ist.
- **Verbuchung in `private.event_change_requests`** (meine Entscheidung):
  - Schema `private`, nicht über die API freigegeben.
  - Spalten `request_id` (PK), `user_id`, `created_at`.
  - RLS an und erzwungen. Ein Nutzer sieht und schreibt nur eigene Zeilen.
  - Einträge älter als 30 Tage räumt die Funktion bei jedem Aufruf für den eigenen Nutzer weg. Ein offener Fehler-Toast über 30 Tage ist kein realistischer Fall.
- **Anlegen eines Termins:**
  - Die App vergibt die `id` des neuen Termins selbst, eine UUID in `CreateEventVars`.
  - Ein zweiter Insert mit derselben ID legt nichts an und gilt als Erfolg, die Eindeutigkeit erzwingt der Primärschlüssel.
  - Ob das über `insert … on conflict do nothing` (PostgREST: `ignoreDuplicates`) oder über eine eigene RPC läuft, entscheidet der Builder anhand dessen, was die RLS-Policies für `on conflict` verlangen. Ein lokaler Test belegt es.
  - Die optimistische Zeile behält ihr `optimistic-`-Präfix.

## 7. Aufgabe löschen

`public.delete_task(p_task_id uuid, p_seen_updated_at timestamptz) returns text` mit den Ergebnissen `'deleted' | 'missing' | 'forbidden'`, `security invoker` (meine Entscheidung).

**Ablauf:**

1. Ohne Familie (`public.current_family_id()` ist null) → `'forbidden'`. Das ist genau der Fall „aus der Familie entfernt, während der Undo-Timer lief".
2. Sonst Löschen mit Bedingung auf `updated_at`.
3. Null Zeilen → nachsehen, ob die Zeile sichtbar ist: ja → Fehler „Konflikt" (gleicher SQLSTATE wie in 5.2), nein → `'missing'`.

**Warum `security invoker`:** Ein Abgleich über fremde Familien hinweg würde die Existenz fremder IDs verraten, und den braucht der Fall gar nicht.

**Im Client:**

- `'missing'` bleibt ein Erfolg, wie heute.
- **Konflikt:** Nachlese und `TaskConflictError`, wie heute.
- `'forbidden'` wird ein Fehler, den `mapTaskError` auf einen **vorhandenen** Copy-Key abbildet. Passt keiner, gilt die allgemeine Fehlermeldung, und ein eigener Text kommt als 🎨-Eintrag nach `docs/TODO.md`.

## 8. Sicherheit

Für alles Neue:

- `security invoker`, damit RLS greift. `set search_path = ''`, alle Namen schema-qualifiziert.
- `revoke all … from public, anon`, `grant execute … to authenticated`.
- Eingaben nur über die Whitelist aus 5.3, mit expliziten Typumwandlungen und ohne dynamisches SQL.
- Sperren in fester Reihenfolge. Fehlermeldungen nennen keine Inhalte fremder Zeilen.
- `supabase db lint` lokal und der Security-Advisor live: keine neuen Befunde.

Befunde des Security-Advisors im Live-Projekt (Stand 21.10.):

- **`broadcast_family_change()`** ist als `security definer` von `anon` und `authenticated` über `/rest/v1/rpc` aufrufbar. Als Trigger-Funktion braucht sie dieses Recht nicht, Postgres prüft es nur beim Anlegen des Triggers. Deshalb `revoke execute … from public, anon, authenticated`. Ein lokaler Test belegt, dass die Broadcasts danach weiter ankommen.
- **`accept_invitation`, `create_family`, `regenerate_invitation`, `current_family_id`** sind gewollt `security definer` und für `authenticated` aufrufbar. Der Builder prüft jede auf die Prüfung von `auth.uid()`, einen gesetzten `search_path`, Eingabeprüfung und auf das, was sie preisgibt. Echte Mängel werden im Branch behoben, die Begründung „gewollt" steht im ADR.
- **Schutz vor geleakten Passwörtern** (HaveIBeenPwned) ist aus. Erlaubt Svens Plan das Einschalten, schaltet Claude es beim Live-Rollout über die Management-API ein und spiegelt es lokal. Erlaubt er es nicht, kommt ein TODO-Eintrag.

## 9. Tests

- **SQL-Tests mit pgTAP** (`supabase/tests/`, `supabase test db`), Nutzer simuliert über Rolle und JWT-Claims:
  - jede `op` einzeln
  - Konflikt bei geändertem Master
  - Konflikt bei hinzugekommener, geänderter und verschwundener Exception
  - nicht gefunden
  - zweimal dieselbe `request_id` → nur ein Effekt, auch wenn der erste Aufruf mit einem Konflikt scheiterte (dann läuft der zweite normal)
  - ein Schritt mit einem Occurrence-Schlüssel oder einer Event-ID → Abbruch mit `22023`
  - **Rollback:** ein späterer Schritt scheitert (z. B. ein Constraint), die Exceptions eines früheren `delete_all_exceptions` sind danach unverändert da (Lücke 2)
  - `insert_split_event` ignoriert vom Client geschickte Familienfelder
  - Eltern einer anderen Familie bekommen „nicht gefunden" und ändern nichts
  - `anon` darf nichts ausführen
  - Whitelist und Schrittlimit
  - `delete_task` mit allen drei Ergebnissen und Konflikt
  - fremde `event_change_requests` sind unsichtbar
  - `broadcast_family_change` ist nicht per RPC aufrufbar, der Trigger sendet weiter
- **Integrationstests gegen die lokale Instanz** (bun, zwei angemeldete supabase-js-Clients A und B), als eigenes Skript `bun run test:db`, nicht Teil von `bun test`:
  - zwei parallele Aufrufe mit derselben Basis → genau einer `'applied'`, der andere Konflikt
  - zwei parallele Aufrufe mit derselben `request_id` → einer `'applied'`, der andere `'already_applied'`, kein Konflikt
  - Anlegen zweimal mit derselben ID → ein Termin
- **Client-Tests (bun):**
  - Der aufzeichnende `EventOps` erzeugt für jeden Zweig von `applyEditScope`/`applyDeleteScope` die erwarteten Schritte.
  - `updateEvent`/`deleteEvent` bilden die beiden SQLSTATEs auf die bestehenden Fehler ab.
  - Ein Retry mit denselben `vars` schickt dieselbe `requestId`.
  - Der aufzeichnende `EventOps` wirft bei einem Occurrence-Schlüssel, der nicht der bearbeitete ist.
- **CI** (meine Entscheidung): ein eigener Job startet die lokale Supabase im Runner und fährt `supabase test db` und `bun run test:db`, unbedingt auf jedem PR wie die übrigen Gates.
  - Damit wird jede künftige Migration getestet, bevor sie live geht.
  - Er läuft parallel zu iOS und verlängert den PR nicht.
  - Den Job als Required Check ins Ruleset einzutragen ist eine Änderung an GitHub. Claude macht sie per `gh api` nach Svens OK.

## 10. Abnahme und Live-Rollout

**Zwei-Client-Lauf** gegen die lokale Instanz: Python-Playwright, zwei Browser-Kontexte als A und B auf Port 8082.

- **Wiederholt** werden die Schritte 1–7 aus dem Lauf vom 04.09.
- **Erweitert** um:
  - jede der fünf Ops mit einer fremden Änderung dazwischen
  - Regelwechsel durch A von Occurrence X aus, während B dieselbe Occurrence X ändert: Der Dialog erscheint, und A's Speichern schreibt nichts, bis A entschieden hat. Ändert B eine andere Occurrence, greift die Grenze aus 5.5.
  - verlorene Antwort: Playwright lässt die Anfrage zum Server durch und verwirft dann die Antwort an die Seite. Danach „Erneut versuchen" beim Anlegen und bei „dieser und folgende": je genau ein Ergebnis
  - Aufgabe löschen nach Entfernen aus der Familie
- **Sicherheitsnetz:** Der Lauf bricht jede Anfrage an eine Adresse außer `127.0.0.1`/`localhost` ab und gilt dann als gescheitert.
- Das Protokoll steht im PR, nicht im Repo.

**Live-Rollout**, nach Svens Abnahme, vor dem Merge, alles durch Claude:

1. Abgleich lokal gegen live (4.3), auf dem Stand vor der Migration: identisch bis auf die erlaubten Abweichungen.
2. `apply_migration` über den Supabase-MCP. Danach die Datei auf die vergebene Version umbenennen (`supabase/SETUP.md` §3) und mit `list_migrations` gegenprüfen.
3. Gegebenenfalls Auth-Einstellung (8) über die Management-API.
4. Abgleich erneut, jetzt mit der neuen Migration, und Security-Advisor live: keine neuen Befunde.
5. **Rauchtest live, nur lesend:** Funktionen da, Rechte richtig (`has_function_privilege` für `anon` und `authenticated`). Keine Schreibzugriffe auf Familiendaten.
6. Umbenennung committen, pushen, CI grün. Sven merged.

Die Migration ist rein additiv: neue Funktionen, neues Schema `private` samt Tabelle, ein `revoke` auf einer Trigger-Funktion. Der Code auf `main` schreibt weiter direkt in die Tabellen, und das bleibt erlaubt, weil die RPC mit den Rechten des Aufrufers läuft und dieselben Tabellenrechte braucht. Für den Notfall liegt ein Rückbau-Skript im PR-Text bereit; eingespielt wird es nur auf Svens Wort.

## 11. Doku am Branch-Ende

- **ADR-044:** RPC-Form, Idempotenz, `delete_task`, lokale Supabase samt Paritätsbegriff, Sicherheitsentscheidungen. Er löst die bewusste Grenze aus ADR-031 ab, das ADR wird nicht editiert.
- **`supabase/SETUP.md`:** lokaler Abschnitt (Start, Seed, Accounts, Abgleich, erlaubte Abweichungen, Rollout-Ablauf).
- **`CLAUDE.md`:** Befehle (`supabase start`, `bun run test:db`), Ordner `supabase/tests/`, Solo-Prozess „Metro (lokal)" nur in `CLAUDE.local.md`.
- **Roadmap:** Block 7 erledigt.
- **`docs/TODO.md`:**
  - Entfernt werden die Einträge zu den fünf Ops, zum Verlustfenster, zur Retry-Idempotenz (deren erste Hälfte; die Overlay-Hälfte bleibt stehen) und zur RLS-Ablehnung beim Aufgaben-Löschen.
  - Neu kommen die Performance-Hinweise des Advisors dazu und, falls nötig, HaveIBeenPwned und der Copy-Key für `'forbidden'`.

## 12. Dem Builder überlassen

- SQLSTATE-Codes und Dateinamen der Migration und der Tests.
- Inhalt des Seeds über das Minimum aus 4.1 hinaus. Welche lokalen Dienste abgeschaltet werden.
- Die genaue Form von `supabase/parity.sql`, solange sie alles aus 4.2 abdeckt.
- Wie der aufzeichnende `EventOps` und das Zerlegen von `baseVersion` im Code heißen.
- Die Quelle der UUID (6).

## 13. Meine Entscheidungen auf einen Blick

| Entscheidung                                                                                                                                                    | Abschnitt |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Gleich heißt Schema und Konfiguration, keine echten Daten lokal                                                                                                 | 4.2       |
| Bei Abweichung gilt live: Nachzieh-Migration bzw. Korrektur in der Block-7-Migration, alles beim Rollout                                                        | 4.2       |
| Der Client berechnet die Schritte, der Server führt sie in einer Transaktion aus                                                                                | 5.1       |
| Konflikte als SQLSTATE, Nachlese im Client wie bisher                                                                                                           | 5.2       |
| Die Kennung wird am Anfang der Transaktion verbucht, nicht am Ende                                                                                              | 5.2       |
| Die RPC läuft mit den Rechten des Aufrufers (`security invoker`). Keine Event-ID und kein Occurrence-Schlüssel in den Schritten. Split-Felder kommen vom Server | 5.3       |
| Gleichzeitige Änderungen an _anderen_ Occurrences bleiben beim Regelwechsel ungeprüft (🎨-Eintrag wird ergänzt)                                                 | 5.5       |
| Verbuchung in einem nicht freigegebenen Schema, 30 Tage Aufbewahrung                                                                                            | 6         |
| Keine neue Retry-Aktion beim Löschen. Die Idempotenz gilt serverseitig trotzdem für alle Wege                                                                   | 6         |
| Anlegen idempotent über die vom Client vergebene ID                                                                                                             | 6         |
| `delete_task` ohne `security definer`, „forbidden" = keine Familie                                                                                              | 7         |
| `revoke` auf der Broadcast-Trigger-Funktion, HaveIBeenPwned nur wenn der Plan es erlaubt                                                                        | 8         |
| Datenbank-Tests in der CI, Ruleset nach OK                                                                                                                      | 9         |
| Rollout vor dem Merge, nur additiv                                                                                                                              | 10        |
