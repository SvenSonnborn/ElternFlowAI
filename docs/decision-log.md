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
