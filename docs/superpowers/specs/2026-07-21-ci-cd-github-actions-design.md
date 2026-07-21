# Design: CI/CD-Absicherung via GitHub Actions

**Datum:** 2026-07-21
**Branch:** `ci/github-actions-pipeline`
**Status:** Freigegeben (Brainstorming), Implementierung ausstehend

## Ziel

Erste CI/CD-Absicherung für Eltern Flow AI. Drei GitHub-Actions-Workflows, die bei
jedem Pull Request greifen:

1. **`ci.yml`** — Quality-Gate (lint · format · typecheck · tests) + Web-Smoke-Build.
2. **`pr-labeler.yml`** — setzt Labels automatisch aus dem Branch-Namen.
3. **`dependency-review.yml`** — CVE-Check für neu hinzukommende Dependencies.

Umsetzung soll state of the art sein: Least-Privilege-Permissions, Concurrency-Cancel,
Job-Timeouts, deterministische (gepinnte) Toolchain, Dependency-Cache.

## Kontext / Ist-Zustand

- **Repo:** `SvenSonnborn/ElternFlowAI` (GitHub, **public** → Dependency-Graph standardmäßig
  aktiv, kein GitHub Advanced Security nötig für `dependency-review-action`).
- **Default-Branch:** `main`.
- **Package Manager:** Bun (`bun.lock`, lokal `1.3.10`) — kein npm/yarn.
- **Vorhandene Scripts** (`package.json`):
  - `lint` → `eslint .`
  - `format:check` → `prettier --check .`
  - `typecheck` → `tsc --noEmit`
  - `test` → `jest` (Preset `jest-expo`, `jest.config.js`; 14 Testdateien)
  - `check` → `format:check && lint && typecheck` (kombiniert)
- **Smoke-Build:** `bunx expo export --platform web --output-dir <dir>`.
- **`.github/` existiert noch nicht** — komplett neu.
- **CodeRabbit:** `.coderabbit.yaml` + GitHub-Bot machen bereits inhaltliches PR-Review;
  pre-push-Hook ist aktuell deaktiviert. Die neue CI ergänzt das (mechanische Gates),
  ersetzt es nicht.
- **`.gitignore`:** `dist/` ist bereits ignoriert → Web-Smoke-Build kann dorthin exportieren,
  ohne dass `.gitignore` angefasst werden muss.

## Design-Entscheidungen (aus Brainstorming)

| Entscheidung  | Wahl                                               | Begründung                                                                   |
| ------------- | -------------------------------------------------- | ---------------------------------------------------------------------------- |
| CI-Struktur   | **Quality-Job + Build-Job** (parallel)             | Balance aus Geschwindigkeit und Einfachheit; getrennte Verantwortlichkeiten. |
| CVE-Strenge   | **`fail-on-severity: moderate`**, kein Lizenz-Gate | Guter Standard-Balancepunkt zwischen Sicherheit und Rauschen.                |
| Label-Mapping | **Volles Conventional-Set**                        | Passt zur Conventional-Commits-Konvention des Repos.                         |
| CI-Trigger    | **Nur `pull_request`**                             | Wie angefragt; main verlässt sich auf die PR-Gates davor.                    |

## Ziel-Dateistruktur

```
.github/
├─ workflows/
│  ├─ ci.yml                  # Quality-Job + Build-Job (PR-Gate)
│  ├─ pr-labeler.yml          # Auto-Labels aus Branch-Namen
│  └─ dependency-review.yml   # CVE-Gate für neue Dependencies
├─ labeler.yml                # Branch→Label-Mapping (Config für actions/labeler)
scripts/
└─ setup-labels.sh            # Einmaliges, idempotentes Anlegen der Label-Palette
```

Plus Doku-Updates (siehe unten).

## Komponenten

### 1) `ci.yml` — PR-Gate

- **Trigger:** `on: pull_request` mit `types: [opened, synchronize, reopened]`.
- **Global:**
  - `permissions: { contents: read }` (Least Privilege).
  - `concurrency: { group: ci-${{ github.workflow }}-${{ github.ref }}, cancel-in-progress: true }`
    → überholte Runs werden abgebrochen.

**Job A — `quality`** (`ubuntu-latest`, `timeout-minutes: 15`):

1. `actions/checkout@v4`
2. `oven-sh/setup-bun@v2` mit `bun-version: 1.3.10` (gepinnt → reproduzierbar).
3. `actions/cache@v4` für `~/.bun/install/cache`, Key auf `hashFiles('**/bun.lock')`.
4. `bun install --frozen-lockfile`.
5. Getrennte Steps mit `if: ${{ !cancelled() }}`, damit alle Checks durchlaufen und
   einzeln im UI sichtbar sind:
   - `bun run format:check`
   - `bun run lint`
   - `bun run typecheck`
   - `bun run test`

   Der Job schlägt fehl, sobald einer der Steps rot ist. `!cancelled()` sorgt dafür, dass
   ein früher Fehler die späteren Steps nicht verdeckt (volle Signalmenge pro Run).

**Job B — `build`** (`ubuntu-latest`, `timeout-minutes: 15`, parallel zu A, kein `needs`):

