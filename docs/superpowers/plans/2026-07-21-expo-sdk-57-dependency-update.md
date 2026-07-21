# Expo SDK 54 → 57 Dependency-Update — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Projekt von Expo SDK 54 stufenweise auf das aktuelle stabile SDK 57 heben (54→55→56→57) und danach die Non-Expo-Dependencies aktualisieren — jede Stufe ein für sich grüner, verifizierter Commit.

**Architecture:** CNG-Workflow (`/ios` + `/android` sind gitignored, `expo prebuild --clean` regeneriert sie aus `app.json` + Config-Plugins). Kein nativer Code wird von Hand gediffed. Jeder SDK-Bump folgt demselben Rezept (§ Stufen-Rezept R1–R11); Versions-Alignment übernimmt `expo install --fix`. New Architecture ist bereits aktiv. Verifikation pro Stufe: statische Gates + Web-Export + `expo-doctor` + nativer iOS- **und** Android-Build + manueller Flow-Smoke.

**Tech Stack:** Expo SDK 54→57, React Native 0.81→0.86, React 19.1→19.2, expo-router (SDK-versioniert), reanimated v4 + worklets, NativeWind v4 + Tailwind 3.4, Zustand, TanStack Query, react-i18next, Supabase-js. Runtime: Bun 1.3.10 (gepinnt). Test-Runner: `bun test`.

## Global Constraints

Diese Regeln gelten für **jeden** Task implizit — exakt aus Spec + CLAUDE.md:

- **Bun 1.3.10** ist die gepinnte Runtime. Lokal `bun` nutzen; CI läuft `bun install --frozen-lockfile`. `bun.lock` wird in **jedem** Stufen-Commit mitcommittet.
- **Nie `--no-verify`** — Pre-Commit-Hooks (`lint-staged`) laufen immer. **Nie** einen `Co-Authored-By: Claude …`-Trailer anhängen. Conventional-Commits-Prefix, gescoped.
- **Handoff-Bundle ist off-limits** (nicht editieren ohne expliziten Auftrag): `design-system/{colors,typography,spacing,themes,components,index}.ts`, `docs/{HANDOFF,COPY,ICONS,README}.md`, `patterns/*.md`. Bei Konflikt (z. B. NativeWind zwingt Token-Änderung): in Konversation eskalieren, **nicht** still divergieren.
- **Versionen niemals von Hand pinnen** für RN, reanimated, worklets, expo-\* — immer `bunx expo install --fix` entscheiden lassen.
- **Babel:** `react-native-worklets/plugin` muss das **letzte** Plugin in `babel.config.js` bleiben.
- **New Architecture bleibt an** (`newArchEnabled: true` in `app.json`).
- **Definition of Done pro Stufe (alle grün):** `bun run format:check` · `bun lint` · `bun run typecheck` · `bun test` · `bunx expo export --platform web` · `bunx expo-doctor` · iOS-Build (`bun run ios`) · Android-Build (`bun run android`) · Flow-Smoke (§ Flow-Smoke-Checkliste).
- **Doku-Disziplin:** dokumentierte Änderungen im selben Commit nachziehen (CLAUDE.md-Tech-Stack pro SDK-Stufe; ADR + TODO am Ende).
- **`docs/TODO.md` vor Start lesen** und am Ende erledigte Punkte entfernen / neue anhängen.

---

## Referenz-Blöcke (einmal definiert, von Tasks referenziert)

### § Gate-Suite (`GATES`)

Die vollständige statische + Build-Verifikation. Wo ein Task „führe **GATES** aus" sagt, ist genau das gemeint:

```bash
# statisch
bun run format:check
bun lint
bun run typecheck
bun test
# web-smoke (identisch zur CI)
bunx expo export --platform web --output-dir /tmp/eltern-web-check
# health-check
bunx expo-doctor
# nativer Build (regeneriert /ios + /android, gitignored)
bunx expo prebuild --clean
bun run ios       # baut & startet iOS-Simulator
bun run android   # baut & startet Android-Emulator (Emulator/Device muss laufen)
```

