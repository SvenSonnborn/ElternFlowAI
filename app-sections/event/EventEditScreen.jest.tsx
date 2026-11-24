import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";

import type { DateTimePickerSheetProps } from "@/app-sections/shared";
import type { CalendarOccurrence, EditScope, EventChanges } from "@/features/calendar";
import type { EventWithRelations } from "@/features/calendar/expand";

import { occurrenceVersion } from "@/features/calendar";
import { calendarKeys } from "@/features/calendar/queries";
import i18n from "@/features/i18n";
import { createTestQueryClient, renderScreen } from "@/testing/renderScreen";

import { EventEditScreen } from "./EventEditScreen";

const mockUpdateEvent = jest.fn();
const mockShowToast = jest.fn();
/** Die Props des zuletzt gerenderten Pickers; über sein `onPick` wählt ein Test den Tag. */
let mockPickerProps: DateTimePickerSheetProps | null = null;
/** Was `useFamilyEvents` an Occurrences liefert; die Kollisionsprüfung liest daraus. */
let mockFamilyOccurrences: CalendarOccurrence[] = [];

jest.mock("@/app-sections/shared", () => ({
  ...jest.requireActual<typeof import("@/app-sections/shared")>("@/app-sections/shared"),
  useToast: () => ({ show: mockShowToast, dismiss: jest.fn() }),
  DateTimePickerSheet: (props: DateTimePickerSheetProps) => {
    mockPickerProps = props;
    return null;
  },
}));

jest.mock("@/features/calendar", () => ({
  ...jest.requireActual<typeof import("@/features/calendar")>("@/features/calendar"),
  useFamilyEvents: () => ({ data: mockFamilyOccurrences, segments: [], hasData: true }),
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
let mockPrevent: boolean | undefined;
const mockDisable = jest.fn();
/** Die Routen-Parameter des Bearbeiten-Sheets; ein Test setzt `occ` für eine bestimmte Occurrence. */
let mockSearchParams: { id: string; occ?: string } = { id: "e1" };

beforeEach(() => {
  mockSearchParams = { id: "e1" };
  mockFamilyOccurrences = [];
});

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockSearchParams,
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
  useRoute: () => ({ key: "own-key" }),
  usePreventRemove: (prevent: boolean) => {
    mockPrevent = prevent;
    return mockDisable;
  },
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
  changes: EventChanges;
  recurrence: { rrule_byweekday: number[] | null } | null;
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

describe("EventEditScreen: Rückfrage vor dem Verwerfen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateEvent.mockReset();
    mockUpdateEvent.mockResolvedValue(undefined);
    mockPickScope.mockReset();
    jest.mocked(router.canGoBack).mockReturnValue(true);
    mockNavState = stackedOverDetail();
    mockPrevent = undefined;
  });

  /** Rendert `row` und tippt einen anderen Titel. */
  async function renderEdited(row: EventWithRelations) {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(calendarKeys.one("e1"), row);
    await renderScreen(<EventEditScreen />, { queryClient });
    await fireEvent.changeText(screen.getByDisplayValue("Elternabend"), "Elternabend 2");
    return queryClient;
  }

  it("hydriertes Formular sperrt nicht", async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(calendarKeys.one("e1"), versionA);
    await renderScreen(<EventEditScreen />, { queryClient });
    expect(screen.getByDisplayValue("Elternabend")).toBeTruthy();
    expect(mockPrevent).toBe(false);
  });

  it("ein Fremd-Refetch nach der Hydration sperrt nicht", async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(calendarKeys.one("e1"), versionA);
    await renderScreen(<EventEditScreen />, { queryClient });

    await act(() => {
      queryClient.setQueryData(calendarKeys.one("e1"), versionB);
    });

    expect(mockPrevent).toBe(false);
  });

  it("Titeländerung sperrt", async () => {
    await renderEdited(versionA);
    expect(mockPrevent).toBe(true);
  });

  it("Termin remote gelöscht nach einer Änderung: keine Sperre mehr", async () => {
    const queryClient = await renderEdited(versionA);
    expect(mockPrevent).toBe(true);

    await act(() => {
      queryClient.setQueryData(calendarKeys.one("e1"), null);
    });

    expect(mockPrevent).toBe(false);
  });

  it("Speichern hebt die Sperre vor dem Schließen auf (router.back)", async () => {
    await renderEdited(versionA);
    await fireEvent.press(screen.getByRole("button", { name: i18n.t("cal.edit.save") }));
    await waitFor(() => expect(mockUpdateEvent).toHaveBeenCalledTimes(1));

    expect(router.back).toHaveBeenCalledTimes(1);
    expect(mockDisable).toHaveBeenCalledTimes(1);
    expect(mockDisable.mock.invocationCallOrder[0]).toBeLessThan(
      jest.mocked(router.back).mock.invocationCallOrder[0],
    );
    expect(mockPrevent).toBe(false);
  });

  it("Speichern hebt die Sperre vor dem Schließen auf (dismiss(2) über dem Detail)", async () => {
    mockPickScope.mockResolvedValue("forward");
    await renderEdited(seriesA);
    await fireEvent.press(screen.getByRole("button", { name: i18n.t("cal.edit.save") }));
    await waitFor(() => expect(mockUpdateEvent).toHaveBeenCalledTimes(1));

    expect(router.dismiss).toHaveBeenCalledWith(2);
    expect(mockDisable).toHaveBeenCalledTimes(1);
    expect(mockDisable.mock.invocationCallOrder[0]).toBeLessThan(
      jest.mocked(router.dismiss).mock.invocationCallOrder[0],
    );
    expect(mockPrevent).toBe(false);
  });

  it("Abbruch der Scope-Auswahl lässt die Sperre stehen", async () => {
    mockPickScope.mockResolvedValue(null);
    await renderEdited(seriesA);
    await fireEvent.press(screen.getByRole("button", { name: i18n.t("cal.edit.save") }));
    await waitFor(() => expect(mockPickScope).toHaveBeenCalledTimes(1));

    expect(mockUpdateEvent).not.toHaveBeenCalled();
    expect(mockDisable).not.toHaveBeenCalled();
    expect(mockPrevent).toBe(true);
  });
});

