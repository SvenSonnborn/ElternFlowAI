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
