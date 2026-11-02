import type { ReactNode } from "react";

import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react-native";

import { calendarKeys } from "@/features/calendar/queries";
import { createTestQueryClient } from "@/testing/renderScreen";

import type { FamilyChange } from "./normalize";
import type { RealtimeStatus } from "./status";
import type { SubscribeToFamilyChangesArgs } from "./subscribe";

import { COALESCE_WINDOW_MS } from "./coalesce";
import { reconnectInvalidationKeys } from "./dispatch";
import { DEGRADED_AFTER_MS } from "./reconnect";
import { useRealtimeStatusStore } from "./status";
import { subscribeToFamilyChanges } from "./subscribe";
import { useFamilyRealtime } from "./useFamilyRealtime";

// Der Test spielt den Kanal: Jeder Aufruf von `subscribeToFamilyChanges` legt
// einen `FakeChannel` an, über den der Test Status und Änderungen meldet und
// den Aufbau abschließt oder scheitern lässt. Die Regeln darunter (`coalesce`,
// `reconnect`, `dispatch`) laufen echt; geprüft wird ihr Zusammenspiel im Hook.
jest.mock("./subscribe", () => ({ subscribeToFamilyChanges: jest.fn() }));

let mockFamilyId: string | null = "f1";
jest.mock("@/features/auth", () => ({
  useCurrentParent: () => ({ data: mockFamilyId ? { family_id: mockFamilyId } : undefined }),
}));

interface FakeChannel {
  args: SubscribeToFamilyChangesArgs;
  cleanup: jest.Mock;
  resolve: () => void;
  reject: (error: unknown) => void;
}

let channels: FakeChannel[] = [];

beforeEach(() => {
  jest.useFakeTimers();
  mockFamilyId = "f1";
  channels = [];
  useRealtimeStatusStore.setState({ status: "idle", degraded: false, recentChanges: [] });
  jest.mocked(subscribeToFamilyChanges).mockImplementation(
    (args) =>
      new Promise((resolve, reject) => {
        const cleanup = jest.fn();
        channels.push({ args, cleanup, resolve: () => resolve(cleanup), reject });
      }),
  );
});

afterEach(() => {
  jest.useRealTimers();
});

