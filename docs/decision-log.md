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

Accepted. Ergänzt [ADR-004](#adr-004--db-schema-für-family-organizer-2026-05-29) um das Allergen-Vokabular und löst Decision 5c dort nicht ab, sondern füllt sie aus: `contains_allergens` bleibt Source-of-Truth, bekommt hier aber erstmals eine definierte Code-Menge und einen Umgang mit dem Fall, dass sie leer ist.

### Context

`patterns/meals.md` formuliert die Regel absolut: „Never propose a meal containing an active allergy for any family member." Umgesetzt war davon nichts. Drei Befunde standen der naheliegenden Lösung — Schnittmenge zwischen `children.allergies` und `recipes.contains_allergens` — im Weg:

1. **`families.allergies` existiert nicht.** Allergien liegen auf `children` **und** `parents`, beide `text[]`.
2. **Die beiden Vokabulare decken sich nur bei `milk`.** Die App persistiert `peanuts | milk | eggs | gluten | soy | nuts`, der Migrations-Kommentar zu `contains_allergens` nennt Rezept-Codes wie `milk, egg, wheat`. `eggs ≠ egg`, `gluten ≠ wheat` — ein direkter Vergleich schlüge still fehl, und ein eiallergisches Kind bekäme Ei-Rezepte angezeigt.
3. **Niemand befüllt `contains_allergens`.** Die im Migrations-Kommentar beschriebene Klassifizierungs-Edge-Function existiert nicht, die Spalte hat `default '{}'`. Ein Filter, der nur die Spalte liest, gäbe für jedes importierte Rezept „sicher" zurück.

Befund 3 ist der folgenreiche: er macht aus einer Mapping-Aufgabe eine Klassifizierungsaufgabe.

### Decisions

1. **Vokabular auf die 14 EU-Pflichtallergene (VO 1169/2011 Anhang II), geschlossen, kein Freitext.** Die sechs Bestands-Keys sind eine echte Teilmenge und behalten ihre Schreibweise — anders als beim Backfill von 2026-06-04 ist das kein Datenmigrations-Fall, sondern eine reine Erweiterung um acht Keys. Freitext wurde verworfen, weil er genau dort ansetzt, wo Matching still scheitert: ein getipptes „Nüsse aller Art" findet keine Regel, und ein nicht gefundener Treffer ist ein False Negative. Das geschlossene Vokabular ist der Grund, warum das Regelwerk vollständig testbar ist. Preis: Exoten wie Fructose, Histamin oder Nickel bleiben unabbildbar.
2. **Das Regelwerk lebt als reines TS-Modul in `features/meals/allergens/`, ohne React- und ohne Supabase-Import.** Verworfen wurden eine Postgres-Funktion (Begriffslisten in SQL zu pflegen ist zäh, die Zutaten liegen als `jsonb`, und die Regeln wären im `bun test`-Runner nicht prüfbar — bei einem Sicherheitsfeature das entscheidende Gegenargument) und LLM-Klassifizierung als _alleinige_ Quelle (nicht deterministisch, also nicht testbar; kostet pro Rezept; der LLM-Provider ist laut CLAUDE.md nicht gewählt). Die spätere Edge Function importiert dieselbe Datei und wird damit zusätzliche Quelle für den `declared`-Kanal, nicht Ersatz: das deterministische Regelwerk bleibt Gegenprobe und Sicherheitsnetz.
3. **Vier Zustände statt Boolean: `safe` / `unsafe` (deklariert) / `caution` (aus Zutaten erschlossen) / `unverified`.** Ein Boolean kann „keine Allergene" nicht von „wir wissen es nicht" unterscheiden — beides wäre `true`. Die tragende Regel: **eine leere Deklaration wird nie zu `safe`**, sondern zu `unverified`. Die Heuristik kann Anwesenheit belegen, niemals Abwesenheit. Dasselbe gilt für eine Deklaration mit einem **unbekannten Code**: er könnte in einem fremden Vokabular genau das gesuchte Allergen benennen, also blockiert auch er `safe`. Die eine Ausnahme ist der ausdrückliche Marker `NO_ALLERGENS_CODE` (`'none'`) — er benennt kein Allergen, gilt aber als verstanden und macht damit „geprüft, nichts gefunden" überhaupt erst ausdrückbar. Gegenregel gegen Rauschen: eine Familie ohne hinterlegte Allergien bekommt immer `safe`, sonst stünde bei ihr überall „nicht geprüft". Und solange die Allergien der Familie noch laden oder ihre Abfrage fehlschlug, urteilt der Screen `unverified` statt `safe` — ein leeres `keys` sieht für das Urteil sonst aus wie „keine Allergien", und jedes Rezept blitzte unmarkiert auf, bevor es rot wird.
4. **Matching nach Sprache: Substring für deutsche Terme, Wortgrenze für kurze und englische.** Deutsch schreibt Komposita zusammen — `weizen` muss „Vollkornweizenmehl" finden, `hafer` muss „Haferflocken" finden. Pauschales Substring-Matching ist aber gefährlich: `ei` trifft **Reis** und **Weizen**, das englische `nut` trifft „nutmeg" und „coconut". Ergänzt um Negativlisten je Key, die drei Fallen entschärfen, die während der Umsetzung real auftraten: **Buchweizen** enthält `weizen`, ist aber glutenfrei; **Schweinefleisch** enthält `wein` und hätte Sulfite gemeldet; **Kokos-** und **Muskatnuss** sind keine Schalenfrüchte im Sinne der Kennzeichnung. Ein bloßer Term `mehl` wurde gestrichen — er hätte über „Mandelmehl", „Reismehl", „Maismehl" fast jedes Rezept als glutenhaltig markiert und die Kennzeichnung entwertet.
5. **Der Negations-Guard wirkt pro Term-Vorkommen, nicht pro Key.** Ein Key trifft, sobald mindestens ein nicht-negiertes Vorkommen übrig bleibt. Folge, und der Grund für diese Konstruktion: **`laktosefrei` hebt `milk` nicht auf.** Laktosefrei heißt gespaltener Milchzucker, nicht entferntes Milcheiweiß — ein milchallergisches Kind kann das nicht essen, ein laktoseintolerantes schon. Das Schema trennt beides bereits in `allergies` und `intolerances`; ein naiver `frei`-Guard hätte aus einer Sicherheits- eine Gesundheitslücke gemacht. Die Negation hebt außerdem nur den getroffenen Key auf: veganer Käse aus Cashews bleibt ein `nuts`-Treffer.
6. **Gefiltert wird clientseitig; `RecipeFilter.excludeAllergens` bleibt ungenutzt.** Serverseitiges Filtern über `not(…, "ov", …)` entfernte die Zeilen, statt sie auszugrauen — der Nutzer könnte „existiert nicht" nicht von „wurde gefiltert" unterscheiden. Nebeneffekt: die ohnehin nicht indexierbare negierte Overlap-Bedingung entfällt.
7. **Über allem: im Zweifel melden.** Ein False Positive kostet einen überflüssigen Hinweis, ein False Negative kostet mehr.

### Consequences

- **Die Begriffslisten sind ein lebender Korpus, kein fertiges Artefakt.** Sie decken den Startbestand ab und brauchen Nachschärfung an echten gustar.io-Daten. Jeder neue Term braucht einen Testfall, jeder False Positive einen `exclude`-Eintrag. Der Vollständigkeitstest bricht, sobald ein Key ohne Term oder ohne i18n-Label dasteht.
- **`unverified` dominiert, bis ein Klassifizierer läuft.** Das ist der bewusst gewählte, ehrliche Preis von Decision 3 — nicht ein Übergangsschaden, sondern die korrekte Aussage über die Datenlage.
- **Ein geprüftes Rezept ohne Fund hat keine saubere Ausdrucksform.** Ein Klassifizierer, der nichts findet, schreibt `{}` — ununterscheidbar von „nie klassifiziert". Überbrückt mit dem ausdrücklichen Marker `NO_ALLERGENS_CODE` (`'none'`): er benennt kein Allergen und trifft nie, zählt aber als bekannter Code und erlaubt damit `safe`. Sauber wäre eine eigene Spalte `allergens_classified_at timestamptz` — dann trüge der Zeitstempel „wurde geprüft" und das Array nur noch „das wurde gefunden". Bewusst nicht mitten in der Umsetzung nachgezogen, weil es `database.types.ts`, `JudgeableRecipe` und die Tests berührt; vermerkt in `docs/TODO.md`.
- **Die Chip-Reihe in Onboarding und Kinderprofil wird sichtbar dichter** (6 → 14 Optionen). Beide Screens brauchten keine Code-Änderung — sie mappen über `ALLERGY_KEYS`, das jetzt auf `ALLERGEN_KEYS` re-exportiert. `patterns/onboarding.md` und `patterns/child-profile.md` beschreiben noch sechs; mit dem Designer abzustimmen.
- **`intolerances` bleibt ungelesen.** Unverträglichkeiten sind medizinisch etwas anderes als Allergien — der Laktose-Fall in Decision 5 zeigt, dass die beiden Achsen nicht dasselbe Urteilsmodell teilen können.
- `features/children/allergies.ts` ist zur Re-Export-Schicht geworden; `AllergyKey` bleibt als Alias auf `AllergenKey` bestehen, damit die bestehenden Importpfade unverändert weiterlaufen.

## ADR-015 — Renovate: Expos Versionshoheit deckt beide Vorgabe-Kanäle ab (2026-08-14)

### Status

Accepted. Zwei verschiedene Verhältnisse zu [ADR-013](#adr-013--renovate-als-gehostete-app-expo-kompatibilität-bleibt-bei-expo-install---fix-2026-08-13), die nicht vermischt werden dürfen:

- **Korrektur der Umsetzung** von Decision 2. „Expo-verwaltete Pakete laufen `rangeStrategy: in-range-only`" gilt unverändert weiter — nur die Paketliste, die diese Absicht durchsetzen sollte, war unvollständig. Betrifft `@react-native-async-storage/async-storage`, `jest` und `@types/jest`.
- **Supersession** der ADR-013-Consequence „`typescript` fällt bewusst nicht unter die Expo-Regel. Minor-Bumps werden automatisch gemergt, sobald `bun run typecheck` in der CI grün ist." Für `typescript` gilt ab hier das Gegenteil: es steht in Regel 3, läuft `in-range-only` und wird nicht mehr automergt. ADR-013 bleibt unverändert stehen; diese Aussage dort ist ab 2026-08-14 überholt.

### Context

Am 2026-08-14 standen sieben Renovate-PRs offen. Drei davon wollten Pakete anheben, deren Version Expo SDK 57 ausdrücklich vorschreibt:

| PR  | Paket                                       | Vorschlag                                    | SDK 57 schreibt vor   |
| --- | ------------------------------------------- | -------------------------------------------- | --------------------- |
| #80 | `@react-native-async-storage/async-storage` | `2.2.0` → `3.1.1`                            | `2.2.0`               |
| #84 | `typescript`                                | `~6.0.3` → `~7.0.0`                          | `~6.0.3`              |
| #85 | `jest` / `@types/jest`                      | `~29.7.0` → `~30.4.0` / `29.5.14` → `30.0.0` | `~29.7.0` / `29.5.14` |

Alle drei waren in CI grün — was nichts beweist: `ci.yml` endet beim Web-Export, und `expo-doctor` läuft nur in `expo-sdk-sync.yml`, das mangels `expo-sdk`-Label korrekt übersprungen wurde. Bei async-storage v3 wäre der ungeprüfte Teil der größte gewesen: ein Native-Rewrite mit vendored `SharedAsyncStorage.xcframework` auf iOS, Room + KSP auf Android und umbenanntem TurboModule (`RNCAsyncStorage` → `RNAsyncStorage`).

Zwei getrennte Ursachen, beide in derselben Liste (Regel 3, `matchPackageNames`):

1. **Ein Scope-Muster traf nicht.** Gelistet waren `/^@react-native\//` und `/^@react-native-community\//`. Der Scope `@react-native-async-storage/` passt auf keines von beiden — nach `native` steht ein `-`, kein `/`. Das Paket lief dadurch komplett ungeregelt.
2. **Ein ganzer Vorgabe-Kanal fehlte.** Die Annahme hinter der Liste war, Expos Vorgaben stünden in `bundledNativeModules.json`. Das ist nur die Hälfte: die Toolchain — `jest`, `@types/jest`, `typescript`, `metro`, `babel-preset-expo` — liegt in `relatedPackages` der Versions-API. Diese Pakete tragen kein Expo-Namensmuster und fallen deshalb durch jedes Regex.

### Decisions

1. **Beide Kanäle sind normativ, und der Kommentar in `renovate.json5` benennt sie samt Abruf-URL.** `bundledNativeModules.json` (bzw. `api.expo.dev/v2/sdks/<version>/native-modules`) für Native-Module, `relatedPackages` aus `api.expo.dev/v2/versions/latest` für die Toolchain. Ohne diese Notiz sieht `typescript` in einer Liste namens „Expo-SDK-verwaltete Pakete" wie ein Versehen aus und wird beim nächsten Aufräumen gestrichen — die Lücke käme zurück. `bunx expo install --check` ist die schnellste Gegenprobe, weil es gegen genau diese beiden Quellen prüft.
2. **Die Scope-Muster werden zu `/^@react-native[-\/]/` zusammengezogen, statt den fehlenden Scope einzeln nachzutragen.** Ein Einzeleintrag hätte den konkreten PR erledigt und die Fehlerklasse gelassen: jeder künftige `@react-native-*`-Scope wäre erneut still durchgefallen. Breit fassen und Fehltreffer über Regel 5 herausnehmen ist außerdem exakt das Muster, das `/^react-native-/` hier bereits nutzt — die Config bekommt damit eine Konvention statt zwei.
3. **`jest`, `@types/jest` und `typescript` stehen namentlich in Regel 3.** Kein Muster kann sie fassen. Weil Regel 3 nach Regel 1 (devDeps, Automerge) steht, gewinnt sie — die drei landen ohne Automerge in der Expo-Gruppe, wie `jest-expo` und `@types/react` vorher schon.
4. **`typescript` wird bewusst gegen ADR-013 in die Expo-Regel gezogen.** ADR-013 hatte es ausgenommen mit der Begründung, ein grüner `bun run typecheck` gate den Bump ausreichend ab. Das Argument trägt nicht weit genug: `typecheck` prüft, ob **unser** Code unter der neuen TS-Version kompiliert, nicht, ob `jest-expo`, `babel-preset-expo` und die Expo-Typdefinitionen es tun — und genau die schreibt Expo mit `~6.0.3` fest. Ein automergter Minor hätte die `package.json`-Range auf `~6.1.0` gehoben und damit die Grenze verschoben, die Expo gesetzt hat; das ist dieselbe Klasse stiller Drift, die diese ADR sonst schließt. Der Preis ist real und wird hier ausdrücklich in Kauf genommen: eine neue TS-Minor-Version steht erst zur Verfügung, wenn ein SDK sie vorschreibt. Wer das anders gewichtet, nimmt `typescript` aus Regel 3 heraus — dann gilt wieder ADR-013s Fassung, und diese Decision ist die Stelle, an der die Abwägung steht.
5. **`react-test-renderer` bleibt in der Liste, obwohl SDK 57 es nicht mehr vorschreibt** (React 19 hat es deprecated; es steht in keinem der beiden Kanäle). Streichen würde es unter Regel 1 stellen und damit automergefähig machen — für ein Paket, das im Repo nirgends importiert wird und ohnehin schon direkte Dependency von `jest-expo` ist, wäre das mehr Bewegung statt weniger. Der Eintrag friert einen exakten Pin ein und kostet nichts. Aufräumen gehört an die Entscheidung über `@testing-library/react-native` (siehe `docs/TODO.md`), nicht hierher.

### Consequences

- **Die drei PRs schließt Renovate beim nächsten Lauf selbst.** `in-range-only` verwirft Out-of-Range-Updates vollständig, statt sie vorzuschlagen — sie werden nicht neu erzeugt. Manuelles Schließen ist unnötig und wäre sogar schlechter: ein per Hand geschlossener Renovate-PR gilt als dauerhaftes Ignore und würde einen später legitimen Bump ebenfalls unterdrücken.
- **Diese vier Pakete bewegen sich ab jetzt nur noch über `expo install --fix` bzw. `lockFileMaintenance`.** Für `typescript ~6.0.3` und `jest ~29.7.0` heißt das: Patches fließen in-range über die wöchentliche Lockfile-Pflege, ein Sprung auf TS 7 oder Jest 30 kommt erst mit dem SDK, das ihn vorschreibt. Das ist der bewusste Preis — dieselbe Logik wie bei `react-native` in ADR-013.
- **Die Liste bleibt wartungsbedürftig, und zwar bei jedem SDK-Sprung.** `relatedPackages` ist SDK-versioniert; SDK 58 kann Pakete aufnehmen oder entlassen. Der Abgleich gehört damit in die Nacharbeit von `expo-sdk-sync.yml` — vermerkt in `docs/TODO.md`.
- **Grüne CI bleibt für Native-Pakete ein schwaches Signal.** Diese ADR schließt die Lücke bei der Auswahl, nicht bei der Prüfung: ein Native-Bump, der es doch bis in einen PR schafft, wird von `format/lint/typecheck/test/web-export` weiterhin nicht bemerkt. Ein `expo-doctor`-Schritt auf jedem Dependency-PR wäre die eigentliche Absicherung — offen in `docs/TODO.md`.

## ADR-016 — Native-Build-Gate auf jedem PR, auf GitHub-Runnern statt EAS (2026-08-14)

### Status

Accepted. **Keine Supersession.** [ADR-013](#adr-013--renovate-als-gehostete-app-expo-kompatibilität-bleibt-bei-expo-install---fix-2026-08-13) (Decision 1) und [ADR-015](#adr-015--renovate-expos-versionshoheit-deckt-beide-vorgabe-kanäle-ab-2026-08-14) (letzte Consequence) haben diese Lücke jeweils benannt und offengelassen; beide Aussagen bleiben inhaltlich unverändert richtig. Diese ADR schließt sie — und geht über den dort vorgeschlagenen `expo-doctor`-Schritt hinaus, der nur Versionen vergleicht, statt zu bauen.

Zwei Faktenkorrekturen in `CLAUDE.md` und `mise.toml` gehören dazu (siehe Consequences). Die älteren ADRs bleiben dabei bewusst unangetastet: ihre Zahlen waren zum Zeitpunkt der Entscheidung korrekt.

### Context

`ci.yml` endete beim Web-Export. Das Repo hat diese Grenze zweimal protokolliert und zweimal nicht geschlossen — ADR-013 Decision 1 („die CI fängt ihn nicht, weil sie nur einen Web-Export baut, keinen Native-Build") und ADR-015 („Alle drei waren in CI grün — was nichts beweist"). Bei `@react-native-async-storage/async-storage` v3 wäre der ungeprüfte Anteil ein Native-Rewrite gewesen: vendored `SharedAsyncStorage.xcframework` auf iOS, Room + KSP auf Android, umbenanntes TurboModule. Nichts davon ist an einem Web-Bundle sichtbar.

Zwei Randbedingungen machen den Zuschnitt aus:

1. **Das Projekt fährt CNG** — `/ios` und `/android` sind gitignored. CI hat also kein Native-Projekt zum Bauen, sondern muss es mit `expo prebuild` erst erzeugen. Das ist kein Nachteil, sondern prüft den Config-Plugin-Pfad gleich mit.
2. **Das Repo ist öffentlich.** GitHub-Standard-Runner sind damit kostenlos und unbegrenzt — einschließlich macOS, für das private Repos den 10×-Multiplikator zahlen. Der übliche Kostenvergleich „macOS-CI ist teuer, nimm EAS" gilt hier nicht.

### Decisions

1. **Voller Compile beider Plattformen, blockierend auf jedem PR.** Verworfen wurden: nur `prebuild` + Dependency-Auflösung (findet Config-Plugin- und Versionskonflikte, aber keinen einzigen Compile-Fehler — genau die Klasse, die ADR-015 motiviert hat), Android-only (die iOS-Seite ist die mit der Vorgeschichte, siehe `RCT_USE_PREBUILT_RNCORE`), und Pfad-Filter auf Dependency-Dateien (fängt den Renovate-Fall, aber nicht handgeschriebenen Code, der ein Native-Modul neu importiert). Der Preis ist ausdrücklich in Kauf genommen und real: **jeder** PR wartet auf den iOS-Job, auch ein reiner Copy-Fix.

2. **GitHub-Runner statt EAS Build — als Gate.** EAS Free umfasst 15 iOS + 15 Android Builds pro Monat bei harter Obergrenze, **1 Concurrency** und einer Low-Priority-Queue, die regelmäßig 90+ Minuten wartet, bevor der Build startet. Auf ein blockierendes Per-PR-Gate übersetzt: 15 Pushes im Monat, iOS und Android nacheinander statt parallel, ~2 Stunden bis zur Rückmeldung — und das Kontingent wäre für echte Release-Builds aufgebraucht. Gate-tauglich würde das erst der Production-Plan zu $199/Monat. **EAS bleibt trotzdem vorgesehen, nur für die andere Hälfte:** Credential-Verwaltung, signierte Artefakte, TestFlight, Store-Submit. Dafür passen 15+15 im Monat genau, weil niemand 15 Releases im Monat schneidet. Die Trennlinie ist damit **Korrektheitsprüfung → GitHub, Auslieferung → EAS**, nicht „entweder/oder".

3. **Drei Jobs, parallel, ohne `needs:` untereinander.** Da Runner-Minuten gratis sind, ist Wartezeit die einzige Währung: `max()` statt `sum()`. Ein `needs: bundle` hätte drei Minuten Fail-Fast erkauft und dafür im Erfolgsfall — dem Normalfall — dieselben drei Minuten auf jeden PR addiert.

4. **Der `bundle`-Job ist eine eigenständige Prüfung, kein Vorlauf.** Er baut das **native** Metro-Bundle, das sonst nirgends entsteht. Der Web-Export löst `DateTimePickerSheet.web.tsx` auf; das native Geschwister `DateTimePickerSheet.tsx` ([ADR-010](#adr-010--formular-bausteine-nach-app-sectionsshared-web-zweig-per-plattform-datei-2026-08-11)) wird von ihm nie kompiliert. Die beiden Compile-Jobs schließen die Lücke ebenfalls nicht, weil Debug-Varianten JS gar nicht bundeln, sondern zur Laufzeit von Metro laden. Heute ist es genau eine Datei — die Plattform-Datei ist aber ein etabliertes Muster dieses Repos, und die Prüfung kostet drei Minuten auf Linux.

5. **Die Toolchain kommt aus `mise.toml` (via `jdx/mise-action@v4`), und beide Pins werden zusätzlich explizit geprüft.** Eine zweite Kopie der Pins in YAML hätte gedriftet: `mise.toml` ist das Dokument, das der Entwickler-Shell die JDK-Version vorgibt, und ein künftiger Wechsel auf JDK 21 muss CI mitnehmen. Der Assertion-Schritt ist trotzdem nötig, weil beide Fehlerbilder nach einem Projektfehler aussehen statt nach Toolchain-Drift: ein falsches JDK meldet `Unsupported class file major version`, und ein nicht durchgereichtes `RCT_USE_PREBUILT_RNCORE` fällt **still** auf `1` zurück. Letzteres ist der gefährlichere Fall — `ios/Podfile` Zeile 19 leitet den Wert per `||=` aus einem `Podfile.properties.json`-Key ab, den dieses Projekt nicht setzt; ohne die Variable baut CI also gegen vorkompiliertes RN-Core, während jede Entwicklermaschine aus dem Quellcode baut. `ci.yml` bleibt unverändert bei `oven-sh/setup-bun` — es braucht weder JDK noch die iOS-Variable, und ein laufender grüner Workflow wird nicht ohne Anlass umgebaut.

6. **iOS baut unsigniert für den Simulator (`CODE_SIGNING_ALLOWED=NO`).** Damit braucht das Gate kein Zertifikat, kein Provisioning-Profil, kein einziges GitHub-Secret und keinen Expo-Account. Die gestellte Frage ist „kompiliert das Projekt", nicht „ist das installierbar" — Letzteres ist Decision 2s EAS-Hälfte. Nebeneffekt: der Workflow läuft unverändert auf Forks, weil er auf nichts Geheimes zugreift.

7. **Kein ccache — zwei Anläufe, beide messbar wirkungslos, Konfiguration wieder entfernt.** Die ursprüngliche Fassung dieser Decision hieß „ccache ist Voraussetzung, nicht Optimierung" und behauptete, `USE_CCACHE=1` drücke den From-Source-Build „in den ~15-Minuten-Bereich". Das war eine **ungeprüfte Schätzung**, und drei Läufe haben sie widerlegt (Messwerte in den Consequences). Was bleibt, ist die Erkenntnis, warum es nicht trug: RNs Wrapper (`react-native/scripts/xcode/ccache-clang.sh`) endet auf `exec $CCACHE_BINARY clang "$@"`. Erreicht `CCACHE_BINARY` den Compiler-Prozess nicht, degradiert die Zeile **still** zu plain clang — der Build wird grün, und nichts wird gecacht. Genau das ist passiert, in beiden Varianten (Step-`env:` und zusätzlich als `xcodebuild`-Build-Setting): `ccache --show-stats` meldete keine einzige „Cacheable call", `/tmp/ccache` und `~/Library/Caches/ccache` blieben beide leer. **Die Konfiguration ist deshalb entfernt statt „vorsichtshalber" stehengelassen** — `brew install ccache`, ein Cache-Step, drei Umgebungsvariablen, zwei Build-Settings und der Statistik-Step, zusammen rund 50 Zeilen. Toter Code, der wie eine Optimierung aussieht, ist schlechter als gar keine: er lädt dazu ein, die Laufzeit für „schon optimiert" zu halten. Wer es erneut versucht, **belegt zuerst, dass `CCACHE_BINARY` beim Compiler ankommt**, und baut erst danach die Cache-Steps drumherum.

8. **`--build-cache` bei Android bleibt, obwohl sein Nutzen unbewiesen ist.** Gradles Build-Cache ist per Default aus; ohne das Flag konserviert der `~/.gradle/caches`-Step nur heruntergeladene Dependencies, nicht kompilierte Ausgaben — und der teure Teil liegt in `android/build`, das `prebuild --clean` jeden Lauf löscht. Das lokale Cache-Verzeichnis (`~/.gradle/caches/build-cache-1`) fällt unter den bestehenden Cache-Step, das Flag kostet also eine Zeile und keine zusätzliche Konfiguration. Anders als bei ccache ist die Wirkung hier **unbewiesen, nicht widerlegt**; ein wirkungsloses Flag richtet keinen Schaden an, während eine 50-zeilige wirkungslose Apparatur es tut. Gedämpfte Erwartung: `externalNativeBuild`-Tasks (CMake/NDK) sind grundsätzlich nicht cachebar und dürften bei RN 0.86 mit New Architecture den Großteil ausmachen.

### Consequences

- **`mise.toml` ist ab jetzt CI-relevant.** Wer dort einen Pin ändert, ändert das Verhalten von `native-build.yml` mit. Das ist der Zweck, verdient aber den Hinweis im Datei-Kopf, der dort jetzt steht. Renovates Ausnahme für `java` ([ADR-013](#adr-013--renovate-als-gehostete-app-expo-kompatibilität-bleibt-bei-expo-install---fix-2026-08-13)) wird damit noch wichtiger, nicht weniger.
- **Die neuen Checks müssen einmalig von Hand in die Branch-Protection.** Ein Workflow wird nicht dadurch zum Required Check, dass er existiert. Bis das eingetragen ist, ist das Gate ein Vorschlag.
- **Zwei Faktenkorrekturen in den Ist-Zustands-Dokumenten.** `CLAUDE.md` und `mise.toml` nannten den Gradle-Wrapper `8.14.3` mit „läuft nur auf JDK ≤ 24"; das SDK-57-Template liefert `9.3.1`, das auf JDK 17–25 läuft (JDK 26 braucht Gradle 9.4+). Die **Schlussfolgerung** hielt — der Maschinen-Default 26 scheitert weiterhin, der 17er-Pin bleibt richtig —, nur die Zahlen waren aus der Zeit vor dem SDK-Sprung. Ebenso stand dort Bun `1.3.10`, während `mise.toml`, `ci.yml` und `expo-sdk-sync.yml` längst `1.3.14` pinnen. Und das `CLAUDE.md`-Zitat des Podfiles (`ENV['RCT_USE_PREBUILT_RNCORE'] ||= '1'`) unterschlug den Ternär und damit den zweiten, eincheckbaren Kanal. **ADR-006, ADR-007 und ADR-013 behalten ihre Zahlen** — sie waren zum Entscheidungszeitpunkt korrekt, und ein Decision-Log ist kein Ist-Zustands-Dokument.
- **`jdx/mise-action` ist eine neue Action-Abhängigkeit.** Sie fällt unter Renovates Automerge-Regel für GitHub-Actions (ADR-013) und bleibt damit ohne Handarbeit aktuell.
- **Was weiterhin ungeprüft bleibt:** dass die App _startet_ (kein Simulator-/Emulator-Lauf), dass ein Release-Build durchgeht (Debug ≠ Release: kein Minify, kein ProGuard/R8, kein gebündeltes JS), dass ein signiertes Artefakt entsteht, und dass sie auf echter Hardware läuft. Das Gate beweist „kompiliert", nicht „funktioniert". Die nächste sinnvolle Stufe wäre ein Smoke-Start im Simulator; sie steht in `docs/TODO.md`, nicht hier.
- **Der iOS-Job bestimmt die PR-Dauer.** Wenn das im Alltag stört, ist der erste Hebel nicht, den Job zu entfernen, sondern ihn auf Pfad-Filter umzustellen (die in Decision 1 verworfene Variante) — dann ist bewusst zu entscheiden, welche Änderungsklassen ungeprüft durchlaufen dürfen.
- **Gemessene Laufzeiten (PR #92, drei Läufe):**

  | Job     | `05c6b1d` (kalt) | `c29052f` | `91e03f1` (Cache-„Fixes") |
  | ------- | ---------------- | --------- | ------------------------- |
  | iOS     | 37m42s           | 36m30s    | 30m12s                    |
  | Android | 17m47s           | 19m10s    | 16m35s                    |
  | Metro   | 1m49s            | 1m46s     | 1m15s                     |

  **Diese Zahlen belegen keine Verbesserung.** Im dritten Lauf wurde auch der Metro-Job 29 % schneller — an dem nichts geändert wurde und der weder ccache noch Gradle-Cache berührt. Das ist der Maßstab für Runner-Varianz in diesem Repo, und vor diesem Hintergrund sind iOS' 17 % und Androids 14 % nicht den Änderungen zuzuschreiben. Wer künftig Cache-Arbeit bewertet, braucht **mehrere Läufe pro Variante** oder eine unveränderte Kontrollgröße wie den Metro-Job — ein einzelner Vorher/Nachher-Vergleich trägt hier nicht.

- **Der ccache-Fehlschlag war zweimal als Erfolg getarnt.** Erst meldete der Statistik-Step „Cache size (GB): 0.0 / 1.0" — vollkommen korrekt für `/tmp/ccache` und dabei irreführend, weil er verschwieg, dass anderswo hätte geschrieben werden können. Nach dem Erweitern auf beide Kandidatenverzeichnisse war die Antwort eindeutig: **beide leer, null „Cacheable calls"**. Die Lehre ist allgemeiner als ccache: eine Diagnose, die nur den erwarteten Ort prüft, bestätigt die eigene Annahme statt sie zu testen. Der Build war in allen Fällen grün — ein stiller Fallback auf plain clang bricht nichts, er kostet nur Zeit.

- **Damit ist ~30–37 Minuten der reale Preis dieses Gates**, und Decision 1 ist die Stelle, an der er verhandelt wird. Wenn das im Alltag stört, ist der Hebel der Pfad-Filter — nicht weitere Cache-Versuche. Zwei Anläufe haben dort nichts gebracht, und beide kosteten pro Iteration einen vollen CI-Lauf.

---

## ADR-017 — Vierter Slot-Tab im Essen-Tab, bewusste Abweichung von `patterns/meals.md` V1 (2026-08-25)

### Status

Accepted. **Keine Supersession.** [ADR-014](#adr-014--allergen-filter-eu-14-vokabular-vierwertiges-urteil-regelwerk-als-geteiltes-ts-modul-2026-08-14) bleibt unberührt — es geht hier um Slots, nicht um Allergene.

Die Entscheidung weicht von einem Dokument des Handoff-Bundles ab und wurde deshalb ausdrücklich freigegeben, statt still umgesetzt. `patterns/meals.md` selbst bleibt **unangetastet**: es gehört dem Designer, und CLAUDE.md erlaubt Claude nicht, es zu ändern. Die Divergenz zwischen Pattern (drei Tabs) und Implementierung (vier) ist stattdessen in [docs/TODO.md](./TODO.md) vermerkt und dort vom Designer nachzuziehen — oder zurückzudrehen.

### Context

Das `meal_slot_enum` der Migration führt vier Slots: `breakfast`, `lunch`, `dinner`, `snack`. `groupByDay` legt bewusst alle vier in jeden der sieben Tage. `patterns/meals.md` V1 spezifiziert dagegen genau drei Tabs — „Abendessen · Mittag · Frühstück".

Solange der Essen-Tab auf Sample-Daten lief, war das kein Konflikt, sondern eine offene Frage: der Layer führte `snack` mit, nichts schrieb ihn, niemand vermisste ihn. `docs/TODO.md` hielt sie unter „`snack` hat im Screen keinen Platz" mit dem Zusatz „Beim Screen-Wiring mit dem Designer klären".

Mit dem echten Wochenraster wurde daraus ein Konflikt. `useMealPlans` lädt `snack` mit, `groupByDay` legt ihn in jeden Tag, und kein Tab zeigte ihn: ein `snack`-Eintrag wäre **geladen, aber unsichtbar** — und Unsichtbarkeit ist an der Oberfläche nicht von „nicht geplant" zu unterscheiden. Ein Nutzer, der nichts sieht, schließt nicht auf einen fehlenden Tab, sondern auf eine leere Woche.

Heute ist der Fall unerreichbar, weil der Meals-Layer rein lesend ist — der einzige Zugriff auf `meal_plan_entries` ist ein `select`. Er wird erreichbar, sobald die Mutationen kommen oder der KI-Planer die Woche füllt, und dann still.

### Decisions

1. **Der Essen-Tab rendert vier Slot-Tabs**, `snack` hinten angehängt: Abendessen · Mittag · Frühstück · Snack. Die Reihenfolge der ersten drei bleibt die des Patterns.

2. **`patterns/meals.md` bleibt unverändert.** Ein Handoff-Dokument aus der Implementierung heraus umzuschreiben, würde die Eigentumsgrenze aus CLAUDE.md auflösen — auch dann, wenn die Änderung inhaltlich richtig wäre. Die Nachführung ist eine Aufgabe für den Designer und steht als solche in `docs/TODO.md`.

3. **Copy: „Snack" in beiden Sprachen** (`meals.tabs.snack`). Das deutsche „Zwischenmahlzeit" wäre die reinere Übersetzung, aber klinisch statt warm — und mit 16 Zeichen in einer Leiste, die sich jetzt vier Labels teilt, praktisch nicht zu setzen. Auch dieser Key fehlt noch in der designer-eigenen `docs/COPY.md`.

4. **Nicht gewählt: `snack` an der Persistenzgrenze herausfiltern.** Der zweite Vorschlag aus dem Review scheiterte nicht an der Freigabe, sondern an der Sachlage — es gibt keine Schreibgrenze, an der zu filtern wäre. `MealPlanDay.slots` ist über `meal_slot_enum` typisiert, und die noch fehlenden Mutationen brauchen den Slot. Das Problem war nie, dass `snack` in den Daten liegt, sondern dass die UI ihn verschwieg.

### Consequences

- **Die Slot-Leiste wird eng.** Vier Labels teilen sich die Zeile, die vorher drei trug; „Abendessen" ist mit 11-px-Caption das längste. Gegenmaßnahmen: `px-1` statt `px-2`, `numberOfLines={1}` gegen den Umbruch in eine zweite Zeile (der die Höhen der Nachbarn mitzöge) und `adjustsFontSizeToFit`. **Am Gerät ungeprüft** — auf iOS skaliert `adjustsFontSizeToFit` zuverlässig, unter Android ist die Unterstützung dünner. Wenn die Leiste kippt, ist die nächste Stufe eine horizontal scrollbare Chip-Reihe, und das ist wieder eine Designer-Entscheidung.

- **`snack` ist erreichbar, aber nie voreingestellt.** Der Startwert kommt aus `slotForTime`, dessen Rückgabetyp `snack` ausschließt — die Behaviour-Rule des Patterns („vor 11 Frühstück, 11–15 Mittag, sonst Abendessen") kennt ihn nicht. Das ist richtig so: eine Tageszeit, zu der „Snack" die naheliegende Antwort ist, gibt es nicht. Der Tab wird also nur durch Tippen aktiv.

- **Die 44×44-Regel bleibt gewahrt.** `minHeight: 44` liegt auf dem `Pressable`, nicht auf dem Text; die schmalere Innenabstände ändern die Höhe nicht.

- **Der Rückweg ist billig.** Fällt die Designer-Entscheidung gegen den vierten Tab, ist es ein Eintrag in `SLOT_TABS` und ein Copy-Key — plus die Frage, was dann mit geschriebenen `snack`-Zeilen geschieht. Diese Frage ist mit dieser ADR nicht beantwortet, sondern nur vertagt: sie wird fällig, wenn die Mutationen kommen.

## ADR-018 — Der Meal-Hero zeigt den Wochenplan, nicht einen KI-Vorschlag: warnen statt verstecken, Alternative deterministisch (2026-08-25)

### Status

Accepted. **Keine Supersession.** [ADR-014](#adr-014--allergen-filter-eu-14-vokabular-vierwertiges-urteil-regelwerk-als-geteiltes-ts-modul-2026-08-14) bleibt die Quelle des Urteilsmodells; diese ADR fügt ihm den ersten Verbraucher hinzu, der auf ein Urteil hin **handelt**, statt es nur anzuzeigen.

### Context

Der „Was essen wir heute?"-Hero des Dashboards lief als letzte Fläche des Screens auf Sample-Daten (`mealPick` — „Spaghetti mit Tomatensauce", Emoji `🍝`, Begründung „Ben liebt Nudeln · keine Allergien · 20 Min."). `useTodaysMeal` lag seit der Meals-Iteration fertig daneben und hatte keinen Aufrufer.

Drei Dinge standen der bloßen Verdrahtung im Weg:

- **Das Badge behauptete eine Auswahl.** „Passt perfekt zu deiner Familie" (`dash.meal.badge`) ist die Ansage eines KI-Vorschlags. Was `useTodaysMeal` liefert, ist dagegen die Zeile, die eine Familie selbst in ihren Wochenplan geschrieben hat. Dieselbe Beobachtung hatte die Rezept-Detailansicht bereits zum Entfernen desselben Keys geführt (`docs/TODO.md`).
- **Die Header-Aktion „Neu" (`dash.meal.refresh`) hatte nie einen Handler.** Sie meint „anderer Vorschlag" und setzt damit einen Vorschlagsmechanismus voraus, den es nicht gibt.
- **`patterns/meals.md` verlangt „Never propose a meal containing an active allergy".** Ein Wochenplan-Eintrag ist aber kein Vorschlag: er steht schon da, und er kann ein Familien-Allergen enthalten, weil ihn niemand gegen die Allergien geprüft hat.

Dazu kommt eine harte Grenze: der Meals-Layer ist rein lesend (`docs/TODO.md`). Es gibt keine Mutation, die eine geplante Mahlzeit austauschen könnte.

### Decisions

1. **Der Hero zeigt den Slot der aktuellen Uhrzeit — inklusive Frühstück.** `useTodaysMeal` wird unverändert übernommen, samt seiner Timer- und `AppState`-Nachführung an den Slot-Grenzen (11:00 · 15:00 · Mitternacht). Die naheliegende Verengung auf „nur Mittag/Abend" hätte eine zweite Slot-Regel neben `slotForTime` aufgemacht und die Frühstückszeile des Wochenplans auf dem Dashboard unsichtbar gemacht — genau der Fehler, den [ADR-017](#adr-017--vierter-slot-tab-im-essen-tab-bewusste-abweichung-von-patternsmealsmd-v1-2026-08-25) für `snack` vermieden hat.

2. **Das KI-Badge weicht dem Slot-Label, „Neu" der Aktion „Alle ansehen".** Die Karte trägt jetzt `meals.tabs.{breakfast,lunch,dinner}` mit Besteck- statt Sparkles-Icon, der Section-Header `action.seeAll` mit Ziel `/essen`. `dash.meal.badge`, `dash.meal.reasonExample` und `dash.meal.refresh` entfallen ersatzlos aus beiden Katalogen: Sie beschreiben eine Fläche, die es so nicht mehr gibt, und ein Key ohne Aufrufer ist Copy, die niemand pflegt. Kommt der KI-Picker (V2/V3 des Patterns), kommen sie mit ihm zurück — dann an einen echten Vorschlag gebunden.

3. **Warnen, nicht verstecken.** Trifft die geplante Mahlzeit ein Familien-Allergen, zeigt die Karte sie trotzdem — mit `AllergenBadge` und der Ansage aus `recipeA11yLabel`, identisch zu Wochenraster und Rezept-Browser. Eine geplante Mahlzeit zu unterschlagen, wäre an der Oberfläche nicht von „nichts geplant" zu unterscheiden, und der Nutzer verlöre genau die Information, wegen der er handeln müsste.

4. **Die Alternative wird nur bei `unsafe` und `caution` angeboten und nur aus `safe`-Kandidaten gezogen.** `pickAlternative` filtert über `isRecipeSafeForFamily` — der schmale Boolean, den ADR-014 ausdrücklich für „die KI-Vorschlagslogik" vorgesehen hat und der bis hierher aufruferlos war. `unverified` fällt damit als Kandidat heraus: Wer wegen eines Allergen-Treffers ausweicht, darf nicht auf einem ungeprüften Rezept landen — die Heuristik kann Anwesenheit belegen, nie Abwesenheit. Aus demselben Grund löst ein `unverified`-Urteil auch keinen Vorschlag aus: daraus einen Wechsel abzuleiten hieße, ein Urteil zu behaupten, das nicht gefällt wurde.

5. **Die Auswahl ist geseedet, nicht zufällig.** `pickAlternative` hasht `<Kalendertag>-<Slot>` (FNV-1a) und indiziert damit die nach `id` sortierte Kandidatenliste. `Math.random` zeigte bei jedem Re-Render des Dashboards ein anderes Gericht; die Sortierung vor dem Zugriff hält den Vorschlag außerdem stabil, wenn `fetchRecipes` seine Zeilen in anderer Reihenfolge liefert. Der Vorschlag steht damit für die Dauer der Mahlzeit fest und wechselt an derselben Grenze, an der auch der Slot wechselt.

6. **Der Vorschlag verlinkt, er ersetzt nicht.** „Anderer Vorschlag" öffnet `/recipe/[id]` der Alternative. Ohne `meal_plan_entries`-Mutation wäre ein Button, der den Plan zu ändern verspricht, tote UI — dieselbe Begründung, mit der die Rezept-Detailansicht ihren „Zum Essensplan hinzufügen"-Button bis heute nicht hat.

7. **Lade- und Fehlerfall rendern nichts.** Die Leer-Karte („Noch nichts geplant") ist eine Aussage über den Wochenplan und darf nicht fallen, bevor die Antwort da ist — dieselbe Zurückhaltung, die die Terminliste darüber schon übt.

### Consequences

- **Der Rezept-Pool wird nur bei einem Treffer geladen.** `useMealAlternative` trägt ein `enabled`-Tor; ohne Allergen-Treffer stellt das Dashboard keine zusätzliche Abfrage. Der Query-Key ist derselbe, den der Rezept-Browser bei leerer Suche benutzt (`mealKeys.recipes(normalizeRecipeFilter({}))`) — wer vorher im Essen-Tab war, bekommt den Vorschlag ohne Netzaufruf. Der Preis: der Pool ist auf `DEFAULT_RECIPE_LIMIT` (50) begrenzt, die Alternative wird also aus den 50 jüngsten Rezepten gezogen, nicht aus allen.

- **Drei Bausteine sind nach `app-sections/shared/` gewandert:** `AllergenBadge`, `recipeA11yLabel` und der Platzhalter-Emoji (`MEAL_PLACEHOLDER_EMOJI`, vorher zweimal als `FALLBACK_EMOJI` dupliziert). Der Auslöser ist die Richtung der Abhängigkeit: ohne den Umzug importierte der Dashboard-Ordner aus dem Essen-Tab.

- **`features/sample-data` verliert `mealPick` und `MealPick`.** Das Dashboard liest damit alles außer `familyName` und `tomorrowPrep` aus echten Zeilen.

- **`docs/COPY.md` wurde nachgezogen**, obwohl es dem Designer gehört: Drei Keys sind entfallen, drei neue (`dash.meal.empty.*`) dazugekommen, und die englische Fassung von `dash.meal.question` wurde von „What's for dinner today?“ auf „What are we eating today?“ neutralisiert — der Header steht jetzt über Frühstück, Mittag und Abendessen, die deutsche Fassung war bereits neutral (CodeRabbit-Finding). Begründung: Ein Copy-Deck, das Keys führt, die es nicht mehr gibt, ist schlechter als eines, das nachgeführt wurde. Die deutschen Fassungen sind von uns formuliert und gehören gegengelesen.

- **Der Vorschlag bleibt ein Notausgang, kein Planer.** Er kennt weder Vorlieben noch Abneigungen, weder Zubereitungsdauer noch Vorrat — nur „sicher für diese Familie". Der Meal-Picker aus V2/V3 des Patterns bleibt offen und muss, wenn er kommt, `isRecipeSafeForFamily` mitbenutzen statt die Regel ein drittes Mal zu formulieren.

---

## ADR-019 — „Morgen vorbereiten" zeigt Aufgaben und Termine von morgen, nicht abgeleitete Handlungen (2026-08-25)

### Status

Accepted. Keine Supersession. Ergänzt [ADR-018](#adr-018--der-meal-hero-zeigt-den-wochenplan-nicht-einen-ki-vorschlag-warnen-statt-verstecken-alternative-deterministisch-2026-08-25) um die letzte Sample-Data-Fläche des Dashboards.

### Context

Die „Morgen vorbereiten"-Karte war die letzte Fläche des Dashboards auf Mock-Daten (`tomorrowPrep` — „Schwimmsachen für Mia einpacken", „Geschenk für Lisas Geburtstag (Sa.)", „Leo: Englisch-Vokabeln üben"). Beide Datenquellen lagen bereits verdrahtet daneben: `useFamilyTasks` lädt ohnehin alle offenen Aufgaben, `useFamilyEvents(today)` deckt den Monat ±7 Tage ab und enthält morgen damit immer.

Der Verdrahtung standen drei Dinge im Weg:

- **`patterns/dashboard.md` beschreibt etwas anderes, als sich bauen lässt.** Dort steht „actionable items the AI extracted from tomorrow's events (pack swim kit, prep lunchbox, etc.)" — eine Ableitung, die vom Termin „Schwimmen" auf die Handlung „Schwimmsachen einpacken" schließt. Genau das ist der Mock. Der LLM-Provider dafür ist nicht gewählt (`CLAUDE.md`, „Deferred to later iterations").
- **Die Karte hat eine Quelle mehr als die Terminliste darüber.** Aufgaben und Termine in einer Liste heißt: eine gemeinsame Reihenfolge, obwohl nur eine der beiden Quellen überhaupt eine Uhrzeit garantiert (`tasks.due_time` ist nullable, `events.start_at` nicht).
- **Der Deckel bei drei Zeilen macht die Reihenfolge zur Sichtbarkeitsfrage.** Weder `fetchFamilyTasks` noch `expandEvents` garantiert eine stabile Reihenfolge unter Gleichständen — ohne feste Regel entschiede der Zufall, welche Zeile in den Overflow rutscht, und die Karte tauschte zwischen zwei Renders ihren Inhalt.

### Decisions

1. **Die Karte zeigt Rohdaten, nicht Abgeleitetes.** Aufgaben mit `due_date` von morgen (offen, `is_done = false`) und die Termin-Segmente, die auf den morgigen Tag malen — Titel unverändert übernommen. Das ist die ehrliche Vorstufe dessen, was das Pattern beschreibt: eine erfundene Handlungsanweisung („Schwimmsachen einpacken") wäre von einer echten nicht zu unterscheiden und würde als KI-Leistung gelesen, die niemand erbracht hat. Dieselbe Zurückhaltung wie bei `dash.meal.badge` in [ADR-018](#adr-018--der-meal-hero-zeigt-den-wochenplan-nicht-einen-ki-vorschlag-warnen-statt-verstecken-alternative-deterministisch-2026-08-25). Kommt der Provider, ersetzt die Ableitung den Titel — die Auswahl der Zeilen bleibt dieselbe.

2. **Die Sortierregel wird von der Terminliste geliehen, nicht neu erfunden.** `buildTomorrowPrep` übernimmt den `rank` aus [features/calendar/day.ts](../features/calendar/day.ts): Zeitloses zuerst, dann chronologisch. „Zeitlos" umfasst dabei drei Fälle — ganztägige Termine, Fortsetzungstage mehrtägiger Termine und Aufgaben ohne `due_time`. Die Alternative, Aufgaben und Termine als getrennte Blöcke zu zeigen, hätte die Karte nach Datenherkunft gegliedert statt nach dem, was der Nutzer fragt („was kommt morgen zuerst?").

3. **Der Gleichstand wird bis zum Ende aufgelöst: Uhrzeit → Termin vor Aufgabe → Titel → Key.** Die letzten beiden Stufen sind keine Kosmetik, sondern die Voraussetzung des Deckels (siehe Context). Der Termin steht vor der Aufgabe, weil er der feste Punkt ist: Ein Termin um 9:00 findet um 9:00 statt, eine Aufgabe „fällig 9:00" kann davor erledigt werden.

4. **Die Uhrzeit steht in der Meta-Zeile, nicht in einer Zeitspalte — die Karte reicht `EventRow` bewusst nicht durch.** `patterns/dashboard.md` gibt der Prep-Sektion eine leichtere Form als der Terminliste, und die 72px-Zeitspalte von `EventRow` stünde bei jeder Aufgabe ohne `due_time` leer. Ein Füllwort dafür („Ganztägig" für eine Aufgabe) hieße, den ganzen Tag zu behaupten, wo nur „ohne feste Zeit" gemeint ist. Die neue `PrepRow` setzt stattdessen „16:30 · Mia · Besorgung" unter den Titel und lässt weg, was fehlt.

5. **Zeilen führen ins Detail, „+X weitere" in den Tab.** Aufgabe → `/task/edit/[id]`, Termin → `/event/[id]?occ=…` — dieselbe Navigation wie in der „Heute"-Liste direkt darüber. Die Overflow-Zeile führt in den Aufgaben-Tab, sobald im verborgenen Rest **eine** Aufgabe steckt, sonst in den Kalender: Eine Aufgabe ist das, was man abhaken kann, ein Termin nur das, was stattfindet. `overflowTarget` ist `null`, solange es keinen Rest gibt — ein Vorgabewert für einen Fall, den niemand anspringt, wäre eine Behauptung ohne Bedeutung.

6. **`buildTomorrowPrep` importiert an den Barrels vorbei.** `@/features/calendar` zieht über `hooks.ts` den ThemeProvider und damit NativeWind herein, `@/features/tasks` über `queries.ts` den Supabase-Client; beides scheitert unter `bun test` beim Modul-Load. Die reine Funktion importiert deshalb aus `@/features/calendar/day` und `@/features/tasks/palette` direkt — dieselbe Trennung, die [day.test.ts](../features/calendar/day.test.ts) schon voraussetzt.

### Consequences

- **Kein zusätzlicher Roundtrip.** `useFamilyTasks` teilt sich seinen Query-Key (`taskKeys.family(doneSince)`) mit dem Aufgaben-Tab und `useFamilyEvents(today)` sein Monatsfenster mit dem Kalender-Tab. Das Dashboard stellt für die Karte keine eigene Abfrage.

- **Die Karte schweigt im Lade- und Fehlerfall.** Sie hängt an zwei Queries und rendert gar nichts, solange eine von beiden lädt oder scheitert, statt „Für morgen ist nichts vorzubereiten" zu behaupten, bevor die Antwort da ist — [ADR-018](#adr-018--der-meal-hero-zeigt-den-wochenplan-nicht-einen-ki-vorschlag-warnen-statt-verstecken-alternative-deterministisch-2026-08-25), Decision 7 für die Meal-Karte, hier ein drittes Mal. Damit teilt sie auch deren offene Designer-Frage: Der Nutzer erfährt nicht, dass etwas schiefging (`docs/TODO.md`).

- **`taskIconFor` schließt eine Lücke zwischen Seed und Icon-Map.** `task_types.icon` seedet `shopping-bag` für `besorgung`, ein Name, den [app-sections/shared/Icon.tsx](../app-sections/shared/Icon.tsx) nicht führt — `Icon` hätte dafür stillschweigend `null` gerendert. Die Funktion spiegelt `eventIconFor` (kanonischer Slug zuerst, dann der Name aus der Zeile, dann ein neutraler Fallback) und steht damit auch jedem künftigen Aufrufer zur Verfügung, der ein Aufgaben-Icon braucht. Anders als dort liegen die Tabellen als `Map` vor: `task_types.slug` ist bei familieneigenen Typen frei wählbar, und ein Objekt-Literal gäbe für `"toString"` seinen geerbten Member heraus — dieselbe Falle, gegen die sich `taskTypeColorFor` in derselben Datei schon mit einer `typeof`-Prüfung sichert (CodeRabbit-Finding).

- **`features/sample-data/dashboard.ts` entfällt ersatzlos**, mitsamt dem Typ `PrepItem`. Das Dashboard liest damit alles außer `familyName` aus echten Zeilen; die Sample-Data-Kachel-Töne (`mint`/`orange`/`warn`) weichen der Typ-Farbe aus der Datenbank, getönt wie in `EventRow`.

- **Fünf neue Copy-Keys sind von uns formuliert**, nicht vom Designer: `dash.tomorrow.{empty,more}` und `dash.a11y.{prepTask,prepEvent,prepMore}`. `patterns/dashboard.md` spezifiziert für die Prep-Sektion weder einen Leer- noch einen Overflow-Zustand. Alle fünf sind in `docs/COPY.md` nachgetragen, obwohl das Deck dem Designer gehört — dieselbe Abwägung wie bei `dash.meal.empty.*` in [ADR-018](#adr-018--der-meal-hero-zeigt-den-wochenplan-nicht-einen-ki-vorschlag-warnen-statt-verstecken-alternative-deterministisch-2026-08-25): ein Deck, das die Keys der App nicht führt, ist schlechter als eines, das nachgeführt wurde. Der erste Anlauf hatte nur die drei a11y-Labels eingetragen und die zwei sichtbaren Strings dem Designer überlassen; die Trennung hielt der eigenen Praxis des Repos nicht stand (CodeRabbit-Finding am PR). Als gegenzulesen in `docs/TODO.md` vermerkt.

## ADR-020 — Sample-Daten lesen ihre Copy aus `sample.*` und bekommen `Translate` injiziert, statt das globale `t` zu greifen (2026-08-25)

### Status

Accepted. Keine Supersession. Schließt die letzte Locale-Kopplung, die [ADR-019](#adr-019--morgen-vorbereiten-zeigt-aufgaben-und-termine-von-morgen-nicht-abgeleitete-handlungen-2026-08-25) mit „das Dashboard liest alles außer `familyName` aus echten Zeilen" offengelassen hat.

### Context

Zwei Fixture-Flächen trugen deutsche String-Literale: `SAMPLE_SEEDS` in [features/calendar/sample.ts](../features/calendar/sample.ts) (13 Termine mit Titel und Ort) und [features/sample-data/family.ts](../features/sample-data/family.ts) (Schule, Klasse, Lieblings- und Nicht-Lieblingsessen, Familienname). Genau **ein** String daraus rendert heute: `familyName` im Dashboard-Untertitel — ein EN-Nutzer las dort „Familie Becker · Monday, 3 August". Der Rest ist Fixture für Smoke-Tests.

Ein Detail hat den Zuschnitt bestimmt und war vorher nirgends notiert: **i18nexts modul-globales `t` gibt vor `i18n.init()` `undefined` zurück** — nicht den Key, nicht den `defaultValue`. Wer es in einem `bun test` ohne i18n-Setup aufruft, bekommt ein `undefined` in einem als `string` typisierten Feld, ohne Fehler.

### Decisions

1. **Eigener Top-Level-Namespace `sample.*` statt Einsortieren in `cal.*` / `child.*`.** 38 Keys (`family`, `school`, `grade`, `food`, `event`, `location`). Fixture-Copy neben Produkt-Copy im selben Namespace hätte beim Lesen der Kataloge nicht mehr unterscheidbar gemacht, was ausgeliefert wird und was nur QA-Material ist.

2. **`Translate` wird als Parameter übergeben, nicht als Modul-Global importiert** ([features/shared/translate.ts](../features/shared/translate.ts)). Verworfen wurde die naheliegende Variante, `typeLabelsForSlug` in [features/calendar/palette.ts](../features/calendar/palette.ts) zu kopieren und `import { t } from "i18next"` zu nehmen: das hätte den `undefined`-Fall aus dem Context in jede neue Fixture getragen. Als Nebeneffekt folgen die Fixtures jetzt einem Sprachwechsel, statt beim Import einzufrieren. Der Parameter ist **pflicht**, nicht optional mit Global-Fallback — ein Default hätte die Falle nur versteckt. Deshalb steht er vorn: `getSampleOccurrences(translate, now?)`.

3. **`typeLabelsForSlug` bleibt beim globalen `t`.** Es muss `labelDe` **und** `labelEn` gleichzeitig füllen, was ein einsprachiges `t` nicht kann. Die Inkonsistenz ist bewusst und in `docs/TODO.md` vermerkt; die Lösung wäre ein `getFixedT`-Paar, nicht Dependency-Injection.

4. **`sampleParents` bleibt eine Konstante.** Auf einem `Parent` ist nichts Copy — Name, Kurzform, E-Mail und Farbe lesen sich in jeder Sprache gleich. Ein `Translate`-Parameter, den die Funktion nie benutzt, wäre Ritual.

5. **Die 38 Keys kommen nicht in [docs/COPY.md](./COPY.md) — anders als bei [ADR-018](#adr-018--der-meal-hero-zeigt-den-wochenplan-nicht-einen-ki-vorschlag-warnen-statt-verstecken-alternative-deterministisch-2026-08-25) und [ADR-019](#adr-019--morgen-vorbereiten-zeigt-aufgaben-und-termine-von-morgen-nicht-abgeleitete-handlungen-2026-08-25).** Das Deck führt Sample-Daten in zwei ausdrücklich **einsprachigen** Abschnitten („Sample family (German plausibility)", „Sample event titles (German)") und beschreibt sie als QA-Fixtures — es gibt dort also kein DE/EN-Paar zum Nachführen, und die Copy-Tabellen darüber sind nach Screens gegliedert, zu denen eine Fixture nicht gehört. Die DE-Werte sind aus dem Deck übernommen; die EN-Werte sind von uns und in `docs/TODO.md` als gegenzulesen vermerkt. Das ist eine Abweichung von der Nachführ-Praxis der beiden Vorgänger-ADRs und deshalb hier begründet statt still gelassen.

6. **`features/sample-data/calendar.ts` ersatzlos gelöscht**, mitsamt dem Typ `CalendarDayCell`. `monthGridMay2026`, `monthLabelDe`/`En`, `yearLabel` und `selectedDayDe`/`En` hatten seit der Kalender-Verdrahtung keinen Aufrufer mehr. Tote deutsche Literale zu übersetzen wäre Arbeit an Code gewesen, der nie rendert — zumal `monthLabelDe`/`monthLabelEn` die Zweisprachigkeit ohnehin schon von Hand nachgebaut hatten.

### Consequences

- **`features/shared/` führt jetzt auch einen Typ**, nicht nur Hooks; die Beschreibung in `CLAUDE.md` ist entsprechend nachgezogen.
- **Zwei neue Testdateien**, [features/calendar/sample.test.ts](../features/calendar/sample.test.ts) und [features/sample-data/family.test.ts](../features/sample-data/family.test.ts). Beide initialisieren über `createInstance()` einen eigenen i18next gegen die **echten** Kataloge — damit prüfen sie nicht nur die Verdrahtung, sondern auch, dass jeder der 38 Keys in **beiden** Katalogen existiert: ein fehlender Key gibt bei i18next den Key selbst zurück, und darauf laufen die Assertions. Kein globaler i18n-Zustand, also keine Reihenfolge-Abhängigkeit zwischen Testdateien.
- **Zwei Invarianten sind jetzt festgeschrieben**, die vorher nur zufällig galten: `eventId` und der Zeitplan hängen nicht an der Sprache. Ohne sie hätte ein späterer Umbau die Ids aus dem Titel bauen können, was eine in DE geöffnete Detail-Route in EN ins Leere hätte laufen lassen.
- **Eine Abweichung vom Deck wurde nebenbei repariert:** der Code führte Leos Schule als „Gymnasium Goethe", `docs/COPY.md` als „Goethe-Gymnasium". Das Deck gewinnt.
- **`getSampleOccurrences()` ohne Argumente kompiliert nicht mehr.** Aufrufer gab es keine; künftige müssen ein `t` reichen.
- **Ein Katalog-Gate ist dabei abgefallen** ([features/i18n/catalogs.test.ts](../features/i18n/catalogs.test.ts)), und zwar aus einem Fehlschlag heraus: der erste Anlauf prüfte „kein Key bleibt unaufgelöst" durch ein `t` — was einen **fehlenden EN-Key nicht sieht**, weil `fallbackLng: "de"` ihn still auf Deutsch rendert. Ein absichtlich gelöschter EN-Key ist genau so durch die Tests gerutscht. Die vier Assertions vergleichen deshalb die JSON-Dateien **strukturell** statt über i18next: gleiche Key-Menge in beiden Sprachen, kein leerer Wert, dieselben `{{platzhalter}}` je Key, und `sample.*` in beiden vorhanden. Sie gelten für alle 456 Keys, nicht nur die 38 neuen — beim Schreiben war der Katalog bereits paritätisch, das Gate hält den Zustand jetzt fest. Jede Assertion ist gegen einen eingebauten Defekt geprüft worden, nicht nur gegen den grünen Ist-Zustand — was sich gelohnt hat: die Leer-Prüfung verglich zuerst `{ ...deFlat, ...enFlat }`, wo Englisch jeden gemeinsamen Key überschreibt und damit einen leeren **deutschen** Wert hinter einem gefüllten englischen versteckt. Sie läuft jetzt pro Sprache getrennt (CodeRabbit-Finding). Aus demselben Lauf stammt, dass [features/calendar/sample.test.ts](../features/calendar/sample.test.ts) die Titel-Listen vollständig festnagelt statt drei Stück zu stichproben — ein Seed, der auf einen falschen, aber existierenden `titleKey` zeigt, löst sauber auf und wäre sonst durchgerutscht.

---

## ADR-021 — Offene Einladungen zeigen ihre Restlaufzeit, nicht eine Empfänger-E-Mail (2026-08-27)

### Status

Accepted. Keine Supersession. Baut auf der Invite-Iteration auf, die `family_invitations` und die „eine offene Einladung pro Familie"-Invariante ([20260611140000_invitations_one_pending_per_family.sql](../supabase/migrations/20260611140000_invitations_one_pending_per_family.sql)) eingeführt hat.

### Context

Die Aufgabenstellung für die Familien-Übersicht lautete wörtlich „Liste der offenen Einladungen mit **E-Mail** + Status". Beim Umsetzen kollidierte das mit zwei Fakten, die vorher nirgends zusammen notiert waren:

1. **`family_invitations` hat keine `email`-Spalte.** Die Tabelle führt `token`, `family_id`, `created_by`, `expires_at`, `used_at`, `created_at` — mehr nicht ([20260529091002_onboarding_rpcs.sql](../supabase/migrations/20260529091002_onboarding_rpcs.sql)).
2. **Die App verschickt keine Mail.** `useInvitePartner` erzeugt einen Token, baut `elternflow://invite/{token}` und übergibt an das native Share-Sheet. Welcher Kanal und welcher Empfänger daraus werden, entscheidet der User im Share-Sheet — die App erfährt es nie.

Eine `email`-Spalte wäre also eine reine Notiz gewesen: ein Feld, in das der User eine Adresse tippt, an die _er selbst_ danach in einer anderen App die Nachricht schickt. In der Liste hätte sie ausgesehen wie eine Zustellbestätigung für etwas, das nie zugestellt wurde.

Zugleich war das bestehende statische `Eingeladen`-Pill als „Status" wertlos — es hatte genau einen möglichen Wert, weil die Query ohnehin nur annehmbare Einladungen liefert.

### Decisions

1. **Keine `email`-Spalte, keine Migration.** Die Karte identifiziert die Einladung über das, was die App tatsächlich weiß: dass eine offene existiert und wie lange sie noch gilt.

2. **Status wird aus `expires_at` abgeleitet, nicht gespeichert.** Neu ist [features/auth/inviteStatus.ts](../features/auth/inviteStatus.ts) mit `inviteExpiry(expiresAt, nowIso) → { daysLeft, isUrgent }` — rein, damit die „läuft in n Tagen ab"-Copy ohne Uhr und ohne DB testbar ist, gleiche Bauart wie `pickReusableInvite` in [inviteSelection.ts](../features/auth/inviteSelection.ts). **Tage runden auf:** 4 Tage und 23 Stunden lesen sich als „5 Tage", nie als „4" — das Label soll die verbleibende Zeit nie kleiner darstellen, als sie ist. Ein unparsebarer oder vergangener Zeitstempel fällt auf `0` zurück statt `NaN` in die UI zu lassen.

3. **Die Query-Prädikate bleiben unverändert** (`used_at is null and expires_at > now()`), es kommt nur ein `order by created_at desc` dazu. Verworfen wurde, abgelaufene Einladungen mitzuladen, um dem Status mehr Werte zu geben: `useCreateInvitation` räumt abgelaufene Zeilen beim nächsten Anlegen ohnehin weg, eine „Abgelaufen"-Karte mit „Neu generieren"-Button hätte also nur dupliziert, was der „Partner einladen"-Button schon tut.

4. **„Neu generieren" ist ein `force`-Flag auf `useCreateInvitation`, keine zweite Mutation.** Ohne `force` bleibt die Reuse-Abkürzung; mit `force` fällt die bestehende Zeile in denselben Delete, den der Code für abgelaufene Zeilen schon hatte — dieses Zurückziehen **ist** die Regeneration. Ein eigener Hook hätte die Race-Behandlung (`23505`) und die Index-Vorarbeit dupliziert. Regenerieren öffnet immer das Share-Sheet: ein rotierter Link, den niemand gesehen hat, wäre nutzlos.

5. **Widerrufen löscht die Zeile, statt `used_at` zu stempeln.** Ein widerrufener Token ist kein eingelöster. Löschen gibt den partiellen Unique-Index sofort frei, sodass die Familie unmittelbar neu einladen kann; ein `used_at`-Stempel hätte den Slot dauerhaft belegt und `accept_invitation` eine Einlösung vorgespielt, die nie stattfand.

6. **Der untere Button heißt „Einladung erneut teilen", solange eine offene Einladung existiert.** Er tat das schon vorher — `useCreateInvitation` gibt die bestehende Einladung zurück, statt eine neue anzulegen —, nannte es aber „Partner einladen". Nur das Label folgt jetzt dem Verhalten; es kommt keine vierte Aktion dazu.

7. **Die neuen `familie.*`-Keys stehen nicht in [docs/COPY.md](./COPY.md).** Dasselbe Muster wie bei `familie.invitePending` und `familie.invitedPill`, die dort ebenfalls fehlen, während der Rest des `familie`-Blocks gelistet ist. Das Deck gehört dem Designer und ist für uns off-limits; die Keys sind zum Nachtragen in `docs/TODO.md` vermerkt.

### Consequences

- **Die „Liste" ist per DB-Invariante höchstens ein Eintrag.** Der partielle Unique-Index lässt genau eine unbenutzte Einladung pro Familie zu. Der Code rendert trotzdem über `.map()`, damit ein späteres Aufheben der Invariante (mehrere Eingeladene, etwa Großeltern) nur die Migration kostet und nicht den Screen.
- **Die Einladungskarte ist eine eigene Datei** ([app-sections/(tabs)/familie/PendingInviteCard.tsx](<../app-sections/(tabs)/familie/PendingInviteCard.tsx>)). `FamilieScreen` rendert damit weiter Sektionen und hält die Handler, statt Karten-Innenleben zu tragen.
- **Beide Aktionen brauchen keinen manuellen Refresh.** `useCreateInvitation` und `useRevokeInvitation` invalidieren beide `["family", familyId, "invitations"]`; die Liste zieht sich selbst nach.
- **Das Delete lehnt sich an eine RLS-Policy, die es schon gab** (`invitations: delete own family`) — plus `.eq("family_id", …)` als Gürtel-und-Hosenträger, wie bei `useDeleteChild`.
- **Der Tag-Zähler kann um Stunden veralten**, wenn der Tab lange offen bleibt: er rechnet beim Rendern gegen `new Date()` und hat keinen eigenen Timer. Bei sieben Tagen Laufzeit ist das folgenlos; ein `useToday`-Trigger wäre Maschinerie für ein Label, das niemand minutengenau liest.
- **Wer später doch adressierte Einladungen will**, braucht drei Dinge zusammen: eine `email`-Spalte, ein Feld im Invite-Flow und einen echten Versandweg (Edge Function oder `mailto:`) — sonst kehrt genau das Zustellbestätigungs-Missverständnis aus dem Context zurück. Als Follow-up in `docs/TODO.md` notiert.

---

## ADR-022 — Mehrere offene Einladungen gleichzeitig: der „eine pro Familie"-Index fällt (2026-08-27)

### Status

Accepted. Supersedes parts of [ADR-021](#adr-021--offene-einladungen-zeigen-ihre-restlaufzeit-nicht-eine-empfänger-e-mail-2026-08-27) — konkret Decision 4 (`force`-Flag auf `useCreateInvitation`), Decision 6 (Label „Einladung erneut teilen" am unteren Button) und die Consequence „Die ‚Liste' ist per DB-Invariante höchstens ein Eintrag". Decisions 1, 2, 5 und 7 aus ADR-021 gelten unverändert weiter — insbesondere bleibt es bei **keiner** `email`-Spalte. **Decision 3 gilt nur noch im Ergebnis**, nicht in der Begründung: abgelaufene Einladungen werden weiterhin nicht mitgeladen, aber das Argument dafür — „`useCreateInvitation` räumt abgelaufene Zeilen beim nächsten Anlegen ohnehin weg" — ist mit Decision 2 hinfällig; dieses Aufräumen gibt es nicht mehr (siehe Consequences).

### Context

ADR-021 hat die „eine offene Einladung pro Familie"-Invariante aus [20260611140000](../supabase/migrations/20260611140000_invitations_one_pending_per_family.sql) als gegeben hingenommen und nur ihre Konsequenz notiert. Beim Benutzen fiel auf, dass sie ein Produktproblem ist, kein Detail:

- **`parents` hat nie ein Limit gehabt.** Kein Count-Constraint, `family_id` ist ein gewöhnlicher FK; einzig `auth_user_id` ist unique (ein Parent-Row pro Account). Eine Familie darf beliebig viele Erwachsene führen.
- **Ein Token gilt für genau eine Person.** `accept_invitation` selektiert `used_at is null` und stempelt beim Beitritt ([20260529091002](../supabase/migrations/20260529091002_onboarding_rpcs.sql)).
- **Der Index koppelte beides zu einer Warteschlange.** Einladen → annehmen lassen → nächste einladen. Großeltern oder Babysitter waren damit nicht parallel erreichbar, obwohl das Schema sie problemlos trägt.

Sichtbar wurde das erst durch ADR-021 Decision 6: solange der untere Button „Partner einladen" hieß, sah es aus, als ginge eine zweite Einladung — der Tap teilte in Wahrheit denselben Link erneut. Das ehrliche Label „Einladung erneut teilen" hat die Lücke offengelegt, nicht verursacht.

### Decisions

1. **Der partielle Unique-Index fällt** ([20260827080254](../supabase/migrations/20260827080254_invitations_allow_multiple_pending.sql)). Nichts sonst hat die Invariante getragen: `accept_invitation` prüft ein Token auf eigene Merkmale (unbenutzt, nicht abgelaufen, `for update` gesperrt) und hat nie angenommen, dass es nur eines gibt.

2. **`useCreateInvitation` legt immer an.** Die Reuse-Abkürzung entfällt ersatzlos — sie war die Antwort auf „jeder Tap erzeugt einen neuen Link", und diese Antwort gibt jetzt die UI: Erneut-Teilen ist eine eigene Aktion auf der Karte, Anlegen heißt ausdrücklich „eine weitere Person einladen". Damit ist auch die `23505`-Race-Behandlung gegenstandslos.

3. **`pickReusableInvite` und `features/auth/inviteSelection.ts` sind gelöscht**, samt Testdatei. Einziger Aufrufer war die entfallene Abkürzung. Gleiche Linie wie bei `features/sample-data/calendar.ts` in [ADR-020](#adr-020--sample-daten-lesen-ihre-copy-aus-sample-und-bekommen-translate-injiziert-statt-das-globale-t-zu-greifen-2026-08-25): toter Code wird entfernt, nicht aufbewahrt.

4. **„Neu generieren" wird eine eigene Mutation statt eines Flags — und läuft über eine RPC.** Das ADR-021-`force`-Flag konnte die Aufgabe nicht mehr leisten: es hätte „alle unbenutzten löschen" bedeutet und damit fremde, lebende Einladungen mitgerissen. Rotieren ist aber zwei Schreibvorgänge (alten Token zurückziehen, neuen anlegen), und die gehören in **eine** Transaktion: ein Client, der zwischen erfolgreichem Delete und fehlgeschlagenem Insert die Verbindung verliert, ließe die Familie sonst mit einer Einladung weniger zurück, ohne etwas, wogegen sich ein Retry richten könnte. Deshalb `regenerate_invitation(p_token)` als `security definer`-Funktion — dieselbe Bauart wie `accept_invitation`, das aus demselben Grund Insert und Update bündelt. Sie gibt den neuen Token zurück (uuid, wie die beiden bestehenden RPCs), nicht die Zeile: mehr braucht der Aufrufer nicht, denn zum Teilen genügt der Token und die Liste zieht sich über die Invalidierung ohnehin neu. Delete-then-insert statt Update, weil `token` der Primärschlüssel ist. **Die Familien-Zuordnung prüft die Funktion selbst** gegen `current_family_id()`, weil `security definer` an RLS vorbeiführt (CodeRabbit-Finding).

5. **`useInvitePartner` trennt Anlegen und Teilen.** `send()` erzeugt und teilt, `shareToken(token)` teilt einen bestehenden Link ohne Mutation. Vorher konnte der Hook nur „erzeugen und teilen" — für eine Liste, in der jede Zeile ihren eigenen Link hat, reicht das nicht.

6. **Widerrufen wird zum Icon-Button in der Kartenkopfzeile**, die Aktionszeile behält zwei volle Labels. Drei deutsche Labels nebeneinander („Erneut teilen", „Neu generieren", „Widerrufen") überleben 360 px bei größeren Schriftskalierungen nicht. Der Icon-Button ist 44 × 44, trägt ein `accessibilityLabel` und liegt weiterhin hinter `confirmDestructive` — die Bestätigung ist der Schutz, nicht das Label.

### Consequences

- **Die Migration muss auf dem Supabase-Projekt ausgeführt werden, bevor das Feature trägt** — sie enthält beides, den Index-Drop und `regenerate_invitation`. Bis dahin scheitert die zweite Einladung einer Familie am alten Index mit `23505` (die Race-Behandlung, die das früher abgefangen hat, ist mit Decision 2 entfallen), und „Neu generieren" läuft in einen Fehler „function does not exist".
- **Der Index-Drop ist ein gewöhnlicher `drop index`, kein `concurrently`.** `DROP INDEX CONCURRENTLY` darf nicht in einem Transaktionsblock laufen, und der Migrations-Runner umschließt jede Datei mit genau einem. Der `ACCESS EXCLUSIVE`-Lock liegt auf einer Tabelle mit einer Handvoll Zeilen pro Familie — das Fenster ist keins. (CodeRabbit hat `concurrently` vorgeschlagen; hier bewusst abgelehnt statt still übergangen.)
- **Migration und Typen sind gegen das Projekt gefahren.** Der Index ist weg, `regenerate_invitation` steht, und `database.types.ts` trägt den Eintrag aus dem Generator (`Args: { p_token: string }` / `Returns: string`) statt von Hand. Zwei Proben liefen dabei mit, jeweils selbst-zurückgerollt: zwei offene Einladungen für dieselbe Familie werden angenommen (vorher `23505`), und ein Aufruf ohne passende `current_family_id()` wird mit `22023` abgewiesen — die Familien-Grenze aus Decision 4 hält also auch ohne RLS.
- **Die Datei heißt lokal `20260827080254_…`**, weil `apply_migration` den Versionsstempel selbst vergibt; der lokale Name folgt dem entfernten, damit ein späteres `supabase db push` sie nicht für unangewendet hält. (`20260814120000_seed_recipes.sql` trägt dieselbe Abweichung aus einem früheren Lauf, dort unkorrigiert.)
- **Abgelaufene Einladungen werden nicht mehr aufgeräumt.** Der alte Create-Pfad löschte sie, weil der Index den Slot sonst blockiert hätte; ohne Index gibt es keinen Zwang mehr, und „alle unbenutzten löschen" wäre jetzt aktiv falsch. Die Zeilen sind unsichtbar (die Query filtert sie), sammeln sich aber an — als Follow-up für einen pg_cron-Job in `docs/TODO.md` notiert.
- **Onboarding Step 3 legt jetzt bei jedem Tap eine Einladung an** statt die bestehende erneut zu teilen. Folgenlos, weil der Screen bei Erfolg sofort zu Step 4 navigiert und der Button währenddessen über `canSend` gesperrt ist.
- **Der Familie-Tab kann eine echte Liste zeigen.** Der Screen rendert schon vorher über `.map()`, es war also nur die DB, die ihn auf einen Eintrag beschränkt hat.
- **Der Index-Drop allein hätte kein Typen-Regenerat gebraucht** — ein Index ist in `database.types.ts` nicht abgebildet. Die RPC aus Decision 4 dagegen schon: `regenerate_invitation` steht dort unter `Functions` und wird in [onboardingMutations.ts](../features/auth/onboardingMutations.ts) typisiert aufgerufen.

## ADR-023 — Onboarding-Resume ist eine Karte auf dem Dashboard, kein Redirect (2026-08-28)

### Status

Accepted. Löst die Consequence „Resume-nach-Abbruch-CTA auf Dashboard wurde bewusst nicht V1" aus [ADR-005](#adr-005--supabase-auth--onboarding-approach-c-2026-06-01) ein; alles andere aus ADR-005 gilt unverändert, insbesondere Approach C und die AuthGate-Regel, dass nur Step 5 die Onboarding-Gruppe verlässt.

### Context

Nur Step 2 committet (ADR-005, Approach C): `rpc("create_family")` legt Familie und `parents`-Zeile an, Step 3 (Partner einladen) und Step 4 (erstes Kind) sind optionale INSERTs. Wer die App dazwischen schließt, hat damit alles, was [decideRoute](../features/auth/decideRoute.ts) prüft — `hasParent` ist wahr —, und landet beim nächsten Start auf `(tabs)`.

`patterns/onboarding.md` und [patterns/dashboard-empty.md](../patterns/dashboard-empty.md) fangen diesen Fall auf dem Papier mit dem Willkommens-Screen ab. Im Code trägt das nicht: `app/(tabs)/index.tsx` rendert seit den Live-Daten immer `DashboardScreen`, [DashboardEmptyScreen](<../app-sections/(tabs)/dashboard/DashboardEmptyScreen.tsx>) ist von keiner Route gemountet, und seine beiden CTAs hatten nicht einmal einen `onPress`. Der abgebrochene User sah also drei Leer-Karten („Tagsüber alles ruhig", „Noch nichts geplant", „Für morgen ist nichts vorzubereiten") und nirgends einen Hinweis, dass die Einrichtung offen ist.

### Decisions

1. **Eine Karte auf dem Dashboard, kein Redirect zurück in den Flow.** Der naheliegende Griff wäre gewesen, `decideRoute` um „hat Familie, aber kein Kind → `/(onboarding)/4`" zu erweitern. Das hätte den User bei jedem App-Start zurück in einen Flow gezwungen, den er zweimal aktiv verlassen hat — Step 3 und Step 4 haben beide ein „Überspringen" —, und die Skips damit zu Fragen gemacht, die nie aufhören. Die Karte bietet den Rest an, statt ihn einzufordern.

2. **Die Entscheidung liegt in einer reinen Funktion** ([onboardingResume.ts](../features/auth/onboardingResume.ts) — `onboardingResumeStep`), neben `decideRoute` und nach demselben Muster: Eingaben rein, Schritt oder `null` raus, Tests ohne React. Sie liegt in `features/auth/` und nicht im Dashboard-Ordner, weil sie den Onboarding-Zustand der Familie beschreibt und nicht das Layout eines Screens — der Familie-Tab könnte dieselbe Frage stellen.

3. **Step 3 hat Vorrang vor Step 4.** Der frühere offene Schritt gewinnt, weil das die Richtung des Flows ist: wer bei 3 einsteigt, läuft über „Später einladen" ohnehin nach 4 weiter. Der umgekehrte Einstieg (erst das wertvollere Kinderprofil) würde Step 3 dauerhaft überspringen, denn aus Step 4 führt kein Weg zurück.

4. **Eine offene Einladung zählt als erledigter Step 3.** Geprüft wird `parents`-Zweitzeile **oder** offene Einladung, nicht nur der beigetretene Partner. Sonst hätte die Karte einen User, der eingeladen hat und auf die Antwort wartet, unbegrenzt weiter zum Einladen aufgefordert — der offene Schritt liegt dort beim Eingeladenen. Der Zähler kommt aus `useFamilyPendingInvitations`, das schon auf unbenutzt + nicht abgelaufen filtert, teilt sich also Query-Key und Prädikat mit dem Familie-Tab.

5. **Kein Wort, solange eine der vier Quellen nicht geantwortet hat.** `parentId`, `parents`, `childCount` und `pendingInviteCount` sind alle nullable; fehlt eines, ist das Ergebnis `null`. Dieselbe Zurückhaltung wie bei den Leer-Karten des Dashboards (ADR-019): „Du bist noch nicht fertig" ist eine Behauptung über die Familie, und ein Aufblitzen bei jedem Start wäre für eine vollständig eingerichtete Familie schlicht falsch. Weil ein Query-Fehler `data` ebenfalls `undefined` lässt, deckt dieselbe Prüfung beide Fälle ab. Dieselbe Zurückhaltung greift, wenn die eigene Zeile nicht in `parents` steht: die RLS-Policy dort ist `family_id = current_family_id()` und `current_family_id()` liest genau diese Zeile — sie kann nicht legitim fehlen, und wenn sie es tut, beschreiben Parent- und Familien-Antwort verschiedene Familien. (CodeRabbit-Finding.)

6. **Kein Wegklicken.** Die Karte verschwindet, sobald der Schritt erledigt ist — und wer sie nicht will, kann sie ignorieren. Ein Dismiss bräuchte einen persistierten Zustand (Spalte oder lokaler Store) für eine Karte, die es maximal zweimal im Leben eines Accounts gibt.

7. **Die Karte steht über der ersten Sektion, nicht in ihr.** Die Leer-Karten von „Heute", Meal-Hero und „Morgen vorbereiten" beschreiben einen Tag, die Fortsetzen-Karte den Zustand des Accounts. Sie bleiben deshalb alle stehen — `patterns/dashboard.md` verlangt ausdrücklich „Don't hide sections; replace content" —, und die Kollision wird über die Rangordnung aufgelöst: die Fortsetzen-Karte ist die einzige `variant="solid"`-CTA in Sicht, der Meal-Hero trägt `soft`.

8. **`DashboardEmptyScreen` bleibt liegen, seine CTAs zeigen aber auf dieselben Ziele.** Beide Oberflächen beschreiben denselben Zustand; zwei verschiedene Antworten auf „wo geht die Einrichtung weiter?" wären ein Widerspruch, der erst auffiele, wenn der Screen wieder gemountet wird. Gelöscht wird er nicht — er ist die Implementierung eines Handoff-Patterns, und ob das Pattern künftig die Karte beschreibt oder der Screen eine Route bekommt, entscheidet der Designer (als Follow-up in [docs/TODO.md](./TODO.md) notiert).

### Consequences

- **Der Push in die Onboarding-Gruppe ist unkritisch.** `decideRoute` gibt für `hasParent: true` + `currentGroup: "onboarding"` bereits `null` zurück — die Carve-out aus ADR-005 wirkt hier in die andere Richtung und verhindert, dass der AuthGate den User sofort wieder auf `(tabs)` schiebt. Der Zurück-Pfeil der `OnboardingShell` führt über `router.back()` aufs Dashboard, Step 5 schließt mit `router.replace("/(tabs)")` ab.
- **Wer über die Karte bei Step 3 einsteigt und weiterläuft, sieht in Step 4 „Dein erstes Kind", auch wenn schon Kinder existieren.** Das ist der bestehende Flow — Step 5 verlinkt mit „Weiteres Kind anlegen" auf denselben Screen —, keine neue Eigenart. Ein zustandsabhängiger Titel wäre eine Copy-Änderung im Deck des Designers.
- **Eine vierte Query auf dem Dashboard.** `useFamilyPendingInvitations` teilt Key und Cache mit dem Familie-Tab; auf dem Dashboard wird davon nur `length` gelesen.
- **Die Karte spricht von „Einrichtung", nicht von „Onboarding".** Das Wort kommt in keiner Nutzer-Copy der App vor (`onb.*` sagt „Lass uns deine Familie einrichten"), und die Marken-Stimme ist warm und deutsch. Die Button-Labels sind bewusst die bestehenden `dash.empty.addChild` / `dash.empty.invite` — dieselben zwei Aktionen wie im Empty-State, und zwei Übersetzungen für denselben Satz driften auseinander.

## ADR-024 — Toast aus dem Design-Kanvas importiert: Spezifikation und Pattern jetzt, Implementierung später (2026-08-28)

### Status

Accepted. Ergänzt das Handoff-Bundle um eine Komponente, die es dort bisher nicht gab; berührt keinen bestehenden ADR.

### Context

Der Design-Kanvas („familyflow ai", Sektion **10 · Toast-Komponente") führt eine Toast-Komponente, die im Repo fehlte: `screens/toasts.jsx` mit Spezimen und drei In-Kontext-Artboards, die CSS-Regeln in `styles.css`, und ein fertiger `toast`-Block in der dortigen `design-system/components.ts`. Alle übrigen Screens der Sektion sind hier bereits gebaut — der Toast war das einzige offene Stück.

Übernommen wurde deshalb genau dieser eine Baustein, und zwar als **Handoff**, nicht als Code: Spezifikation und Pattern-Doc, wie sie für jeden anderen Screen auch vorliegen. Die React-Komponenten folgen in einer eigenen Iteration.

### Decisions

1. **Der `toast`-Block wandert unverändert in [design-system/components.ts](../design-system/components.ts)** — an dieselbe Stelle wie im Design-Projekt (zwischen `mealHero` und `statusBar`), mit denselben Feldern: `base`, `icon`, `title`, `message`, `action`, `close`, `progressBar`, `variants`, `solid`, `stack`, `timing`, `a11y`. Die Datei gehört zum Handoff-Bundle; sie wird hier auf ausdrückliche Anforderung erweitert, nicht umgeschrieben.

2. **Zwei Radius-Referenzen sind beim Import korrigiert worden.** Der Quell-Block schrieb `radius: radius.lg` mit dem Kommentar `// 18` und `radius: radius.sm` mit `// 10`. Beides trifft nicht zu: die TS-Skala führt `lg = 12`, `sm = 8`, und 18 bzw. 10 heißen dort `"2xl"` und `md`. Ursache ist eine Namenskollision mit der Prototyp-CSS, die `--r-lg: 18px` definiert — die CSS-Variable und der TS-Token teilen den Namen, nicht den Wert. Maßgeblich ist der Pixelwert, den Kommentar **und** `styles.css` (`border-radius:var(--r-lg)` bzw. `10px`) übereinstimmend belegen; übernommen wurden daher `radius["2xl"]` und `radius.md`. Ein Kommentar an der Stelle hält den Grund fest, damit die Korrektur beim nächsten Abgleich nicht als Abweichung zurückgedreht wird.

3. **Die drei Farbrollen sind auf unsere Theme-Namen gezogen.** Der Quell-Block nannte `var(--success-100)` / `var(--danger-100)` / `var(--mint-100)` — die Palettenstufen der Prototyp-CSS. Unsere Themes führen dieselben Flächen als semantische Rollen (`--success-soft`, `--danger-soft`, `--primary-soft`), und die Tailwind-Klassen lesen genau die. Ebenso `--ink-3` → `--ink-tertiary`. Das ist eine Übersetzung, keine Entscheidung gegen das Design: die Werte sind dieselben, nur unter dem Namen, den ein Implementierer hier tatsächlich verwenden kann.

4. **`stack.zIndex` ist ergänzt.** Der Quell-Block beschrieb die Stapel-Geometrie (`insetX`, `top`, `bottom`, `gap`, `max`), ließ die Ebene aber offen; die Prototyp-CSS setzt `z-index:30`, was in unserer Skala nichts bedeutet. `zIndex.toast` (70) existiert in [spacing.ts](../design-system/spacing.ts) seit jeher ungenutzt und sagt genau das Richtige: über Tab-Bar (10) und Mic-FAB (20), unter dem Voice-Overlay (80).

5. **[patterns/toast.md](../patterns/toast.md) ist neu geschrieben, nicht importiert.** Das Design-Projekt hat für den Toast kein Pattern-Doc — die anderen neun Sektionen haben eines. Der Inhalt stammt vollständig aus Spezimen, CSS und Spec-Block; die Form folgt den bestehenden Pattern-Docs (Goal · Anatomy · Variants · States · Accessibility).

6. **Die Touch-Target-Abweichung ist im Pattern benannt, nicht stillschweigend übernommen.** Das Design zeichnet den Schließen-Knopf mit 24×24 und den Aktions-Button mit 28 px Höhe; Non-Negotiable 4 in [CLAUDE.md](../CLAUDE.md) verlangt 44×44. Aufgelöst wird das wie überall sonst in der App — sichtbare Größe behalten, Trefferfläche auf 44 wachsen lassen, wie `SectionHeader` es vormacht (und ausdrücklich **nicht** über `hitSlop`, das `Pressable` auf react-native-web ignoriert). Das Pattern schreibt beides hin, damit die Umsetzung nicht zwischen Design und Non-Negotiable wählen muss.

7. **Kein `toast.*`-i18n-Namespace.** Toast-Copy gehört der Funktion, die den Toast auslöst, und liegt damit in `cal.*`, `meals.*`, `auth.*` und so weiter. Die Copy im Spezimen ist Anschauungsmaterial, keine App-Copy — sie wandert nicht in die Kataloge und nicht in [docs/COPY.md](./COPY.md).

### Consequences

- **Es gibt noch keinen Toast in der App.** `DS.components.toast` ist über den Barrel (`export * from "./components"`) sofort lesbar, aber `Toast` und `ToastStack` existieren nicht — bewusst so bestellt. Als Follow-up in [docs/TODO.md](./TODO.md) notiert, zusammen mit der offenen Frage, ob der Stack pro Screen montiert wird (wie im Pattern beschrieben) oder als Provider im Root-Layout.
- **[docs/ICONS.md](./ICONS.md) führt jetzt `x`.** Der Schließen-Knopf ist das erste Element im Bundle, das ein Kreuz braucht; Feather liefert es unter demselben Namen. Der Alias fehlt noch im `LucideAlias`-Union von [Icon.tsx](../app-sections/shared/Icon.tsx) — er kommt mit der Implementierung, damit kein Alias ohne Verbraucher im Typ steht.
- **Die drei Icon-Glyphen des Toasts sind schon da.** `check`, `warning` (→ `alert-triangle`) und `sparkle` (→ `sparkles`) stehen in ICONS.md und im Alias-Union; der Import fügt dem Vokabular nichts hinzu außer dem Kreuz.
- **Das `error`-Timing ist eine Verhaltenszusage, kein Styling.** `autoDismissMs.error: null` heißt: Fehler-Toasts verschwinden nie von selbst. Wer den Vertrag später in eine Komponente gießt, darf daraus keinen Default-Timeout machen — der Toast trägt die Aktion, die den Fehler behebt.

## ADR-025 — Toast: ein Wirt im Root-Layout, ein Store ohne Context, Ort nach Icon-Abhängigkeit (2026-08-28)

### Status

Accepted. Setzt die Spezifikation aus [ADR-024](#adr-024--toast-aus-dem-design-kanvas-importiert-spezifikation-und-pattern-jetzt-implementierung-später-2026-08-28) um und beantwortet die dort offen gelassene Trägerfrage. Weicht in einem Punkt bewusst von [patterns/toast.md](../patterns/toast.md) ab (Decision 2).

### Context

Seit ADR-024 liegen `DS.components.toast` und das Pattern vor, Komponenten nicht. Der Auftrag: eine zentrale Toast-Komponente mit Provider, `useToast()`, den drei Varianten, beiden Positionen und Auto-Dismiss.

### Decisions

1. **Die Dateien liegen in `app-sections/shared/`, nicht in `design-system/ui/`.** Der Toast braucht vier Glyphen, und `Icon` wohnt in `app-sections/shared/`. `design-system/` importiert nirgends aus `app-sections/` — diese Richtung wäre eine Umkehrung der Schichtung. Das Repo hat den Fall längst entschieden, nur nie aufgeschrieben: `Pill`, `Field` und `TopBar` haben ebenfalls einen Spec-Block im Bundle und liegen trotzdem in `app-sections/shared/`, weil sie Icons brauchen. In `design-system/ui/` sitzt genau das, was ohne Icon auskommt (`Button`, `Card`, `Screen`, `Text`). Der Auftrag nannte `components/Toast.tsx` — ein Verzeichnis, das es hier nicht gibt und das mit `design-system/components.ts` kollidieren würde (siehe Namenskollisions-Notiz in CLAUDE.md).

2. **Ein Wirt im Root-Layout statt eines Stapels pro Screen.** Das Pattern beschreibt `ToastStack` als _innerhalb_ des Screens positioniert. Umgesetzt ist ein einzelner `ToastProvider` über dem Navigator, weil ein Toast den Screenwechsel überleben muss, der ihn ausgelöst hat: „Termin gespeichert" erscheint, während der Nutzer schon zurücknavigiert. Ein Stapel pro Screen ginge mit dem Screen verloren — genau in dem Moment, für den der Toast gedacht ist. Die Geometrie aus dem Pattern bleibt unverändert, sie misst nur gegen das Fenster statt gegen den Screen. **Preis:** native `formSheet`-Screens hostet react-native-screens in einem eigenen ViewController, ein von dort ausgelöster Toast landet darunter (als Follow-up notiert; derselbe Mechanismus zwingt `ThemeProvider` zu seinen `nativeVars`).

3. **Kein React-Context — der Store liegt auf Modulebene.** `useToast()` liest direkt aus dem Zustand-Store, wie `useThemeStore`/`ThemeProvider` es vormachen. Folge: der Hook funktioniert auch in Bäumen, die der Provider nicht umschließt, und ein vergessener Provider führt zu unsichtbaren Toasts statt zu einem geworfenen Fehler. Das ist hier die richtige Richtung — ein Toast ist Beiwerk; eine Fehlermeldung, die den Screen zum Absturz bringt, weil die Fehlermeldung nicht angezeigt werden kann, wäre grotesk.

4. **Die Entscheidungslogik ist rein und getestet, der Store ist die dünne Hülle.** `resolveDuration`, `enqueue` und `buildToast` sind Funktionen ohne React und ohne `react-native`-Import — damit laufen sie unter Bun ohne die Mocks aus `bun.test.preload.ts`. Dieselbe Aufteilung wie `selectStatus`/`useSessionStore` in [features/auth/session.ts](../features/auth/session.ts).

5. **Ein Toast mit Aktion läuft nie ab — unabhängig von der Variante.** Das Pattern sagt das für Fehler; `resolveDuration` zieht die Regel eine Ebene höher, weil die Begründung nicht an der Variante hängt: der Countdown nähme dem Nutzer genau den Knopf weg, wegen dem der Toast da ist. Ein ausdrücklich übergebenes `durationMs` gewinnt weiterhin über beides.

6. **Der Stapel verdrängt den ältesten, nicht den neuesten.** Bei `max: 2` fällt der dritte Toast nicht weg, sondern schiebt den ersten hinaus. Das jüngste Ereignis ist das, auf das der Nutzer gerade reagiert.

7. **Die Trefferflächen sind 44, die Optik bleibt beim Design.** Schließen-Knopf und Aktions-Button tragen ihre gezeichnete Größe (24 bzw. 28) in einer 44er-`Pressable`; beim Schließer holt ein negativer Rand von 10 die Optik zurück an die Design-Position, ohne die Fläche zu beschneiden — das Padding von 13 trägt sie. Kein `hitSlop`, aus dem Grund, den `SectionHeader` schon nennt: `Pressable` ignoriert es auf react-native-web.

8. **`Animated` aus React Native, nicht Reanimated.** Ein Opazitäts- und Versatz-Übergang über `useNativeDriver` braucht keine Worklets; Reanimated ist zwar im Stack, hat aber bis heute keinen Aufrufer im Repo, und der erste sollte ein Fall sein, der es wirklich braucht. Der Wert entsteht über ein lazy `useState` statt `useRef`, weil `react-hooks/refs` den `.current`-Zugriff während des Renderns verbietet — und der Wert fließt in den Style.

### Consequences

- **Auf Web sichtbar geprüft, nicht auf Simulatoren.** Ein temporärer Auslöser im Login-Screen (dem einzigen Screen ohne Session-Zwang) hat beide Positionen, alle drei Varianten, Aktion, Schließer und Auto-Dismiss in Light **und** Dark gezeigt; der Auslöser und die dafür umgestellte Theme-Vorgabe sind zurückgenommen, beide Dateien stehen wieder exakt auf `main`. Native Simulatoren blieben außen vor: ohne Aufrufer im Produktcode gäbe es dort nichts zu sehen, und ein iOS-Build kostet rund eine halbe Stunde für dieselbe Aussage. Die drei Metro-Bundles (web, ios, android) laufen als Gegenprobe durch.
- **Ein neuer i18n-Key: `action.close`.** Der Schließer ist ein Glyph ohne Text und braucht ein Label. Er steht bei den geteilten Aktions-Labels, nicht in einem `toast.*`-Namespace — den gibt es bewusst nicht (ADR-024, Decision 7).
- **`x` ist jetzt im `LucideAlias`-Union** von [Icon.tsx](../app-sections/shared/Icon.tsx) und hat mit dem Schließer seinen Verbraucher — die Bedingung, unter der ADR-024 den Alias aufgeschoben hatte.
- **`solid` und der Timer-Balken fehlen weiterhin.** Beide stehen in der Spezifikation, waren aber nicht Auftragsumfang; als Follow-up notiert. `solid` hat ohnehin nur einen vorgesehenen Anlass, und den gibt es noch nicht.
- **Noch ruft niemand `useToast()`.** Die Komponente steht bereit, die erste echte Verwendung ist eine eigene Iteration mit eigener Copy.

## ADR-026 — Rückgängig nach dem Löschen: verzögern statt wiederherstellen (2026-08-31)

### Status

Accepted. Erster echter Aufrufer von [ADR-025](#adr-025--toast-ein-wirt-im-root-layout-ein-store-ohne-context-ort-nach-icon-abhängigkeit-2026-08-28)s Toast-Komponente — löst deren offen gelassene Consequences ein (Timer-Leiste, erster Aufrufer). Keine Supersession.

### Context

Gelöschte Termine und Aufgaben sollen sich für einen kurzen Moment zurückholen lassen. Der Auftrag nannte drei Zutaten: eine verzögerte Delete-Mutation, einen Toast mit „Rückgängig"-Aktion, und beim Rückgängig ein Abbrechen der Mutation samt Wiederherstellung des lokalen Zustands.

Zwei Annahmen darin halten der Realität nicht stand. „Lokalen Zustand wiederherstellen" setzt voraus, dass etwas passiert ist, das sich zurücknehmen ließe — bei einer Mutation, die nie gefeuert hat, gibt es nichts wiederherzustellen. Schwerer wiegt: Beim Kalender ist „ein Delete" keine einzelne Operation, sondern drei. `applyDeleteScope` schreibt je nach gewähltem Scope eine Exception, kürzt die RRULE oder löscht die Master-Zeile ([recurrence.ts](../features/calendar/recurrence.ts)). Keine der drei ließe sich verlässlich zurück-mutieren — eine rückgängig gemachte RRULE-Kürzung bräuchte die exakte Regel von vorher, eine rückgängig gemachte Exception die gelöschte Zeile samt ihrer alten Id zurück. Eine Mutation, die nie feuert, muss dagegen nicht zurückgenommen werden. Das ist der Kern des gewählten Ansatzes (Decision 1).

Gebaut wurde dafür ein gemeinsamer Store (`features/shared/pendingDeletes.ts`) mit einem `AppState`-Hook (`useFlushPendingDeletes.ts`), je ein Feature-Selektor mit eigenem Cast und eigenem Filter für Termine (`features/calendar/pendingDeletes.ts` mit `usePendingEventDeletes`/`withoutPendingDeletes`, dazu `undoDeleteMessage.ts` für die Serien-Toast-Message als reine, mit injiziertem `Translate` getestete Funktion — Muster aus [ADR-020](#adr-020--sample-daten-lesen-ihre-copy-aus-sample-und-bekommen-translate-injiziert-statt-das-globale-t-zu-greifen-2026-08-25)) und Aufgaben (`features/tasks/pendingDeletes.ts` mit `usePendingTaskIds`/`withoutPendingTaskDeletes`, dem Geschwister der Kalender-Funktion), sowie ein Aufruf-Hook, der beides mit dem Toast verbindet (`app-sections/shared/useUndoableDelete.ts`). Der [Toast](../app-sections/shared/Toast.tsx) aus ADR-025 bekommt hier seinen ersten Aufrufer — das erlaubt an zwei Stellen eine saubere Entscheidung statt eines Kompromisses mit Bestandsverhalten (Decisions 8 und 9).

### Decisions

1. **Verzögern statt Wiederherstellen.** Ein Re-Insert nach dem Löschen scheidet aus drei Gründen aus: Er bräuchte neue Ids, verlorene Reminder- und Exception-Zeilen ließen sich nicht zurückholen, und bei einer Serie ist er praktisch nicht rekonstruierbar, weil `applyDeleteScope` je nach Scope eine Exception schreibt, die RRULE kürzt oder die Master-Zeile löscht (siehe Context). Statt zu löschen und bei Bedarf wiederherzustellen, wird die Mutation erst nach Ablauf des Fensters ausgeführt — bis dahin ist nichts passiert, was rückgängig zu machen wäre.

2. **Verstecken statt Cache-Manipulation.** Der Store hält, was „im Fenster" ist; die beiden Listen-Hooks (`useFamilyEvents`, `useFamilyTasks`) filtern es heraus. Rückgängig entfernt den Eintrag — es gab nie eine Cache-Änderung, die zurückzunehmen wäre. Die naheliegende Alternative — optimistisch aus dem Cache patchen, einen Snapshot merken, bei Undo zurückschreiben — scheitert am Kalender: Der Range-Cache hält **Master-Zeilen**, keine Occurrences. Ein `scope: "this"`-Delete auf einer Serie müsste eine synthetische Exception in die gecachte Zeile schreiben, damit `expandEvents` die Occurrence fallen lässt — also Server-Semantik im Client nachbauen. Dazu überholt jeder Refetch im Fenster den Snapshot, und das Undo schriebe veraltete Daten zurück.

3. **`target: unknown` mit einem Cast pro Feature.** Ein typisiertes Union in `features/shared` müsste `EditScope` aus `features/calendar` importieren und damit die Abhängigkeitsrichtung umdrehen (`features/tasks` importiert bereits `features/shared`). Eine generische Store-Fabrik pro Feature wäre voll typisiert, bräuchte aber eine Registry, damit `flush()` alle Instanzen erreicht — mehr Maschinerie als der eine Cast wert ist. `kind` ist der Diskriminator, der ihn absichert; jedes Feature macht ihn genau einmal, in seinem eigenen Selektor — `usePendingEventDeletes` in `features/calendar/pendingDeletes.ts`, `usePendingTaskIds` im gleichnamigen Modul unter `features/tasks/`.

4. **Der Timer gehört dem Store, nicht dem Toast.** Der Toast bekommt `durationMs` und zeichnet den Countdown, ist aber reine Darstellung. Hinge der Commit am Toast-Lebenszyklus, entschiede die Stapel-Obergrenze (`stack.max: 2`) mit darüber, ob eine Löschung stattfindet — ein dritter Toast verdrängt den ältesten, und mit ihm die Löschung.

5. **`flush` läuft nur auf `background`, nicht auf `inactive`.** Wechselt die App in den Hintergrund, werden alle offenen Löschungen sofort committet. Das **verengt** den App-Kill-Fall, beseitigt ihn aber nicht: `flush()` stößt die Requests nur an und hält die App nicht am Leben — iOS suspendiert kurz nach `applicationDidEnterBackground`, und `commit()` wartet auf ein nacktes `fetch` ohne Background-Task. Ohne den Listener bliebe das Fenster dagegen vollständig offen: Ein App-Kill verschluckte die Mutation, das Item wäre lokal weg und käme beim nächsten Refetch kommentarlos zurück. Der `AppState`-Listener reagiert dafür ausdrücklich nur auf `background`, nicht auf `inactive`: Auf iOS tritt `inactive` auch beim Herunterziehen des Kontrollzentrums, bei einer eingehenden Anruf-Einblendung und in der App-Switcher-Vorschau auf. Dort zu committen nähme dem Nutzer das Undo-Fenster weg, ohne dass er die App tatsächlich verlassen hätte.

6. **Der Bestätigungsdialog bleibt, Undo kommt dazu.** Bewusste Produktentscheidung gegen die übliche Lesart, nach der eine Undo-Möglichkeit die Bestätigung ersetzt. Beim Serientermin wählt der Dialog ohnehin den Umfang (dieser / ab hier / alle) und lässt sich deshalb nicht ersatzlos streichen; und ein zweiter Ausstieg schadet bei einer Löschung nicht. Die Kosten sind ein zusätzlicher Tap, den der Bestand schon hatte.

7. **Fünf Sekunden statt der 3200 ms aus dem Pattern.** Die 3200 ms, die das Toast-Pattern für die `success`-Variante nennt, gelten für eine Bestätigung, die man nur zur Kenntnis nimmt. Hier muss der Nutzer den Toast bemerken, lesen, hinlangen und treffen — während der Screen sich unter ihm bereits gewechselt hat, weil sofort zurücknavigiert wird.

8. **Variante `success`, nicht `info` — wegen des Glyphs.** `info` trägt in `Toast.tsx` das `sparkles`-Icon, und Funkeln ist in dieser Designsprache an KI vergeben. Eine Löschbestätigung mit KI-Icon wäre falsch; `check` (die `success`-Variante) sagt korrekt „was du wolltest, ist passiert".

9. **Bewusste Pattern-Abweichung: Ein Toast mit Aktion läuft hier ab.** Die Pattern-Regel aus ADR-025 (Decision 5) lautet „ein Toast mit Aktion läuft nie ab", weil der Countdown sonst dem Nutzer den Knopf wegnähme, wegen dem der Toast da ist. Hier gilt das Gegenteil: Das Ablaufen **ist** die Semantik — der Toast sagt dem Nutzer, wie lange die Ausstiegsluke offen ist. Der Aufruf übergibt `durationMs` deshalb ausdrücklich, und der explizite Wert gewinnt ohnehin laut Regel 1 in `toastStore.ts`.

10. **Ein Druck auf die Toast-Aktion schließt den Toast.** [Toast.tsx](../app-sections/shared/Toast.tsx) rief bis hierher nur `entry.action.onPress`; der Toast bliebe nach „Rückgängig" stehen, obwohl seine Frage beantwortet ist. Weil dieses Feature der erste Aufrufer der Komponente ist (siehe Context), wird das zum **Standardverhalten** statt zu einem Flag — es gibt keine Aktion, nach der ein Stehenbleiben richtig wäre, und ein Schalter mit genau einer sinnvollen Stellung ist keine Option, sondern eine Falle. Geschlossen wird über `close()`, also mit Ausblend-Animation, nicht über `dismiss()`. Die Entscheidung steht hier und nicht nur im Code-Kommentar, weil sie eine **geteilte** Komponente dauerhaft festlegt und damit jede künftige Toast-Aktion bindet, die nichts mit dem Löschen zu tun hat.

11. **`useEvent` wird ausdrücklich nicht gefiltert.** Der Detail-Fetch mit eigenem Query-Key (`calendarKeys.one`) kennt die offenen Löschungen nicht — direkt darüber wirbt `useFamilyEvents` damit, dass es sie herausfiltert. Am Code liest sich diese Asymmetrie wie ein Versehen; sie ist keins. Ihn mitzufiltern hieße, den Detail-Screen für die Dauer des Fensters auf „nicht gefunden" zu werfen, obwohl der Nutzer ihn gerade verlässt — erreichbar wäre der Zustand ohnehin nur per Deep Link auf einen Termin, den man in derselben Sitzung eben gelöscht hat. Bei Aufgaben stellt sich die Frage nicht: `useTask` ist ein Selektor **auf** `useFamilyTasks` und filtert deshalb automatisch mit.

### Consequences

- **Die Bestätigungs-Copy war unwahr geworden und wurde korrigiert.** `cal.delete.confirmBody` und `hw.delete.confirmBody` sagten „Diese Aktion kann nicht rückgängig gemacht werden." — seit diesem Feature stimmt das nicht mehr. Beide Keys stehen **nicht** in [docs/COPY.md](./COPY.md) (nur `child.deleteConfirmMsg` führt dort dieselbe Aussage, für ein Profil, das dieses Feature nicht anfasst) — das Handoff-Bundle bleibt also unangetastet.
- **Der Fehlerfall meldet jetzt per Toast statt per `Alert`.** Schlägt die verzögerte Mutation fehl, steht der Nutzer längst auf einem anderen Screen; ein `Alert.alert` fünf Sekunden später wäre ein Überfall. Stattdessen verschwindet der Pending-Eintrag (das Item ist im selben Moment wieder da) und ein `error`-Toast mit den bestehenden Keys `cal.delete.error`/`hw.delete.error` erscheint. Fehler-Toasts laufen nie ab.
- **`cal.delete.deleting`/`hw.delete.deleting` sind entfallen**, zusammen mit den `isPending`-Guards und der Deaktivierung an beiden Löschknöpfen (`EventDetailScreen`, `TaskEditScreen`): `deleteMutation.isPending` wird nie mehr sichtbar wahr, weil der Screen weg ist, bevor die Mutation überhaupt startet.
- **Die Timer-Leiste ist nachgezogen, `solid` weiterhin nicht.** `progressBar` stand seit ADR-024 in `DS.components.toast` und in `patterns/toast.md`, war aber nicht Teil von ADR-025. Beim Undo ist der Countdown zum ersten Mal funktional statt dekorativ — er sagt, wie lange „Rückgängig" noch greift. `solid` bleibt offen, weil sein einziger vorgesehener Anlass (der Allergie-Konflikt im Essensplaner) weiterhin aussteht.
- **Meal-Plan-Einträge sind mangels Mutationen außen vor.** `features/meals/` hat keine einzige Mutation — es gibt dort noch gar kein Löschen, also auch nichts, das rückgängig zu machen wäre. Das ist eine bewusste Abgrenzung, kein offener Punkt.
- **Die Konflikt-Prüfung im `EventCreateScreen` zieht automatisch mit.** Weil der Filter in `useFamilyEvents` sitzt und nicht im Screen, zählt ein Termin im Löschfenster dort nicht mehr als Konflikt. Dasselbe gilt fürs Dashboard, das denselben Hook liest.
- **Eine neue Testdatei sichert die Grundannahme des Features ab.** `features/tasks/mutateAsyncSurvivesUnmount.test.ts` hält direkt gegen `@tanstack/query-core` fest, dass `mutateAsync` seinen `onSettled`-Callback auch nach dem Unsubscribe (dem Unmount-Ersatz) noch ausführt — genau der Zustand, in dem sich der auslösende Screen befindet, wenn der Fünf-Sekunden-Timer abläuft. Bräche ein künftiger Dependency-Bump diese Garantie, wäre der Fehler lautlos: Das Item ist zu diesem Zeitpunkt nur lokal versteckt (der Pending-Delete-Filter blendet es aus) und käme beim nächsten Refetch kommentarlos zurück — ohne Fehler, ohne Log, ohne Toast.
