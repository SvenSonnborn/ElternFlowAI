# TODO

Aktive Follow-ups aus laufender Arbeit. Workflow: **CLAUDE.md → "Out-of-scope TODOs"** (anhängen wenn entdeckt, entfernen wenn erledigt).

## Calendar (Edit/Delete V1 — `feature/calendar-v1`)

- **Recurring-Series mit `rrule_count` lassen sich nicht sauber per `forward`-Edit splitten** ([features/calendar/recurrence.ts](features/calendar/recurrence.ts) → `insertSplitEvent`). Count ist relativ zu `dtstart`; nach Split wäre der korrekte Wert `master.rrule_count − (Anzahl bereits konsumierter Occurrences)`. Aktuell setzen wir `rrule_count: null` (mit Code-Kommentar). Sauberer Fix erfordert Occurrence-Tracking oder Konversion zu `rrule_until`-Bounds vor dem Split.
- **Reminder-Switches im EventDetailScreen sind stateless** ([app-sections/event/EventDetailScreen.tsx](app-sections/event/EventDetailScreen.tsx) — `ReminderRow`). Zustand wird nicht persistiert. Bei Push-Notification-Iteration: an `reminders`-Tabelle binden.
- **Multi-Day-Events sind im Edit-Form gesperrt** ([app-sections/event/EventEditScreen.tsx](app-sections/event/EventEditScreen.tsx) — `isMultiDay` Banner). Eigener Editor folgt in V2. Im Create-Form ([app-sections/event/EventCreateScreen.tsx](app-sections/event/EventCreateScreen.tsx)) ebenfalls noch nicht abgebildet — All-day deckt den 1-Tag-Fall ab.
- **Voice-Add-Flow** ist eigene Iteration (an STT/LLM-Provider gekoppelt). Pattern-doc-Eintrag bleibt offen, getypter Form-Flow ist mit V1 jetzt da.
- **Recurrence-Editor (Edit-Form)**: `rrule_freq`, `rrule_interval`, `rrule_byweekday` sind im Edit-Form nicht änderbar. Create-Form unterstützt jetzt die 5 Optionen (none/daily/weekdays/weekly/monthly) — Edit muss in V2 nachziehen, sonst kann der User einen wiederkehrenden Termin anlegen aber die Wiederholung nicht später anpassen.

## Auth / Onboarding

- **Onboarding-Resume nach Abbruch** (Approach C — Auth-Spec): User mit `current_family_id() !== null` aber abgebrochenem Onboarding (kein Partner eingeladen, kein Kind angelegt) landet aktuell direkt auf Dashboard, statt Step 3/4 wieder aufzunehmen. Aktuell durch Empty-State auf [patterns/dashboard-empty.md](../patterns/dashboard-empty.md) abgefangen — V2 sollte eine "Onboarding fortsetzen"-CTA auf dem Dashboard zeigen (sobald `children`-Count == 0 oder `family_invitations`-Count == 0), die per Deep-Link wieder in den passenden Step springt. Dezimiert die Re-Entry-Friction.
- **Invite-Link von bereits-Mitglied geöffnet** ([features/auth/deepLinkHandler.ts](../features/auth/deepLinkHandler.ts) + Accept-Screen): Tippt ein User, der schon zu einer Familie gehört, auf einen `elternflow://invite/{token}`-Link, landet er im Namen-Eingabe-Formular und bekommt erst beim Absenden den RPC-Fehler `user already belongs to a family` (23505). Stattdessen sollte der Deep-Link-Handler früh kurzschließen und eine freundliche „Du bist bereits Teil einer Familie“-Meldung zeigen, statt das Accept-Formular anzubieten. (Aufgefallen beim Solo-Test des Invite-Flows.)

## Familie / Child-Profile (Live-Daten V1)

