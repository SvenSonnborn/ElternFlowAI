# CI/CD-Absicherung (GitHub Actions) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drei PR-getriggerte GitHub-Actions-Workflows (Quality+Build-CI, Branch-Namen-Labeler, CVE-Dependency-Review) plus Label-Bootstrap und Doku als erste CI/CD-Absicherung.

**Architecture:** `.github/workflows/` bekommt drei voneinander unabhängige Workflows, alle auf `pull_request` getriggert. `ci.yml` fährt zwei parallele Jobs (Quality: format/lint/typecheck/test als getrennte Steps; Build: Web-Smoke-Export). `pr-labeler.yml` liest `.github/labeler.yml` (Branch-Namen-Regex) via `actions/labeler@v5`. `dependency-review.yml` nutzt `actions/dependency-review-action@v4`. Ein einmalig laufendes `scripts/setup-labels.sh` legt die Label-Palette an. Doku (ADR-006, CLAUDE.md, TODO) wird im selben Branch nachgezogen.

**Tech Stack:** GitHub Actions · Bun 1.3.10 · `oven-sh/setup-bun@v2` · `actions/checkout@v4` · `actions/cache@v4` · `actions/labeler@v5` · `actions/dependency-review-action@v4` · `gh` CLI · Expo (web export).

## Global Constraints

- **Package Manager:** Bun. In CI gepinnt auf `bun-version: 1.3.10`, Install immer mit `bun install --frozen-lockfile`.
- **Trigger:** Alle drei Workflows ausschließlich `on: pull_request` mit `types: [opened, synchronize, reopened]`. Kein `push`-Trigger auf `main`.
- **CVE-Schwelle:** `fail-on-severity: moderate`, kein Lizenz-Gate.
- **Least Privilege:** Jeder Workflow setzt einen expliziten `permissions:`-Block (Default minimal).
- **Robustheit:** `ci.yml` hat `concurrency` + `cancel-in-progress: true`; jeder Job hat `timeout-minutes`.
- **Action-Versionen:** Major-Version-Tags (`@v4`/`@v5`). SHA-Pinning ist bewusstes Follow-up (TODO), nicht in dieser Iteration.
- **Web-Smoke-Output:** `--output-dir dist` (bereits gitignored).
- **Branch:** Arbeit läuft auf `ci/github-actions-pipeline` (bereits angelegt, Spec-Commit `442e6c6` liegt drauf).
- **Commits:** Conventional-Commit-Prefix, scoped. **Niemals** `Co-Authored-By: Claude`-Trailer. Pre-commit-Hooks (`lint-staged`) **nie** mit `--no-verify` umgehen (prettier reformatiert `*.yml`/`*.md` beim Commit — das ist erwünscht und erwartet).
- **Validierung ohne Netz:** YAML wird mit `bunx js-yaml <datei>` geparst (Exit 0 = valide; parst reine Syntax — die semantische Prüfung ist der Live-PR-Run in Task 6). Shell mit `bash -n`.

---

### Task 1: CI-Workflow (`ci.yml`) — Quality- + Build-Job

**Files:**

- Create: `.github/workflows/ci.yml`

**Interfaces:**

- Produces: Zwei Status-Checks `Quality (lint · format · typecheck · test)` und `Web smoke build`, die auf jedem PR laufen. Nutzt die `package.json`-Scripts `format:check`, `lint`, `typecheck`, `test` sowie `bunx expo export`.

- [ ] **Step 1: Datei anlegen**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  quality:
    name: Quality (lint · format · typecheck · test)
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.10

      - name: Cache Bun dependencies
        uses: actions/cache@v4
        with:
          path: ~/.bun/install/cache
          key: bun-${{ runner.os }}-${{ hashFiles('**/bun.lock') }}
          restore-keys: |
            bun-${{ runner.os }}-

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Format check
        run: bun run format:check

      - name: Lint
        if: ${{ !cancelled() }}
        run: bun run lint

      - name: Typecheck
        if: ${{ !cancelled() }}
        run: bun run typecheck

      - name: Test
        if: ${{ !cancelled() }}
        run: bun run test

  build:
    name: Web smoke build
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.10

      - name: Cache Bun dependencies
        uses: actions/cache@v4
        with:
          path: ~/.bun/install/cache
          key: bun-${{ runner.os }}-${{ hashFiles('**/bun.lock') }}
          restore-keys: |
            bun-${{ runner.os }}-

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Export web bundle (smoke)
        run: bunx expo export --platform web --output-dir dist
