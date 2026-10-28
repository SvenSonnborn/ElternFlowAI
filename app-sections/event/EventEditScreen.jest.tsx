import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";

import type { EditScope } from "@/features/calendar";
import type { EventWithRelations } from "@/features/calendar/expand";

import { occurrenceVersion } from "@/features/calendar";
import { calendarKeys } from "@/features/calendar/queries";
import i18n from "@/features/i18n";
import { createTestQueryClient, renderScreen } from "@/testing/renderScreen";

import { EventEditScreen } from "./EventEditScreen";

const mockUpdateEvent = jest.fn();
const mockShowToast = jest.fn();

jest.mock("@/app-sections/shared", () => ({
  ...jest.requireActual<typeof import("@/app-sections/shared")>("@/app-sections/shared"),
  useToast: () => ({ show: mockShowToast, dismiss: jest.fn() }),
}));

jest.mock("@/features/calendar", () => ({
  ...jest.requireActual<typeof import("@/features/calendar")>("@/features/calendar"),
  useUpdateEvent: () => ({ mutateAsync: mockUpdateEvent, isPending: false, error: null }),
}));

type NavState = {
  index: number;
  routes: { name: string; params?: { id: string } }[];
};

const editRoute = { name: "event/edit/[id]", params: { id: "e1" } };

/** Kalender-Tab, darüber das Detail-Sheet von e1, darüber dessen Bearbeiten-Sheet. */
function stackedOverDetail(detailId = "e1"): NavState {
  return {
    index: 2,
    routes: [{ name: "(tabs)" }, { name: "event/[id]", params: { id: detailId } }, editRoute],
  };
}

let mockNavState: NavState = stackedOverDetail();

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "e1" }),
  useNavigation: () => ({ getState: () => mockNavState }),
  router: {
    canGoBack: jest.fn(() => true),
    back: jest.fn(),
    dismiss: jest.fn(),
    dismissAll: jest.fn(),
    replace: jest.fn(),
    push: jest.fn(),
  },
  Stack: { Screen: () => null },
}));

const mockPickScope = jest.fn<Promise<EditScope | null>, []>();

jest.mock("./scopeDialog", () => ({
  pickScope: () => mockPickScope(),
}));

/** Einzeltermin "Elternabend" in der Fassung, aus der das Formular entsteht. */
const versionA: EventWithRelations = {
  id: "e1",
  family_id: "f1",
  type_id: "t1",
  child_id: null,
  parent_id: null,
  title: "Elternabend",
  description: null,
  location: null,
  start_at: "2026-10-01T17:00:00.000Z",
  end_at: "2026-10-01T18:30:00.000Z",
  all_day: false,
  timezone: "Europe/Berlin",
  rrule_freq: null,
  rrule_interval: 1,
  rrule_byweekday: null,
  rrule_count: null,
  rrule_until: null,
  created_by: null,
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-10-01T08:00:00.000Z",
  event_types: null,
  event_exceptions: [],
};

/** Die Fassung, die ein fremder Refetch nachschiebt. */
const versionB: EventWithRelations = {
  ...versionA,
  title: "Elternabend (verschoben)",
  updated_at: "2026-10-01T09:00:00.000Z",
};

/** Derselbe Termin als wöchentliche Serie: Speichern fragt nach dem Scope. */
const seriesA: EventWithRelations = { ...versionA, rrule_freq: "weekly" };

type SaveVars = {
  baseVersion: string;
  occurrenceKey: string;
  scope: string;
  changes: { title: string };
};

function savedVars(): SaveVars {
  expect(mockUpdateEvent).toHaveBeenCalledTimes(1);
  return mockUpdateEvent.mock.calls[0][0] as SaveVars;
}

describe("EventEditScreen: baseVersion bleibt die der Hydration", () => {
  beforeEach(() => {
    mockUpdateEvent.mockReset();
    mockUpdateEvent.mockResolvedValue(undefined);
  });

  it("Kontrolle: ohne Fremd-Refetch geht die Version von A ans Speichern", async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(calendarKeys.one("e1"), versionA);
    await renderScreen(<EventEditScreen />, { queryClient });

    await fireEvent.press(screen.getByRole("button", { name: i18n.t("cal.edit.save") }));

    const vars = savedVars();
    expect(vars.baseVersion).toBe(occurrenceVersion(versionA, vars.occurrenceKey));
    expect(vars.scope).toBe("all");
  });

  it("nach einem Fremd-Refetch geht weiter die Version von A ans Speichern, nicht die von B", async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(calendarKeys.one("e1"), versionA);
    await renderScreen(<EventEditScreen />, { queryClient });

    await act(() => {
      queryClient.setQueryData(calendarKeys.one("e1"), versionB);
    });
    // Gegen einen leeren Test: B muss unter dem Key liegen, den der Screen beobachtet.
    expect(
      queryClient
        .getQueryCache()
        .find({ queryKey: calendarKeys.one("e1") })
        ?.getObserversCount(),
    ).toBeGreaterThan(0);

    await fireEvent.press(screen.getByRole("button", { name: i18n.t("cal.edit.save") }));

    const vars = savedVars();
    expect(vars.baseVersion).toBe(occurrenceVersion(versionA, vars.occurrenceKey));
    expect(vars.baseVersion).not.toBe(occurrenceVersion(versionB, vars.occurrenceKey));
    expect(vars.changes.title).toBe("Elternabend");
  });
});

type RetryToast = { action: { label: string; onPress: () => void } };

