# Spec · Renovate-Setup

**Datum:** 2026-08-13 · **Branch:** `chore/renovate-setup` · **Status:** freigegeben

## Ziel

Automatisierte Dependency-Updates für `SvenSonnborn/ElternFlowAI`, ohne die zwei
Invarianten zu verletzen, die das Repo heute von Hand hält:

1. **Die Expo-SDK-Kohärenz.** Rund die Hälfte der Deps in
   [package.json](../../../package.json) wird nicht von npm-latest bestimmt,
   sondern von Expo SDK 57. `react-native 0.86.0` steht dort, weil SDK 57 es so
   will — nicht, weil es die neueste Version wäre.
2. **`local == CI`.** [mise.toml](../../../mise.toml) und
   [.github/workflows/ci.yml](../../../.github/workflows/ci.yml) tragen (Stand
   heute) dieselbe Bun-Version (`1.3.10`) mehrfach, und der JDK-Pin auf 17 ist
   eine bewusste Entscheidung gegen neuere JDKs.

Ein naiv konfiguriertes Renovate bricht beide. Diese Spec beschreibt die
Konfiguration, die sie stattdessen absichert.

## Scope

**Drin:** eine neue Config `.github/renovate.json5`; zwei neue Workflows
(`expo-sdk-sync.yml`, `renovate-validate.yml`); drei neue Labels in
[scripts/setup-labels.sh](../../../scripts/setup-labels.sh); die zugehörigen
Einträge in [CLAUDE.md](../../../CLAUDE.md),
[docs/decision-log.md](../../decision-log.md) (ADR-013) und
[docs/TODO.md](../../TODO.md).

**Bewusst draußen:**

- **Self-hosted Renovate.** Siehe Entscheidung 1.
- **`.github/labeler.yml`.** Renovate setzt seine Labels selbst; zwei
  Label-Mechanismen auf denselben PRs wären eine Quelle stiller Konflikte. Die
  Datei bleibt unberührt — `renovate/*`-Branches matchen keine ihrer Regeln, und
  das ist hier das gewünschte Verhalten, nicht ein Versehen.
- **Der SDK-57→58-Sprung selbst.** Diese Spec baut den Mechanismus, nicht das
  Upgrade. Das passiert, wenn SDK 58 erscheint.
- **Die Ruleset-Änderungen an `main`.** Nicht per CLI machbar (das lokale Token
  bekommt `403` auf `/rulesets`), daher manuelle Schritte — siehe unten.
- **Dependabot.** Wird nicht parallel betrieben.
  [dependency-review.yml](../../../.github/workflows/dependency-review.yml)
  bleibt wie es ist und gated künftig auch Renovate-PRs.

## Ausgangslage

| Fläche         | Datei                       | Heute                                                                                                                          |
| -------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| npm/Bun        | `package.json` + `bun.lock` | 33 prod, 20 dev Deps; Bun als Paketmanager                                                                                     |
| GitHub Actions | `.github/workflows/*.yml`   | `actions/checkout@v4`, `oven-sh/setup-bun@v2`, `actions/cache@v4`, `actions/labeler@v5`, `actions/dependency-review-action@v4` |
| Toolchain      | `mise.toml`                 | `java = "temurin-17"`, `node = "24"`, `bun = "1.3.10"`                                                                         |
| CI-Runtime     | `ci.yml`                    | `bun-version: 1.3.10` als `with:`-Input                                                                                        |

Das Ruleset `main protection` (ID 17263678) verlangt heute:

```
pull_request:  required_approving_review_count: 1
               dismiss_stale_reviews_on_push: true
               required_review_thread_resolution: true
               allowed_merge_methods: ["rebase"]
required_linear_history
deletion
bypass_actors: [RepositoryRole 5 (Admin) → always]
```

Bemerkenswert: **keine Required Status Checks.** Die CI blockt Merges heute
nicht — nur die Review-Pflicht tut das. Für einen Solo-Maintainer mit
Admin-Bypass ist das folgenlos; sobald Automerge dazukommt, wird es tragend.

