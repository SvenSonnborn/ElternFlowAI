# Eltern Flow AI — Project Structure

This is the canonical folder layout for the codebase. It is referenced by
`CLAUDE.md`. New screens, components, features, or types **must** go in the
folder named here — see `CLAUDE.md` for the "do not silently diverge" rule.

```
ElternFlow AI/
├── app/                            Expo Router routes (thin wrappers)
│   ├── _layout.tsx                 Root stack + providers
│   ├── (tabs)/
│   │   ├── _layout.tsx             5-tab bottom navigator + Voice FAB
│   │   ├── index.tsx               → Dashboard
│   │   ├── kalender.tsx            → Kalender
│   │   ├── essensplanung.tsx       → Essensplanung
│   │   ├── hausaufgaben.tsx        → Hausaufgaben
│   │   └── familie.tsx             → Familie
│   └── +not-found.tsx              404
│
├── app-sections/                   Real screen implementations
│   ├── (tabs)/<name>/<Name>Screen.tsx
│   ├── auth/                       (placeholder)
│   ├── onboarding/                 (placeholder)
│   ├── modals/                     (placeholder)
│   └── shared/
│       └── VoiceAssistantFAB.tsx
│
├── design-system/                  Tokens + primitives
│   ├── colors.ts                   Raw palette
│   ├── typography.ts               Font scales
│   ├── spacing.ts                  4pt grid
│   ├── themes.ts                   warmLight | softDark | pastelBlue
│   ├── themeStore.ts               Zustand store for active theme
│   ├── ThemeProvider.tsx           Context + CSS-var injection
│   └── components/
│       ├── Button.tsx
│       ├── Card.tsx
│       ├── Screen.tsx              Safe-area wrapper
│       ├── Text.tsx                Themed text
│       └── index.ts
│
├── features/                       Feature logic + integrations
│   ├── i18n/
│   │   ├── index.ts                i18next init (DE default, EN switch)
│   │   └── locales/{de,en}.json
│   ├── voice-assistant/            (placeholder)
│   ├── meal-planner/               (placeholder)
│   ├── supabase/                   (placeholder)
│   └── notifications/              (placeholder)
│
├── types/                          Shared TS interfaces
│   ├── navigation.ts
│   ├── theme.ts
│   └── index.ts
│
├── docs/
│   ├── architecture.md
│   ├── decision-log.md
│   └── runbooks/
│
├── __tests__/                      Jest tests
│
├── app.json                        Expo config
├── babel.config.js                 expo + nativewind preset + worklets plugin
├── metro.config.js                 withNativeWind wrapper
├── tailwind.config.js              Theme colors via CSS variables
├── global.css                      @tailwind directives + :root tokens
├── nativewind-env.d.ts
├── jest.config.js
├── tsconfig.json                   strict, path alias @/* → repo root
├── .eslintrc.js                    extends "expo" + "prettier"
├── .prettierrc
└── package.json
```

## Path alias

Always import via `@/...` (mapped to the repo root in `tsconfig.json`).

```ts
import { Card } from "@/design-system/components";
import { DashboardScreen } from "@/app-sections/(tabs)/dashboard/DashboardScreen";
import "@/features/i18n";
```

## Adding a new screen

1. Create the real screen in `app-sections/<area>/<name>/<Name>Screen.tsx`
2. Add a thin route file in `app/...` that re-exports it as `default`
3. If it needs strings, add them to BOTH `de.json` and `en.json`
4. Reach for `design-system/components` first; only drop to raw RN when needed

## Adding a feature

1. Create `features/<feature-name>/`
2. Co-locate Zustand stores, hooks, helpers, and API clients
3. Export the public surface from an `index.ts`
4. Screens import from `@/features/<feature-name>`, never reach into internals