describe("EventEditScreen: die Kennung gehört zur Absicht, nicht zum Versuch", () => {
  beforeEach(() => {
    mockUpdateEvent.mockReset();
    mockShowToast.mockReset();
  });

  async function renderLoaded() {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(calendarKeys.one("e1"), versionA);
    await renderScreen(<EventEditScreen />, { queryClient });
  }

  const pressSave = () =>
    fireEvent.press(screen.getByRole("button", { name: i18n.t("cal.edit.save") }));

  it("Erneut versuchen schickt dieselbe requestId wie der gescheiterte Versuch", async () => {
    mockUpdateEvent.mockRejectedValueOnce(new Error("Network request failed"));
    mockUpdateEvent.mockResolvedValue(undefined);
    await renderLoaded();

    await pressSave();
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledTimes(1));
    const toast = mockShowToast.mock.calls[0][0] as RetryToast;
    expect(toast.action.label).toBe(i18n.t("action.retry"));

    await act(() => {
      toast.action.onPress();
    });

    expect(mockUpdateEvent).toHaveBeenCalledTimes(2);
    const first = mockUpdateEvent.mock.calls[0][0] as { requestId: string };
    const second = mockUpdateEvent.mock.calls[1][0] as { requestId: string };
    expect(first.requestId).toEqual(expect.any(String));
    expect(second.requestId).toBe(first.requestId);
  });

  it("ein neues Speichern trägt eine andere requestId", async () => {
    mockUpdateEvent.mockResolvedValue(undefined);

    // Der Screen sperrt ein zweites Speichern; eine neue Absicht ist ein neu geöffneter Screen.
    await renderLoaded();
    await pressSave();
    await screen.unmount();
    await renderLoaded();
    await pressSave();

    expect(mockUpdateEvent).toHaveBeenCalledTimes(2);
    const first = mockUpdateEvent.mock.calls[0][0] as { requestId: string };
    const second = mockUpdateEvent.mock.calls[1][0] as { requestId: string };
    expect(second.requestId).not.toBe(first.requestId);
  });
});

describe("EventEditScreen: Schließen nach dem Speichern", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateEvent.mockReset();
    mockUpdateEvent.mockResolvedValue(undefined);
    mockPickScope.mockReset();
    jest.mocked(router.canGoBack).mockReturnValue(true);
    mockNavState = stackedOverDetail();
  });

  /** Speichert `row` unverändert; eine Serie beantwortet den Scope-Dialog mit `scope`. */
  async function save(row: EventWithRelations, scope?: EditScope) {
    if (scope) mockPickScope.mockResolvedValue(scope);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(calendarKeys.one("e1"), row);
    await renderScreen(<EventEditScreen />, { queryClient });
    await fireEvent.press(screen.getByRole("button", { name: i18n.t("cal.edit.save") }));
    await waitFor(() => expect(mockUpdateEvent).toHaveBeenCalledTimes(1));
  }

  it("Serie, „dieser und folgende“ schließt beide", async () => {
    await save(seriesA, "forward");

    expect(savedVars().scope).toBe("forward");
    expect(router.dismiss).toHaveBeenCalledWith(2);
    expect(router.back).not.toHaveBeenCalled();
  });

  it("Serie, „alle“ schließt beide", async () => {
    await save(seriesA, "all");

    expect(savedVars().scope).toBe("all");
    expect(router.dismiss).toHaveBeenCalledWith(2);
  });

  it("Serie, „nur diesen“ kehrt ins Detail zurück", async () => {
    await save(seriesA, "this");

    expect(savedVars().scope).toBe("this");
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.dismiss).not.toHaveBeenCalled();
  });

  it("Einzeltermin kehrt ins Detail zurück", async () => {
    await save(versionA);

    expect(mockPickScope).not.toHaveBeenCalled();
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.dismiss).not.toHaveBeenCalled();
  });

  it("Einzeltermin, dem eine Wiederholung gegeben wird, schließt beide", async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(calendarKeys.one("e1"), versionA);
    await renderScreen(<EventEditScreen />, { queryClient });
    await fireEvent.press(screen.getByText(i18n.t("cal.recur.weekly")));
    await fireEvent.press(screen.getByRole("button", { name: i18n.t("cal.edit.save") }));
    await waitFor(() => expect(mockUpdateEvent).toHaveBeenCalledTimes(1));

    expect(mockPickScope).not.toHaveBeenCalled();
    expect(router.dismiss).toHaveBeenCalledWith(2);
    expect(router.back).not.toHaveBeenCalled();
  });

  it("darunter liegt das Detail eines anderen Termins", async () => {
    mockNavState = stackedOverDetail("e2");
    await save(seriesA, "forward");

    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.dismiss).not.toHaveBeenCalled();
  });

  it("Detail ganz unten im Stack (Kaltstart, Neuladen auf Web) schließt beide und landet im Kalender", async () => {
    mockNavState = {
      index: 1,
      routes: [{ name: "event/[id]", params: { id: "e1" } }, editRoute],
    };
    await save(seriesA, "forward");

    // `dismiss(2)` ließe hier das Detail stehen: `POP` hält immer eine Route.
    expect(router.dismiss).not.toHaveBeenCalled();
    expect(router.dismissAll).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith("/(tabs)/kalender");
    // Erst bis aufs Detail schließen, dann das Detail ersetzen — umgekehrt bliebe es übrig.
    expect(jest.mocked(router.dismissAll).mock.invocationCallOrder[0]).toBeLessThan(
      jest.mocked(router.replace).mock.invocationCallOrder[0],
    );
  });

  it("Kaltstart-Deep-Link ohne Verlauf", async () => {
    mockNavState = { index: 0, routes: [editRoute] };
    jest.mocked(router.canGoBack).mockReturnValue(false);
    await save(seriesA, "forward");

    expect(router.replace).toHaveBeenCalledWith("/(tabs)/kalender");
    expect(router.dismiss).not.toHaveBeenCalled();
  });
});
