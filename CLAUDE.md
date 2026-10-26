# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

**Eltern Flow AI** — KI-gestützter Familien-Organizer (Expo + React Native). Funktionen: gemeinsamer Kalender, Essensplaner mit Allergie-Filter, Sprachassistent (FAB), Kinderprofile, Hausaufgaben.

User-facing app name (`app.json`, i18n `app.name`) is just **"Eltern Flow"** — the "AI" suffix is internal. Brand voice: warm, ruhig, modern, vertrauenswürdig. Niemals kindlich-süß. Immer Du, nie Sie. Primary locale **DE**, English is the alternate via switcher.

Diese Datei hält nur Regeln und Fallen, die in jeder Sitzung gelten. Wie etwas gebaut ist, steht hier:

| Thema                                                           | Datei                                                                                |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| App-Architektur, Theming, Supabase, Kalender, Realtime          | [docs/architecture.md](docs/architecture.md)                                         |
| Vollständiger Ordnerbaum, neue Screens und Features anlegen     | [docs/eltern-flow-ai-project-structure.md](docs/eltern-flow-ai-project-structure.md) |
| Toolchain, Test-Runner, MCP, CI-Workflows, Renovate, CodeRabbit | [docs/development.md](docs/development.md)                                           |
| Entscheidungen und ihr Warum                                    | [docs/decision-log.md](docs/decision-log.md)                                         |
| Lokale Supabase, Testkonten, Migrationen einspielen             | [supabase/SETUP.md](supabase/SETUP.md) §7                                            |

## Arbeitsweise

