// design-system/typography.ts
//
// React Native compatible.
// • lineHeight is computed as an absolute px value (RN does not accept
//   unitless multipliers — `1.15` would be read as 1.15 px).
// • letterSpacing is a Number in points (RN does not accept "em" strings).
// • Use `fontVariant: ['tabular-nums']` instead of `fontVariantNumeric`.

export const fontFamily = {
  // Primary UI face — Inter, loaded via expo-font / @react-native-community
  sans: "Inter",
  // Monospace for timestamps, codes, eyebrow labels in dev/admin views
  mono: "JetBrainsMono",
  // Optional: a slightly more rounded face for kid-friendly contexts
  display: "Inter",
} as const;

// Type scale (mobile-first). All sizes in px (= DIP in RN).
export const fontSize = {
  xs: 11, // eyebrow, captions
  sm: 12, // metadata, secondary
  base: 13, // body
  md: 14, // buttons, fields
  lg: 15, // emphasised body
  xl: 18, // card titles
  "2xl": 22, // section headings, h2
  "3xl": 26, // hero / onboarding step title
  "4xl": 28, // brand hero
  "5xl": 30, // marketing splash
} as const;

export const fontWeight = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
  extrabold: "800",
} as const;

// Multipliers — kept for reference / docs.
// DO NOT pass these directly to RN style; use `lh(size, ratio)` below.
export const lineHeightRatio = {
  tight: 1.15,
  snug: 1.25,
  normal: 1.4,
  relaxed: 1.5,
} as const;

// Helper: turn a unitless ratio into the px value RN expects.
const lh = (size: number, ratio: number) => Math.round(size * ratio);

// Letter spacing in points. Computed from an em-fraction × fontSize at the
// preset level (em is relative; RN points are absolute, so we resolve it).
const ls = (size: number, em: number) => +(size * em).toFixed(2);

// Semantic text presets — use these in components, not raw sizes.
export const textStyles = {
  hero: {
    // brand splash, login hero
    fontFamily: fontFamily.display,
    fontSize: fontSize["5xl"],
    fontWeight: fontWeight.extrabold,
    lineHeight: lh(fontSize["5xl"], lineHeightRatio.tight), // 35
    letterSpacing: ls(fontSize["5xl"], -0.02), // -0.60
  },
  h1: {
    // top bar greeting
    fontSize: fontSize["2xl"],
    fontWeight: fontWeight.bold,
    lineHeight: lh(fontSize["2xl"], lineHeightRatio.snug), // 28
    letterSpacing: ls(fontSize["2xl"], -0.01), // -0.22
  },
  h2: {
    // step title, modal title
    fontSize: fontSize["3xl"],
    fontWeight: fontWeight.extrabold,
    lineHeight: lh(fontSize["3xl"], lineHeightRatio.snug), // 33
    letterSpacing: ls(fontSize["3xl"], -0.015), // -0.39
  },
  cardTitle: {
    // meal name, recipe title
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    lineHeight: lh(fontSize.xl, lineHeightRatio.snug), // 23
    letterSpacing: ls(fontSize.xl, -0.01), // -0.18
  },
  listTitle: {
    // event title in a list row
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    lineHeight: lh(fontSize.base, lineHeightRatio.normal), // 18
  },
  body: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.regular,
    lineHeight: lh(fontSize.base, lineHeightRatio.relaxed), // 20
  },
  bodyEmph: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    lineHeight: lh(fontSize.base, lineHeightRatio.normal), // 18
  },
  meta: {
    // secondary line under list item
    fontSize: fontSize.sm,
    fontWeight: fontWeight.regular,
    lineHeight: lh(fontSize.sm, lineHeightRatio.normal), // 17
  },
  caption: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    lineHeight: lh(fontSize.xs, lineHeightRatio.normal), // 15
  },
  eyebrow: {
    // ALL-CAPS section labels
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    lineHeight: lh(fontSize.xs, lineHeightRatio.normal), // 15
    letterSpacing: ls(fontSize.xs, 0.07), // 0.77
    textTransform: "uppercase" as const,
  },
  button: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    lineHeight: fontSize.md, // 14 — single-line button label
  },
  pill: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    lineHeight: fontSize.xs, // 11 — single-line pill label
  },
  numeric: {
    // for times, counts
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    lineHeight: lh(fontSize.base, lineHeightRatio.normal), // 18
    fontVariant: ["tabular-nums"] as const,
  },
} as const;

export type TextStyleKey = keyof typeof textStyles;

// ───── Notes for implementers ─────
// • Minimum body size on mobile: 13px. Never go below 11px (caption only).
// • German strings tend to be ~20% longer than English — leave room in
//   buttons & pills.
// • Tabular nums for times and counts via `fontVariant: ['tabular-nums']`.
// • RN does not support text-shadow or font-smoothing tokens — keep those
//   out of the design system.
