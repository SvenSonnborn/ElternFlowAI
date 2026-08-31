import { afterEach, describe, expect, test } from "bun:test";

import { shouldFlushOnStateChange, usePendingDeleteStore } from "./pendingDeletes";

/** Der Store lebt auf Modulebene — jeder Test räumt hinter sich auf. */
afterEach(() => {
  usePendingDeleteStore.setState({ entries: [] });
});

function store() {
  return usePendingDeleteStore.getState();
}

const settle = () => new Promise((r) => setTimeout(r, 40));

describe("schedule", () => {
  test("legt einen Eintrag an und gibt seine Id zurück", () => {
    const id = store().schedule("task", { taskId: "t1" }, async () => {}, 10_000);
    expect(id).toBeTruthy();
    expect(store().entries).toHaveLength(1);
    expect(store().entries[0]).toMatchObject({ id, kind: "task", target: { taskId: "t1" } });
    store().undo(id);
  });

  test("führt `run` nach Ablauf genau einmal aus", async () => {
    let calls = 0;
    store().schedule(
      "task",
      { taskId: "t1" },
      // eslint-disable-next-line @typescript-eslint/require-await -- `run` muss Promise<void> liefern, das Stub braucht kein await
      async () => {
        calls += 1;
      },
      10,
    );
    await settle();
    expect(calls).toBe(1);
    expect(store().entries).toHaveLength(0);
  });

  test("zwei offene Löschungen stören einander nicht", async () => {
    const done: string[] = [];
    store().schedule(
      "task",
      { taskId: "a" },
      // eslint-disable-next-line @typescript-eslint/require-await -- `run` muss Promise<void> liefern, das Stub braucht kein await
      async () => {
        done.push("a");
      },
      10,
    );
    const second = store().schedule(
      "event",
      { eventId: "b" },
      // eslint-disable-next-line @typescript-eslint/require-await -- `run` muss Promise<void> liefern, das Stub braucht kein await
      async () => {
        done.push("b");
      },
      10,
    );
    expect(store().entries).toHaveLength(2);
    await settle();
    expect(done.sort()).toEqual(["a", "b"]);
    expect(second).toBeTruthy();
  });
});

describe("undo", () => {
  test("entfernt den Eintrag und verhindert, dass `run` je läuft", async () => {
    let calls = 0;
    const id = store().schedule(
      "task",
      { taskId: "t1" },
      // eslint-disable-next-line @typescript-eslint/require-await -- `run` muss Promise<void> liefern, das Stub braucht kein await
      async () => {
        calls += 1;
      },
      10,
    );
    store().undo(id);
    expect(store().entries).toHaveLength(0);
    await settle();
    expect(calls).toBe(0);
  });
});

describe("commit", () => {
  test("der Eintrag verschwindet erst, nachdem `run` gesettled ist", async () => {
    let release = () => {};
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    store().schedule("task", { taskId: "t1" }, () => blocked, 10);
    await new Promise((r) => setTimeout(r, 30));
    // `run` läuft, ist aber noch nicht durch — das Item bleibt versteckt.
    expect(store().entries).toHaveLength(1);
    release();
    await settle();
    expect(store().entries).toHaveLength(0);
  });

  test("ein fehlgeschlagenes `run` hinterlässt keinen Zombie", async () => {
    store().schedule("task", { taskId: "t1" }, () => Promise.reject(new Error("nope")), 10);
    await settle();
    expect(store().entries).toHaveLength(0);
  });
});

describe("flush", () => {
  test("führt alle offenen Löschungen sofort aus und leert die Liste", async () => {
    const done: string[] = [];
    store().schedule(
      "task",
      { taskId: "a" },
      // eslint-disable-next-line @typescript-eslint/require-await -- `run` muss Promise<void> liefern, das Stub braucht kein await
      async () => {
        done.push("a");
      },
      10_000,
    );
    store().schedule(
      "event",
      { eventId: "b" },
      // eslint-disable-next-line @typescript-eslint/require-await -- `run` muss Promise<void> liefern, das Stub braucht kein await
      async () => {
        done.push("b");
      },
      10_000,
    );
    store().flush();
    await settle();
    expect(done.sort()).toEqual(["a", "b"]);
    expect(store().entries).toHaveLength(0);
  });

  test("führt dieselbe Löschung auch bei doppeltem Aufruf nur einmal aus", async () => {
    let calls = 0;
    store().schedule(
      "task",
      { taskId: "a" },
      // eslint-disable-next-line @typescript-eslint/require-await -- `run` muss Promise<void> liefern, das Stub braucht kein await
      async () => {
        calls += 1;
      },
      10_000,
    );
    store().flush();
    store().flush();
    await settle();
    expect(calls).toBe(1);
  });
});

describe("shouldFlushOnStateChange", () => {
  test("nur `background` schließt das Fenster", () => {
    expect(shouldFlushOnStateChange("background")).toBe(true);
  });

  test("`inactive` nicht — das ist auf iOS auch das Kontrollzentrum", () => {
    expect(shouldFlushOnStateChange("inactive")).toBe(false);
    expect(shouldFlushOnStateChange("active")).toBe(false);
  });
});
