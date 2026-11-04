import { screen, touchTarget } from "@/design-system";

const PADDING_TOP = 8;
// React Navigation setzt oben eine Haarlinie als Rand; sie zählt in die Höhe.
const BORDER_TOP = 1;

/**
 * Höhe und oberes Polster der Tab-Leiste, abhängig vom unteren Systemrand.
 *
 * React Navigation zählt den Systemrand (Home-Indikator, Android-Navigationsleiste)
 * als `paddingBottom` in die gesetzte `height` hinein. Mit der festen Design-Höhe
 * von 72 blieben den Tabs auf dem iPhone 30 pt, auf Android 40 dp — unter der
 * Mindest-Tippfläche. Die Leiste wächst deshalb genau so weit, dass jeder Tab
 * `touchTarget.min` hoch ist; ohne Rand (Web) bleibt sie bei den 72 des Designs.
 */
export function tabBarSize(bottomInset: number): { height: number; paddingTop: number } {
  return {
    height: Math.max(screen.tabBarHeight, PADDING_TOP + touchTarget.min + BORDER_TOP + bottomInset),
    paddingTop: PADDING_TOP,
  };
}
