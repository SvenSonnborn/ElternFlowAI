import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { Alert, Platform } from "react-native";

import { confirmDestructive, showAlert } from "./confirmDialog";

// Bun hat kein `window`; die Web-Zweige greifen aber genau darauf zu.
const confirmFn = mock((_msg?: string) => true);
const alertFn = mock((_msg?: string) => {});

beforeEach(() => {
  confirmFn.mockClear();
  alertFn.mockClear();
  (globalThis as { window?: unknown }).window = { confirm: confirmFn, alert: alertFn };
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  Object.assign(Platform, { OS: "web" });
});

const LABELS = { title: "T", confirm: "Ja", cancel: "Nein" };

interface AlertButton {
  text?: string;
  style?: string;
  onPress?: () => void;
}
interface AlertOptions {
  cancelable?: boolean;
  onDismiss?: () => void;
}

describe("confirmDestructive (web)", () => {
  test("zeigt Titel und Body durch eine Leerzeile getrennt und liefert true bei OK", async () => {
    confirmFn.mockReturnValueOnce(true);

    const result = await confirmDestructive({ ...LABELS, body: "B" });

    expect(confirmFn).toHaveBeenCalledTimes(1);
    expect(confirmFn).toHaveBeenCalledWith("T\n\nB");
    expect(result).toBe(true);
  });

  test("liefert false, wenn window.confirm abgelehnt wird", async () => {
    confirmFn.mockReturnValueOnce(false);

    const result = await confirmDestructive({ ...LABELS, body: "B" });

    expect(result).toBe(false);
  });

  test("zeigt ohne Body nur den Titel, ohne angehaengte Leerzeile", async () => {
    await confirmDestructive(LABELS);

    expect(confirmFn).toHaveBeenCalledTimes(1);
    expect(confirmFn).toHaveBeenCalledWith("T");
  });
});

describe("showAlert (web)", () => {
  test("zeigt Titel und Body durch eine Leerzeile getrennt", () => {
    showAlert({ title: "T", body: "B" });

    expect(alertFn).toHaveBeenCalledTimes(1);
    expect(alertFn).toHaveBeenCalledWith("T\n\nB");
  });

  test("zeigt ohne Body nur den Titel", () => {
    showAlert({ title: "T" });

    expect(alertFn).toHaveBeenCalledTimes(1);
    expect(alertFn).toHaveBeenCalledWith("T");
  });
});

describe("confirmDestructive (nativ)", () => {
  let alertSpy: ReturnType<typeof spyOn<typeof Alert, "alert">>;

  beforeEach(() => {
    Object.assign(Platform, { OS: "ios" });
    alertSpy = spyOn(Alert, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  /** Startet den Dialog und gibt Argumente von `Alert.alert` samt Ergebnis-Promise zurueck. */
  function open(body?: string) {
    const result = confirmDestructive({ ...LABELS, body });
    const [title, message, buttons, options] = alertSpy.mock.calls[0] as unknown as [
      string,
      string | undefined,
      AlertButton[],
      AlertOptions,
    ];
    return { result, title, message, buttons, options };
  }

  test("reicht Titel durch und laesst den Body weg, wenn keiner gesetzt ist", () => {
    const { title, message } = open();

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(title).toBe("T");
    expect(message).toBeUndefined();
  });

  test("reicht einen gesetzten Body durch", () => {
    const { message } = open("B");

    expect(message).toBe("B");
  });

  test("der destructive-Button loest zu true auf", async () => {
    const { result, buttons } = open();

    buttons.find((b) => b.style === "destructive")?.onPress?.();

    expect(await result).toBe(true);
  });

  test("der cancel-Button loest zu false auf", async () => {
    const { result, buttons } = open();

    buttons.find((b) => b.style === "cancel")?.onPress?.();

    expect(await result).toBe(false);
  });

  test("Wegwischen (onDismiss) loest zu false auf", async () => {
    const { result, options } = open();

    options.onDismiss?.();

    expect(await result).toBe(false);
  });
});

describe("showAlert (nativ)", () => {
  test("ruft Alert.alert mit Titel und ohne Body auf", () => {
    Object.assign(Platform, { OS: "ios" });
    const alertSpy = spyOn(Alert, "alert").mockImplementation(() => {});

    try {
      showAlert({ title: "T" });

      expect(alertSpy).toHaveBeenCalledTimes(1);
      expect(alertSpy).toHaveBeenCalledWith("T", undefined);
    } finally {
      alertSpy.mockRestore();
    }
  });
});
