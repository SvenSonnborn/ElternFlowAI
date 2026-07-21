// Committed counterpart to the git-ignored, Expo-generated `expo-env.d.ts`.
//
// `expo-env.d.ts` (gitignored — see .gitignore) is the only thing that pulls in
// Expo's ambient types via `/// <reference types="expo/types" />`. Those types
// provide `declare module "*.css"` (expo/types/global.d.ts) and the typed
// `process.env` (expo/types/metro-require.d.ts). CI never generates
// `expo-env.d.ts`, so without this committed reference the CI `typecheck` fails
// on `import "@/global.css"` (TS2882) and type-aware lint flags
// `process.env.EXPO_PUBLIC_*` as `any` (@typescript-eslint/no-unsafe-*).
//
// Duplicating the reference here is harmless when `expo-env.d.ts` is also present
// locally (TypeScript de-dupes), and it is the single source in CI. Do NOT edit
// `expo-env.d.ts` (Expo regenerates it) — keep this shim instead.
/// <reference types="expo/types" />
