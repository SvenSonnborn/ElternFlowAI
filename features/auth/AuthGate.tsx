import { Redirect, useSegments } from "expo-router";
import { type ReactNode, useState } from "react";
import { Platform, StyleSheet, View, type ViewProps } from "react-native";

import { useTheme } from "@/design-system/ThemeProvider";

import { decideRoute, segmentToGroup } from "./decideRoute";
import { gateLayout } from "./gateLayout";
import { useSession } from "./session";
import { useCurrentParent } from "./useCurrentParent";

function SplashFallback() {
  const { theme } = useTheme();
  return <View style={{ flex: 1, backgroundColor: theme.bg }} />;
}

/**
 * Dieselbe Fläche wie `SplashFallback`, aber als Deckschicht über den Kindern
 * statt an ihrer Stelle. Eine `View` fängt Taps ab — niemand tippt während des
 * Übergangs auf den alten Screen dahinter. Die Sperre für Tastatur und
 * Screenreader kommt von `GateFrame`.
 */
function GateCover() {
  const { theme } = useTheme();
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg }]} />;
}

/**
 * Sperrt den Screen unter der Deckfläche für Tastatur und Screenreader — die
 * `View` in `GateCover` fängt nur Taps ab. Nativ setzt der Container dafür
 * `aria-hidden` (RN bildet es auf `accessibilityElementsHidden` und
 * `importantForAccessibility="no-hide-descendants"` ab); auf Web schaltet er
 * `inert`. Auf Web fehlt `aria-hidden` mit Absicht: Liegt der Fokus noch im
 * versteckten Teil, warnt der Browser, und `inert` deckt Tastatur und
 * Screenreader bereits ab.
 *
 * Der Container steht auf allen Plattformen dauerhaft da und schaltet nur
 * diese Attribute: ein erst während der Deckfläche eingefügter oder
 * ausgetauschter Container würde den Navigator neu mounten (ADR-040). React
 * Natives `ViewProps` kennt `inert` nicht, react-native-web reicht das Attribut
 * aber durch — daher die Assertion. Das tut es erst ab 0.21.2, deshalb die
 * Untergrenze in `package.json`. Nebenwirkung: Auf Web bildet der Container
 * einen eigenen Stapelkontext, die Toasts aus `ToastProvider` liegen dadurch
 * während der Deckfläche unter ihr statt darüber; heute löst während des
 * Login-Übergangs kein Ablauf einen Toast aus.
 */
export function GateFrame({ covered, children }: { covered: boolean; children: ReactNode }) {
  const web = Platform.OS === "web";
  const inert = (web ? { inert: covered } : {}) as unknown as ViewProps;
  return (
    <View style={{ flex: 1 }} {...(web ? {} : { "aria-hidden": covered })} {...inert}>
      {children}
    </View>
  );
}

/**
 * Leitet je nach Sitzung und Parent-Zeile um und zeigt bis dahin den Splash.
 * Was gerendert wird, entscheidet `gateLayout` — hier steht nur der Renderer
 * dazu und die Merkhilfe `navigatorMounted`.
 *
 * Der Gate hängt seine Kinder (den Root-Navigator) nach dem ersten Mount nur
 * noch aus, wenn die Sitzung fehlt: `navigatorMounted` springt einmal auf
 * `true` und nie zurück, und zwar erst, wenn `gateLayout` die Kinder
 * tatsächlich verlangt — ein Kaltstart, der noch Splash oder Redirect zeigt,
 * zählt nicht. Mit Sitzung überlebt der Navigator jeden Redirect; beim
 * Abmelden ersetzt der Redirect ihn wieder, damit kein geschützter Screen unter
 * `/login` stehen bleibt. Das Warum und die Regeln stehen an `gateLayout`.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const parent = useCurrentParent();
  const segments = useSegments();
  const currentGroup = segmentToGroup(segments[0]);
  const [navigatorMounted, setNavigatorMounted] = useState(false);

  const target = decideRoute({
    sessionStatus: status,
    hasParent: parent.data != null,
    parentIsLoading: parent.isLoading,
    currentGroup,
  });

  const layout = gateLayout({
    sessionStatus: status,
    parentIsLoading: parent.isLoading,
    target,
    navigatorMounted,
  });

  // Im Render gesetzt statt per Effekt nachgezogen (die Lint-Regel
  // `set-state-in-effect` verbietet Letzteres): React verwirft diesen Durchlauf
  // und rendert sofort erneut, mit demselben `app`-Layout — die Kinder mounten
  // dabei nur einmal. Ein abgebrochener Render verwirft auch sein Update, das
  // Merkmal springt also nie früher, als die Kinder wirklich gerendert wurden.
  if (layout.kind === "app" && !navigatorMounted) setNavigatorMounted(true);

  if (layout.kind === "splash") return <SplashFallback />;
  if (layout.kind === "redirect") return <Redirect href={layout.href} />;
  return (
    <>
      <GateFrame covered={layout.cover}>{children}</GateFrame>
      {layout.redirect ? <Redirect href={layout.redirect} /> : null}
      {layout.cover ? <GateCover /> : null}
    </>
  );
}
