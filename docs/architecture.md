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

Innerhalb von `ThemedStack` — also zwischen `Stack` und den Providern darüber —
laufen zusätzlich drei Hooks ohne eigenes Provider-Element: `useInitSession()`,
`useFlushPendingDeletes()` und `useFamilyRealtime()`. Der Realtime-Hook steht
dabei bewusst **vor** `<AuthGate>`: Der Gate rendert bei einem Redirect
`<Redirect>` statt seiner Kinder, ein Abo darunter würde bei jedem
Routenwechsel ab- und wieder aufgebaut (ADR-030).

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

## Realtime

Änderungen an `events` und `event_exceptions` gehen **nicht** mehr über die
Publikation `supabase_realtime`, sondern über _Broadcast from Database_: Ein
`after`-Trigger ruft `realtime.broadcast_changes()` auf das private Topic
`family:<familyId>`, autorisiert durch eine RLS-Policy auf `realtime.messages`
gegen `current_family_id()`. Weil der Trigger die alte Zeile noch sieht, trägt
auch ein DELETE seine `family_id` und `event_id` — und ein Client hört
ausschließlich die eigene Familie (siehe [decision-log.md](./decision-log.md),
ADR-030, löst ADR-028 teilweise ab).

Client-seitig ist [features/realtime/](../features/realtime/) eine Sync-Schicht
**über** den Features: `subscribe`/`normalize`/`coalesce`/`reconnect` kennen
kein Feature, allein `dispatch.ts` bildet Änderungen auf Query-Keys ab.
`useFamilyRealtime()` läuft **einmal** in `ThemedStack` — nicht in
`useFamilyEvents`, der drei Aufrufer hat —, sammelt eingehende Änderungen 300 ms
und invalidiert dann gebündelt. Nach einem Verbindungsverlust lädt es den
Zustand nach (verpasste Broadcasts kommen nicht nach); hält der Verlust über
zehn Sekunden an, zeigen Kalender und Dashboard `<SyncNotice />`.

## What's not here yet

See [decision-log.md](./decision-log.md) for the full out-of-scope list. The
short version: no recipe-import worker (gustar.io), no Stripe, no real
Voice/LLM, no Expo Notifications, no Edge Functions.

Supabase, the auth flow, onboarding and the settings screen have all landed
since this list was written (ADR-003, ADR-005, ADR-008); Realtime is wired as
far as the section above describes. Was dort noch fehlt, ist die
Conflict-Detection: Zwei gleichzeitige Änderungen an derselben Zeile gewinnt
weiterhin der letzte Schreiber (Issue #52).
