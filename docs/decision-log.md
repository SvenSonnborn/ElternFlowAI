# Decision log

## ADR-001 — Initial project setup (2026-05-18)

### Status

Accepted.

### Context

Bootstrapping the Eltern Flow AI codebase. CLAUDE.md fixed the tech stack at a
high level but left styling, state, and Voice wiring as "decide early".

### Decisions

1. **Expo SDK 54 + Expo Router 6 + React 19 + RN 0.81.** Newest stable line.
   Picks up SDK-pinned native modules via `bunx expo install`.
2. **NativeWind v4 + Tailwind 3.4.** Class-based styling matches the
   token-driven design-system; CSS variables let one Tailwind class react to a
   theme switch.
3. **Zustand + TanStack Query.** Zustand for UI/local state (e.g. active
   theme), TanStack Query for server state once Supabase is wired.
4. **Routing pattern: thin `app/` files re-exporting from `app-sections/`.**
   Keeps Expo Router's URL surface minimal while putting the real screens in
   `app-sections/` as CLAUDE.md requires.
5. **Three themes:** `warmLight` (default), `softDark`, `pastelBlue`. Designed
   to be swappable via the theme store; settings UI to come.
6. **Voice Assistant deferred.** FAB stub renders on every tab; provider
   choice (Claude / Grok / OpenAI) and STT wiring is a separate iteration.

### Consequences

- Tab labels are German (Dashboard, Kalender, Essensplanung, Hausaufgaben,
  Familie) per CLAUDE.md.
- The Tailwind `colors` map must stay in lock-step with
  `design-system/themes.ts`; both consume the same CSS variable names.
- `bun test` is wired to `jest-expo` (CLAUDE.md only specified the script
  name, not the framework).
- `package.json` `name` is `eltern-flow-ai` (lowercased + hyphenated)
  because npm package names cannot contain spaces; the user-facing app name in
  `app.json` is still `Eltern Flow AI`.

### Out of scope (for later ADRs)

- Supabase client + RLS-protected schema
- Auth + onboarding
- Edamam recipe integration with allergy filter
- Stripe subscriptions
- Real Voice + LLM provider choice
- Push notifications

## ADR-002 — Adopt handoff design system (2026-05-18)

### Status

Accepted. Supersedes parts of ADR-001 (themes, token shape, tab naming).

### Context

The full handoff bundle ([HANDOFF.md](./HANDOFF.md), `design-system/{colors,typography,spacing,themes,components,index}.ts`, [patterns/](../patterns/), [COPY.md](./COPY.md), [ICONS.md](./ICONS.md)) was dropped into the repo and replaces my ad-hoc scaffold tokens. The new tokens are deeper (scaled palettes, semantic theme roles, named text styles, component variant specs) and define a `DS` barrel + `themes` as the single import surface for all screen work.

### Decisions

1. **Tokens come from the handoff bundle, not invented locally.** All UI work imports from `@/design-system` (the `DS` barrel and named exports). The bundle's `*.ts` files are the source of truth — I never edit `colors.ts`, `typography.ts`, `spacing.ts`, `themes.ts`, `components.ts`, or `index.ts`.
2. **Two themes, not three.** `warmLight` / `softDark` / `pastelBlue` is replaced by `light` / `darkTheme`. The third theme variant was a placeholder and is gone.
3. **`design-system/components.ts` is the spec file (lowercase variant tokens).** My React component implementations moved from `design-system/components/` → `design-system/ui/` to avoid the name clash. Imports: `import { Button, Card, Screen, Text } from "@/design-system/ui"`.
4. **CSS variable names match the new theme keys.** `global.css`, `tailwind.config.js`, and `ThemeProvider` all reference `--bg`, `--card`, `--ink`, `--primary`, `--accent`, `--on-mint`, `--primary-soft`, `--line`, etc. The previous `--color-*` namespace is removed.
5. **i18n keys follow `docs/COPY.md`.** `nav.*`, `dash.*`, `auth.*`, `voice.*`, `onb.*`, `cal.*`, `meals.*`, `hw.*`, `child.*`, `set.*`. The German strings in `de.json` are the canonical copy; EN mirrors them.
6. **Tab routes renamed.** `essensplanung.tsx` → `essen.tsx`, `hausaufgaben.tsx` → `aufgaben.tsx`. The matching `app-sections/(tabs)/<name>/<Name>Screen.tsx` were renamed to `EssenScreen` / `AufgabenScreen`. New German labels per `components.tabBar`: Dashboard · Kalender · Essen · Aufgaben · Familie.
7. **Pattern-driven implementation.** Every screen build follows the matching `patterns/<screen>.md`. Foundation pass came first; Login is the first screen.

### Consequences

