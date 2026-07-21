# Design: Dependency-Update Expo SDK 54 → 57

**Datum:** 2026-07-21
**Branch:** `chore/dependency-updates`
**Status:** Design — freigegeben, Implementierungsplan folgt

## Ziel

Das Projekt von **Expo SDK 54** auf das aktuelle stabile **SDK 57** heben und
im selben Zug die Non-Expo-Dependencies aktualisieren. Danach ist die
Codebasis auf aktuellem Stand (RN 0.86, React 19.2, expo-router 57), und
künftige Updates bleiben klein statt sich zu einem weiteren 3-Major-Rückstand
aufzustauen.

## Ist-Zustand (Stand 2026-07-21)

| Paket                                                                                                               | Installiert | Neueste stabile                    |
| ------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------- |
| Expo SDK                                                                                                            | 54.0.34     | **57.0.7** (3 Majors: 54→55→56→57) |
| react-native                                                                                                        | 0.81.5      | 0.86.0                             |
| react / react-dom                                                                                                   | 19.1.0      | 19.2.7                             |
| expo-router                                                                                                         | 6.0.23      | 57.0.x (jetzt SDK-versioniert)     |
| react-native-reanimated                                                                                             | 4.1.1       | 4.5.2                              |
| Non-Expo (Supabase, tanstack, zustand, i18next, react-i18next, date-fns, rrule, react-native-calendars, nativewind) | diverse     | teils Minor/Patch hinterher        |

**Vereinfachende Rahmenbedingungen:**

1. **CNG-Workflow** — `/ios` und `/android` sind gitignored (`.gitignore`), nur
   Config-Plugins in `app.json` (`expo-router`, `expo-localization`,
   `@react-native-community/datetimepicker`). Kein nativer Code wird von Hand
   gediffed; `expo prebuild --clean` regeneriert beide Plattformen.
2. **New Architecture ist bereits aktiv** (`newArchEnabled: true` in `app.json`).
   Die größte künftige Bruchstelle ist damit schon genommen.
3. **CI** (`.github/workflows/ci.yml`) gated per PR: `format:check` → `lint` →
   `typecheck` → `test` (`bun test`) → `bunx expo export --platform web`. Kein
   nativer Build in CI. Bun `1.3.10` gepinnt.

## Getroffene Entscheidungen

| Frage                      | Entscheidung                                                                                                         |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Ziel-SDK**               | SDK 57 (latest), **stufenweise** 54→55→56→57 — nie überspringen (Expo-Empfehlung)                                    |
| **Verifikation pro Stufe** | Voll: CI-Gates + web-export + `expo-doctor` + `prebuild --clean` + **iOS- und Android-Build** + manueller Flow-Smoke |
| **Non-Expo-Deps**          | Am Ende der SDK-Kette im selben Branch mitziehen (eigener Schritt/Commits)                                           |
| **Branch/PR-Shape**        | Ein Branch `chore/dependency-updates`, ein finaler PR, **jede Stufe = eigener grüner Commit**                        |
| **Native Targets**         | iOS **und** Android bauen & smoken                                                                                   |
| **Basis**                  | Abgezweigt von `main` (hat CI-Workflows, ist der CI-Stand)                                                           |

## Wiederholbares Rezept pro SDK-Stufe (N → N+1)

Identisch für jede der drei Major-Stufen:

1. **Upgrade-Guide lesen** — `docs.expo.dev` Changelog + Breaking-Changes für
   SDK N+1 (live pro Stufe geholt; liegt nach dem Wissensstand des Assistenten).
2. **Expo bumpen:** `bun add expo@^<N+1>` → dann `bunx expo install --fix`
   (richtet **alle** Expo-/RN-Pakete auf die vom SDK gebündelten Versionen aus:
   react-native, reanimated, worklets, router, safe-area-context, screens,
   gesture-handler, expo-\* Module, react/react-dom).
3. **Dev-Deps nachziehen:** `jest-expo`, `@types/react` auf die zum SDK
   passenden Versionen (`expo install --check` / Guide).
4. **`bunx expo-doctor`** — muss sauber durchlaufen (Version-Mismatches,
   Plugin-Konflikte, ungültige `app.json`-Felder).
5. **Code-Breaking-Changes** aus dem Guide abarbeiten (API-Deprecations,
   geänderte Imports, entfernte Props).
6. **Statische Gates:** `bun run format:check && bun lint && bun run typecheck && bun test`.
7. **Web-Smoke:** `bunx expo export --platform web` (identisch zur CI).
8. **Nativer Build:** `bunx expo prebuild --clean` → iOS-Simulator-Build **und**
   Android-Emulator-Build starten.
9. **Flow-Smoke:** Auth-Login, Kalender öffnen + Termin, Essen-Tab, Voice-FAB
   sichtbar auf allen 5 Tabs (Dashboard · Kalender · Essen · Aufgaben · Familie).
