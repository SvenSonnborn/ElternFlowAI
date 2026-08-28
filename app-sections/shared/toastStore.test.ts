import { describe, expect, test } from "bun:test";

import { buildToast, enqueue, resolveDuration, type ToastEntry } from "./toastStore";

function entry(partial: Partial<ToastEntry> = {}): ToastEntry {
  return {
    id: "t1",
    title: "Termin gespeichert",
    variant: "success",
    position: "top",
    durationMs: 3200,
    ...partial,
  };
}

describe("resolveDuration", () => {
  test("uses the variant default", () => {
    expect(resolveDuration("success", false)).toBe(3200);
    expect(resolveDuration("info", false)).toBe(4500);
  });

  test("errors never auto-dismiss", () => {
    expect(resolveDuration("error", false)).toBeNull();
  });

  test("a toast carrying an action never auto-dismisses, whatever the variant", () => {
    expect(resolveDuration("success", true)).toBeNull();
    expect(resolveDuration("info", true)).toBeNull();
  });

  test("an explicit override wins over both rules", () => {
    expect(resolveDuration("success", true, 1000)).toBe(1000);
    expect(resolveDuration("error", false, 2000)).toBe(2000);
    expect(resolveDuration("success", false, null)).toBeNull();
  });
});

describe("enqueue", () => {
  test("appends to an empty stack", () => {
    expect(enqueue([], entry({ id: "a" })).map((t) => t.id)).toEqual(["a"]);
  });

  test("keeps two toasts side by side", () => {
    const list = enqueue([entry({ id: "a" })], entry({ id: "b" }));
    expect(list.map((t) => t.id)).toEqual(["a", "b"]);
  });

  test("drops the oldest once the stack is full", () => {
    const full = [entry({ id: "a" }), entry({ id: "b" })];
    expect(enqueue(full, entry({ id: "c" })).map((t) => t.id)).toEqual(["b", "c"]);
  });

  test("does not mutate the list it was given", () => {
    const list = [entry({ id: "a" })];
    enqueue(list, entry({ id: "b" }));
    expect(list.map((t) => t.id)).toEqual(["a"]);
  });
});

describe("buildToast", () => {
  test("defaults to an info toast at the top", () => {
    const t = buildToast("t9", { title: "Offline-Modus aktiv" });
    expect(t).toMatchObject({ id: "t9", variant: "info", position: "top", durationMs: 4500 });
  });

  test("carries message, action and position through", () => {
    const onPress = () => {};
    const t = buildToast("t9", {
      title: "Speichern fehlgeschlagen",
      message: "Keine Verbindung.",
      variant: "error",
      position: "bottom",
      action: { label: "Erneut versuchen", onPress },
    });
    expect(t.message).toBe("Keine Verbindung.");
    expect(t.position).toBe("bottom");
    expect(t.action?.onPress).toBe(onPress);
    expect(t.durationMs).toBeNull();
  });
});
