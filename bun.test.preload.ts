// Test-only preload for `bun test`. Mocks the `react-native` core module so
// modules that transitively import it (e.g. the Supabase client via
// AsyncStorage + `Platform`) can be loaded under Bun without choking on
// React Native's Flow-typed entry file.
//
// Production runs (Metro/Expo) never touch this preload.
import { mock } from "bun:test";

// Supabase client throws on import if these are missing. Tests don't make real
// HTTP calls, so any non-empty URL/key is enough to satisfy the boot guard.
process.env.EXPO_PUBLIC_SUPABASE_URL ??= "https://test.supabase.invalid";
process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= "sb_publishable_test";

void mock.module("react-native", () => ({
  Platform: { OS: "web", select: <T>(o: { web?: T; default?: T }) => o.web ?? o.default },
  // Needed as a named export even by modules that never call it: importing a
  // name the mocked module doesn't define is a load-time error under Bun, so
  // `features/shared/useToday.ts` cannot be imported without this. Stubbing it
  // here keeps the real hook loadable in every suite; the alternative — each
  // suite mocking `@/features/shared` — patches a project module to work
  // around a gap in this third-party one.
  AppState: {
    currentState: "active",
    addEventListener: () => ({ remove() {} }),
  },
  NativeModules: {},
  TurboModuleRegistry: { get: () => null, getEnforcing: () => ({}) },
  NativeEventEmitter: class {
    addListener() {
      return { remove() {} };
    }
    removeAllListeners() {}
  },
}));

void mock.module("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: () => Promise.resolve(null),
    setItem: () => Promise.resolve(),
    removeItem: () => Promise.resolve(),
  },
}));

// `expo-router` and `expo-linking` reach into native bridges at import time;
// stub them so modules that only need router.replace / Linking.addEventListener
// can be loaded under `bun test` without crashing.
void mock.module("expo-router", () => ({
  router: {
    replace: () => {},
    push: () => {},
    back: () => {},
  },
}));

void mock.module("expo-linking", () => ({
  getInitialURL: () => Promise.resolve(null),
  addEventListener: () => ({ remove() {} }),
}));
