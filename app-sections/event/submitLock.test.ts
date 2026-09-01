import { describe, expect, test } from "bun:test";

import { createSubmitLock } from "./submitLock";

/**
 * Hält den Vertrag fest, gegen den `EventCreateScreen` und `EventEditScreen`
 * ihren Doppeltipp-Guard bauen (siehe Docstring in `submitLock.ts`): Der
 * frühere `!createMutation.isPending`-Guard wurde einmal schon als „nie
 * sichtbar wahr" verworfen und hat dadurch real doppelt angelegte Termine
 * zugelassen. Dieser Test schützt die Ersatzlösung — nicht `isPending`,
 * sondern eine synchrone Modul-Sperre — vor demselben Schicksal.
 */
describe("createSubmitLock", () => {
  test("der erste tryLock() sperrt, jeder weitere lehnt ab, bis unlock() läuft", () => {
    const lock = createSubmitLock();
    // Der erste Tap — der, der tatsächlich speichern darf.
    expect(lock.tryLock()).toBe(true);
    // Der zweite Tap in der Schließanimation, genau der Fall aus dem
    // Regressions-Befund (Doppeltipp legt zwei Termine an).
    expect(lock.tryLock()).toBe(false);
    // Und ein dritter, falls die Animation noch länger dauert.
    expect(lock.tryLock()).toBe(false);
  });

  test("unlock() gibt die Sperre frei, für Abbruch-Pfade vor dem eigentlichen Absenden", () => {
    const lock = createSubmitLock();
    lock.tryLock();
    lock.unlock();
    // Entspricht dem abgebrochenen Serien-Scope-Dialog in `EventEditScreen`:
    // Ein neuer Speichern-Versuch muss wieder möglich sein.
    expect(lock.tryLock()).toBe(true);
  });

  test("unlock() vor jedem tryLock() ist folgenlos", () => {
    const lock = createSubmitLock();
    lock.unlock();
    expect(lock.tryLock()).toBe(true);
  });

  test("zwei Instanzen sperren unabhängig voneinander", () => {
    const create = createSubmitLock();
    const edit = createSubmitLock();
    expect(create.tryLock()).toBe(true);
    expect(edit.tryLock()).toBe(true);
    expect(create.tryLock()).toBe(false);
    expect(edit.tryLock()).toBe(false);
  });
});