## Entscheidungen

### 1 — Mend-gehostete App statt self-hosted Action

Das Repo ist public, die App damit kostenlos. Kein PAT als Secret, keine
Actions-Minuten, kein Renovate-Image zu pflegen. Der einzige relevante Nachteil
der gehosteten Variante — kein Zugriff auf private Registries — trifft dieses
Projekt nicht.

**Konsequenz, die den Rest der Spec prägt:** `postUpgradeTasks` (Renovate führt
nach dem Update selbst ein Kommando aus) wird von `allowedCommands` gegated, und
`allowedCommands` ist eine **self-hosted-only Admin-Option**. Renovate kann in
dieser Variante also nicht selbst `expo install --fix` ausführen. Deshalb
Entscheidung 3.

### 2 — Expo-verwaltete Pakete laufen `in-range-only`

Nicht per Blocklist, sondern per `rangeStrategy: "in-range-only"`: Renovate darf
nur Updates bauen, die die **bereits in `package.json` stehende Range erfüllen**.

- `expo-router: "~57.0.7"` → PR auf `57.0.9`, nur `bun.lock` ändert sich.
  Identisch zu dem, was `expo install --fix` täte.
- `react-native: "0.86.0"` (exakt) → keine Version erfüllt die Range außer der
  installierten, Renovate schweigt.
- `expo-router 58.x` → nie vorgeschlagen, weil außerhalb `~57`.

Der Vorteil gegenüber einer Paketliste: Expo hat die Sicherheitsgrenze bereits
selbst in die `package.json` geschrieben. Die Regel bleibt darum korrekt, wenn
das Projekt auf SDK 58 geht, ohne dass jemand eine Liste nachpflegt.

**Preis, ausdrücklich in Kauf genommen:** exakt gepinnte Expo-Pakete
(`react-native`, `@react-native/jest-preset`) sind damit für Renovate
eingefroren. Sie bewegen sich ausschließlich über `expo install --fix`. Das ist
gewollt — genau diese Pakete sind die, bei denen ein eigenmächtiger Bump den
Native-Build bricht, den die CI (nur Web-Export) nicht prüft.

### 3 — `expo install --fix` bleibt die Kompatibilitäts-Autorität

Renovate kennt die Expo-Matrix nicht; sie steht in `bundledNativeModules.json`
im installierten `expo`-Paket. Statt sie in Renovate nachzubauen (und damit
falsch), wird die Arbeit geteilt:

**Erkennung = Renovate. Auflösung = Expo.**

Der Ablauf beim SDK-Sprung:

1. Expo 58 erscheint → Renovate meldet es im Dependency Dashboard. Kein PR,
   `dependencyDashboardApproval` hält ihn zurück.
2. Checkbox im Dashboard → Renovate öffnet einen PR, der **nur `expo`** auf
   `~58.x` hebt und das Label `expo-sdk` trägt. Für sich genommen ein kaputter
   Zustand.
3. `expo-sdk-sync.yml` triggert auf genau diesen PR, läuft
   `bun install` → `bunx expo install --fix` → `bun install` und pusht das
   Ergebnis in denselben Branch.
4. `expo install --fix` liest die Matrix aus dem **frisch installierten Expo 58**
   und zieht `react-native`, alle `expo-*`, `react`, `@types/react` auf exakt
   die SDK-58-Versionen. Nicht npm-latest.
5. `bunx expo-doctor` läuft als Bericht und kommentiert das Ergebnis in den PR.

Damit ist `react-native` genau dann dran, sobald Expo es zulässt.

Die verworfene Alternative war, alle Expo-Pakete in einen gemeinsamen
Major-Gruppen-PR zu legen. Das sieht nach derselben Sache aus, ist es aber
nicht: Renovate hätte jedes Paket auf npm-latest gehoben. Steht `react-native
0.88` auf npm, während Expo 58 auf `0.87` festlegt, entsteht ein falscher PR —
und die CI fängt ihn nicht, weil sie keinen Native-Build fährt.

