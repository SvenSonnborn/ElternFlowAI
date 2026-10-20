# RN-Component-Test-Pfad (Block 5) — Design

**Status:** Approved (Brainstorming)
**Date:** 2026-10-20
**Auftrag:** [docs/roadmap.md](../../roadmap.md) → [Block 5 — Der RN-Component-Test-Pfad](../../roadmap.md#block-5--der-rn-component-test-pfad-schlussstein). Voraussetzung: PR #129 (Expo-Pakete inklusive `jest-expo` auf SDK-57-Stand) ist gemergt.
**Decision-Log:** ein ADR (042) am Branch-Ende.

## 1. Worum es geht

Im Repo lässt sich keine React-Native-Komponente im Test rendern. Am teuersten ist das bei der
Hydrations-Invariante ([ADR-031](../../decision-log.md) Decision 6): `EventEditScreen` und
`TaskEditScreen` frieren beim Hydrieren die Version ein, aus der das Formular entstand
(`baseVersion`). Speichern und Löschen schicken diese Version ans Compare-and-Swap. Läse ein Screen
sie stattdessen aus der lebenden Query, träfe das CAS nach einem Fremd-Refetch anstandslos und
überschriebe die fremde Änderung lautlos, ohne Konflikt-Dialog. Heute schützt das nur ein Kommentar.

Dieser Block baut den Render-Pfad und sichert mit ihm als Erstes genau diese Invariante ab.

## 2. Befund aus dem Wegwerf-Versuch

- **`jest` mit dem Preset `jest-expo` trägt.** Echte RN-Komponenten rendern, nativewind-Klassen
  eingeschlossen. `features/calendar/hooks.ts` lädt, sobald AsyncStorage durch seinen
  mitgelieferten Jest-Mock ersetzt ist und die zwei Supabase-Umgebungsvariablen gesetzt sind.
  `EventEditScreen` rendert mit vorbefülltem Query-Cache. Eine danach in den Cache gelegte fremde
  Fassung ändert das Formular nicht.
- **Zwei Störungen im Versuch:** eine `act()`-Warnung, ausgelöst von React Querys
  Benachrichtigungs-Scheduler, und ein offener Timer, der den Jest-Worker nicht sauber beenden lässt.
- **`bun test` scheitert an der ersten Zeile von `react-native`.** Bun liest die Flow-Syntax in
  `react-native/index.js` nicht (`import typeof`). Das zu umgehen hieße, das Expo-Preset —
  Flow-Entfernung plus Mocks der nativen Module — in Bun nachzubauen.
- **Die vorhandene `jest.config.js` taugt so nicht:** Sie trägt die unbekannte Option
  `setupFilesAfterEach` (Tippfehler), und ihr `testMatch` würde alle `bun:test`-Suiten mit einsammeln.

## 3. Ziele, Nicht-Ziele, Anti-Ziele

**Ziele**

1. Komponenten-Tests laufen unter `jest` mit `jest-expo`; alle übrigen Tests bleiben unter
   `bun test`.
2. Regressionstests für die Hydrations-Invariante: `EventEditScreen` beim Speichern,
   `TaskEditScreen` beim Speichern und beim Löschen.
3. Lokal per `bun run test:rn`, in CI als eigener Schritt im bestehenden Job.
4. Die Wahl des Runners steht als ADR-042 im Decision-Log.

**Nicht-Ziele**

- Tests für `useFamilyRealtime` und weitere Screens. Der Pfad macht sie möglich, sie sind eigene
  Schritte.
- `features/calendar/hooks.ts` unter `bun test` ladbar machen.
- Bestehende `bun:test`-Suiten umziehen.
- Snapshot-Tests.

**Anti-Ziele** — daran wäre der Block gescheitert, auch wenn alles grün ist:

- Ein Invarianten-Test, der auch dann grün bleibt, wenn der Screen die Version aus der lebenden
  Query liest. Jeder dieser Tests muss gegen einen absichtlich so verdorbenen Screen rot werden.
- Ein Test, der auf echte Zeit wartet, das Netz anfasst oder von der Laufreihenfolge abhängt.
- Rauschen in der Testausgabe: keine `act()`-Warnungen, kein Hinweis auf offene Handles.
- Produktionscode, der nur für den Test umgebaut wird. Erwartet wird keine Änderung an den
  Screens; wird eine Naht doch unvermeidlich, steht sie im Bericht und im ADR.

## 4. Entwurf

### 4.1 Zwei Runner, getrennt über den Dateinamen

- Komponenten-Tests heißen `<Name>.jest.tsx` und liegen neben dem Screen, den sie prüfen.
- `jest` sammelt nur diese Dateien ein (`testMatch` auf `**/*.jest.tsx`).
- `bun test` findet sie nicht: Seine Erkennung verlangt `.test.` oder `.spec.` im Dateinamen.
- `__tests__/smoke.test.tsx` bleibt bei `bun test` — es rendert nichts.

### 4.2 Jest-Konfiguration und Setup

- `jest.config.js`: Tippfehler raus, `testMatch` wie oben, Setup-Datei(en) eingetragen.
- Das Setup liegt unter `testing/` im Repo-Wurzelverzeichnis und erledigt für jede Suite:
  - AsyncStorage durch den mitgelieferten Jest-Mock ersetzen.
  - Die zwei `EXPO_PUBLIC_SUPABASE_*`-Variablen mit Platzhaltern setzen, wie `bun.test.preload.ts`.
  - `@/features/supabase` durch einen Stub ersetzen, der bei jeder Benutzung laut scheitert:
    Komponenten-Tests haben kein Netz, und der echte Client startet Timer.
  - React Query so einstellen, dass seine Benachrichtigungen keine `act()`-Warnung auslösen.
- `package.json`: Skript `test:rn` startet `jest`.
- ESLint: Die bestehende Test-Ausnahme (Literal-Strings, `no-unsafe-*`) gilt auch für `*.jest.tsx`
  und `testing/**`.

### 4.3 Render-Hilfe

`testing/renderScreen.tsx` rendert einen Screen in den Providern, die der App-Root ihm sonst gibt:
`SafeAreaProvider` (mit festen Maßen), `QueryClientProvider`, `ThemeProvider`. i18n ist initialisiert,
Sprache Deutsch.

- Jeder Test bekommt einen eigenen `QueryClient` ohne Retry, mit unendlicher `staleTime` und
  `gcTime`.
- Daten kommen über `setQueryData` auf den echten Query-Key in den Cache, nicht über das Netz.
- Die Hilfe gibt den `QueryClient` zurück, damit der Test einen Fremd-Refetch nachstellen kann.

### 4.4 Wo der Test die Version abliest

Am Schreibpfad der Screens, an den Mutations-Hooks:

| Screen            | Hook                                                    | Feld          |
| ----------------- | ------------------------------------------------------- | ------------- |
| `EventEditScreen` | `useUpdateEvent` aus `@/features/calendar`              | `baseVersion` |
| `TaskEditScreen`  | `useUpdateTask`, `useDeleteTask` aus `@/features/tasks` | `baseVersion` |

- Die Hooks werden per `jest.mock` mit `requireActual` ersetzt. Alle anderen Exporte der Module
  bleiben echt, insbesondere `occurrenceVersion`, `expandEvents` und die Formularlogik.
- Der Ersatz zeichnet auf, womit `mutateAsync` aufgerufen wird.
- Die Navigation (`expo-router`) wird je Testdatei gemockt: `useLocalSearchParams` liefert die ID,
  `router` und `Stack.Screen` sind Attrappen.

### 4.5 Die Testfälle

Gemeinsamer Aufbau:

1. Fassung **A** liegt im Cache.
2. Der Screen rendert und hydriert aus A.
3. Fassung **B** desselben Datensatzes — anderer Titel, späteres `updated_at` — wird in den Cache
   gelegt, so wie ein Refetch es täte.
4. Erst dann löst der Test die Aktion aus.

| Screen                                                                | Aktion      | Erwartung                                                        |
| --------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------- |
| `EventEditScreen`, Einzeltermin ohne Wiederholung (kein Scope-Dialog) | „Speichern" | `baseVersion` ist die Occurrence-Version von A, nicht die von B. |
| `TaskEditScreen`                                                      | „Speichern" | `baseVersion` ist `updated_at` von A.                            |
| `TaskEditScreen`                                                      | „Löschen"   | `baseVersion` ist `updated_at` von A.                            |

Zum Löschen: Bestätigungsdialog und Undo-Fenster müssen deterministisch durchlaufen werden, ohne
echtes Warten — ob über Fake-Timer oder gezielte Mocks, entscheidet der Bauende.

Je Fall ein Kontrolltest ohne Fremd-Refetch: `baseVersion` ist A. Er belegt, dass der Aufbau
überhaupt bis zur Mutation durchkommt.

**Rot-Probe:** Bei der Umsetzung wird jeder Screen kurz so verdorben, dass er die Version aus der
lebenden Query liest. Die drei Hauptfälle müssen dabei rot werden. Die Probe landet nicht im Code,
ihr Ergebnis steht im PR.

### 4.6 CI

`ci.yml` bekommt nach „Test" einen Schritt „Component tests (jest)" mit `bun run test:rn` und
derselben `if:`-Bedingung wie die übrigen Schritte. Er liegt im bestehenden Job, die Namen der
Required Checks ändern sich nicht. Der veraltete Kommentar am Schritt „Test" („jest-expo 55
kaputt") wird berichtigt.

### 4.7 Doku am Branch-Ende

- **ADR-042:** Komponenten-Tests unter `jest`, Rest unter `bun`. Verworfen: Bun mit nachgebautem
  Preset; ein DOM-Pfad über react-native-web, der weder iOS noch Android rendert und die
  `.web.tsx`-Dateien anders auflöst als die Apps.
- **CLAUDE.md:** Befehle, der Absatz zu `bun test` und `jest`, der CI-Abschnitt.
- **`docs/TODO.md`:**
  - Entfernen: „keinen einzigen RN-Component-Test" und „keinen Regressionstest für die
    Hydrations-Invariante".
  - Berichtigen: „`hooks.ts` ist unter `bun test` nicht ladbar" — unter `jest` jetzt schon. Und
    „`useFamilyRealtime` ist ungetestet" — der Render-Pfad existiert, der Test fehlt noch.
- **Roadmap:** Block 5 erledigt.

## 5. Randbedingungen

- Gegen die API von `@testing-library/react-native` v14 schreiben: `render()`, `fireEvent()` und
  `renderHook()` liefern Promises, `act()` wird immer awaited.
- Das Handoff-Bundle bleibt unberührt, keine neuen i18n-Keys.
- Gates wie immer plus `bun run test:rn`: alles grün, Testausgabe ohne Warnungen.
- `jest-expo` folgt der Expo-Vorgabe (`expo install --check` bleibt sauber).

## 6. Dem Bauenden überlassen

- Form der Mocks und der Render-Hilfe im Detail.
- Fake-Timer oder Mocks für Bestätigung und Undo-Fenster beim Löschen.
- Wie die `act()`-Warnung von React Query konkret verschwindet, solange sie verschwindet.
- Aufteilung von `testing/` auf eine oder mehrere Setup-Dateien.
