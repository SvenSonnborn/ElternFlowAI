// design-system/components.ts
// Variant specs for every shared component. These are NOT React components —
// they describe the visual contract each component must honour. Implementers
// map them to their framework (React/RN, Vue, SwiftUI, Compose).

import { radius, shadow, space, touchTarget, screen } from "./spacing";
import { textStyles } from "./typography";

// ─────────────────────────── BUTTON ───────────────────────────
//
//   <Button variant tone size icon iconRight disabled loading block />
//
// variant: solid | soft | ghost   tone: primary | accent | neutral | danger
// size: sm | md | lg              icon: ReactNode (left)  iconRight: ReactNode
//
export const button = {
  base: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: space[2],
    fontWeight: 600,
    cursor: "pointer",
    border: 0,
    transition: "transform .06s ease, box-shadow .12s ease",
    pressedScale: 0.985,
  },
  size: {
    sm: { height: 36, paddingX: space[3.5], radius: radius.lg, fontSize: 13 },
    md: { height: 44, paddingX: 18, radius: radius.xl, fontSize: 14 },
    lg: { height: 50, paddingX: space[5], radius: 16, fontSize: 15 },
  },
  tone: {
    primary: { bg: "var(--primary)", fg: "var(--on-mint)", shadow: shadow.mint },
    accent: { bg: "var(--accent)", fg: "#FFFFFF", shadow: shadow.orange },
    neutral: { bg: "var(--card)", fg: "var(--ink)", shadow: `${shadow.sm}, ${shadow.ring}` },
    danger: { bg: "var(--danger)", fg: "#FFFFFF", shadow: shadow.sm },
  },
  // variant modifies tone result
  variant: {
    solid: {
      /* use tone as-is */
    },
    soft: { bg: "tone.softBg /* primarySoft / accentSoft / bgRaised */", fg: "tone.softFg" },
    ghost: { bg: "transparent", fg: "var(--ink)", shadow: "none" },
  },
} as const;

// ─────────────────────────── INPUT FIELD ───────────────────────────
//
//   <Field label leadingIcon trailingIcon error placeholder value />
//
// Layout:
//   eyebrow label sits 28 px above the field (uppercase 11px 600 letter-spaced).
//   field is a flex row: leadingIcon · input · trailingIcon
//
export const field = {
  height: 50,
  paddingX: space[4],
  gap: space[2.5],
  radius: radius.xl,
  bg: "var(--card)",
  ring: "var(--line)",
  ringError: "var(--danger)",
  text: textStyles.body,
  label: textStyles.eyebrow,
  iconSize: 18,
  iconColor: "var(--ink-tertiary)",
  iconColorError: "var(--danger)",
  errorText: { ...textStyles.caption, color: "var(--danger)", marginTop: space[1.5] },
} as const;

// ─────────────────────────── CARD ───────────────────────────
//
// Three variants:
//   1. card.base     — white surface, soft shadow
//   2. card.tinted   — coloured wash (mintSoft / orangeSoft / etc), no shadow
//   3. card.hero     — gradient background for AI meal hero
//
export const card = {
  base: {
    bg: "var(--card)",
    radius: radius["2xl"], // 18
    padding: space[4], // 16
    shadow: shadow.md,
  },
  tinted: {
    radius: radius["2xl"],
    padding: space[4],
    shadow: "none",
    // bg picked from theme.primarySoft / accentSoft / successSoft / warningSoft
  },
  hero: {
    radius: radius["3xl"], // 22
    padding: space[4],
    bg: `radial-gradient(120% 90% at 100% 0%, #FFC56B 0%, transparent 55%),
         radial-gradient(120% 100% at 0% 100%, #2BAFA5 0%, transparent 55%),
         linear-gradient(135deg, var(--accent) 0%, #FFB94B 50%, var(--primary) 110%)`,
    shadow: shadow.lg,
    fg: "#FFFFFF",
  },
} as const;

// ─────────────────────────── PILL / CHIP ───────────────────────────
//
//   <Pill tone icon>{children}</Pill>
//
export const pill = {
  height: 24,
  paddingX: space[2.5],
  gap: space[1.5],
  radius: radius.pill,
  text: textStyles.pill,
  tones: {
    mint: { bg: "var(--primary-soft)", fg: "var(--primary-strong)" },
    orange: { bg: "var(--accent-soft)", fg: "var(--accent-strong)" },
    warn: { bg: "var(--warning-soft)", fg: "var(--warning)" },
    success: { bg: "var(--success-soft)", fg: "var(--success)" },
    neutral: { bg: "rgba(44,62,80,0.08)", fg: "var(--ink)" },
  },
} as const;

// ─────────────────────────── AVATAR ───────────────────────────
//
//   <Avatar name colorKey src size />
//
// size: sm 28 / md 36 / lg 56 / xl 72
// Falls back to initials (max 2) when src absent. Color must come from
// palette.avatar (deterministic per child name) — never random.
//
export const avatar = {
  sizes: { sm: 28, md: 36, lg: 56, xl: 72 } as const,
  fontSizeRatio: 0.39,
  weight: 700,
  fg: "#FFFFFF",
  initialMax: 2,
};

