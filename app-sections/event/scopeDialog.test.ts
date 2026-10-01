import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { ActionSheetIOS, Alert, Platform } from "react-native";

import { pickScope } from "./scopeDialog";
import { settleScope, useScopeSheetStore } from "./scopeSheetStore";

const LABELS = {
  title: "Welche Termine?",
  this: "Nur diesen",
  forward: "Diesen und folgende",
  all: "Alle",
  cancel: "Abbrechen",
};

beforeEach(() => {
  useScopeSheetStore.setState({ current: null });
});

afterEach(() => {
  Object.assign(Platform, { OS: "web" });
  useScopeSheetStore.setState({ current: null });
});

/** Liest die offene Anfrage und scheitert lesbar, falls keine offen ist. */
function openRequest() {
  const { current } = useScopeSheetStore.getState();
  if (!current) throw new Error("keine offene Scope-Anfrage");
  return current;
}

describe.each(["web", "android"] as const)("pickScope (%s)", (os) => {
  test("landet im Store und liefert die dort getroffene Auswahl", async () => {
    Object.assign(Platform, { OS: os });
    const alertSpy = spyOn(Alert, "alert");
    const actionSheetSpy = spyOn(ActionSheetIOS, "showActionSheetWithOptions");

    const promise = pickScope(LABELS);

    expect(openRequest().labels).toEqual(LABELS);
    settleScope(openRequest().id, "this");

    expect(await promise).toBe("this");
    expect(alertSpy).not.toHaveBeenCalled();
    expect(actionSheetSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
    actionSheetSpy.mockRestore();
  });

  test("liefert null bei Abbruch", async () => {
    Object.assign(Platform, { OS: os });

    const promise = pickScope(LABELS);
    settleScope(openRequest().id, null);

    expect(await promise).toBeNull();
  });
});

describe("pickScope (ios)", () => {
  test("zeigt das native ActionSheet mit vier Optionen, Abbrechen zuletzt", () => {
    Object.assign(Platform, { OS: "ios" });
    const spy = spyOn(ActionSheetIOS, "showActionSheetWithOptions");

    void pickScope(LABELS);

    const [options] = spy.mock.calls[0];
    expect(options.title).toBe(LABELS.title);
    expect(options.options).toEqual([LABELS.this, LABELS.forward, LABELS.all, LABELS.cancel]);
    expect(options.cancelButtonIndex).toBe(3);
    spy.mockRestore();
  });

  test.each([
    [0, "this"],
    [1, "forward"],
    [2, "all"],
    [3, null],
  ] as const)("Index %i liefert %p und der Store bleibt leer", async (index, expected) => {
    Object.assign(Platform, { OS: "ios" });
    const spy = spyOn(ActionSheetIOS, "showActionSheetWithOptions");

    const promise = pickScope(LABELS);
    const [, callback] = spy.mock.calls[0];
    callback(index);

    expect(await promise).toBe(expected);
    expect(useScopeSheetStore.getState().current).toBeNull();
    spy.mockRestore();
  });
});