### 4 — Automerge nur für die risikoarme Klasse

Automerge bekommen: **devDependencies (minor+patch)**, **GitHub-Actions
(minor/patch/digest)** und **Lockfile-Maintenance**. Alles andere — prod-Deps,
sämtliche Majors, alles Expo-nahe, die Toolchain — geht durch einen Menschen.

Mechanik gegen das Ruleset:

- `automergeStrategy: "rebase"`, weil `allowed_merge_methods: ["rebase"]` und
  `required_linear_history` nichts anderes zulassen.
- Die Renovate-App muss als **Bypass-Actor** ins Ruleset, sonst blockt die
  1-Approval-Pflicht jeden Automerge. Renovate kann sich nicht selbst approven.
- `platformAutomerge: false` zum Start: Renovate merged über die API selbst,
  wodurch der Bypass eindeutig auf den handelnden Actor greift. GitHubs natives
  Auto-Merge in Kombination mit Bypass-Actors ist zu unklar dokumentiert, um es
  blind anzuschalten. Umstellung später möglich — steht als TODO.

Ausdrücklich **nicht** gewählt: ein Auto-Approve-Workflow. Der hätte das Ruleset
formal intakt gelassen und die Review-Pflicht auf demselben Weg ausgehebelt, nur
verdeckter.

### 5 — Bun-Version wird an beiden Stellen gemeinsam gehoben

`bun 1.3.10` steht mehrfach im Repo: in `mise.toml` (Renovates `mise`-Manager
sieht das) und als `bun-version:`-Input in allen `.github/workflows/*.yml`
(sieht er **nicht** — der `github-actions`-Manager fasst nur `uses:`-Zeilen
an). Ohne Gegenmaßnahme driftet `local == CI` beim ersten Bun-Update
auseinander.

Ein `customManagers`-Eintrag liest jede `bun-version:`-Zeile in
`.github/workflows/*.yml` als Bun-Datasource; alle Fundstellen landen über
`matchDepNames: ["bun"]` in einer gemeinsamen Gruppe. Ein PR bumpt künftig
alle gemeinsam.

### 6 — JDK bleibt bei 17

`matchManagers: ["mise"]` + `matchDepNames: ["java"]` → `enabled: false`. Der
Grund steht bereits als Kommentar in `mise.toml`: Gradle 8.14.3 läuft nur auf
JDK ≤ 24. Ohne diese Regel schlägt Renovate JDK 21/25 vor und öffnet genau den
`Unsupported class file major version`-Bruch, den der Kommentar beschreibt.

## Umsetzung

### `.github/renovate.json5` (neu)

JSON5 statt JSON, weil die Datei ohne Kommentare unlesbar wird und das Repo
diese Kultur bereits fährt. Prettier erfasst `.json5`, `format:check` bleibt
grün.

```json5
{
  $schema: "https://docs.renovatebot.com/renovate-schema.json",
  extends: ["config:recommended", ":semanticCommitTypeAll(chore)"],
  timezone: "Europe/Berlin",
  schedule: ["before 6am on monday"],
  prConcurrentLimit: 5,
  prHourlyLimit: 2,
  rebaseWhen: "conflicted",
  labels: ["chore", "dependencies"],
  automergeStrategy: "rebase",
  platformAutomerge: false,
  lockFileMaintenance: { enabled: true, automerge: true },
  osvVulnerabilityAlerts: true,
  vulnerabilityAlerts: {
    labels: ["chore", "dependencies", "security"],
    schedule: [], // CVEs umgehen das Montagsfenster
  },
  customManagers: [
    {
      customType: "regex",
      description: "bun-version: in ci.yml an mise.toml koppeln",
      managerFilePatterns: ["/^\\.github/workflows/ci\\.yml$/"],
      matchStrings: ["bun-version:\\s*(?<currentValue>\\S+)"],
      depNameTemplate: "bun",
      datasourceTemplate: "github-releases",
      packageNameTemplate: "oven-sh/bun",
      extractVersionTemplate: "^bun-v(?<version>.*)$",
    },
  ],
  packageRules: [
    /* siehe Tabelle unten */
  ],
}
```

