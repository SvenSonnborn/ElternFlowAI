import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { addMonths, format } from "date-fns";
import { router } from "expo-router";

import type { DateTimePickerSheetProps } from "@/app-sections/shared";

import i18n from "@/features/i18n";
import { renderScreen } from "@/testing/renderScreen";

import { EventCreateScreen } from "./EventCreateScreen";

const mockCreateEvent = jest.fn();
const mockShowToast = jest.fn();
/** Zeichnet die Monate auf, mit denen der Screen die Kollisionsdaten lädt. */
const mockUseFamilyEvents = jest.fn((..._args: Date[]) => ({ data: [] }));
/** Die Props des zuletzt gerenderten Pickers; über sein `onPick` wählt ein Test den Tag. */
let mockPickerProps: DateTimePickerSheetProps | null = null;

jest.mock("@/app-sections/shared", () => ({
  ...jest.requireActual<typeof import("@/app-sections/shared")>("@/app-sections/shared"),
  useToast: () => ({ show: mockShowToast, dismiss: jest.fn() }),
  DateTimePickerSheet: (props: DateTimePickerSheetProps) => {
    mockPickerProps = props;
    return null;
  },
}));

jest.mock("@/features/auth", () => ({
  ...jest.requireActual<typeof import("@/features/auth")>("@/features/auth"),
  useCurrentParent: () => ({ data: { id: "p1", family_id: "f1" } }),
  useFamilyChildren: () => ({ data: [] }),
  useFamilyParents: () => ({ data: [] }),
}));

jest.mock("@/features/calendar", () => ({
  ...jest.requireActual<typeof import("@/features/calendar")>("@/features/calendar"),
  useCreateEvent: () => ({ mutateAsync: mockCreateEvent, isPending: false, error: null }),
  useEventTypes: () => ({ data: [{ id: "t1", slug: "family", color: "#00AA88" }] }),
  useFamilyEvents: (...args: Date[]) => mockUseFamilyEvents(...args),
}));

let mockPrevent: boolean | undefined;
const mockDisable = jest.fn();

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({}),
  router: { canGoBack: () => true, back: jest.fn(), replace: jest.fn(), push: jest.fn() },
  Stack: { Screen: () => null },
  useRoute: () => ({ key: "own-key" }),
  usePreventRemove: (prevent: boolean) => {
    mockPrevent = prevent;
    return mockDisable;
  },
}));

type RetryToast = { action: { label: string; onPress: () => void } };
type CreateVars = { id: string };

/** Rendert den Screen, tippt einen Titel und drückt Speichern. */
async function fillAndSave() {
  await renderScreen(<EventCreateScreen />);
  await fireEvent.changeText(screen.getByLabelText(i18n.t("cal.edit.fieldTitle")), "Zahnarzt");
  await fireEvent.press(screen.getByRole("button", { name: i18n.t("cal.create.save") }));
}

describe("EventCreateScreen: die id gehört zur Absicht, nicht zum Versuch", () => {
  beforeEach(() => {
    mockCreateEvent.mockReset();
    mockShowToast.mockReset();
  });

  it("Erneut versuchen schickt dieselbe id wie der gescheiterte Versuch", async () => {
    mockCreateEvent.mockRejectedValueOnce(new Error("Network request failed"));
    mockCreateEvent.mockResolvedValue(undefined);

    await fillAndSave();
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledTimes(1));
    const toast = mockShowToast.mock.calls[0][0] as RetryToast;
    expect(toast.action.label).toBe(i18n.t("action.retry"));

    await act(() => {
      toast.action.onPress();
    });

    expect(mockCreateEvent).toHaveBeenCalledTimes(2);
    const first = mockCreateEvent.mock.calls[0][0] as CreateVars;
    const second = mockCreateEvent.mock.calls[1][0] as CreateVars;
    expect(first.id).toEqual(expect.any(String));
    expect(second.id).toBe(first.id);
  });

  it("ein neues Speichern (frisch geöffneter Screen) trägt eine andere id", async () => {
    mockCreateEvent.mockResolvedValue(undefined);

    await fillAndSave();
    await screen.unmount();
    await fillAndSave();

    expect(mockCreateEvent).toHaveBeenCalledTimes(2);
    const first = mockCreateEvent.mock.calls[0][0] as CreateVars;
    const second = mockCreateEvent.mock.calls[1][0] as CreateVars;
    expect(second.id).not.toBe(first.id);
  });
});

