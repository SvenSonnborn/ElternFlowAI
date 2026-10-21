import type { ReactElement } from "react";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderResult } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ThemeProvider } from "@/design-system/ThemeProvider";
import i18n from "@/features/i18n";

/**
 * Feste Geräte-Metrik (iPhone-Maß), damit Insets nicht von der Umgebung
 * abhängen: ohne `initialMetrics` rendert `SafeAreaProvider` im Test nichts.
 */
const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/**
 * QueryClient für Tests. `staleTime`/`gcTime: Infinity` halten einen per
 * `setQueryData` vorbefüllten Cache frisch und lebendig, sodass die `queryFn`
 * nie anläuft (und kein Garbage-Collection-Timer offen bleibt); `retry: false`
 * lässt Fehler sofort sichtbar werden statt nach Backoff. React Query fängt
 * Würfe aus `queryFn`/`mutationFn` (auch den des Supabase-Stubs) still ab; die
 * Caches melden sie deshalb per `console.error`, womit der Konsolen-Wächter aus
 * `jest.setup.ts` den Test scheitern lässt, statt dass er grün bleibt.
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => console.error("Query fehlgeschlagen:", error),
    }),
    mutationCache: new MutationCache({
      onError: (error) => console.error("Mutation fehlgeschlagen:", error),
    }),
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
}

/**
 * Rendert einen Screen in den App-Providern (SafeArea → Query → Theme) mit
 * deutscher Sprache. Die Sprache wird explizit gesetzt: i18n wählt beim Import
 * aus `expo-localization`, und dessen Mock unter jest-expo meldet Englisch.
 * Ohne `options.queryClient` entsteht ein frischer Client pro Aufruf, damit
 * kein Cache von Test zu Test mitläuft.
 */
export async function renderScreen(
  ui: ReactElement,
  options: { queryClient?: QueryClient } = {},
): Promise<RenderResult & { queryClient: QueryClient }> {
  const queryClient = options.queryClient ?? createTestQueryClient();
  await i18n.changeLanguage("de");
  const result = await render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>{ui}</ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
  return Object.assign(result, { queryClient });
}