`lockFileMaintenance` läuft trotz des globalen `schedule: ["before 6am on
monday"]` nicht danach, sondern nach seinem eigenen Default (`"before 4am on
monday"`) — ein Kindwert gewinnt gegen den geerbten Elternwert, vererbt wird
also gerade nicht. Im Ergebnis praktisch gleichwertig (beides früh am Montag),
nur eben aus einem anderen Grund.

### Package-Rules

Die Reihenfolge ist Teil der Semantik: spätere Regeln überschreiben frühere für
die Eigenschaften, die sie setzen. Jede Regel setzt `automerge` explizit, damit
die Überlappungen nicht von Defaults abhängen.

| #   | `match…`                                                       | Setzt                                                                                                                                          |
| --- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `matchDepTypes: ["devDependencies"]` + `minor`/`patch`         | `groupName: "dev-dependencies"`, `automerge: true`                                                                                             |
| 2   | `matchManagers: ["github-actions"]` + `minor`/`patch`/`digest` | `groupName: "github actions"`, `automerge: true`                                                                                               |
| 3   | Expo-verwaltet (Regex, s. u.)                                  | `rangeStrategy: "in-range-only"`, `groupName: "expo sdk (in-range)"`, `automerge: false`                                                       |
| 4   | `react-native-calendars`, `react-native-url-polyfill`          | `rangeStrategy: "replace"`, `groupName: null`, `automerge: false`                                                                              |
| 5   | `expo`, nur `major`                                            | `rangeStrategy: "replace"`, `groupName: null`, `dependencyDashboardApproval: true`, `labels: [… "expo-sdk"]`, `commitMessageTopic: "Expo SDK"` |
| 6   | `mise` · `java`                                                | `enabled: false`                                                                                                                               |
| 7   | `matchDepNames: ["bun"]`                                       | `groupName: "bun toolchain"`, `automerge: false`                                                                                               |

Regel 3 matcht:

```
"expo", "/^expo-/", "/^@expo\\//",
"react", "react-dom", "react-test-renderer", "@types/react",
"react-native", "/^react-native-/", "/^@react-native\\//", "/^@react-native-community\\//",
"jest-expo", "eslint-config-expo"
```

Zwei Konsequenzen dieser Reihenfolge, beide beabsichtigt:

- **Regel 3 schlägt Regel 1.** `jest-expo`, `eslint-config-expo`, `@types/react`
  und `react-test-renderer` sind devDeps _und_ Expo-verwaltet. Weil Regel 3
  später steht, landen sie in der Expo-Gruppe ohne Automerge — Expo-nahes geht
  durch einen Menschen, wie in Entscheidung 4 festgelegt.
- **Regel 4 korrigiert Regel 3.** Das Regex `/^react-native-/` fängt
  `react-native-calendars` und `react-native-url-polyfill` mit ein, die Expo
  nicht verwaltet. Regel 4 nimmt sie wieder heraus. Zwei benannte Ausnahmen
  statt zwanzig gepflegter Einträge — das ist der Gegenentwurf zur Blocklist aus
  Entscheidung 2, konsequent zu Ende geführt.

`typescript ~6.0.3` fällt bewusst **nicht** unter Regel 3. Ein Minor-Bump wird
also automatisch gemergt, sobald `bun run typecheck` in der CI grün ist — das
ist der Zweck des Gates.

### `.github/workflows/expo-sdk-sync.yml` (neu)

Trigger `pull_request` (`opened`, `labeled`, `synchronize`), Guard:

```yaml
if: >
  github.event.pull_request.head.repo.full_name == github.repository &&
  github.actor == 'renovate[bot]' &&
  contains(github.event.pull_request.labels.*.name, 'expo-sdk')
```

