import "@/global.css";
import "@/features/i18n";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useMemo } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ThemeProvider, useTheme } from "@/design-system/ThemeProvider";
import { useInitSession } from "@/features/calendar";

function ThemedStack() {
  const { theme } = useTheme();
  useInitSession();
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="recipe/[id]" options={{ presentation: "modal", headerShown: false }} />
      <Stack.Screen
        name="event/[id]"
        options={{
          presentation: "formSheet",
          headerShown: false,
          gestureEnabled: true,
          sheetAllowedDetents: [0.72],
          sheetCornerRadius: 26,
          sheetGrabberVisible: true,
          contentStyle: { flex: 1, backgroundColor: theme.bg },
        }}
      />
      <Stack.Screen name="child/[id]" options={{ presentation: "card", headerShown: false }} />
      <Stack.Screen name="child/new" options={{ presentation: "card", headerShown: false }} />
      <Stack.Screen
        name="settings"
        options={{
          presentation: "formSheet",
          headerShown: false,
          gestureEnabled: true,
          sheetAllowedDetents: [0.82],
          sheetCornerRadius: 26,
          sheetGrabberVisible: true,
          sheetExpandsWhenScrolledToEdge: false,
          // Container must fill the sheet — otherwise iOS UIKit sheet animation
          // + RN flex layout race and content gets clipped/offset. Background
          // tracks the active theme so dark-mode users don't see a light flash.
          contentStyle: { flex: 1, backgroundColor: theme.bg },
        }}
      />
      <Stack.Screen name="+not-found" options={{ presentation: "modal" }} />
    </Stack>
  );
}

export default function RootLayout() {
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, staleTime: 30_000 },
        },
      }),
    [],
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <StatusBar style="auto" />
            <ThemedStack />
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
