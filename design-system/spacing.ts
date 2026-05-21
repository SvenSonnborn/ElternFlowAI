// design-system/spacing.ts
// Spacing, radii, shadows, breakpoints, motion.

// 4-pt base. Use these in gap/padding/margin everywhere — no magic numbers.
export const space = {
  0: 0,
  px: 1,
  0.5: 2,
  1: 4,
  1.5: 6,
  2: 8,
  2.5: 10,
  3: 12,
  3.5: 14,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  10: 40,
  12: 48,
  14: 56,
  16: 64,
  20: 80,
  24: 96,
} as const;

// Border radii — rounded but not cartoonish. Match Tailwind keys for familiarity.
export const radius = {
  none: 0,
  sm: 8,
  md: 10,
  lg: 12, // small chip / icon container
  xl: 14, // button, input
  "2xl": 18, // standard card
  "3xl": 22, // hero card, modal handle area
  "4xl": 26, // bottom sheet
  pill: 999, // chip, fab
  full: "50%",
} as const;

// Layered shadow scale — keep blurs soft, opacities ≤ 0.12 to feel airy.
// All shadows are tuned against the warm #F8F1EB background.
export const shadow = {
  none: "none",
  sm: "0 1px 2px rgba(44,62,80,0.05), 0 1px 1px rgba(44,62,80,0.04)",
  md: "0 4px 14px rgba(44,62,80,0.06), 0 2px 4px rgba(44,62,80,0.04)",
  lg: "0 12px 28px rgba(44,62,80,0.09), 0 4px 8px rgba(44,62,80,0.05)",
  xl: "0 24px 48px rgba(44,62,80,0.14), 0 8px 16px rgba(44,62,80,0.06)",

  // Brand-coloured shadows (for FAB and primary CTA only)
  mint: "0 10px 24px rgba(78,205,196,0.32)",
  orange: "0 12px 28px rgba(255,159,28,0.34)",

  // Inset / hairline borders. Use INSTEAD of 1px borders to keep edges crisp.
  ring: "inset 0 0 0 1px rgba(44,62,80,0.08)",
  ringStrong: "inset 0 0 0 1px rgba(44,62,80,0.14)",
  ringDanger: "inset 0 0 0 1.5px #EF4444",
  ringMint: "inset 0 0 0 1.5px #4ECDC4",
} as const;

// Mobile-first breakpoints — most screens stay phone-sized.
export const breakpoint = {
  sm: 360,
  md: 480,
  lg: 768,
  xl: 1024,
} as const;

// Z-index scale — keep dense; we don't stack much.
export const zIndex = {
  base: 0,
  raised: 1,
  sticky: 10, // tab bar
  fab: 20, // mic FAB
  overlay: 50, // dimmer
  sheet: 60, // bottom sheet, modal
  toast: 70,
  voice: 80, // voice overlay covers everything
} as const;

// Motion — short, ease-out for entry, ease-in-out for state changes.
export const motion = {
  duration: {
    instant: 60,
    fast: 120,
    base: 180,
    slow: 280,
    slower: 420,
    voice: 1200, // mic orb breathing
  },
  easing: {
    standard: "cubic-bezier(0.2, 0.7, 0.3, 1)",
    decel: "cubic-bezier(0, 0, 0.2, 1)",
    accel: "cubic-bezier(0.4, 0, 1, 1)",
    spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  },
} as const;

// Touch targets — minimum 44×44, recommended 48×48 for primary actions.
export const touchTarget = {
  min: 44,
  rec: 48,
  fab: 60,
  fabVoice: 84, // big mic in voice overlay
} as const;

// Screen / device assumptions.
export const screen = {
  phoneWidth: 380, // iPhone 14/15 = 390. We design at 380 for safety.
  phoneHeight: 820,
  contentSidePad: space[5], // 20px — every screen's content gutter
  tabBarHeight: 72,
  tabBarFloatInset: space[2.5], // 10px from screen edges
  statusBarHeight: 44,
} as const;
