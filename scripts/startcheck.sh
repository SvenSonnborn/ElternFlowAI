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
#       Installiert die App und lässt den Flow laufen, bei Fehlschlag ein
#       zweites Mal. Exit 0 = Login sichtbar.
#   scripts/startcheck.sh verdict <ios|android>
#       Urteil für den Workflow, siehe unten.
#
# Prüfumgebung und App werden getrennt gewertet. Maestro installieren und den
# Simulator booten gehört der Umgebung; beides versucht das Skript zweimal (den
# Emulator bootet die Action im Workflow, dort steckt auch sein zweiter
# Anlauf). Ab dem Installieren der App zählt jeder Fehler gegen die App, nach
# genau einer Wiederholung: Ein echter Startabsturz wiederholt sich, ein
# Aussetzer von Gerät oder Treiber nicht.
#
# `run` schreibt nach startcheck-artifacts/result zuerst `fail`, vor dem
# Installieren der App, und erst nach bestandenem Flow `ok`. Bricht das Skript
# irgendwo dazwischen ab, steht dort also nie ein falsches `ok`. `verdict`
# liest die Datei:
#   ok     `ok=true` nach $GITHUB_OUTPUT, die Marke darf geschrieben werden.
#   fail   Fehler-Annotation, Exit 1. Jeder andere Inhalt zählt genauso.
#   fehlt  `run` kam nie zum Zug, die Prüfumgebung fehlte: Warnung, Exit 0,
#          aber kein `ok`. Mit Marke übersprünge der nächste Lauf Compile und
#          Startcheck, und der ungeprüfte Stand gälte als gestartet.
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
  echo "Aufruf: $0 install-maestro | boot-ios | run <ios|android> <app-pfad> | verdict <ios|android>" >&2
  exit 2
}

# Name der Plattform in Annotationen; jede andere Plattform ist ein Aufruffehler.
platform_label() {
  case "$1" in
    ios) echo iOS ;;
    android) echo Android ;;
    *) usage ;;
  esac
}

install_maestro() {
  local dir="${RUNNER_TEMP:?RUNNER_TEMP fehlt}/maestro-${maestro_version}"
  if ! fetch_maestro "$dir"; then
    echo "startcheck: Maestro-Installation fehlgeschlagen, zweiter Versuch." >&2
    fetch_maestro "$dir"
  fi
  echo "$dir/maestro/bin" >>"${GITHUB_PATH:?GITHUB_PATH fehlt}"
}

# Als `if`-Bedingung läuft die Funktion ohne `set -e`, deshalb die `&&`-Kette:
# Sonst liefe sie nach einem gescheiterten Download weiter.
fetch_maestro() {
  local dir="$1"
  mkdir -p "$dir" &&
    curl -fsSL --retry 3 --connect-timeout 30 --max-time 300 -o "$dir/maestro.zip" "$maestro_url" &&
    echo "${maestro_sha256}  ${dir}/maestro.zip" | shasum -a 256 -c &&
    unzip -q -o "$dir/maestro.zip" -d "$dir"
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
  # Wiederholt wird nur ein Boot, der scheitert. Ein hängender läuft ins
  # Step-Limit des Workflows und endet dort als Warnung, ohne zweiten Anlauf.
  if ! xcrun simctl bootstatus "$udid" -b; then
    # Zweiter Anlauf auf einem frischen Gerät: Was den ersten Boot scheitern
    # ließ, kann im Gerätezustand stecken. Herunterfahren und Löschen dürfen
    # scheitern (Gerät war gar nicht oben), über den Anlauf urteilt der Boot.
    echo "startcheck: Simulator-Boot fehlgeschlagen, zweiter Versuch auf gelöschtem Gerät." >&2
    xcrun simctl shutdown "$udid" || true
    xcrun simctl erase "$udid" || true
    xcrun simctl bootstatus "$udid" -b
  fi
  echo "STARTCHECK_SIM_UDID=${udid}" >>"${GITHUB_ENV:?GITHUB_ENV fehlt}"
}

run_check() {
  local platform="$1" app="$2" label n
  mkdir -p startcheck-artifacts
  echo fail >startcheck-artifacts/result
  label="$(platform_label "$platform")"
  if [ "$platform" = ios ]; then
    : "${STARTCHECK_SIM_UDID:?STARTCHECK_SIM_UDID fehlt, erst boot-ios}"
  else
    # Der Logpuffer des Emulators fasst ab Werk nur wenige hundert KB, und
    # direkt nach dem Boot loggt das System viel. Ohne den größeren Puffer
    # fehlte in device-N.log ausgerechnet der Start der App.
    adb logcat -G 16M || true
  fi

  # Keine Telemetrie und kein Hinweis auf Maestros Cloud-Analyse im Log. Das
  # Treiber-Zeitlimit (ms) ist großzügig, weil der XCTest-Treiber auf einem
  # frischen iOS-Runner erst gebaut und gestartet wird.
  export MAESTRO_CLI_NO_ANALYTICS=1
  export MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true
  export MAESTRO_DRIVER_STARTUP_TIMEOUT=180000

  for n in 1 2; do
    if start_app "$platform" "$app" "$n"; then
      echo ok >startcheck-artifacts/result
      return 0
    fi
    echo "startcheck: Login-Screen nicht erschienen (${label}, Versuch ${n})." >&2
    diagnose "$platform" "$n"
    if [ "$n" = 1 ]; then
      echo "::warning title=Startcheck::${label}: erster Versuch fehlgeschlagen, zweiter läuft"
    fi
  done
  exit 1
}