describe("EventCreateScreen: „Titel fehlt“ erst nach Berührung", () => {
  it("zeigt „Titel fehlt“ nicht vor der ersten Eingabe", async () => {
    await renderScreen(<EventCreateScreen />);

    expect(screen.queryByText(i18n.t("cal.edit.error.titleRequired"))).toBeNull();
    expect(screen.getByRole("button", { name: i18n.t("cal.create.save") })).toBeDisabled();
  });

  it("zeigt „Titel fehlt“, nachdem der Titel geleert wurde", async () => {
    await renderScreen(<EventCreateScreen />);

    const field = screen.getAllByDisplayValue("")[0];
    await fireEvent.changeText(field, "Z");
    await fireEvent.changeText(screen.getByDisplayValue("Z"), "");

    expect(screen.getByText(i18n.t("cal.edit.error.titleRequired"))).toBeTruthy();
  });
});

describe("EventCreateScreen: Rückfrage vor dem Verwerfen", () => {
  beforeEach(() => {
    mockCreateEvent.mockReset();
    mockCreateEvent.mockResolvedValue(undefined);
    mockDisable.mockReset();
    jest.mocked(router.back).mockReset();
  });

  it("frisches Formular sperrt das Schließen nicht", async () => {
    await renderScreen(<EventCreateScreen />);
    expect(mockPrevent).toBe(false);
  });

  it("Eingabe sperrt das Schließen", async () => {
    await renderScreen(<EventCreateScreen />);
    await fireEvent.changeText(screen.getAllByDisplayValue("")[0], "Zahnarzt");
    expect(mockPrevent).toBe(true);
  });

  it("Speichern hebt die Sperre vor dem Schließen auf", async () => {
    await fillAndSave();
    expect(mockDisable).toHaveBeenCalledTimes(1);
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(mockDisable.mock.invocationCallOrder[0]).toBeLessThan(
      jest.mocked(router.back).mock.invocationCallOrder[0],
    );
  });
});

describe("EventCreateScreen: Ganztägig ist eine Bedienstelle", () => {
  it("die Zeile ist der einzige Schalter und schaltet um", async () => {
    await renderScreen(<EventCreateScreen />);
    const name = i18n.t("cal.create.fieldAllDay");

    // Der RN-Schalter in der Zeile ist verborgen und zählt nicht mit.
    expect(screen.getAllByRole("switch")).toHaveLength(1);
    const row = screen.getByRole("switch", { name });
    expect(row).not.toBeChecked();

    await fireEvent.press(row);

    expect(screen.getByRole("switch", { name })).toBeChecked();
  });
});

describe("EventCreateScreen: Kollisionsprüfung lädt bis zum Ende", () => {
  /** Rendert das Formular (Start heute 09:00) und wählt als Enddatum `day`. */
  async function pickEndDate(day: Date) {
    await renderScreen(<EventCreateScreen />);
    const endDateLabel = i18n.t("cal.edit.fieldEndDate").replace(/[()]/g, "\\$&");
    await fireEvent.press(screen.getByRole("button", { name: new RegExp(`^${endDateLabel},`) }));
    await act(() => {
      mockPickerProps?.onPick(day);
    });
  }

  it("ein Ende in einem späteren Monat kommt als zweiter Monat an", async () => {
    await pickEndDate(addMonths(new Date(), 2));

    const [first, last] = mockUseFamilyEvents.mock.calls.at(-1)!;
    expect(format(last, "yyyy-MM")).toBe(format(addMonths(new Date(), 2), "yyyy-MM"));
    expect(format(first, "yyyy-MM")).toBe(format(new Date(), "yyyy-MM"));
  });

  it("ein Ende vor dem Start kehrt das Fenster nicht um", async () => {
    await pickEndDate(addMonths(new Date(), -2));

    // Gegen einen leeren Test: Die Wahl ist angekommen, das Formular meldet sie.
    expect(screen.getByText(i18n.t("cal.edit.error.invalidDateRange"))).toBeTruthy();
    const [first, last] = mockUseFamilyEvents.mock.calls.at(-1)!;
    expect(last.getTime()).toBe(first.getTime());
  });
});