- CLAUDE.md still lists the old tab names (`Essensplanung`, `Hausaufgaben`). The handoff is the newer source — when these conflict, the handoff wins. CLAUDE.md should be updated by the user (it's their file).
- `app.name` is now `Eltern Flow` (no "AI") per COPY.md, even though HANDOFF.md and the project folder still say "Eltern Flow AI".
- Smoke test rewritten to assert the new theme shape (light/dark roles + DS barrel groups).
- 5 ESLint warnings remain on `design-system/index.ts` (`import/first`) because the handoff file intentionally puts `export *` before internal imports. Left as-is to avoid editing handoff files.

## ADR-003 — Supabase-Anbindung initialisiert (2026-05-28)

### Status

Accepted. Ergänzt ADR-001 (dort als "Out of scope" geführt).

### Context

Bevor Auth, Schema oder Realtime gebaut werden können, braucht das Projekt eine reproduzierbare Grundverdrahtung zu Supabase: ein leeres Cloud-Projekt, eine MCP-Verbindung für Iterations-Workflows, und einen Client der in Expo (iOS/Android/Web) funktioniert. Vorher war `features/supabase/` reiner Placeholder.

### Decisions

1. **Supabase-Projekt manuell im Dashboard angelegt** (eu-central-1, Free Tier). Keine Account-weiten Permissions für den MCP nötig — saubere Trennung.
2. **MCP via Supabases hosted HTTP-Server (`mcp.supabase.com`), project-scoped, read-write.** Konfig in `.mcp.json` (committed) — nur die URL mit `?project_ref=…`, keine Secrets. Authentifizierung läuft per OAuth-Flow (`claude /mcp` → Authenticate); der Token wird vom Claude-CLI verwaltet, nicht im Repo. Hosted statt lokalem `npx @supabase/mcp-server-supabase` gewählt: kein PAT-Management in der Shell, kein lokaler Node-Prozess pro Session, automatische Server-Updates.
3. **Client in `features/supabase/client.ts`.** `createClient` mit AsyncStorage für Session-Persistenz, `react-native-url-polyfill/auto` als Side-Effect-Import (RN hat kein vollständiges `URL`-Global), `detectSessionInUrl: false` (kein Browser-Redirect in RN). Barrel-Export via `features/supabase/index.ts`.
4. **ENV via `EXPO_PUBLIC_*`-Präfix in `.env.local`** (gitignored). Expo SDK 49+ bundlet diese Variablen automatisch in den Client. `.env.example` als committed Vorlage. App.json bleibt unverändert (kein `extra`-Block — `EXPO_PUBLIC_*` reicht). Verwendet wird der **publishable** Key (Supabase-Nachfolger von `anon` — gleiche Eigenschaften, neue Naming-Konvention); der legacy `anon`-Key funktioniert nur noch aus Kompatibilität, neue Projekte sollten direkt `publishable` nutzen. Der `secret` / legacy `service_role` Key landet **nie** im Mobile-Bundle (bypassed RLS).
5. **AsyncStorage statt SecureStore** für die anon-Session. Begründung: anon-JWT ist kein langlebiges Geheimnis (kurze Lebensdauer, refreshed automatisch), und SecureStore hat strenge Größenlimits (2 KB iOS Keychain item) die Supabase-Sessions sprengen können. Re-Evaluierung sobald Service-Role-Tokens oder PII direkt auf dem Gerät persistiert werden.

### Consequences

- Neue Dependencies: `@supabase/supabase-js`, `@react-native-async-storage/async-storage`, `react-native-url-polyfill`.
- Erster Bootstrap-Trigger: Import des Clients wirft hart, wenn ENV fehlt. Bewusst — verhindert dass spätere Auth-Calls mit kryptischen Netzwerk-Fehlern scheitern.
- Folge-ADRs nötig für: Auth-Flow (Email + OAuth?), Schema-Design (aus `sample-data/` ableiten), RLS-Policies, Realtime, Edge Functions, TS-Type-Generation.

### Out of Scope (für spätere ADRs)

- Schema, RLS-Policies, Auth-Flow, Realtime-Subscriptions, Edge Functions, generated TypeScript-Types.

## ADR-004 — DB-Schema für Family-Organizer (2026-05-29)

### Status

Accepted. Implementiert die Spec [docs/superpowers/specs/2026-05-29-supabase-schema-design.md](superpowers/specs/2026-05-29-supabase-schema-design.md).

### Context

Vor diesem ADR war das Supabase-Projekt leer (nur Auth + Client-Verdrahtung aus ADR-003). Auth-Flow, Login-Screen, oder irgendein Datenpfad waren blockiert bis das Kern-Schema steht. Brainstorming-Session hat die Architektur festgelegt; dieser ADR fasst die finalen Entscheidungen zusammen.

### Decisions (Kurzfassung — Details in der Spec)

1. **Login = pro Elternteil ein Auth-Account**, beide Eltern → gleiche `family_id`.
2. **Recurring Events via RRULE-Pattern** (eine Row, Vorkommen zur Laufzeit berechnet), Ausnahmen via `event_exceptions`.
3. **Events vs Tasks getrennt** — Events haben Zeit-Slot, Tasks nur Deadline.
4. **Lookup-Tabellen für Types** mit System-Defaults (`family_id IS NULL`) + Family-Custom.
5. **Reminders als eigene Tabelle** (n:1 zu events/tasks, mehrere Reminders pro Event möglich).
6. **Recipes als globaler Pool** mit `contains_allergens text[]` als source-of-truth für Filter (NICHT `diet_tags`).
7. **Dedup über Hash** (lower(title) + sorted(ingredients)).
8. **i18n via JSONB** für übersetzbare Felder — skalierbar ohne Schema-Migration.
9. **Allergien/Vorlieben** auf parents UND children dupliziert (pragmatisch statt Inheritance-Hierarchie).
10. **Mehrere Meal-Slots pro Tag** (breakfast/lunch/dinner/snack).
11. **RLS via `current_family_id()` Helper-Function**, `SECURITY DEFINER` RPCs nur für Onboarding (`create_family`, `accept_invitation`).

### Consequences

- 12 Tabellen + 2 RPCs + 1 Trigger; alle RLS-protected.
- TypeScript-Types generiert in `features/supabase/database.types.ts`; Client typisiert mit `createClient<Database>()`.
- Folge-Specs benötigt für: Auth-Flow (Login/Onboarding-Screens), gustar.io Edge Function (Cache-Hit + Allergen-Klassifizierung), Push-Notification-Pipeline (pg_cron + Expo Push).

### Out of Scope (für spätere ADRs)

- Realtime-Subscriptions, Cross-Family-Sharing, Soft-Delete, Storage-Bucket für Profilfotos.

## ADR-005 — Supabase Auth + Onboarding (Approach C) (2026-06-01)

### Status

Accepted. Ergänzt ADR-003 (Supabase-Anbindung) und ADR-004 (DB-Schema).

### Context

Supabase Auth, das 5-Step-Onboarding, der Reset-Password-Flow und der Partner-Invite waren als „Out of Scope" in ADR-001 markiert. Mit dem Spec-Doc [docs/superpowers/specs/2026-06-01-supabase-auth-design.md](./superpowers/specs/2026-06-01-supabase-auth-design.md) wurde der Plan dafür festgelegt; diese ADR fixiert die Architektur-Entscheidungen.

### Decisions

1. **Approach C — Incremental Real-Inserts.** Statt eines lokalen Onboarding-Drafts oder eines server-side `family_drafts`-Schemas committed Step 2 direkt via `rpc("create_family", …)`. Steps 3 + 4 sind optionale INSERTs gegen `family_invitations` und `children`. Step 5 ist eine read-only Recap. Begründung: Pattern Step 5 ist ohnehin kein Commit-Punkt, Approach C nutzt die bereits existierenden RPCs, bringt keine neue Migration mit und ist robust gegen App-Crashes.

2. **Strict Email-Confirm.** Supabase-Setting „Confirm Email" eingeschaltet. Zwischen Step 1 (`RegisterScreen` in `(auth)`) und Step 2 (`(onboarding)/2`) liegt der `CheckEmailScreen`, der dem User signalisiert, dass die Mail-Bestätigung pending ist. Deep-Link `elternflow://auth/confirm` verifiziert die OTP und löst über `onAuthStateChange` → `AuthGate` den Übergang zu Onboarding aus.

3. **V1 only Email + Password.** Magic-Link und Social-Logins (Google / Apple) sind als disabled-Buttons sichtbar mit `auth.soon`-Suffix. Reason: jeder Provider bringt eigene Iterationen mit (Cert / Console / Deep-Link-Setup, Apple Sign In ist auf iOS App Store Pflicht sobald irgendein Social-Provider live geht).

4. **Partner-Invite via Share-Sheet, nicht Edge Function.** Step 3 erzeugt eine `family_invitations`-Row (RPC) und öffnet `Share.share` (RN built-in) mit `elternflow://invite/<token>`. Server-Side-Mail ist out-of-scope (eigene Iteration mit Mail-Provider). Race-Condition zwischen zwei Klicks fängt der `FOR UPDATE`-Lock in `accept_invitation` ab; zweite Klick kriegt Postgres-Code `22023` → UI mapped auf `auth.error.linkExpired`.

5. **AuthGate als einziger Routing-Entscheider.** `<AuthGate>` im Root-Layout, gespeist von `useSession()` (Zustand-Store, von `features/calendar/sessionStore.ts` nach `features/auth/session.ts` migriert) und `useCurrentParent()` (TanStack-Query). Die Routing-Logik ist als pure Function `decideRoute(...)` extrahiert und exhaustiv getestet (9 State-Combos). Wichtige Subtlety: AuthGate wirft NICHT aus `(onboarding)` raus, wenn der `parents`-Row mid-flow (Step 2 → Step 3) entsteht — nur Step 5's explizites „Zum Dashboard" verlässt die Gruppe.

6. **AsyncStorage statt SecureStore für die Session.** Übernommen von ADR-003. Re-Evaluierung sobald PII direkt auf dem Gerät persistiert wird.

7. **Sample-Data-Fallback im Kalender entfernt.** AuthGate garantiert eine echte Supabase-Session, bevor `(tabs)` rendert. `features/calendar/sessionStore.ts` ist gelöscht (Move nach `features/auth/session.ts`); `cal.detail.requiresAuth`-Alert in EventDetailScreen entfällt. `features/calendar/sample.ts` bleibt als Smoke-Test-Artifact.

### Consequences

- Patches im Bestand: `app/_layout.tsx` (AuthGate + DeepLink-Init), `app/(tabs)/_layout.tsx` (unverändert, aber die Sample-Fallback-Pfade in `features/calendar/hooks.ts` raus), `app-sections/event/EventDetailScreen.tsx` (`requiresAuth`-Alert raus), `features/calendar/index.ts` (Session-Re-Exports raus), `patterns/onboarding.md` (Step 2 erweitert auf „Familienname + Dein Name + Avatar-Color"; „draft Family server-side" entschärft auf „Step 2 commited direkt"), `app-sections/shared/Icon.tsx` (neue Aliases `user`, `check-square`).
- Neuer Pattern-Doc: [patterns/reset-password.md](../patterns/reset-password.md) (im Spec war kein Reset-Pattern vorhanden).
- Dashboard-Settings nicht via Migration: separate Checkliste in [supabase/SETUP.md](../supabase/SETUP.md).
- Resume-nach-Abbruch-CTA auf Dashboard wurde bewusst nicht V1 — siehe [docs/TODO.md](./TODO.md).
- Neue Test-Infrastruktur: `bunfig.toml` + `bun.test.preload.ts` mockt RN + AsyncStorage + Expo-Router/Linking für Bun-Tests, weil die Module sonst beim Import unter Bun crashen.

## ADR-006 — CI/CD via GitHub Actions (2026-07-21)

### Status

Accepted. Erste CI/CD-Absicherung; ergänzt die bestehende CodeRabbit-Review-Schicht um mechanische Gates.

### Context

Bis dato gab es kein `.github/`-Verzeichnis und keine automatisierten Checks auf PRs — Qualität hing an lokalen Hooks (`lint-staged` pre-commit) und dem CodeRabbit-GitHub-Bot. Für die weitere Entwicklung braucht es reproduzierbare, PR-blockierende Gates. Spec: [docs/superpowers/specs/2026-07-21-ci-cd-github-actions-design.md](./superpowers/specs/2026-07-21-ci-cd-github-actions-design.md).

### Decisions

1. **Drei Workflows, alle `pull_request`-getriggert.** `ci.yml` (Quality + Web-Smoke-Build), `pr-labeler.yml` (Auto-Labels), `dependency-review.yml` (CVE-Gate). Kein `push`-Trigger auf `main` — main verlässt sich auf die PR-Gates davor.
2. **`ci.yml` als ein Job.** Steps in Reihenfolge: `format:check` → `lint` → `typecheck` → `bun test` → `bunx expo export --platform web` (Web-Smoke-Build zuletzt, teuerster Step), alle mit `if: ${{ !cancelled() }}`, sodass ein früher Fehler die späteren nicht verdeckt (volle Signalmenge). Ein Job statt der ursprünglich geplanten zwei parallelen (quality/build) — reine Vereinfachung, spart die duplizierten Setup-Steps. Supabase-Public-Env als Platzhalter im Workflow-`env:` (CI hat kein `.env.local`, der Client-Factory wirft sonst beim Modul-Load). **Typed-Routes-Caveat:** Expos `.expo/types` sind git-ignored und werden in CI nicht erzeugt (`expo export` generiert sie nicht, nur `expo start`), daher laufen type-aware Lint-Regeln in CI ohne die strikte `Href`-Union. Ein `as never`-Cast in `RegisterScreen` war überflüssig (die Route stand längst im `Href`-Union) und wurde entfernt — `no-unnecessary-type-assertion` hatte recht. Künftige `as`-Casts auf typisierten Routen vermeiden; siehe [docs/TODO.md](./TODO.md).
3. **Bun als CI-Runtime, gepinnt auf 1.3.10** + `bun install --frozen-lockfile`. Deckungsgleich mit lokaler Entwicklung, deterministisch.
4. **Labels aus Branch-Namen** via `actions/labeler@v5` mit `head-branch`-Regex (nicht dateipfad-basiert). Volles Conventional-Set (feat/fix/chore/docs/refactor/test). Label-Palette wird einmalig über `scripts/setup-labels.sh` angelegt.
5. **CVE-Schwelle `moderate`** in `dependency-review-action`, kein Lizenz-Gate. Balancepunkt zwischen Sicherheit und Rauschen. Setzt voraus, dass der **Dependency Graph** im Repo aktiviert ist (Settings → Code security and analysis) — bei diesem public Repo war er anfangs aus und musste einmalig manuell eingeschaltet werden (per Token/API nicht setzbar, 403).
6. **Least-Privilege-Permissions und Job-Timeouts** in allen drei Workflows; **Concurrency-Cancel und Dependency-Cache** nur in `ci.yml` (Labeler und Dependency-Review sind kurzlebige Jobs ohne Dependency-Install).

### Consequences

- Neue Dateien: `.github/workflows/{ci,pr-labeler,dependency-review}.yml`, `.github/labeler.yml`, `scripts/setup-labels.sh`.
- CodeRabbit-Verhältnis: CI macht die mechanischen Gates (lint/format/typecheck/test/build/CVE), CodeRabbit das inhaltliche Review. Der lokale CodeRabbit-pre-push-Hook bleibt deaktiviert.
- Follow-ups in [docs/TODO.md](./TODO.md): Actions auf Commit-SHA pinnen, Dependabot für Actions/Deps, Branch-Protection-Rule „Status-Checks required" auf `main` (Repo-Settings).

## ADR-007 — Dependency-Update Expo SDK 54 → 57 (+ Non-Expo-Deps) (2026-07-21)

### Status

Accepted. Hebt die Codebasis von einem 3-Major-SDK-Rückstand auf den aktuellen Stand. Spec: [docs/superpowers/specs/2026-07-21-expo-sdk-57-dependency-update-design.md](./superpowers/specs/2026-07-21-expo-sdk-57-dependency-update-design.md) · Plan: [docs/superpowers/plans/2026-07-21-expo-sdk-57-dependency-update.md](./superpowers/plans/2026-07-21-expo-sdk-57-dependency-update.md).

### Context

Das Projekt lag auf Expo SDK 54 (RN 0.81), während SDK 57 (RN 0.86) das aktuelle Stable war — drei Major-Versionen Rückstand. Zwei Rahmenbedingungen erleichterten den Sprung: der **CNG-Workflow** (`/ios` + `/android` gitignored, via `expo prebuild` regeneriert → kein nativer Code von Hand zu diffen) und dass die **New Architecture bereits aktiv** war. Der Web-Smoke-Build der CI deckt keinen nativen Code ab, daher wurde jede Stufe zusätzlich nativ (iOS + Android) verifiziert.

### Decisions

1. **Stufenweise 54→55→56→57, nie überspringen** (Expo-Empfehlung). Ein Branch (`chore/dependency-updates`), pro SDK-Stufe ein für sich grüner Commit als Rollback-Anker. Versions-Alignment ausschließlich über `bunx expo install --fix` — RN/React/reanimated/worklets/expo-\* nie von Hand pinnen.
2. **Volle Verifikation pro Stufe:** `format:check`/`lint`/`typecheck`/`bun test` + `expo export --platform web` + `expo-doctor` + nativer iOS- **und** Android-Build + manueller Flow-Smoke (Auth, 5 Tabs, Voice-FAB, Kalender, Theme, Plurale).
3. **Toolchain via mise** ([mise.toml](../mise.toml)): node 24 / bun 1.3.10 / **JDK 17**. Der System-Default JDK 26 ist zu neu für die Gradle-8.14.3-Wrapper (`Unsupported class file major version 70`); JDK 17 (RN-kanonisch) macht den Android-Build wieder grün. Zusätzlich **`RCT_USE_PREBUILT_RNCORE=0`** (`[env]`): SDK 55 aktiviert vorkompiliertes RN-Core, aber CocoaPods zog ein stale, versions-mismatchtes Binary (`React-Core-prebuilt 0.81.5` vs `0.83.6` Source → `RCTDevMenuConfiguration` „expected a type"). RN aus Source zu bauen umgeht das (Trade-off: langsamere iOS-Builds).
4. **SDK-bedingte Config-Migrationen:** `newArchEnabled` + `android.edgeToEdgeEnabled` seit SDK 55 aus dem app.json-Schema entfernt (New Arch unbedingt an); `splash` → `expo-splash-screen`-Plugin (SDK 56); TypeScript 6.0 (SDK 56) — `tsconfig.json` auf `paths` ohne `baseUrl` (TS5101) + explizites `types: ["bun-types","jest"]` (TS-6-Default ist `[]`); beim SDK-56-Install kamen über Expos Config-Plugin-Autolinking inerte Plugin-Einträge (`expo-status-bar`/`expo-font`) in die `app.json` — prop-los und damit No-Op, bewusst behalten.
5. **Non-Expo-Deps am Ende, gruppenweise** (eigene Commits): supabase-js 2.110.7, tanstack-query 5.101.4, zustand 5.0.14, date-fns 4.4.0, nativewind 4.2.6, prettier-plugin-tailwindcss 0.8.1; Majors **i18next 26 + react-i18next 17** und **react-native-url-polyfill 4** gebumpt (keine Breaking-Change-Treffer: nur `useTranslation`/`t()`, kein `<Trans>`, `compatibilityJSON: "v4"` bleibt gültig; `/auto`-Import unverändert). **Bewusst nicht angefasst:** `tailwindcss` bleibt v3 (v4 ist ein eigenes Projekt), `@react-native-async-storage/async-storage` ist Expo-managed (exakt 2.2.0).
6. **`test`-Script auf `bun test`** umgebogen (der echte Runner via `bunfig.toml`-Preload) — entkoppelt lokale/CI-Läufe von der jest-expo-Fragilität über die SDK-Bumps; `react-test-renderer` wird pro Stufe exakt an `react` gehalten (nicht Expo-managed).

### Consequences

- **Endstand:** Expo 57.0.7 · React Native 0.86.0 · React 19.2.3 · expo-router 57.0.7 · TypeScript 6.0.3 · NativeWind 4.2.6 · reanimated 4.5.0 / worklets 0.10.0. Alle Stufen nativ (iOS + Android) grün verifiziert.
- **Neue Datei:** [mise.toml](../mise.toml). CLAUDE.md um „Local toolchain (mise)" ergänzt + Tech-Stack auf SDK 57 gezogen.
- **Trade-off:** iOS baut RN aus Source (langsamer) — bewusst gegen den prebuilt-RN-Mismatch eingetauscht.
- **Follow-ups in [docs/TODO.md](./TODO.md):** `@expo/vector-icons` → scoped `@react-native-vector-icons/*` (SDK-56-Deprecation); Tailwind v3 → v4 (eigenes Projekt); `RCT_USE_PREBUILT_RNCORE=0` reaktivieren, sobald ein späteres SDK das prebuilt-RN-Core stabil ausliefert (schnellere iOS-Builds).

---

## ADR-008 — Kalender-V1 abgeschlossen: Reminder, Recurrence-Editor, Multi-Day (2026-07-28)

### Status

Accepted. Schließt die in [docs/TODO.md](./TODO.md) gesammelten Kalender-Lücken aus der Edit/Delete-Iteration (ADR-Vorlauf: [specs/2026-05-29-event-edit-delete-design.md](./superpowers/specs/2026-05-29-event-edit-delete-design.md)).

### Context

Nach der Edit/Delete-Iteration blieben vier Lücken offen: Reminder-Switches ohne Persistenz, keine Recurrence-Bearbeitung im Edit-Form, mehrtägige Termine in beiden Formularen gesperrt, und `rrule_count` über die UI gar nicht setzbar — womit der count-aware Forward-Split in [recurrence.ts](../features/calendar/recurrence.ts) nur theoretisch erreichbar war.

### Decisions

1. **Reminder an die bestehende `reminders`-Tabelle** ([features/calendar/reminders.ts](../features/calendar/reminders.ts)): Die zwei Switches (24 h / 1 h) schreiben `offset_minutes` 1440 bzw. 60. Die Tabelle hängt an `event_id` ohne `occurrence_date`, ein Switch gilt daher **für die ganze Serie** — bewusst kein Schema-Ausbau auf Verdacht. Enable ist ein einzelner `upsert` gegen den neuen Unique-Index `reminders_event_offset_uniq` ([20260728112100_reminders_unique_offset.sql](../supabase/migrations/20260728112100_reminders_unique_offset.sql)) — ein Statement, damit weder Doppel-Taps Zeilen stapeln noch ein Fehlschlag eine aktive Erinnerung halb entfernt zurücklässt. Kein Optimistic-Update — konsistent mit den übrigen Calendar-Mutations (invalidate-and-refetch); ein fehlgeschlagener Read sperrt die Switches statt „alles aus" zu behaupten.
2. **Recurrence-Änderungen laufen immer über die ganze Serie.** Ein neues `RecurrenceChanges` reist getrennt von `EventChanges` durch `applyEditScope`, weil letzteres zugleich das Per-Occurrence-Override-JSON ist, in dem rrule-Spalten keine Bedeutung haben. Liegt eine Rule-Änderung an, entfällt der Scope-Dialog: „nur diesen Termin" ist auf ein neues Wiederholungsmuster nicht sinnvoll beantwortbar. Ein echter Rule-Wechsel löscht zusätzlich **alle** `event_exceptions` des Events — sie sind auf die Occurrence-Daten der alten Regel geschlüsselt und würden sonst fremde Termine canceln. Der Delete läuft **vor** dem `updateMaster`: beide Calls sind nicht-transaktional, und ein Fehlschlag soll die alte Regel samt ihrer passenden Exceptions stehen lassen statt eine neue Regel mit veralteten Exceptions zu hinterlassen (dieselbe Schadensminimierung wie im Forward-Split-Pfad).
3. **Der Editor bleibt verborgen, wenn die gespeicherte Regel außerhalb der fünf V1-Optionen liegt** (`yearly`, `interval > 1`, beliebige Weekday-Sets). `rruleToRecurrence` gibt dafür `null` zurück, statt die Regel auf die nächstgelegene Option zu runden — Rendern des Radios würde sie beim nächsten Speichern still umschreiben. Damit bleibt [patterns/calendar.md](../patterns/calendar.md) („kein iCal-RRULE-Editor") gewahrt und importierte Regeln unbeschädigt.
4. **`rrule_count` als „Endet nach … Terminen"-Feld** in Create _und_ Edit — das macht den bereits implementierten count-aware Forward-Split erstmals über die UI erreichbar. Leeres Feld = unbegrenzt; alles außer einer Ganzzahl ≥ 1 wird als Fehler geflaggt statt still als „unbegrenzt" gespeichert. Ein gesetzter Count nullt `rrule_until` (`events_rrule_count_xor_until`).
5. **Multi-Day über getrennte Start-/End-Datumsfelder** statt eines eigenen Editors. Die Picker-Logik liegt pur und getestet in [features/calendar/dateRange.ts](../features/calendar/dateRange.ts) (Verschieben des Startdatums zieht das Enddatum um dieselbe Tages-Differenz mit), das Picker-Sheet als geteilte Komponente [DateTimePickerSheet](../app-sections/event/DateTimePickerSheet.tsx) — vorher war der Modal-Block in beiden Screens dupliziert.

### Consequences

- `CalendarOccurrence` trägt jetzt ein `rrule`-Objekt (Master-Regel), damit das Edit-Form ohne Zweit-Fetch hydrieren kann.
- `EventOps` wächst um `deleteAllExceptions`; `updateMaster` nimmt ein optionales drittes Argument.
- Neue Catalog-Keys (`cal.edit.fieldStartDate`/`fieldEndDate`/`error.invalidDateRange`/`recurrenceAppliesToAll`, `cal.create.fieldRecurrenceCount`/`recurrenceCountUnlimited`/`error.invalidCount`, `cal.detail.reminderError`); `cal.edit.fieldDate` und `cal.edit.error.multiDay` sind entfallen. Nachtrag in der designer-eigenen [docs/COPY.md](./COPY.md) steht aus → [docs/TODO.md](./TODO.md).
- **Follow-ups in [docs/TODO.md](./TODO.md):** Spanning-Rendering mehrtägiger Termine im Monatsraster, Conflict-Detection über Tagesgrenzen, Reminder-Zustellung (pg_cron + Edge Function), Voice-Add-Flow (weiter an der STT/LLM-Entscheidung).

---

## ADR-009 — Supabase-MCP authentifiziert per Personal Access Token statt OAuth (2026-07-28)

### Status

Accepted. Ersetzt den OAuth-Teil der MCP-Konfiguration aus ADR-004 (Supabase-Anbindung); die Server-URL und der Project-Scope bleiben unverändert.

### Context

Der Supabase-MCP-Server war dauerhaft „not connected". Die Diagnose zeigte: Der Endpoint ist erreichbar (`https://mcp.supabase.com/mcp` → `401`, erwartet) und `.mcp.json` war korrekt. Kaputt war der gespeicherte Credential: Im macOS-Keychain-Eintrag `Claude Code-credentials` lagen zwei `mcpOAuth`-Records für Supabase mit `clientId` + `clientSecret` (die Dynamic Client Registration lief also durch), aber **leerem `accessToken`**, ohne `refreshToken` und ohne `expiresAt` — der Token-Exchange am Localhost-Callback ist nie angekommen. Ein Probe-Request mit dem gespeicherten Token quittiert entsprechend mit `Format is Authorization: Bearer [token]`. Betroffen sind **alle** MCP-OAuth-Einträge der Maschine (Supabase ×2, Stripe, Expo), das Problem ist also der Flow, nicht der Anbieter. Ein Reconnect hilft nicht, weil der halbfertige Record wie ein gültiger aussieht.

### Decisions

1. **PAT-Header statt OAuth.** `.mcp.json` schickt `Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}`; die hosted MCP-Server unterstützen das offiziell als Weg für Clients ohne (funktionierende) Dynamic Client Registration. Deterministisch, headless- und CI-tauglich, kein Browser-Roundtrip.
2. **Der Token bleibt aus dem Repo.** `.mcp.json` enthält nur den Platzhalter und wird weiter committet; der Wert liegt im bereits gitignorierten `.env.local` (`.gitignore: .env*.local`) und ist in `.env.example` dokumentiert.
3. **mise exportiert die Variable** ([mise.toml](../mise.toml) → `[env] _.file = ".env.local"`), weil Claude Code `${…}` aus der Prozess-Umgebung expandiert. mise überspringt eine fehlende Datei still, ein frischer Clone ohne `.env.local` bricht also nicht — nachgemessen, nicht angenommen. Nebeneffekt: Die `EXPO_PUBLIC_*`-Variablen landen ebenfalls in der Shell (unkritisch, sind ohnehin public).
4. **Die kaputten Keychain-Records bleiben vorerst liegen.** Ein konfigurierter Header hat Vorrang, und ein Rewrite des Credential-Blobs würde auch die claude.ai-Session mit anfassen — Aufräumen erst, wenn der PAT-Weg nachweislich damit kollidiert.

### Consequences

- Der PAT hat **Account-Reichweite** (nicht projekt-beschränkt) — schwergewichtiger als ein OAuth-Grant. Wer den Blast-Radius kleiner will, hängt `&read_only=true` an die MCP-URL; das kostet `execute_sql`-Schreibzugriff und `apply_migration`, was bei migrations-getriebenem Schema verkraftbar wäre. Bewusst nicht default gesetzt, um die bestehenden Fähigkeiten nicht stillschweigend zu beschneiden.
- Jeder Entwickler braucht einen eigenen Token aus <https://supabase.com/dashboard/account/tokens>; ohne ihn expandiert der Header leer und der Server bleibt unverbunden (gleiches Symptom wie vorher — deshalb steht der Hinweis in `.env.example`).
- Der OAuth-Flow selbst ist damit **nicht** repariert. Stripe- und Expo-MCP hängen weiter am selben Defekt.

---

## ADR-010 — Formular-Bausteine nach `app-sections/shared/`, Web-Zweig per Plattform-Datei (2026-08-11)

### Status

Accepted. Ergänzt die Kalender-Formularentscheidungen aus [ADR-008](#adr-008--kalender-v1-abgeschlossen-reminder-recurrence-editor-multi-day-2026-07-28), Decision 5 (geteiltes Picker-Sheet), und schließt die Tasks-Reihe ab.

### Context

Die Aufgaben-Formulare brauchen dieselben Bausteine, die bisher unter `app-sections/event/` lagen: Datums-/Zeit-Picker, Personen-Auswahl, Typ-Pills. Ein Import von `app-sections/task/` nach `app-sections/event/` würde zwei Features aneinanderkoppeln, die fachlich nichts teilen. Zusätzlich rendert `@react-native-community/datetimepicker` auf Web gar nicht (`Maximum update depth exceeded`, offener TODO-Eintrag seit der Multi-Day-Iteration) — damit wäre das neue Formular auf Web weder bedienbar noch per `bun run web` prüfbar.

### Decisions

1. **Drei Komponenten wandern nach `app-sections/shared/`.** `DateTimePickerSheet` verliert dabei seine Kalender-Typen und nimmt statt `RangeField`/`DateRange` ein `mode` plus `value`; die Range-Logik (welches Ende wird bearbeitet) bleibt als zwei Zeilen in den beiden Event-Screens, wo sie hingehört. `TypePicker` nimmt fertige `{id,label,color}`-Items entgegen, statt Slug-zu-Farbe und Slug-zu-Label selbst aufzulösen — die Auflösung ist pro Feature verschieden, die Pill-Darstellung nicht. `MemberPicker` zieht unverändert um.
2. **Der Web-Picker ist eine Plattform-Datei, kein `Platform.OS`-Zweig.** `DateTimePickerSheet.web.tsx` rendert `<input type="date">`/`type="time"` in derselben Modal-Hülle; Metro wählt sie automatisch, und das native Modul landet gar nicht erst im Web-Bundle. Der geteilte Props-Typ liegt in `DateTimePickerSheet.types.ts` — ein Import aus `./DateTimePickerSheet` würde auf Web auf die Web-Datei selbst auflösen.
3. **Kein Dringlichkeits- oder Status-Feld im Formular.** Die `tasks`-Tabelle hat für beides keine Spalte: Dringlichkeit wird in `features/tasks/stats.ts` aus `due_date` abgeleitet, Status ist `is_done` und gehört der Zeilen-Checkbox mit ihrer symmetrischen Drei-Spalten-Invariante. Ein Override wie in `patterns/homework.md` angedeutet bräuchte Migration plus zweite Wahrheitsquelle in der Sektionierung — nicht auf Verdacht.
4. **Ein `TaskForm` für beide Screens** statt der Kalender-Duplikation. Bei Terminen unterscheiden sich Create und Edit inhaltlich (Ganztägig-Switch, Kollisionshinweis, Scope-Dialog); bei Aufgaben ist der Feldsatz identisch, und zwei Kopien würden auseinanderdriften.
5. **`useTask` ist ein Selektor auf `useFamilyTasks`,** keine eigene Query. Ein `taskKeys.detail(id)`-Eintrag wäre eine zweite Kopie derselben Zeile, die von keiner der vier Mutations gepatcht würde.
6. **Bestätigung destruktiver Aktionen über `confirmDestructive`, Fehlermeldungen über `showAlert`.** `Alert` ist auf react-native-web für beide Fälle ein No-op — für den Ja/Nein-Dialog ebenso wie für eine reine Hinweis-Nachricht (z. B. eine fehlgeschlagene Löschung); ein Callback dahinter würde auf Web still nie feuern. `confirmDestructive` folgt der Promise-Form von `pickScope`, `showAlert` ist das dismissible Pendant ohne Ja/Nein-Wahl.

### Consequences

- `app-sections/event/{DateTimePickerSheet,TypePicker,MemberPicker}.tsx` existieren nicht mehr; beide Event-Screens importieren aus `@/app-sections/shared`.
- Datums- und Zeitauswahl funktionieren auf Web erstmals — für Aufgaben **und** Kalender. Der entsprechende TODO-Eintrag entfällt.
- Die Typ-Pills bekommen `hitSlop`, um bei 36 px Höhe auf 44 px Trefferfläche zu kommen, ohne die Optik des Handoff-Bundles anzufassen.
- Neue Catalog-Keys (`hw.add`, `hw.notFound`, `hw.create.*`, `hw.edit.*`, `hw.form.*`, `hw.delete.*`, `hw.type.*`, drei neue `hw.error.*`). Nachtrag in der designer-eigenen [docs/COPY.md](./COPY.md) steht aus → [docs/TODO.md](./TODO.md).
- `patterns/homework.md` beschreibt weiterhin kein Formular; die Screens folgen dem Kalender-Formularmuster. Abstimmung mit dem Designer steht aus → [docs/TODO.md](./TODO.md).

---

## ADR-011 — Aufgaben-Filter client-seitig, Überfällig als eigene Sektion (2026-08-12)

### Status

Accepted. Baut auf [ADR-010](#adr-010--formular-bausteine-nach-app-sectionsshared-web-zweig-per-plattform-datei-2026-08-11) auf und ergänzt den Aufgaben-Screen um eine Filter- und Sortier-Iteration.

### Context

Der Aufgaben-Screen zeigte alles, was im Query-Fenster lag, ohne Möglichkeit einzuengen. `useFamilyTasks` lädt alle offenen Aufgaben plus sieben Tage Erledigtes in genau einen Cache-Eintrag. `tasks` hat keine Prioritätsspalte; „Dringlichkeit" ist laut `patterns/homework.md` aus `due_date` abgeleitet.

### Decisions

1. **Gefiltert wird im Cache, nicht in der Query.** Der Filter ist eine reine Funktion (`features/tasks/filter.ts`) über die bereits geladenen Zeilen. Ein Filter im Query-Key hätte pro Chip-Tap einen Roundtrip gekostet, die Cache-Einträge vervielfacht und jede Mutation gezwungen, statt eines Eintrags alle Varianten zu patchen. Ein Hybrid (Status server-seitig) wurde verworfen, weil er zwei Orte schafft, an denen „was ist sichtbar" definiert ist.
2. **Die Fälligkeits-Chips sind überlappende Fenster, keine disjunkten Eimer.** `today` und `week` schließen Überfälliges ein, exakt wie die gleichnamigen Stat-Kacheln in `computeTaskStats`. Damit wird die Chip-Reihe zum Drilldown der Stat-Leiste, statt eine zweite Zählweise danebenzustellen. Das Prädikat liest nur `due_date`, unabhängig von `is_done`, damit auch „Erledigt + Diese Woche" definiert ist.
3. **Überfällige Aufgaben bekommen eine eigene Sektion, auch ungefiltert.** `groupTasksByDue` teilt offene Aufgaben jetzt in `overdue`, `today` und `upcoming`. Konsequenz: die Kachel sagt „3 Heute fällig", während die Liste „Überfällig 2" und „Heute fällig 1" zeigt. Bewusst in Kauf genommen — die Kachel zählt, was heute zu tun ist, die Sektionen erklären, warum. Die Alternative, die Überschrift nur bei aktivem Filter umzubenennen, hätte sie von einer Beschreibung des Inhalts zu einer Funktion des UI-Zustands gemacht. `TaskRow`s `urgent: boolean` wurde dafür zu `urgency: "none" | "today" | "overdue"`; beide dringenden Zustände tönen die Card `warning`, weil `Card`s `TintTone` kein `danger` kennt und `design-system/` Handoff-Bundle ist. Spiegelbildlich rendert `AufgabenScreen` die Sektion „Zuletzt erledigt" (`doneRecent`), sobald irgendein Filter aktiv ist, nicht nur unter dem Status-Filter „Erledigt" — sonst könnte eine vom Filter durchgelassene Zeile (z. B. Status „Alle" + Fälligkeit „Überfällig" auf eine gestern erledigte überfällige Aufgabe) in `doneRecent` landen und dort verschwinden, während der Screen „Keine Treffer" meldet. Im ungefilterten Default-Zustand bleibt die Sektion weiterhin weg, damit die Standardansicht nicht um eine Woche Historie wächst.
4. **`due_time` ist der Dringlichkeits-Tiebreaker.** Sortiert wird `due_date` asc → `due_time` asc (NULL ans Ende) → Titel → `id`. Ohne Prioritätsspalte ist „bis 8 Uhr abgeben ist dringender als irgendwann heute" die Bedeutung, die „dann Dringlichkeit" tragen kann. Nebeneffekt: die Reihenfolge bei gleichem Datum ist erstmals deterministisch. Die `id` schließt die Kette ab: ohne sie gäbe der Comparator bei gleichem Termin und gleichem Titel `0` zurück, und die stabile `Array.sort` übernähme die Reihenfolge der Query — die bei Gleichstand nicht festgelegt ist, zwei gleichnamige Aufgaben könnten also zwischen zwei Refetches die Plätze tauschen. Eine echte `tasks.priority`-Spalte (Migration, zwei Formularfelder, Types-Regen) wäre eine eigene Iteration und ohne Nutzersignal spekulativ.
5. **Der Filter lebt in einem Zustand-Store ohne `persist`.** Er überlebt Tab-Wechsel und den Weg ins Formular, wird beim App-Start zurückgesetzt. `useState` im Screen wäre nicht isoliert testbar; `zustand/middleware`-`persist` führt Hydration-Handling und einen Web-Zweig neu im Repo ein — und ein vor einer Woche gesetzter Kind-Filter würde eine unvollständige Liste zeigen, ohne dass erkennbar wäre, warum.

### Consequences

- `patterns/homework.md` kennt weder die Filterleiste noch mehr als drei Sektionen, und die zwölf neuen `hw.*`-Keys fehlen in `docs/COPY.md` — beides als Designer-Abstimmung in `docs/TODO.md`.
- `useTasksByChild` bleibt ungenutzt: ein Kind-_Filter_ ersetzt keine Kind-_Gruppierung_.

---

## ADR-012 — Context7-MCP im Projekt-Scope, API-Key optional (2026-08-13)

### Status

Accepted. Ergänzt [ADR-009](#adr-009--supabase-mcp-authentifiziert-per-personal-access-token-statt-oauth-2026-07-28) um einen zweiten MCP-Server; ersetzt keine Entscheidung daraus.

### Context

Der Stack ist an mehreren Stellen jünger als jedes Trainingswissen: Expo SDK 57 + Router 57, RN 0.86, React 19.2, TypeScript ~6.0, NativeWind v4, Reanimated v4 + Worklets. Genau dort entstehen die teuren Fehler — erfundene APIs, Migrationen auf eine Major-Version, die es so nie gab, Babel-Plugin-Reihenfolgen aus der Vorgänger-SDK. Context7 (Upstash) zieht Doku und Code-Beispiele versionsspezifisch aus den Quell-Repos und stellt sie über zwei Tools bereit: `resolve-library-id` und `query-docs`.

### Decisions

1. **Projekt-Scope in `.mcp.json`, nicht User-Scope.** Der Nutzen hängt am Stack dieses Repos, und der eingecheckte Eintrag gilt für jeden, der klont — genau wie beim Supabase-Server. Ein `claude mcp add --scope user` hätte den Server an die Maschine statt an das Projekt gebunden und wäre in keinem Review sichtbar. `enableAllProjectMcpServers: true` in `.claude/settings.local.json` ist dabei lokal und pro Entwickler; der Eintrag selbst trägt keine Freigabe.
2. **Hosted HTTP-Transport (`mcp.context7.com/mcp`), kein lokales `npx @upstash/context7-mcp`.** Ein stdio-Server bräuchte eine Node-Runtime neben der mise-Pinnung und einen weiteren Prozess pro Session. Der HTTP-Server ist derselbe Bautyp wie der Supabase-Eintrag — eine URL, ein optionaler Header.
3. **Der API-Key ist optional, mit `:-`-Default.** `"Authorization": "${CONTEXT7_API_KEY:-}"` expandiert bei nicht gesetzter Variable zu einem leeren Header; verifiziert, dass Context7 darauf mit `200` und vollständiger Tool-Liste antwortet (anonymes Rate-Limit). Ohne den Default würde eine fehlende Variable die Expansion scheitern lassen — für einen Server, der auch anonym nutzbar ist, wäre das ein selbstgebauter Ausfall. Unterschied zu ADR-009: der Supabase-Token ist Pflicht (kein anonymer Modus), deshalb steht dort kein Default.
4. **Kein `Bearer `-Präfix im Header-Template.** Context7 nimmt den rohen Key entgegen; das Präfix ins Template zu schreiben, würde bei leerer Variable ein `Authorization: Bearer ` senden — ein Header, der wie ein kaputter Token aussieht statt wie „keiner".
5. **Der Key liegt in `.env.local`, nicht in `~/.zshrc`.** Damit gilt dieselbe Kette wie für `SUPABASE_ACCESS_TOKEN` (mise `[env] _.file` → Shell → `.mcp.json`-Expansion), und es gibt genau einen Ort für Projekt-Secrets. Der Upstream-Plugin-README empfiehlt die Shell-RC-Variante; die würde den Key global setzen und aus dem `.env.example`-Vertrag herausfallen.

### Consequences

- Zwei neue Tools (`resolve-library-id`, `query-docs`) sind nach Claude-Code-Neustart verfügbar. Bis dahin bleibt die Session ohne sie — MCP-Server werden beim Start verbunden, nicht bei Config-Änderung.
- Ohne Key teilen sich alle Entwickler das Anonym-Kontingent. Wenn Doku-Abfragen anfangen zu limitieren, ist der Fix ein Key pro Entwickler in `.env.local` — keine Config-Änderung.
- `.mcp.json` ist damit nicht mehr Supabase-only; die Server-Tabelle in `CLAUDE.md` ist ab jetzt die Übersicht.
- Der als optional deklarierte `CONTEXT7_API_KEY` ist der erste Eintrag in `.env.example`, dessen Leerlassen ein gültiger Endzustand ist — der Kommentar dort sagt das explizit, damit ihn niemand als vergessene Konfiguration liest.

---

## ADR-013 — Renovate als gehostete App, Expo-Kompatibilität bleibt bei `expo install --fix` (2026-08-13)

### Status

Accepted. Löst den Dependabot-Follow-up aus [ADR-006](#adr-006--cicd-via-github-actions-2026-07-21)s Consequences ab — Renovate übernimmt dessen Scope (GitHub-Actions- und npm/Bun-Updates); ADR-006 bleibt darüber hinaus unverändert gültig.

### Context

Dependency-Updates liefen bisher vollständig manuell. Zwei Eigenschaften des Repos machen ein naiv konfiguriertes Renovate gefährlich statt hilfreich:

1. **Rund die Hälfte der Deps wird von Expo SDK 57 bestimmt, nicht von npm-latest.** `react-native 0.86.0` steht in der `package.json`, weil SDK 57 es so will. Ein Bump auf 0.87 ist kein Update, sondern ein Bruch — und die CI fängt ihn nicht, weil sie nur einen Web-Export baut, keinen Native-Build.
2. **`bun 1.3.10` steht mehrfach** (`mise.toml` und als `bun-version:`-Input in allen `.github/workflows/*.yml`), und der JDK-Pin auf 17 ist eine bewusste Entscheidung gegen neuere JDKs (Gradle 8.14.3 läuft nur auf JDK ≤ 24).

Renovate kennt die Expo-Kompatibilitätsmatrix nicht; sie liegt in `bundledNativeModules.json` im installierten `expo`-Paket und wird nur von `expo install --fix` gelesen.

### Decisions

1. **Gehostete Mend-App statt self-hosted Action.** Das Repo ist public, die App damit kostenlos: kein PAT als Secret, keine Actions-Minuten, kein Renovate-Image zu pflegen. Der einzige relevante Nachteil — kein Zugriff auf private Registries — trifft dieses Projekt nicht. Die Konsequenz prägt Entscheidung 3: `postUpgradeTasks` wird von `allowedCommands` gegated, und das ist eine **self-hosted-only Admin-Option**. Renovate kann in dieser Variante nicht selbst `expo install --fix` ausführen.
2. **Expo-verwaltete Pakete laufen `rangeStrategy: "in-range-only"` (Regel 3), mit einer paketbezogenen Ausnahme für `expo` selbst (Regel 4) — nicht auf einer Blocklist.** Renovate darf für die Expo-Gruppe nur Updates bauen, die die bereits in `package.json` stehende Range erfüllen: `~57.0.7` bekommt `57.0.9`, aber nie `58.x`; exakt gepinnte Pakete wie `react-native 0.86.0` bewegen sich gar nicht. Der Vorteil gegenüber einer Paketliste ist, dass Expo die Sicherheitsgrenze bereits selbst in die `package.json` geschrieben hat — die Regel bleibt korrekt, wenn das Projekt auf SDK 58 geht, ohne dass jemand eine Liste nachpflegt. Der Renovate-Validator verbietet aber, `rangeStrategy` und `matchUpdateTypes` in derselben Regel zu kombinieren (`rangeStrategy` wird ausgewertet, bevor der Update-Type feststeht — Renovate wüsste sonst nicht, wonach es überhaupt sucht). Ohne eine eigene Regel für `expo` würde Regel 3 einen Out-of-Range-Sprung (58.x, aber auch schon einen Minor wie 57.1.0 gegen `~57.0.7`) komplett verwerfen, bevor die Gate-Regel (Decision 3) ihn je zu Gesicht bekäme — der SDK-Sprung würde also nie gemeldet. Regel 4 setzt deshalb nur für `expo` `rangeStrategy: "update-lockfile"`, was sich für In-Range-Updates wie `in-range-only` verhält, für Out-of-Range aber auf `replace` zurückfällt und die Version tatsächlich in `package.json` vorschlägt — sichtbar für die Gate-Regel. Ein zweiter, unter Bun folgenreicher Punkt: „übernehmen" heißt hier **keinen** eigenen Lockfile-only-PR pro Paket. Renovates bun-Manager liest — anders als der npm-Manager — keine `lockedVersion` aus der Lockfile, sondern extrahiert nur `package.json`; ein In-Range-Patch wie `~57.0.7` → `57.0.9` taucht deshalb gar nicht als Einzel-Update auf. Aktuell gehalten werden diese Pakete stattdessen ausschließlich über die wöchentliche, automergte `lockFileMaintenance`. Preis der ganzen Regel: die exakt gepinnten Pakete bewegen sich ausschließlich über `expo install --fix`. Das ist gewollt, denn genau dort bricht ein eigenmächtiger Bump den ungeprüften Native-Build.
3. **Erkennung bei Renovate, Auflösung bei Expo.** Renovate meldet einen SDK-Sprung im Dependency Dashboard und öffnet — erst nach Checkbox (`dependencyDashboardApproval`) — einen PR, der **nur** das Paket `expo` hebt (Regel 6, `matchUpdateTypes: ["major", "minor"]`). `expo-sdk-sync.yml` triggert auf genau diesen PR (Guard: Autor `renovate[bot]`, Label `expo-sdk`, kein Fork), läuft `expo install --fix` und pusht das Ergebnis in denselben Branch. Damit kommt `react-native` genau dann dran, wenn Expo es zulässt. Die Regel matcht bewusst **auch** `minor`, nicht nur `major`: Regel 4s `update-lockfile` fällt nicht nur für einen SDK-Major (58.x) auf `replace` zurück, sondern für jedes Out-of-Range-Update — und bei der Tilde-Range `~57.0.7` ist ein Minor-Bump (z. B. `57.1.0`) per Definition immer out-of-range. Ohne `minor` in der Liste würde so ein Update `package.json` umschreiben, aber ohne `expo-sdk`-Label und ohne Dashboard-Freigabe — `expo-sdk-sync.yml` würde dafür nie feuern, ein halb migrierter Zustand könnte gemergt werden. Die verworfene Alternative — alle Expo-Pakete in einen gemeinsamen Major-Gruppen-PR — sieht gleichwertig aus, hätte aber jedes Paket auf npm-latest gehoben: steht `react-native 0.88` auf npm, während Expo 58 auf `0.87` festlegt, entsteht ein falscher PR.
4. **Automerge nur für devDependencies (minor+patch), GitHub-Actions und Lockfile-Maintenance.** Alles andere — prod-Deps, sämtliche Majors, alles Expo-nahe an den `package.json`-Ranges, die Toolchain — geht durch ein menschliches Review. Weil das Ruleset `main protection` ein Approval verlangt und Renovate sich nicht selbst approven kann, muss die App als Bypass-Actor eingetragen werden; `automergeStrategy: "rebase"` folgt aus `allowed_merge_methods` und `required_linear_history`. Ausdrücklich **nicht** gewählt wurde ein Auto-Approve-Workflow: der hätte das Ruleset formal intakt gelassen und die Review-Pflicht auf demselben Weg ausgehebelt, nur verdeckter. Ausnahme von „alles Expo-nahe geht durch Review": die _installierte_ Version jedes Expo-verwalteten Pakets mit Tilde-Range rückt über die automergte `lockFileMaintenance` (Decision 2) ohne menschlichen Blick in-range nach — akzeptiert, weil Expos eigener Semver-Vertrag genau diese In-Range-Bewegungen bereits abdeckt und die Sicherheitsgrenze (die Range selbst) unangetastet bleibt.
5. **Ein `customManagers`-Eintrag koppelt `bun-version:` in allen `.github/workflows/*.yml` an `mise.toml`.** Renovates `github-actions`-Manager fasst nur `uses:`-Zeilen an, keine `with:`-Inputs — ohne diesen Manager driftet `local == CI` beim ersten Bun-Update auseinander. Alle Fundstellen laufen über `matchDepNames: ["bun"]` (Regel 8) in einen gemeinsamen PR.
6. **`java` ist für Renovate deaktiviert (Regel 7).** Ohne diese Regel schlägt Renovate JDK 21/25 vor und öffnet genau den `Unsupported class file major version`-Bruch, den der Kommentar in `mise.toml` beschreibt.

### Consequences

- Die Config hat acht `packageRules`, nicht sieben wie ursprünglich geplant — Decision 2 brauchte eine zusätzliche, paketbezogene Regel, weil der Validator `rangeStrategy` und `matchUpdateTypes` nicht in derselben Regel erlaubt. Die Reihenfolge ist Teil der Semantik: spätere Regeln überschreiben frühere. Regel 3 (Expo, in-range) steht nach Regel 1 (devDeps), damit `jest-expo`, `eslint-config-expo`, `@types/react` und `react-test-renderer` ohne Automerge in der Expo-Gruppe landen; Regel 5 nimmt `react-native-calendars` und `react-native-url-polyfill` wieder aus Regel 3 heraus, die deren `/^react-native-/`-Regex fälschlich mitfängt. Wer Regeln umsortiert, ändert Verhalten.
- Der Sync-Push in `expo-sdk-sync.yml` läuft mit `GITHUB_TOKEN` und triggert daher keine neuen Workflow-Runs. Nach dem Sync-Commit ist der PR einmal zu schließen und wieder zu öffnen, damit die Gates über den vollständigen Diff laufen. Dieselbe Eigenschaft verhindert eine Endlosschleife aus Push → `synchronize` → Workflow → Push.
- Der Bypass-Actor senkt den Schutz von `main`: Renovate darf ohne Review mergen. Gemildert durch den engen Automerge-Umfang, dadurch dass Renovate den Branch-Status vor dem Merge selbst prüft, und dadurch, dass der CI-Job als Required Status Check nachgetragen wird — bis dahin blockte im Ruleset **kein** Status-Check einen Merge.
- `typescript` fällt bewusst nicht unter die Expo-Regel. Minor-Bumps werden automatisch gemergt, sobald `bun run typecheck` in der CI grün ist.
- Dependabot wird nicht parallel betrieben. `dependency-review.yml` bleibt bestehen und gated künftig auch Renovate-PRs.
- `.github/labeler.yml` bleibt unberührt: Renovate setzt seine Labels selbst, und `renovate/*`-Branches matchen keine der `head-branch`-Regeln. Zwei Label-Mechanismen auf denselben PRs wären eine Quelle stiller Konflikte.
- Der Config-Validator-Aufruf (`renovate-validate.yml`) erzwingt mit `renovate@latest` eine frische npx-Auflösung, statt ein bare `--package renovate` einen zwischengespeicherten Cache-Treffer wiederverwenden zu lassen — Letzteres zog während der Umsetzung lokal einen `renovate@37.440.7` von Juli 2024 und meldete einen korrekten Config-Wert fälschlich als ungültig. `@latest` ist dabei kein Versions-Pin: lokale Läufe und CI können weiterhin unterschiedliche Renovate-Versionen auflösen, nur eben keine veraltete aus einem stehengebliebenen Cache-Eintrag.

---

## ADR-014 — Allergen-Filter: EU-14-Vokabular, vierwertiges Urteil, Regelwerk als geteiltes TS-Modul (2026-08-14)

### Status

Accepted. Ergänzt [ADR-004](#adr-004--supabase-schema-2026-05-29) um das Allergen-Vokabular und löst Decision 5c dort nicht ab, sondern füllt sie aus: `contains_allergens` bleibt Source-of-Truth, bekommt hier aber erstmals eine definierte Code-Menge und einen Umgang mit dem Fall, dass sie leer ist.

### Context

`patterns/meals.md` formuliert die Regel absolut: „Never propose a meal containing an active allergy for any family member." Umgesetzt war davon nichts. Drei Befunde standen der naheliegenden Lösung — Schnittmenge zwischen `children.allergies` und `recipes.contains_allergens` — im Weg:

1. **`families.allergies` existiert nicht.** Allergien liegen auf `children` **und** `parents`, beide `text[]`.
2. **Die beiden Vokabulare decken sich nur bei `milk`.** Die App persistiert `peanuts | milk | eggs | gluten | soy | nuts`, der Migrations-Kommentar zu `contains_allergens` nennt Rezept-Codes wie `milk, egg, wheat`. `eggs ≠ egg`, `gluten ≠ wheat` — ein direkter Vergleich schlüge still fehl, und ein eiallergisches Kind bekäme Ei-Rezepte angezeigt.
3. **Niemand befüllt `contains_allergens`.** Die im Migrations-Kommentar beschriebene Klassifizierungs-Edge-Function existiert nicht, die Spalte hat `default '{}'`. Ein Filter, der nur die Spalte liest, gäbe für jedes importierte Rezept „sicher" zurück.

Befund 3 ist der folgenreiche: er macht aus einer Mapping-Aufgabe eine Klassifizierungsaufgabe.

### Decisions

1. **Vokabular auf die 14 EU-Pflichtallergene (VO 1169/2011 Anhang II), geschlossen, kein Freitext.** Die sechs Bestands-Keys sind eine echte Teilmenge und behalten ihre Schreibweise — anders als beim Backfill von 2026-06-04 ist das kein Datenmigrations-Fall, sondern eine reine Erweiterung um acht Keys. Freitext wurde verworfen, weil er genau dort ansetzt, wo Matching still scheitert: ein getipptes „Nüsse aller Art" findet keine Regel, und ein nicht gefundener Treffer ist ein False Negative. Das geschlossene Vokabular ist der Grund, warum das Regelwerk vollständig testbar ist. Preis: Exoten wie Fructose, Histamin oder Nickel bleiben unabbildbar.
2. **Das Regelwerk lebt als reines TS-Modul in `features/meals/allergens/`, ohne React- und ohne Supabase-Import.** Verworfen wurden eine Postgres-Funktion (Begriffslisten in SQL zu pflegen ist zäh, die Zutaten liegen als `jsonb`, und die Regeln wären im `bun test`-Runner nicht prüfbar — bei einem Sicherheitsfeature das entscheidende Gegenargument) und LLM-Klassifizierung als _alleinige_ Quelle (nicht deterministisch, also nicht testbar; kostet pro Rezept; der LLM-Provider ist laut CLAUDE.md nicht gewählt). Die spätere Edge Function importiert dieselbe Datei und wird damit zusätzliche Quelle für den `declared`-Kanal, nicht Ersatz: das deterministische Regelwerk bleibt Gegenprobe und Sicherheitsnetz.
3. **Vier Zustände statt Boolean: `safe` / `unsafe` (deklariert) / `caution` (aus Zutaten erschlossen) / `unverified`.** Ein Boolean kann „keine Allergene" nicht von „wir wissen es nicht" unterscheiden — beides wäre `true`. Die tragende Regel: **eine leere Deklaration wird nie zu `safe`**, sondern zu `unverified`. Die Heuristik kann Anwesenheit belegen, niemals Abwesenheit. Gegenregel gegen Rauschen: eine Familie ohne hinterlegte Allergien bekommt immer `safe`, sonst stünde bei ihr überall „nicht geprüft".
4. **Matching nach Sprache: Substring für deutsche Terme, Wortgrenze für kurze und englische.** Deutsch schreibt Komposita zusammen — `weizen` muss „Vollkornweizenmehl" finden, `hafer` muss „Haferflocken" finden. Pauschales Substring-Matching ist aber gefährlich: `ei` trifft **Reis** und **Weizen**, das englische `nut` trifft „nutmeg" und „coconut". Ergänzt um Negativlisten je Key, die drei Fallen entschärfen, die während der Umsetzung real auftraten: **Buchweizen** enthält `weizen`, ist aber glutenfrei; **Schweinefleisch** enthält `wein` und hätte Sulfite gemeldet; **Kokos-** und **Muskatnuss** sind keine Schalenfrüchte im Sinne der Kennzeichnung. Ein bloßer Term `mehl` wurde gestrichen — er hätte über „Mandelmehl", „Reismehl", „Maismehl" fast jedes Rezept als glutenhaltig markiert und die Kennzeichnung entwertet.
5. **Der Negations-Guard wirkt pro Term-Vorkommen, nicht pro Key.** Ein Key trifft, sobald mindestens ein nicht-negiertes Vorkommen übrig bleibt. Folge, und der Grund für diese Konstruktion: **`laktosefrei` hebt `milk` nicht auf.** Laktosefrei heißt gespaltener Milchzucker, nicht entferntes Milcheiweiß — ein milchallergisches Kind kann das nicht essen, ein laktoseintolerantes schon. Das Schema trennt beides bereits in `allergies` und `intolerances`; ein naiver `frei`-Guard hätte aus einer Sicherheits- eine Gesundheitslücke gemacht. Die Negation hebt außerdem nur den getroffenen Key auf: veganer Käse aus Cashews bleibt ein `nuts`-Treffer.
6. **Gefiltert wird clientseitig; `RecipeFilter.excludeAllergens` bleibt ungenutzt.** Serverseitiges Filtern über `not(…, "ov", …)` entfernte die Zeilen, statt sie auszugrauen — der Nutzer könnte „existiert nicht" nicht von „wurde gefiltert" unterscheiden. Nebeneffekt: die ohnehin nicht indexierbare negierte Overlap-Bedingung entfällt.
7. **Über allem: im Zweifel melden.** Ein False Positive kostet einen überflüssigen Hinweis, ein False Negative kostet mehr.

### Consequences

- **Die Begriffslisten sind ein lebender Korpus, kein fertiges Artefakt.** Sie decken den Startbestand ab und brauchen Nachschärfung an echten gustar.io-Daten. Jeder neue Term braucht einen Testfall, jeder False Positive einen `exclude`-Eintrag. Der Vollständigkeitstest bricht, sobald ein Key ohne Term oder ohne i18n-Label dasteht.
- **`unverified` dominiert, bis ein Klassifizierer läuft.** Das ist der bewusst gewählte, ehrliche Preis von Decision 3 — nicht ein Übergangsschaden, sondern die korrekte Aussage über die Datenlage.
- **Ein geprüftes Rezept ohne Fund hat keine saubere Ausdrucksform.** Ein Klassifizierer, der nichts findet, schreibt `{}` — ununterscheidbar von „nie klassifiziert". Die Seeds überbrücken das mit dem dokumentierten Sentinel `contains_allergens = {'none'}`; `keyForDeclaredCode('none')` liefert `null`, der Code trifft also nie, macht das Array aber nicht-leer. Sauber wäre eine eigene Spalte `allergens_classified_at timestamptz` — dann trüge der Zeitstempel „wurde geprüft" und das Array nur noch „das wurde gefunden". Bewusst nicht mitten in der Umsetzung nachgezogen, weil es `database.types.ts`, `JudgeableRecipe` und die Tests berührt; vermerkt in `docs/TODO.md`.
- **Die Chip-Reihe in Onboarding und Kinderprofil wird sichtbar dichter** (6 → 14 Optionen). Beide Screens brauchten keine Code-Änderung — sie mappen über `ALLERGY_KEYS`, das jetzt auf `ALLERGEN_KEYS` re-exportiert. `patterns/onboarding.md` und `patterns/child-profile.md` beschreiben noch sechs; mit dem Designer abzustimmen.
- **`intolerances` bleibt ungelesen.** Unverträglichkeiten sind medizinisch etwas anderes als Allergien — der Laktose-Fall in Decision 5 zeigt, dass die beiden Achsen nicht dasselbe Urteilsmodell teilen können.
- `features/children/allergies.ts` ist zur Re-Export-Schicht geworden; `AllergyKey` bleibt als Alias auf `AllergenKey` bestehen, damit die bestehenden Importpfade unverändert weiterlaufen.
