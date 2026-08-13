# Renovate-Setup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Renovate hält die Dependencies aktuell, ohne die Expo-SDK-Kohärenz oder den `local == CI`-Gleichstand zu brechen.

**Architecture:** Die gehostete Mend-Renovate-App liest `.github/renovate.json5`. Expo-verwaltete Pakete laufen `rangeStrategy: "in-range-only"` und bleiben damit innerhalb der Grenzen, die Expo bereits in die `package.json` geschrieben hat. Ein SDK-Sprung wird von Renovate nur **erkannt** (PR hebt allein das Paket `expo`, hinter `dependencyDashboardApproval`); **aufgelöst** wird er von `expo-sdk-sync.yml`, das `expo install --fix` im PR-Branch nachschiebt. Automerge greift nur für devDeps (minor+patch), GitHub-Actions und Lockfile-Maintenance.

**Tech Stack:** Renovate (Mend-hosted), GitHub Actions, Bun 1.3.10, Expo SDK 57, `gh` CLI.

**Spec:** [docs/superpowers/specs/2026-08-13-renovate-setup-design.md](../specs/2026-08-13-renovate-setup-design.md)

## Global Constraints

- **Branch:** `chore/renovate-setup`. Alle Commits dorthin, kein Push auf `main`.
- **Keine `Co-Authored-By: Claude`-Trailer** in Commit-Messages (CLAUDE.md, Abschnitt „Commits").
- **Pre-commit-Hooks nie mit `--no-verify` umgehen.** `lint-staged` läuft Prettier über `*.{json,md,yml,yaml,css}` — das erfasst auch `.json5` und die neuen Workflows.
- **Conventional Commits**, Scope `renovate`: `chore(renovate): …`, `docs(renovate): …`.
- **Handoff-Bundle bleibt unberührt** — dieser Plan fasst weder `design-system/*` noch `docs/HANDOFF.md`, `docs/COPY.md`, `docs/ICONS.md` noch `patterns/*.md` an.
- **Bun-Version überall `1.3.10`** — identisch zu `mise.toml` und `ci.yml`.
- **Kein `push`-Trigger auf `main`** in neuen Workflows; PR-getriggert, wie die drei bestehenden.
- **Renovate-Config-Kommentare auf Deutsch**, wie `mise.toml` und `ci.yml`.

---

### Task 1: Renovate-Config + Validator-Workflow

Die Config und der Workflow, der sie prüft, gehören in einen Commit: der Validator ist das einzige mechanische Testmittel für die Config, und eine Config ohne Prüfung wäre nach eigener Spec-Begründung (Risiko 4) die halbe Sache.

**Files:**

- Create: `.github/renovate.json5`
- Create: `.github/workflows/renovate-validate.yml`

**Interfaces:**

- Consumes: nichts aus früheren Tasks.
- Produces: das Label `expo-sdk` wird von Regel 5 gesetzt und in Task 3 als Workflow-Guard gelesen. Der Wert ist exakt `expo-sdk`. Ebenso liest Task 3 den Branch, den Renovate für den `expo`-Major-PR baut — der Guard hängt aber am Label und am PR-Autor, nicht am Branchnamen.

- [ ] **Step 1: Config schreiben**

Create `.github/renovate.json5`:

```json5
{
  $schema: "https://docs.renovatebot.com/renovate-schema.json",

  extends: [
    "config:recommended",
    // Alle Renovate-Commits als `chore(deps): …`. Passend zu CLAUDE.md
    // ("chore = Wartung / Tooling / CI"). Ohne diesen Preset trennt
    // config:recommended nach `fix(deps)` für prod- und `chore(deps)` für
    // devDependencies — zwei Prefixes für dieselbe Art Arbeit.
    ":semanticCommitTypeAll(chore)",
  ],

  timezone: "Europe/Berlin",
  // Ein Schwung pro Woche statt Tröpfeln über sieben Tage.
  schedule: ["before 6am on monday"],

  prConcurrentLimit: 5,
  prHourlyLimit: 2,

  // Renovate rebased nur bei Konflikt. Notwendig für expo-sdk-sync.yml: dessen
  // `expo install --fix`-Commit liegt in Renovates eigenem Branch und darf nicht
  // wegrebased werden.
  rebaseWhen: "conflicted",

  labels: ["chore", "dependencies"],

  // Das Ruleset `main protection` erlaubt ausschließlich Rebase-Merges
  // (allowed_merge_methods) und erzwingt lineare Historie.
  automergeStrategy: "rebase",
  // Renovate merged über die API selbst, damit der Ruleset-Bypass eindeutig auf
  // den handelnden Actor greift. GitHubs natives Auto-Merge in Kombination mit
  // Bypass-Actors ist zu unklar dokumentiert, um hier blind darauf zu bauen.
  // Umstellung auf true steht in docs/TODO.md.
  platformAutomerge: false,

  lockFileMaintenance: {
    enabled: true,
    automerge: true,
  },

  osvVulnerabilityAlerts: true,
  vulnerabilityAlerts: {
    labels: ["chore", "dependencies", "security"],
    // Leerer Schedule = sofort. CVEs warten nicht bis Montag.
    schedule: [],
  },

  customManagers: [
    {
      customType: "regex",
      // `bun 1.3.10` steht doppelt im Repo: in mise.toml (sieht Renovates
      // mise-Manager) und als `bun-version:`-Input in ci.yml (sieht er NICHT —
      // der github-actions-Manager fasst nur `uses:`-Zeilen an, keine `with:`-
      // Inputs). Ohne diesen Manager driftet "local == CI" beim ersten
      // Bun-Update auseinander.
      description: "bun-version: in ci.yml an mise.toml koppeln",
      managerFilePatterns: ["/^\\.github/workflows/ci\\.yml$/"],
      matchStrings: ["bun-version:\\s*(?<currentValue>\\S+)"],
      depNameTemplate: "bun",
      datasourceTemplate: "github-releases",
      packageNameTemplate: "oven-sh/bun",
      extractVersionTemplate: "^bun-v(?<version>.*)$",
    },
  ],

  // ACHTUNG — die Reihenfolge ist Teil der Semantik: spätere Regeln
  // überschreiben frühere für die Eigenschaften, die sie setzen. Jede Regel
  // setzt `automerge` explizit, damit Überlappungen nicht von Defaults abhängen.
  packageRules: [
    {
      // 1 — devDependencies sammeln und automergen. Die CI-Gates
      // (format/lint/typecheck/test/web-build) sind das Sicherheitsnetz.
      description: "devDependencies (minor+patch)",
      matchDepTypes: ["devDependencies"],
      matchUpdateTypes: ["minor", "patch"],
      groupName: "dev-dependencies",
      automerge: true,
    },
    {
      // 2 — Action-Pins. Majors bleiben manuell, die ändern gern Inputs.
      description: "GitHub Actions (minor/patch/digest)",
      matchManagers: ["github-actions"],
      matchUpdateTypes: ["minor", "patch", "digest"],
      groupName: "github actions",
      automerge: true,
    },
    {
      // 3 — Von Expo SDK verwaltet: die Version bestimmt das SDK, nicht
      // npm-latest. `in-range-only` heißt: nur Updates, die die bereits in
      // package.json stehende Range erfüllen. `~57.0.7` bekommt 57.0.9
      // (lockfile-only), aber nie 58.x. Exakt gepinnte Pakete wie
      // react-native 0.86.0 bewegen sich damit gar nicht — gewollt, denn genau
      // dort bricht ein eigenmächtiger Bump den Native-Build, den die CI
      // (nur Web-Export) nicht prüft.
      //
      // Steht bewusst NACH Regel 1: jest-expo, eslint-config-expo, @types/react
      // und react-test-renderer sind devDeps *und* Expo-verwaltet. Diese Regel
      // gewinnt, sie landen also ohne Automerge in der Expo-Gruppe.
      description: "Expo-SDK-verwaltete Pakete — nur in-range",
      matchPackageNames: [
        "expo",
        "/^expo-/",
        "/^@expo\\//",
        "react",
        "react-dom",
        "react-test-renderer",
        "@types/react",
        "react-native",
        "/^react-native-/",
        "/^@react-native\\//",
        "/^@react-native-community\\//",
        "jest-expo",
        "eslint-config-expo",
      ],
      rangeStrategy: "in-range-only",
      groupName: "expo sdk (in-range)",
      automerge: false,
    },
    {
      // 4 — Korrigiert Regel 3: deren Regex /^react-native-/ fängt diese beiden
      // mit ein, obwohl Expo sie nicht verwaltet. Zwei benannte Ausnahmen statt
      // einer gepflegten Zwanzig-Pakete-Liste.
      description: "Trotz react-native-Präfix nicht von Expo verwaltet",
      matchPackageNames: ["react-native-calendars", "react-native-url-polyfill"],
      rangeStrategy: "replace",
      groupName: null,
      automerge: false,
    },
    {
      // 5 — Der SDK-Sprung. Renovate hebt NUR `expo`; expo-sdk-sync.yml zieht
      // react-native, expo-*, react und @types/react per `expo install --fix`
      // nach. dependencyDashboardApproval heißt: kein PR, bis die Checkbox im
      // Dashboard gesetzt wird.
      description: "Expo-Major = SDK-Sprung, nur auf Zuruf",
      matchPackageNames: ["expo"],
      matchUpdateTypes: ["major"],
      rangeStrategy: "replace",
      groupName: null,
      dependencyDashboardApproval: true,
      automerge: false,
      labels: ["chore", "dependencies", "expo-sdk"],
      commitMessageTopic: "Expo SDK",
    },
    {
      // 6 — JDK bleibt 17: der Gradle-Wrapper (8.14.3) läuft nur auf JDK <= 24.
      // Ausführliche Begründung im Kommentar in mise.toml.
      description: "JDK-Pin nicht anfassen (Gradle 8.14.3 braucht JDK <= 24)",
      matchManagers: ["mise"],
      matchDepNames: ["java"],
      enabled: false,
    },
    {
      // 7 — mise.toml und ci.yml müssen dieselbe Bun-Version tragen. Der
      // customManager oben liefert die zweite Fundstelle unter demselben
      // depName, beide landen so in einem PR.
      description: "Bun-Toolchain (mise.toml + ci.yml gemeinsam)",
      matchDepNames: ["bun"],
      groupName: "bun toolchain",
      automerge: false,
    },
  ],
}
```

- [ ] **Step 2: Config gegen den offiziellen Validator laufen lassen — muss fehlschlagen können**

Run:

```bash
npx --yes --package renovate -- renovate-config-validator --strict .github/renovate.json5
```

Expected: `INFO: Config validated successfully`.

Falls der Validator einen **unbekannten Key** meldet — am wahrscheinlichsten `managerFilePatterns` (hieß in älteren Renovate-Versionen `fileMatch`) oder `osvVulnerabilityAlerts`: den gemeldeten Key gegen den Vorschlag in der Fehlermeldung austauschen und erneut laufen lassen. Nicht raten — die Meldung nennt den erwarteten Namen.

Falls der Validator `matchPackageNames`-Regex-Syntax beanstandet: Renovate erwartet Regex-Patterns in Schrägstrichen (`"/^expo-/"`), einfache Strings gelten als exakte Namen. Beides ist oben absichtlich gemischt.

- [ ] **Step 3: Validator-Workflow schreiben**

Create `.github/workflows/renovate-validate.yml`:

```yaml
name: Renovate Config

# Läuft nur, wenn die Renovate-Config selbst angefasst wird — also fast nie.
# Grund für den Aufwand: eine schema-ungültige Config lässt Renovate auf seine
# Defaults zurückfallen, und Defaults heißt hier, dass die Expo-Regel nicht
# greift und react-native-Majors ins Haus stehen. Siehe ADR-013.
on:
  pull_request:
    types: [opened, synchronize, reopened]
    paths:
      - ".github/renovate.json5"
      - ".github/workflows/renovate-validate.yml"

permissions:
  contents: read

concurrency:
  group: renovate-validate-${{ github.ref }}
  cancel-in-progress: true

jobs:
  validate:
    name: renovate-config-validator
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      # Kein Devdep im Repo: das renovate-Paket ist groß und würde bei jedem
      # `bun install` mitgezogen, obwohl es nur hier gebraucht wird.
      - name: Validate
        run: npx --yes --package renovate -- renovate-config-validator --strict .github/renovate.json5
```

- [ ] **Step 4: Formatierung prüfen**

Run:

```bash
bun run format:check
```

Expected: PASS. Prettier kennt `.json5` (Parser `json5`) und formatiert es mit; schlägt der Check fehl, `bun run format` laufen lassen und die Änderung mit committen.

- [ ] **Step 5: Commit**

```bash
git add .github/renovate.json5 .github/workflows/renovate-validate.yml
git commit -m "chore(renovate): Config mit Expo-in-range-Regeln und Validator-Workflow"
```

---

### Task 2: Labels anlegen

Eigener Task, weil dies der einzige Schritt mit **Seiteneffekt auf GitHub** ist — er verändert das Repo, nicht nur den Branch. Ein Reviewer kann die Config gutheißen und trotzdem andere Label-Namen wollen.

**Files:**

- Modify: `scripts/setup-labels.sh` (nach der Zeile `create "test" …`)

**Interfaces:**

- Consumes: die Label-Namen aus Task 1 — `dependencies` und `security` aus `labels`/`vulnerabilityAlerts.labels`, `expo-sdk` aus Regel 5. Alle drei müssen zeichengleich sein, sonst schlägt Renovates Label-Zuweisung still fehl.
- Produces: `expo-sdk` als Guard-Wert für Task 3.

- [ ] **Step 1: Drei `create`-Zeilen ergänzen**

In `scripts/setup-labels.sh`, direkt nach `create "test" "fbca04" "Tests (Branch: test/)"`:

```bash

# Von Renovate gesetzt (.github/renovate.json5) — nicht vom Branch-Labeler.
create "dependencies" "0366d6" "Dependency-Update (Renovate)"
create "security" "b60205" "Sicherheitsrelevant / CVE-Fix"
create "expo-sdk" "000020" "Expo-SDK-Sprung — expo-sdk-sync.yml zieht nach"
```

Den einleitenden Kommentar der Datei (`Legt die vom PR-Labeler (.github/labeler.yml) genutzten Labels einmalig an.`) auf die neue Doppelrolle erweitern:

```bash
# Legt die Labels an, die der PR-Labeler (.github/labeler.yml) aus dem
# Branch-Namen und Renovate (.github/renovate.json5) aus seinen Regeln setzen.
```

- [ ] **Step 2: Skript ausführen**

Run:

```bash
bash scripts/setup-labels.sh
```

Expected: neun `https://github.com/SvenSonnborn/ElternFlowAI/labels/…`-Zeilen, Abschluss mit `✓ Labels angelegt/aktualisiert.` Das Skript ist idempotent (`gh label create --force`), die sechs bestehenden Labels werden nur aktualisiert.

Falls `gh` nicht authentifiziert ist: `gh auth status` prüfen, ggf. `gh auth login`. Ohne Auth bricht das Skript mit `set -euo pipefail` bei der ersten `create`-Zeile ab.

- [ ] **Step 3: Ergebnis verifizieren**

Run:

```bash
gh label list --limit 100 | grep -E "^(dependencies|security|expo-sdk)"
```

Expected: genau drei Zeilen, jeweils mit der oben gesetzten Beschreibung.

- [ ] **Step 4: Commit**

```bash
git add scripts/setup-labels.sh
git commit -m "chore(renovate): Labels dependencies, security und expo-sdk ergaenzen"
```

---

### Task 3: `expo-sdk-sync.yml`

**Files:**

- Create: `.github/workflows/expo-sdk-sync.yml`

**Interfaces:**

- Consumes: das Label `expo-sdk` aus Task 1 (Regel 5) und Task 2. Der Guard liest zusätzlich `github.event.pull_request.user.login == 'renovate[bot]'` — **nicht** `github.actor`, weil der beim `labeled`-Event derjenige ist, der das Label gesetzt hat, und nicht der PR-Autor.
- Produces: nichts für spätere Tasks; Task 4 beschreibt den Workflow nur.

> **Abweichung von der Spec.** Deren Test-Abschnitt kündigt für diesen Workflow
> einen vollständigen Trockenlauf an („per `workflow_dispatch`-Variante gegen
> einen Wegwerf-Branch mit künstlich gebumptem `expo`"). Dieser Plan ersetzt ihn
> durch zwei gezieltere Prüfungen: Step 1 testet die **einzige real unsichere
> Stelle** — ob `expo install --fix` unter Bun trägt (Risiko 5 der Spec) — und
> Step 3 prüft den Guard **negativ**, also dass der Workflow auf normalen PRs
> nicht anspringt. Ungetestet bleibt damit die Commit-/Push-/Kommentar-Mechanik;
> das sind Standard-Actions-Idiome ohne projektspezifische Unbekannte, und ein
> echter Trockenlauf hätte einen Wegwerf-PR mit absichtlich entschärftem Guard
> gebraucht, dessen Rückbau selbst eine Fehlerquelle ist. Wer den vollen
> Trockenlauf trotzdem will, macht ihn nach dem Merge auf einem Scratch-Branch —
> nicht als Teil dieses Tasks.

- [ ] **Step 1: Die riskante Annahme zuerst prüfen — läuft `expo install --fix` unter Bun?**

Das ist Risiko 5 der Spec und der einzige Teil dieses Tasks, der jetzt schon real testbar ist. Auf dem aktuellen, SDK-57-konsistenten Stand muss der Befehl ein No-op sein.

Run:

```bash
git status --porcelain   # muss leer sein, sonst zuerst committen
bunx expo install --fix
git diff --stat
```

Expected: Exit-Code 0 und **kein Diff**. Das beweist, dass die Expo-CLI Bun über `bun.lock` erkennt und der Befehl im Workflow tragfähig ist.

Falls doch ein Diff entsteht: nicht committen. Das heißt, das Repo weicht heute schon von SDK 57 ab — dann `git checkout -- package.json bun.lock`, den Befund notieren und als eigenen Eintrag in `docs/TODO.md` aufnehmen (Task 4). Der Workflow bleibt trotzdem richtig.

Falls der Befehl scheitert (Expo-CLI erkennt Bun nicht): den Workflow trotzdem bauen, aber Risiko 5 der Spec ist damit eingetreten — Befund in `docs/TODO.md` festhalten und in Task 4 in ADR-013 unter Consequences ergänzen.

- [ ] **Step 2: Workflow schreiben**

Create `.github/workflows/expo-sdk-sync.yml`:

````yaml
name: Expo SDK Sync

# Renovates Expo-Major-PR hebt nur das Paket `expo` selbst — für sich genommen
# ein kaputter Zustand, weil react-native und alle expo-* noch auf dem alten SDK
# stehen. Dieser Workflow lässt `expo install --fix` die SDK-verwalteten Pakete
# nachziehen und schiebt das Ergebnis in denselben PR-Branch.
#
# Warum nicht Renovates eigenes `postUpgradeTasks`: das wird von
# `allowedCommands` gegated, einer self-hosted-only Admin-Option. Auf der
# gehosteten Mend-App nicht verfügbar. Siehe ADR-013.
on:
  pull_request:
    types: [opened, labeled, synchronize]

permissions:
  contents: write
  pull-requests: write

concurrency:
  group: expo-sdk-sync-${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  sync:
    name: expo install --fix nach SDK-Bump
    # Nur Renovates eigener SDK-PR, nur aus diesem Repo (kein Fork — ein Fork-PR
    # mit `contents: write` wäre eine Rechteausweitung).
    #
    # `pull_request.user.login` statt `github.actor`: beim `labeled`-Event ist
    # der Actor derjenige, der das Label gesetzt hat, nicht der PR-Autor.
    if: >-
      github.event.pull_request.head.repo.full_name == github.repository &&
      github.event.pull_request.user.login == 'renovate[bot]' &&
      contains(github.event.pull_request.labels.*.name, 'expo-sdk')
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - name: Checkout PR branch
        uses: actions/checkout@v4
        with:
          ref: ${{ github.head_ref }}

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.10

      # Bewusst ohne --frozen-lockfile: Renovate hat package.json bewegt,
      # bun.lock ist gegenüber der neuen expo-Version veraltet.
      - name: Install
        run: bun install

      - name: expo install --fix
        run: bunx expo install --fix

      - name: Lockfile nachziehen
        run: bun install

      # Nur Bericht, kein Gate: expo-doctor meldet auch Dinge, die einen
      # SDK-Sprung nicht blockieren. Log liegt außerhalb des Arbeitsbaums, damit
      # es nicht im Commit unten landet.
      - name: expo-doctor
        id: doctor
        continue-on-error: true
        run: bunx expo-doctor 2>&1 | tee "$RUNNER_TEMP/doctor.log"

      - name: Commit & push
        id: sync
        run: |
          if git diff --quiet -- package.json bun.lock; then
            echo "changed=false" >> "$GITHUB_OUTPUT"
            echo "Keine Abweichung — die SDK-Pakete sind bereits konsistent." >> "$GITHUB_STEP_SUMMARY"
            exit 0
          fi
          echo "changed=true" >> "$GITHUB_OUTPUT"
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add package.json bun.lock
          git commit -m "chore(deps): expo install --fix nach SDK-Bump"
          git push

      - name: PR kommentieren
        if: steps.sync.outputs.changed == 'true'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          DOCTOR_OUTCOME: ${{ steps.doctor.outcome }}
          PR_NUMBER: ${{ github.event.pull_request.number }}
        run: |
          {
            echo "**Expo SDK Sync** hat die SDK-verwalteten Pakete nachgezogen:"
            echo
            echo '```'
            git show --stat --format= HEAD
            echo '```'
            echo
            echo "\`expo-doctor\`: **$DOCTOR_OUTCOME** (nur Bericht, kein Gate — Details im Job-Log)."
            echo
            echo "> Der Push lief mit \`GITHUB_TOKEN\` und triggert daher **keinen** neuen CI-Lauf."
            echo "> PR einmal schließen und wieder öffnen, damit die Gates über den vollständigen Diff laufen."
          } > "$RUNNER_TEMP/comment.md"
          gh pr comment "$PR_NUMBER" --body-file "$RUNNER_TEMP/comment.md"
````

- [ ] **Step 3: Guard-Logik gegen Fehlauslösung prüfen**

Der Workflow darf auf **keinem** normalen PR laufen. Die drei `if`-Bedingungen sind UND-verknüpft; jede einzelne reicht zum Blocken. Gegenprobe am eigenen PR dieses Branches (Autor ist ein Mensch, kein `expo-sdk`-Label): der Job muss als übersprungen erscheinen, nicht als grün.

Run nach dem Push in Task 4:

```bash
gh run list --branch chore/renovate-setup --workflow "Expo SDK Sync" --limit 5
```

Expected: keine Runs, oder Runs mit Conclusion `skipped`. **Ein `success` wäre ein Fehler** — dann greift der Guard nicht und der Workflow muss korrigiert werden, bevor irgendetwas gemergt wird.

- [ ] **Step 4: Formatierung prüfen**

Run:

```bash
bun run format:check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/expo-sdk-sync.yml
git commit -m "chore(renovate): expo-sdk-sync-Workflow zieht SDK-Pakete nach Expo-Bump nach"
```

---

### Task 4: Dokumentation

**Files:**

- Modify: `CLAUDE.md:206-214` (Abschnitt „CI/CD (GitHub Actions)")
- Modify: `docs/decision-log.md` (ADR-013 anhängen, nach ADR-012)
- Modify: `docs/TODO.md` (neuer Abschnitt am Ende)

**Interfaces:**

- Consumes: alle drei vorherigen Tasks — die Beschreibungen müssen die ausgelieferten Dateien treffen, nicht diesen Plan.
- Produces: nichts.

- [ ] **Step 1: `CLAUDE.md` — Workflow-Liste erweitern**

Zeile 208 ändern von `Drei PR-getriggerte Workflows` auf `Fünf PR-getriggerte Workflows`.

Nach dem `dependency-review.yml`-Bullet (Zeile 212) zwei Bullets einfügen:

```markdown
- **`renovate-validate.yml`** — validiert [.github/renovate.json5](.github/renovate.json5) mit dem offiziellen `renovate-config-validator` (`--strict`). Läuft nur über `paths:`-Filter, wenn die Config selbst angefasst wird. Grund: eine schema-ungültige Config lässt Renovate auf seine Defaults zurückfallen — und Defaults heißt hier, dass die `in-range-only`-Regel für Expo-Pakete nicht greift.
- **`expo-sdk-sync.yml`** — läuft ausschließlich auf Renovates Expo-Major-PR (Guard: PR-Autor `renovate[bot]` + Label `expo-sdk` + kein Fork) und schiebt dort `bunx expo install --fix` nach, damit `react-native`, alle `expo-*`, `react` und `@types/react` auf die vom neuen SDK vorgeschriebenen Versionen kommen. Der Push läuft mit `GITHUB_TOKEN` und triggert daher **keinen** neuen CI-Lauf — den PR nach dem Sync-Commit einmal schließen und wieder öffnen.
```

Nach dem CodeRabbit-Absatz (Zeile 214) einen neuen Absatz anfügen:

```markdown
**Renovate.** Dependency-Updates laufen über die gehostete Mend-Renovate-App; die Konfiguration liegt in [.github/renovate.json5](.github/renovate.json5) (siehe [ADR-013](docs/decision-log.md)). Zwei Regeln sind nicht verhandelbar, ohne den Build zu riskieren: **Expo-SDK-verwaltete Pakete laufen `rangeStrategy: "in-range-only"`** — ihre Versionen bestimmt Expo, nicht npm-latest —, und **`java` in `mise.toml` ist für Renovate deaktiviert**, weil der Gradle-Wrapper JDK ≤ 24 braucht. Ein SDK-Sprung wird von Renovate nur gemeldet (Dependency Dashboard, `dependencyDashboardApproval`) und von `expo-sdk-sync.yml` aufgelöst. Automerge gilt nur für devDependencies (minor+patch), GitHub-Actions und Lockfile-Maintenance; alles andere braucht ein menschliches Review. Die Reihenfolge der `packageRules` ist Teil der Semantik — spätere Regeln überschreiben frühere.
```

- [ ] **Step 2: `docs/decision-log.md` — ADR-013 anhängen**

Ans Dateiende, nach ADR-012 und dessen abschließendem `---`:

```markdown
## ADR-013 — Renovate als gehostete App, Expo-Kompatibilität bleibt bei `expo install --fix` (2026-08-13)

### Status

Accepted.

### Context

Dependency-Updates liefen bisher vollständig manuell. Zwei Eigenschaften des Repos machen ein naiv konfiguriertes Renovate gefährlich statt hilfreich:

1. **Rund die Hälfte der Deps wird von Expo SDK 57 bestimmt, nicht von npm-latest.** `react-native 0.86.0` steht in der `package.json`, weil SDK 57 es so will. Ein Bump auf 0.87 ist kein Update, sondern ein Bruch — und die CI fängt ihn nicht, weil sie nur einen Web-Export baut, keinen Native-Build.
2. **`bun 1.3.10` steht doppelt** (`mise.toml` und `bun-version:` in `ci.yml`), und der JDK-Pin auf 17 ist eine bewusste Entscheidung gegen neuere JDKs (Gradle 8.14.3 läuft nur auf JDK ≤ 24).

Renovate kennt die Expo-Kompatibilitätsmatrix nicht; sie liegt in `bundledNativeModules.json` im installierten `expo`-Paket und wird nur von `expo install --fix` gelesen.

### Decisions

1. **Gehostete Mend-App statt self-hosted Action.** Das Repo ist public, die App damit kostenlos: kein PAT als Secret, keine Actions-Minuten, kein Renovate-Image zu pflegen. Der einzige relevante Nachteil — kein Zugriff auf private Registries — trifft dieses Projekt nicht. Die Konsequenz prägt Entscheidung 3: `postUpgradeTasks` wird von `allowedCommands` gegated, und das ist eine **self-hosted-only Admin-Option**. Renovate kann in dieser Variante nicht selbst `expo install --fix` ausführen.
2. **Expo-verwaltete Pakete laufen `rangeStrategy: "in-range-only"`, nicht auf einer Blocklist.** Renovate darf nur Updates bauen, die die bereits in `package.json` stehende Range erfüllen: `~57.0.7` bekommt `57.0.9` (lockfile-only), aber nie `58.x`; exakt gepinnte Pakete wie `react-native 0.86.0` bewegen sich gar nicht. Der Vorteil gegenüber einer Paketliste ist, dass Expo die Sicherheitsgrenze bereits selbst in die `package.json` geschrieben hat — die Regel bleibt korrekt, wenn das Projekt auf SDK 58 geht, ohne dass jemand eine Liste nachpflegt. Preis: die exakt gepinnten Pakete bewegen sich ausschließlich über `expo install --fix`. Das ist gewollt, denn genau dort bricht ein eigenmächtiger Bump den ungeprüften Native-Build.
3. **Erkennung bei Renovate, Auflösung bei Expo.** Renovate meldet einen SDK-Sprung im Dependency Dashboard und öffnet — erst nach Checkbox (`dependencyDashboardApproval`) — einen PR, der **nur** das Paket `expo` hebt. `expo-sdk-sync.yml` triggert auf genau diesen PR (Guard: Autor `renovate[bot]`, Label `expo-sdk`, kein Fork), läuft `expo install --fix` und pusht das Ergebnis in denselben Branch. Damit kommt `react-native` genau dann dran, wenn Expo es zulässt. Die verworfene Alternative — alle Expo-Pakete in einen gemeinsamen Major-Gruppen-PR — sieht gleichwertig aus, hätte aber jedes Paket auf npm-latest gehoben: steht `react-native 0.88` auf npm, während Expo 58 auf `0.87` festlegt, entsteht ein falscher PR.
4. **Automerge nur für devDependencies (minor+patch), GitHub-Actions und Lockfile-Maintenance.** Alles andere — prod-Deps, sämtliche Majors, alles Expo-nahe, die Toolchain — geht durch ein menschliches Review. Weil das Ruleset `main protection` ein Approval verlangt und Renovate sich nicht selbst approven kann, muss die App als Bypass-Actor eingetragen werden; `automergeStrategy: "rebase"` folgt aus `allowed_merge_methods` und `required_linear_history`. Ausdrücklich **nicht** gewählt wurde ein Auto-Approve-Workflow: der hätte das Ruleset formal intakt gelassen und die Review-Pflicht auf demselben Weg ausgehebelt, nur verdeckter.
5. **Ein `customManagers`-Eintrag koppelt `bun-version:` in `ci.yml` an `mise.toml`.** Renovates `github-actions`-Manager fasst nur `uses:`-Zeilen an, keine `with:`-Inputs — ohne diesen Manager driftet `local == CI` beim ersten Bun-Update auseinander. Beide Fundstellen laufen über `matchDepNames: ["bun"]` in einen gemeinsamen PR.
6. **`java` ist für Renovate deaktiviert.** Ohne diese Regel schlägt Renovate JDK 21/25 vor und öffnet genau den `Unsupported class file major version`-Bruch, den der Kommentar in `mise.toml` beschreibt.

### Consequences

- Die Reihenfolge der `packageRules` ist Teil der Semantik: spätere Regeln überschreiben frühere. Regel 3 (Expo) steht nach Regel 1 (devDeps), damit `jest-expo`, `eslint-config-expo`, `@types/react` und `react-test-renderer` ohne Automerge in der Expo-Gruppe landen; Regel 4 nimmt `react-native-calendars` und `react-native-url-polyfill` wieder aus Regel 3 heraus, die deren `/^react-native-/`-Regex fälschlich mitfängt. Wer Regeln umsortiert, ändert Verhalten.
- Der Sync-Push in `expo-sdk-sync.yml` läuft mit `GITHUB_TOKEN` und triggert daher keine neuen Workflow-Runs. Nach dem Sync-Commit ist der PR einmal zu schließen und wieder zu öffnen, damit die Gates über den vollständigen Diff laufen. Dieselbe Eigenschaft verhindert eine Endlosschleife aus Push → `synchronize` → Workflow → Push.
- Der Bypass-Actor senkt den Schutz von `main`: Renovate darf ohne Review mergen. Gemildert durch den engen Automerge-Umfang, dadurch dass Renovate den Branch-Status vor dem Merge selbst prüft, und dadurch, dass der CI-Job als Required Status Check nachgetragen wird — bis dahin blockte im Ruleset **kein** Status-Check einen Merge.
- `typescript` fällt bewusst nicht unter die Expo-Regel. Minor-Bumps werden automatisch gemergt, sobald `bun run typecheck` in der CI grün ist.
- Dependabot wird nicht parallel betrieben. `dependency-review.yml` bleibt bestehen und gated künftig auch Renovate-PRs.
- `.github/labeler.yml` bleibt unberührt: Renovate setzt seine Labels selbst, und `renovate/*`-Branches matchen keine der `head-branch`-Regeln. Zwei Label-Mechanismen auf denselben PRs wären eine Quelle stiller Konflikte.

---
```

- [ ] **Step 3: `docs/TODO.md` — Folge-Einträge**

Ans Dateiende anhängen:

```markdown
## Renovate / Dependencies (siehe [ADR-013](./decision-log.md))

- **`platformAutomerge` steht auf `false`** ([.github/renovate.json5](../.github/renovate.json5)): eine Startvorsicht, keine Dauerlösung. Renovate merged aktuell über die API selbst, damit der Ruleset-Bypass eindeutig auf den handelnden Actor greift — GitHubs natives Auto-Merge in Kombination mit Bypass-Actors ist zu unklar dokumentiert, um es blind anzuschalten. Sobald ein Monat Automerge sauber gelaufen ist, gegen `true` testen: das native Auto-Merge hält den PR offen, bis alle Checks grün sind, statt Renovate auf einen eigenen Poll-Zyklus warten zu lassen.
- **Der CI-Retrigger nach dem `expo-sdk-sync`-Push ist manuell** ([.github/workflows/expo-sdk-sync.yml](../.github/workflows/expo-sdk-sync.yml)): ein Push mit `GITHUB_TOKEN` löst keine Workflow-Runs aus, der PR muss nach dem Sync-Commit einmal geschlossen und wieder geöffnet werden. Bei ~2–3 SDK-Sprüngen pro Jahr vertretbar; falls es sich im ersten realen Sprung als lästig erweist, auf einen GitHub-App-Token für den Push umstellen. Ein PAT nähme der gehosteten Renovate-Variante allerdings ihren „keine Secrets"-Vorteil.
- **`dependency-review.yml` und Renovates `vulnerabilityAlerts` überlappen im Zweck** (CVE-Gate). Nach ein paar Monaten prüfen, ob beide gebraucht werden oder eines redundant ist — die Antwort hängt davon ab, ob Renovates OSV-Quelle in der Praxis dieselben Advisories meldet wie GitHubs.
- **Der Custom-Manager-Regex hängt an der Textform von `ci.yml`** ([.github/renovate.json5](../.github/renovate.json5), `customManagers`): wird `bun-version: 1.3.10` umformatiert, greift er still nicht mehr — Renovate meldet keinen Fehler, es passiert einfach nichts. Sichtbar wird der Ausfall daran, dass ein Bun-Update nur noch `mise.toml` anfasst. Beim nächsten Bun-Bump gegenprüfen, dass beide Fundstellen im selben PR stehen.
```

- [ ] **Step 4: Formatierung prüfen**

Run:

```bash
bun run format:check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/decision-log.md docs/TODO.md
git commit -m "docs(renovate): ADR-013, CI-Abschnitt und TODO-Eintraege"
```

- [ ] **Step 6: Branch pushen und Guard-Gegenprobe aus Task 3 einlösen**

```bash
git push -u origin chore/renovate-setup
gh run list --branch chore/renovate-setup --limit 10
```

Expected: `CI`, `PR Labeler` und `Dependency Review` laufen erst mit dem PR. **`Expo SDK Sync` darf nirgends mit `success` auftauchen** — der Guard muss greifen. `Renovate Config` läuft, sobald ein PR existiert, weil `.github/renovate.json5` im Diff liegt.

---

## Nach dem Merge — manuelle Schritte (Browser)

Nicht Teil der Tasks, weil sie außerhalb des Repos passieren. Die Reihenfolge ist wichtig.

1. **Erst mergen, dann installieren.** Findet Renovate beim ersten Lauf bereits eine Config im Repo, überspringt es den Onboarding-PR und arbeitet sofort nach dieser Konfiguration. Andersherum entsteht ein Onboarding-PR mit Renovate-**Defaults** — also ohne die Expo-Regel.
2. App installieren: `github.com/apps/renovate`, Scope **nur** `ElternFlowAI`.
3. **Phase 1 — eine Woche beobachten.** Ruleset noch nicht anfassen. Renovate schlägt vor, merged aber nichts, weil die Approval-Pflicht hält. Konkret zu prüfen: (a) kein PR verlässt eine Expo-Range, (b) `java` taucht in keinem PR auf, (c) ein Bun-Update fasst `mise.toml` **und** `ci.yml` an.
4. **Phase 2 — Automerge scharf stellen.** Im Ruleset `main protection`: Renovate-App als Bypass-Actor ergänzen **und** den CI-Job als Required Status Check eintragen. Letzteres schließt eine Lücke, die unabhängig von Renovate besteht — aktuell blockt kein Status-Check einen Merge.
