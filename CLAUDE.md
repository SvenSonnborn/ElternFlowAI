# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

**Eltern Flow AI** — KI-gestützter Familien-Organizer (Expo + React Native). Funktionen: gemeinsamer Kalender, Essensplaner mit Allergie-Filter, Sprachassistent (FAB), Kinderprofile, Hausaufgaben.

User-facing app name (`app.json`, i18n `app.name`) is just **"Eltern Flow"** — the "AI" suffix is internal. Brand voice: warm, ruhig, modern, vertrauenswürdig. Niemals kindlich-süß. Immer Du, nie Sie. Primary locale **DE**, English is the alternate via switcher.

## Non-negotiables

1. **The handoff bundle is source of truth.** These files are owned by the designer and are off-limits to edit unless explicitly asked:
   - `design-system/{colors,typography,spacing,themes,components,index}.ts`
   - `docs/HANDOFF.md`, `docs/COPY.md`, `docs/ICONS.md`, `docs/README.md`
   - `patterns/*.md`

   The implementing engineer (Claude) writes React, wires routes, and consumes the tokens — never re-invents them. If a screen pattern conflicts with implementation reality, raise it in conversation; do not silently diverge.

2. **Build screens from `patterns/<screen>.md`.** Every screen in `app-sections/` corresponds to a pattern doc. Read it first. Anatomy, variants, states, accessibility, and voice entry points are spec'd there.

3. **All UI strings live in i18n catalogs.** Use the keys in `docs/COPY.md` — `nav.*`, `dash.*`, `voice.*`, `auth.*`, `onb.*`, `cal.*`, `meals.*`, `hw.*`, `child.*`, `set.*`. German in `de.json` is the canonical copy; English mirrors.

   `sample.*` is the one namespace that deliberately does **not** appear in `docs/COPY.md`: it holds QA fixture copy (sample family, sample event titles), which the deck keeps in two explicitly German-only sections rather than as a DE/EN pair. Fixtures read it through an injected `Translate` ([features/shared/translate.ts](features/shared/translate.ts)), never through i18next's module-level `t` — that global returns `undefined`, not the key and not `defaultValue`, until `i18n.init()` has run. See [ADR-020](docs/decision-log.md).

4. **Touch targets ≥ 44×44.** Mic FAB is 60. Voice overlay mic is 84. Tab bar shows exactly 5 tabs.

5. **Voice FAB is always reachable** on Dashboard, Kalender, Essen, Aufgaben, Familie. Hidden only inside Settings sheet and Onboarding.

## Commands

```bash
bun install                  # Install dependencies
bun start                    # Expo dev server (Metro)
bun run ios                  # iOS simulator
bun run android              # Android emulator
bun run web                  # Web preview (fastest smoke-test loop)
bun run typecheck            # tsc --noEmit
bun lint                     # ESLint (flat config, eslint-config-expo)
bun lint:fix                 # ESLint --fix
bun format                   # Prettier write
bun format:check             # Prettier check
bun test                     # Tests (uses Bun's jest-compatible runner)
```

`bun test` runs Bun's built-in runner, which understands `describe`/`it`/`expect` and resolves the `@/*` path alias from `tsconfig.json`. The npm `test` script points at `bun test` — matching the `test` step in `ci.yml` — instead of the `jest` binary: test files import from `bun:test` directly, so `npx jest` fails to load most suites (`Cannot find module 'bun:test'`) no matter which `jest`/`jest-expo` version is pinned, and `jest-expo` version drift across SDK bumps (`expo install --fix` has swung it between an SDK-54-incompatible `^55.0.17` and the correct `~54.0.17`) has separately broken the `jest` binary outright with a `clearMocksOnScope` crash. Pointing `test` at `bun test` decouples local (`bun run test`) and CI runs from that per-SDK fragility. The `jest-expo` preset stays wired for the rare RN-component snapshot test that still needs the `jest` binary — run it via `npx jest` (or `bun run -- jest`).

Web-bundle smoke check end-to-end:

```bash
bunx expo export --platform web --output-dir /tmp/eltern-web
```

## Local toolchain (mise)

