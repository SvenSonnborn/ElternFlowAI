/**
 * Gemeinsames Setup für alle `*.jest.tsx` und `*.jest.ts` (`setupFilesAfterEnv`).
 * Der Läufer ist absichtlich streng: kein Netz, keine Konsolenausgabe, keine
 * offenen Timer.
 */
import "@testing-library/react-native"; // muss vor dem Wächter unten stehen, s. dort
import { notifyManager } from "@tanstack/react-query";
import { dirname } from "node:path";
import { format } from "node:util";

// Platzhalter wie in `bun.test.preload.ts`, und wie dort unbedingt gesetzt, nie
// mit `??=`: mise lädt `.env.local` in jede aktivierte Shell, und die zeigt auf
// das LIVE-Projekt. Mit `??=` gewann die echte URL. Tests dürfen nie ein echtes
// Backend erreichen — wer eins braucht (Integrationstests gegen die lokale
// Instanz), baut seinen Client mit expliziten lokalen Werten. Der Stub unten
// ersetzt den Supabase-Client in Komponenten-Tests ohnehin; die Platzhalter
// sind die zweite Linie, falls ein Modul an ihm vorbei `createClient` ruft.
process.env.EXPO_PUBLIC_SUPABASE_URL = "https://test.supabase.invalid";
process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";

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

// `jest-expo` ersetzt das native Modul hinter `expo-crypto` durch Stubs:
// `randomUUID()` liefert still `undefined`, und `getRandomValues()` füllt
// nichts. `newRequestId()` wiche dann auf seinen Ausweichweg aus und gäbe jedem
// Screen dieselbe Kennung aus lauter Nullen, ohne dass ein Test es merkt.
// Node's `randomUUID` und `getRandomValues` sind ebenfalls CSPRNG-gestützt, also
// dasselbe Verhalten auf beiden Wegen.
jest.mock("expo-crypto", () => ({
  ...jest.requireActual<object>("expo-crypto"),
  randomUUID: () => jest.requireActual<{ randomUUID: () => string }>("node:crypto").randomUUID(),
  getRandomValues: (array: Uint8Array) =>
    jest
      .requireActual<{ getRandomValues: (array: Uint8Array) => Uint8Array }>("node:crypto")
      .getRandomValues(array),
}));

// jest-expo mockt `react-native/asset-registry`, react-native 0.88 liefert
// `AssetRegistry` im Index aber direkt aus `src/private/assets/AssetRegistry`,
// am Mock vorbei. `expo-asset` liest es seit 58.0.16 aus dem Index, und jede
// Suite mit `@expo/vector-icons` scheitert beim Laden der Schrift mit
// „Module "1" is missing from the asset registry“. Workaround aus
// expo/expo#51834; der Pfad wird über das Paketverzeichnis aufgelöst, weil
// `exports` von react-native ihn nicht freigibt. Fällt weg, sobald jest-expo den
// Fix (expo/expo#52048) ausliefert, s. docs/TODO.md.
jest.doMock(
  require.resolve("react-native/src/private/assets/AssetRegistry", {
    paths: [dirname(require.resolve("react-native/package.json"))],
  }),
  () => ({ AssetRegistry: jest.requireMock<object>("react-native/asset-registry") }),
);

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
