# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

**Eltern Flow AI** — KI-gestützter Familien-Organizer (Expo + React Native). Funktionen: gemeinsamer Kalender, Essensplaner mit Allergie-Filter, Sprachassistent (FAB), Kinderprofile, Hausaufgaben.

User-facing app name (`app.json`, i18n `app.name`) is just **"Eltern Flow"** — the "AI" suffix is internal. Brand voice: warm, ruhig, modern, vertrauenswürdig. Niemals kindlich-süß. Immer Du, nie Sie. Primary locale **DE**, English is the alternate via switcher.

## Non-negotiables

1. **The handoff bundle is source of truth.** These files are owned by the designer and are off-limits to edit unless explicitly asked:
   - `design-system/{colors,typography,spacing,themes,components,index}.ts`
   - `docs/HANDOFF.md`, `docs/COPY.md`, `docs/ICONS.md`, `docs/README.md`
   - `patterns/*.md`

   The implementing engineer (Claude) writes React, wires routes, and consumes the tokens — never re-invents them. If a screen pattern conflicts with implementation reality, raise it in conversation; do not silently diverge.

2. **Build screens from `patterns/<screen>.md`.** Every screen in `app-sections/` corresponds to a pattern doc. Read it first. Anatomy, variants, states, accessibility, and voice entry points are spec'd there.

3. **All UI strings live in i18n catalogs.** Use the keys in `docs/COPY.md` — `nav.*`, `dash.*`, `voice.*`, `auth.*`, `onb.*`, `cal.*`, `meals.*`, `hw.*`, `child.*`, `set.*`. German in `de.json` is the canonical copy; English mirrors.

4. **Touch targets ≥ 44×44.** Mic FAB is 60. Voice overlay mic is 84. Tab bar shows exactly 5 tabs.

5. **Voice FAB is always reachable** on Dashboard, Kalender, Essen, Aufgaben, Familie. Hidden only inside Settings sheet and Onboarding.

## Commands

```bash
bun install                  # Install dependencies
bun start                    # Expo dev server (Metro)
bun run ios                  # iOS simulator
bun run android              # Android emulator
bun run web                  # Web preview (fastest smoke-test loop)
bun run typecheck            # tsc --noEmit
bun lint                     # ESLint (flat config, eslint-config-expo)
bun lint:fix                 # ESLint --fix
bun format                   # Prettier write
bun format:check             # Prettier check
bun test                     # Tests (uses Bun's jest-compatible runner)
```

`bun test` runs Bun's built-in runner, which understands `describe`/`it`/`expect` and resolves the `@/*` path alias from `tsconfig.json`. The `jest-expo` preset is wired but only relevant if a test ever needs the `jest` binary directly. For RN-component snapshot tests use `npx jest` (or `bun run -- jest`).

Web-bundle smoke check end-to-end:

```bash
bunx expo export --platform web --output-dir /tmp/eltern-web
```

## Tech stack (locked)

- **Expo SDK 54 + Expo Router 6** (file-based, `(tabs)` group, typed routes enabled)
- React 19.1 + React Native 0.81, **TypeScript strict**
- **NativeWind v4 + Tailwind 3.4** — utility classes consume CSS variables that flip per theme
- **Zustand** (local/UI) + **@tanstack/react-query** (server)
- **react-i18next + expo-localization** — DE default, EN switch
- **react-native-reanimated v4 + react-native-worklets** — last babel plugin must be `react-native-worklets/plugin`
- **ESLint 9 (flat config)** + Prettier + jest-expo
- **Supabase JS Client** (`@supabase/supabase-js` + AsyncStorage session) via [features/supabase/](features/supabase/). MCP via Supabases hosted HTTP-Server (`mcp.supabase.com`, project-scoped, OAuth) — Konfig in `.mcp.json`. App-ENV in `.env.local` (siehe `.env.example`). Schema mit RLS-Policies in `supabase/migrations/`, TypeScript-Types in `features/supabase/database.types.ts` (generiert). Auth-Flow + Edge Functions sind die nächsten Iterationen.

Deferred to later iterations (not yet wired): Auth-Flow + Realtime + Edge Functions, gustar.io Worker, Stripe, real STT + LLM, Expo Notifications.

## Folder structure

