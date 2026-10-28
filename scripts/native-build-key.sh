#!/usr/bin/env bash
# Schlüssel der Marke „nativ grün gebaut" aus .github/workflows/native-build.yml:
# Trägt ein Lauf einen Schlüssel, der schon grün gebaut wurde, überspringt der
# Job Prebuild und Compile. Aufruf: scripts/native-build-key.sh <ios|android>,
# Ausgabe genau eine Zeile `native-build-<plattform>-<40 hex>`.
#
# Im Schlüssel: der Fingerprint von @expo/fingerprint (native Paketversionen,
# app.json samt Config-Plugins und referenzierten Dateien, Autolinking), dazu
# mise.toml, native-build.yml und dieses Skript, bei iOS die Xcode-Version.
# Die Versionsfelder (expo.version, ios.buildNumber, android.versionCode)
# streicht das Preset `balanced`; sie können keinen Compile brechen.
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

# Ohne CDPATH: Mit einem exportierten CDPATH, das `.` enthält, schriebe `cd`
# den Zielpfad auf stdout, und die Ausgabe hätte zwei Zeilen.
CDPATH= cd -- "$(dirname -- "$0")/.." >/dev/null

# Nach `expo prebuild` hasht der Fingerprint das generierte Verzeichnis als
# `bareNativeDir` mit; der Schlüssel hinge dann an einem zufälligen
# Zwischenstand. Im Workflow läuft das Skript deshalb vor dem Prebuild.
if [ -d "$platform" ]; then
  echo "native-build-key: ${platform}/ existiert, Schlüssel nur vor expo prebuild." >&2
  exit 1
fi

# @expo/fingerprint schluckt zwei Fehler und liefert trotzdem einen gültigen
# Hash: Lädt die Expo-Config nicht oder scheitert das Autolinking, fehlen nur
# deren Quellen. Deshalb müssen beide in der Ausgabe stehen.
fingerprint="$(node_modules/.bin/fingerprint fingerprint:generate --platform "$platform" |
  node -e '
    const fp = JSON.parse(require("fs").readFileSync(0, "utf8"));
    const ids = fp.sources.map((source) => source.id);
    for (const id of ["expoConfig", `expoAutolinkingConfig:${process.argv[1]}`]) {
      if (!ids.includes(id)) {
        console.error(`native-build-key: Fingerprint ohne Quelle ${id}.`);
        process.exit(1);
      }
    }
    process.stdout.write(fp.hash);
  ' "$platform")"
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
