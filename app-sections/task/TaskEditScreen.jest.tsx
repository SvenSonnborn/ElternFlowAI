import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { Alert, type AlertButton } from "react-native";

import type { TaskTypeRow, TaskWithType } from "@/features/tasks";

import i18n from "@/features/i18n";
import { usePendingDeleteStore } from "@/features/shared";
import { taskKeys } from "@/features/tasks";
import { createTestQueryClient, renderScreen } from "@/testing/renderScreen";

import { TaskEditScreen } from "./TaskEditScreen";

const mockUpdateTask = jest.fn();
const mockDeleteTask = jest.fn();

jest.mock("@/features/tasks", () => ({
  ...jest.requireActual<typeof import("@/features/tasks")>("@/features/tasks"),
  useUpdateTask: () => ({ mutateAsync: mockUpdateTask, isPending: false, error: null }),
  useDeleteTask: () => ({ mutateAsync: mockDeleteTask }),
}));

let mockPrevent: boolean | undefined;
const mockDisable = jest.fn();

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "t1" }),
  router: { canGoBack: () => true, back: jest.fn(), replace: jest.fn(), push: jest.fn() },
  Stack: { Screen: () => null },
  usePreventRemove: (prevent: boolean) => {
    mockPrevent = prevent;
    return mockDisable;
  },
}));

/** Aufgabe "Mathe Übungsblatt" in der Fassung, aus der das Formular entsteht. */
const taskA: TaskWithType = {
  id: "t1",
  family_id: "f1",
  type_id: "type-1",
  child_id: null,
  title: "Mathe Übungsblatt",
  description: null,
  subject: null,
  due_date: "2026-10-14",
  due_time: null,
  is_done: false,
  completed_at: null,
  completed_by: null,
  created_by: null,
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-10-01T08:00:00.000Z",
  task_types: null,
};

/** Die Fassung, die ein fremder Refetch nachschiebt. */
const taskB: TaskWithType = {
  ...taskA,
  title: "Mathe Übungsblatt (neu)",
  updated_at: "2026-10-01T09:00:00.000Z",
};

const taskType: TaskTypeRow = {
  id: "type-1",
  family_id: null,
  slug: "homework",
  label: { de: "Hausaufgabe", en: "Homework" },
  icon: "book",
  color: "mint",
  created_at: "2026-09-01T00:00:00.000Z",
};

type SaveVars = { taskId: string; baseVersion: string; changes: { title: string } };
type DeleteVars = { taskId: string; baseVersion: string };

/**
 * Cache wie im Betrieb nach dem ersten Laden. Der Listen-Key enthält ein Datum
 * aus `useToday()`; ihn nachzurechnen hieße, `DONE_WINDOW_DAYS` zu duplizieren,
 * und um Mitternacht entstünde ein Rennen. Deshalb kommt A über Query-Defaults
 * in die Liste, wie auch immer der Key am Ende lautet.
 */
function seededClient() {
  const queryClient = createTestQueryClient();
  queryClient.setQueryDefaults(taskKeys.familyRoot, { initialData: [taskA] });
  queryClient.setQueryData(taskKeys.types, [taskType]);
  return queryClient;
}

/** Schiebt B in die Liste und prüft, dass der Screen sie wirklich beobachtet. */
async function foreignRefetch(queryClient: ReturnType<typeof seededClient>) {
  let updated: ReturnType<typeof queryClient.setQueriesData> = [];
  await act(() => {
    updated = queryClient.setQueriesData({ queryKey: taskKeys.familyRoot }, [taskB]);
  });
  expect(updated).toHaveLength(1);
  // Gegen einen leeren Test: B muss unter dem Key liegen, den der Screen beobachtet.
  const lists = queryClient.getQueryCache().findAll({ queryKey: taskKeys.familyRoot });
  expect(lists).toHaveLength(1);
  expect(lists[0].getObserversCount()).toBeGreaterThan(0);
}

function savedVars(): SaveVars {
  expect(mockUpdateTask).toHaveBeenCalledTimes(1);
  return mockUpdateTask.mock.calls[0][0] as SaveVars;
}

/** Bestätigt den Löschdialog und führt die geplante Löschung sofort aus. */
async function confirmDeleteAndRun() {
  const alertSpy = jest.spyOn(Alert, "alert");
  await fireEvent.press(screen.getByRole("button", { name: i18n.t("hw.delete.confirmOk") }));
  expect(alertSpy).toHaveBeenCalledTimes(1);
  const buttons = alertSpy.mock.calls[0][2] as AlertButton[];
  const destructive = buttons.find((button) => button.style === "destructive");
  await act(() => {
    destructive?.onPress?.();
  });
  // Der Produktionspfad des Abmeldens: führt `run` sofort aus, ohne Fake-Timer.
  await act(() => usePendingDeleteStore.getState().flush());
}