Permissions `contents: write` + `pull-requests: write`. Schritte: Checkout auf
`github.head_ref` → `oven-sh/setup-bun@v2` mit `1.3.10` → `bun install` (**nicht**
`--frozen-lockfile`, Renovate hat `package.json` bewegt) → `bunx expo install
--fix` → `bun install` → `bunx expo-doctor` (`continue-on-error`) → bei Diff
committen als `chore(deps): expo install --fix nach SDK-Bump` und pushen, sonst
sauber beenden. Abschließend ein `gh pr comment` mit der Zusammenfassung und dem
Hinweis aus dem Risiko unten.

Kein Loop-Schutz nötig: Pushes mit `GITHUB_TOKEN` triggern keine Workflow-Runs,
der eigene Push löst also kein zweites `synchronize` aus. Dieselbe Eigenschaft,
die unten als Risiko auftaucht, trägt sich hier selbst.

### `.github/workflows/renovate-validate.yml` (neu)

`pull_request` mit `paths: [".github/renovate.json5"]` — läuft also fast nie.
Ein Schritt: der offizielle `renovate-config-validator` im `--strict`-Modus.
Kein Devdep, Aufruf über `npx --yes --package renovate -- …`.

Begründung: eine schema-ungültige Config lässt Renovate auf Defaults
zurückfallen. Defaults heißt hier, dass Regel 3 nicht greift und
`react-native`-Majors ins Haus stehen. Der Fehlerfall ist teuer genug für 20
Zeilen YAML.

### Bestehende Dateien

- **`scripts/setup-labels.sh`** — drei `create`-Zeilen ergänzen:
  `dependencies`, `security`, `expo-sdk`. Das Skript ist idempotent
  (`gh label create --force`), erneutes Ausführen ist unkritisch.
- **`CLAUDE.md`**, Abschnitt „CI/CD (GitHub Actions)" — von drei auf fünf
  Workflows erweitern, Renovate-Betriebsmodell und die Expo-Kopplung beschreiben.
- **`docs/decision-log.md`** — ADR-013 (letzter vergebener ist ADR-012).
- **`docs/TODO.md`** — Einträge aus „Folge-TODOs" unten.

## Rollout

Die Bypass-Actor-Eintragung ist ohnehin ein separater manueller Schritt. Daraus
fällt eine natürliche Staffelung ab, die ich empfehle:

1. **Phase 1** — Config und Workflows mergen, App installieren, Ruleset noch
   **nicht** anfassen. Renovate schlägt vor, merged aber nichts: die
   Approval-Pflicht hält alles zurück. Eine Woche lang beobachten, ob die
   Gruppierung und `in-range-only` das tun, was diese Spec behauptet.
2. **Phase 2** — Bypass-Actor und Required Status Check setzen. Ab jetzt ist
   Automerge scharf.

Wichtig für die Reihenfolge: **Config vor App-Installation.** Findet Renovate
beim ersten Lauf bereits eine Config im Repo, überspringt es den
Onboarding-PR und arbeitet sofort nach dieser Konfiguration. Andersherum
entsteht ein Onboarding-PR mit Renovate-Defaults, der genau die Regeln nicht
kennt, die diese Spec aufstellt.

### Manuelle Schritte (Browser / lokal)

1. `bash scripts/setup-labels.sh` — legt die drei neuen Labels an.
2. App installieren: `github.com/apps/renovate`, Scope **nur** `ElternFlowAI`.
3. Nach Phase 1: im Ruleset `main protection` die Renovate-App als Bypass-Actor
   ergänzen.
4. Ebenfalls im Ruleset: den CI-Job als Required Status Check eintragen.

## Tests

Was mechanisch prüfbar ist, wird geprüft; für den Rest ist der erste echte Lauf
der Test — und Phase 1 des Rollouts ist genau dafür da.

