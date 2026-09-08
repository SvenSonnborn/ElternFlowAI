import { beforeEach, describe, expect, test } from "bun:test";

import type { ShowConflictOptions } from "./conflictStore";

import { useConflictStore } from "./conflictStore";

function options(overrides: Partial<ShowConflictOptions> = {}): ShowConflictOptions {
  return {
    title: "Gleichzeitig bearbeitet",
    body: "Jemand anderes hat diesen Termin geändert.",
    rows: [{ label: "Titel", theirs: "Zahnarzt", mine: "Kieferorthopäde" }],
    keepMineLabel: "Deine Fassung speichern",
    keepTheirsLabel: "Andere Fassung behalten",
    onKeepMine: () => {},
    ...overrides,
  };
}

function head() {
  return useConflictStore.getState().queue[0] ?? null;
}

describe("conflictStore", () => {
  // Der Store liegt auf Modulebene und überlebt den einzelnen Test. Beim
  // ersetzenden Vorgänger war das folgenlos — jeder `show` warf den alten
  // Stand weg. Mit der Warteschlange blieben Einträge früherer Tests vor dem
  // Kopf stehen und jeder Test läse den falschen Dialog.
  beforeEach(() => {
    useConflictStore.setState({ queue: [] });
  });

  test("show reiht den Dialog ein und gibt seine Id zurück", () => {
    const id = useConflictStore.getState().show(options());
    expect(head()?.id).toBe(id);
  });

  test("ein zweiter Konflikt verdrängt den ersten nicht, sondern wartet", () => {
    // Ein verdrängter Eintrag nähme seinen `onKeepMine` mit: Die Eingaben des
    // Nutzers wären ersatzlos weg, ohne dass er je eine Wahl gesehen hätte —
    // genau der stille Verlust, gegen den dieses Feature gebaut ist.
    const first = useConflictStore.getState().show(options({ body: "erster" }));
    useConflictStore.getState().show(options({ body: "zweiter" }));
    expect(head()?.id).toBe(first);
    expect(useConflictStore.getState().queue).toHaveLength(2);
  });

  test("nach dem Schließen rückt der nächste nach", () => {
    const first = useConflictStore.getState().show(options({ body: "erster" }));
    useConflictStore.getState().show(options({ body: "zweiter" }));
    useConflictStore.getState().dismiss(first);
    expect(head()?.body).toBe("zweiter");
  });

  test("dismiss schließt den Dialog", () => {
    const id = useConflictStore.getState().show(options());
    useConflictStore.getState().dismiss(id);
    expect(head()).toBeNull();
  });

  test("ein dismiss aus einem wartenden Eintrag lässt den sichtbaren stehen", () => {
    // Der Nutzer wählt in A, während B schon wartet. Ein verspätetes
    // `dismiss(idB)` — etwa aus einem Handler, den B mitgebracht hat — darf A
    // nicht mitnehmen, ohne dass jemand es gesehen hat.
    const first = useConflictStore.getState().show(options({ body: "erster" }));
    const second = useConflictStore.getState().show(options({ body: "zweiter" }));
    useConflictStore.getState().dismiss(second);
    expect(head()?.id).toBe(first);
    expect(useConflictStore.getState().queue).toHaveLength(1);
  });

  test("jede Id ist neu", () => {
    const a = useConflictStore.getState().show(options());
    const b = useConflictStore.getState().show(options());
    expect(a).not.toBe(b);
  });
});
