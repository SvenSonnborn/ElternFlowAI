import { describe, expect, test } from "bun:test";

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

describe("conflictStore", () => {
  test("show legt den Dialog ab und gibt seine Id zurück", () => {
    const id = useConflictStore.getState().show(options());
    expect(useConflictStore.getState().current?.id).toBe(id);
  });

  test("ein zweiter Konflikt ersetzt den ersten", () => {
    // Ein Modal kann nur eines zeigen, und das jüngste Ereignis ist das, auf
    // das der Nutzer gerade reagiert — dieselbe Regel wie beim Toast-Stapel.
    useConflictStore.getState().show(options({ body: "erster" }));
    const second = useConflictStore.getState().show(options({ body: "zweiter" }));
    expect(useConflictStore.getState().current?.id).toBe(second);
    expect(useConflictStore.getState().current?.body).toBe("zweiter");
  });

  test("dismiss schließt den Dialog", () => {
    const id = useConflictStore.getState().show(options());
    useConflictStore.getState().dismiss(id);
    expect(useConflictStore.getState().current).toBeNull();
  });

  test("ein veraltetes dismiss schließt den neueren Dialog nicht", () => {
    // Der Nutzer wählt in Dialog A, während B schon steht: A's Handler ruft
    // dismiss(idA) und nähme B sonst mit weg, ohne dass jemand es gesehen hat.
    const first = useConflictStore.getState().show(options({ body: "erster" }));
    useConflictStore.getState().show(options({ body: "zweiter" }));
    useConflictStore.getState().dismiss(first);
    expect(useConflictStore.getState().current?.body).toBe("zweiter");
  });

  test("jede Id ist neu", () => {
    const a = useConflictStore.getState().show(options());
    const b = useConflictStore.getState().show(options());
    expect(a).not.toBe(b);
  });
});
