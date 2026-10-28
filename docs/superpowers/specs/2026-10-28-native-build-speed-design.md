# Native-Build schneller: nur arm64, vorkompiliertes React Native, Überspringen bei unverändertem nativen Stand

Stand 2026-10-28 · Branch `ci/native-build-speed` · betrifft [native-build.yml](../../../.github/workflows/native-build.yml), [mise.toml](../../../mise.toml) · ersetzt Teile von ADR-016 und den RN-Pin aus ADR-007

## Warum

Der iOS-Job bestimmt die Wartezeit jedes PRs: heute 41–47 min, davon 38–42 min `xcodebuild`. Android braucht 16–23 min, der Metro-Job ~2 min. Sven empfindet das als zu lang. Gemessen an vier grünen Läufen vom 27./28.10. und am vollständigen Log von Job 122698548884:

1. **Doppelte Architektur.** `-destination 'generic/platform=iOS Simulator'` hat keine aktive Architektur, Xcode baut arm64 **und** x86_64: 1193 + 1193 `CompileC`, 109 + 109 `SwiftCompile`. Der Runner ist arm64; die x86_64-Hälfte prüft nichts, was arm64 nicht auch prüft.
2. **`RCT_USE_PREBUILT_RNCORE=0` kostet doppelt.** React Native wird aus Source gebaut (RN-Core ≈ 58 % aller `CompileC`), und Expo schaltet deshalb auch die vorkompilierten Expo-Module ab — wörtlich im Log: „EXPO_USE_PRECOMPILED_MODULES=1 was set, but React Native is configured to build from source … every Expo module will be built from source". Der Pin stammt aus dem SDK-55-Sprung (ADR-007, `React-Core-prebuilt 0.81.5` gegen `React-Core 0.83.6`), vermutlich ein veraltetes lokales Artefakt, nicht ein Fehler des Mechanismus — unbelegt.
3. **Jeder PR kompiliert denselben nativen Stand neu.** Xcode und Gradle sehen nur nativen Code; der Debug-Build bündelt kein JS (`SKIP_BUNDLING enabled; skipping.` im Log). Ein PR, der nur TypeScript ändert, kompiliert 40 min lang exakt das, was der PR davor schon kompiliert hat.
4. **Die Caches treffen strukturell nicht.** Kein Workflow läuft auf `main`; GitHub teilt PR-Caches nicht zwischen PRs, also startet jeder PR kalt. Belegt sind 10,9 GB bei 10 GB Limit (LRU-Verdrängung, Gradle-Einträge 1,6–3,4 GB). Auf macOS kostet das Speichern des Bun-Caches 54–79 s, mehr als `bun install` ohne Cache (8–15 s).

## Ziele

- PR ohne nativen Unterschied: iOS- und Android-Job grün nach wenigen Minuten (Richtwert ≤ 3 min), ohne Compile.
- PR mit nativem Unterschied: voller Build, deutlich schneller als heute.
- Ein Compile-Fehler, den ein PR verursacht, wird vor dem Merge sichtbar — wie heute.
- Drift von außen (neues Runner-Image, CocoaPods) fällt spätestens nach einer Woche auf.

## Nicht-Ziele

- Keine kostenpflichtigen Runner, kein EAS im Gate (ADR-016 gilt weiter).
- Kein ccache, kein Xcode-26-Compilation-Cache in dieser Runde (nach den Prebuilds bleibt dafür wenig übrig; erst mit Messung).
- Kein Smoke-Start (eigener TODO-Eintrag bleibt).
- `ci.yml`, `db.yml` und der `bundle`-Job bleiben unverändert.

## Anti-Ziele — Fehlschlag, auch wenn alles grün ist

- Ein Job überspringt, obwohl sich am nativen Stand etwas geändert hat.
- Eine Marke „grün gebaut" entsteht aus einem fehlgeschlagenen oder abgebrochenen Build.
- Ein Required Check bleibt auf einem PR „ausstehend" oder heißt anders als vorher.

## Randbedingungen

- **Job-Namen bleiben exakt** — sie sind die Required Checks im Ruleset „main protection": `Metro bundle (ios · android)`, `Android (prebuild · assembleDebug)`, `iOS (prebuild · pod install · xcodebuild)`.
- **Kein `paths`-Filter** auf dem Workflow (CLAUDE.md). Der Job läuft immer und entscheidet selbst, ob er kompiliert.
- Actions per Commit-SHA gepinnt wie im Bestand; `actions/cache/restore` und `actions/cache/save` sind Unterpfade derselben Action, also derselbe SHA wie `actions/cache` v6.
- `persist-credentials: false` und `permissions: contents: read` bleiben. Toolchain weiter aus `mise.toml` über `jdx/mise-action`.
- Workflow-Kommentare wie im Bestand: warum, nicht was. Überholte Kommentare (RN-Pin, Pods-Cache) werden im selben Commit angepasst.

## Entscheidungen

### 1. Nur arm64

