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