Erwartetes Ergebnis: alle Befehle Exit 0, `expo-doctor` meldet keine Fehler, beide nativen Builds starten die App ohne Redbox/Crash.

### § Flow-Smoke-Checkliste (`SMOKE`)

Nach erfolgreichem nativem Build in **iOS-Simulator und Android-Emulator** manuell durchklicken:

1. **Auth:** Login mit bestehendem Test-Account → landet auf Dashboard.
2. **Tabs:** alle 5 Tabs (Dashboard · Kalender · Essen · Aufgaben · Familie) öffnen — kein Crash, Labels aus `nav.*` da.
3. **Voice-FAB:** auf allen 5 Tabs sichtbar (unten rechts, orange), Tap öffnet Placeholder-Modal.
4. **Kalender:** Tab öffnen, einen Termin antippen → Detail öffnet; Termin anlegen → speichert.
5. **Essen:** Tab öffnen, Essensplaner rendert ohne Fehler.
6. **Theme:** Settings-Sheet öffnen, Theme light→dark umschalten → Farben flippen (prüft NativeWind/CSS-Vars).

Bei jeder Redbox / jedem Crash / fehlenden UI-Element: **stoppen**, Ursache per `superpowers:systematic-debugging` klären, erst dann committen.

### § Stufen-Rezept (`R1`–`R11`) — identisch für jede SDK-Stufe N → N+1

Jeder SDK-Task (Task 2/3/4) besteht aus genau diesen Schritten. Die Task-Blöcke nennen nur die **Ziel-Version**, die **live zu lesende Guide-URL** und die **stufenspezifischen Achtungspunkte**.

- **R1 — Guide lesen:** Per WebFetch die Expo-Upgrade-Ressourcen für SDK N+1 abrufen und die Breaking-Changes/Deprecations notieren:
  - Walkthrough: `https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/`
  - Changelog-Post der Ziel-Version (Breaking Changes): `https://expo.dev/changelog/sdk-<N+1>`
  - Bei RN-spezifischen Fragen: `https://reactnative.dev/blog` (Release-Post der vom SDK gebündelten RN-Version).
- **R2 — Arbeitsbaum sauber:** `git status --short` muss leer sein (vorige Stufe committet).
- **R3 — Expo bumpen:** `bun add expo@^<N+1>` (z. B. `bun add expo@^55`).
- **R4 — Alles alignen:** `bunx expo install --fix` — richtet react-native, react, react-dom, reanimated, worklets, expo-router, safe-area-context, screens, gesture-handler, alle `expo-*` und `@expo/*` auf die vom SDK gebündelten Versionen aus. **Nichts** davon anschließend von Hand ändern.
- **R5 — Dev-Deps prüfen:** `bunx expo install --check` — meldet, ob `jest-expo`, `@types/react` u. a. noch abweichen. Gemeldete auf die vorgeschlagene Version heben (`bun add -d <pkg>@<version>`). `@types/react` muss zur `react`-Version passen (19.1→19.2).
- **R6 — Doctor:** `bunx expo-doctor` → muss sauber sein. Bei „New project dependencies incompatible" o. ä.: Meldung abarbeiten, nicht ignorieren.
- **R7 — Breaking-Changes im Code:** die in R1 notierten Punkte abarbeiten. Häufige Stellen in diesem Projekt: `app/_layout.tsx` (Provider), `babel.config.js` (worklets-Plugin bleibt letztes), `app.json` (Plugin-Props), `metro.config.js`/`tsconfig.json` falls vorhanden, NativeWind/reanimated-Imports. **Keine** neuen `as`-Casts auf typisierten Routen (CI hat die `Href`-Union nicht — CLAUDE.md-Caveat).
- **R8 — CLAUDE.md-Tech-Stack aktualisieren:** im Tech-Stack-Block die Zeilen für **Expo SDK-Nummer, React Native, React, expo-router** auf die nach R4 tatsächlich installierten Versionen setzen (aus `package.json` ablesen, nicht raten).
- **R9 — GATES:** die § Gate-Suite ausführen. Alles muss Exit 0 sein.
- **R10 — SMOKE:** die § Flow-Smoke-Checkliste auf iOS **und** Android durchgehen.
- **R11 — Commit:** exakt die geänderten Dateien stagen (mind. `package.json`, `bun.lock`, `CLAUDE.md`; ggf. `babel.config.js`, `app.json`, berührte `.tsx`), committen. Hooks laufen lassen. Commit-Message: `chore(deps): Expo SDK <N+1> (RN <x.y>, React <a.b>)`.