```

- [ ] **Step 2: YAML-Validität prüfen**

Run: `bunx js-yaml .github/workflows/ci.yml >/dev/null && echo VALID`
Expected: `VALID` (Exit 0, kein Parser-Fehler)

- [ ] **Step 3: Struktur-Gegencheck**

Run: `grep -E 'jobs:|quality:|build:|frozen-lockfile|expo export|cancel-in-progress|timeout-minutes' .github/workflows/ci.yml`
Expected: Alle Marker vorhanden (2 Jobs, frozen-lockfile in beiden, expo-export im build-Job, concurrency + timeouts gesetzt).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: PR-Gate mit Quality- und Web-Smoke-Build-Job"
```

Expected: Commit erstellt; `lint-staged`-Hook läuft prettier über die YAML-Datei (re-staged), Commit geht durch.

---

### Task 2: PR-Labeler (`labeler.yml` + `pr-labeler.yml`)

**Files:**

- Create: `.github/labeler.yml`
- Create: `.github/workflows/pr-labeler.yml`

**Interfaces:**

- Consumes: Die in Task 3 angelegten Labels (`feature`, `bug`, `chore`, `documentation`, `refactor`, `test`). Der Labeler funktioniert auch ohne sie (GitHub legt fehlende Labels farblos an), Task 3 macht sie nur intentional.
- Produces: Auf jedem PR wird anhand des Head-Branch-Namens 0..1 Label gesetzt.

- [ ] **Step 1: Mapping-Config anlegen**

Create `.github/labeler.yml`:

```yaml
# Branch-Namen → Label-Mapping für actions/labeler@v5.
# Gematcht wird der Head-Branch-Name des PR gegen diese Regexes.
feature:
  - head-branch: ["^feat/", "^feature/"]
bug:
  - head-branch: ["^fix/", "^hotfix/", "^bugfix/"]
chore:
  - head-branch: ["^chore/", "^ci/", "^build/"]
documentation:
  - head-branch: ["^docs/"]
refactor:
  - head-branch: ["^refactor/", "^perf/"]
test:
  - head-branch: ["^test/"]
```

- [ ] **Step 2: Labeler-Workflow anlegen**

Create `.github/workflows/pr-labeler.yml`:

```yaml
name: PR Labeler

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write

jobs:
  label:
    name: Apply labels from branch name
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Label PR
        uses: actions/labeler@v5
        with:
          configuration-path: .github/labeler.yml
          sync-labels: false
```

- [ ] **Step 3: Beide Dateien validieren**

Run: `bunx js-yaml .github/labeler.yml >/dev/null && bunx js-yaml .github/workflows/pr-labeler.yml >/dev/null && echo VALID`
Expected: `VALID`

- [ ] **Step 4: Regex-Plausibilität (kein Live-Call, nur Sanity)**

Run: `grep -E 'head-branch|feature:|bug:|chore:|documentation:|refactor:|test:' .github/labeler.yml`
Expected: 6 Label-Keys + `head-branch`-Einträge sichtbar.

- [ ] **Step 5: Commit**

```bash
git add .github/labeler.yml .github/workflows/pr-labeler.yml
git commit -m "ci: PR-Labeler setzt Labels aus Branch-Namen"
```

---

### Task 3: Label-Bootstrap (`scripts/setup-labels.sh`) + einmalig ausführen

**Files:**

- Create: `scripts/setup-labels.sh`

**Interfaces:**

- Produces: Die 6 Labels aus Task 2 existieren im Repo `SvenSonnborn/ElternFlowAI` mit definierten Farben/Beschreibungen. **Achtung:** Step 4 schreibt in das GitHub-Repo (legt Labels an) — bewusste, idempotente Setup-Aktion.

- [ ] **Step 1: Script anlegen**

Create `scripts/setup-labels.sh`:

```bash
#!/usr/bin/env bash
# Legt die vom PR-Labeler (.github/labeler.yml) genutzten Labels einmalig an.
# Idempotent: `gh label create --force` legt an oder aktualisiert bestehende Labels.
# Voraussetzung: `gh auth login` mit Repo-Schreibrechten.
set -euo pipefail

create() {
  gh label create "$1" --color "$2" --description "$3" --force
}

create "feature" "0e8a16" "Neue Funktion (Branch: feat/ · feature/)"
create "bug" "d73a4a" "Fehlerbehebung (Branch: fix/ · hotfix/ · bugfix/)"
create "chore" "cfd3d7" "Wartung / Tooling / CI (Branch: chore/ · ci/ · build/)"
create "documentation" "0075ca" "Dokumentation (Branch: docs/)"
create "refactor" "6f42c1" "Refactoring / Performance (Branch: refactor/ · perf/)"
create "test" "fbca04" "Tests (Branch: test/)"

echo "✓ Labels angelegt/aktualisiert."
```