```
app/                     Expo Router routes — THIN re-export files only
├─ _layout.tsx           Root stack + providers (QueryClient · i18n · ThemeProvider · SafeArea · GestureHandler)
├─ (tabs)/_layout.tsx    Bottom tab navigator (5 tabs) + Voice FAB overlay
├─ (tabs)/index.tsx      → Dashboard
├─ (tabs)/kalender.tsx
├─ (tabs)/essen.tsx
├─ (tabs)/aufgaben.tsx
├─ (tabs)/familie.tsx
└─ +not-found.tsx

app-sections/            Real screen implementations
├─ (tabs)/<name>/<Name>Screen.tsx
├─ auth/                 (login & friends — to come)
├─ onboarding/           (5-step flow — to come)
├─ modals/
└─ shared/VoiceAssistantFAB.tsx

design-system/           Handoff bundle + theming runtime
├─ colors.ts             Palette + brand aliases (HANDOFF — do not edit)
├─ typography.ts         Inter scale + named textStyles (HANDOFF)
├─ spacing.ts            space · radius · shadow · zIndex · motion (HANDOFF)
├─ themes.ts             lightTheme · darkTheme · themes (HANDOFF)
├─ components.ts         Variant SPECS for Button/Card/Pill/Field/FAB/… (HANDOFF — NOT React components)
├─ index.ts              DS barrel (HANDOFF)
├─ themeStore.ts         Zustand store for active theme
├─ ThemeProvider.tsx     Injects CSS vars + NativeWind vars from active theme
└─ ui/                   ← React component implementations (Claude-owned)
   ├─ Button.tsx · Card.tsx · Screen.tsx · Text.tsx · index.ts

features/                Cross-cutting feature logic
├─ i18n/                 react-i18next init + de.json + en.json
├─ voice-assistant/      (placeholder)
├─ meal-planner/         (placeholder)
├─ supabase/             client.ts (createClient + AsyncStorage session) + barrel
└─ notifications/        (placeholder)

patterns/                Per-screen design docs (HANDOFF — required reading per screen)
├─ dashboard.md · dashboard-empty.md · login.md · onboarding.md
├─ meals.md · calendar.md · homework.md · child-profile.md · settings-voice.md

docs/
├─ HANDOFF.md            Developer handoff overview (read first when onboarding)
├─ COPY.md               DE/EN copy decks per screen (i18n source of truth)
├─ ICONS.md              Icon list + stroke conventions
├─ architecture.md
├─ decision-log.md       ADRs (append new entries, don't rewrite history)
└─ eltern-flow-ai-project-structure.md
```

## Import patterns

```ts
// Tokens — anything not a React component:
import { DS, themes, palette, brand, textStyles, space, radius } from "@/design-system";

// React component primitives:
import { Button, Card, Screen, Text } from "@/design-system/ui";

// i18n:
import { useTranslation } from "react-i18next";
const { t } = useTranslation();
t("dash.greeting.morning", { name });

// Supabase:
import { supabase } from "@/features/supabase";
```

Path alias `@/*` → repo root (see [tsconfig.json](tsconfig.json)).

**Important name collision:** `design-system/components.ts` (SPEC file with lowercase `button`/`card`/`pill` exports) shadows the React components folder if anyone reintroduces `design-system/components/`. That's why the React components live in `design-system/ui/`. Don't rename it back.

## Routing convention

Files in `app/` are **thin wrappers** — they re-export the screen component from `app-sections/`:

```tsx
// app/(tabs)/kalender.tsx
export { KalenderScreen as default } from "@/app-sections/(tabs)/kalender/KalenderScreen";
```

Keeps `app/` as the URL surface and `app-sections/` as the implementation surface. New routes must follow this split.

## Theming

Two themes — `light` (default) and `dark`. Every theme defines the full semantic role set: `bg`, `bgRaised`, `card`, `cardSubtle`, `overlay`, `ink`, `inkSecondary`, `inkTertiary`, `onMint`, `onOrange`, `primary`, `primarySoft`, `primaryStrong`, `accent`, `accentSoft`, `accentStrong`, `success*`, `warning*`, `danger*`, `line`, `lineStrong`, `fabFrom`, `fabTo`.

These are emitted as CSS variables (`--bg`, `--card`, `--ink`, `--primary-soft`, …) by [ThemeProvider.tsx](design-system/ThemeProvider.tsx) on web + by NativeWind's `vars()` on native. Tailwind classes (`bg-bg`, `text-ink`, `bg-primary-soft`, `border-line`) read the CSS vars, so a theme switch is automatic.

Tab bar (Dashboard · Kalender · Essen · Aufgaben · Familie) uses German labels straight from `nav.*` i18n keys. Tab tokens come from `DS.components.tabBar`.

## Voice FAB

Lives in [app-sections/shared/VoiceAssistantFAB.tsx](app-sections/shared/VoiceAssistantFAB.tsx) and is mounted by `app/(tabs)/_layout.tsx` so it overlays every tab. Spec lives in `DS.components.micFab` (60px, orange gradient, right inset 24, bottom inset 100 — above tab bar). Tapping today opens a placeholder modal. The full overlay (`patterns/settings-voice.md`) will be wired when STT + LLM provider are chosen.

## State

- **Zustand stores** sit next to the feature that owns them. Active theme: [design-system/themeStore.ts](design-system/themeStore.ts).
- **TanStack Query** is mounted in the root layout but unused until Supabase lands. Default options: `retry: 1`, `staleTime: 30s`.

## Documentation discipline

When you change code that's documented, update the doc in the same commit:

- Architectural changes → [docs/architecture.md](docs/architecture.md)
- Decisions worth a paper trail → append a new ADR to [docs/decision-log.md](docs/decision-log.md) (never edit older ADRs — supersede them)
- Anything visible to engineers (folder moves, new conventions, renamed routes) → this file

When in doubt, the **handoff bundle wins**. CLAUDE.md and decision-log.md adapt around it.
