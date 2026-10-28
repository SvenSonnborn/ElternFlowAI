import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";

import i18n from "@/features/i18n";
import { renderScreen } from "@/testing/renderScreen";

import { EventCreateScreen } from "./EventCreateScreen";

const mockCreateEvent = jest.fn();
const mockShowToast = jest.fn();

jest.mock("@/app-sections/shared", () => ({
  ...jest.requireActual<typeof import("@/app-sections/shared")>("@/app-sections/shared"),
  useToast: () => ({ show: mockShowToast, dismiss: jest.fn() }),
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
  useFamilyEvents: () => ({ data: [] }),
}));

let mockPrevent: boolean | undefined;
const mockDisable = jest.fn();

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({}),
  router: { canGoBack: () => true, back: jest.fn(), replace: jest.fn(), push: jest.fn() },
  Stack: { Screen: () => null },
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
  // Das Titelfeld ist das erste (noch leere) Eingabefeld des Formulars.
  await fireEvent.changeText(screen.getAllByDisplayValue("")[0], "Zahnarzt");
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
