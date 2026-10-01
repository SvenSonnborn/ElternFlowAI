# Web-Parität, PR A: tote Pfade — Design

**Status:** Approved (Brainstorming)
**Date:** 2026-10-01
**Auftrag:** [docs/roadmap.md](../../roadmap.md) → [Block 3 — Web-Parität](../../roadmap.md#block-3--web-parität), erster von zwei PRs. PR B (Agenda-Klickfläche, springender Datums-Input, Render-Schleife beim Login) bekommt einen eigenen Entwurf.
**Decision-Log:** ein ADR (039) am Branch-Ende.

## 1. Befund

react-native-web implementiert `Alert` als No-op (`static alert() {}`). Jeder Ablauf, der auf eine
Antwort aus `Alert.alert` wartet, endet auf Web stumm. `TODO.md` kennt zwei solcher Stellen, der
Code hat mehr:

| Stelle                                                                                                              | Folge auf Web                                                                           |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `EventDetailScreen.onDeletePress`                                                                                   | Termin löschen tut nichts                                                               |
| `pickScope` (`scopeDialog.ts`), aufgerufen beim Löschen                                                             | Serie löschen tut nichts                                                                |
| `pickScope`, aufgerufen in `EventEditScreen.onSave`                                                                 | Serie speichern: Promise löst nie auf, `submitLock` bleibt gesperrt — Speichern ist tot |
| `SettingsScreen.confirmSignOut`                                                                                     | Abmelden tut nichts                                                                     |
| `ChildProfileScreen.onDelete`                                                                                       | Kind löschen tut nichts                                                                 |
| Erinnerungs-Fehler, „Profil gespeichert", „Passwort gespeichert", `cal.add.requiresAuth`, Toggle-Fehler (`TaskRow`) | Meldung bleibt stumm, der Ablauf läuft weiter                                           |

Dazu ein nativer Befund: RN schneidet `Alert` auf **Android** auf drei Buttons ab
(`buttons.slice(0, 3)` in `Libraries/Alert/Alert.js`). `pickScope` übergibt vier — „Abbrechen"
fehlt dort, Abbruch geht nur per Tipp neben den Dialog.

Die beiden Geburtstagsfelder (`ChildProfileScreen`, `Step4FirstChild`) binden
`@react-native-community/datetimepicker` direkt ein; das Paket rendert auf Web `null`.

## 2. Entscheidungen

1. **Scope-Auswahl als Sheet in der App auf Web und Android.** iOS behält `ActionSheetIOS`.
   `pickScope` behält seine Promise-API; beide Aufrufer bleiben unverändert.
2. **Store + Host im Root-Layout**, dasselbe Muster wie Toast und Konflikt-Dialog — statt eines
   Hooks mit lokalem Element (bräuchte Umbau beider Screens, ohne Render-Pfad nicht testbar) oder
   eines allgemeinen Dialog-Stores (einziger Aufrufer einer Mehrfachauswahl ist `pickScope`).
3. **`Alert.alert` nur noch in `confirmDialog.ts`.** Alle anderen Stellen laufen über
   `confirmDestructive` / `showAlert`; `body` wird bei beiden optional. Eine ESLint-Regel hält das.
4. **Der Toggle-Fehler (Roadmap 2.3) braucht keinen Copy-Key.** Nativ zeigt
   `Alert.alert(message)` die Meldung heute als Titel; `showAlert({ title: message })` zeigt auf
   Web dasselbe. Das ist Parität, kein neues Design.
5. **Geburtstagsfelder über `DateTimePickerSheet`**, das dafür `maximumDate` lernt. Auf iOS werden
   sie damit zum selben Bottom-Sheet wie im Termin-Formular (heute: kompakter Inline-Picker).

## 3. Bausteine

### 3.1 `app-sections/event/scopeSheetStore.ts` (neu)

Zustand-Store **ohne** `react-native`-Import (wie `conflictStore.ts`), damit er unter `bun test`
läuft. `ScopeDialogLabels` zieht hierher um; `scopeDialog.ts` importiert den Typ von hier.

- `requestScope(labels): Promise<EditScope | null>` — legt eine Anfrage `{ id, labels, resolve }`
  an. Ist schon eine offen, wird **die alte mit `null` aufgelöst** und ersetzt (keine
  Warteschlange: Beide Aufrufer sind durch `submitLock` bzw. den vorgeschalteten Confirm
  serialisiert; ein zweiter Request heißt, der erste ist verwaist).
- `settle(id, scope | null)` — löst auf und räumt ab, **nur wenn `id` die aktuelle Anfrage ist**.
  Ein später Tap auf ein bereits ersetztes Sheet bleibt folgenlos.
- `EditScope` wird nur als Typ importiert (`import type`) — der `@/features/calendar`-Barrel ist
  unter Bun zur Laufzeit nicht ladbar.

### 3.2 `ScopeSheet.tsx` + `ScopeSheetHost.tsx` (neu, `app-sections/event/`)

- `ScopeSheet` — `Modal` in der Bauform von `ConflictDialog` (zentrierte Karte, Fade, Scrim
  `DS.components.bottomSheet.scrimColor`, dieselbe `accessible={false}`-Begründung an Scrim und
  Karte). Titel, darunter vier `block`-Buttons ≥ 44 pt: `this`, `forward`, `all`, `cancel`
  (`cancel` in einer zurückhaltenderen Variante). Scrim-Tap und `onRequestClose` (Android-Zurück)
  liefern `null`.
- `ScopeSheetHost` — liest die aktuelle Anfrage aus dem Store, rendert `ScopeSheet` oder nichts.
  Montiert in `app/_layout.tsx` neben `<ConflictDialogHost />`.

### 3.3 `scopeDialog.ts`

`Platform.OS === "ios"` → `ActionSheetIOS` wie bisher; sonst `requestScope(labels)`. Der
`Alert`-Zweig entfällt.

### 3.4 `confirmDialog.ts`

- `ConfirmLabels.body` und `AlertLabels.body` werden optional.
- Web: `window.confirm` / `window.alert` mit `title` allein, wenn kein Body da ist, sonst
  `` `${title}\n\n${body}` `` wie bisher.
- Nativ: `Alert.alert(title, body, …)` — `undefined` als Body ist dort der heutige Zustand.

Umgestellte Aufrufer:

| Aufrufer                                    | Helfer                                                                              |
| ------------------------------------------- | ----------------------------------------------------------------------------------- |
| `EventDetailScreen.onDeletePress`           | `confirmDestructive` (`cal.delete.confirmTitle/Body/Ok`), danach `pickScope`        |
| `EventDetailScreen` Erinnerungs-Fehler      | `showAlert({ title: cal.detail.reminderError, body: err.message })`                 |
| `SettingsScreen.confirmSignOut` + `onError` | `confirmDestructive` ohne Body · `showAlert({ title: t(mapAuthError(err)) })`       |
| `ChildProfileScreen.onDelete` + gespeichert | `confirmDestructive` (`child.deleteConfirm*`) · `showAlert({ title: child.saved })` |
| `NewPasswordScreen`                         | `showAlert({ title: auth.newPassword.saved })`                                      |
| `KalenderScreen.openAdd`                    | `showAlert({ title: cal.add.requiresAuth })`                                        |
| `TaskRow.handleToggle`                      | `showAlert({ title: t(mapTaskError(err)) })`                                        |

Reihenfolge bleibt jeweils erhalten (z. B. `showAlert` vor `router.back()`). Auf Web blockiert
`window.alert` bis zur Bestätigung, nativ nicht — in beiden Fällen läuft die Navigation danach.

### 3.5 ESLint

`no-restricted-properties` für `Alert.alert` in `**/*.{ts,tsx}`, ausgenommen
`app-sections/shared/confirmDialog.ts`; die Meldung nennt die beiden Helfer und den Grund
(No-op auf Web).

### 3.6 Geburtstagsfelder

- `DateTimePickerSheetProps.maximumDate?: Date`. Nativ an beide `DateTimePicker`-Zweige
  durchgereicht; Web setzt `max` (nur im Datums-Modus).
- Die Parse-Logik des Web-`onChange` zieht in eine reine Funktion
  `app-sections/shared/webPickerValue.ts` → `parseWebPickerValue(raw, mode, base, maximumDate?)`
  und wird damit testbar (die `.web.tsx` lädt über `useTheme` nativewind und ist unter Bun nicht
  ladbar). Verhalten unverändert plus: Liegt der Kalendertag nach dem von `maximumDate`, ist das
  Ergebnis `null` (verworfen) — `max` begrenzt nur den Picker, nicht das Tippen. Vergleich auf
  **Kalendertag**, nicht Zeitpunkt: `maximumDate = new Date()` trägt die aktuelle Uhrzeit.
- `ChildProfileScreen` und `Step4FirstChild`: `<DateTimePickerSheet mode={pickerOpen ? "date" :
null} value={birthday ?? new Date(2018, 0, 1)} maximumDate={new Date()} accessibilityLabel={Feldlabel}
onPick={setBirthday} onClose={() => setPickerOpen(false)} />`. Der direkte Import des Pakets
  entfällt in beiden Dateien.

### 3.7 Test-Preload

`bun.test.preload.ts` bekommt Stubs für `Alert` (`alert() {}`) und `ActionSheetIOS`
(`showActionSheetWithOptions() {}`) — ohne sie sind `confirmDialog.ts` und `scopeDialog.ts`
unter Bun nicht ladbar (ein im Mock fehlender Named Export ist ein Ladefehler).

## 4. Tests

Rot vor Grün für alles, was ohne Render-Pfad testbar ist:

- **`scopeSheetStore.test.ts`** — Anfrage wird aktuell · `settle` mit Scope löst auf und räumt
  ab · `settle(null)` liefert `null` · zweite Anfrage löst die erste mit `null` auf und wird
  aktuell · `settle` mit veralteter `id` ist folgenlos.
- **`scopeDialog.test.ts`** — Web und Android landen im Store (Auswahl kommt als Ergebnis
  zurück) · iOS ruft `ActionSheetIOS` und mappt die Indizes inkl. Abbruch. `Platform.OS` wird
  pro Test gesetzt und zurückgestellt.
- **`confirmDialog.test.ts`** — Web: `window.confirm`/`window.alert` mit und ohne Body, Rückgabe
  von `confirm` durchgereicht · nativ: `Alert.alert` bekommt Titel/Body, Bestätigen → `true`,
  Abbrechen und `onDismiss` → `false`.
- **`webPickerValue.test.ts`** — Datums-Modus behält die Uhrzeit · Zeit-Modus behält das Datum ·
  ungültige Eingabe → `null` · Tag nach `maximumDate` → `null` · derselbe Tag wie
  `maximumDate`, aber spätere Uhrzeit im Basiswert → gültig.

Ohne automatisierten Test (fehlender RN-Render-Pfad, [Roadmap Block 5](../../roadmap.md#block-5--der-rn-component-test-pfad-schlussstein)):
die Screen-Verdrahtung, `ScopeSheet` und `ScopeSheetHost`. Belegt durch:

- **Web-Sichtprüfung per Playwright** (`bun run web`, angemeldete Sitzung): Einzeltermin löschen ·
  Serie löschen mit jedem Scope und Abbruch · Serie speichern mit Scope und Abbruch, danach erneut
  speichern (Sperre frei) · Kind anlegen, Geburtstag wählen, löschen · Geburtstag im Onboarding
  Schritt 4, falls erreichbar · Abmelden zuletzt (beendet die Sitzung). Nur selbst angelegte
  Wegwerf-Daten löschen. Light und dark für das Sheet.
- **Simulator iOS + Emulator Android:** Scope-Sheet (Android) bzw. ActionSheet (iOS) beim Löschen
  und Speichern einer Serie, Geburtstags-Sheet in beiden Feldern.

## 5. Doku am Branch-Ende

- ADR-039: Scope-Auswahl auf Web und Android als Sheet in der App, `Alert.alert` nur über die
  Helfer (mit Lint-Regel), Toggle-Fehler ohne Copy-Key.
- `TODO.md`: löschen „Termin-Löschpfad auf Web", „Geburtstags-Picker rendert auf Web nicht",
  „Toggle-Fehler ist auf Web unsichtbar", „`showAlert` hat keinen Aufrufer mehr". Der 🎨-Eintrag
  „Logout-Confirm hat keinen Body-Text" bleibt.
- `roadmap.md`: Block 3 und 2.3 auf Stand. `CLAUDE.md`: `ScopeSheetHost` im Root-Layout erwähnen.
