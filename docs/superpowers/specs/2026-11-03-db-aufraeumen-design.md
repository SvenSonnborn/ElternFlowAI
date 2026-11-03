# DB-Aufräumen — Design

**Status:** Approved (Brainstorming)
**Date:** 2026-11-03
**Branch:** `chore/db-aufraeumen`, Punkt 1 der „nächsten Branches" in [roadmap.md](../../roadmap.md#die-nächsten-branches-stand-2026-11-02)
**Decision-Log:** ein kurzer ADR (053) am Branch-Ende

## 1. Worum es geht

Drei Einträge aus [TODO.md](../../TODO.md), die die Roadmap zu einem Branch bündelt:

1. **Abgelaufene Einladungen werden nie aufgeräumt.** Unbenutzte Zeilen in `family_invitations` bleiben nach `expires_at` für immer liegen. Die App sieht sie nicht mehr (die Query filtert auf `expires_at > now()`), die Tabelle wächst trotzdem.
2. **`anon` und `authenticated` haben auf `public` alle Tabellenrechte.** Supabase vergibt per Default-ACL `arwdDxtm` an beide Rollen, also auch `TRUNCATE`, `REFERENCES`, `TRIGGER` und `MAINTAIN`. Für `anon` ist RLS die einzige Schranke, obwohl die App nie ohne Sitzung Daten liest; fast alle Policies gelten ohnehin nur `to authenticated`.
3. **Ein Einladungslink, geöffnet von einem Konto, das schon zu einer Familie gehört**, führt heute ins Namensformular von Onboarding-Schritt 2 und erst beim Absenden zum Fehler `23505`. Grund: [deepLinkHandler.ts](../../../features/auth/deepLinkHandler.ts) springt mit Sitzung nach `/(onboarding)/2`, und [decideRoute.ts](../../../features/auth/decideRoute.ts) holt niemanden aus dem Onboarding heraus. Wer abgemeldet tippt, landet im Login statt in der Registrierung; meldet er sich dann mit einem Familienkonto an, leitet `AuthGate` still zu den Tabs, und der gemerkte Token bleibt auf dem Gerät liegen, bis ein anderes Konto ihn im Onboarding aufgreift.

Punkt 3 ist App-Code, keine Datenbankarbeit. Er kommt in diesen Branch, weil die Roadmap ihn hier führt und er klein ist.

## 2. Ziele, Nicht-Ziele, Anti-Ziele

**Ziele**

1. Abgelaufene, unbenutzte Einladungen verschwinden automatisch, einmal am Tag.
2. `anon` hat auf keiner Tabelle in `public` irgendein Recht. `authenticated` hat höchstens `select, insert, update, delete`; die vorhandenen, engeren Rechte (etwa nur `insert (family_id)` auf `family_invitations`) bleiben genau so.
3. Eine **neue** Tabelle aus einer künftigen Migration bekommt von selbst denselben Zuschnitt — die Aufräumarbeit verfällt nicht mit der nächsten Migration.
4. Ein Einladungslink führt jede Person an die richtige Stelle (Tabelle in §3.3), egal ob angemeldet, abgemeldet, mit oder ohne Familie.
5. Wer mit einem Familienkonto einen Einladungslink öffnet, kann mit einem anderen Konto weitermachen. Zwei Fälle sind gleichwertig gemeint (Svens Vorgabe): Patchwork — jemand ist schon in einer Familie und wird in eine zweite eingeladen — und ein fremdes Gerät, auf dem ein anderes Familienmitglied angemeldet ist.
6. Ein gemerkter Einladungstoken überlebt nur die ausdrückliche Wahl „Mit anderem Konto fortfahren" — dann ist das nächste Konto auf diesem Gerät der gemeinte Empfänger. Jede andere Antwort verwirft ihn.

**Nicht-Ziele**

- **Mitgliedschaft in mehreren Familien und ein Kontowechsler.** Ein Konto gehört zu genau einer Familie (`create_family`/`accept_invitation` werfen `23505`). Der zweite Weg ist ein zweites Konto mit eigener E-Mail-Adresse; zurück geht es über Abmelden und Anmelden.
- **`https`-Einladungslinks mit Universal Links und Store-Fallback.** Eigener TODO-Eintrag, braucht eine Domain.
- **Funktionsrechte.** Postgres gibt `EXECUTE` per Default an `PUBLIC`; das zu ändern trifft jede Funktion und auch `authenticated`. Das Inventar in [security.test.sql](../../../supabase/tests/database/security.test.sql) meldet schon heute jedes `execute` für `anon` (meine Entscheidung).
- **Benutzte Einladungen** (`used_at is not null`) bleiben stehen; das TODO und dieser Branch betreffen nur unbenutzte.
- **Der Reminder-Worker.** Das TODO wollte den Cron-Job mit ihm zusammen bauen; der Worker wartet auf Expo Notifications, dieser Job nicht.
- **Abgelaufene oder schon benutzte Tokens** im Einladungsfluss verhalten sich wie heute (`auth.error.linkExpired` beim Absenden).
- **`CHECK`-Constraints für Namen, Kürzel, Farbe** (eigener TODO-Eintrag).

