#!/usr/bin/env bash
# Startcheck aus .github/workflows/native-build.yml: Installiert die eben
# gebaute Release-App im iOS-Simulator bzw. Android-Emulator und wartet mit
# Maestro (.maestro/startcheck.yaml), bis der Login-Screen erscheint. Release,
# weil das JS dort im Paket steckt: kein Metro, kein Konto, kein Secret.
#
# Aufruf, immer aus Sicht der Repo-Wurzel:
#   scripts/startcheck.sh install-maestro
#       Maestro-CLI (gepinnt, Prüfsumme) nach $RUNNER_TEMP, bin/ an $GITHUB_PATH.
#   scripts/startcheck.sh boot-ios
#       Bootet ein iPhone der neuesten iOS-Runtime und schreibt
#       STARTCHECK_SIM_UDID=<udid> nach $GITHUB_ENV.
#   scripts/startcheck.sh run <ios|android> <app-pfad>
#       Installiert die App und lässt den Flow laufen. Exit 0 = Login sichtbar.
#
# `run` schreibt nach startcheck-artifacts/result zuerst `fail`, vor dem
# Installieren der App, und erst nach bestandenem Flow `ok`. Bricht das Skript
# irgendwo dazwischen ab, steht dort also nie ein falsches `ok`.
#
# Läuft auch unter macOS-/bin/bash 3.2 (iOS-Runner): keine assoziativen Arrays,
# kein `mapfile`, kein GNU-`timeout`; Zeitlimits setzt der Workflow am Step.
set -euo pipefail

# Gepinnt samt Prüfsumme statt `curl | bash` des Installers: Der holte immer
# die neueste Version, ungeprüft, und ein Maestro-Release würde den Check
# ändern, ohne dass sich im Repo etwas ändert.
maestro_version="2.12.1"
maestro_url="https://github.com/mobile-dev-inc/maestro/releases/download/cli-${maestro_version}/maestro.zip"
maestro_sha256="54dbb0716425626604973cbb374c585ca30272375d9ce15177a1152765ddd9d7"

usage() {
  echo "Aufruf: $0 install-maestro | boot-ios | run <ios|android> <app-pfad>" >&2
  exit 2
}

install_maestro() {
  local dir="${RUNNER_TEMP:?RUNNER_TEMP fehlt}/maestro-${maestro_version}"
  mkdir -p "$dir"
  curl -fsSL --retry 3 -o "$dir/maestro.zip" "$maestro_url"
  echo "${maestro_sha256}  ${dir}/maestro.zip" | shasum -a 256 -c
  unzip -q -o "$dir/maestro.zip" -d "$dir"
  echo "$dir/maestro/bin" >>"${GITHUB_PATH:?GITHUB_PATH fehlt}"
}

boot_ios() {
  # Kein festes Modell und keine feste Runtime: Mit jedem Xcode-Update auf dem
  # Image wechseln beide, ein fester Name liefe dann ins Leere.
  local pick udid name
  # SC2016: Die einfachen Anführungszeichen sind Absicht, `${…}` ist JavaScript.
  # shellcheck disable=SC2016
  pick="$(xcrun simctl list devices available --json | node -e '
    const { devices } = JSON.parse(require("fs").readFileSync(0, "utf8"));
    const candidates = [];
    for (const [runtime, list] of Object.entries(devices)) {
      const m = runtime.match(/SimRuntime\.iOS-(\d+)-(\d+)(?:-(\d+))?$/);
      const iphone = list.find((device) => device.name.startsWith("iPhone"));
      if (m && iphone) candidates.push({ version: m.slice(1).map((n) => Number(n ?? 0)), iphone });
    }
    candidates.sort((a, b) => b.version[0] - a.version[0] || b.version[1] - a.version[1] || b.version[2] - a.version[2]);
    if (candidates.length === 0) {
      console.error("startcheck: kein verfügbares iPhone in xcrun simctl list.");
      process.exit(1);
    }
    const { iphone, version } = candidates[0];
    process.stdout.write(`${iphone.udid}\t${iphone.name} (iOS ${version.join(".")})`);
  ')"
  IFS=$'\t' read -r udid name <<<"$pick"
  echo "startcheck: Simulator ${name}, UDID ${udid}"
  # `-b` bootet das Gerät selbst und wartet, bis es fertig ist; ein `simctl
  # boot` davor scheiterte, falls das Image es schon gebootet hätte.
  xcrun simctl bootstatus "$udid" -b
  echo "STARTCHECK_SIM_UDID=${udid}" >>"${GITHUB_ENV:?GITHUB_ENV fehlt}"
}

run_check() {
  local platform="$1" app="$2"
  mkdir -p startcheck-artifacts
  echo fail >startcheck-artifacts/result

  # Keine Telemetrie und kein Hinweis auf Maestros Cloud-Analyse im Log. Das
  # Treiber-Zeitlimit (ms) ist großzügig, weil der XCTest-Treiber auf einem
  # frischen iOS-Runner erst gebaut und gestartet wird.
  export MAESTRO_CLI_NO_ANALYTICS=1
  export MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true
  export MAESTRO_DRIVER_STARTUP_TIMEOUT=180000

  case "$platform" in
    ios)
      xcrun simctl install "${STARTCHECK_SIM_UDID:?STARTCHECK_SIM_UDID fehlt, erst boot-ios}" "$app"
      run_flow "$platform" --device "$STARTCHECK_SIM_UDID"
      ;;
    android)
      # Auf dem Emulator läuft nur ein Gerät, Maestro findet es selbst.
      adb install -r "$app"
      run_flow "$platform"
      ;;
    *) usage ;;
  esac
  echo ok >startcheck-artifacts/result
}

# Weitere Argumente gehen an `maestro test`. Über "$@" statt über ein Array,
# weil bash 3.2 ein leeres Array unter `set -u` als ungesetzt behandelt.
run_flow() {
  local platform="$1"
  shift
  if ! maestro test "$@" --debug-output startcheck-artifacts/maestro-1 .maestro/startcheck.yaml; then
    echo "startcheck: Login-Screen nicht erschienen (${platform})." >&2
    exit 1
  fi
}

# Relative Pfade (Flow, Artefakte, App) gelten ab der Repo-Wurzel, egal aus
# welchem Verzeichnis der Workflow-Step aufruft. Ohne CDPATH, sonst könnte `cd`
# den relativen Pfad in einem fremden Verzeichnis auflösen.
CDPATH='' cd -- "$(dirname -- "$0")/.." >/dev/null

case "${1:-}" in
  install-maestro) install_maestro ;;
  boot-ios) boot_ios ;;
  run)
    [ "$#" -eq 3 ] || usage
    run_check "$2" "$3"
    ;;
  *) usage ;;
esac