/**
 * Ganztägig am 28.10. in Auckland (UTC+13). Für jeden Leser außerhalb von UTC+13
 * beginnt der Termin an einem anderen Uhrzeit-Punkt als 00:00 — der Fall, in dem
 * „lokal derselbe Tag" und „in der Terminzone derselbe Tag" auseinanderfallen.
 */
const allDayAuckland: EventWithRelations = {
  ...versionA,
  all_day: true,
  timezone: "Pacific/Auckland",
  start_at: "2026-10-27T11:00:00.000Z",
  end_at: "2026-10-28T10:59:00.000Z",
};

describe("EventEditScreen: Ganztägig, gelesen aus einer anderen Zone", () => {
  beforeEach(() => {
    mockUpdateEvent.mockReset();
    mockUpdateEvent.mockResolvedValue(undefined);
  });

  it("ein Enddatum vor dem Start in der Terminzone sperrt das Speichern", async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(calendarKeys.one("e1"), allDayAuckland);
    await renderScreen(<EventEditScreen />, { queryClient });
    const error = i18n.t("cal.edit.error.invalidDateRange");
    expect(screen.queryByText(error)).toBeNull();

    // Ende auf den lokalen Tag des Starts: Die Uhrzeit des Endes bleibt, das Ende liegt
    // eine Minute vor dem Start — lokal derselbe Tag, in Auckland der 27. vor dem 28.
    // Der Name trägt hinter dem Label den Wert, der von der Zone des Testlaufs abhängt.
    const endDateLabel = i18n.t("cal.edit.fieldEndDate").replace(/[()]/g, "\\$&");
    await fireEvent.press(screen.getByRole("button", { name: new RegExp(`^${endDateLabel},`) }));
    await act(() => {
      mockPickerProps?.onPick(new Date(allDayAuckland.start_at));
    });

    expect(screen.getByText(error)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: i18n.t("cal.edit.save") }));
    expect(mockUpdateEvent).not.toHaveBeenCalled();
  });
});

