import { beforeEach, describe, expect, test } from "bun:test";

import { requestScope, settleScope, useScopeSheetStore } from "./scopeSheetStore";

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

/** Liest die offene Anfrage und scheitert lesbar, falls keine offen ist. */
function openRequest() {
  const { current } = useScopeSheetStore.getState();
  if (!current) throw new Error("keine offene Scope-Anfrage");
  return current;
}

describe("scopeSheetStore", () => {
  test("requestScope macht die Anfrage mit ihren Labels aktuell, das Promise bleibt offen", async () => {
    let settled = false;
    void requestScope(LABELS).then(() => {
      settled = true;
    });
    await Promise.resolve();

    expect(openRequest().labels).toEqual(LABELS);
    expect(settled).toBe(false);
  });

  test("settleScope mit Scope loest das Promise auf und raeumt ab", async () => {
    const promise = requestScope(LABELS);

    settleScope(openRequest().id, "forward");

    expect(await promise).toBe("forward");
    expect(useScopeSheetStore.getState().current).toBeNull();
  });

  test("settleScope mit null liefert null", async () => {
    const promise = requestScope(LABELS);

    settleScope(openRequest().id, null);

    expect(await promise).toBeNull();
    expect(useScopeSheetStore.getState().current).toBeNull();
  });

  test("eine zweite Anfrage loest die erste mit null auf und wird aktuell", async () => {
    const first = requestScope(LABELS);
    const firstId = openRequest().id;

    let secondSettled = false;
    void requestScope({ ...LABELS, title: "Zweite" }).then(() => {
      secondSettled = true;
    });
    await Promise.resolve();

    expect(await first).toBeNull();
    expect(openRequest().id).not.toBe(firstId);
    expect(openRequest().labels.title).toBe("Zweite");
    expect(secondSettled).toBe(false);
  });

  test("settleScope mit veralteter id ist folgenlos", async () => {
    let settled = false;
    void requestScope(LABELS).then(() => {
      settled = true;
    });
    const before = openRequest();

    settleScope("stale-id", "all");
    await Promise.resolve();

    expect(useScopeSheetStore.getState().current).toBe(before);
    expect(settled).toBe(false);
  });
});