---

## File Structure

Welche Dateien angefasst werden und wofür:

- **`package.json`** — `dependencies`/`devDependencies` pro Stufe; `"test": "jest"` → `"test": "bun test"` (Task 1).
- **`bun.lock`** — regeneriert bei jedem `bun add` / `expo install`; pro Stufe mitcommittet.
- **`app.json`** — nur falls eine SDK-Stufe geänderte Plugin-Props/Config verlangt (aus Guide).
- **`babel.config.js`** — nur prüfen, dass `react-native-worklets/plugin` letztes Plugin bleibt; ändern nur bei Guide-Vorgabe.
- **`CLAUDE.md`** — Tech-Stack-Block pro SDK-Stufe (R8); jest-Notiz in Task 1.
- **`docs/decision-log.md`** — neuer ADR am Ende (Task 6), alte ADRs unangetastet.
- **`docs/TODO.md`** — jest-Item entfernen (Task 1); neue Follow-ups anhängen (Task 5/6).
- **`design-system/ThemeProvider.tsx`, `design-system/ui/*`** — **nur falls** NativeWind-Bump es erzwingt (Claude-owned; Token-Dateien bleiben off-limits).
- **`/ios`, `/android`** — regeneriert via prebuild, **gitignored**, nie committet.

---

### Task 0: Baseline — SDK-54-Patches + Alignment (grüne Ausgangsbasis)

Beweist, dass die Pipeline auf aktuellem SDK 54 sauber ist, bevor Majors angefasst werden. Wir sind bereits auf Branch `chore/dependency-updates` (von `main`, Spec-Commit liegt drauf).

**Files:**

- Modify: `package.json`, `bun.lock`

**Interfaces:**

- Consumes: nichts (erste Stufe).
- Produces: einen grünen SDK-54.0.36-Zustand als Rollback-Anker für Task 2.

- [ ] **Step 1: Arbeitsbaum & Branch prüfen**

Run:

```bash
git branch --show-current   # erwartet: chore/dependency-updates
git status --short          # erwartet: leer
```

- [ ] **Step 2: `docs/TODO.md` lesen** (Pflicht laut CLAUDE.md — Kontext, was schon offen ist).

Run: `cat docs/TODO.md`
Erwartet: u. a. der jest-Binary-Punkt (wird in Task 1 erledigt).

- [ ] **Step 3: SDK-54-Pakete auf gebündelte Patch-Versionen alignen**

Run:

```bash
bunx expo install --fix
```

Erwartet: expo 54.0.34 → 54.0.36 und ggf. weitere `expo-*`-Patches; `react-native`/`react` bleiben bei 0.81.5 / 19.1.0 (SDK 54 ändert sich nicht im Major).

- [ ] **Step 4: GATES ausführen** (§ Gate-Suite)

Erwartet: alles Exit 0. Falls hier schon etwas rot ist, ist es ein bestehendes Problem — **vor** dem SDK-Sprung fixen (eigener Commit) oder in `docs/TODO.md` dokumentieren.

