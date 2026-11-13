#!/usr/bin/env bash
# Temporäre Probe (wird zurückgenommen): Provoziert vor dem Android-Startcheck
# den ANR-Dialog des Launchers, wie ihn Lauf 43423734323 zeigte, und lässt ihn
# stehen, bis `startcheck.sh run` durch ist. Der Flow muss ihn wegtippen.
#
# `kill -CONT` erst nach dem Lauf: Läuft der Launcher vorher weiter, schließt
# Android den Dialog binnen Sekunden selbst, und die Probe bewiese nichts
# (lokal auf einem API-36-Emulator geprüft).
#
# Scheitert die Probe selbst, steht `fail` in startcheck-artifacts/result:
# Das Urteil wird rot, und der zweite Boot springt nicht an, der sonst ohne
# Probe grün liefe.
#
# Aufruf: scripts/startcheck-anr-probe.sh <apk-pfad>
set -euo pipefail
launcher=com.google.android.apps.nexuslauncher

fail() {
  mkdir -p startcheck-artifacts
  echo fail >startcheck-artifacts/result
  echo "::error title=ANR-Probe::$1"
  exit 1
}

focus() {
  adb shell dumpsys window | grep mCurrentFocus || true
}

adb root || fail "adb root fehlgeschlagen"
adb wait-for-device
for _ in $(seq 1 30); do
  [ "$(adb shell id -u | tr -d '\r')" = 0 ] && break
  sleep 1
done
[ "$(adb shell id -u | tr -d '\r')" = 0 ] || fail "adbd läuft nicht als root"

pid="$(adb shell pidof "$launcher" | tr -d '\r')"
[ -n "$pid" ] || fail "Launcher läuft nicht"
echo "ANR-Probe: Launcher pid ${pid}, Fokus vorher: $(focus)"
adb shell kill -STOP "$pid"

# `input` wartet auf die Zustellung, die der angehaltene Launcher nie quittiert.
timeout 60 adb shell input keyevent 82 >/dev/null 2>&1 &
found=""
for i in $(seq 1 90); do
  case "$(focus)" in
    *"Application Not Responding: ${launcher}"*)
      found="$i"
      break
      ;;
  esac
  sleep 1
done
wait || true
if [ -z "$found" ]; then
  adb shell kill -CONT "$pid" || true
  fail "Kein ANR-Dialog des Launchers nach 90 s. Fokus: $(focus)"
fi
echo "ANR-Probe: Dialog nach ${found} s provoziert, Fokus: $(focus)"

rc=0
bash scripts/startcheck.sh run android "$1" || rc=$?
echo "ANR-Probe: Startcheck beendet (rc ${rc}), Fokus: $(focus)"
# Android beendet den angehaltenen Launcher oft schon vorher selbst.
adb shell kill -CONT "$pid" || true
exit "$rc"