Vier Regeln gegen typische Fehler von KI-Assistenten beim Programmieren, übernommen aus [forrestchang/andrej-karpathy-skills](https://github.com/forrestchang/andrej-karpathy-skills/blob/main/CLAUDE.md). Sie setzen Sorgfalt vor Tempo; bei trivialen Aufgaben gilt Augenmaß. Wo eine Projektregel weiter unten genauer ist, gilt die Projektregel.

### 1. Erst denken, dann programmieren

**Nichts unterstellen. Unklarheit nicht verstecken. Abwägungen offenlegen.**

Vor der Umsetzung:

- Annahmen ausdrücklich nennen. Bei Unsicherheit fragen.
- Gibt es mehrere Deutungen, sie vorlegen — nicht stillschweigend eine wählen.
- Gibt es einen einfacheren Weg, ihn nennen. Widersprechen, wenn es angebracht ist.
- Ist etwas unklar: anhalten, benennen, was unklar ist, fragen.

### 2. Einfachheit zuerst

**Der kleinste Code, der das Problem löst. Nichts auf Vorrat.**

- Keine Funktionen über das Verlangte hinaus.
- Keine Abstraktionen für Code, der nur an einer Stelle gebraucht wird.
- Keine „Flexibilität" oder Konfigurierbarkeit, die niemand verlangt hat.
- Keine Fehlerbehandlung für Fälle, die nicht eintreten können.
- Wären aus 200 Zeilen 50 möglich: neu schreiben.

Prüffrage: Würde jemand mit viel Erfahrung das überkompliziert nennen? Dann vereinfachen.

### 3. Gezielte Änderungen

**Nur anfassen, was sein muss. Nur die eigenen Spuren aufräumen.**

Beim Ändern von bestehendem Code:

- Benachbarten Code, Kommentare und Formatierung nicht „verbessern".
- Nichts umbauen, was nicht kaputt ist.
- Den vorhandenen Stil übernehmen, auch wenn du es anders machen würdest.
- Fällt fremder toter Code auf: erwähnen, nicht löschen. Ist es echte Folgearbeit, kommt sie nach `docs/TODO.md` (siehe [Out-of-scope TODOs](#out-of-scope-todos)).

Wenn die eigene Änderung Waisen erzeugt:

- Imports, Variablen und Funktionen entfernen, die _deine_ Änderung unbenutzt gemacht hat.
- Vorher schon toten Code nur auf Anfrage entfernen.

Der Test: Jede geänderte Zeile lässt sich direkt auf die Anfrage zurückführen. Was die [Documentation discipline](#documentation-discipline) zu einer Änderung verlangt (Docstring, Kommentar, TODO-Eintrag), gehört dazu.

### 4. Zielgerichtet ausführen

**Erfolgskriterien festlegen. Wiederholen, bis sie nachweislich erfüllt sind.**

Aufgaben in prüfbare Ziele übersetzen:

- „Validierung ergänzen" → „Tests für ungültige Eingaben schreiben, dann grün machen"
- „Den Bug beheben" → „Einen Test schreiben, der ihn nachstellt, dann grün machen"
- „X umbauen" → „Tests laufen vorher und nachher grün"

Bei mehrstufigen Aufgaben einen kurzen Plan nennen:

```
1. [Schritt] → prüfen: [Check]
2. [Schritt] → prüfen: [Check]
3. [Schritt] → prüfen: [Check]
```

Prüfen heißt hier: ein Befehl aus [Commands](#commands) mit Exit-Code, nicht Augenschein. Starke Kriterien erlauben selbstständiges Weiterarbeiten; schwache („mach, dass es geht") erzwingen ständige Rückfragen.

**Die Regeln wirken, wenn** Diffs weniger unnötige Änderungen enthalten, seltener wegen Überkomplexität neu geschrieben wird und Rückfragen vor der Umsetzung kommen statt nach dem Fehler.

## Non-negotiables

1. **The handoff bundle is source of truth.** These files are owned by the designer and are off-limits to edit unless explicitly asked:
   - `design-system/{colors,typography,spacing,themes,components,index}.ts`
   - `docs/HANDOFF.md`, `docs/COPY.md`, `docs/ICONS.md`, `docs/README.md`
   - `patterns/*.md`

   The implementing engineer (Claude) writes React, wires routes, and consumes the tokens — never re-invents them. If a screen pattern conflicts with implementation reality, raise it in conversation; do not silently diverge.

2. **Build screens from `patterns/<screen>.md`.** Every screen in `app-sections/` corresponds to a pattern doc. Read it first. Anatomy, variants, states, accessibility, and voice entry points are spec'd there.

3. **All UI strings live in i18n catalogs.** Use the keys in `docs/COPY.md` — `nav.*`, `dash.*`, `voice.*`, `auth.*`, `onb.*`, `cal.*`, `meals.*`, `hw.*`, `child.*`, `set.*`, `sync.*`. German in `de.json` is the canonical copy; English mirrors.

   `sample.*` is the one exception: QA fixture copy, deliberately absent from `docs/COPY.md`. Fixtures read it through an injected `Translate` ([features/shared/translate.ts](features/shared/translate.ts)), never through i18next's module-level `t` — that returns `undefined` until `i18n.init()` has run ([ADR-020](docs/decision-log.md)).

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
bun run test:rn              # Component/hook tests (*.jest.tsx, *.jest.ts) under jest + jest-expo
supabase start               # Lokale Supabase (Docker) — Testumgebung für alles mit Datenbank
bun run test:db              # pgTAP + Integrationstests gegen die lokale Supabase
```

- **Never `npx jest`.** Test files import from `bun:test`; `bun test` is the runner. Tests that render React Native components or hooks are the exception: named `*.jest.tsx` / `*.jest.ts`, next to the code they test, run via `bun run test:rn`, setup and `renderScreen` in [testing/](testing/) ([ADR-042](docs/decision-log.md)). Never put one under `app/` — Expo Router treats every `.tsx` there as a route.
- **`bun run test:db`** needs the running local stack and only talks to `127.0.0.1`/`localhost`. `bun test` does not collect `*.db.ts`; a new integration test must be added to the `test:db` script by name ([ADR-044](docs/decision-log.md)).

Web-bundle smoke check end-to-end:

```bash
bunx expo export --platform web --output-dir /tmp/eltern-web
```

**Toolchain:** Node, Java, Bun and the Supabase CLI are pinned in [mise.toml](mise.toml) — `mise install` once, mise activated in the shell. Two pins look optional and are not: **JDK 17** (the machine default JDK fails the Gradle build) and **`RCT_USE_PREBUILT_RNCORE=0`** (without it iOS can pull a mismatched prebuilt RN core). Why: [docs/development.md](docs/development.md#toolchain-mise).

## Tech stack (locked)

- **Expo SDK 57 + Expo Router 57** (file-based, `(tabs)` group, typed routes enabled)
- React 19.2 + React Native 0.86, **TypeScript ~6.0 (strict)**
- **NativeWind v4 + Tailwind 3.4** — utility classes consume CSS variables that flip per theme
- **Zustand** (local/UI) + **@tanstack/react-query** (server)
- **react-i18next + expo-localization** — DE default, EN switch
- **react-native-reanimated v4 + react-native-worklets** — last babel plugin must be `react-native-worklets/plugin`
- **ESLint 9 (flat config)** + Prettier + jest-expo
- **Supabase** (`@supabase/supabase-js` + AsyncStorage session) via [features/supabase/](features/supabase/). Schema with RLS in `supabase/migrations/`, generated types in `features/supabase/database.types.ts`.

Deferred to later iterations (not yet wired): Edge Functions, gustar.io Worker, Stripe, real STT + LLM, Expo Notifications.

Für diese Versionen ist Trainingswissen oft veraltet — Bibliotheks-Doku über den MCP-Server `context7` holen.

### Datenschicht — Fallen beim Ändern

Wie Kalender, Realtime und Konflikterkennung zusammenspielen, beschreibt [docs/architecture.md](docs/architecture.md). Diese Regeln brechen still, wenn man sie übersieht:

- **Termine schreiben nur über die RPC `apply_event_change`** — eine Transaktion, eine Kennung pro Absicht; Aufgaben speichern per Compare-and-Swap und löschen über `delete_task`, beides hinter `TaskOps` in [features/tasks/mutations.ts](features/tasks/mutations.ts) ([ADR-044](docs/decision-log.md)).
- **Die Identität einer Occurrence ist `occurrenceKey`** (Zone des Termins), nicht `occurrenceDate` (Anzeige, Zone des Lesers). Versionsvergleich, React-Keys, Route-Parameter `occ` und Schreibpfad schlüsseln darauf ([ADR-034](docs/decision-log.md)).
- **Serien rechnen in Wandzeit** über [features/calendar/rrule.ts](features/calendar/rrule.ts), nie über `rrule`s `tzid`. Jeder Termin trägt seine Zone in `events.timezone`; neue Termine bekommen sie von `deviceTimeZone()` ([ADR-033](docs/decision-log.md)).
- **Der Vertrag von `event_exceptions.override`** lebt in [features/calendar/override.ts](features/calendar/override.ts) — dort erweitern, nicht daneben ([ADR-035](docs/decision-log.md)).
- **Realtime läuft über Broadcast** auf dem privaten Topic `family:<familyId>`, nicht über die Publikation `supabase_realtime`; der eine Mountpunkt ist `useFamilyRealtime()` ([ADR-030](docs/decision-log.md)).

## MCP-Server

`.mcp.json` ist eingecheckt und projekt-scoped, beide Einträge sind gehostete HTTP-Server. **`supabase`** braucht zwingend einen eigenen `SUPABASE_ACCESS_TOKEN` in `.env.local` — ohne bleibt er unverbunden ([ADR-009](docs/decision-log.md), [ADR-029](docs/decision-log.md)). **`context7`** läuft auch ohne Key ([ADR-012](docs/decision-log.md)). Regel für neue Einträge: `${VAR:-}` nur für optionale Keys, **kein Default für Pflicht-Token**. Warum, und wie die `${VAR}`-Expansion sich verhält: [docs/development.md](docs/development.md#mcp-server).

## Folder structure

```
app/                     Expo Router routes — THIN re-export files; `_layout.tsx` holds navigator + providers
├─ _layout.tsx           Root stack + providers
└─ (tabs)/_layout.tsx    Bottom tab navigator (5 tabs) + Voice FAB overlay
app-sections/            Real screen implementations; shared/ = Bausteine, die mehr als ein Tab benutzt
design-system/           Handoff tokens (off-limits) · ThemeProvider · themeStore
└─ ui/                   React component primitives (Claude-owned)
features/                Cross-cutting feature logic (auth · calendar · realtime · tasks · meals · i18n · supabase …)
testing/                 Jest-Setup + renderScreen für *.jest.tsx
supabase/                Migrationen mit RLS · lokaler Stack · Tests
patterns/                Per-screen design docs (HANDOFF — required reading per screen)
docs/                    Handoff-Docs · architecture · development · decision-log · roadmap · TODO
```

Detailed tree, module by module: [docs/eltern-flow-ai-project-structure.md](docs/eltern-flow-ai-project-structure.md). A new file goes where that tree says; a new folder updates it.

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

**Kein `Alert.alert` außerhalb von [confirmDialog.ts](app-sections/shared/confirmDialog.ts).** react-native-web implementiert `Alert` als No-op — jeder Ablauf, der auf eine Antwort wartet, endet dort stumm. Bestätigen über `confirmDestructive`, Hinweise über `showAlert` (beide aus `@/app-sections/shared`, `body` optional); eine ESLint-Regel hält das ([ADR-039](docs/decision-log.md)).

**Tippflächen über die Box, nicht über `hitSlop` — und das Maß als Zahl.** Ein Bedienelement, das kleiner als 44×44 aussehen soll, bekommt ein `Pressable` mit `touchTarget.min` aus `@/design-system` im `style` und trägt seine Optik in einer inneren `View` — Vorbild: [FilterChipRow.tsx](app-sections/shared/FilterChipRow.tsx). `hitSlop` wirkt auf Web gar nicht, und React Native beschneidet es an den Grenzen des Elternteils. `h-11` ist kein Ersatz für die Zahl: NativeWind rechnet `rem` auf iOS und Android mit 14, die Klasse ergibt dort 38,5 pt ([ADR-041](docs/decision-log.md)).

**Important name collision:** `design-system/components.ts` (SPEC file with lowercase `button`/`card`/`pill` exports) shadows the React components folder if anyone reintroduces `design-system/components/`. That's why the React components live in `design-system/ui/`. Don't rename it back.

## Routing convention

Files in `app/` are **thin wrappers** — they re-export the screen component from `app-sections/`:

```tsx
// app/(tabs)/kalender.tsx
export { KalenderScreen as default } from "@/app-sections/(tabs)/kalender/KalenderScreen";
```

Keeps `app/` as the URL surface and `app-sections/` as the implementation surface. New routes must follow this split.

**Den Root-`<Stack>` nie bedingt ersetzen.** Ein `<Redirect>` oder Splash an seiner Stelle, nachdem er gemountet war, löst beim Login-Übergang eine Render-Schleife aus; wann `AuthGate` ihn trotzdem ersetzt (Kaltstart, keine Sitzung), entscheidet [gateLayout.ts](features/auth/gateLayout.ts) ([ADR-040](docs/decision-log.md)).

## Theming, Voice FAB, State

- **Theming:** two themes, `light` (default) and `dark`. Colors only through Tailwind classes that read the theme's CSS variables (`bg-bg`, `text-ink`, `bg-primary-soft`, `border-line`), never hard-coded — then a theme switch is automatic ([docs/architecture.md](docs/architecture.md#theme-system)).
- **Voice FAB:** [VoiceAssistantFAB.tsx](app-sections/shared/VoiceAssistantFAB.tsx), mounted by `app/(tabs)/_layout.tsx`, spec in `DS.components.micFab`. Today it opens a placeholder modal; the full overlay (`patterns/settings-voice.md`) waits for the STT + LLM provider.
- **State:** Zustand stores sit next to the feature that owns them (active theme: [design-system/themeStore.ts](design-system/themeStore.ts)); server state goes through TanStack Query.

## Documentation discipline

When you change code that's documented, update the doc before the PR is opened — docstrings and code comments in the same commit as the code, ADRs, roadmap and `docs/architecture.md` once at the end of the branch (see [Wo was steht](#wo-was-steht--eine-heimat-pro-tatsache) below):

- Architectural changes → [docs/architecture.md](docs/architecture.md)
- Toolchain, CI, Renovate, MCP, CodeRabbit → [docs/development.md](docs/development.md)
- Folder moves, new folders → [docs/eltern-flow-ai-project-structure.md](docs/eltern-flow-ai-project-structure.md)
- Decisions worth a paper trail → append a new ADR to [docs/decision-log.md](docs/decision-log.md) (never edit older ADRs — supersede them). The rule protects the _content_ of a decision: its rationale and consequences. Purely editorial repairs that leave the statement intact — dead links, wrong file/path references, typos — are fixed in place; a superseding ADR for a filename typo would be noise and would leave the broken reference in the original.
- A new rule or trap that applies in every session (new convention, renamed route) → this file — kurz, mit Verweis auf die Heimat der Details

When in doubt, the **handoff bundle wins**. CLAUDE.md and decision-log.md adapt around it.

### Wo was steht — eine Heimat pro Tatsache

Jede Tatsache hat genau **einen** Ort; andere Dokumente verlinken dorthin, statt sie zu wiederholen. Wer denselben Satz an mehreren Stellen pflegt, pflegt ihn an allen falsch, sobald sich das Verständnis ändert — in PR #125 stand dieselbe Erklärung in sieben Dateien, und ihr Nachziehen kostete ein Mehrfaches der Laufzeit des Codes.

| Was                                | Wo                                                 | Nicht dort                                             |
| ---------------------------------- | -------------------------------------------------- | ------------------------------------------------------ |
| Eine Regel für jede Sitzung        | `CLAUDE.md`, kurz, mit Link                        | Beschreibungen des Ist-Zustands, Herleitungen          |
| Wie etwas gebaut ist (Ist-Zustand) | `docs/architecture.md` · `docs/development.md`     | Begründungen — die stehen im ADR                       |
| Eine Entscheidung und ihr Warum    | ADR in `docs/decision-log.md`, kurz                | Testzahlen, Zeilennummern, Commit-Hashes, Messtabellen |
| Eine offene Lücke, vertagte Arbeit | ein Eintrag in `docs/TODO.md`, zwei bis drei Sätze | Herleitungen, Messprotokolle                           |
| Reihenfolge und Status             | `docs/roadmap.md`                                  | den Text von TODO-Einträgen oder ADRs — verlinken      |
| Warum eine Stelle so gebaut ist    | Kommentar an dieser Stelle                         | Aufzählungen, die für mehrere Dateien gelten           |
| Das Design vor der Umsetzung       | Spec unter `docs/superpowers/specs/`               | Nachpflege nach der Umsetzung — dann gilt der ADR      |
| Der Arbeitsplan eines Branches     | `.superpowers/plans/` (git-ignoriert)              | im Repo                                                |

- **Keine flüchtigen Details in dauerhafter Doku.** Testzahlen, Zeilennummern und Messwerte veralten mit dem nächsten Commit. Commit-Hashes sind nach dem Merge tot, weil GitHub die Commits beim Merge neu schreibt. Auf Code wird über Datei und Funktion verwiesen.
- **Doku einmal am Ende eines Branches, nicht pro Task.** ADR, Roadmap und `docs/architecture.md` entstehen im letzten Schritt vor dem PR, auf dem Stand, der dann gilt. Docstrings, Code-Kommentare und TODO-Einträge bleiben im Commit des Codes, den sie beschreiben.
- **Doku-Befunde aus Reviews werden gesammelt** und in einem Durchgang vor dem PR behoben, nicht als eigene Review-Runde. Ausnahme: eine falsche Aussage in einem ADR, denn der friert mit dem Merge ein.
- **Spec und Plan sind Arbeitsmittel.** Stellt sich eine Spec während der Umsetzung als falsch heraus, wird sie nicht nachgepflegt; der ADR hält fest, was stattdessen gilt. Pläne landen nicht mehr im Repo; die bereits auf `main` liegenden unter `docs/superpowers/plans/` bleiben als Bericht stehen.

### Docstrings

**Jede neue oder umgeschriebene exportierte Funktion, Komponente, Hook und jedes neue Modul bekommt einen JSDoc-Block — im selben Commit, nicht als Nacharbeit.** Der Block wird beim Schreiben mitgeliefert; ihn später „noch nachzuziehen" heißt, ihn ohne den Kontext zu schreiben, in dem die Entscheidung gefallen ist.

Was hineingehört, ist das **Nicht-Offensichtliche**: warum es so gebaut ist, welcher Grenzfall die Form bestimmt hat, welcher ADR oder welches Pattern-Doc dahintersteht. Was der Name schon sagt, wird nicht wiederholt — `/** Lädt die Kinder der Familie. */` über `useFamilyChildren` ist Füllmaterial, kein Docstring. Vorbilder im Bestand: [onboardingResume.ts](features/auth/onboardingResume.ts), [decideRoute.ts](features/auth/decideRoute.ts), [MealHeroEmptyCard.tsx](<app-sections/(tabs)/dashboard/MealHeroEmptyCard.tsx>).

Ausgenommen sind lokale Helfer, die eine Datei nicht verlässt — insbesondere die `input()`/`parent()`-Fabriken in Testdateien.

Das ist eine **Konvention, kein Gate**: CodeRabbits Docstring-Coverage-Prüfung kann bewusst nicht fehlschlagen ([docs/development.md](docs/development.md#coderabbit)). Die Disziplin trägt diese Regel, nicht die Prüfung.

## CI/CD

Workflows in [.github/workflows/](.github/workflows/), alle PR-getriggert. Required Checks auf jedem PR: `ci.yml` (format → lint → typecheck → test → test:rn → Web-Export), `native-build.yml` (Metro-Bundles für iOS und Android, Android- und iOS-Compile), `db.yml` (lokale Supabase, Schema-Lint, `test:db`), `pr-labeler.yml` (Labels aus dem Branch-Präfix `feat/`, `fix/`, `chore/`, `docs/`, `refactor/`, `test/` …), `dependency-review.yml`. Bedingt: `renovate-validate.yml`, `expo-sdk-sync.yml`. Was jeder tut und warum: [docs/development.md](docs/development.md#cicd-github-actions).

Fallen, an denen lokal und CI auseinanderlaufen:

- **Keine `as`-Casts auf typisierten Routen.** CI erzeugt `.expo/types` nicht, type-aware Lint sieht dort andere Typen als lokal.
- **[expo-globals.d.ts](expo-globals.d.ts) bleibt eingecheckt** — ohne sie scheitert CI-`typecheck` an `import "@/global.css"`.
- **Grüne `ci.yml` sagt nichts über Native-Builds** — sie endet beim Web-Export. Dafür ist `native-build.yml` da.
- **Required Checks bekommen keinen `paths`-Filter**, sonst bleiben sie auf PRs ohne passende Änderung für immer „ausstehend".

**Renovate** ([.github/renovate.json5](.github/renovate.json5), [ADR-013](docs/decision-log.md), [ADR-015](docs/decision-log.md)): Expo-SDK-verwaltete Pakete laufen `in-range-only`, `java` in `mise.toml` ist für Renovate abgeschaltet. `jest`, `@types/jest` und `typescript` stehen absichtlich in der Expo-Paketliste — nicht wegräumen. Gegenprobe nach jedem Eingriff: `bunx expo install --check`. Der Sync-Commit von `expo-sdk-sync.yml` startet keine neue CI: PR einmal schließen und wieder öffnen.

## Code review (CodeRabbit)

Before opening a PR, run a local CodeRabbit pass and address — or consciously dismiss with a reason — its findings:

```bash
coderabbit review --base main           # plain text is the default output
coderabbit review --base main --agent   # structured findings, for agent workflows
```

- Rate limits: the CLI allows about 3 reviews/hour, the GitHub PR bot about 1 per developer/hour — don't loop reviews. `coderabbit review findings` reprints the last local review without spending a new one.
- To re-trigger the bot's PR review after pushing fixes, comment `@coderabbitai review` on the PR.
- Review config lives in [.coderabbit.yaml](.coderabbit.yaml) (reviews in German, `path_instructions` mirror the non-negotiables). Update it when conventions change. Pre-push hook and docstring check: [docs/development.md](docs/development.md#coderabbit).

## Commits

- **Never add a `Co-Authored-By: Claude …` trailer** to commit messages. The repo policy is human-authored attribution only. This applies to every `git commit` regardless of context (regular work, fix-ups, amends, PR squashes).
- Conventional-commits prefix (`feat`, `fix`, `refactor`, `docs`, …) + scoped to the affected area.
- Pre-commit hooks (`lint-staged`) must never be bypassed (`--no-verify`).

## Out-of-scope TODOs

Living follow-up list lives at [docs/TODO.md](docs/TODO.md). Workflow:

- **When you find something during a task that should be done but is out of scope** (V1 limitation, deferred refactor, follow-up to fix in a later iteration), **append it to `docs/TODO.md`** in the same commit that introduces the limitation. Each entry: one bullet of **two to three sentences** — what is missing, where (file/area), and _why_ it's deferred. No derivations or measurement logs; the reasoning behind a decision belongs in its ADR.
- **When you finish a TODO**, **delete the entry from `docs/TODO.md`** in the same commit that resolves it. Do not just check it off — remove the line entirely. The file is the active backlog, not a history.
- Re-read `docs/TODO.md` at the start of every new task so you know what's already on the list before adding duplicates.