/** Eine Occurrence in der Form, die `useFamilyEvents` liefert; Standard: familienweit, von e1. */
function occurrenceOf(over: Partial<CalendarOccurrence>): CalendarOccurrence {
  return {
    eventId: "e1",
    occurrenceKey: "2026-10-01",
    occurrenceDate: "2026-10-01",
    timezone: "Europe/Berlin",
    startAt: new Date(versionA.start_at),
    endAt: new Date(versionA.end_at),
    title: "Elternabend",
    description: null,
    location: null,
    allDay: false,
    childId: null,
    parentId: null,
    isException: false,
    isRecurring: false,
    version: "v",
    rrule: { freq: null, interval: 1, byweekday: null, count: null, until: null },
    type: { slug: "family", color: "#000", iconName: "calendar", labelDe: "", labelEn: "" },
    ...over,
  };
}

describe("EventEditScreen: Kollisionshinweis", () => {
  beforeEach(() => {
    mockFamilyOccurrences = [];
  });

  async function renderLoaded() {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(calendarKeys.one("e1"), versionA);
    await renderScreen(<EventEditScreen />, { queryClient });
  }

  it("zeigt den Kollisionshinweis bei einer echten Überschneidung", async () => {
    mockFamilyOccurrences = [
      occurrenceOf({
        eventId: "e2",
        title: "Zahnarzt",
        startAt: new Date("2026-10-01T17:30:00.000Z"),
        endAt: new Date("2026-10-01T18:00:00.000Z"),
      }),
    ];
    await renderLoaded();

    expect(screen.getByText(/Kollision mit Zahnarzt/)).toBeTruthy();
  });

  it("zeigt keinen Hinweis beim unveränderten Öffnen", async () => {
    mockFamilyOccurrences = [occurrenceOf({})];
    await renderLoaded();

    expect(screen.queryByText(/Kollision/)).toBeNull();
  });
});

/**
 * „Klavier" aus Spec B (2026-11-19): montags 16:00–17:00 in Berlin, zehnmal. Der 22.06. ist per
 * „Nur diesen" auf Dienstag, 23.06., 18:00–19:00 verschoben.
 */
const klavier: EventWithRelations = {
  ...versionA,
  title: "Musikschule",
  start_at: "2026-06-01T14:00:00.000Z",
  end_at: "2026-06-01T15:00:00.000Z",
  rrule_freq: "weekly",
  rrule_interval: 1,
  rrule_byweekday: [1],
  rrule_count: 10,
  event_exceptions: [
    {
      id: "x-2026-06-22",
      event_id: "e1",
      occurrence_date: "2026-06-22",
      action: "modified",
      override: {
        title: "Musikschule Raum 2",
        start_at: "2026-06-23T16:00:00.000Z",
        end_at: "2026-06-23T17:00:00.000Z",
      },
      created_at: "2026-06-01T00:00:00.000Z",
      updated_at: "2026-06-01T00:00:00.000Z",
    },
  ],
};

