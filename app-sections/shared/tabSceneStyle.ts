import type { ViewStyle } from "react-native";

/**
 * `visibility` kennt React Natives `ViewStyle` nicht, react-native-web reicht
 * es aber als CSS durch. Deshalb die doppelte Assertion — einmal hier statt an
 * jeder Aufrufstelle.
 */
const HIDDEN_SCENE = { visibility: "hidden" } as unknown as ViewStyle;

/**
 * Stil für eine Szene des Tab-Navigators: auf Web unsichtbar, solange sie nicht
 * die fokussierte Route ist.
 *
 * Auf Web bleiben inaktive Tab-Szenen im DOM (und sind `aria-hidden`), die
 * Tab-Taste erreicht sie trotzdem. `visibility: hidden` nimmt die Szene aus
 * Tab-Reihenfolge und Screenreader-Baum, behält aber Layout und Scrollposition
 * — React Navigations Stack macht dasselbe für verdeckte Karten. Nativ bleibt
 * alles beim Alten, dort gibt es keinen Tastaturfokus auf verdeckte Szenen.
 *
 * Der Aufrufer liest die fokussierte Route aus dem Zustand des Tab-Navigators
 * statt über `navigation.isFocused()`: Letzteres ist auch dann falsch, wenn ein
 * Sheet über den Tabs liegt, und die Tabs dahinter müssen sichtbar bleiben.
 * Ohne bekannte fokussierte Route bleibt jede Szene sichtbar. Siehe ADR-041.
 */
export function tabSceneStyle(input: {
  os: string;
  routeKey: string;
  focusedRouteKey: string | undefined;
}): ViewStyle | undefined {
  if (input.os !== "web") return undefined;
  if (input.focusedRouteKey === undefined) return undefined;
  return input.routeKey === input.focusedRouteKey ? undefined : HIDDEN_SCENE;
}