// ─────────────────────────── TAB BAR ───────────────────────────
//
// Floating pill tab bar, 5 tabs. Inset 10px from screen edges.
//
export const tabBar = {
  height: screen.tabBarHeight,
  inset: space[2.5], // 10
  radius: radius["4xl"] - 2, // 24-ish, soft pill
  bg: "color-mix(in srgb, var(--card) 92%, transparent)",
  backdropFilter: "blur(20px)",
  shadow: `${shadow.md}, ${shadow.ring}`,
  iconSize: 22,
  iconWrap: { width: 38, height: 30, radius: radius.lg },
  activeBg: "var(--primary-soft)",
  activeFg: "var(--primary-strong)",
  inactiveFg: "var(--ink-tertiary)",
  label: { ...textStyles.caption, fontSize: 10.5, fontWeight: 500 },
  tabs: [
    { key: "dashboard", labelDe: "Dashboard", labelEn: "Home", icon: "home" },
    { key: "calendar", labelDe: "Kalender", labelEn: "Calendar", icon: "calendar" },
    { key: "meals", labelDe: "Essen", labelEn: "Meals", icon: "utensils" },
    { key: "homework", labelDe: "Aufgaben", labelEn: "Homework", icon: "book" },
    { key: "family", labelDe: "Familie", labelEn: "Family", icon: "users" },
  ],
};

// ─────────────────────────── TOP BAR ───────────────────────────
//
// Greeting / screen title left, gear icon right. Optional leading back btn.
//
export const topBar = {
  paddingX: screen.contentSidePad,
  paddingY: space[1.5],
  title: textStyles.h1,
  subtitle: { ...textStyles.meta, color: "var(--ink-secondary)" },
  gear: {
    size: 38,
    radius: radius.lg,
    bg: "var(--card)",
    iconSize: 18,
    iconColor: "var(--ink-secondary)",
    shadow: `${shadow.sm}, ${shadow.ring}`,
  },
};

// ─────────────────────────── MIC FAB (Voice Assistant) ───────────────────────────
//
// Floating circular button, bottom-right. Optional pulsing ring + tooltip on
// hover or first launch. Tapping opens VoiceOverlay (full-screen).
//
export const micFab = {
  size: touchTarget.fab, // 60
  rightInset: space[6], // 24
  bottomInset: 100, // above tab bar
  radius: radius.full,
  bgGradient: `linear-gradient(145deg, #FFB94B, var(--accent) 60%, #E68500)`,
  fg: "#FFFFFF",
  shadow: `${shadow.orange}, inset 0 1px 0 rgba(255,255,255,0.5)`,
  iconSize: 24,
  pulseRing: { offset: -6, width: 2, color: "color-mix(in srgb, var(--accent) 35%, transparent)" },
  tooltip: {
    text: { de: "Sprachassistent", en: "Voice assistant" },
    bg: "var(--ink)",
    fg: "#FFFFFF",
    paddingX: space[2.5],
    paddingY: space[1.5],
    radius: radius.lg,
    gap: space[2.5],
  },
};

// ─────────────────────────── BOTTOM SHEET ───────────────────────────
//
// Used for: Settings, Recipe modal.
//
export const bottomSheet = {
  height: "82%",
  radiusTop: radius["4xl"],
  bg: "var(--card)",
  scrimColor: "rgba(20,24,31,0.55)",
  handle: { width: 40, height: 4, radius: 4, color: "var(--line-strong)", marginY: space[2.5] },
  titleRow: { paddingX: space[5], paddingY: space[3] },
};

// ─────────────────────────── CALENDAR ───────────────────────────
//
// Day cell holds up to 3 colour dots beneath the date number.
// "Today" cell is filled with primary, white number, dots become 85% white.
//
export const calendar = {
  cellAspect: 1,
  cellRadius: radius.lg,
  cellFontSize: 13,
  cellWeight: 500,
  headerLabel: { ...textStyles.eyebrow, fontSize: 10, color: "var(--ink-tertiary)" },
  todayBg: "var(--primary)",
  todayFg: "var(--on-mint)",
  dotSize: 4,
  dotGap: 2,
};

// ─────────────────────────── EVENT ROW ───────────────────────────
//
// Used in dashboard "Heute" list and calendar day view.
//
export const eventRow = {
  paddingY: space[3.5],
  paddingX: space[4],
  iconWrap: { size: 36, radius: radius.lg, bgAlpha: 0.13 /* tone × alpha */ },
  timeColumn: { width: 42, fontWeight: 700, fontSize: 13 },
  divider: { color: "var(--line)", height: 1 },
};

// ─────────────────────────── MEAL HERO CARD ───────────────────────────
export const mealHero = {
  ...card.hero,
  badge: { ...pill.tones.mint, prefix: "AI sparkle icon" },
  title: { ...textStyles.cardTitle, color: "#FFFFFF" },
  reason: { color: "rgba(255,255,255,0.9)", fontSize: 12.5 },
  // Reason must always state 3 facts: child preference · constraint · time
  // Example DE: "Ben liebt Nudeln · keine Allergien · 20 Min."
};

// ─────────────────────────── STATUS BAR ───────────────────────────
//
// Mocked at design level — implementers normally rely on the platform.
//
export const statusBar = {
  height: screen.statusBarHeight,
  paddingX: space[7], // 28 — keeps clear of the notch curve
  time: { fontSize: 14, fontWeight: 600 },
  glyphs: { gap: space[1.5] },
};

// ─────────────────────────── ICON GRAMMAR ───────────────────────────
//
// We use Lucide stroke icons everywhere. Stroke 2 (2.4 for chevrons/plus),
// linecap/linejoin: round. Two specific exceptions:
//   • google.svg — multicoloured original mark
//   • apple_logo.svg — filled glyph
//
export const iconStyle = {
  defaultSize: 18,
  strokeWidth: 2,
  strokeWidthBold: 2.4,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  // Container conventions (background by tone, foreground = icon color):
  container: { sm: 24, md: 30, lg: 36, xl: 42 },
  containerRadius: { sm: radius.sm, md: radius.md, lg: radius.lg, xl: radius.xl },
};
