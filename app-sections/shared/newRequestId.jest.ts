import { randomFillSync } from "node:crypto";

import { newRequestId } from "./newRequestId";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const mockRandomUUID = jest.fn<unknown, []>();
const mockGetRandomValues = jest.fn<Uint8Array, [Uint8Array]>();

// Ersetzt für diese Datei das Modul aus `testing/jest.setup.ts`: Jeder Test
// steuert selbst, ob `randomUUID` liefert, wirft oder nichts zurückgibt.
jest.mock("expo-crypto", () => ({
  randomUUID: () => mockRandomUUID(),
  getRandomValues: (array: Uint8Array) => mockGetRandomValues(array),
}));

/** Wie `crypto.randomUUID` in einem Browser ohne sicheren Kontext (plain http über die LAN-IP). */
function randomUUIDUnavailable(): never {
  throw new TypeError("crypto.randomUUID is not a function");
}

beforeEach(() => {
  mockRandomUUID.mockReset();
  mockGetRandomValues.mockReset().mockImplementation((array) => randomFillSync(array));
});

describe("newRequestId", () => {
  test("nimmt Crypto.randomUUID, wo es das gibt", () => {
    mockRandomUUID.mockReturnValue("6f1c2a52-6d2e-4c1b-9a3b-0c2d4e6f8a10");

    expect(newRequestId()).toBe("6f1c2a52-6d2e-4c1b-9a3b-0c2d4e6f8a10");
    expect(mockGetRandomValues).not.toHaveBeenCalled();
  });

  test("wirft randomUUID, entsteht eine UUID v4 aus Zufallsbytes", () => {
    mockRandomUUID.mockImplementation(randomUUIDUnavailable);

    const first = newRequestId();
    const second = newRequestId();

    expect(first).toMatch(UUID_V4);
    expect(second).toMatch(UUID_V4);
    expect(first).not.toBe(second);
  });

  test("ein randomUUID ohne Rückgabe zählt wie ein fehlendes", () => {
    mockRandomUUID.mockReturnValue(undefined);

    expect(newRequestId()).toMatch(UUID_V4);
    expect(mockGetRandomValues).toHaveBeenCalledTimes(1);
  });

  test("Version und Variante stehen unabhängig vom Zufall", () => {
    mockRandomUUID.mockImplementation(randomUUIDUnavailable);

    mockGetRandomValues.mockImplementation((array) => array.fill(0xff));
    expect(newRequestId()).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");

    mockGetRandomValues.mockImplementation((array) => array.fill(0x00));
    expect(newRequestId()).toBe("00000000-0000-4000-8000-000000000000");
  });

  test("ohne Zufallsquelle geht der Fehler weiter, statt schwach auszuweichen", () => {
    mockRandomUUID.mockImplementation(randomUUIDUnavailable);
    mockGetRandomValues.mockImplementation(() => {
      throw new Error("keine Zufallsquelle");
    });

    expect(() => newRequestId()).toThrow("keine Zufallsquelle");
  });
});