function deletedVars(): DeleteVars {
  expect(mockDeleteTask).toHaveBeenCalledTimes(1);
  return mockDeleteTask.mock.calls[0][0] as DeleteVars;
}

describe("TaskEditScreen: baseVersion bleibt die der Hydration", () => {
  beforeEach(() => {
    mockUpdateTask.mockReset();
    mockUpdateTask.mockResolvedValue(undefined);
    mockDeleteTask.mockReset();
    mockDeleteTask.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    // Kein 5-Sekunden-Timer offen lassen, keinen Eintrag in den nächsten Test tragen.
    await act(() => usePendingDeleteStore.getState().flush());
  });

  it("Speichern, Kontrolle: baseVersion ist updated_at von A", async () => {
    const queryClient = seededClient();
    await renderScreen(<TaskEditScreen />, { queryClient });

    await fireEvent.press(screen.getByRole("button", { name: i18n.t("hw.edit.save") }));

    const vars = savedVars();
    expect(vars.taskId).toBe("t1");
    expect(vars.baseVersion).toBe(taskA.updated_at);
    expect(vars.changes.title).toBe(taskA.title);
  });

  it("Speichern nach Fremd-Refetch: baseVersion bleibt updated_at von A", async () => {
    const queryClient = seededClient();
    await renderScreen(<TaskEditScreen />, { queryClient });
    await foreignRefetch(queryClient);

    await fireEvent.press(screen.getByRole("button", { name: i18n.t("hw.edit.save") }));

    const vars = savedVars();
    expect(vars.taskId).toBe("t1");
    expect(vars.baseVersion).toBe(taskA.updated_at);
    expect(vars.baseVersion).not.toBe(taskB.updated_at);
    expect(vars.changes.title).toBe(taskA.title);
  });

  it("Löschen, Kontrolle: baseVersion ist updated_at von A", async () => {
    const queryClient = seededClient();
    await renderScreen(<TaskEditScreen />, { queryClient });

    await confirmDeleteAndRun();

    expect(deletedVars()).toEqual({ taskId: "t1", baseVersion: taskA.updated_at });
  });

  it("Löschen nach Fremd-Refetch: baseVersion bleibt updated_at von A", async () => {
    const queryClient = seededClient();
    await renderScreen(<TaskEditScreen />, { queryClient });
    await foreignRefetch(queryClient);

    await confirmDeleteAndRun();

    const vars = deletedVars();
    expect(vars).toEqual({ taskId: "t1", baseVersion: taskA.updated_at });
    expect(vars.baseVersion).not.toBe(taskB.updated_at);
  });
});

describe("TaskEditScreen: Verwerfen-Rückfrage", () => {
  beforeEach(() => {
    mockUpdateTask.mockReset();
    mockUpdateTask.mockResolvedValue(undefined);
    mockDisable.mockReset();
    jest.mocked(router.back).mockClear();
    mockPrevent = undefined;
  });

  it("hydriertes Formular sperrt nicht", async () => {
    await renderScreen(<TaskEditScreen />, { queryClient: seededClient() });
    expect(screen.getByDisplayValue("Mathe Übungsblatt")).toBeTruthy();
    expect(mockPrevent).toBe(false);
  });

  it("Titeländerung sperrt", async () => {
    await renderScreen(<TaskEditScreen />, { queryClient: seededClient() });
    await fireEvent.changeText(screen.getByDisplayValue("Mathe Übungsblatt"), "Mathe 2");
    expect(mockPrevent).toBe(true);
  });

  it("Speichern hebt die Sperre vor dem Schließen auf", async () => {
    await renderScreen(<TaskEditScreen />, { queryClient: seededClient() });
    await fireEvent.changeText(screen.getByDisplayValue("Mathe Übungsblatt"), "Mathe 2");
    await fireEvent.press(screen.getByRole("button", { name: i18n.t("hw.edit.save") }));
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));

    expect(mockDisable).toHaveBeenCalledTimes(1);
    expect(mockDisable.mock.invocationCallOrder[0]).toBeLessThan(
      jest.mocked(router.back).mock.invocationCallOrder[0],
    );
    expect(mockPrevent).toBe(false);
  });
});
