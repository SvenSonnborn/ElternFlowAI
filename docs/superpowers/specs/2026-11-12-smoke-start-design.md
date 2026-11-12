# Smoke-Start im Simulator und Emulator (Roadmap Block 10) — Design

**Status:** Entwurf, abgestimmt im Gespräch mit Sven am 2026-11-12
**Date:** 2026-11-12
**Branch:** `chore/smoke-start`, [roadmap.md](../../roadmap.md) Block 10
**Decision-Log:** ein ADR (057) am Branch-Ende; er ersetzt in [ADR-016](../../decision-log.md) die Wahl „Debug, nicht Release“ und den Satz „Was weiterhin ungeprüft bleibt: dass die App _startet_“

## 1. Worum es geht

Der Eintrag „Kein Smoke-Start im Simulator/Emulator“ in [TODO.md](../../TODO.md): `native-build.yml` beweist „kompiliert“, nicht „startet“. Ein Absturz beim App-Start käme erst am Gerät heraus. Gemeint sind native Ursachen: ein Native-Modul fehlt zur Laufzeit, die Autolinking-Registrierung ist kaputt, der Splash- oder Font-Ladepfad ist defekt.

Der Check ist **Vorsorge**. Sven ist ein solcher Absturz bisher nicht passiert. Das Risiko sitzt bei Renovate-Updates und SDK-Sprüngen, also dort, wo sich native Pakete ändern.

Was der Code am 2026-11-12 zeigt:

- Die Compile-Jobs `android` und `ios` bauen nur, wenn für den nativen Stand noch keine Marke existiert ([scripts/native-build-key.sh](../../../scripts/native-build-key.sh), [ADR-048](../../decision-log.md)). Jede Abhängigkeitsänderung baut voll, reine TypeScript-Änderungen nicht. `schedule` und `workflow_dispatch` bauen immer.
- Beide Jobs bauen **Debug**. Debug-Varianten bundeln kein JS, sie laden es zur Laufzeit von Metro.
- Die CI hat keine Supabase, nur die Platzhalter `EXPO_PUBLIC_SUPABASE_URL=https://test.supabase.invalid` und einen Platzhalter-Schlüssel. Ohne Sitzung leitet `AuthGate` nach `/(auth)/login` ([decideRoute.ts](../../../features/auth/decideRoute.ts)). Der erste Screen ist also verlässlich der Login.
- Die Sprache der App folgt dem Gerät ([features/i18n/index.ts](../../../features/i18n/index.ts)). Simulator und Emulator in der CI stehen auf Englisch, der Login zeigt dort „Sign in“, lokal oft „Anmelden“.
- Die Android-Vorlage signiert `release` mit dem Debug-Keystore (`signingConfig signingConfigs.debug` in der generierten `android/app/build.gradle`). Ein Release-Build braucht also keinen eigenen Keystore und kein Secret.
- Die Jobnamen sind Required Checks im Ruleset „main protection“: `Android (prebuild · assembleDebug)` und `iOS (prebuild · pod install · xcodebuild)`.

## 2. Ziele, Nicht-Ziele, Anti-Ziele

**Ziele**

1. Baut `native-build.yml` die App für iOS oder Android, startet derselbe Job sie danach im Simulator bzw. Emulator. Der Job wird rot, wenn der Login-Screen nicht innerhalb des Zeitlimits erscheint. Das gilt für einen harten Absturz ebenso wie für eine App, die hängt (Splash verschwindet nie, Schrift lädt nicht).
2. Bei Rot hängen ein Screenshot und das Gerätelog als Artefakt am Lauf.
3. Ohne Metro, ohne Secret, ohne Konto, ohne Supabase. Der Workflow läuft weiter unverändert auf Forks.

**Nicht-Ziele**

- **PRs, deren nativer Stand schon grün gebaut wurde.** Dort entfällt der Compile und damit auch der Startcheck. Ein Startabsturz, den reiner JS-Code auf so einem PR auslöst, fällt nicht auf. Das ist nicht die Fehlerklasse des TODO-Eintrags.
- **Alles nach dem Login-Screen:** kein Anmelden, keine Tabs, keine E2E-Tests.
- **Echte Geräte und signierte Artefakte.** Das bleibt die EAS-Hälfte aus ADR-016.
- **Den `bundle`-Job ersetzen.** Er läuft weiter auf jedem PR, auch wenn die Compile-Jobs überspringen.

**Anti-Ziele**, also Fehlschläge, auch wenn es läuft:

- **Der Check wird rot, obwohl mit der App alles stimmt.** Das wiegt schwerer als ein durchgerutschter Absturz (Sven, 2026-11-12, auf meine Empfehlung). Ein grundlos roter Pflicht-Check erzieht zum „einfach neu starten“, auch beim echten Fehler.
- PRs, die nur TypeScript ändern, warten länger als heute.
- Der iOS-Job, der die PR-Dauer bestimmt, wird bei einem Vollbuild um mehr als etwa 20 Minuten länger (Sven, 2026-11-12). Das trifft nur PRs mit geändertem nativem Stand, vor allem Renovate- und SDK-PRs. **Wird es mehr**, läuft der iOS-Startcheck nur noch bei `schedule`, `workflow_dispatch` und `push` auf `main`, nicht mehr auf PRs. Android bleibt auf PRs, weil der Job parallel läuft und die PR-Dauer nicht bestimmt.

## 3. Entscheidungen

### 3.1 Wann der Check läuft — Sven: passt

Im bestehenden `android`- und `ios`-Job, direkt nach dem Compile, unter derselben Bedingung `steps.decide.outputs.build == 'true'`. Er läuft **vor** dem Schreiben der Marke. Eine Marke heißt danach „kompiliert und startet“, und ein roter Startcheck hinterlässt keine.

### 3.2 Kein Metro im Job — Sven: passt

Das JS steckt im gebauten App-Paket. Metro wäre die größte Quelle für Fehlschläge, die das TODO nennt.

### 3.3 Release statt Debug — meine Setzung, folgt aus 3.2

Release bundelt das JS ins Paket, und `__DEV__` ist dort `false`. Ein fataler JS-Fehler beim Start beendet die App, statt nur einen roten Fehlerbildschirm zu zeigen. Ein Debug-Build mit eingebautem Bundle hätte weiter Dev-Semantik.

- Android: `./gradlew assembleRelease`, signiert mit dem Debug-Keystore der Vorlage.
- iOS: `xcodebuild -configuration Release`, weiter unsigniert für den Simulator (`CODE_SIGNING_ALLOWED=NO`, `ARCHS=arm64`).
- Nebeneffekt: Die Lücke „Debug ≠ Release“ aus ADR-016 schließt sich.
- Preis: Der Debug-Compile wird nicht mehr geprüft. Debug-only-Code (Dev-Menü, Dev-Support) kann dann unbemerkt brechen. Das ist hinnehmbar, weil Release die ausgelieferte Konfiguration ist.
- Kosten: Optimierung und JS-Bundling verlängern den Compile. Der Builder misst das (siehe §5).

### 3.4 Was „startet“ heißt — Sven: passt

Der Login-Screen ist sichtbar, und zwar innerhalb eines großzügigen Zeitlimits ab dem Start der App. Erkannt wird er an einer `testID` an der Wurzel von [LoginScreen.tsx](../../../app-sections/auth/LoginScreen.tsx), nicht am Text. Der Text hinge an der Gerätesprache und an der Copy. _(testID: meine Setzung.)_

### 3.5 Eine Wiederholung des Startchecks — meine Setzung, folgt aus dem ersten Anti-Ziel

Schlägt der Startcheck fehl, läuft er genau einmal erneut, ohne neuen Build. Ein echter Startabsturz wiederholt sich und bleibt rot. Ein Aussetzer von Emulator oder Testtreiber wird geschluckt. Ein Absturz, der nur manchmal auftritt, kann so durchrutschen; das nimmt §2 in Kauf.

**Ausfälle der Prüfumgebung zählen nicht als Startfehler.** Simulator bzw. Emulator booten und Maestro installieren ist ein eigener Step vor dem Installieren der App. Scheitert er, wird er einmal wiederholt. Scheitert er wieder, endet der Job grün mit einer Warnung im Checks-Tab (wie `expo-doctor`, [ADR-055](../../decision-log.md)), schreibt aber **keine Marke**. Der nächste Push baut und prüft dann erneut. Alles ab dem Installieren der App ist nach der einen Wiederholung rot, auch ein Maestro-Treiber, der sich nicht verbindet. Grün heißt damit „kompiliert, und entweder gestartet oder mit Warnung ungeprüft“. _(Meine Setzung, folgt aus dem ersten Anti-Ziel.)_

### 3.6 Werkzeug: Maestro — meine Setzung

Eine Flow-Datei für beide Plattformen (`launchApp`, warten, bis die `testID` sichtbar ist). Das Warten ist eingebaut, bei Fehlschlag entsteht ein Screenshot, und derselbe Flow läuft lokal. Die Version ist gepinnt; es gibt keine Maestro Cloud und kein Konto.