# Ein Versuch ist Installieren plus Flow: Auch ein Aussetzer von `adb` oder
# `simctl` beim Installieren bekommt so die eine Wiederholung. Beides ist
# wiederholbar, eine installierte App wird ersetzt, `launchApp` startet neu.
# Als `if`-Bedingung ohne `set -e`, daher die `&&`-Kette.
#
# `--flatten-debug-output` legt Maestros Ausgabe direkt in maestro-N/. Ohne
# landete sie in maestro-N/.maestro/…, und das Artefakt-Upload übergeht
# versteckte Verzeichnisse.
start_app() {
  local platform="$1" app="$2" n="$3"
  if [ "$platform" = ios ]; then
    xcrun simctl install "$STARTCHECK_SIM_UDID" "$app" &&
      maestro test --device "$STARTCHECK_SIM_UDID" --debug-output "startcheck-artifacts/maestro-$n" --flatten-debug-output .maestro/startcheck.yaml
  else
    # Auf dem Emulator läuft nur ein Gerät, Maestro findet es selbst.
    adb install -r "$app" &&
      maestro test --debug-output "startcheck-artifacts/maestro-$n" --flatten-debug-output .maestro/startcheck.yaml
  fi
}

# Nach jedem gescheiterten Versuch Screenshot und Gerätelog ins Artefakt,
# getrennt nach Versuch. Jede Zeile darf scheitern: Der Versuch ist ohnehin
# verloren, und ein Abbruch hier nähme den zweiten Versuch mit.
diagnose() {
  local platform="$1" n="$2" dir=startcheck-artifacts
  if [ "$platform" = ios ]; then
    xcrun simctl io "$STARTCHECK_SIM_UDID" screenshot "$dir/screen-$n.png" || true
    xcrun simctl spawn "$STARTCHECK_SIM_UDID" log show --last 5m --style compact --predicate 'process == "ElternFlowAI"' >"$dir/device-$n.log" 2>&1 || true
    # Abstürze im Simulator berichtet der Mac, nicht das simulierte Gerät.
    cp ~/Library/Logs/DiagnosticReports/ElternFlowAI*.ips "$dir/" 2>/dev/null || true
  else
    adb exec-out screencap -p >"$dir/screen-$n.png" || true
    adb logcat -d >"$dir/device-$n.log" 2>&1 || true
    diagnose_android
  fi
}

# Zusätzlich zum Artefakt eine Kurzfassung ins Job-Log, lesbar ohne Download:
# welches Fenster vorn ist (App, Absturz- oder ANR-Dialog), ob der
# App-Prozess noch lebt, was beim Start abgestürzt ist und welche IDs und
# Texte auf dem Bildschirm stehen.
diagnose_android() {
  echo "startcheck: Diagnose (android)" >&2
  adb shell dumpsys window | grep -E 'mCurrentFocus|mFocusedApp' || true
  adb shell pidof com.elternflow.app || echo "startcheck: App-Prozess läuft nicht." >&2
  adb logcat -d -b crash || true
  adb logcat -d -s ReactNativeJS:V ReactNative:V AndroidRuntime:E | tail -n 80 || true
  maestro hierarchy | grep -oE '"(resource-id|text|accessibilityText)" *: *"[^"]+"' | head -n 60 || true
}

verdict() {
  local platform="$1" label
  label="$(platform_label "$platform")"
  if [ ! -e startcheck-artifacts/result ]; then
    echo "::warning title=Startcheck::${label}: Prüfumgebung nicht verfügbar (Maestro, Simulator oder Emulator), der Start ist ungeprüft. Keine Marke, der nächste Lauf prüft erneut."
    return 0
  fi
  if [ "$(cat startcheck-artifacts/result)" = ok ]; then
    echo "ok=true" >>"${GITHUB_OUTPUT:?GITHUB_OUTPUT fehlt}"
    return 0
  fi
  echo "::error title=Startcheck::${label}: Die App kam nicht bis zum Login-Screen. Ablauf im Log des Startcheck-Steps, Screenshot und Gerätelog im Artefakt startcheck-${platform}."
  exit 1
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
  verdict)
    [ "$#" -eq 2 ] || usage
    verdict "$2"
    ;;
  *) usage ;;
esac