- [ ] **Step 5: SMOKE** (§ Flow-Smoke-Checkliste) auf iOS + Android.

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lock
git commit -m "chore(deps): SDK-54-Patches alignen (Baseline vor Major-Bumps)"
```

Erwartet: Hooks laufen, Commit erstellt.

---

### Task 1: Test-Script auf `bun test` umbiegen + jest-TODO schließen

Unabhängig vom SDK-Bump: der `jest`-Binary ist unter jest-expo 55 kaputt (`docs/TODO.md`), echter Runner ist `bun test`. Wir biegen das npm-`test`-Script um, damit `bun run test` / `bun run check` nicht mehr in den kaputten jest-Pfad laufen, und schließen den TODO-Punkt. Vor den SDK-Bumps, damit jede spätere Stufe ein funktionierendes `test`-Script hat.

**Files:**

- Modify: `package.json:11` (`"test"`-Script), `CLAUDE.md` (jest-Notiz), `docs/TODO.md` (Item entfernen)

**Interfaces:**

- Consumes: grüne Baseline aus Task 0.
- Produces: `bun run test` == `bun test` (Buns Runner); konsistente Doku.

- [ ] **Step 1: Verifizieren, dass `bun test` grün und `bun run test` (jest) rot ist**

Run:

```bash
bun test                 # erwartet: PASS (aktuell 73 Tests grün)
bun run test 2>&1 | tail -5   # erwartet: jest-Crash (clearMocksOnScope) — belegt das Problem
```

- [ ] **Step 2: `test`-Script umbiegen**

In [package.json](package.json) die Zeile

```json
    "test": "jest",
```

ändern zu

```json
    "test": "bun test",
```

- [ ] **Step 3: Verifizieren, dass `bun run test` jetzt grün ist**

Run: `bun run test`
Erwartet: PASS — läuft jetzt Buns Runner statt jest.

- [ ] **Step 4: CLAUDE.md-Notiz konsistent ziehen**

In [CLAUDE.md](CLAUDE.md), im Commands-Abschnitt, die Zeile

```
bun test                     # Tests (uses Bun's jest-compatible runner)
```

bleibt korrekt. Zusätzlich den Erklärabsatz darunter anpassen: den Satz, der behauptet `bun test` sei nur der Runner und das Script laufe jest, so umformulieren, dass `bun run test` jetzt ebenfalls Buns Runner nutzt. Konkret den Absatz, der mit „`bun test` runs Bun's built-in runner …" beginnt, um einen Satz ergänzen: „Das npm-`test`-Script zeigt seit dem jest-expo-55-Bruch (`this._moduleMocker.clearMocksOnScope is not a function`) auf `bun test`; der `jest`-Binary bleibt nur für RN-Snapshot-Tests via `npx jest` relevant."

- [ ] **Step 5: TODO-Item entfernen**

In [docs/TODO.md](docs/TODO.md) den kompletten Bullet entfernen, der mit „**`jest`-Binary reparieren oder `test`-Script umbiegen**" beginnt (die Zeile ganz löschen, nicht abhaken — CLAUDE.md-Workflow).

- [ ] **Step 6: GATES (statischer Teil reicht hier — keine Dep-/Native-Änderung)**

Run:

```bash
bun run format:check && bun lint && bun run typecheck && bun test
```

Erwartet: alles Exit 0. (Native Build/Smoke hier nicht nötig — es wurde kein Dependency oder Native-Code berührt.)

- [ ] **Step 7: Commit**

```bash
git add package.json CLAUDE.md docs/TODO.md
git commit -m "chore(test): test-Script auf bun test umbiegen (jest-expo-55-Bruch), TODO schließen"
```

---

### Task 2: SDK 54 → 55

**Files:**

- Modify: `package.json`, `bun.lock`, `CLAUDE.md` (Tech-Stack); ggf. `babel.config.js`, `app.json`, berührte `.tsx` (nur wenn Guide es verlangt)

**Interfaces:**

- Consumes: grüner SDK-54-Zustand (Task 0/1).
- Produces: grüner SDK-55-Zustand als Rollback-Anker für Task 3.

**Ziel-Version:** `expo@^55` (dist-tag `sdk-55`, aktuell 55.0.28). RN/React exakt via `expo install --fix`.

**Guide-URLs (R1):** `https://expo.dev/changelog/sdk-55` + `https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/`

