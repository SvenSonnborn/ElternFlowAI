import { fireEvent, screen } from "@testing-library/react-native";
import { router } from "expo-router";

import type { TaskTypeRow } from "@/features/tasks";

import i18n from "@/features/i18n";
import { taskKeys } from "@/features/tasks";
import { createTestQueryClient, renderScreen } from "@/testing/renderScreen";

import { TaskCreateScreen } from "./TaskCreateScreen";

const mockCreateTask = jest.fn();

jest.mock("@/features/auth", () => ({
  ...jest.requireActual<typeof import("@/features/auth")>("@/features/auth"),
  useCurrentParent: () => ({ data: { id: "p1", family_id: "f1" } }),
  useFamilyChildren: () => ({ data: [] }),
}));

jest.mock("@/features/tasks", () => ({
  ...jest.requireActual<typeof import("@/features/tasks")>("@/features/tasks"),
  useCreateTask: () => ({ mutate: mockCreateTask, isPending: false, error: null }),
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
    jest.mocked(router.back).mockReset();
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
    mockCreateTask.mockImplementation((_vars: unknown, options: { onSuccess: () => void }) =>
      options.onSuccess(),
    );
    await renderLoaded();
    await fireEvent.changeText(screen.getAllByDisplayValue("")[0], "Mathe");
    await fireEvent.press(screen.getByRole("button", { name: i18n.t("hw.create.save") }));

    expect(mockCreateTask).toHaveBeenCalledTimes(1);
    expect(mockDisable).toHaveBeenCalledTimes(1);
    expect(router.back).toHaveBeenCalledTimes(1);
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
