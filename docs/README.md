# Eltern Flow AI · Design System

A typed, framework-agnostic token + variant set for the Eltern Flow AI family organiser.

## Install / consume

```ts
// Anywhere in your app
import { DS, themes, palette, textStyles, space, radius, shadow } from "@/design-system";

const t = themes.light; // or themes.dark

const cardStyle = {
  background: t.card,
  color: t.ink,
  padding: space[4],
  borderRadius: radius["2xl"],
  boxShadow: shadow.md,
};
```

For runtime theme switching, emit CSS variables from `themes.ts` (one `:root` for light, one `.dark-theme` for dark) and read them as `var(--ink)`, `var(--card)`, etc.

## Layers

| File            | Owns                                           |
| --------------- | ---------------------------------------------- |
| `colors.ts`     | Raw palette, brand aliases, event-type colours |
| `typography.ts` | Inter scale + 11 semantic text presets         |
| `spacing.ts`    | 4-pt scale, radii, shadows, motion, z-index    |
| `themes.ts`     | Light + Dark — semantic roles → hex            |
| `components.ts` | Visual contract for shared components          |
| `index.ts`      | Barrel exports + frozen `DS` object            |

## Visual reference

Open `index.html` in the project root. It's a zoomable canvas with all 10 screens × 3 variants × light/dark. Tweaks toggle (top-right) flips DE/EN and shows/hides paired themes.

## Patterns

Per-screen specs live in `patterns/*.md`. Each one describes:

- Goal of the screen
- Anatomy (top→bottom)
- Variants & when to use each
- Empty + error states
- Voice-assistant entry points
- DE/EN copy keys (cross-ref `COPY.md`)
- Accessibility notes

Start with `patterns/dashboard.md` — it's the most-used screen.

## House rules

- **Mint = primary CTA.** **Orange = AI / voice only.** Don't mix these signals.
- **Cards use `shadow.md` over `bg`.** On `bgRaised` they may use `shadow.sm`.
- **Hairlines use inset ring shadows, not borders.** Pixel-crisp on retina.
- **Pills carry status, not navigation.** Don't tap-target them unless they're explicitly action chips.
- **Emoji are family glyphs** (avatars and meal types only). Never decorative in body copy.
- **System Inter** at all sizes. JetBrains Mono ONLY for tabular data and time strings if you need monospace.

## Versioning

This is v1.0 — a snapshot tied to the v1 designs. Treat token names as stable, hex values as tunable. When you change a hex, bump the patch version in `package.json` and search for hard-coded copies of the old value.
