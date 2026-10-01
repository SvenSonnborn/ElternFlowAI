import { Redirect, useSegments } from "expo-router";
import { type ReactNode, useState } from "react";
import { StyleSheet, View } from "react-native";

import { useTheme } from "@/design-system/ThemeProvider";

import { decideRoute, type RouteGroup } from "./decideRoute";
import { gateLayout } from "./gateLayout";
import { useSession } from "./session";
import { useCurrentParent } from "./useCurrentParent";

function segmentToGroup(segment: string | undefined): RouteGroup {
  if (segment === "(auth)") return "auth";
  if (segment === "(onboarding)") return "onboarding";
  if (segment === "(tabs)") return "tabs";
  return "other";
}

function SplashFallback() {
  const { theme } = useTheme();
  return <View style={{ flex: 1, backgroundColor: theme.bg }} />;
}

/**
 * Dieselbe Fläche wie `SplashFallback`, aber als Deckschicht über den Kindern
 * statt an ihrer Stelle. Eine `View` fängt Taps ab — niemand tippt während des
 * Übergangs auf den alten Screen dahinter.
 */
function GateCover() {
  const { theme } = useTheme();
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg }]} />;
}

/**
 * Leitet je nach Sitzung und Parent-Zeile um und zeigt bis dahin den Splash.
 * Was gerendert wird, entscheidet `gateLayout` — hier steht nur der Renderer
 * dazu und die Merkhilfe `navigatorMounted`.
 *
 * Der Gate hängt seine Kinder (den Root-Navigator) nach dem ersten Mount nie
 * wieder aus: `navigatorMounted` springt einmal auf `true` und nie zurück, und
 * zwar erst, wenn `gateLayout` die Kinder tatsächlich verlangt — ein Kaltstart,
 * der noch Splash oder Redirect zeigt, zählt nicht. Das Warum und die Regeln
 * stehen an `gateLayout`.
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
  // dabei nur einmal.
  if (layout.kind === "app" && !navigatorMounted) setNavigatorMounted(true);

  if (layout.kind === "splash") return <SplashFallback />;
  if (layout.kind === "redirect") return <Redirect href={layout.href} />;
  return (
    <>
      {children}
      {layout.redirect ? <Redirect href={layout.redirect} /> : null}
      {layout.cover ? <GateCover /> : null}
    </>
  );
}
