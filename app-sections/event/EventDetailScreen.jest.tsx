import { fireEvent, screen } from "@testing-library/react-native";

import type { EventWithRelations } from "@/features/calendar/expand";

import { calendarKeys } from "@/features/calendar/queries";
import i18n from "@/features/i18n";
import { createTestQueryClient, renderScreen } from "@/testing/renderScreen";

import { EventDetailScreen } from "./EventDetailScreen";

const mockToggle = jest.fn();
const mockShowAlert = jest.fn();

jest.mock("@/app-sections/shared", () => ({
  ...jest.requireActual<typeof import("@/app-sections/shared")>("@/app-sections/shared"),
  showAlert: (...args: unknown[]) => {
    mockShowAlert(...args);
  },
  useToast: () => ({ show: jest.fn(), dismiss: jest.fn() }),
}));

jest.mock("@/features/calendar", () => ({
  ...jest.requireActual<typeof import("@/features/calendar")>("@/features/calendar"),
  useEventReminders: () => ({ data: [], isPending: false, isError: false, refetch: jest.fn() }),
  useToggleReminder: () => ({ mutate: mockToggle, isPending: false }),
}));

jest.mock("@/features/auth", () => ({
  ...jest.requireActual<typeof import("@/features/auth")>("@/features/auth"),
  useCurrentParent: () => ({ data: { family_id: "f1" } }),
  useFamilyChildren: () => ({ data: [] }),
  useFamilyParents: () => ({ data: [] }),
}));

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "e1" }),
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

/** Einzeltermin "Elternabend". */
const event: EventWithRelations = {
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

describe("EventDetailScreen: Erinnerungs-Fehler", () => {
  it("zeigt eine übersetzte Meldung statt der rohen Server-Meldung", async () => {
    mockToggle.mockImplementation((_vars: unknown, opts: { onError: (err: unknown) => void }) =>
      opts.onError({ code: "42501", message: "new row violates row-level security policy" }),
    );
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(calendarKeys.one("e1"), event);
    await renderScreen(<EventDetailScreen />, { queryClient });

    // Die Zeile „24 Stunden vorher" steht vor „1 Stunde vorher".
    await fireEvent(screen.getAllByRole("switch")[0], "valueChange", true);

    expect(mockShowAlert).toHaveBeenCalledWith({
      title: i18n.t("cal.detail.reminderError"),
      body: i18n.t("cal.error.notAuthenticated"),
    });
  });
});