**Stufenspezifische Achtungspunkte (in R7 prüfen):**

- Erste Major-Stufe → hier zeigt sich, ob `expo install --fix` sauber durchläuft. Genau auf reanimated/worklets-Paarung achten.
- Prüfen, ob SDK 55 neue `app.json`-Plugin-Props oder eine geänderte `expo-router`-Konfiguration verlangt.
- NativeWind: nach dem Bump `bunx expo export --platform web` beobachten — bricht die CSS-Vars-Generierung, ist es ein NativeWind/RN-Mismatch (siehe Risiko-Register der Spec).

- [ ] **Step 1: R1–R2** — Guide lesen (WebFetch beide URLs), Breaking-Changes notieren, `git status --short` leer.
- [ ] **Step 2: R3–R4** — `bun add expo@^55` && `bunx expo install --fix`. Danach installierte Kernversionen protokollieren: `grep -E '"expo"|"react-native"|"react"|"expo-router"|"react-native-reanimated"|"react-native-worklets"' package.json`.
- [ ] **Step 3: R5–R6** — `bunx expo install --check` (Dev-Deps heben), dann `bunx expo-doctor` (muss sauber sein).
- [ ] **Step 4: R7** — notierte Breaking-Changes im Code abarbeiten. `babel.config.js` prüfen: `react-native-worklets/plugin` letztes Plugin.
- [ ] **Step 5: R8** — CLAUDE.md-Tech-Stack-Zeilen (SDK 55, RN, React, expo-router) auf die tatsächlich installierten Versionen setzen.
- [ ] **Step 6: R9 (GATES)** — § Gate-Suite, alles Exit 0.
- [ ] **Step 7: R10 (SMOKE)** — § Flow-Smoke-Checkliste, iOS + Android.
- [ ] **Step 8: R11 (Commit)**

```bash
git add -A   # package.json, bun.lock, CLAUDE.md, ggf. babel.config.js/app.json/*.tsx — /ios,/android sind gitignored
git status --short   # verifizieren, dass KEINE ios/android-Dateien gestaged sind
git commit -m "chore(deps): Expo SDK 55 (RN <x.y>, React <a.b>)"
```

Vor dem Commit `<x.y>`/`<a.b>` durch die realen Versionen aus Step 2 ersetzen.

---

### Task 3: SDK 55 → 56

**Files:** wie Task 2.

**Interfaces:**

- Consumes: grüner SDK-55-Zustand (Task 2).
- Produces: grüner SDK-56-Zustand als Rollback-Anker für Task 4.

**Ziel-Version:** `expo@^56` (dist-tag `sdk-56`, aktuell 56.0.16). RN/React via `expo install --fix`.

**Guide-URLs (R1):** `https://expo.dev/changelog/sdk-56` + Walkthrough (s. o.).

**Stufenspezifische Achtungspunkte (R7):**

- Zweiter RN-Sprung in Folge — `react-native-calendars` (alt) und andere Community-Libs hier besonders auf Peer-Warnungen prüfen (`bun install` Output lesen). Nur beobachten; Non-Expo-Fixes kommen in Task 5.
- Erneut `app.json`/Plugin-Props gegen den Guide prüfen.

- [ ] **Step 1: R1–R2** — Guide SDK 56 lesen, notieren, Arbeitsbaum leer.
- [ ] **Step 2: R3–R4** — `bun add expo@^56` && `bunx expo install --fix`. Kernversionen protokollieren (grep wie Task 2 Step 2).
- [ ] **Step 3: R5–R6** — `expo install --check`, `expo-doctor` sauber.
- [ ] **Step 4: R7** — Breaking-Changes abarbeiten; worklets-Plugin letztes.
- [ ] **Step 5: R8** — CLAUDE.md-Tech-Stack auf SDK 56 / reale Versionen.
- [ ] **Step 6: R9 (GATES)** — alles Exit 0.
- [ ] **Step 7: R10 (SMOKE)** — iOS + Android.
- [ ] **Step 8: R11 (Commit)**