Erweist sich Maestro im Spike (§5) auf dem iOS-Runner als unzuverlässig, nimmt der Builder Plattformwerkzeuge: auf iOS `xcrun simctl` plus einen Accessibility-Dump, auf Android `adb` plus `uiautomator dump`. Das entscheidet der Builder nach dem Spike und nennt es im PR.

### 3.7 Android-Emulator

Ein x86_64-Image auf `ubuntu-latest` mit KVM. Das APK muss x86_64 enthalten. Die heutige `reactNativeArchitectures` baut alle vier ABIs und bleibt so, damit der Compile-Umfang nicht schrumpft. Der Android-Job läuft parallel zu iOS. Zusätzliche Minuten dort kosten nichts, solange er kürzer bleibt als der iOS-Job.

### 3.8 Diagnose bei Rot

Bei einem roten Startcheck lädt der Job hoch: Screenshot, Gerätelog (iOS: Simulator-Log und Crash-Reports, Android: `logcat -d`) und die Maestro-Ausgabe. Das läuft über `actions/upload-artifact` (auf SHA gepinnt wie die übrigen Actions) mit kurzer Aufbewahrung.

### 3.9 Jobnamen — Sven: umbenennen

Die Namen sind Required Checks, und `assembleDebug` stimmt nach 3.3 nicht mehr. Neue Namen, ungefähr `Android (prebuild · assembleRelease · Startcheck)` und `iOS (prebuild · pod install · xcodebuild · Startcheck)`. Das Ruleset „main protection“ kann das `gh`-Token nicht ändern. Sven tauscht die beiden Required Checks kurz vor dem Merge von Hand. Bis dahin zeigt der PR die alten Namen als „ausstehend“.

## 4. Was sich daneben ändert

- **`native-build.yml`:** Der Kommentar am `env`-Block sagt heute, nur der `bundle`-Job brauche die Supabase-Platzhalter, weil Debug kein JS bundele. Das gilt nach 3.3 nicht mehr: Die Compile-Jobs bundeln jetzt selbst. Dazu kommen die Kommentare „Debug, not Release“ am Gradle-Step und die am Xcodebuild-Step. Die `timeout-minutes` beider Jobs werden geprüft.
- **`LoginScreen.tsx`:** eine `testID`.
- **`scripts/native-build-key.sh`:** Die Flow-Datei kommt in den Schlüssel. Sonst überspringt ein PR, der nur den Flow ändert, den Check. `native-build.yml` steht schon drin; die Änderung am Workflow macht alle bisherigen Debug-Marken ungültig, ohne Sonderweg. _(Meine Setzung.)_
- **Lokale Änderungen aus `main`:** `expo-mcp` als Dev-Dependency (`package.json`, `bun.lock`) kommt als eigener Commit mit, ohne Bezug zum Startcheck (Sven: „können einfach da mit rein“).
- **Doku am Branch-Ende**, je an ihrer Heimat:
  - ADR-057.
  - Absatz `native-build.yml` in [development.md](../../development.md#cicd-github-actions).
  - Den TODO-Eintrag löschen.
  - Roadmap Block 10 und „Die nächsten Branches“.
  - In `CLAUDE.md` die CI/CD-Zeile („Android- und iOS-Compile“).
  - [eltern-flow-ai-project-structure.md](../../eltern-flow-ai-project-structure.md), falls ein neuer Ordner für den Flow entsteht.

## 5. Abnahme

1. **Spike zuerst:** Der Flow läuft per `workflow_dispatch` auf dem Branch einmal auf beiden Plattformen grün, bevor Kommentare und Diagnose ausgearbeitet werden.
2. **Negativprobe:** Ein temporärer Commit lässt die App beim Start abstürzen, etwa mit einem `throw` beim Laden eines Moduls. Auf beiden Plattformen wird der Check rot, mit Screenshot und Log im Artefakt. Danach wird der Commit zurückgenommen.
3. **Drei vollständige Läufe hintereinander** per `workflow_dispatch` sind grün, ohne dass die Wiederholung aus 3.5 einspringen musste.
4. **Die Dauer der iOS- und Android-Jobs** vor und nach der Änderung steht im PR, nicht in der Doku. Sie liegt innerhalb des dritten Anti-Ziels.
5. Lokal grün: `bun format:check`, `bun lint`, `bun run typecheck`, `bun test`, `bun run test:rn`.
6. Sven hat vor dem Merge die Required Checks im Ruleset auf die neuen Jobnamen umgestellt.

## 6. Dem Builder überlassen

- Maestro-Version und Installationsweg (gepinnt, mit Prüfsumme, wo möglich).
- Modell und Runtime des Simulators, API-Level und Caching des Emulators.
- Die konkreten Zeitlimits.
- Wie die Wiederholung umgesetzt wird.
- Ort und Name der Flow-Datei.