`ARCHS=arm64` als Build-Setting am `xcodebuild`-Aufruf; die Destination bleibt `generic/platform=iOS Simulator`. arm64 ist auch die Architektur echter Geräte.

### 2. Vorkompiliertes React Native und vorkompilierte Expo-Module

- `RCT_USE_PREBUILT_RNCORE = "0"` samt Kommentarblock aus `mise.toml` entfernen. Das generierte `ios/Podfile` fällt dann auf `'1'` zurück, `EXPO_USE_PRECOMPILED_MODULES` steht dort bereits auf `'1'`.
- Der Step „Assert RN-from-source pin from mise.toml" im iOS-Job entfällt.
- `ios/Pods` wird nicht mehr gecacht, nur noch `~/Library/Caches/CocoaPods`. Ein über den Fallback-Schlüssel wiederhergestelltes `Pods` mit Binaries einer anderen Version ist genau die Fehlerklasse aus ADR-007.
- „Läuft" heißt: grüner Compile plus die Log-Zeilen aus dem Nachweis. Die Dauer wird gemessen, ist aber kein Abbruchkriterium. Bleibt der Build nach Ursachenanalyse und zwei Korrekturversuchen rot (meine Wahl): diesen Schritt zurücknehmen, die übrigen weiterführen, Befund an Sven.
- Lokale Folge für Sven: beim nächsten iOS-Build `bunx expo prebuild --platform ios --clean`, damit `pod install` ohne den alten Pin läuft. Gehört in die PR-Beschreibung.

### 3. Überspringen bei unverändertem nativen Stand — iOS und Android

Android bekommt denselben Mechanismus (meine Wahl): Sonst bestimmt Android mit ~20 min die Wartezeit, sobald iOS schnell ist.

**Schlüssel pro Plattform** = Fingerprint von `@expo/fingerprint` (`fingerprint:generate --platform ios|android`, kommt mit `expo` mit, liegt nach `bun install` in `node_modules`) + Hash von `mise.toml` und `native-build.yml` + bei iOS die Xcode-Version (`xcodebuild -version`). Die Bestandteile werden zu einem kurzen Hash zusammengefasst; GitHub begrenzt Cache-Schlüssel auf 512 Zeichen.

- Berechnet **nach** `bun install` und **vor** `expo prebuild`: Existiert `ios/` bzw. `android/`, hasht der Fingerprint das generierte Verzeichnis mit (lokal beobachtet als Quelle `bareNativeDir`).
- Der Fingerprint erfasst heute (lokal gemessen): alle 26 autolinkten Pakete einschließlich React Native und transitiver wie `react-native-worklets`, jeweils über den Inhalt ihrer `package.json` (also die Version); `app.json` samt Config-Plugins, von der Config referenzierte Dateien (Icon, Splash), die Autolinking-Konfiguration, `package.json`-Skripte, `.gitignore`. Eigene native Ordner, Patches oder eigene Codegen-Specs gibt es im Projekt nicht — Paketinhalt ändert sich also nur mit der Version. `mise.toml`, Workflow und Xcode-Version erfasst er nicht — deshalb die Zusätze.
- `bun.lock` kommt **nicht** in den Schlüssel (meine Wahl): Sonst baute jeder reine JS-Dependency-Bump voll, und das sind die meisten Renovate-PRs. Was davon nativ ist, steckt bereits über die Paketversionen im Fingerprint.
- Jede Änderung an `native-build.yml` oder `mise.toml` erzwingt einen vollen Build. Das ist gewollt: Beide definieren den Build.

**Marke** = Cache-Eintrag mit einer kleinen Datei, Schlüssel `native-build-<plattform>-<schlüssel>`. Nachschlagen mit `actions/cache/restore` und `lookup-only: true`. Ein PR sieht dabei seine eigenen Marken und die aus `main`, ein Push auf `main` nur die aus `main`.

- **Treffer** (nur auf `pull_request` und `push`): Prebuild, Pod install, Gradle- und Pods-Cache und Compile entfallen. Der Job endet grün und nennt in einer Notiz (`::notice::` oder Step Summary) den Schlüssel. Die Schritte bis zur Schlüsselberechnung, einschließlich der JDK-Assertion, laufen weiter.
- **Kein Treffer:** voller Build. Die Marke wird nach dem Compile und nur unter `success()` gespeichert; ein fehlgeschlagener oder abgebrochener Lauf hinterlässt keine. Gespeichert wird bei jedem Ereignis, auch auf PRs — ein PR-Eintrag lässt spätere Pushes desselben PRs überspringen und kostet nichts.

**Warum das sicher ist** (mit Sven besprochen): Ein Compile-Fehler kann nur aus etwas entstehen, das im Schlüssel steckt. TypeScript erreicht weder Xcode noch Gradle; TS-Fehler fängt `typecheck`, kaputte Imports der `bundle`-Job, der auf jedem PR für iOS und Android bündelt. Was übrig bleibt, ist Drift von außen, die kein PR verursacht: ein neues Runner-Image (für iOS über die Xcode-Version im Schlüssel abgedeckt) und die fünf Pods vom CocoaPods-CDN (boost, fmt, glog, DoubleConversion, SocketRocket — Versionen fest aus den RN-Podspecs). Für Android steht das Ubuntu-Image (SDK, Build-Tools) bewusst nicht im Schlüssel, sonst wäre er nach jedem wöchentlichen Image-Update ungültig. Für beides gibt es den Wochenbuild.