```bash
git add -A
git status --short   # KEINE ios/android-Dateien gestaged
git commit -m "chore(deps): Expo SDK 56 (RN <x.y>, React <a.b>)"
```

---

### Task 4: SDK 56 → 57

**Files:** wie Task 2; höhere Wahrscheinlichkeit, dass `design-system/ThemeProvider.tsx` / `design-system/ui/*` wegen NativeWind angefasst werden müssen (Claude-owned — Token-Dateien bleiben off-limits).

**Interfaces:**

- Consumes: grüner SDK-56-Zustand (Task 3).
- Produces: grüner SDK-57-Zustand (Ziel des SDK-Teils) — RN 0.86, React 19.2, expo-router 57.x.

**Ziel-Version:** `expo@^57` (dist-tag `latest`/`sdk-57`, aktuell 57.0.7). Endzustand: RN 0.86, React 19.2.7.

**Guide-URLs (R1):** `https://expo.dev/changelog/sdk-57` + Walkthrough.

**Stufenspezifische Achtungspunkte (R7) — höchstes Bruchrisiko:**

- **NativeWind ↔ RN 0.86 / reanimated:** Nach dem Bump zuerst `bunx expo export --platform web` und dann den nativen Build scharf beobachten. Bricht das Theming (CSS-Vars flippen nicht, Redbox in `ThemeProvider`), prüfen ob ein NativeWind-Patch/Minor nötig ist: `npm view nativewind version` und Kompatibilitäts-Matrix im NativeWind-Changelog. NativeWind-Bump zulässig; wenn er eine Token-Datei erzwingen würde → **stoppen und in Konversation eskalieren** (Handoff off-limits).
- **expo-router 6.x → 57.x:** Typed-Routes-Verhalten prüfen; lokal `typecheck` mit generierten `.expo/types`. Keine neuen `as`-Casts.
- **React 19.1 → 19.2:** `@types/react` muss mit (R5). Auf entfernte/deprecatete React-APIs achten (Guide).

- [ ] **Step 1: R1–R2** — Guide SDK 57 lesen, notieren, Arbeitsbaum leer.
- [ ] **Step 2: R3–R4** — `bun add expo@^57` && `bunx expo install --fix`. Kernversionen protokollieren; erwartet u. a. `react-native` ~0.86, `react` ~19.2.
- [ ] **Step 3: R5–R6** — `expo install --check` (v. a. `@types/react` auf ~19.2, `jest-expo` auf SDK-57-Version), `expo-doctor` sauber.
- [ ] **Step 4: R7** — Breaking-Changes abarbeiten; NativeWind-Kompatibilität wie oben; worklets-Plugin letztes; keine neuen Route-Casts.
- [ ] **Step 5: R8** — CLAUDE.md-Tech-Stack auf SDK 57 / RN 0.86 / React 19.2 / expo-router 57.x.
- [ ] **Step 6: R9 (GATES)** — alles Exit 0.
- [ ] **Step 7: R10 (SMOKE)** — iOS + Android, inkl. Theme-Flip besonders gründlich (NativeWind).
- [ ] **Step 8: R11 (Commit)**

```bash
git add -A
git status --short   # KEINE ios/android-Dateien gestaged
git commit -m "chore(deps): Expo SDK 57 (RN 0.86, React 19.2)"
```

---

### Task 5: Non-Expo-Dependencies aktualisieren

Nach stabilem SDK 57 die verbleibenden Libs heben, die **nicht** von `expo install --fix` verwaltet werden. Gruppenweise, jede Gruppe ein eigener Commit + GATES, damit eine brechende Lib isoliert bleibt. Native Builds/SMOKE nur bei Gruppen mit nativer/RN-naher Oberfläche (react-native-calendars, nativewind) nötig; reine JS-Libs (date-fns, rrule, zustand, tanstack, i18next, supabase-js) brauchen nur die statischen GATES + Web-Export.

