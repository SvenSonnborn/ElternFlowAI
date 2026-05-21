# Architecture

## High level

Eltern Flow AI is an Expo + React Native app written in TypeScript. The UI is rendered with NativeWind (Tailwind for RN) consuming theme tokens that flip between three palettes. Navigation uses Expo Router with file-based routes — the actual screen implementations live in `app-sections/` and `app/` files are thin re-exports so the URL surface stays small and uniform.

```
┌────────────────────────────────┐
│ Expo Router (app/)             │  thin route files
├────────────────────────────────┤
│ Screens (app-sections/)        │  real screen components
├────────────────────────────────┤
│ Design system (design-system/) │  tokens, themes, primitives
├────────────────────────────────┤
│ Features (features/)           │  business logic + integrations
├────────────────────────────────┤
│ State                          │  Zustand (UI) + TanStack Query (server)
└────────────────────────────────┘
```

## Providers (mounted in `app/_layout.tsx`)

In order, outermost to innermost:

1. `GestureHandlerRootView`
2. `SafeAreaProvider`
3. `QueryClientProvider` (TanStack Query)
4. `ThemeProvider` (reads `themeStore`, exposes tokens + injects CSS vars)
5. `Stack` (Expo Router)

`features/i18n` is initialized as a side effect on module import.

## Theme system

Three themes (`warmLight`, `softDark`, `pastelBlue`) defined in
[design-system/themes.ts](../design-system/themes.ts). The same token names are
used in two places that must stay in sync:

- `themes.ts` — JS object consumed by React code via `useTheme()`
- `tailwind.config.js` — Tailwind colors mapped to CSS variables

`ThemeProvider` writes the active theme's tokens as CSS variables both on the
web `document.documentElement` and on a wrapper `View` via NativeWind's `vars()`
helper so that NativeWind classes like `bg-background` always reflect the
current theme.

## Routing

- `app/_layout.tsx` — root stack + providers
- `app/(tabs)/_layout.tsx` — bottom tab navigator with the 5 fixed tabs and the
  floating Voice FAB overlay
- `app/(tabs)/<name>.tsx` — re-exports the corresponding screen from
  `app-sections/(tabs)/<name>/<Name>Screen.tsx`
- `app/+not-found.tsx` — 404 fallback

## State management

- **Zustand** — local/UI state. Each store sits next to its feature; the theme
  store lives in `design-system/themeStore.ts`.
- **TanStack Query** — server state (Supabase reads, Edamam reads, etc.). Will
  be wired once Supabase is added.

## What's not here yet

See [decision-log.md](./decision-log.md) for the full out-of-scope list. The
short version: no Supabase, no Edamam, no Stripe, no real Voice/LLM, no auth,
no onboarding, no settings screen.