### 4. Trigger

- `push` auf `main`: baut nach dem Merge und legt Marken und Caches im `main`-Bereich an, den alle PRs lesen. PR-Einträge sind für `main` und andere PRs unsichtbar, also baut der erste Push nach einem nativen Merge voll — ein nativer PR wird damit zweimal gebaut. Akzeptiert: Auf den Lauf auf `main` wartet niemand, und die Minuten sind gratis.
- `schedule`, wöchentlich (meine Wahl: montags 04:00 UTC): Vollbuild, ignoriert die Marke, frischt sie auf.
- `workflow_dispatch` (meine Wahl): manueller Vollbuild wie `schedule`. Damit lässt sich der Vollbuild-Pfad direkt nach dem Merge prüfen, statt eine Woche zu warten.
- Concurrency: Ein Push auf `main` darf den laufenden Wochenbuild nicht abbrechen. Das PR-Verhalten (ein Lauf pro Ref, alter wird abgebrochen) bleibt.

### 5. Caches

- Große Caches — Gradle, CocoaPods-Download-Cache, Bun auf den Ubuntu-Jobs — werden nur im `main`-Bereich gespeichert, und nur von einem Lauf, der tatsächlich gebaut hat; auf PRs werden sie nur geladen (`actions/cache/restore` und `actions/cache/save` getrennt). Schlüssel und Fallback-Schlüssel wie bisher. Bis zum ersten Lauf auf `main` starten PRs kalt — wie heute auch.
- Der Bun-Cache im iOS-Job entfällt ganz (meine Wahl, nach den gemessenen Zeiten oben).
- Ziel: Belegung deutlich unter 10 GB. Bestehende PR-Einträge verfallen von selbst nach 7 Tagen ohne Zugriff.

## Nachweis

Jede Stufe als eigener Commit, gemessen über mindestens zwei Läufe auf einem früh geöffneten Draft-PR — nur `pull_request`-Läufe messen. Die Runner-Varianz liegt bei ~29 %; der Metro-Job dient als Kontrollgröße (ADR-016).

| Stufe        | Beleg                                                                                                                                                                                                                               |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| arm64        | keine `CompileC`/`SwiftCompile` für x86_64 im Log; iOS-Jobdauer                                                                                                                                                                     |
| Prebuilds    | `[ReactNativeCore] … Building from source: false` im Log, die Expo-Warnung fehlt; iOS-Jobdauer                                                                                                                                      |
| Schlüssel    | lokal: Fingerprint ändert sich bei geänderter `app.json` und bei geänderter nativer Paketversion, bleibt gleich bei geänderter `.ts`-Datei                                                                                          |
| Überspringen | erster Lauf baut voll und speichert die Marke; ein Folge-Push ohne native Änderung lässt beide Compile-Jobs mit Notiz in ≤ ~3 min grün enden — das belegt zugleich, dass der Schlüssel auf einem frischen Runner reproduzierbar ist |
| Caches       | keine neuen Gradle-/Pods-/Bun-Einträge unter `refs/pull/…` aus diesem PR (`gh cache list`)                                                                                                                                          |

Nach dem Merge, braucht Sven: Der Push-Lauf auf `main` legt die Marken an; der nächste TS-PR überspringt; ein `workflow_dispatch` baut voll.

## Doku — einmal am Branch-Ende

- Neuer ADR (nächste freie Nummer): ersetzt ADR-016 Decision 1 (jeder PR baut) und die Cache-Teile, ADR-007s RN-Pin. ADR-016 Decision 7 (ccache) bleibt.
- `docs/development.md`: Absatz zu `native-build.yml`, Pin-Absatz zu `RCT_USE_PREBUILT_RNCORE`, Satz „kein `push`-Trigger auf `main`".
- `CLAUDE.md`: Toolchain-Absatz ohne den RN-Pin, CI-Absatz „alle PR-getriggert".
- `docs/TODO.md` und `docs/roadmap.md`: Einträge „Prebuilt React Native reaktivieren" und „`RCT_USE_PREBUILT_RNCORE` über `expo-build-properties`" löschen; „`eas build --local`" berichtigen (der ccache-Gewinn, auf den er sich beruft, existiert nicht).
- Kommentare in Workflow und `mise.toml` gehören in den Commit ihres Codes.

## Dem Builder überlassen

- Ob die Schlüsselberechnung inline in beiden Jobs oder in einem Skript lebt; ein Skript gehört dann mit in den Schlüssel.
- Genaue Form der Step-Bedingungen, Format der Notiz, Cron-Minute.
- Wie der Draft-PR gemessen wird (Re-Run oder leerer Commit), solange jede Stufe mindestens zwei Läufe hat.
