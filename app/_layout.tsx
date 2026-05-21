import "@/global.css";
import "@/features/i18n";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useMemo } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ThemeProvider } from "@/design-system/ThemeProvider";

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
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen
                name="recipe/[id]"
                options={{ presentation: "modal", headerShown: false }}
              />
              <Stack.Screen
                name="child/[id]"
                options={{ presentation: "card", headerShown: false }}
              />
              <Stack.Screen
                name="child/new"
                options={{ presentation: "card", headerShown: false }}
              />
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
                }}
              />
              <Stack.Screen name="+not-found" options={{ presentation: "modal" }} />
            </Stack>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
