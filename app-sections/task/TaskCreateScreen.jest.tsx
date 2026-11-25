import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { Keyboard } from "react-native";

import type { TaskTypeRow } from "@/features/tasks";

import { useToastStore } from "@/app-sections/shared";
import i18n from "@/features/i18n";
import { taskKeys } from "@/features/tasks";
import { createTestQueryClient, renderScreen } from "@/testing/renderScreen";

import { TaskCreateScreen } from "./TaskCreateScreen";

const mockCreateTask = jest.fn();
let mockPending = false;

jest.mock("@/features/auth", () => ({
  ...jest.requireActual<typeof import("@/features/auth")>("@/features/auth"),
  useCurrentParent: () => ({ data: { id: "p1", family_id: "f1" } }),
  useFamilyChildren: () => ({ data: [] }),
}));

jest.mock("@/features/tasks", () => ({
  ...jest.requireActual<typeof import("@/features/tasks")>("@/features/tasks"),
  useCreateTask: () => ({ mutateAsync: mockCreateTask, isPending: mockPending, error: null }),
}));

let mockPrevent: boolean | undefined;
const mockDisable = jest.fn();

jest.mock("expo-router", () => ({
  router: { canGoBack: () => true, back: jest.fn(), replace: jest.fn(), push: jest.fn() },
  Stack: { Screen: () => null },
  useRoute: () => ({ key: "own-key" }),
  usePreventRemove: (prevent: boolean) => {
    mockPrevent = prevent;
    return mockDisable;
  },
}));

const taskType: TaskTypeRow = {
  id: "type-1",
  family_id: null,
  slug: "hausaufgaben",
  label: { de: "Hausaufgabe", en: "Homework" },
  icon: "book",
  color: "mint",
  created_at: "2026-09-01T00:00:00.000Z",
};

/** Rendert den Screen mit geladenen Typen, also nach der Typ-Hydration. */
async function renderLoaded() {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(taskKeys.types, [taskType]);
  await renderScreen(<TaskCreateScreen />, { queryClient });
}

describe("TaskCreateScreen: Rückfrage vor dem Verwerfen", () => {
  beforeEach(() => {
    mockCreateTask.mockReset();
    mockDisable.mockReset();
    mockPrevent = undefined;
    mockPending = false;
    useToastStore.getState().clear();
    jest.mocked(router.back).mockReset();
    jest.mocked(router.replace).mockReset();
  });

  it("frisches Formular mit geladenen Typen sperrt das Schließen nicht", async () => {
    await renderLoaded();
    expect(mockPrevent).toBe(false);
  });

  it("Titel sperrt das Schließen", async () => {
    await renderLoaded();
    await fireEvent.changeText(screen.getAllByDisplayValue("")[0], "Mathe");
    expect(mockPrevent).toBe(true);
  });

  it("Speichern hebt die Sperre vor dem Schließen auf", async () => {
    mockCreateTask.mockResolvedValue(undefined);
    await renderLoaded();
    await fireEvent.changeText(screen.getAllByDisplayValue("")[0], "Mathe");
    await fireEvent.press(screen.getByRole("button", { name: i18n.t("hw.create.save") }));
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));

    expect(mockCreateTask).toHaveBeenCalledTimes(1);
    expect(mockDisable).toHaveBeenCalledTimes(1);
    expect(mockDisable.mock.invocationCallOrder[0]).toBeLessThan(
      jest.mocked(router.back).mock.invocationCallOrder[0],
    );
    expect(mockPrevent).toBe(false);
  });

  it("zeigt „Titel fehlt“ erst nach dem Leeren", async () => {
    await renderLoaded();
    expect(screen.queryByText(i18n.t("hw.error.titleRequired"))).toBeNull();

    await fireEvent.changeText(screen.getAllByDisplayValue("")[0], "M");
    await fireEvent.changeText(screen.getByDisplayValue("M"), "");

    expect(screen.getByText(i18n.t("hw.error.titleRequired"))).toBeTruthy();
  });
});

describe("TaskCreateScreen: Sperre beim Speichern", () => {
  beforeEach(() => {
    mockCreateTask.mockReset();
    mockDisable.mockReset();
    mockPrevent = undefined;
    mockPending = false;
    useToastStore.getState().clear();
    jest.mocked(router.back).mockReset();
    jest.mocked(router.replace).mockReset();
  });

  /** Tippt einen Titel, speichert und liefert die zurückgehaltene Antwort. */
  async function saveWithHeldResult() {
    let resolve!: () => void;
    let reject!: (err: unknown) => void;
    mockCreateTask.mockReturnValue(
      new Promise<void>((res, rej) => {
        resolve = res;
        reject = rej;
      }),
    );
    await renderLoaded();
    await fireEvent.changeText(screen.getAllByDisplayValue("")[0], "Mathe");
    await fireEvent.press(screen.getByRole("button", { name: i18n.t("hw.create.save") }));
    expect(mockCreateTask).toHaveBeenCalledTimes(1);
    return { resolve, reject };
  }

  it("während des Speicherns sind Felder und „Abbrechen“ gesperrt", async () => {
    mockPending = true;
    await renderLoaded();

    expect(screen.getByRole("button", { name: i18n.t("action.cancel") })).toBeDisabled();
    expect(screen.getByLabelText(i18n.t("hw.form.fieldTitle")).props.editable).toBe(false);
    expect(mockPrevent).toBe(true);
  });

  it("Speichern schließt die Tastatur", async () => {
    const dismiss = jest.spyOn(Keyboard, "dismiss");
    mockCreateTask.mockResolvedValue(undefined);
    await renderLoaded();
    await fireEvent.changeText(screen.getAllByDisplayValue("")[0], "Mathe");
    await fireEvent.press(screen.getByRole("button", { name: i18n.t("hw.create.save") }));

    expect(dismiss).toHaveBeenCalled();
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));
    dismiss.mockRestore();
  });

  it("Erfolg nach dem Verlassen navigiert nicht", async () => {
    const { resolve } = await saveWithHeldResult();
    await screen.unmount();
    await act(() => resolve());

    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("Fehler nach dem Verlassen kommt als Toast", async () => {
    const { reject } = await saveWithHeldResult();
    await screen.unmount();
    await act(() => reject(new Error("Failed to fetch")));

    const { toasts } = useToastStore.getState();
    expect(toasts).toHaveLength(1);
    expect(toasts[0].title).toBe(i18n.t("hw.create.error.saveFailed"));
    expect(toasts[0].message).toBe(i18n.t("hw.error.network"));
  });

  it("Fehler bei stehendem Screen: kein Toast", async () => {
    const { reject } = await saveWithHeldResult();
    await act(() => reject(new Error("Failed to fetch")));

    expect(useToastStore.getState().toasts).toHaveLength(0);
  });
});
