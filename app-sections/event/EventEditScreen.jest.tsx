import { act, fireEvent, screen } from "@testing-library/react-native";

import type { EventWithRelations } from "@/features/calendar/expand";

import { occurrenceVersion } from "@/features/calendar";
import { calendarKeys } from "@/features/calendar/queries";
import i18n from "@/features/i18n";
import { createTestQueryClient, renderScreen } from "@/testing/renderScreen";

import { EventEditScreen } from "./EventEditScreen";

const mockUpdateEvent = jest.fn();

jest.mock("@/features/calendar", () => ({
  ...jest.requireActual<typeof import("@/features/calendar")>("@/features/calendar"),
  useUpdateEvent: () => ({ mutateAsync: mockUpdateEvent, isPending: false, error: null }),
}));

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "e1" }),
  router: { canGoBack: () => true, back: jest.fn(), replace: jest.fn(), push: jest.fn() },
  Stack: { Screen: () => null },
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
