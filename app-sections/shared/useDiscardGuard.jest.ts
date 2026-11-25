import { act, renderHook } from "@testing-library/react-native";
import { Platform } from "react-native";

import i18n from "@/features/i18n";

import { useDiscardGuard } from "./useDiscardGuard";

let mockPrevent: boolean | undefined;
let mockCallback:
  ((options: { data: { action: unknown }; repeat: () => void }) => void) | undefined;
const mockDisable = jest.fn();
const mockConfirm = jest.fn<Promise<boolean>, [unknown]>();

jest.mock("expo-router", () => ({
  useRoute: () => ({ key: "own-key" }),
  usePreventRemove: (prevent: boolean, cb: typeof mockCallback) => {
    mockPrevent = prevent;
    mockCallback = cb;
    return mockDisable;
  },
}));

jest.mock("@/app-sections/shared/confirmDialog", () => ({
  confirmDestructive: (labels: unknown) => mockConfirm(labels),
}));

beforeAll(async () => {
  await i18n.changeLanguage("de");
});

beforeEach(() => {
  mockDisable.mockReset();
  mockConfirm.mockReset();
});

describe("useDiscardGuard", () => {
  it("sperrt nur bei geändertem Formular", async () => {
    const { rerender } = await renderHook<() => void, { dirty: boolean }>(
      ({ dirty }) => useDiscardGuard(dirty),
      {
        initialProps: { dirty: false },
      },
    );
    expect(mockPrevent).toBe(false);
    await rerender({ dirty: true });
    expect(mockPrevent).toBe(true);
  });

  it("fragt mit form.discard nach und schließt nach Bestätigung", async () => {
    mockConfirm.mockResolvedValue(true);
    const repeat = jest.fn();
    await renderHook(() => useDiscardGuard(true));
    expect(mockPrevent).toBe(true);

    await act(() => {
      mockCallback?.({ data: { action: { type: "GO_BACK" } }, repeat });
    });

    expect(mockConfirm).toHaveBeenCalledWith({
      title: i18n.t("form.discard.title"),
      body: i18n.t("form.discard.body"),
      confirm: i18n.t("form.discard.confirm"),
      cancel: i18n.t("form.discard.cancel"),
    });
    expect(repeat).toHaveBeenCalledTimes(1);
    expect(mockPrevent).toBe(false);
  });

  it("bleibt bei „Weiter bearbeiten“ offen", async () => {
    mockConfirm.mockResolvedValue(false);
    const repeat = jest.fn();
    await renderHook(() => useDiscardGuard(true));

    await act(() => {
      mockCallback?.({ data: { action: { type: "GO_BACK" } }, repeat });
    });

    expect(repeat).not.toHaveBeenCalled();
    expect(mockPrevent).toBe(true);
  });

  it("allowLeave hebt die Sperre auf", async () => {
    const { result } = await renderHook(() => useDiscardGuard(true));
    expect(mockPrevent).toBe(true);

    await act(() => {
      result.current();
    });

    expect(mockDisable).toHaveBeenCalledTimes(1);
    expect(mockPrevent).toBe(false);
  });

  describe("während des Speicherns", () => {
    const originalOS = Platform.OS;
    afterEach(() => {
      Platform.OS = originalOS;
    });

    it("sperrt beim Speichern auch ohne Änderungen", async () => {
      await renderHook(() => useDiscardGuard(false, true));
      expect(mockPrevent).toBe(true);
    });

    it("fragt beim Speichern nicht", async () => {
      const repeat = jest.fn();
      await renderHook(() => useDiscardGuard(true, true));

      await act(() => {
        mockCallback?.({ data: { action: { type: "GO_BACK" } }, repeat });
      });

      expect(mockConfirm).not.toHaveBeenCalled();
      expect(repeat).not.toHaveBeenCalled();
    });

    it("Android: Wischen der eigenen Route geht auch beim Speichern durch", async () => {
      Platform.OS = "android";
      const repeat = jest.fn();
      await renderHook(() => useDiscardGuard(true, true));

      await act(() => {
        mockCallback?.({
          data: { action: { type: "POP", payload: { count: 1 }, source: "own-key" } },
          repeat,
        });
      });

      expect(repeat).toHaveBeenCalledTimes(1);
      expect(mockConfirm).not.toHaveBeenCalled();
    });

    it("nach dem Speichern fragt ein geändertes Formular wieder", async () => {
      mockConfirm.mockResolvedValue(false);
      const { rerender } = await renderHook<() => void, { saving: boolean }>(
        ({ saving }) => useDiscardGuard(true, saving),
        { initialProps: { saving: true } },
      );
      await rerender({ saving: false });

      await act(() => {
        mockCallback?.({ data: { action: { type: "GO_BACK" } }, repeat: jest.fn() });
      });

      expect(mockConfirm).toHaveBeenCalledTimes(1);
    });
  });

  describe("nativer Dismiss auf Android", () => {
    const originalOS = Platform.OS;
    const nativeDismiss = { type: "POP", payload: { count: 1 }, source: "own-key" };
    afterEach(() => {
      Platform.OS = originalOS;
    });

    it("Android: Wischen der eigenen Route verwirft ohne Rückfrage", async () => {
      Platform.OS = "android";
      const repeat = jest.fn();
      await renderHook(() => useDiscardGuard(true));

      await act(() => {
        mockCallback?.({ data: { action: nativeDismiss }, repeat });
      });

      expect(mockConfirm).not.toHaveBeenCalled();
      expect(repeat).toHaveBeenCalledTimes(1);
      expect(mockPrevent).toBe(false);
    });

    it("Android: Wischen meldet onNativeDismiss vor repeat()", async () => {
      Platform.OS = "android";
      const repeat = jest.fn();
      const onNativeDismiss = jest.fn();
      await renderHook(() => useDiscardGuard(true, true, onNativeDismiss));

      await act(() => {
        mockCallback?.({ data: { action: nativeDismiss }, repeat });
      });

      expect(onNativeDismiss).toHaveBeenCalledTimes(1);
      expect(onNativeDismiss.mock.invocationCallOrder[0]).toBeLessThan(
        repeat.mock.invocationCallOrder[0],
      );
    });

    it("Android: „Abbrechen“ (GO_BACK) fragt", async () => {
      Platform.OS = "android";
      mockConfirm.mockResolvedValue(false);
      const repeat = jest.fn();
      const onNativeDismiss = jest.fn();
      await renderHook(() => useDiscardGuard(true, false, onNativeDismiss));

      await act(() => {
        mockCallback?.({ data: { action: { type: "GO_BACK" } }, repeat });
      });

      expect(mockConfirm).toHaveBeenCalledTimes(1);
      expect(repeat).not.toHaveBeenCalled();
      expect(onNativeDismiss).not.toHaveBeenCalled();
    });

    it("iOS: dieselbe POP-Aktion fragt", async () => {
      Platform.OS = "ios";
      mockConfirm.mockResolvedValue(false);
      const repeat = jest.fn();
      await renderHook(() => useDiscardGuard(true));

      await act(() => {
        mockCallback?.({ data: { action: nativeDismiss }, repeat });
      });

      expect(mockConfirm).toHaveBeenCalledTimes(1);
      expect(repeat).not.toHaveBeenCalled();
    });
  });
});
