// design-system/index.ts
// Public surface. Import from here, not from individual files.

export * from "./colors";
export * from "./typography";
export * from "./spacing";
export * from "./themes";
export * from "./components";

// Convenience: a frozen DS object useful for runtime theming.
import { palette, brand } from "./colors";
import { themes } from "./themes";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  letterSpacing,
  textStyles,
} from "./typography";
import { space, radius, shadow, motion, zIndex, breakpoint, touchTarget, screen } from "./spacing";
import * as components from "./components";

export const DS = {
  palette,
  brand,
  themes,
  type: { fontFamily, fontSize, fontWeight, lineHeight, letterSpacing, textStyles },
  layout: { space, radius, shadow, motion, zIndex, breakpoint, touchTarget, screen },
  components,
} as const;

export default DS;