1. `actions/checkout@v4`
2. `oven-sh/setup-bun@v2` (`bun-version: 1.3.10`)
3. `actions/cache@v4` (wie oben)
4. `bun install --frozen-lockfile`
5. `bunx expo export --platform web --output-dir dist` (Smoke: Bundle muss durchbauen;
   `dist/` ist gitignored).

### 2) `pr-labeler.yml` + `labeler.yml` — Labels aus Branch-Namen

- **Mechanik:** `actions/labeler@v5` mit **`head-branch`-Regex-Matching** (branch-name-basiert,
  nicht dateipfad-basiert).
- **Trigger:** `on: pull_request`.
- **Permissions:** `{ contents: read, pull-requests: write }`.
- **Job** (`ubuntu-latest`, `timeout-minutes: 5`): ein Step `actions/labeler@v5`
  (`configuration-path: .github/labeler.yml`, `sync-labels: false` → einmal gesetzte Labels
  bleiben bestehen, auch wenn der Branch-Name später nicht mehr matcht).

**Mapping (`.github/labeler.yml`):**

| Branch-Präfix                | Label           |
| ---------------------------- | --------------- |
| `feat/`, `feature/`          | `feature`       |
| `fix/`, `hotfix/`, `bugfix/` | `bug`           |
| `chore/`, `ci/`, `build/`    | `chore`         |
| `docs/`                      | `documentation` |
| `refactor/`, `perf/`         | `refactor`      |
| `test/`                      | `test`          |

Config-Form (labeler v5 Syntax):

```yaml
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

### 3) `scripts/setup-labels.sh` — Label-Bootstrap

- Legt die 6 Labels einmalig mit definierten Farben + Beschreibungen an, idempotent
  (`gh label create <name> --color <hex> --description <text> --force`).
- Wird einmal manuell ausgeführt (braucht `gh`-Auth). Verhindert, dass der Labeler an
  fehlenden Labels scheitert bzw. auto-generierte Labels ohne Farbe/Beschreibung entstehen.
- Vorschlag Farbwelt (an GitHub-Defaults angelehnt, final beim Umsetzen fixierbar):
  `feature` grün, `bug` rot, `chore` grau, `documentation` blau, `refactor` violett,
  `test` gelb.

### 4) `dependency-review.yml` — CVE-Gate

- **Mechanik:** `actions/dependency-review-action@v4` (vergleicht Dependency-Graph
  Base↔Head des PR; public Repo → ohne Zusatz-Setup lauffähig).
- **Trigger:** `on: pull_request`.
- **Permissions:** `{ contents: read, pull-requests: write }` (für Summary-Kommentar).
- **Job** (`ubuntu-latest`, `timeout-minutes: 10`):
  1. `actions/checkout@v4`
  2. `actions/dependency-review-action@v4` mit:
     - `fail-on-severity: moderate`
     - `comment-summary-in-pr: on-failure`

## State-of-the-art-Querschnitt (alle Workflows)

- Explizite **`permissions:`**-Blöcke (Least Privilege) pro Workflow.
- **`concurrency` + `cancel-in-progress`** auf `ci.yml`.
- **`timeout-minutes`** auf jedem Job.
- **Gepinnte Bun-Version** + **`bun install --frozen-lockfile`** → deterministisch.
- **Dependency-Cache** → schnelleres Feedback nach dem ersten Run.
- Actions auf **Major-Version-Tags** (`@v4`/`@v5`). Härtung auf Commit-SHA + Dependabot
  für Actions/Dependencies = bewusstes Follow-up (siehe TODO), nicht Teil dieser Iteration.

## Dokumentation (gleicher Branch, CLAUDE.md-Disziplin)

- **Neuer ADR** in `docs/decision-log.md`: „CI/CD via GitHub Actions" — hält die
  Entscheidungen fest (Trigger nur PR, Quality+Build-Job-Modell, CVE-Schwelle Moderate,
  Verhältnis zu CodeRabbit).
- **`CLAUDE.md`**: neuer Abschnitt „CI/CD" — was läuft wann, Verhältnis zu CodeRabbit/pre-push.
- **`docs/TODO.md`**: Follow-ups anhängen:
  - Actions auf Commit-SHA pinnen (Supply-Chain-Härtung).
  - `.github/dependabot.yml` für automatische Action-/Dependency-Updates.
  - Branch-Protection-Rule „Status-Checks required" auf `main` (braucht Repo-Settings,
    nicht per Datei setzbar).

## Nicht im Scope

- Native/EAS-Builds (iOS/Android) — brauchen Credentials/Secrets, eigene Iteration.
- Deploy/Release-Automatisierung.
- Branch-Protection-Konfiguration (Repo-Settings, nicht als Datei versionierbar).
- SHA-Pinning + Dependabot (als TODO vermerkt, bewusst später).

## Erfolgskriterien

- Ein Test-PR (z. B. `feat/ci-smoke`) zeigt: `quality`- und `build`-Job laufen und werden
  grün; das Label `feature` wird automatisch gesetzt; `dependency-review` läuft (grün,
  da keine neuen verwundbaren Deps).
- Ein absichtlich fehlerhafter PR (Lint-Fehler oder Format-Verstoß) lässt `ci.yml` rot werden.
- `bun run check && bun run test` bleibt lokal deckungsgleich mit dem CI-Verhalten.