- [ ] **Step 2: Ausführbar machen + Syntax prüfen**

Run: `chmod +x scripts/setup-labels.sh && bash -n scripts/setup-labels.sh && echo SYNTAX_OK`
Expected: `SYNTAX_OK` (keine Syntaxfehler)

- [ ] **Step 3: `gh`-Auth prüfen**

Run: `gh auth status`
Expected: Eingeloggt bei github.com mit Zugriff auf `SvenSonnborn/ElternFlowAI`. Falls nicht: `gh auth login` (interaktiv) — dann erneut.

- [ ] **Step 4: Script ausführen (schreibt Labels ins Repo)**

Run: `bash scripts/setup-labels.sh`
Expected: 6 Zeilen Bestätigung von `gh` + `✓ Labels angelegt/aktualisiert.`

- [ ] **Step 5: Labels verifizieren**

Run: `gh label list | grep -E 'feature|bug|chore|documentation|refactor|test'`
Expected: Alle 6 Labels gelistet.

- [ ] **Step 6: Commit**

```bash
git add scripts/setup-labels.sh
git commit -m "ci: Bootstrap-Script für PR-Label-Palette"
```

---

### Task 4: Dependency-Review (`dependency-review.yml`) — CVE-Gate

**Files:**

- Create: `.github/workflows/dependency-review.yml`

**Interfaces:**

- Produces: Status-Check `CVE check for new dependencies`, der PRs ab CVE-Schweregrad `moderate` (in neu hinzukommenden Dependencies) rot färbt und bei Fehler einen Summary-Kommentar postet.

- [ ] **Step 1: Datei anlegen**

Create `.github/workflows/dependency-review.yml`:

```yaml
name: Dependency Review

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write

jobs:
  dependency-review:
    name: CVE check for new dependencies
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Dependency Review
        uses: actions/dependency-review-action@v4
        with:
          fail-on-severity: moderate
          comment-summary-in-pr: on-failure
```

- [ ] **Step 2: YAML-Validität prüfen**

Run: `bunx js-yaml .github/workflows/dependency-review.yml >/dev/null && echo VALID`
Expected: `VALID`

- [ ] **Step 3: Struktur-Gegencheck**

Run: `grep -E 'dependency-review-action@v4|fail-on-severity: moderate|comment-summary-in-pr' .github/workflows/dependency-review.yml`
Expected: Alle drei Marker vorhanden.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/dependency-review.yml
git commit -m "ci: Dependency-Review als CVE-Gate (moderate+)"
```

---

### Task 5: Dokumentation (ADR-006 · CLAUDE.md · TODO)

**Files:**

- Modify: `docs/decision-log.md` (append ADR-006 am Ende)
- Modify: `CLAUDE.md` (neuer Abschnitt vor `## Code review (CodeRabbit)`)
- Modify: `docs/TODO.md` (Follow-ups unter `## Weitere Out-of-Scope-Items` anhängen)

**Interfaces:**

- Consumes: Nichts (reine Doku).
- Produces: Paper-Trail für die CI/CD-Entscheidungen; CLAUDE.md dokumentiert die Konvention für künftige Arbeit.

- [ ] **Step 1: ADR-006 an `docs/decision-log.md` anhängen**

Ans Ende von `docs/decision-log.md` anfügen:

```markdown
## ADR-006 — CI/CD via GitHub Actions (2026-07-21)

Accepted. Erste CI/CD-Absicherung; ergänzt die bestehende CodeRabbit-Review-Schicht um mechanische Gates.

### Context

Bis dato gab es kein `.github/`-Verzeichnis und keine automatisierten Checks auf PRs — Qualität hing an lokalen Hooks (`lint-staged` pre-commit) und dem CodeRabbit-GitHub-Bot. Für die weitere Entwicklung braucht es reproduzierbare, PR-blockierende Gates. Spec: [docs/superpowers/specs/2026-07-21-ci-cd-github-actions-design.md](./superpowers/specs/2026-07-21-ci-cd-github-actions-design.md).

### Decisions

1. **Drei Workflows, alle `pull_request`-getriggert.** `ci.yml` (Quality + Web-Smoke-Build), `pr-labeler.yml` (Auto-Labels), `dependency-review.yml` (CVE-Gate). Kein `push`-Trigger auf `main` — main verlässt sich auf die PR-Gates davor.
2. **`ci.yml` als zwei parallele Jobs.** `quality` führt `format:check` · `lint` · `typecheck` · `test` als getrennte Steps mit `if: ${{ !cancelled() }}` aus (alle Checks laufen, volle Signalmenge). `build` macht `bunx expo export --platform web` als Smoke-Test. Begründung: getrennte Verantwortlichkeiten, paralleles Feedback.
3. **Bun als CI-Runtime, gepinnt auf 1.3.10** + `bun install --frozen-lockfile`. Deckungsgleich mit lokaler Entwicklung, deterministisch.
4. **Labels aus Branch-Namen** via `actions/labeler@v5` mit `head-branch`-Regex (nicht dateipfad-basiert). Volles Conventional-Set (feat/fix/chore/docs/refactor/test). Label-Palette wird einmalig über `scripts/setup-labels.sh` angelegt.
5. **CVE-Schwelle `moderate`** in `dependency-review-action`, kein Lizenz-Gate. Balancepunkt zwischen Sicherheit und Rauschen. Public Repo → Dependency-Graph ohne GitHub Advanced Security verfügbar.
6. **Least-Privilege-Permissions, Concurrency-Cancel, Job-Timeouts, Dependency-Cache** als Querschnitt über alle Workflows.

### Consequences

- Neue Dateien: `.github/workflows/{ci,pr-labeler,dependency-review}.yml`, `.github/labeler.yml`, `scripts/setup-labels.sh`.
- CodeRabbit-Verhältnis: CI macht die mechanischen Gates (lint/format/typecheck/test/build/CVE), CodeRabbit das inhaltliche Review. Der lokale CodeRabbit-pre-push-Hook bleibt deaktiviert.
- Follow-ups in [docs/TODO.md](./TODO.md): Actions auf Commit-SHA pinnen, Dependabot für Actions/Deps, Branch-Protection-Rule „Status-Checks required" auf `main` (Repo-Settings).
```

- [ ] **Step 2: CI/CD-Abschnitt in `CLAUDE.md` einfügen**

Unmittelbar **vor** der Zeile `## Code review (CodeRabbit)` in `CLAUDE.md` einfügen:

```markdown
## CI/CD (GitHub Actions)

Drei PR-getriggerte Workflows in [.github/workflows/](.github/workflows/) sichern jeden Pull Request ab (kein `push`-Trigger auf `main` — die PR-Gates davor genügen):

- **`ci.yml`** — zwei parallele Jobs. `quality` läuft `format:check` · `lint` · `typecheck` · `test` (getrennte Steps, alle via `if: ${{ !cancelled() }}`, damit ein früher Fehler die späteren nicht verdeckt); `build` macht `bunx expo export --platform web --output-dir dist` als Smoke-Test. Runtime: Bun `1.3.10` (gepinnt), `bun install --frozen-lockfile`.
- **`pr-labeler.yml`** + [.github/labeler.yml](.github/labeler.yml) — setzt Labels automatisch aus dem Branch-Namen (`actions/labeler@v5`, `head-branch`-Regex). Mapping: `feat/`→feature, `fix/`→bug, `chore/`·`ci/`·`build/`→chore, `docs/`→documentation, `refactor/`·`perf/`→refactor, `test/`→test. Die Label-Palette wird einmalig via `bash scripts/setup-labels.sh` (braucht `gh`-Auth) angelegt.
- **`dependency-review.yml`** — CVE-Gate für neue Dependencies (`actions/dependency-review-action@v4`, `fail-on-severity: moderate`).

Verhältnis zu CodeRabbit: CI macht die **mechanischen** Gates, der CodeRabbit-Bot das **inhaltliche** Review. Der lokale CodeRabbit-pre-push-Hook bleibt deaktiviert.
```

- [ ] **Step 3: TODO-Follow-ups anhängen**

Unter `## Weitere Out-of-Scope-Items` in `docs/TODO.md` anhängen:

```markdown
- **CI: Actions auf Commit-SHA pinnen** ([.github/workflows/](../.github/workflows/)) — aktuell auf Major-Version-Tags (`@v4`/`@v5`); SHA-Pinning härtet gegen Supply-Chain-Angriffe (kompromittierte Tag-Re-Points). Sinnvoll zusammen mit dem nächsten Punkt.
- **`.github/dependabot.yml`** — automatische Updates für GitHub-Actions-Versionen und Bun/npm-Dependencies. Hält gepinnte Actions/Deps aktuell, ohne manuelles Nachziehen.
- **Branch-Protection-Rule „Status-Checks required" auf `main`** — die CI-Jobs (`quality`, `build`, `dependency-review`) und den Labeler-Job als Pflicht-Checks vor Merge setzen. Nicht als Datei versionierbar (GitHub-Repo-Settings), daher manuell in den Repo-Einstellungen.
```

