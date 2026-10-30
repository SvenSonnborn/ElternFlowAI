import { screen } from "@testing-library/react-native";

import type { DaySegment } from "@/features/calendar";
import type { EventWithRelations } from "@/features/calendar/expand";

import { themes } from "@/design-system";
import { toDaySegments, useFamilyEvents } from "@/features/calendar";
import { expandEvents } from "@/features/calendar/expand";
import i18n from "@/features/i18n";
import { renderScreen } from "@/testing/renderScreen";

import { DashboardScreen } from "./DashboardScreen";

jest.mock("@/features/calendar", () => ({
  ...jest.requireActual<typeof import("@/features/calendar")>("@/features/calendar"),
  useFamilyEvents: jest.fn(),
}));

jest.mock("@/features/auth", () => ({
  ...jest.requireActual<typeof import("@/features/auth")>("@/features/auth"),
  useCurrentParent: () => ({ data: undefined }),
  useFamilyChildren: () => ({ data: [] }),
  useFamilyParents: () => ({ data: [] }),
  useFamilyPendingInvitations: () => ({ data: [] }),
}));

jest.mock("@/features/meals", () => ({
  ...jest.requireActual<typeof import("@/features/meals")>("@/features/meals"),
  useTodaysMeal: () => ({ entry: null, slot: "dinner", isLoading: true, error: null }),
  useRecipeJudge: () => () => null,
  useReplaceMeal: () => ({ mutate: jest.fn(), isPending: false }),
  useMealAlternative: () => ({ data: null }),
}));

jest.mock("@/features/tasks", () => ({
  ...jest.requireActual<typeof import("@/features/tasks")>("@/features/tasks"),
  useFamilyTasks: () => ({ data: [], isLoading: false, error: null }),
}));

jest.mock("@/features/shared", () => ({
  ...jest.requireActual<typeof import("@/features/shared")>("@/features/shared"),
  // Aus dem Instant des Fixtures `event` abgeleitet, damit "heute" in jeder Zone
  // auf dessen lokalem Tag liegt.
  useToday: () => {
    const d = new Date("2026-10-30T18:00:00.000Z");
    d.setHours(9, 0, 0, 0);
    return d;
  },
}));

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
}));

jest.mock("@/app-sections/shared", () => ({
  ...jest.requireActual<typeof import("@/app-sections/shared")>("@/app-sections/shared"),
  useToast: () => ({ show: jest.fn(), dismiss: jest.fn() }),
}));

/** Einzeltermin "Elternabend" heute (Fr 30.10.2026, 19:00 Berlin) als Tagessegment. */
const event: EventWithRelations = {
  id: "e1",
  family_id: "f1",
  type_id: "t1",
  child_id: null,
  parent_id: null,
  title: "Elternabend",
  description: null,
  location: null,
  start_at: "2026-10-30T18:00:00.000Z",
  end_at: "2026-10-30T19:30:00.000Z",
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
const windowStart = new Date(2026, 9, 1);
const windowEnd = new Date(2026, 10, 7);
const segments: DaySegment[] = toDaySegments(
  expandEvents([event], windowStart, windowEnd, themes.light),
  windowStart,
  windowEnd,
);

describe("DashboardScreen: Heute-Liste", () => {
  it("Neuladen gescheitert, alte Daten da: Heute zeigt den Termin", async () => {
    const result = {
      data: [],
      segments,
      hasData: true,
      isLoading: false,
      error: new Error("offline"),
    };
    jest.mocked(useFamilyEvents).mockReturnValue(result);
    await renderScreen(<DashboardScreen />);

    expect(screen.getByText("Elternabend")).toBeTruthy();
  });

  it("Noch nie Daten: keine Liste, kein „alles ruhig“", async () => {
    const result = {
      data: [],
      segments,
      hasData: false,
      isLoading: false,
      error: null,
    };
    jest.mocked(useFamilyEvents).mockReturnValue(result);
    await renderScreen(<DashboardScreen />);

    expect(screen.queryByText("Elternabend")).toBeNull();
    expect(screen.queryByText(i18n.t("dash.today.empty"))).toBeNull();
  });

  it("Daten da, Tag leer: „alles ruhig“", async () => {
    const result = {
      data: [],
      segments: [],
      hasData: true,
      isLoading: false,
      error: null,
    };
    jest.mocked(useFamilyEvents).mockReturnValue(result);
    await renderScreen(<DashboardScreen />);

    expect(screen.getByText(i18n.t("dash.today.empty"))).toBeTruthy();
  });
});