**Anti-Ziele** — das wäre ein Fehlschlag, auch wenn es technisch läuft:

1. Ein Rechte-Zuschnitt, der die engeren Rechte aus Block 7 wieder öffnet. Konkret: `revoke all` + `grant select, insert, update, delete on all tables` gäbe `authenticated` das Tabellenrecht `insert` auf `family_invitations` zurück, und Token und Ablauf wären wieder vom Client setzbar.
2. Ein Dialog „Dieses Konto gehört bereits zu einer Familie" direkt nach einem **erfolgreichen** Beitritt. In Onboarding-Schritt 2 existiert nach `accept_invitation` die Parent-Zeile, bevor `clearPendingInviteToken()` läuft — eine Prüfung „Sitzung + Parent + Token" ohne Rücksicht auf das Onboarding schlägt genau dort an.
3. Ein Dialog, der zweimal erscheint (etwa einmal vom Link-Handler und einmal nach dem Laden der Parent-Zeile).
4. Eine Abmeldung ohne ausdrückliche Wahl. Auf einem fremden Gerät meldet „Mit anderem Konto fortfahren" den Besitzer ab; das passiert nur über den Button.
5. Eine Render-Schleife oder ein bedingt ersetzter Root-Stack beim Abmelden ([ADR-040](../../decision-log.md)).

## 3. Entwurf

### 3.1 Cron-Job für abgelaufene Einladungen

Eine Migration:

- `create extension if not exists pg_cron;` — lokal im Supabase-Image enthalten, live über dieselbe Migration. Ob Supabase dabei ein bestimmtes Schema verlangt, klärt der Builder an der Supabase-Doku (`context7`).
- Eine Funktion `private.purge_expired_invitations()`, `security invoker`, die `delete from public.family_invitations where used_at is null and expires_at < now()` ausführt. Als Funktion statt Inline-SQL im Job, damit der pgTAP-Test genau das ausführt, was der Job ausführt (meine Entscheidung). `execute` nur für den Besitzer; das Schema `private` ist für PostgREST nicht sichtbar. Der Job läuft als die Rolle, die ihn plant — sie muss Besitzer der Funktion sein oder `execute` und `usage` auf `private` haben. Der pgTAP-Test ruft die Funktion als genau diese Rolle auf.
- `cron.schedule('purge-expired-invitations', '<täglich, nachts>', 'select private.purge_expired_invitations()')`. `cron.schedule` ersetzt einen Job gleichen Namens, die Migration bleibt also wiederholbar. Uhrzeit: nachts in UTC, die genaue Minute ist Sache des Builders.
- Keine Karenzzeit: Die App zeigt abgelaufene Einladungen ohnehin nicht.

### 3.2 Tabellenrechte

Eine zweite Migration, nur mit gezielten Entzügen:

- `revoke all on all tables in schema public from anon;`
- `revoke truncate, references, trigger, maintain on all tables in schema public from authenticated;` — **kein** `revoke all` + `grant` (Anti-Ziel 1). Was `authenticated` heute an `select/insert/update/delete` hat, bleibt unverändert.
- `alter default privileges for role postgres in schema public` mit denselben Entzügen für `on tables` — Migrationen legen Tabellen lokal und live als `postgres` an. Default-ACLs anderer Besitzer (etwa `supabase_admin`) fasst die Migration nicht an; ob es sie gibt, liest der Rollout live aus `pg_default_acl` (§5) (meine Entscheidung).
- Views in `public` gibt es heute keine; `all tables` würde sie einschließen.

Folgen, die der Builder mitnimmt:

- Abfragen ohne Sitzung bekommen statt einer leeren Liste `42501 permission denied`. Heute ohne sichtbare Wirkung, weil `AuthGate` die geschützten Screens ohne Sitzung abhängt. Der TODO-Eintrag „Die Familien-Queries haben keinen Sitzungs-Guard" behauptet „RLS antwortet mit leeren Listen" — sein Text wird angepasst, der Eintrag bleibt.
- pgTAP-Tests, die als `anon` eine leere Ergebnismenge erwarten, laufen nach dem Entzug auf einen Fehler. `bun run test:db` zeigt sie; die Erwartung wird auf den Fehlercode umgestellt, nicht der Entzug aufgeweicht.
- Realtime (Broadcast auf `realtime.messages`) liegt nicht in `public` und ist nicht betroffen.

