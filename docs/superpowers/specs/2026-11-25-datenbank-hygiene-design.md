# Datenbank-Hygiene (Roadmap Schritt 3) — Design

**Datum:** 2026-11-25 · **Branch:** `chore/datenbank-hygiene` · **Status:** zur Abnahme

Grundlage: fünf Einträge in [docs/TODO.md](../../TODO.md) und [Roadmap Schritt 3](../../roadmap.md#3-datenbank-hygiene)
(„Eine Migration, ein `test:db`-Lauf").

## 1. Worum es geht

Die Datenbank soll erzwingen, was der Client heute nur annimmt, und die Lücken schließen, die bei
früheren Iterationen bewusst offen blieben. Der Schritt steht vor dem Live-Sync des Essensplans
(Schritt 8) und vor dem gustar.io-Worker, weil beide auf denselben Tabellen aufsetzen und mit
wachsender Datenmenge jede dieser Lücken teurer wird.

Fünf Punkte:

1. **Grenzen für Name, Kürzel und Farbe.** `families.name`, `parents.name`/`short`/`color` und
   `children.name`/`color` nehmen heute jeden Text an. Eine Prüfung in `create_family`/`accept_invitation`
   allein wäre wirkungslos: Die Policies `parents: update self` und `families: update own` lassen den
   Client dieselben Spalten direkt über PostgREST schreiben.
2. **Totes `updated_at`** auf `families`, `parents`, `children`: Die Spalte existiert, kein Trigger
   stempelt sie.
3. **Kein Index für den Rezept-Query-Pfad** (`fetchRecipes`: Titelsuche, Sortierung).
4. **Performance-Advisor:** 13 Fremdschlüssel ohne Index, 15 „nie benutzte" Indizes.
5. **Default-ACL:** Neue Funktionen und Sequenzen in `public` werden für `anon` nutzbar, ohne dass
   eine Migration das will.

## 2. Ziele, Nicht-Ziele, Anti-Ziele

**Ziele**

- Die Tabellen weisen zu lange, leere und falsch geformte Werte ab, egal über welchen Weg
  geschrieben wird (RPC oder direkter Update).
- Die Namensfelder der App nehmen nach 50 Zeichen nichts mehr an (Variante A, Svens Wahl).
- `updated_at` auf den drei Tabellen stimmt nach jedem Update.
- Jeder Fremdschlüssel in `public` hat einen Index, dessen führende Spalten seine Spalten sind; der
  Advisor-Befund `unindexed_foreign_keys` ist live leer.
- Titelsuche und Sortierung von `fetchRecipes` können einen Index benutzen.
- Eine neue Funktion in `public` ist für `anon` nicht ausführbar, eine neue Sequenz nicht nutzbar,
  ohne dass die Migration dafür etwas tun muss.

**Nicht-Ziele**

- Unbenutzte Indizes entfernen. Live hat eine Familie; „unbenutzt" heißt dort nichts. Bleibt in
  `docs/TODO.md`.
- Neue Fehlertexte oder Copy. `docs/COPY.md` bleibt unberührt.
- Grenzen für `children.school`, `children.grade` oder andere Textspalten (Termin-, Aufgabentitel).
- Die Mindestlängen im Client ändern (Onboarding verlangt weiter zwei Zeichen).
- `updated_at` für Konflikterkennung in den Profil-Formularen nutzen.
- Die negierte Overlap-Bedingung (`excludeAllergens`) indexieren. Das geht grundsätzlich nicht.
- Die Default-ACLs von `supabase_admin` (kann `postgres` nicht ändern, siehe ADR zu
  `trim_table_privileges`) und das Default-`execute` von `authenticated` (bleibt überall wie heute).

**Anti-Ziele** — wäre ein Fehlschlag, auch wenn es technisch läuft

- Eine Migration, die live an bestehenden Daten scheitert, oder Constraints mit `NOT VALID`, die alte
  Zeilen nie prüfen.
- Ein Client, der einen Namen annimmt, den der Server abweist. Dann scheitert das Speichern mit einem
  allgemeinen Fehler, den niemand versteht.
- Bestehende Funktionen verlieren Rechte. Default-Privilegien wirken nur auf neue Objekte; an
  bestehenden `grant`s ändert sich nichts.
- Die Farbpalette des Designers in die Datenbank kopieren.

## 3. Rahmen

- Off-limits wie immer: `design-system/{colors,…}.ts`, `docs/{HANDOFF,COPY,ICONS,README}.md`,
  `patterns/*.md`.
- **Eine Migration** in `supabase/migrations/`, lokal und live identisch. Die Live-Daten erfüllen
  alle Regeln (geprüft 2026-11-25); die Constraints werden deshalb gleich validiert angelegt.
- Live-Einspielung nur über die Management-API, byte-genau, nach Svens ausdrücklichem OK
  ([supabase/SETUP.md](../../../supabase/SETUP.md) §7).
- Erweiterungen kommen in das Schema `extensions` (Supabase-Konvention; der Advisor meldet
  Erweiterungen in `public`). `pg_trgm` ist live noch nicht installiert.
- `features/supabase/database.types.ts` ändert sich nicht: keine neue Spalte, kein neuer Typ.

## 4. Ansätze

1. **Eine Migration, eine benannte Regel pro Spalte** — gewählt. Jede Regel steht sichtbar an ihrer
   Tabelle, eine Verletzung nennt im Fehler ihren Namen, und es gibt eine einzige Live-Einspielung.
2. **Ein gemeinsamer Postgres-Typ (`domain`) für Namen.** Verworfen: Das Projekt nutzt keine Domains,
   die erzeugten TypeScript-Typen zeigen sie nicht, die RPC-Parameter blieben `text`. Bei drei
   Spalten spart das zu wenig.
3. **Aufteilen auf mehrere Branches** (Grenzen getrennt von Indizes und Rechten). Verworfen: mehrere
   Live-Einspielungen für Änderungen, die sich nicht gegenseitig blockieren.

## 5. Die Teile

### A. Grenzen

| Spalte                                           | Regel                                        | Constraint                                                            |
| ------------------------------------------------ | -------------------------------------------- | --------------------------------------------------------------------- |
| `families.name`, `parents.name`, `children.name` | nicht leer nach `btrim`, `char_length <= 50` | `families_name_length`, `parents_name_length`, `children_name_length` |
| `parents.short`                                  | nicht leer nach `btrim`, `char_length <= 3`  | `parents_short_length`                                                |
| `parents.color`, `children.color`                | `~ '^#[0-9A-Fa-f]{6}$'`                      | `parents_color_hex`, `children_color_hex`                             |

- **50 Zeichen, Minimum 1.** Das Elternprofil speichert heute schon einbuchstabige Namen; das
  Onboarding verlangt zwei, das bleibt Client-Sache.
- **Gezählt in Code-Points.** `char_length` zählt Code-Points wie `codePoints`/`capShort` in
  [features/auth/avatarColor.ts](../../../features/auth/avatarColor.ts). `maxLength` am `TextInput`
  zählt UTF-16-Einheiten, also nie weniger als die Code-Points. Ein Client-Limit von 50 hält das
  Server-Limit von 50 damit immer ein (Anti-Ziel 2).
- **Farbe als Format, nicht als Liste.** Die sechs `AVATAR_COLORS` gehören dem Designer; eine Liste
  in der Datenbank müsste bei jeder Paletten-Änderung mitwandern.
- **Client:** `export const NAME_MAX_LENGTH = 50` neben `SHORT_MAX_LENGTH` in `avatarColor.ts`, mit
  Docstring zur Zählweise. `Field` ([app-sections/shared/Field.tsx](../../../app-sections/shared/Field.tsx))
  bekommt eine optionale Prop `maxLength` und reicht sie an den `TextInput` durch. Diese fünf Felder
  setzen sie: Familienname und eigener Name in
  [Step2FamilyAndName.tsx](../../../app-sections/onboarding/Step2FamilyAndName.tsx), Kindername in
  [Step4FirstChild.tsx](../../../app-sections/onboarding/Step4FirstChild.tsx), Name in
  [ParentProfileScreen.tsx](../../../app-sections/parent-profile/ParentProfileScreen.tsx) und
  [ChildProfileScreen.tsx](../../../app-sections/child-profile/ChildProfileScreen.tsx).
- **Kürzel-Feld bekommt kein `maxLength`** (meine Entscheidung, abweichend von dem, was ich im Gespräch
  angekündigt hatte). `capShort` kappt dort schon auf drei Code-Points, das Feld nimmt also bereits
  nichts mehr an. Ein `maxLength={3}` zählte in UTF-16 und schnitte ein Emoji-Kürzel ab, das
  `capShort` erlaubt.
- **Verletzung:** SQLSTATE `23514`, landet in den vorhandenen Fehler-Mappern beim allgemeinen
  Speicherfehler. Kein neuer Text.
- **Seed:** [supabase/seed.sql](../../../supabase/seed.sql) setzt heute die Farben `'primary'` und
  `'accent'`. Die werden zu Werten aus `AVATAR_COLORS`, sonst scheitert `supabase db reset`.

### B. `updated_at`

Drei Trigger `families_set_updated_at`, `parents_set_updated_at`, `children_set_updated_at`:
`before update … for each row execute function public.set_updated_at()`. Name und Form wie die drei
Trigger in `20260904075041_conflict_detection.sql`; die Funktion existiert dort schon. Der
Schlusskommentar jener Migration bleibt stehen (angewandte Migrationen werden nicht editiert), die
neue Migration verweist darauf. `useUpdateParent` und `useUpdateChild` schicken selbst ein
`updated_at` mit. Der Trigger überschreibt es, der Client bleibt unverändert.

### C. Indizes

**C1. Fremdschlüssel.** Ein B-Tree je gemeldetem Fremdschlüssel, Spalten in der Reihenfolge des
Fremdschlüssels:

| Tabelle              | Index-Spalten                                 | ersetzt                 |
| -------------------- | --------------------------------------------- | ----------------------- |
| `events`             | `(family_id, child_id)`                       | `events_child_id_idx`   |
| `events`             | `(family_id, parent_id)`                      | `events_parent_id_idx`  |
| `events`             | `(family_id, created_by)`                     | `events_created_by_idx` |
| `events`             | `(type_id)`                                   |                         |
| `family_invitations` | `(created_by)`                                |                         |
| `meal_plan_entries`  | `(created_by)`, `(recipe_id)`                 |                         |
| `recipes`            | `(created_by_family_id)`                      |                         |
| `reminders`          | `(recipient_parent_id)`, `(task_id)`          |                         |
| `tasks`              | `(completed_by)`, `(created_by)`, `(type_id)` |                         |

Die drei ersetzten Indizes decken nur eine Spalte ihres zweispaltigen Fremdschlüssels ab und werden
gelöscht. Alle neuen Indizes ohne Teilbedingung (`where … is not null`), meine Entscheidung: einfacher,
und der Advisor prüft nur die führenden Spalten.

**C2. Rezepte.**

- `create extension if not exists pg_trgm with schema extensions;`
- Zwei GIN-Ausdrucksindizes: `((title->>'de') extensions.gin_trgm_ops)` und dasselbe für `'en'`.
  `title` ist `jsonb`; das in der TODO vorgeschlagene `gin (title gin_trgm_ops)` funktioniert für
  `jsonb` nicht. `fetchRecipes` sucht mit `title->>de.ilike` ODER `title->>en.ilike`, PostgREST
  erzeugt daraus genau diese Ausdrücke.
- Ein B-Tree `(created_at desc, id)` für Sortierung und Tiebreaker von `fetchRecipes`.
- Der Docstring von `fetchRecipes` ([features/meals/queries.ts](../../../features/meals/queries.ts))
  verweist heute auf den TODO-Eintrag; er nennt danach die Indizes und behält den Satz, dass die
  negierte Overlap-Bedingung keinen Index nutzen kann.

**C3.** Die 15 unbenutzten Indizes bleiben. Der TODO-Eintrag wird auf diesen Teil gekürzt.

### D. Default-ACL

**Befund (lokal geprüft):** Ein `revoke … from anon` auf Schema-Ebene allein wirkt bei Funktionen
nicht. Neue Funktionen bekommen `execute` für `PUBLIC` über die eingebaute globale Vorgabe, und
`anon` ist Mitglied von `PUBLIC`. Eine Schema-Vorgabe kann der globalen nur etwas hinzufügen, nichts
wegnehmen. Deshalb vier Anweisungen:

```sql
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres grant execute on functions to authenticated, service_role;
alter default privileges for role postgres in schema public revoke execute on functions from anon;
alter default privileges for role postgres in schema public revoke usage, select, update on sequences from anon;
```

- Die ersten beiden wirken global, in jedem Schema. Sie tauschen `PUBLIC` gegen `authenticated` und
  `service_role` aus (meine Entscheidung). Für diese beiden Rollen bleibt alles wie heute, sie hatten
  `execute` bisher über `PUBLIC`. Neu ist nur: `anon` und die übrigen Mitglieder von `PUBLIC` bekommen
  kein `execute` mehr auf neue Funktionen.
- **Warum nicht nur der Entzug für `PUBLIC`:** Der Prüfer hat gefunden, und ich habe lokal
  nachgestellt: Ohne die zweite Zeile sind auch Funktionen in `pg_temp` nur noch für ihren Besitzer
  ausführbar. `events_in_range.test.sql` und `apply_event_change.test.sql` rufen solche Helfer nach
  `set local role authenticated` auf und scheitern dann mit `42501`. Dasselbe träfe neue Funktionen
  in `private` (RLS-Policies scheitern, bis jemand ausdrücklich `grant` schreibt) und Funktionen, die
  im Studio angelegt werden. Mit der zweiten Zeile liefen im Probelauf fünf der sechs pgTAP-Suites
  unverändert. `delete_task` braucht die TCP-Verbindung von `supabase test db` und ließ sich so nicht
  nachstellen; der erste `test:db`-Lauf nach der Migration klärt das.
- Die dritte Zeile ist nötig, weil Supabase `anon` in `public` über die Schema-Vorgabe ausdrücklich
  `execute` gibt, nicht nur über `PUBLIC`.
- Wer eine Funktion für `authenticated` sperren will, entzieht es weiter je Funktion, wie die
  Migrationen es heute schon tun. Ein Auth-Hook bräuchte ein ausdrückliches `grant … to
supabase_auth_admin`; das schreibt Supabases Anleitung ohnehin vor.
- Sequenzen haben keine globale `PUBLIC`-Vorgabe; dort reicht der Entzug auf Schema-Ebene. `public`
  hat heute keine Sequenz.
- Das Inventar in `security.test.sql` („anon darf keine Funktion in public ausführen") bleibt die
  Prüfung für bestehende Funktionen.
- `supabase/parity.sql` vergleicht `pg_default_acl` schon mit, global wie je Schema.

## 6. Tests

Ein neues pgTAP-File `supabase/tests/database/hygiene.test.sql`, Stil wie `security.test.sql`
(Transaktion, Rollback, Seed-IDs aus dem Kopf von `seed.sql`):

- **Grenzen:** jede Regel an beiden Rändern. 50 Zeichen gehen durch, auch 50 Mehrbyte-Zeichen
  (`ä`, ein Emoji); 51 scheitern mit `23514`. `''` und `'   '` scheitern. Kürzel 1 und 3 gehen,
  4 scheitert. Farbe `#7DB6A8` und `#7db6a8` gehen; `primary`, `#FFF` und `#GGGGGG` scheitern.
- **Beide Schreibwege:** als `authenticated` (Rolle und JWT-Claims wie in den bestehenden Tests) den
  eigenen Elternnamen auf 51 Zeichen setzen scheitert; `create_family` mit einem 51-Zeichen-
  Familiennamen scheitert.
- **`updated_at`:** pro Tabelle `updated_at` auf einen alten Wert setzen, danach steht `now()` drin.
- **Fremdschlüssel-Abdeckung:** eine Katalogabfrage, die jeden Fremdschlüssel in `public` ohne Index
  mit passenden führenden Spalten zählt, ergibt 0. Diese Prüfung bleibt und hält künftige Migrationen.
  Sie zählt wie der Advisor, also gilt auch ein Teilindex (meine Entscheidung). Deshalb gelten
  `reminders.family_id` und `tasks.child_id` heute schon als abgedeckt.
- **Rezept-Indizes:** vorhanden (`has_index`).
- **Default-ACL:** in der Testtransaktion je eine Funktion in `public`, `private` und `pg_temp` sowie
  eine Sequenz in `public` anlegen. `anon` kann keine der Funktionen ausführen und die Sequenz nicht
  nutzen; `authenticated` kann alle drei Funktionen ausführen.
- **Bestehende Suites:** laufen unverändert grün. Das ist die Abnahme für die zweite Zeile in D.

Jest: ein Test, dass `Field` `maxLength` an den `TextInput` weitergibt, und in
`ChildProfileScreen.jest.tsx`, dass das Namensfeld `NAME_MAX_LENGTH` trägt.

## 7. Einspielen auf live

Nach grünem `test:db` lokal und vor dem Merge, mit Svens OK. Ablauf nach SETUP.md §7:

1. Parität lokal gegen live auf dem Stand davor.
2. Direkt davor rein lesend prüfen, dass die Live-Daten die Regeln aus A noch erfüllen.
3. Migration über die Management-API, Body byte-genau gegen die Datei geprüft.
4. Parität erneut. Security-Advisor ohne neue Befunde, Performance-Advisor ohne
   `unindexed_foreign_keys`.

## 8. Dem Umsetzer überlassen

- Zeitstempel und Name der Migration, Reihenfolge der Abschnitte darin.
- Index-Namen nach dem Muster `<tabelle>_<spalten>_idx`.
- Welche `AVATAR_COLORS` die Seed-Zeilen bekommen.
- Ob das Onboarding und das Elternprofil zusätzlich eigene Render-Tests für `maxLength` bekommen.

## 9. Am Branch-Ende

- ADR-060 in `docs/decision-log.md`: die Grenzen und ihre Zählweise, die Default-ACL samt Befund zu
  `PUBLIC`, die Ersetzung der drei `events`-Indizes.
- `docs/architecture.md`: der Absatz zu den Default-ACLs gilt künftig auch für Funktionen und Sequenzen.
- `docs/TODO.md`: Einträge zu Grenzen, `updated_at`, Rezept-Index und Default-ACL löschen; den
  Advisor-Eintrag auf die unbenutzten Indizes kürzen.
- `docs/roadmap.md`: Schritt 3 erledigt.