- **Schema:** `renovate-validate.yml` im `--strict`-Modus.
- **Workflow-Syntax:** `expo-sdk-sync.yml` und `renovate-validate.yml` laufen
  durch `actionlint`, sofern lokal verfügbar; andernfalls prüft GitHub die
  Syntax beim Push.
- **Semantik der Package-Rules:** nicht offline testbar. Phase 1 liefert die
  Evidenz — konkret ist zu prüfen, dass (a) kein PR eine Expo-Range verlässt,
  (b) `java` in keinem PR auftaucht, (c) ein Bun-Update alle Fundstellen
  anfasst.
- **`expo-sdk-sync.yml`:** erst beim SDK-58-Sprung real auslösbar. Vorher per
  `workflow_dispatch`-Variante gegen einen Wegwerf-Branch mit künstlich
  gebumptem `expo` verifizierbar — als Teil der Umsetzung geplant, nicht später.

## Risiken

1. **Der Sync-Push triggert keine CI.** Ein Push mit `GITHUB_TOKEN` löst keine
   Workflow-Runs aus. Nach dem `expo install --fix`-Commit laufen die Gates also
   nicht von selbst über den vollständigen Diff. Abhilfe: PR einmal schließen
   und wieder öffnen. Bei ~2–3 SDK-Sprüngen pro Jahr, die ohnehin einen
   Geräte-Smoke-Test verdienen, vertretbar. Der Ausweg wäre ein PAT — der nähme
   der gehosteten Variante aber ihren „keine Secrets"-Vorteil.
2. **Der Bypass-Actor senkt den Schutz von `main`.** Renovate darf ohne Review
   mergen. Gemildert durch den engen Umfang (Regel 1 und 2), dadurch dass
   Renovate den Branch-Status vor dem Merge selbst prüft, und durch den
   Required Status Check aus Schritt 4.
3. **Der Custom-Manager-Regex hängt an der Textform der `bun-version:`-Zeilen.**
   Wird eine davon umformatiert, greift er für genau diese Datei still nicht
   mehr — Renovate meldet keinen Fehler, es passiert einfach nichts. Prettier
   formatiert die Dateien stabil, aber ein stiller Ausfall bleibt möglich.
   Sichtbar wird er dadurch, dass ein Bun-Update nur noch `mise.toml` und einen
   Teil der Workflow-Dateien anfasst.
4. **Renovate-Config-Keys wandern zwischen Versionen** (`fileMatch` →
   `managerFilePatterns` ist ein Beispiel aus jüngerer Zeit). Die gehostete App
   läuft immer auf aktuellem Renovate; ein umbenannter Key fällt daher
   irgendwann an. Genau dagegen steht `renovate-validate.yml`.
5. **`expo install --fix` unter Bun.** Die Expo-CLI erkennt Bun über `bun.lock`,
   ist aber deutlich seltener in dieser Kombination im Einsatz als mit npm.
   Stolpert sie, degradiert der Sync-Workflow zu einem Fehlschlag im PR — der
   SDK-Sprung ist dann manuell zu machen, was dem Zustand vor dieser Spec
   entspricht. Kein Datenverlust, nur Komfortverlust.

## Folge-TODOs (nach `docs/TODO.md`)

- `platformAutomerge: false` ist eine Startvorsicht, keine Dauerlösung. Sobald
  ein Monat Automerge sauber gelaufen ist, gegen `true` testen — GitHubs natives
  Auto-Merge hält den PR offen, bis alle Checks grün sind, statt Renovate auf
  einen eigenen Poll-Zyklus warten zu lassen.
- Der CI-Retrigger nach dem `expo-sdk-sync`-Push ist manuell (Risiko 1). Falls
  sich das im ersten realen SDK-Sprung als lästig erweist, auf einen
  GitHub-App-Token für den Push umstellen.
- `dependency-review.yml` und Renovates `vulnerabilityAlerts` überlappen im
  Zweck (CVE-Gate). Nach ein paar Monaten prüfen, ob beide gebraucht werden oder
  eines redundant ist.