async function mount() {
  const queryClient = createTestQueryClient();
  const invalidate = jest.spyOn(queryClient, "invalidateQueries");
  const view = await renderHook(() => useFamilyRealtime(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
  const invalidatedKeys = () => invalidate.mock.calls.map(([filters]) => filters?.queryKey);
  return { ...view, invalidatedKeys };
}

/** Schließt den Aufbau des Kanals ab und meldet ihn als abonniert. */
async function connect(channel: FakeChannel | undefined) {
  await act(() => channel?.resolve());
  await report(channel, "subscribed");
}

async function report(channel: FakeChannel | undefined, status: RealtimeStatus) {
  await act(() => channel?.args.onStatus?.(status));
}

async function send(channel: FakeChannel | undefined, rowId: string) {
  await act(() => channel?.args.onChange(eventChange(rowId)));
}

async function advance(ms: number) {
  await act(() => jest.advanceTimersByTime(ms));
}

function eventChange(rowId: string): FamilyChange {
  return { table: "events", type: "UPDATE", rowId, record: null, oldRecord: null, receivedAt: 0 };
}

const store = () => useRealtimeStatusStore.getState();

describe("useFamilyRealtime", () => {
  describe("Sammelfenster", () => {
    it("invalidiert erst nach dem Fenster, jeden Schlüssel einmal", async () => {
      const { invalidatedKeys } = await mount();
      await connect(channels[0]);

      await send(channels[0], "e1");
      await advance(100);
      await send(channels[0], "e2");
      await advance(100);
      await send(channels[0], "e1");

      // Das Fenster läuft ab der ersten Änderung: 1 ms vor seinem Ende.
      await advance(COALESCE_WINDOW_MS - 200 - 1);
      expect(invalidatedKeys()).toEqual([]);

      await advance(1);
      expect(invalidatedKeys()).toEqual([
        calendarKeys.eventsRoot,
        calendarKeys.one("e1"),
        calendarKeys.one("e2"),
      ]);
    });
  });

  describe("Offline-Hinweis", () => {
    it("erscheint, wenn der Kanal zehn Sekunden nicht steht", async () => {
      await mount();
      await report(channels[0], "subscribing");

      await advance(DEGRADED_AFTER_MS - 1);
      expect(store().degraded).toBe(false);

      await advance(1);
      expect(store().degraded).toBe(true);
    });

    it("bleibt aus, wenn der Kanal vorher steht", async () => {
      await mount();
      await report(channels[0], "subscribing");
      await advance(DEGRADED_AFTER_MS - 1);
      await connect(channels[0]);

      await advance(DEGRADED_AFTER_MS);
      expect(store().degraded).toBe(false);
    });

    // Phoenix' Rejoin-Backoff meldet einen Fehler nach den ersten Versuchen
    // alle zehn Sekunden erneut. Stellte jede Meldung die Frist neu, erschiene
    // der Hinweis bei einem dauerhaft toten Kanal nie.
    it("verlängert die Frist nicht, wenn derselbe Status erneut kommt", async () => {
      await mount();
      await connect(channels[0]);
      await report(channels[0], "error");

      await advance(DEGRADED_AFTER_MS - 1);
      await report(channels[0], "error");
      await advance(1);

      expect(store().degraded).toBe(true);
    });
  });

  describe("Nachladen nach einer Unterbrechung", () => {
    it("lädt nach dem Wiederverbinden, nicht beim ersten Abonnieren", async () => {
      const { invalidatedKeys } = await mount();
      await connect(channels[0]);
      expect(invalidatedKeys()).toEqual([]);

      await report(channels[0], "closed");
      await report(channels[0], "subscribed");

      expect(invalidatedKeys()).toEqual(reconnectInvalidationKeys());
    });
  });

  describe("Familienwechsel und Unmount", () => {
    it("ignoriert, was der alte Kanal nach dem Wechsel noch meldet", async () => {
      const { rerender, invalidatedKeys } = await mount();
      await connect(channels[0]);

      mockFamilyId = "f2";
      await rerender({});
      expect(channels[0]?.cleanup).toHaveBeenCalledTimes(1);
      expect(channels[1]?.args.familyId).toBe("f2");
      await connect(channels[1]);

      // `removeChannel` liefert `CLOSED` erst nach dem Leave-Ack aus, also
      // nach dem Cleanup des Effekts.
      await report(channels[0], "closed");
      await send(channels[0], "e1");
      await advance(DEGRADED_AFTER_MS);

      expect(store().status).toBe("subscribed");
      expect(store().degraded).toBe(false);
      expect(invalidatedKeys()).toEqual([]);
    });

    it("stellt die Frist für den neuen Kanal, auch bei gleichem Status wie zuletzt", async () => {
      const { rerender } = await mount();
      await report(channels[0], "subscribing");

      mockFamilyId = "f2";
      await rerender({});
      await report(channels[1], "subscribing");
      await advance(DEGRADED_AFTER_MS);

      expect(store().degraded).toBe(true);
    });

    it("räumt einen Kanal ab, dessen Aufbau erst nach dem Unmount fertig wird", async () => {
      const { unmount } = await mount();
      await report(channels[0], "subscribing");

      await unmount();
      await act(() => channels[0]?.resolve());

      expect(channels[0]?.cleanup).toHaveBeenCalledTimes(1);
      await advance(DEGRADED_AFTER_MS);
      expect(store().degraded).toBe(false);
    });
  });

  it("setzt nach dem Abmelden auf idle zurück und nimmt den Hinweis weg", async () => {
    const { rerender } = await mount();
    await connect(channels[0]);
    await report(channels[0], "error");
    await advance(DEGRADED_AFTER_MS);
    expect(store().degraded).toBe(true);

    mockFamilyId = null;
    await rerender({});

    expect(store().status).toBe("idle");
    expect(store().degraded).toBe(false);
    expect(channels).toHaveLength(1);
  });

  it("meldet einen gescheiterten Aufbau als Fehler und zeigt nach der Frist den Hinweis", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    await mount();

    await act(() => channels[0]?.reject(new Error("offline")));
    expect(store().status).toBe("error");
    expect(consoleError).toHaveBeenCalledTimes(1);

    await advance(DEGRADED_AFTER_MS);
    expect(store().degraded).toBe(true);
  });
});