- **Voice-Add im Child-Profile** ([app-sections/child-profile/ChildProfileScreen.tsx](../app-sections/child-profile/ChildProfileScreen.tsx) — `child.voiceAdd`-Button) bleibt disabled-Stub, an STT/LLM-Provider gekoppelt.
- **„+ Andere“-Custom-Allergen** ist nicht umgesetzt — der Allergie-Picker zeigt nur die festen `ALLERGY_KEYS`. Freitext-Allergene erfordern eigene Eingabe + Keys-Strategie (sonst Locale-Coupling wie bei `SAMPLE_SEEDS`).
- **Likes/Dislikes ohne AI-Vorschläge** ([ChildProfileScreen.tsx](../app-sections/child-profile/ChildProfileScreen.tsx) — `TagEditor`). Aktuell reiner Freitext-Tag-Editor; das Pattern ([patterns/child-profile.md](../patterns/child-profile.md)) sieht „suggestions from AI corpus“ vor — kommt mit dem LLM-Layer.
- **Farb-Picker a11y-Labels** ([ChildProfileScreen.tsx](../app-sections/child-profile/ChildProfileScreen.tsx) — `AVATAR_COLORS`-Buttons): alle Farb-Buttons teilen sich `accessibilityLabel={t("child.colorOption")}`, Screenreader können sie nicht unterscheiden. Distinkte Labels bräuchten lokalisierte Farbnamen → neue Keys in der Designer-eigenen `docs/COPY.md`, daher an Designer-Freigabe gekoppelt (CodeRabbit-Finding).
- **Parent-Subtitle/-Edit im Familie-Tab** ([app-sections/(tabs)/familie/FamilieScreen.tsx](<../app-sections/(tabs)/familie/FamilieScreen.tsx>)): `parents`-Row hat keine `email`-Spalte (E-Mail liegt in `auth.users`), darum zeigt die Parent-Card nur den Namen. Parent-Profil bearbeiten ist noch nicht verdrahtet. (Der „Partner einladen“-Button ist seit der Invite-Iteration live — teilt sich den `useInvitePartner`-Flow mit Onboarding-Step 3.)

## Weitere Out-of-Scope-Items

- **Realtime-Subscription** auf `events` / `event_exceptions` für Multi-User-Sync.
- **Optimistic UI** in den Calendar-Mutations (aktuell invalidate-and-refetch).
- **Toast-Component** statt `Alert.alert` für transiente Hinweise (Edit-Save-Done, Delete-Done).
- **Undo nach Delete** (Snackbar mit Re-Insert-Logic).
- **Conflict-Detection** beim Anlegen/Editieren (Pattern erwähnt es, gekoppelt an Add-Flow).
- **Sample-Daten-Strings via i18n** ([features/calendar/sample.ts](features/calendar/sample.ts) — `SAMPLE_SEEDS`). Title/Location sind aktuell DE-Literals. ~26 neue Catalog-Keys nötig (13 Events × 2 Sprachen); lohnt sich erst wenn Sample-Daten länger leben als die Auth-Iteration.
- **gustar.io Worker + Stripe + Expo Notifications** — eigene Iterationen.
- **CI: Actions auf Commit-SHA pinnen** ([.github/workflows/](../.github/workflows/)) — aktuell auf Major-Version-Tags (`@v4`/`@v5`); SHA-Pinning härtet gegen Supply-Chain-Angriffe (kompromittierte Tag-Re-Points). Sinnvoll zusammen mit dem nächsten Punkt.
- **`.github/dependabot.yml`** — automatische Updates für GitHub-Actions-Versionen und Bun/npm-Dependencies. Hält gepinnte Actions/Deps aktuell, ohne manuelles Nachziehen.
- **Branch-Protection-Rule „Status-Checks required" auf `main`** — die CI-Jobs (`quality`, `build`, `dependency-review`) und den Labeler-Job als Pflicht-Checks vor Merge setzen. Nicht als Datei versionierbar (GitHub-Repo-Settings), daher manuell in den Repo-Einstellungen.
- **`jest`-Binary reparieren oder `test`-Script umbiegen** ([package.json](../package.json) — `"test": "jest"`). `bun run test`/`jest` crasht unter jest-expo 55 mit `this._moduleMocker.clearMocksOnScope is not a function` (alle Suites failen beim Laden). Der echte Runner ist `bun test` (Bun, via `bunfig.toml`-Preload — 73 Tests grün); die CI nutzt bewusst `bun test`. Follow-up: entweder jest/jest-expo-Versionen kompatibel machen (für RN-Snapshot-Tests, die den jest-Binary brauchen) oder `test`-Script auf `bun test` umbiegen und die jest-Notiz in CLAUDE.md/Tech-Stack anpassen.