### 3.3 Einladungslink

Wer wo landet:

| Zustand beim Öffnen des Links                         | Ergebnis                                                                                                                                                   |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| abgemeldet                                            | Token gemerkt, **Registrierung** offen, Login darunter im Stapel — der Zurück-Pfeil (`router.back()` in `RegisterScreen`) führt zum Login statt ins Leere. |
| angemeldet, ohne Familie                              | wie heute: Onboarding-Schritt 2 auf dem Einladungspfad.                                                                                                    |
| angemeldet, mit Familie                               | Dialog (unten).                                                                                                                                            |
| abgemeldet getippt, dann mit Familienkonto angemeldet | derselbe Dialog, sobald Sitzung und Parent-Zeile feststehen.                                                                                               |

Der Weg über die Registrierung trägt den Token wie heute: Registrieren → E-Mail bestätigen → `AuthGate` → Schritt 2 liest den gemerkten Token. Wer schon ein zweites Konto hat, geht von der Registrierung zurück zum Login.

Bricht jemand nach „Mit anderem Konto fortfahren" die Registrierung ab, bleibt der Token liegen. Das nächste Konto ohne Familie auf diesem Gerät landet damit auf dem Einladungspfad, ein Familienkonto sieht wieder den Dialog. Das bleibt so (meine Entscheidung): Der Token läuft nach sieben Tagen ab, und ein Aufräumen beim Verlassen des Login-Stapels wäre mehr Verdrahtung als der Fall wert ist. Der ADR hält es fest.

**Der Dialog** — ein Ja/Nein über [confirmDialog.ts](../../../app-sections/shared/confirmDialog.ts) (kein `Alert.alert`, [ADR-039](../../decision-log.md)), kein Toast: Es gibt eine Entscheidung, und die bestätigende Wahl meldet ab (meine Entscheidung, ersetzt den zuerst besprochenen Info-Toast).

- Titel: „Dieses Konto gehört bereits zu einer Familie." Neutral statt „Du gehörst …", weil auf einem fremden Gerät nicht der Besitzer liest.
- Body: ein Satz, dass ein Konto zu genau einer Familie gehört, die Einladung ein weiteres Konto mit eigener E-Mail-Adresse braucht und dieses Konto dafür auf dem Gerät abgemeldet wird.
- Buttons: „Abbrechen" (vorhandener Key `action.cancel`) und „Mit anderem Konto fortfahren".
- **Abbrechen:** Token verwerfen, bleiben, wo man ist (Tabs).
- **Mit anderem Konto fortfahren:** Token **behalten**, über das vorhandene `useSignOut` ([mutations.ts](../../../features/auth/mutations.ts)) abmelden, dann Registrierung mit Login darunter — wie im Abgemeldet-Fall.
- `confirmDestructive` ist die Form der Wahl (Ja/Nein als Promise); dass das Ja abmeldet, rechtfertigt die destruktive Darstellung. Ob dafür eine Variante mit anderem Namen nötig ist, entscheidet der Builder.

