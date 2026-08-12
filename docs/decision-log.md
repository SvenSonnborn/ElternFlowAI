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
4. **`due_time` ist der Dringlichkeits-Tiebreaker.** Sortiert wird `due_date` asc → `due_time` asc (NULL ans Ende) → Titel. Ohne Prioritätsspalte ist „bis 8 Uhr abgeben ist dringender als irgendwann heute" die Bedeutung, die „dann Dringlichkeit" tragen kann. Nebeneffekt: die Reihenfolge bei gleichem Datum ist erstmals deterministisch. Eine echte `tasks.priority`-Spalte (Migration, zwei Formularfelder, Types-Regen) wäre eine eigene Iteration und ohne Nutzersignal spekulativ.
5. **Der Filter lebt in einem Zustand-Store ohne `persist`.** Er überlebt Tab-Wechsel und den Weg ins Formular, wird beim App-Start zurückgesetzt. `useState` im Screen wäre nicht isoliert testbar; `zustand/middleware`-`persist` führt Hydration-Handling und einen Web-Zweig neu im Repo ein — und ein vor einer Woche gesetzter Kind-Filter würde eine unvollständige Liste zeigen, ohne dass erkennbar wäre, warum.

### Consequences

- `patterns/homework.md` kennt weder die Filterleiste noch mehr als drei Sektionen, und die zwölf neuen `hw.*`-Keys fehlen in `docs/COPY.md` — beides als Designer-Abstimmung in `docs/TODO.md`.
- `useTasksByChild` bleibt ungenutzt: ein Kind-_Filter_ ersetzt keine Kind-_Gruppierung_.

---
