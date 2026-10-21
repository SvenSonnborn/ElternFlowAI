/**
 * Zweiter Test-Läufer neben `bun test`: sammelt ausschließlich `*.jest.{ts,tsx}` ein,
 * also Komponenten-Tests, die `react-native` wirklich laden müssen. `bun test`
 * findet diese Dateien nie (Endung `.jest.*` passt nicht auf sein Muster).
 */
// Kopien des Repos im Arbeitsbaum (Worktrees, native Projekte) würden sonst
// Haste-Kollisionen und doppelte Treffer erzeugen.
const ignored = ["/.claude/", "/.superpowers/", "/ios/", "/android/", "/dist/", "/web-build/"];

/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/testing/jest.setup.ts"],
  testMatch: ["<rootDir>/**/*.jest.{ts,tsx}"],
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/$1" },
  modulePathIgnorePatterns: ignored.map((p) => `<rootDir>${p}`),
  testPathIgnorePatterns: ["/node_modules/", ...ignored.map((p) => `<rootDir>${p}`)],
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|nativewind|react-native-css-interop|@tanstack/react-query))",
  ],
};
