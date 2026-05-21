// design-system/colors.ts
// Eltern Flow AI — color tokens
// Hex values are canonical; semantic roles in themes.ts map them to UI.

export const palette = {
  // Brand
  mint: {
    50: "#F0FBFA",
    100: "#E6F8F6",
    200: "#BFEFEB",
    300: "#8FE2DC",
    400: "#65D4CC",
    500: "#4ECDC4", // ← brand primary
    600: "#39B9B0",
    700: "#2BAFA5",
    800: "#1F8079",
    900: "#0B3936", // ← on-mint text
  },
  orange: {
    50: "#FFF7E8",
    100: "#FFEFD6",
    200: "#FFE0AC",
    300: "#FFCB7A",
    400: "#FFB94B",
    500: "#FF9F1C", // ← brand accent (voice / AI)
    600: "#E68500",
    700: "#D67D00",
    800: "#A05E00",
    900: "#5A2E00", // ← on-orange text
  },

  // Neutrals — warm
  warm: {
    50: "#FFFBF6", // card-2
    100: "#F8F1EB", // background (light)
    200: "#F1E7DC", // bg-2 (light)
    300: "#E5DBCE",
    400: "#C9BFB1",
    500: "#94887A",
    600: "#6B5F52",
    700: "#3F362D",
  },
  slate: {
    50: "#F1F5F9",
    100: "#E2E8F0",
    200: "#CBD5E1",
    300: "#94A3B8", // ink-3 (placeholder)
    400: "#6B7280", // ink-2 (secondary text)
    500: "#475569",
    600: "#334155",
    700: "#2C3E50", // ink (primary text, light theme)
    800: "#1B2129", // bg-2 (dark theme)
    900: "#14181F", // bg (dark theme)
  },

  // Status
  success: {
    50: "#ECFDF5",
    100: "#DCFCE7",
    500: "#34D399", // success
    700: "#059669",
    900: "#053527",
  },
  warn: {
    50: "#FFFBEB",
    100: "#FEF3C7",
    500: "#F59E0B", // warning (important)
    700: "#B45309",
    900: "#3D2400",
  },
  danger: {
    50: "#FEF2F2",
    100: "#FEE2E2",
    500: "#EF4444", // danger / login error
    700: "#B91C1C",
  },

  // Family/child avatar palette (HSL-balanced, accessible against white text)
  avatar: {
    sky: "#7DD3FC", // Ben
    pink: "#FBA1B7", // Mia
    violet: "#C4B5FD", // Leo
    peach: "#FFE0AC",
    sage: "#A7F3D0",
    coral: "#FCA5A5",
    indigo: "#A5B4FC",
    butter: "#FDE68A",
  },

  // Event color coding (calendar/homework type tags)
  event: {
    schule: "#4ECDC4", // mint — school
    arzt: "#FBA1B7", // pink — doctor
    sport: "#FF9F1C", // orange — sport
    ha: "#C4B5FD", // violet — homework
    family: "#7DD3FC", // sky — social/family
    meal: "#34D399", // success — meal
  },
} as const;

// Direct named alias map matching the brief
export const brand = {
  primary: palette.mint[500],
  accent: palette.orange[500],
  background: palette.warm[100],
  textPrimary: palette.slate[700],
  textSecondary: palette.slate[400],
  success: palette.success[500],
  warning: palette.warn[500],
  danger: palette.danger[500],
} as const;

export type PaletteKey = keyof typeof palette;
export type PaletteHex = (typeof palette)[PaletteKey] extends Record<string, infer V> ? V : never;
