import { act, fireEvent, screen } from "@testing-library/react-native";
import { AccessibilityInfo, NativeModules, StyleSheet, type ViewStyle } from "react-native";

import { DS } from "@/design-system";
import i18n from "@/features/i18n";
import { renderScreen } from "@/testing/renderScreen";

import type { ToastEntry, ToastPosition } from "./toastStore";

import { Toast } from "./Toast";

/** Was `Animated` einer nativen Timing-Animation mitgibt: ein Wert pro Frame bei 60 fps. */
interface NativeAnimation {
  frames: number[];
}

interface AnimationEnd {
  finished: boolean;
}

/** Signatur von `NativeAnimatedModule.startAnimatingNode`; `NativeModules` ist untypisiert. */
interface NativeAnimatedModule {
  startAnimatingNode: (
    animationId: number,
    nodeTag: number,
    config: NativeAnimation,
    end: (result: AnimationEnd) => void,
  ) => void;
}

/** `durationMs: null`, damit kein Auto-Dismiss in die Zeitmessung funkt. */
function entry(position: ToastPosition = "top"): ToastEntry {
  return { id: "t1", title: "Gespeichert", variant: "success", position, durationMs: null };
}

async function renderToast(position?: ToastPosition) {
  const onDismiss = jest.fn();
  await renderScreen(<Toast entry={entry(position)} onDismiss={onDismiss} />);
  // Die „Bewegung reduzieren“-Abfrage ist ein Promise; erst danach läuft das
  // Einblenden an.
  await act(async () => {});
  return onDismiss;
}

function hull() {
  return screen.getByTestId("toast-t1");
}

function hullStyle(): ViewStyle {
  return (StyleSheet.flatten(hull().props.style) as ViewStyle | undefined) ?? {};
}

function innerStyle(): ViewStyle {
  const inner = hull().children[0];
  if (inner == null || typeof inner === "string") throw new Error("Hülle ohne innere View");
  return (StyleSheet.flatten(inner.props.style) as ViewStyle | undefined) ?? {};
}

async function measure(height: number) {
  await fireEvent(hull(), "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width: 360, height } },
  });
}

async function tapClose() {
  await fireEvent.press(screen.getByLabelText(i18n.t("action.close")));
}

async function advance(ms: number) {
  await act(() => jest.advanceTimersByTime(ms));
}

beforeEach(() => {
  jest.useFakeTimers();
});

// Das Schein-Modul des Jest-Presets für den Native Driver.
const startAnimatingNode = jest.mocked(
  (NativeModules.NativeAnimatedModule as NativeAnimatedModule).startAnimatingNode,
);
const presetStartAnimatingNode = startAnimatingNode.getMockImplementation();

afterEach(() => {
  jest.useRealTimers();
  // Das Schein-Modul ist selbst ein `jest.fn`; `restoreAllMocks` setzt nur
  // zurück, was `spyOn` angelegt hat. Eine geänderte Implementierung bliebe
  // sonst für die folgenden Tests stehen.
  if (presetStartAnimatingNode) startAnimatingNode.mockImplementation(presetStartAnimatingNode);
});

describe("Toast: Hülle beim Ausblenden", () => {
  it("im Ruhezustand ohne feste Höhe und ohne Clipping", async () => {
    await renderToast();
    await measure(72);
    await advance(200);

    // Feste Höhe oder Clipping im Ruhezustand schnitte den Schatten ab.
    expect(hullStyle().height).toBeUndefined();
    expect(hullStyle().overflow).not.toBe("hidden");
  });

  it.each<ToastPosition>(["top", "bottom"])(
    "schrumpft beim Schließen auf Höhe 0 und frisst den Stapelabstand (%s)",
    async (position) => {
      const onDismiss = await renderToast(position);
      await measure(72);
      await advance(200);

      await tapClose();
      await advance(60);
      // Mitten im Ausblenden: Die Höhe läuft, sie springt nicht.
      expect(hullStyle().height).toBeGreaterThan(0);
      expect(hullStyle().height).toBeLessThan(72);
      // Den nativen Fade beendet das Schein-Modul des Jest-Presets schon nach
      // 16 ms; `onDismiss` wartet trotzdem auf das Schrumpfen.
      expect(onDismiss).not.toHaveBeenCalled();

      await advance(200);
      expect(hullStyle().height).toBe(0);
      expect(hullStyle().marginBottom).toBe(-DS.components.toast.stack.gap);
      expect(onDismiss).toHaveBeenCalledTimes(1);
      expect(onDismiss).toHaveBeenCalledWith("t1");
    },
  );

  it("startet das Schrumpfen bei der gemessenen Höhe und ignoriert spätere Messungen", async () => {
    await renderToast();
    await measure(72);
    await advance(200);

    await tapClose();
    // Die schrumpfende Hülle meldet selbst neue Höhen; die dürfen den Startwert
    // nicht verschieben.
    await measure(30);

    expect(hullStyle().height).toBe(72);
  });

  it("schließt ohne Messung nur per Fade", async () => {
    const onDismiss = await renderToast();
    await advance(200);

    await tapClose();
    await advance(200);

    expect(hullStyle().height).toBeUndefined();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("zweimal Schließen meldet onDismiss einmal", async () => {
    const onDismiss = await renderToast();
    await measure(72);
    await advance(200);

    await tapClose();
    await tapClose();
    await advance(200);

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("Bewegung reduzieren: kein Versatz, kein Schrumpfen, onDismiss einmal", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
    // Das Schein-Modul beendet jede native Animation nach 16 ms, gleich wie
    // lang sie ist. Hier endet sie nach ihren Frames wie auf dem Gerät — sonst
    // wäre der 120-ms-Fade nicht von einem Sprung zu unterscheiden.
    startAnimatingNode.mockImplementation((_id, _tag, config, end) => {
      setTimeout(() => end({ finished: true }), (config.frames.length - 1) * (1000 / 60));
    });
    const onDismiss = await renderToast();
    await measure(72);

    // Vor dem ersten Frame des Einblendens steht `progress` auf 0: Der Versatz
    // ist hier genau der Startwert der `outputRange`.
    expect(innerStyle().transform).toEqual([{ translateY: 0 }]);
    await advance(200);

    await tapClose();
    // Der Fade läuft 120 ms statt 0: `onDismiss` fällt weder im Tick des Taps
    // noch nach der Hälfte der Zeit.
    expect(onDismiss).not.toHaveBeenCalled();
    await advance(60);
    expect(onDismiss).not.toHaveBeenCalled();

    await advance(200);
    expect(hullStyle().height).toBeUndefined();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