10. **Docs + Commit:** betroffene Doku im selben Commit (siehe Abschnitt „Doku"),
    Conventional-Commit `chore(deps): Expo SDK N+1 …`, **ohne**
    `Co-Authored-By`-Trailer (Repo-Policy), Pre-Commit-Hooks nie mit
    `--no-verify` umgehen. `bun.lock` wird mitcommittet.

## Konkrete Stufen (= Commit-Kette)

- **Stufe 0 — Baseline:** SDK-54-Patches (54.0.34 → 54.0.36) + `expo install --fix`,
  alles grün. Beweist, dass die Pipeline auf aktuellem SDK 54 sauber ist, _bevor_
  Majors angefasst werden.
- **Stufe 1:** → SDK 55
- **Stufe 2:** → SDK 56
- **Stufe 3:** → SDK 57 (RN 0.86, React 19.2, expo-router 57)
- **Stufe 4 — Non-Expo-Deps:** gruppiert, jede Gruppe ein eigener Commit, gleiche
  Gates:
  - Supabase-js
  - tanstack-query, zustand
  - i18next, react-i18next
  - date-fns, rrule
  - react-native-calendars _(alt, RN-nah — höchstes Einzelrisiko)_
  - nativewind, tailwindcss, prettier-plugin-tailwindcss

## Risiko-Register

- **NativeWind v4 + Tailwind 3.4 ↔ RN 0.86 / reanimated:** NativeWind kann großen
  RN-Sprüngen hinterherhinken. Bei Stufe 3 explizit Kompatibilität prüfen; ggf.
  NativeWind-Bump nötig. Berührt evtl. das CSS-Vars-/Theming-Setup —
  `design-system/ThemeProvider.tsx` und `design-system/ui/` sind Claude-owned,
  aber die Token-Dateien (`colors/typography/spacing/themes/components/index.ts`)
  sind Handoff und **off-limits**. Bei Konflikt: in Konversation eskalieren, nicht
  still divergieren.
- **reanimated v4 + worklets:** Versions-Paar muss exakt zum SDK passen → immer
  über `expo install --fix`, nie manuell pinnen. Babel-Plugin
  `react-native-worklets/plugin` muss letztes Plugin bleiben.
- **jest-expo:** Bereits heute kaputter `jest`-Binary (`docs/TODO.md`). `bun test`
  bleibt der echte Runner (via `bunfig.toml`-Preload). jest-expo trotzdem auf
  SDK-Version heben. **Chance:** offenen TODO „`test`-Script auf `bun test`
  umbiegen" mitnehmen und die jest-Notiz in CLAUDE.md konsistent ziehen.
- **react-native-calendars (Non-Expo, alt):** kann bei neuem RN zicken. Eigener
  Commit mit isolierter Prüfung; Fallback = auf letzter funktionierender Version
  belassen und als TODO notieren.
- **Typed Routes (expo-router 6.x → SDK-57-Linie, jetzt SDK-versioniert):** `.expo/types` sind gitignored (CI-Caveat aus
  CLAUDE.md — CI hat die strikte `Href`-Union nicht). Nach jedem Bump lokal
  `typecheck` mit generierten Typen; auf neue `as`-Casts verzichten.
- **New Architecture:** bereits an → geringes Risiko. Prebuild-Log dennoch auf
  NativeArch-Warnungen je Native-Modul prüfen.

## Doku-Disziplin (CLAUDE.md)

Pro Stufe bzw. am Ende im jeweiligen Commit mitziehen:

- **`CLAUDE.md`** Tech-Stack-Block: SDK-Nummer, RN, React, expo-router-Version —
  am Ende auf SDK 57 / RN 0.86 / React 19.2 / expo-router 57.x.
- **Neuer ADR** in `docs/decision-log.md`: Update-Strategie + Ergebnis (alte ADRs
  nicht editieren — nur anhängen/supersede).
- **`docs/TODO.md`**: erledigte Punkte (z. B. jest-Script) entfernen, ggf. neue
  Follow-ups (z. B. NativeWind-Nachzug, react-native-calendars-Ersatz) anhängen.
- **`docs/architecture.md`**: nur falls sich etwas Strukturelles ändert.

## Verifikation & Rollback

- **Definition of Done pro Stufe:** alle CI-Gates grün + `expo-doctor` sauber +
  iOS- und Android-Build laufen + Flow-Smoke ok + Docs aktualisiert.
- **Rollback:** Pro Stufe ein grüner Commit → Rückweg ist
  `git reset --hard <vorherige Stufe>` + `bun install`. `bun.lock` pro Stufe
  mitcommittet, sodass jeder Zwischenstand reproduzierbar installierbar ist.
- **Abbruch-Option:** Da jede Stufe für sich grün ist, kann der PR auch auf einer
  Zwischenstufe (z. B. SDK 55 oder 56) gemergt werden, falls eine spätere Stufe
  blockiert.

## Nicht im Scope (YAGNI)

- EAS Build / EAS Update Setup (kein `eas.json` vorhanden, kein CI-Native-Build).
- Wechsel des Test-Runners über den bestehenden jest→bun-TODO hinaus.
- Refactorings, die nicht direkt aus einem Breaking-Change folgen.
- Ersatz von `react-native-calendars` durch eine andere Lib (nur falls es hart
  bricht → dann als eigenständige Entscheidung/TODO, nicht Teil dieses Updates).