- [ ] **Step 4: Markdown-Format prüfen**

Run: `bun run format:check`
Expected: PASS (oder: falls prettier meckert, `bun run format` laufen lassen — der Commit-Hook würde ohnehin formatieren).

- [ ] **Step 5: Commit**

```bash
git add docs/decision-log.md CLAUDE.md docs/TODO.md
git commit -m "docs(ci): ADR-006 + CLAUDE.md CI/CD-Abschnitt + TODO-Follow-ups"
```

---

### Task 6: End-to-End-Verifikation via Test-PR (Integration)

**Files:** — (keine; nur Push + PR + Beobachtung)

**Interfaces:**

- Consumes: Alle Artefakte aus Task 1–5, auf dem Branch committet.
- Produces: Belegter Nachweis, dass alle drei Workflows auf einem echten PR laufen und der Labeler greift.

- [ ] **Step 1: Branch pushen**

Run: `git push -u origin ci/github-actions-pipeline`
Expected: Branch auf `origin`, kein pre-push-Fehler (CodeRabbit-Hook ist deaktiviert).

- [ ] **Step 2: PR öffnen**

Run:

```bash
gh pr create --base main --head ci/github-actions-pipeline \
  --title "ci: GitHub-Actions CI/CD-Absicherung (CI · Labeler · Dependency-Review)" \
  --body "Setzt die Spec docs/superpowers/specs/2026-07-21-ci-cd-github-actions-design.md um: ci.yml (Quality+Build), pr-labeler.yml, dependency-review.yml, scripts/setup-labels.sh + Doku (ADR-006)."
```

Expected: PR-URL wird ausgegeben.

- [ ] **Step 3: Workflow-Runs abwarten**

Run: `gh pr checks --watch`
Expected: Die Checks `Quality (lint · format · typecheck · test)`, `Web smoke build`, `CVE check for new dependencies` und der Labeler-Job laufen und werden **grün**. (Beim allerersten Run keine Cache-Hits — das ist normal.)

- [ ] **Step 4: Auto-Label verifizieren**

Run: `gh pr view --json labels --jq '.labels[].name'`
Expected: `chore` ist gesetzt (Branch `ci/…` matcht `^ci/` → Label `chore`). Das bestätigt den Labeler end-to-end.

- [ ] **Step 5: Ergebnis festhalten**

Falls ein Check rot ist: Logs mit `gh run view <run-id> --log-failed` inspizieren, Ursache im entsprechenden Task fixen, committen, pushen — `pull_request`-Trigger (`synchronize`) startet die Checks automatisch neu. Erst weiter, wenn alle grün sind.

Kein Commit in diesem Task — er ist reine Verifikation. Der PR bleibt für den Review/Merge offen (Merge-Entscheidung trifft der User).

---

## Self-Review

**1. Spec coverage:**

- `ci.yml` Quality+Build → Task 1 ✅
- `pr-labeler.yml` + `labeler.yml` (head-branch, volles Set) → Task 2 ✅
- `setup-labels.sh` Bootstrap → Task 3 ✅
- `dependency-review.yml` (moderate, on-failure comment) → Task 4 ✅
- SOTA-Querschnitt (permissions/concurrency/timeouts/cache/pinning) → in Task 1/2/4 verbaut + Global Constraints ✅
- Doku (ADR-006, CLAUDE.md, TODO) → Task 5 ✅
- Erfolgskriterien (Test-PR grün, Label gesetzt, Fehler-PR rot) → Task 6 ✅
- Nicht-Scope (EAS, Deploy, Branch-Protection, SHA-Pinning) → als TODO/Consequences vermerkt ✅

**2. Placeholder scan:** Keine „TBD/TODO/später". Jede Datei ist vollständig ausgeschrieben. ✅

**3. Type/Name consistency:** Job-Namen (`quality`, `build`, `dependency-review`, `label`), Check-Namen und Label-Namen (`feature`/`bug`/`chore`/`documentation`/`refactor`/`test`) sind zwischen `ci.yml`, `labeler.yml`, `setup-labels.sh`, CLAUDE.md und ADR-006 deckungsgleich. `--output-dir dist` konsistent. Bun `1.3.10` konsistent. ✅

```

```