describe("EventEditScreen: Wiederholung auf einer verschobenen Occurrence", () => {
  beforeEach(() => {
    mockUpdateEvent.mockReset();
    mockUpdateEvent.mockResolvedValue(undefined);
    mockNavState = stackedOverDetail();
  });

  async function renderKlavier(occ: string) {
    mockSearchParams = { id: "e1", occ };
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(calendarKeys.one("e1"), klavier);
    await renderScreen(<EventEditScreen />, { queryClient });
  }

  /** Setzt die Anzahl und speichert; eine Regeländerung fragt nicht nach dem Scope. */
  async function saveWithCount(count: string) {
    await fireEvent.changeText(
      screen.getByLabelText(i18n.t("cal.create.fieldRecurrenceCount")),
      count,
    );
    await fireEvent.press(screen.getByRole("button", { name: i18n.t("cal.edit.save") }));
    await waitFor(() => expect(mockUpdateEvent).toHaveBeenCalledTimes(1));
  }

  it("verschobene Occurrence zeigt den Recurrence-Editor mit Wöchentlich und dem Serienende", async () => {
    await renderKlavier("2026-06-22");

    expect(screen.getByRole("radio", { name: i18n.t("cal.recur.weekly") })).toBeChecked();
    expect(screen.getByLabelText(i18n.t("cal.create.fieldRecurrenceCount"))).toHaveDisplayValue(
      "10",
    );
  });

  it("nur die Anzahl geändert: Wochentag vom Regel-Tag", async () => {
    await renderKlavier("2026-06-22");
    await saveWithCount("12");

    expect(savedVars().recurrence?.rrule_byweekday).toEqual([1]);
  });

  it("unverschobener Montag, Datum auf Mittwoch plus Anzahl: Wochentag vom Formular", async () => {
    await renderKlavier("2026-06-29");
    const startDateLabel = i18n.t("cal.edit.fieldStartDate").replace(/[()]/g, "\\$&");
    await fireEvent.press(screen.getByRole("button", { name: new RegExp(`^${startDateLabel},`) }));
    // Genau zwei Tage nach dem Start: Der Picker übernimmt das lokale Datum, die Uhrzeit bleibt.
    // So liegt der neue Start in jeder Zone des Testlaufs am Mittwoch, 01.07., 16:00 Berlin.
    await act(() => {
      mockPickerProps?.onPick(new Date("2026-07-01T14:00:00.000Z"));
    });
    await saveWithCount("12");

    expect(savedVars().recurrence?.rrule_byweekday).toEqual([3]);
  });

  it("Link ohne occ, erste Occurrence abgesagt: Wöchentlich nimmt den Tag der geöffneten", async () => {
    // Täglich ab Montag, 01.06., 16:00 Berlin; der 01.06. ist abgesagt. Ohne `occ` öffnet das
    // Sheet die erste aufgelöste Occurrence, Dienstag 02.06. — der Regel-Anker muss derselbe sein.
    const taeglich: EventWithRelations = {
      ...klavier,
      rrule_freq: "daily",
      rrule_byweekday: null,
      event_exceptions: [
        {
          id: "x-2026-06-01",
          event_id: "e1",
          occurrence_date: "2026-06-01",
          action: "cancelled",
          override: null,
          created_at: "2026-06-01T00:00:00.000Z",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
      ],
    };
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(calendarKeys.one("e1"), taeglich);
    await renderScreen(<EventEditScreen />, { queryClient });

    await fireEvent.press(screen.getByRole("radio", { name: i18n.t("cal.recur.weekly") }));
    await fireEvent.press(screen.getByRole("button", { name: i18n.t("cal.edit.save") }));
    await waitFor(() => expect(mockUpdateEvent).toHaveBeenCalledTimes(1));

    expect(savedVars().recurrence?.rrule_byweekday).toEqual([2]);
  });
});

describe("EventEditScreen: unter „Alle“ nur Geändertes in die Serie", () => {
  beforeEach(() => {
    mockUpdateEvent.mockReset();
    mockUpdateEvent.mockResolvedValue(undefined);
    mockPickScope.mockReset();
    mockNavState = stackedOverDetail();
  });

  /** Öffnet `row`; mit `occ` an dieser Occurrence, sonst an der ersten. */
  async function renderRow(row: EventWithRelations, occ?: string) {
    if (occ) mockSearchParams = { id: "e1", occ };
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(calendarKeys.one("e1"), row);
    await renderScreen(<EventEditScreen />, { queryClient });
  }

  /** Speichert; fragt der Screen nach dem Scope, antwortet er mit `scope`. */
  async function save(scope?: EditScope) {
    if (scope) mockPickScope.mockResolvedValue(scope);
    await fireEvent.press(screen.getByRole("button", { name: i18n.t("cal.edit.save") }));
    await waitFor(() => expect(mockUpdateEvent).toHaveBeenCalledTimes(1));
  }

  /** Wählt im Uhrzeit-Picker hinter dem Feld `labelKey` den Zeitpunkt `iso`. */
  async function pickTime(labelKey: string, iso: string) {
    await fireEvent.press(
      screen.getByRole("button", { name: new RegExp(`^${i18n.t(labelKey)},`) }),
    );
    await act(() => {
      mockPickerProps?.onPick(new Date(iso));
    });
  }

  it("nur die Anzahl: Master bleibt 16–17 Uhr Musikschule", async () => {
    await renderRow(klavier, "2026-06-22");
    await fireEvent.changeText(
      screen.getByLabelText(i18n.t("cal.create.fieldRecurrenceCount")),
      "12",
    );
    await save();

    expect(savedVars().changes).toEqual({
      title: "Musikschule",
      start_at: "2026-06-22T14:00:00.000Z",
      end_at: "2026-06-22T15:00:00.000Z",
      location: null,
      description: null,
    });
  });

  it("nur der Titel unter Alle", async () => {
    await renderRow(klavier, "2026-06-22");
    await fireEvent.changeText(screen.getByDisplayValue("Musikschule Raum 2"), "Klavier");
    await save("all");

    const { changes } = savedVars();
    expect(changes.title).toBe("Klavier");
    expect(changes.start_at).toBe("2026-06-22T14:00:00.000Z");
    expect(changes.end_at).toBe("2026-06-22T15:00:00.000Z");
  });

  it("Zeit 17–18 Uhr unter Alle", async () => {
    await renderRow(klavier, "2026-06-22");
    // Der Picker setzt die lokale Uhrzeit auf den lokalen Tag des Feldes. Eine Stunde früher als
    // bisher bleibt in UTC wie in Berlin derselbe Tag: 23.06., 17:00–18:00 Berlin.
    await pickTime("cal.edit.fieldStart", "2026-06-23T15:00:00.000Z");
    await pickTime("cal.edit.fieldEnd", "2026-06-23T16:00:00.000Z");
    await save("all");

    const { changes } = savedVars();
    expect(changes.start_at).toBe("2026-06-22T15:00:00.000Z");
    expect(changes.end_at).toBe("2026-06-22T16:00:00.000Z");
    expect(changes.title).toBe("Musikschule");
  });

  it("Keine Wiederholung auf verschobener Occurrence: Master am Regel-Tag mit Master-Titel", async () => {
    await renderRow(klavier, "2026-06-22");
    await fireEvent.press(screen.getByRole("radio", { name: i18n.t("cal.recur.none") }));
    // Die Regeländerung erzwingt „Alle"; der Scope-Dialog erscheint nicht.
    await save();

    const vars = savedVars();
    expect(vars.changes).toEqual({
      title: "Musikschule",
      start_at: "2026-06-22T14:00:00.000Z",
      end_at: "2026-06-22T15:00:00.000Z",
      location: null,
      description: null,
    });
    expect(vars.recurrence).toMatchObject({ rrule_freq: null });
  });

  it("Keine Wiederholung mit geänderter Zeit gilt wörtlich: bleibt am geöffneten Tag", async () => {
    await renderRow(klavier, "2026-06-22");
    await fireEvent.press(screen.getByRole("radio", { name: i18n.t("cal.recur.none") }));
    // Wie bei „Zeit 17–18 Uhr unter Alle": 23.06., 17:00–18:00 Berlin. `literal` übernimmt die
    // Formularzeiten, statt sie am Regel-Tag (22.06.) zu verankern.
    await pickTime("cal.edit.fieldStart", "2026-06-23T15:00:00.000Z");
    await pickTime("cal.edit.fieldEnd", "2026-06-23T16:00:00.000Z");
    await save();

    const vars = savedVars();
    expect(vars.changes.start_at).toBe("2026-06-23T15:00:00.000Z");
    expect(vars.changes.end_at).toBe("2026-06-23T16:00:00.000Z");
    expect(vars.recurrence).toMatchObject({ rrule_freq: null });
  });

  it("Nur diesen bleibt beim Formular", async () => {
    await renderRow(klavier, "2026-06-22");
    await fireEvent.changeText(screen.getByDisplayValue("Musikschule Raum 2"), "Klavier");
    await save("this");

    const { changes } = savedVars();
    expect(changes.start_at).toBe("2026-06-23T16:00:00.000Z");
    expect(changes.title).toBe("Klavier");
  });

  it("unverschoben, nur Titel unter Alle", async () => {
    await renderRow(seriesA);
    await fireEvent.changeText(screen.getByDisplayValue("Elternabend"), "Elternabend 2");
    await save("all");

    expect(savedVars().changes).toEqual({
      title: "Elternabend 2",
      start_at: "2026-10-01T17:00:00.000Z",
      end_at: "2026-10-01T18:30:00.000Z",
      location: null,
      description: null,
    });
  });
});
