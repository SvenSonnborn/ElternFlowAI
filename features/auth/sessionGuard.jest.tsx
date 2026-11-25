/**
 * Sitzungs-Guard der Familien-Queries (Spec §4 C): Ohne Sitzung ruht jede
 * Query, mit Sitzung läuft sie ohne weiteren Anstoß los. Ohne Modul-Mocks:
 * Unter jest wirft jeder Supabase-Zugriff (Proxy in `testing/jest.setup.ts`),
 * ein gelaufener `queryFn` endet deshalb im Status `error` — das ist der Beweis.
 */
import type { Session } from "@supabase/supabase-js";
import type { ReactNode } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react-native";

import { ThemeProvider } from "@/design-system/ThemeProvider";
import { useEvent, useEventTypes, useFamilyEvents } from "@/features/calendar/hooks";
import { useEventReminders } from "@/features/calendar/reminders";
import { useMealPlans, useRecipeById, useRecipes } from "@/features/meals/queries";
import { useFamilyTasks, useTaskTypes } from "@/features/tasks/queries";

import { useSessionStore } from "./session";

const SESSION = { user: { id: "u1" } } as Session;
const MONTH = new Date(2026, 5, 1);

const HOOKS: [string, () => unknown][] = [
  ["useFamilyEvents", () => useFamilyEvents(MONTH)],
  ["useEvent", () => useEvent("e1")],
  ["useEventTypes", () => useEventTypes()],
  ["useEventReminders", () => useEventReminders("e1")],
  ["useFamilyTasks", () => useFamilyTasks()],
  ["useTaskTypes", () => useTaskTypes()],
  ["useMealPlans", () => useMealPlans(MONTH)],
  ["useRecipeById", () => useRecipeById("r1")],
  ["useRecipes", () => useRecipes()],
];

/** Eigener Client ohne `onError`-Konsolenmeldung: Der Fehlerstatus ist hier erwartet. */
function setup(hook: () => unknown) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  );
  return { queryClient, render: () => renderHook(hook, { wrapper }) };
}

const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));

describe("Sitzungs-Guard", () => {
  it.each(HOOKS)("%s: ohne Sitzung kein Abruf, mit Sitzung sofort", async (_name, hook) => {
    useSessionStore.setState({ session: null, initialized: true });
    const { queryClient, render } = setup(hook);
    const view = await render();
    await settle();

    const cache = queryClient.getQueryCache();
    expect(cache.getAll().length).toBeGreaterThan(0);
    expect(
      cache.getAll().every((q) => q.state.fetchStatus === "idle" && q.state.status === "pending"),
    ).toBe(true);

    await act(() => {
      useSessionStore.setState({ session: SESSION, initialized: true });
    });
    await settle();

    expect(cache.getAll().some((q) => q.state.status === "error")).toBe(true);
    await view.unmount();
    queryClient.clear();
  });

  it("abgemeldet bleibt eine Invalidierung folgenlos", async () => {
    const { queryClient, render } = setup(() => useFamilyTasks());
    const view = await render();
    await settle();
    const query = queryClient.getQueryCache().getAll()[0];
    expect(query.state.status).toBe("error");
    const before = query.state.errorUpdateCount;

    await act(() => {
      useSessionStore.setState({ session: null, initialized: true });
    });
    await act(async () => {
      await queryClient.invalidateQueries();
    });

    expect(query.state.errorUpdateCount).toBe(before);
    await view.unmount();
    queryClient.clear();
  });
});
