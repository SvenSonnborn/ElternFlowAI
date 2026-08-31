import { afterEach, describe, expect, spyOn, test } from "bun:test";

import { shouldFlushOnStateChange, usePendingDeleteStore } from "./pendingDeletes";

/** Der Store lebt auf Modulebene — jeder Test räumt hinter sich auf. */
afterEach(() => {
  usePendingDeleteStore.setState({ entries: [] });
});

function store() {
  return usePendingDeleteStore.getState();
}

// Warten auf eine Bedingung statt auf die Uhr: Die vorherige Fassung wartete
// pauschal 40 ms auf einen 10-ms-Timer plus Promise-Kette — der einzige
// Wall-Clock-Puffer der Suite und damit ihr einziger Flake-Kandidat, und
// `bun test` ist ein PR-Gate. Polling ist hier beidem überlegen: im Normalfall
// ist es nach einem Tick durch (die Suite bleibt schnell), und auf einem
// ausgelasteten Runner darf es bis zu einer Sekunde dauern, ohne rot zu werden.
const POLL_MS = 5;
const UNTIL_TIMEOUT_MS = 1000;

/** Wartet, bis `predicate` zutrifft — oder scheitert mit `label` im Text. */
async function until(label: string, predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + UNTIL_TIMEOUT_MS;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`Bedingung nie erreicht: ${label}`);
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

// Für die Gegenprobe — „es passiert *nichts*" lässt sich nicht erpollen, da
// bleibt nur zu warten. 250 ms gegen einen 10-ms-Timer, und nur an den zwei
// Stellen, die eine Negativaussage treffen.
const settle = () => new Promise((r) => setTimeout(r, 250));

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
    await until("Eintrag committet", () => store().entries.length === 0);
    expect(calls).toBe(1);
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
    await until("beide committet", () => done.length === 2);
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
    expect(store().undo(id)).toBe(true);
    expect(store().entries).toHaveLength(0);
    await settle();
    expect(calls).toBe(0);
  });

  test("greift nicht mehr, wenn die Löschung bereits läuft", async () => {
    let started = false;
    let release = () => {};
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const id = store().schedule(
      "task",
      { taskId: "t1" },
      () => {
        started = true;
        return blocked;
      },
      10,
    );
    await until("run gestartet", () => started);

    // Der Tap, der im selben Frame landet wie das `dismiss` aus `run`.
    expect(store().undo(id)).toBe(false);
    expect(store().entries).toHaveLength(1);

    release();
    await until("Eintrag freigegeben", () => store().entries.length === 0);
  });
});

describe("Watchdog", () => {
  test("ein `run`, das nie settelt, hält das Item nicht dauerhaft versteckt", async () => {
    const messages: string[] = [];
    const logged = spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      messages.push(String(args[0]));
    });
    try {
      // Der Captive-Portal-Fall: `fetch` resolved weder noch rejected.
      store().schedule("task", { taskId: "t1" }, () => new Promise<void>(() => {}), 10, 30);
      await until("Watchdog hat freigegeben", () => store().entries.length === 0);
      expect(messages).toEqual(["[pendingDeletes] commit timed out"]);
    } finally {
      logged.mockRestore();
    }
  });

  test("ein rechtzeitiges `run` löst ihn nicht aus", async () => {
    const messages: string[] = [];
    const logged = spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      messages.push(String(args[0]));
    });
    try {
      store().schedule(
        "task",
        { taskId: "t1" },
        () => new Promise<void>((resolve) => setTimeout(resolve, 15)),
        10,
        1000,
      );
      await until("Eintrag committet", () => store().entries.length === 0);
      expect(messages).toEqual([]);
    } finally {
      logged.mockRestore();
    }
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
    await until("Eintrag freigegeben", () => store().entries.length === 0);
  });

  test("ein fehlgeschlagenes `run` hinterlässt keinen Zombie", async () => {
    store().schedule("task", { taskId: "t1" }, () => Promise.reject(new Error("nope")), 10);
    await until("Eintrag freigegeben", () => store().entries.length === 0);
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
    await store().flush();
    expect(store().entries).toHaveLength(0);
    expect(done.sort()).toEqual(["a", "b"]);
  });

  test("das zurückgegebene Promise settelt erst, wenn die Löschungen durch sind", async () => {
    // Das ist die Zusage, auf die sich `useSignOut` verlässt: erst löschen,
    // dann abmelden. Ohne sie könnte die Session vor dem DELETE verschwinden.
    let release = () => {};
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    let finished = false;
    store().schedule(
      "task",
      { taskId: "a" },
      async () => {
        await blocked;
        finished = true;
      },
      10_000,
    );

    const flushed = store()
      .flush()
      .then(() => {
        expect(finished).toBe(true);
      });

    expect(finished).toBe(false);
    release();
    await flushed;
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
    // Beide Aufrufe starten, bevor einer settelt — nur so trifft der zweite auf
    // den `running`-Guard. Nacheinander abgewartet fände er gar keinen Eintrag
    // mehr vor und prüfte nichts.
    await Promise.all([store().flush(), store().flush()]);
    expect(store().entries).toHaveLength(0);
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