Node, Java, and Bun are pinned per-project in [mise.toml](mise.toml) (managed by [mise](https://mise.jdx.dev)). With mise activated in your shell (`eval "$(mise activate zsh)"`), `cd`-ing into the repo auto-selects **node 24 (LTS)**, **bun 1.3.14** (same version as CI), and **JDK 17**, and sets `JAVA_HOME`. Run `mise install` once after cloning.

The **JDK 17 pin is what makes the Android build work**: the Gradle wrapper (9.3.1, shipped by the SDK 57 template) runs on JDK 17–25 — JDK 26 needs Gradle 9.4+ —, so the machine default (26) fails Gradle with `Unsupported class file major version 70`. 17 is both React Native's canonical JDK and Gradle 9's floor — bump the `java` pin to 21 if a future SDK's Android build requires it. `ci.yml` is unaffected (it pins Bun via `oven-sh/setup-bun`, not mise), but `native-build.yml` reads its **whole** toolchain from `mise.toml` via `jdx/mise-action` — the native builds are exactly where these pins are load-bearing, so they read the same file the developer's shell does instead of a second copy in YAML ([ADR-016](docs/decision-log.md)).

`mise.toml` also sets **`RCT_USE_PREBUILT_RNCORE=0`** under `[env]`. Since SDK 55, Expo enables prebuilt React Native core (the `React-Core-prebuilt` pod / `React.xcframework`) for iOS by default, but CocoaPods can resolve a stale, version-mismatched prebuilt binary whose headers fail the iOS build (`RCTDevMenuConfiguration` "expected a type" in `EXReactRootViewFactory.h`). This var forces RN to build from source (as SDK 54 did). The generated `ios/Podfile` (line 19) assigns it with `||=` from `podfile_properties['ios.buildReactNativeFromSource'] == 'true' ? '0' : '1'` — a key this project does **not** set, so the value falls back to `'1'` unless the environment provides it. The env var is therefore the only thing holding the pin, which is why `native-build.yml` asserts it explicitly instead of trusting it. The checked-in alternative would be the `expo-build-properties` plugin in `app.json`, which would write that key into `Podfile.properties.json` and make the pin survive without any env var (noted in [docs/TODO.md](docs/TODO.md)). Trade-off: slower iOS builds; revisit when a later SDK's prebuilt RN is stable.

## Tech stack (locked)

- **Expo SDK 57 + Expo Router 57** (file-based, `(tabs)` group, typed routes enabled)
- React 19.2 + React Native 0.86, **TypeScript ~6.0 (strict)**
- **NativeWind v4 + Tailwind 3.4** — utility classes consume CSS variables that flip per theme
- **Zustand** (local/UI) + **@tanstack/react-query** (server)
- **react-i18next + expo-localization** — DE default, EN switch
- **react-native-reanimated v4 + react-native-worklets** — last babel plugin must be `react-native-worklets/plugin`
- **ESLint 9 (flat config)** + Prettier + jest-expo
- **Supabase JS Client** (`@supabase/supabase-js` + AsyncStorage session) via [features/supabase/](features/supabase/). MCP via Supabases hosted HTTP-Server (`mcp.supabase.com`, project-scoped) — Konfig in `.mcp.json`, Auth per **Personal Access Token** statt OAuth (ADR-009): `.mcp.json` expandiert `${SUPABASE_ACCESS_TOKEN}` in den `Authorization`-Header, mise lädt die Variable aus dem gitignorierten `.env.local` (`[env] _.file`). App-ENV liegt im selben `.env.local` (siehe `.env.example`). Schema mit RLS-Policies in `supabase/migrations/`, TypeScript-Types in `features/supabase/database.types.ts` (generiert). Auth-Flow lebt seit ADR-005 (Email+Passwort, strict Confirm-Email, Reset-Password, 5-Step-Onboarding mit Share-Sheet-Invite, `features/auth/AuthGate`). Realtime + Edge Functions sind die nächsten Iterationen.

Deferred to later iterations (not yet wired): Auth-Flow + Realtime + Edge Functions, gustar.io Worker, Stripe, real STT + LLM, Expo Notifications.

## MCP-Server

`.mcp.json` ist projekt-scoped und eingecheckt; `.claude/settings.local.json` setzt `enableAllProjectMcpServers: true`, ein neuer Eintrag ist nach Claude-Code-Neustart also ohne Freigabe-Dialog aktiv. Beides sind hosted HTTP-Server — kein `npx`, keine lokale Node-Runtime.

| Server     | URL                                                        | Auth                                                                       |
| ---------- | ---------------------------------------------------------- | -------------------------------------------------------------------------- |
| `supabase` | `mcp.supabase.com` (project-scoped, `features=`-Whitelist) | Personal Access Token, ADR-009                                             |
| `context7` | `mcp.context7.com`                                         | `${CONTEXT7_API_KEY:-}` als `Authorization`-Header — **optional**, ADR-012 |

**Context7** (Upstash) liefert versionsaktuelle Bibliotheks-Dokumentation gegen genau das Problem, das dieses Repo hat: veraltetes Trainingswissen über Expo SDK 57, RN 0.86, NativeWind v4, Reanimated v4. Zwei Tools — `resolve-library-id` (Name → ID wie `/expo/expo`) und `query-docs` (Doku zu einer ID, nach Frage gerankt). Ohne Key verbindet er anonym und teilt das gemeinsame Anonym-Rate-Limit; das `:-`-Default in `.mcp.json` hält den Server dabei verbunden, statt an einer nicht expandierbaren Variable zu scheitern. Eigenen Key aus <https://context7.com/dashboard> nach `.env.local` legen (siehe `.env.example`), mise exportiert ihn in die Shell.

## Folder structure

```
app/                     Expo Router routes — THIN re-export files only
├─ _layout.tsx           Root stack + providers (QueryClient · i18n · ThemeProvider · SafeArea · GestureHandler)
├─ (tabs)/_layout.tsx    Bottom tab navigator (5 tabs) + Voice FAB overlay
├─ (tabs)/index.tsx      → Dashboard
├─ (tabs)/kalender.tsx
├─ (tabs)/essen.tsx
├─ (tabs)/aufgaben.tsx
├─ (tabs)/familie.tsx
├─ task/new.tsx           → TaskCreateScreen
├─ task/edit/[id].tsx     → TaskEditScreen
└─ +not-found.tsx

app-sections/            Real screen implementations
├─ (tabs)/<name>/<Name>Screen.tsx
├─ auth/                 (login & friends — to come)
├─ onboarding/           (5-step flow — to come)
├─ modals/
├─ task/                 Anlegen/Bearbeiten von Aufgaben (Create · Edit · TaskForm)
└─ shared/               Geteilte Bausteine inkl. Formular-Primitives
   (DateTimePickerSheet · TypePicker · MemberPicker · Field · confirmDialog
   · AllergenBadge · recipeA11y · mealPlaceholder — von mehr als einem Tab benutzt)

design-system/           Handoff bundle + theming runtime
├─ colors.ts             Palette + brand aliases (HANDOFF — do not edit)
├─ typography.ts         Inter scale + named textStyles (HANDOFF)
├─ spacing.ts            space · radius · shadow · zIndex · motion (HANDOFF)
├─ themes.ts             lightTheme · darkTheme · themes (HANDOFF)
├─ components.ts         Variant SPECS for Button/Card/Pill/Field/FAB/… (HANDOFF — NOT React components)
├─ index.ts              DS barrel (HANDOFF)
├─ themeStore.ts         Zustand store for active theme
├─ ThemeProvider.tsx     Injects CSS vars + NativeWind vars from active theme
└─ ui/                   ← React component implementations (Claude-owned)
   ├─ Button.tsx · Card.tsx · Screen.tsx · Text.tsx · index.ts

features/                Cross-cutting feature logic
├─ i18n/                 react-i18next init + de.json + en.json
├─ auth/                 Session-Store · AuthGate · DeepLinkHandler · Onboarding-Mutations
├─ calendar/             Queries · Mutations · RRULE-Expansion · Reminder
├─ tasks/                Queries · Mutations · Filter · Stats
├─ children/             Kinderprofile
├─ meals/                Meal-Planner-Daten-Layer (Queries · JSONB-Normalisierung · Wochenlogik
│                        · Ausweichgericht-Auswahl)
│  └─ allergens/         EU-14-Vokabular · DE/EN-Begriffslisten · Zutaten-Klassifizierer · Urteil (ADR-014)
├─ shared/               Feature-übergreifende Hooks + Typen (useToday · Translate)
├─ sample-data/          Mock-Daten für noch nicht verdrahtete Screens (Copy aus `sample.*`)
├─ voice-assistant/      (placeholder)
├─ supabase/             client.ts (createClient + AsyncStorage session) + barrel
└─ notifications/        (placeholder)

patterns/                Per-screen design docs (HANDOFF — required reading per screen)
├─ dashboard.md · dashboard-empty.md · login.md · onboarding.md
├─ meals.md · calendar.md · homework.md · child-profile.md · settings-voice.md

docs/
├─ HANDOFF.md            Developer handoff overview (read first when onboarding)
├─ COPY.md               DE/EN copy decks per screen (i18n source of truth)
├─ ICONS.md              Icon list + stroke conventions
├─ architecture.md
├─ decision-log.md       ADRs (append new entries, don't rewrite history)
└─ eltern-flow-ai-project-structure.md
```

## Import patterns

```ts
// Tokens — anything not a React component:
import { DS, themes, palette, brand, textStyles, space, radius } from "@/design-system";

// React component primitives:
import { Button, Card, Screen, Text } from "@/design-system/ui";

// i18n:
import { useTranslation } from "react-i18next";
const { t } = useTranslation();
t("dash.greeting.morning", { name });

// Supabase:
import { supabase } from "@/features/supabase";
```

Path alias `@/*` → repo root (see [tsconfig.json](tsconfig.json)).

**Important name collision:** `design-system/components.ts` (SPEC file with lowercase `button`/`card`/`pill` exports) shadows the React components folder if anyone reintroduces `design-system/components/`. That's why the React components live in `design-system/ui/`. Don't rename it back.

## Routing convention

Files in `app/` are **thin wrappers** — they re-export the screen component from `app-sections/`:

```tsx
// app/(tabs)/kalender.tsx
export { KalenderScreen as default } from "@/app-sections/(tabs)/kalender/KalenderScreen";
```

Keeps `app/` as the URL surface and `app-sections/` as the implementation surface. New routes must follow this split.

## Theming

Two themes — `light` (default) and `dark`. Every theme defines the full semantic role set: `bg`, `bgRaised`, `card`, `cardSubtle`, `overlay`, `ink`, `inkSecondary`, `inkTertiary`, `onMint`, `onOrange`, `primary`, `primarySoft`, `primaryStrong`, `accent`, `accentSoft`, `accentStrong`, `success*`, `warning*`, `danger*`, `line`, `lineStrong`, `fabFrom`, `fabTo`.

These are emitted as CSS variables (`--bg`, `--card`, `--ink`, `--primary-soft`, …) by [ThemeProvider.tsx](design-system/ThemeProvider.tsx) on web + by NativeWind's `vars()` on native. Tailwind classes (`bg-bg`, `text-ink`, `bg-primary-soft`, `border-line`) read the CSS vars, so a theme switch is automatic.

Tab bar (Dashboard · Kalender · Essen · Aufgaben · Familie) uses German labels straight from `nav.*` i18n keys. Tab tokens come from `DS.components.tabBar`.

## Voice FAB

Lives in [app-sections/shared/VoiceAssistantFAB.tsx](app-sections/shared/VoiceAssistantFAB.tsx) and is mounted by `app/(tabs)/_layout.tsx` so it overlays every tab. Spec lives in `DS.components.micFab` (60px, orange gradient, right inset 24, bottom inset 100 — above tab bar). Tapping today opens a placeholder modal. The full overlay (`patterns/settings-voice.md`) will be wired when STT + LLM provider are chosen.

## State

- **Zustand stores** sit next to the feature that owns them. Active theme: [design-system/themeStore.ts](design-system/themeStore.ts).
- **TanStack Query** is mounted in the root layout but unused until Supabase lands. Default options: `retry: 1`, `staleTime: 30s`.

## Documentation discipline

When you change code that's documented, update the doc in the same commit:

- Architectural changes → [docs/architecture.md](docs/architecture.md)
- Decisions worth a paper trail → append a new ADR to [docs/decision-log.md](docs/decision-log.md) (never edit older ADRs — supersede them). The rule protects the _content_ of a decision: its rationale and consequences. Purely editorial repairs that leave the statement intact — dead links, wrong file/path references, typos — are fixed in place; a superseding ADR for a filename typo would be noise and would leave the broken reference in the original.
- Anything visible to engineers (folder moves, new conventions, renamed routes) → this file

When in doubt, the **handoff bundle wins**. CLAUDE.md and decision-log.md adapt around it.

### Docstrings

**Jede neue oder umgeschriebene exportierte Funktion, Komponente, Hook und jedes neue Modul bekommt einen JSDoc-Block — im selben Commit, nicht als Nacharbeit.** Der Block wird beim Schreiben mitgeliefert; ihn später „noch nachzuziehen" heißt, ihn ohne den Kontext zu schreiben, in dem die Entscheidung gefallen ist.

Was hineingehört, ist das **Nicht-Offensichtliche**: warum es so gebaut ist, welcher Grenzfall die Form bestimmt hat, welcher ADR oder welches Pattern-Doc dahintersteht. Was der Name schon sagt, wird nicht wiederholt — `/** Lädt die Kinder der Familie. */` über `useFamilyChildren` ist Füllmaterial, kein Docstring. Vorbilder im Bestand: [onboardingResume.ts](features/auth/onboardingResume.ts), [decideRoute.ts](features/auth/decideRoute.ts), [MealHeroEmptyCard.tsx](<app-sections/(tabs)/dashboard/MealHeroEmptyCard.tsx>).

Ausgenommen sind lokale Helfer, die eine Datei nicht verlässt — insbesondere die `input()`/`parent()`-Fabriken in Testdateien.

Das ist eine **Konvention, kein Gate**: CodeRabbits Docstring-Coverage-Prüfung steht bewusst auf `threshold: 0` (siehe [Code review](#code-review-coderabbit)), weil sie alle vom Diff berührten Funktionen zählt und damit fremde Altlasten als eigenes Finding zurückspielt. Die Disziplin trägt diese Regel hier, nicht die Prüfung.

## CI/CD (GitHub Actions)

Sechs PR-getriggerte Workflows liegen in [.github/workflows/](.github/workflows/) (kein `push`-Trigger auf `main` — die PR-Gates davor genügen). Auf **jedem** Pull Request laufen vier davon als Gate — `ci.yml`, `native-build.yml`, `pr-labeler.yml`, `dependency-review.yml` („Gate" meint hier: läuft **unbedingt**, im Gegensatz zu den beiden bedingten unten — **nicht**, dass es den Merge blockiert; bislang ist keiner der sechs ein Required Check, die Branch-Protection ist noch offen, siehe [docs/TODO.md](docs/TODO.md)); die anderen beiden laufen bedingt: `renovate-validate.yml` nur, wenn die Renovate-Config oder ihr eigener Workflow im Diff liegt, `expo-sdk-sync.yml` nur auf Renovates Expo-SDK-PR — und ist dabei kein Gate, sondern ein mutierender Workflow, der Commits in den PR-Branch pusht:

- **`ci.yml`** — ein Job, Steps in dieser Reihenfolge: `format:check` → `lint` → `typecheck` → `test` → `bunx expo export --platform web` (Web-Smoke-Build, als letzter/teuerster Step). Alle Qualitäts- und Build-Steps tragen `if: ${{ !cancelled() && steps.install.outcome == 'success' }}`, damit ein früher Check-Fehler die späteren nicht verdeckt, ein fehlgeschlagener Install sie aber alle überspringt. Der `test`-Step nutzt `bun test` (Buns Runner) — identisch zum npm-`test`-Script (`bun run test` == `bun test`); der `jest`-Binary scheitert an den Bun-nativen `bun:test`-Importen der Testdateien, siehe Tech-Stack-Notiz zu `bun test`. Runtime: Bun `1.3.14` (gepinnt), `bun install --frozen-lockfile`. Supabase-Public-Env kommt als Platzhalter aus dem Workflow-`env:`-Block (CI hat kein `.env.local`, der Client-Factory wirft sonst beim Modul-Load). **Typed-Routes-Caveat:** Expos `.expo/types` sind git-ignored und werden in CI **nicht** erzeugt (`expo export` generiert sie nicht, nur `expo start`), daher laufen type-aware Lint-Regeln in CI ohne die strikte `Href`-Union. Aktuell ohne Divergenz; ein `as never`-Cast in `RegisterScreen` war überflüssig und wurde entfernt (`no-unnecessary-type-assertion` hatte recht). Künftige `as`-Casts auf typisierten Routen bitte vermeiden, sonst weichen lokal/CI ab. **Expo-Ambient-Typen-Caveat:** Aus demselben Grund ist auch `expo-env.d.ts` (git-ignored, von Expo generiert) in CI abwesend — es zieht via `/// <reference types="expo/types" />` sowohl `declare module "*.css"` als auch die `process.env`-Typen herein. Deshalb committen wir [expo-globals.d.ts](expo-globals.d.ts) mit derselben Referenz; ohne sie failt CI-`typecheck` auf `import "@/global.css"` (TS2882) und type-aware Lint flaggt `process.env.EXPO_PUBLIC_*` als `any` (`no-unsafe-*`).
- **`native-build.yml`** — drei Jobs, bewusst **ohne** `needs:` untereinander: `bundle` (ubuntu, Metro-Export für ios und android), `android` (ubuntu, `expo prebuild` → `./gradlew assembleDebug`) und `ios` (macos, `expo prebuild` → `pod install` → `xcodebuild` für den Simulator). Parallel statt sequenziell, weil Runner-Minuten auf einem **öffentlichen** Repo gratis sind — auch macOS — und damit allein die Wartezeit zählt: die PR-Dauer ist `max()`, nicht `sum()`, und iOS dominiert sie. **Der `bundle`-Job schließt eine eigene Lücke:** `ci.yml`s Web-Export löst `DateTimePickerSheet.web.tsx` auf, das native Geschwister `DateTimePickerSheet.tsx` (ADR-010) wird dort nie gebaut — und die beiden Compile-Jobs schließen sie nicht, weil Debug-Varianten JS gar nicht bundeln, sondern zur Laufzeit von Metro laden. `expo export -p` nimmt genau eine Plattform, daher zwei Aufrufe (`all` würde den Web-Export aus `ci.yml` doppeln). **Toolchain kommt aus `mise.toml`** via `jdx/mise-action@v4` statt aus `oven-sh/setup-bun` wie in `ci.yml`. Beide Compile-Jobs prüfen ihren Pin vorab explizit (`java -version` == 17 bzw. `RCT_USE_PREBUILT_RNCORE` == 0), weil beide Fehlerbilder — `Unsupported class file major version` und ein stiller Prebuilt-RNCore-Fallback — nach einem Projektfehler aussehen statt nach Toolchain-Drift. **Ohne Credentials:** Simulator-Destination + `CODE_SIGNING_ALLOWED=NO` heißt keine Zertifikate, keine Provisioning-Profile, kein Secret, kein Expo-Account. **Gemessene Laufzeiten: Metro ~1m15s · Android ~16m35s · iOS ~30m12s** — der iOS-Job bestimmt die PR-Dauer. **Es gibt hier bewusst kein ccache:** zwei Anläufe erzeugten nachweislich null ccache-Aufrufe, weil RNs Wrapper still auf plain clang zurückfällt, wenn `CCACHE_BINARY` den Compiler-Prozess nicht erreicht; die ~50 Zeilen Konfiguration sind wieder entfernt. Wer es erneut versucht, belegt **zuerst**, dass die Variable ankommt. Androids `--build-cache` bleibt — eine Zeile, Wirkung unbewiesen statt widerlegt. Und Vorsicht bei Laufzeit-Vergleichen: im selben Lauf wurde auch der unveränderte Metro-Job 29 % schneller, die Runner-Varianz ist also größer als die meisten Cache-Effekte. Siehe [ADR-016](docs/decision-log.md).
- **`pr-labeler.yml`** + [.github/labeler.yml](.github/labeler.yml) — setzt Labels automatisch aus dem Branch-Namen (`actions/labeler@v7`, `head-branch`-Regex). Mapping: `feat/`→feature, `fix/`→bug, `chore/`·`ci/`·`build/`→chore, `docs/`→documentation, `refactor/`·`perf/`→refactor, `test/`→test. Die Label-Palette wird einmalig via `bash scripts/setup-labels.sh` (braucht `gh`-Auth) angelegt — das Skript bedient inzwischen zwei Quellen: die Branch-Namen-Labels oben sowie `dependencies`, `security` und `expo-sdk`, die Renovate selbst auf seine PRs setzt (siehe Renovate-Absatz unten). `expo-sdk` ist dabei keine Kosmetik: der Guard von `expo-sdk-sync.yml` prüft exakt dieses Label — fehlt es, feuert der Sync-Workflow nie.
- **`dependency-review.yml`** — CVE-Gate für neue Dependencies (`actions/dependency-review-action@v5.0.0`, `fail-on-severity: moderate`).
- **`renovate-validate.yml`** — validiert [.github/renovate.json5](.github/renovate.json5) mit dem offiziellen `renovate-config-validator` (`npx --yes --package renovate@latest -- renovate-config-validator --strict --no-global .github/renovate.json5`). Der `@latest`-Dist-Tag ist kein Versions-Pin, sondern erzwingt eine frische npx-Auflösung statt eine gecachte Installation wiederzuverwenden: ein bare `--package renovate` hatte lokal während der Umsetzung einen `renovate@37.440.7` von Juli 2024 aus dem Cache gezogen und einen korrekten Config-Wert fälschlich als ungültig gemeldet. Läuft nur über den `paths:`-Filter, wenn `.github/renovate.json5` **oder** die Workflow-Datei selbst angefasst wird — eine schema-ungültige Config ließe Renovate sonst auf seine Defaults zurückfallen, und Defaults heißt hier, dass die Expo-Regeln nicht greifen.
- **`expo-sdk-sync.yml`** — läuft ausschließlich auf Renovates Expo-SDK-PR (Guard: PR-Autor `renovate[bot]` + Label `expo-sdk` + kein Fork; das Gate labelt sowohl Major- als auch Minor-Sprünge mit `expo-sdk`, der Workflow feuert also auch auf einem Minor-SDK-PR) und schiebt dort `bunx expo install --fix` nach, damit `react-native`, alle `expo-*`, `react` und `@types/react` auf die vom neuen SDK vorgeschriebenen Versionen kommen. Der Push läuft mit `GITHUB_TOKEN` und triggert daher **keinen** neuen CI-Lauf — den PR nach dem Sync-Commit einmal schließen und wieder öffnen. Der `expo-doctor`-Schritt danach ist reiner Bericht (kein Gate, `continue-on-error: true`) und läuft ohne `tee`/Log-Datei: eine Pipe ohne explizites `shell: bash` (kein `pipefail`) hätte den Exit-Status maskiert und `steps.doctor.outcome` dauerhaft `success` gemeldet.

Verhältnis zu CodeRabbit: CI macht die **mechanischen** Gates, der CodeRabbit-Bot das **inhaltliche** Review. Der lokale CodeRabbit-pre-push-Hook bleibt deaktiviert.

**Renovate.** Dependency-Updates laufen über die gehostete Mend-Renovate-App; die Konfiguration liegt in [.github/renovate.json5](.github/renovate.json5) (siehe [ADR-013](docs/decision-log.md)). Zwei Eigenschaften sind nicht verhandelbar, ohne den Build zu riskieren: **Expo-SDK-verwaltete Pakete laufen `rangeStrategy: "in-range-only"`** — ihre Versionen bestimmt Expo, nicht npm-latest —, und **`java` in `mise.toml` ist für Renovate deaktiviert**, weil der Gradle-Wrapper JDK ≤ 24 braucht.

**Wer die Expo-Paketliste (Regel 3) anfasst, muss beide Vorgabe-Kanäle kennen** ([ADR-015](docs/decision-log.md)): Expo schreibt Native-Modul-Versionen in `node_modules/expo/bundledNativeModules.json` vor (Web: `api.expo.dev/v2/sdks/<version>/native-modules`), die **Toolchain** dagegen in `relatedPackages` unter `api.expo.dev/v2/versions/latest`. Kanal zwei enthält `jest`, `@types/jest` und `typescript` — Pakete ohne Expo-Namensmuster, die deshalb namentlich in der Liste stehen und dort **nicht** als Versehen wegzuräumen sind. `bunx expo install --check` prüft gegen beide Quellen und ist die schnellste Gegenprobe. Grüne CI ist hier kein Ersatz: `ci.yml` endet beim Web-Export und sieht Native-Bumps nicht. Ein SDK-Sprung (Major **und** Minor, da ein Minor gegen die Tilde-Range ebenfalls out-of-range sein kann) wird von Renovate nur gemeldet (Dependency Dashboard, `dependencyDashboardApproval`) und von `expo-sdk-sync.yml` aufgelöst. Automerge gilt nur für devDependencies (minor+patch), GitHub-Actions und Lockfile-Maintenance; alles andere braucht ein menschliches Review. Die Reihenfolge der acht `packageRules` ist Teil der Semantik — spätere Regeln überschreiben frühere. Unter Bun liest Renovates bun-Manager keine `lockedVersion` aus `bun.lock` (anders als der npm-Manager); In-Range-Patches an Expo-Paketen erscheinen deshalb **nicht** als eigener PR pro Paket, sondern werden von der wöchentlichen, automergten `lockFileMaintenance` aufgesammelt.

## Code review (CodeRabbit)

Before opening a PR / merge request, run a local CodeRabbit pass and address — or consciously dismiss with a reason — its findings:

```bash
coderabbit review --base main      # plain text is the default output
coderabbit review --base main --agent   # structured findings, for agent workflows
```

`--plain` no longer exists as a flag (plain text became the default); `--agent`
is the structured counterpart. `coderabbit review findings` reprints the last
local review without spending a new one.

This catches bugs, security issues, and CLAUDE.md/handoff violations **before** the PR exists, so the PR opens clean. The CodeRabbit GitHub bot then does the team-level review on the PR itself.

- Review config lives in [.coderabbit.yaml](.coderabbit.yaml) — `path_instructions` are mapped to the non-negotiables above (handoff bundle off-limits, i18n enforced, touch targets, Du-Form, routing convention, RLS). Reviews are in German. Update this file when conventions change.
- **Die Docstring-Coverage-Pre-Merge-Prüfung steht auf `threshold: 0`** ([.coderabbit.yaml](.coderabbit.yaml) — `reviews.pre_merge_checks.docstrings`): sie läuft und meldet ihre Zahl, kann aber nicht fehlschlagen. Gezählt werden alle vom Diff **berührten** Funktionen, nicht nur die neuen — zwei eingefügte Zeilen in einem bestehenden Screen erben dessen fehlenden Docstring als eigenes Finding. Begründung samt Alternativen (`mode: "off"` / `mode: "error"`) steht als Kommentar an der Einstellung. Dass die Prüfung nicht mehr blockt, heißt **nicht**, dass Docstrings optional sind — die Regel steht unter [Documentation discipline → Docstrings](#docstrings) und gilt unabhängig von ihr.
- To re-trigger the bot's PR review after pushing fixes, comment `@coderabbitai review` on the PR.
- A **pre-push hook** ([scripts/coderabbit-prepush.sh](scripts/coderabbit-prepush.sh), wired via `simple-git-hooks`) can run this review automatically before each `git push` of a feature branch — **warn-only**, never blocks. **Currently disabled** (early `exit 0` at the top of the script) because we rely on the CodeRabbit GitHub bot's PR reviews instead; re-enable by deleting the two disable lines. When active it skips on `main` and when there are no new commits vs `main`; bypass a single push with `git push --no-verify`. A commented BLOCK variant is in the script if you ever want it to fail the push on findings.
- Keep it lightweight — don't loop reviews needlessly. Rate limits differ by interface: the CLI allows about 3 reviews/hour, and the GitHub PR bot about 1 review per developer/hour on a rolling window.

## Commits

- **Never add a `Co-Authored-By: Claude …` trailer** to commit messages. The repo policy is human-authored attribution only. This applies to every `git commit` regardless of context (regular work, fix-ups, amends, PR squashes).
- Conventional-commits prefix (`feat`, `fix`, `refactor`, `docs`, …) + scoped to the affected area.
- Pre-commit hooks (`lint-staged`) must never be bypassed (`--no-verify`).

## Out-of-scope TODOs

Living follow-up list lives at [docs/TODO.md](docs/TODO.md). Workflow:

- **When you find something during a task that should be done but is out of scope** (V1 limitation, deferred refactor, follow-up to fix in a later iteration), **append it to `docs/TODO.md`** in the same commit that introduces the limitation. Each entry: one bullet, references the file/area, explains _why_ it's deferred.
- **When you finish a TODO**, **delete the entry from `docs/TODO.md`** in the same commit that resolves it. Do not just check it off — remove the line entirely. The file is the active backlog, not a history.
- Re-read `docs/TODO.md` at the start of every new task so you know what's already on the list before adding duplicates.