**Copy:** Titel, Body und Button-Label sind neue Keys. Sie kommen DE + EN in die Kataloge; ein TODO-Eintrag hält fest, dass sie in [COPY.md](../../COPY.md) fehlen — wie bei `parent.*` und `familie.invite*`. Namespace: `auth.invite.*` o. ä., Sache des Builders. Der vorhandene `auth.error.alreadyInFamily` („Du gehörst bereits …") bleibt für Schritt 2 unverändert.

**Wo die Prüfung sitzt:** an **einer** Stelle, die beide Einstiege erreicht — den Link bei bestehender Sitzung und den Login nach gemerktem Token. Bedingungen, die sie einhält:

- Sie fragt nur, wenn Sitzung `authenticated`, Parent-Zeile geladen und vorhanden, ein Token gemerkt **und** der Nutzer nicht im Onboarding ist (Anti-Ziel 2).
- Sie fragt höchstens einmal pro Token (Anti-Ziel 3).
- Der Link-Handler springt mit Sitzung nicht mehr blind nach `/(onboarding)/2`; ohne Familie bringt `decideRoute` den Nutzer ohnehin dorthin, mit Familie fragt die Prüfung.
- Der gemerkte Token liegt heute nur in AsyncStorage und ist nicht reaktiv. Damit die Prüfung auch anschlägt, wenn der Link bei schon geladener Parent-Zeile ankommt, darf eine kleine reaktive Quelle daneben entstehen — ein Zustand-Store neben `deepLinkHandler.ts`, der AsyncStorage spiegelt (meine Entscheidung).
- Die Entscheidung selbst ist eine reine Funktion neben `decideRoute`, unter `bun test` geprüft; Hook oder Komponente nur so dünn, wie es die Verdrahtung braucht.
- Abmelden und anschließendes Navigieren zur Registrierung dürfen nicht mit dem Redirect von `AuthGate` nach `/login` kollidieren (Anti-Ziel 5). Wie die Reihenfolge sicher wird, ist Sache des Plans.

`showAlert`/`confirmDestructive` liegen unter `app-sections/shared`, der Link-Handler unter `features/auth`. Wo die Verdrahtung lebt, entscheidet der Builder; `features/` importiert heute nur Typen aus `app-sections/shared`.

## 4. Prüfen

- **pgTAP** (in `supabase/tests/database/`, im `supabase test db`-Lauf):
  - Cron: der Job `purge-expired-invitations` existiert mit Zeitplan und Befehl; `private.purge_expired_invitations()` löscht die abgelaufene Seed-Einladung (`…02`) und lässt die gültige (`…01`) und die benutzte (`…03`) stehen.
  - Rechte: Inventar in `security.test.sql` — keine Tabelle in `public` gibt `anon` irgendein Recht; `authenticated` hat auf keiner Tabelle `TRUNCATE`, `REFERENCES`, `TRIGGER` oder `MAINTAIN`; eine im Test angelegte Tabelle bekommt denselben Zuschnitt (beweist die Default-Privileges); `authenticated` hat auf `family_invitations` weiterhin nur `insert (family_id)`.
- **`bun test`:** die Entscheidungsfunktion für den Einladungslink über alle Zeilen der Tabelle in §3.3 plus Onboarding-Ausnahme und „höchstens einmal".
- **`bun run test:rn`**, falls die Verdrahtung eine Komponente oder einen Hook bekommt, der mehr tut als die Funktion aufzurufen.
- **Sichtlauf nativ** (iOS-Simulator, Deep-Link per `xcrun simctl openurl`): die vier Zeilen der Tabelle, beide Dialog-Antworten. Gegen lokal nur über einen Debug-Build, der live spricht → nichts absenden, was live schreibt; das Durchspielen bis zur Registrierung genügt.
- Alle Gates: `format:check`, `lint`, `typecheck`, `test`, `test:rn`, `test:db`.

## 5. Live-Rollout

Beide Migrationen über die Management-API, byte-genau aus der Datei, nach Svens ausdrücklichem OK (Ablauf: [supabase/SETUP.md](../../../supabase/SETUP.md) §7). Vorher prüfen, dass `pg_cron` auf dem Live-Projekt verfügbar ist und welche Besitzer in `pg_default_acl` für `public` stehen; gibt es neben `postgres` einen weiteren, der `anon` Tabellenrechte vergibt, kommt das vor dem Rollout zurück ins Gespräch. Danach Rechte und Job live gegenlesen.

## 6. Doku am Branch-Ende

- [TODO.md](../../TODO.md): die drei Einträge löschen („Abgelaufene Einladungen …", „`anon` und `authenticated` …", „Invite-Link von bereits-Mitglied geöffnet"); „Familien-Queries ohne Sitzungs-Guard" anpassen; neuer Eintrag für die fehlenden Copy-Keys.
- [roadmap.md](../../roadmap.md): Punkt 1 der nächsten Branches als erledigt.
- ADR-053: Cron statt Client-Löschung, gezielte Entzüge statt `revoke all`, Dialog statt Toast und Registrierung statt Login für Eingeladene.
- [architecture.md](../../architecture.md): Cron-Job und Rechte-Zuschnitt, wo Datenbank und Auth-Fluss beschrieben sind.

## 7. Dem Builder überlassen

- Schema-Fragen zu `pg_cron` auf Supabase, Minute des Zeitplans.
- Name und Ort der Entscheidungsfunktion und der Verdrahtung; Namespace der neuen Copy-Keys.
- Ob `confirmDestructive` reicht oder eine benannte Variante nötig ist.
- Wie der gemerkte Token „höchstens einmal gefragt" festhält.
- Reihenfolge der Commits; je ein Commit pro Punkt ist der Vorschlag.