**Files:**

- Modify: `package.json`, `bun.lock` (jede Gruppe); ggf. Call-Sites bei Breaking-Changes einzelner Libs.

**Interfaces:**

- Consumes: grüner SDK-57-Zustand (Task 4).
- Produces: alle Non-Expo-Deps aktuell; Grundlage für ADR (Task 6).

**Vorgehen je Gruppe (identisch):**

1. Aktuelle vs. neueste Version prüfen: `npm view <pkg> version` und `grep '<pkg>' package.json`.
2. Nur **Minor/Patch** ohne bekannte Breaking-Changes direkt heben; bei **Major** zuerst dessen Changelog per WebFetch lesen.
3. `bun add <pkg>@<version>` (Runtime) bzw. `bun add -d …` (Dev).
4. Statische GATES: `bun run format:check && bun lint && bun run typecheck && bun test && bunx expo export --platform web --output-dir /tmp/eltern-web-check`.
5. Bei RN-naher Gruppe zusätzlich nativer Build + SMOKE.
6. Commit `chore(deps): <gruppe> aktualisieren`.

- [ ] **Step 1: JS-only — Datums-/Regel-Libs**
      `date-fns` (^4.3 → latest 4.x), `rrule` (^2.8 → latest 2.x). `npm view date-fns version; npm view rrule version` → heben → statische GATES → Commit `chore(deps): date-fns + rrule aktualisieren`.

- [ ] **Step 2: JS-only — State/Server**
      `@tanstack/react-query` (^5 → latest 5.x), `zustand` (^5 → latest 5.x). Prüfen, ob innerhalb der Major-5-Linie → direkt heben → statische GATES → Commit `chore(deps): tanstack-query + zustand aktualisieren`.

- [ ] **Step 3: JS-only — i18n**
      `i18next` (^25), `react-i18next` (^16). Changelog kurz prüfen (Major-Grenzen), innerhalb Major heben → statische GATES → Commit `chore(deps): i18next + react-i18next aktualisieren`.

- [ ] **Step 4: JS-only — Supabase**
      `@supabase/supabase-js` (^2.106 → latest 2.x). Innerhalb Major 2 → heben → statische GATES → Commit `chore(deps): supabase-js aktualisieren`.

- [ ] **Step 5: RN-nah — react-native-calendars (höchstes Einzelrisiko)**
      `npm view react-native-calendars version`. Changelog auf RN-0.86-Kompatibilität prüfen. Heben → statische GATES **+ nativer Build + SMOKE (Kalender-Tab besonders)**.
  - Bricht es hart und lässt sich nicht ohne Lib-Wechsel lösen: auf letzter funktionierender Version belassen, **nicht** wechseln (out of scope), und in `docs/TODO.md` einen Follow-up-Bullet anhängen (Datei/Grund).
  - Commit: `chore(deps): react-native-calendars aktualisieren` bzw. bei Deferral `docs(todo): react-native-calendars-Update deferred (RN-0.86-Inkompat)`.

- [ ] **Step 6: RN-nah — NativeWind + Tailwind**
      Nur falls in Task 4 nicht schon auf die kompatible Version gehoben. `nativewind`, `tailwindcss` (3.4.x — **innerhalb v3 bleiben**, kein v4-Sprung; das wäre ein eigenes Projekt), `prettier-plugin-tailwindcss`. Heben → statische GATES **+ nativer Build + SMOKE (Theme-Flip)**. Token-Dateien bleiben off-limits. Commit `chore(deps): nativewind + tailwind-Toolchain aktualisieren`.

---

### Task 6: Abschluss-Doku — ADR + finale Konsistenz

Den Paper-Trail schließen: einen ADR für die Update-Strategie/-Ergebnis anlegen und CLAUDE.md/TODO final prüfen.

