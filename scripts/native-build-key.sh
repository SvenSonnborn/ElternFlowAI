#!/usr/bin/env bash
# Schlüssel der Marke „nativ grün gebaut" aus .github/workflows/native-build.yml:
# Trägt ein Lauf einen Schlüssel, der schon grün gebaut wurde, überspringt der
# Job Prebuild und Compile. Aufruf: scripts/native-build-key.sh <ios|android>,
# Ausgabe genau eine Zeile `native-build-<plattform>-<40 hex>`.
#
# Im Schlüssel: der Fingerprint von @expo/fingerprint (native Paketversionen,
# app.json samt Config-Plugins und referenzierten Dateien, Autolinking), dazu
# mise.toml, native-build.yml und dieses Skript, bei iOS die Xcode-Version.
# Bewusst nicht: bun.lock (sonst baute jeder reine JS-Bump voll; native Pakete
# stecken über ihre Version schon im Fingerprint) und das Ubuntu-Image des
# Android-Runners (sonst nach jedem Image-Update ungültig). Diese Lücke deckt
# der Wochenbuild ab, der die Marke ignoriert.
#
# Scheitert ein Bestandteil, endet das Skript mit Exit ≠ 0 und ohne Ausgabe:
# Ein leerer oder konstanter Schlüssel ließe ab dann jeden Lauf überspringen.
set -euo pipefail

platform="${1:-}"
case "$platform" in
  ios | android) ;;
  *)
    echo "Aufruf: $0 <ios|android>" >&2
    exit 2
    ;;
esac

cd "$(dirname "$0")/.."

# Nach `expo prebuild` hasht der Fingerprint das generierte Verzeichnis als
# `bareNativeDir` mit; der Schlüssel hinge dann an einem zufälligen
# Zwischenstand. Im Workflow läuft das Skript deshalb vor dem Prebuild.
if [ -d "$platform" ]; then
  echo "native-build-key: ${platform}/ existiert, Schlüssel nur vor expo prebuild." >&2
  exit 1
fi

fingerprint="$(node_modules/.bin/fingerprint fingerprint:generate --platform "$platform" |
  node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0, "utf8")).hash)')"
hex40='^[0-9a-f]{40}$'
if ! [[ $fingerprint =~ $hex40 ]]; then
  echo "native-build-key: unerwarteter Fingerprint-Hash '${fingerprint}'." >&2
  exit 1
fi

files="$(shasum -a 256 mise.toml .github/workflows/native-build.yml scripts/native-build-key.sh)"

xcode=""
if [ "$platform" = ios ]; then
  xcode="$(xcodebuild -version)"
fi

digest="$(printf '%s\n%s\n%s\n' "$fingerprint" "$files" "$xcode" | shasum -a 256 | cut -c1-40)"
echo "native-build-${platform}-${digest}"
