import { Redirect, useSegments } from "expo-router";
import { type ReactNode, useState } from "react";
import { Platform, StyleSheet, View, type ViewProps } from "react-native";

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
 * Übergangs auf den alten Screen dahinter. Auf Web kommt die Sperre für
 * Tastatur und Screenreader von `GateFrame`.
 */
function GateCover() {
  const { theme } = useTheme();
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg }]} />;
}

/**
 * Auf Web macht `inert` den Screen unter der Deckfläche für Tastatur und
 * Screenreader unerreichbar — die `View` in `GateCover` fängt nur Taps ab.
 * Nur Web: nativ bräuchte derselbe Container eine eigene Sichtprüfung (siehe
 * TODO). Der Container steht dauerhaft da und schaltet nur `inert`: ein erst
 * während der Deckfläche eingefügter Container würde den Navigator neu mounten
 * (ADR-040). React Natives `ViewProps` kennt `inert` nicht, react-native-web
 * reicht das Attribut aber durch — daher die Assertion.
 */
function GateFrame({ covered, children }: { covered: boolean; children: ReactNode }) {
  if (Platform.OS !== "web") return <>{children}</>;
  const inert = { inert: covered } as unknown as ViewProps;
  return (
    <View style={{ flex: 1 }} {...inert}>
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
