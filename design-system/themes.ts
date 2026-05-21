// design-system/themes.ts
// Semantic theme tokens. Light + Dark. Map raw palette → UI roles.

import { palette, brand } from "./colors";

type Theme = {
  // Surfaces
  bg: string; // app background (warm off-white in light)
  bgRaised: string; // bg-2; subtle elevation
  card: string; // primary card surface
  cardSubtle: string; // card-2; very faint elevation over card
  overlay: string; // modal scrim

  // Text
  ink: string; // primary text
  inkSecondary: string; // metadata
  inkTertiary: string; // placeholders, disabled
  onMint: string; // text/icons on mint surface
  onOrange: string; // text/icons on orange surface

  // Brand
  primary: string;
  primarySoft: string;
  primaryStrong: string;
  accent: string;
  accentSoft: string;
  accentStrong: string;

  // Status
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;

  // Hairlines
  line: string;
  lineStrong: string;

  // FAB & voice
  fabFrom: string;
  fabTo: string;
};

export const lightTheme: Theme = {
  bg: palette.warm[100], // #F8F1EB
  bgRaised: palette.warm[200], // #F1E7DC
  card: "#FFFFFF",
  cardSubtle: palette.warm[50], // #FFFBF6
  overlay: "rgba(20,24,31,0.55)",

  ink: palette.slate[700], // #2C3E50
  inkSecondary: palette.slate[400], // #6B7280
  inkTertiary: palette.slate[300], // #94A3B8
  onMint: palette.mint[900], // #0B3936
  onOrange: palette.orange[900], // #5A2E00

  primary: brand.primary, // mint 500
  primarySoft: palette.mint[100],
  primaryStrong: palette.mint[700],
  accent: brand.accent, // orange 500
  accentSoft: palette.orange[100],
  accentStrong: palette.orange[700],

  success: palette.success[500],
  successSoft: palette.success[100],
  warning: palette.warn[500],
  warningSoft: palette.warn[100],
  danger: palette.danger[500],
  dangerSoft: palette.danger[100],

  line: "rgba(44, 62, 80, 0.08)",
  lineStrong: "rgba(44, 62, 80, 0.14)",

  fabFrom: palette.orange[400],
  fabTo: palette.orange[600],
};

export const darkTheme: Theme = {
  bg: palette.slate[900], // #14181F
  bgRaised: palette.slate[800], // #1B2129
  card: "#232A33",
  cardSubtle: "#2A323D",
  overlay: "rgba(0,0,0,0.6)",

  ink: palette.slate[50], // #F1F5F9
  inkSecondary: "#B3BCC7",
  inkTertiary: "#7B8492",
  onMint: palette.mint[900],
  onOrange: "#FFFFFF",

  primary: brand.primary,
  primarySoft: "rgba(78,205,196,0.14)",
  primaryStrong: palette.mint[300],
  accent: brand.accent,
  accentSoft: "rgba(255,159,28,0.16)",
  accentStrong: palette.orange[300],

  success: palette.success[500],
  successSoft: "rgba(52,211,153,0.16)",
  warning: palette.warn[500],
  warningSoft: "rgba(245,158,11,0.18)",
  danger: palette.danger[500],
  dangerSoft: "rgba(239,68,68,0.18)",

  line: "rgba(255,255,255,0.07)",
  lineStrong: "rgba(255,255,255,0.13)",

  fabFrom: palette.orange[400],
  fabTo: palette.orange[600],
};

export const themes = { light: lightTheme, dark: darkTheme } as const;
export type ThemeName = keyof typeof themes;
export type { Theme };

// ───── Notes for implementers ─────
//
// USAGE
//   import { themes } from "@/design-system";
//   const t = themes[colorScheme];   // colorScheme: "light" | "dark"
//   <View style={{ background: t.card, color: t.ink }} />
//
// CSS VARIABLE STRATEGY
// Emit a single :root and .dark { … } block from this file at build time.
// Then components only reference var(--ink), var(--card), etc.
//
//   :root {
//     --bg: <bg>; --card: <card>; --ink: <ink>; ...
//   }
//   .dark-theme { --bg: ...; ... }
//
// CONTRAST
// • ink on bg passes WCAG AA at 13 px (~7:1 light, ~12:1 dark).
// • Mint (primary) ONLY for buttons / pills / accents — not for body text.
// • Orange is the "AI / voice" colour — reserve it for the mic FAB,
//   AI badges, AI overlay surfaces. Don't use it for generic actions.