**Files:**

- Modify: `docs/decision-log.md` (neuer ADR anhängen), `docs/TODO.md` (Follow-ups), `CLAUDE.md` (Endzustand verifizieren)

**Interfaces:**

- Consumes: alle vorherigen Tasks abgeschlossen.
- Produces: dokumentierter Endzustand; PR-fertig.

- [ ] **Step 1: Nächste ADR-Nummer ermitteln**

Run: `grep -oE 'ADR-[0-9]+' docs/decision-log.md | sort -u | tail -3`
Erwartet: höchste bestehende Nummer (laut CLAUDE.md existiert ADR-006) → neuer ADR = nächste freie Nummer.

- [ ] **Step 2: ADR anhängen** (alte ADRs **nicht** editieren)

Ans Ende von [docs/decision-log.md](docs/decision-log.md) anhängen — Titel „Dependency-Update Expo SDK 54 → 57", Status „Accepted", Datum 2026-07-21. Inhalt (in Prosa, keine Platzhalter): Kontext (3-Major-Rückstand, CNG erleichtert Bumps, New Arch bereits an); Entscheidung (stufenweise 54→55→56→57 in einem Branch, je Stufe grüner Commit, Verifikation iOS+Android+SMOKE, Non-Expo danach gruppiert); Konsequenzen (aktueller Stand RN 0.86/React 19.2; künftige Updates klein halten; NativeWind bleibt v3; ggf. deferred Items aus Task 5). Auf die Spec verlinken: `docs/superpowers/specs/2026-07-21-expo-sdk-57-dependency-update-design.md`.

- [ ] **Step 3: CLAUDE.md-Endzustand verifizieren**

Run: `grep -E 'Expo SDK|React Native 0|React 19|Expo Router' CLAUDE.md`
Erwartet: Tech-Stack nennt SDK 57, RN 0.86, React 19.2, expo-router 57.x (aus R8 der Tasks). Falls eine Zeile noch alt ist → korrigieren.

- [ ] **Step 4: TODO-Follow-ups prüfen**

Sicherstellen, dass etwaige in Task 5 deferrte Items (z. B. react-native-calendars) in [docs/TODO.md](docs/TODO.md) stehen. Der CI-Punkt „Dependabot" (bereits in TODO) bleibt — optional Hinweis ergänzen, dass die Deps jetzt frisch sind.

- [ ] **Step 5: GATES (statisch) final**

Run: `bun run format:check && bun lint && bun run typecheck && bun test`
Erwartet: Exit 0.

- [ ] **Step 6: Commit**

```bash
git add docs/decision-log.md docs/TODO.md CLAUDE.md
git commit -m "docs(deps): ADR + Doku-Abschluss für SDK-54→57-Update"
```

- [ ] **Step 7: PR öffnen**

```bash
git push -u origin chore/dependency-updates
gh pr create --title "chore(deps): Expo SDK 54 → 57 + Dependency-Updates" \
  --body "Stufenweises Update 54→55→56→57 (je Stufe ein grüner Commit, iOS+Android verifiziert) + Non-Expo-Deps. Design: docs/superpowers/specs/2026-07-21-expo-sdk-57-dependency-update-design.md · Plan: docs/superpowers/plans/2026-07-21-expo-sdk-57-dependency-update.md"
```

Vor dem Push optional lokalen CodeRabbit-Pass: `coderabbit review --base main` (CLAUDE.md-Empfehlung), Findings adressieren/bewusst dismissen.

---

## Reihenfolge & Abbruch

Tasks strikt sequenziell (jede Stufe baut auf der vorigen). Da jede Stufe ein grüner Commit ist, kann der PR auch auf SDK 55 oder 56 gemergt werden, falls eine spätere Stufe blockiert — dann die offenen Tasks als TODO/Folge-PR festhalten. Rollback einer Stufe: `git reset --hard <Commit der Vorstufe> && bun install`.
