/**
 * Gemeinsames Setup für alle `*.jest.tsx` (`setupFilesAfterEnv`). Der Läufer ist
 * absichtlich streng: kein Netz, keine Konsolenausgabe, keine offenen Timer.
 */
import "@testing-library/react-native"; // muss vor dem Wächter unten stehen, s. dort
import { notifyManager } from "@tanstack/react-query";
import { format } from "node:util";

// Platzhalter wie in `bun.test.preload.ts` — der Supabase-Client wird in
// Komponenten-Tests ohnehin durch den Stub unten ersetzt.
process.env.EXPO_PUBLIC_SUPABASE_URL ??= "https://test.supabase.invalid";
process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= "sb_publishable_test";

jest.mock("@react-native-async-storage/async-storage", () =>
  jest.requireActual<object>("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

// Jede String-Eigenschaft außer `then` wirft beim Lesen: ein Test, der Supabase
// berührt, scheitert laut, statt still ein echtes Netz oder den Auto-Refresh-Timer
// des echten Clients zu starten. `then` bleibt frei, damit der Stub awaitbar bleibt.
// Der Barrel re-exportiert `./client`; beide Pfade bekommen denselben Stub.
const mockSupabaseStub = () => ({
  supabase: new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop === "string" && prop !== "then") {
          throw new Error(
            `supabase.${prop} wurde gelesen: Komponenten-Tests haben kein Netz. Daten gehören in den QueryClient oder in einen Mock der Mutation.`,
          );
        }
        return undefined;
      },
    },
  ),
});
jest.mock("@/features/supabase", () => mockSupabaseStub());
jest.mock("@/features/supabase/client", () => mockSupabaseStub());

// React Query bündelt Benachrichtigungen per Timer; das landet außerhalb von
// `act()` und warnt. Synchron zustellen hält React-Updates innerhalb des Tests.
notifyManager.setScheduler((cb) => cb());

let consoleCalls: string[] = [];

beforeEach(() => {
  consoleCalls = [];
  const record =
    (level: string) =>
    (...args: unknown[]) => {
      consoleCalls.push(`console.${level}: ${format(...args)}`);
    };
  jest.spyOn(console, "error").mockImplementation(record("error"));
  jest.spyOn(console, "warn").mockImplementation(record("warn"));
});

// Konsolen-Wächter: eine Warnung (`act()`, fehlender Key, Deprecation …) lässt
// den Test scheitern. Ausnahmen nur hier, mit Quelle im Kommentar. Aktuell keine.
// jest-circus führt Root-`afterEach`-Hooks in Definitionsreihenfolge aus; der
// Import von RNTL ganz oben meldet dessen Auto-Cleanup (Unmount) vor diesem
// Wächter an, damit Konsolenausgaben aus Effect-Cleanups noch erfasst werden.
// Wer eine Fehlerausgabe bewusst erwartet, schaltet sie mit
// `jest.spyOn(console, "error").mockImplementation(() => {})` stumm.
afterEach(() => {
  jest.restoreAllMocks();
  if (consoleCalls.length > 0) {
    const messages = consoleCalls.join("\n");
    consoleCalls = [];
    throw new Error(`Der Test hat in die Konsole geschrieben:\n${messages}`);
  }
});
