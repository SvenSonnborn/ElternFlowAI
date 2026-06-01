import { Redirect, useSegments } from "expo-router";
import { type ReactNode } from "react";
import { View } from "react-native";

import { useTheme } from "@/design-system/ThemeProvider";

import { decideRoute, type RouteGroup } from "./decideRoute";
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

export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const parent = useCurrentParent();
  const segments = useSegments();
  const currentGroup = segmentToGroup(segments[0]);

  const target = decideRoute({
    sessionStatus: status,
    hasParent: parent.data != null,
    parentIsLoading: parent.isLoading,
    currentGroup,
  });

  if (status === "loading") return <SplashFallback />;
  if (status === "authenticated" && parent.isLoading) return <SplashFallback />;
  if (target) return <Redirect href={target as never} />;
  return <>{children}</>;
}
