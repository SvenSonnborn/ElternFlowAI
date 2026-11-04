# a11y nativ — Design

**Status:** Entwurf (Brainstorming), Freigabe offen
**Date:** 2026-11-04
**Branch:** `fix/a11y-nativ`, Punkte 1 und 2 der „nächsten Branches" in [roadmap.md](../../roadmap.md#die-nächsten-branches-stand-2026-11-03) (4.1 `inlineRem` und a11y nativ)
**Decision-Log:** ein ADR (054) am Branch-Ende

## 1. Worum es geht

Sechs Einträge aus [TODO.md](../../TODO.md) („Weitere Out-of-Scope-Items"), die die Roadmap auf zwei Branches verteilt hatte und die jetzt einer werden:

1. **NativeWind rechnet `rem` nativ mit 14**, das Web mit 16. Jedes rem-Maß ist auf iOS und Android ein Achtel kleiner als im Design; `h-11` sind dort 38,5 pt, damit liegen `Button` in Größe md und die Zeilen-Aktionen in `TaskRow`, `PendingInviteCard` und `PrepRow` unter 44.
2. **Inter wird nirgends geladen.** [typography.ts](../../../design-system/typography.ts) nennt Inter als Schrift; nativ zeigt die App SF bzw. Roboto, auf Web rendern die drei Stellen mit `fontFamily: "Inter"` (Eingabefelder) in der Serifenschrift des Browsers.
3. **Tippflächen hängen an `hitSlop`** oder sind schlicht kleiner als 44 (Zahnrad und „+" der Kopfzeile, „Zurück", „Abbrechen"/„Fertig" in Sheets, Farbfelder, Tag-Felder, Allergie-Chips). `hitSlop` wirkt auf Web nicht und wird nativ am Elternteil beschnitten ([ADR-041](../../decision-log.md)).
4. **`accessibilityState` kommt auf Web nicht im DOM an** — Pillen, Chips und Farbfelder melden Web-Screenreadern keinen Auswahlzustand.
5. **Eingabefelder sind für Screenreader nicht beschriftet** — das Label in [Field.tsx](../../../app-sections/shared/Field.tsx) ist ein Geschwister-`Text`.
6. **Die Deckfläche von `AuthGate` sperrt native Screenreader nicht aus** — auf Web ist der Screen darunter `inert`, nativ nicht.

Sven hat am 2026-11-03 Vorher/Nachher-Screenshots mit `inlineRem: 16` im iPhone-17-Pro-Simulator verglichen und sich für 16 entschieden („rechts wirkt angenehmer"; zu klein wirkte vorher nichts). Im selben Gespräch: Inter einbauen, alles in einem Branch.

## 2. Ziele, Nicht-Ziele, Anti-Ziele

**Ziele**

1. Nativ gilt `1rem = 16` wie im Web; ein Maß sieht auf allen drei Plattformen gleich aus.
2. Jede Tippfläche ist auf iOS, Android und Web mindestens 44 × 44, über die Box und nicht über `hitSlop`.
3. Jeder Text der App steht in Inter, in den Gewichten aus `typography.ts` (400 bis 800), auf allen drei Plattformen — auch in Eingabefeldern und den Labels der Tab-Leiste.
4. Der Auswahlzustand von Radios, Checkboxen, Chips und Farbfeldern kommt bei Web-Screenreadern an; nativ bleibt die Ansage, wie sie ist.
5. Jedes Eingabefeld wird mit seinem sichtbaren Label angesagt, genau einmal.
6. Solange die Gate-Deckfläche liegt, erreicht kein Screenreader den Screen darunter, auch nativ nicht.

**Nicht-Ziele**

- **Block 9** (`expo-doctor` im `bundle`-Job, Bun-Cache in `ci.yml`): der nächste Branch.
- **JetBrainsMono** (`fontFamily.mono`) und **Inter kursiv**: Die App benutzt beides nirgends.
- **Schriftgrößen.** Sie sind px-Tokens und bleiben; `inlineRem` verändert nur rem-Maße. Dynamic Type und Schriftskalierung sind kein Thema dieses Branches.
- **Ein vollständiges WCAG-Audit** (Kontraste, Fokusreihenfolge, Bewegung): nur die sechs Punkte oben.
- **Tailwind v4**, `@expo/vector-icons`-Migration, App-Name in `app.json`: eigene TODO-Einträge.

**Anti-Ziele** — das wäre ein Fehlschlag, auch wenn es technisch läuft:

1. Eine Änderung an Handoff-Dateien (`design-system/typography.ts` u. a.). Inter kommt über `Text` und die Umgehungsstellen in die App, nicht über die Token-Datei.
2. Ein sichtbarer Schriftwechsel beim Laden im Web, oder ein leerer Bildschirm, der hängen bleibt, wenn die Schrift nicht lädt.
3. Ein Root-`<Stack>`, der nach dem ersten Mount bedingt ersetzt oder neu gemountet wird — weder durch das Laden der Schrift noch durch den neuen Container in `AuthGate` ([ADR-040](../../decision-log.md)).
4. Eine Tippfläche, die wieder über `hitSlop` wächst, oder eine Box, deren 44 aus einer rem-Klasse statt aus `touchTarget.min` kommt.
5. Eine sichtbare Größe, die sich ändert: Das Zahnrad bleibt 36, die Farbfelder bleiben 28. „Keep the drawn size, grow the touchable box" ([patterns/toast.md](../../../patterns/toast.md)). Benachbarte Boxen überlappen nicht.
6. Schriftdateien im Repo. Sie kommen aus dem npm-Paket.

## 3. Entwurf

Commit-Reihenfolge: `inlineRem` → Inter → a11y-Punkte → gemeinsamer Sichtlauf → Doku. Der Sichtlauf kommt einmal am Ende, weil jeder der drei ersten Schritte alle Screens verändert.

### 3.1 `inlineRem: 16`

- [metro.config.js](../../../metro.config.js): `withNativeWind(config, { input: "./global.css", inlineRem: 16 })`. Wirkt nur nativ; das Web rechnet schon mit 16.
- Jede rem-Klasse wächst nativ um ein Siebtel (rund 500 Verwendungen). Radien (px in `tailwind.config.js`) und Schriftgrößen (px-Tokens über `Text`) bleiben.
- Die Kommentare, die eine Zahl mit „rem 14 / 38,5 pt" begründen ([MemberPicker.tsx](../../../app-sections/shared/MemberPicker.tsx), [FilterChipRow.tsx](../../../app-sections/shared/FilterChipRow.tsx), [TypePicker.tsx](../../../app-sections/shared/TypePicker.tsx), [ChildProfileScreen.tsx](../../../app-sections/child-profile/ChildProfileScreen.tsx)), werden im selben Commit umgeschrieben. **Die Regel „Maß als Zahl" bleibt** (meine Entscheidung): `touchTarget.min` ist die eine Quelle für 44, und eine rem-Klasse hängt an einer Metro-Einstellung, die niemand neben dem Pressable sieht. Nur die 38,5-pt-Begründung fällt.

### 3.2 Inter

**Quelle:** `@expo-google-fonts/inter` (MIT AND OFL-1.1), fünf statische Schnitte: `400Regular/Inter_400Regular.ttf`, `500Medium/…`, `600SemiBold/…`, `700Bold/…`, `800ExtraBold/Inter_800ExtraBold.ttf`. Alle fünf Dateien tragen intern die Familie „Inter" (mit `fc-scan` geprüft); PostScript-Namen `Inter-Regular` … `Inter-ExtraBold`.

**Nativ — eingebettet zur Build-Zeit** über den Config-Plugin von `expo-font` (steht schon ohne Optionen in `app.json`):

- `android.fonts`: ein Objekt `{ fontFamily: "Inter", fontDefinitions: [{ path, weight: 400 }, … { path, weight: 800 }] }`. Android baut daraus eine XML-Font-Familie, `fontWeight` wählt den Schnitt.
- `ios.fonts`: die fünf Pfade. iOS nimmt den Familiennamen aus der Datei, React Native wählt den Schnitt über `fontWeight`.
- Pfade relativ zum Projekt nach `node_modules/@expo-google-fonts/inter/…`.
- Kein Laden zur Laufzeit auf iOS und Android. Die Schrift wirkt erst nach Prebuild und neuem nativen Build.
- **Risiko:** ob iOS die Gewichte über die Familie „Inter" auflöst, zeigt erst der Build. Prüfen: 400, 600, 700 und 800 sind im Simulator sichtbar verschieden. Wenn nicht, ist der Rückfall eine Zuordnung Gewicht → PostScript-Name in `Text` — nur dann, und der ADR sagt warum.

**Web — geladen zur Laufzeit** mit `useFonts` in der Array-Form von SDK 58: `[{ fontFamily: "Inter", fontDefinitions: [{ path: require(…), weight: 400 }, …] }]`, alle Schnitte in einem Aufruf, nur auf Web. Der Web-Export läuft mit `web.output: "static"`; ob `expo-font` die `@font-face`-Regeln damit schon ins HTML schreibt, prüft der Builder. Anforderung in jedem Fall (Anti-Ziel 2 und 3): kein sichtbarer Schriftwechsel; falls die App dafür warten muss, dann vor dem ersten Mount des Root-`<Stack>`, nie danach; schlägt das Laden fehl, rendert die App mit der Ausweichschrift weiter.

**Wo Inter gesetzt wird:**

- [Text.tsx](../../../design-system/ui/Text.tsx): `fontFamily: fontFamily.sans` (aus `@/design-system`) als erster Eintrag im Style-Array, damit das Preset (`hero` setzt `fontFamily.display`) und der Aufrufer überschreiben können. Kein anderes Modul importiert `Text` aus `react-native`.
- Stellen, die an `Text` vorbei rendern: das `TextInput` in [Field.tsx](../../../app-sections/shared/Field.tsx), das Tag-`TextInput` in [ChildProfileScreen.tsx](../../../app-sections/child-profile/ChildProfileScreen.tsx), das `<input>` in [DateTimePickerSheet.web.tsx](../../../app-sections/shared/DateTimePickerSheet.web.tsx) und `tabBarLabelStyle` in [app/(tabs)/\_layout.tsx](<../../../app/(tabs)/_layout.tsx>). Die drei Literale `"Inter"` werden zu `fontFamily.sans`.
- Systemoberflächen (nativer Datumswähler, `confirmDialog`-Dialoge) bleiben in der Systemschrift.
- `tailwind.config.js` (`fontFamily.sans: ["Inter", "System"]`) bleibt; keine `font-*`-Klasse ist in Gebrauch.

Folge: Jeder Text der App wechselt von SF/Roboto zu Inter. Inter läuft breiter als SF; Zeilen können umbrechen oder abgeschnitten werden — das prüft der Sichtlauf.

### 3.3 Tippflächen

**Form:** ein `Pressable` mit `touchTarget.min` als `minWidth`/`minHeight` (oder fester Breite und Höhe) im `style`, die Optik in einer inneren `View` mit der gezeichneten Größe — Vorbild [FilterChipRow.tsx](../../../app-sections/shared/FilterChipRow.tsx). Jedes `hitSlop` fällt weg.

**Lage:** Die sichtbare Größe bleibt (Anti-Ziel 5). Die sichtbare Lage darf sich um die halbe Differenz verschieben (4 pt bei einem 36er-Element), wo ein Ausgleich über negative Ränder mehr Code kostet, als er bringt; an Bildschirmkanten und in Kopfzeilen bleibt die Kante bündig (meine Entscheidung). Den Ausschlag gibt der Sichtlauf.

**Inventar durch Messen, nicht durch Grep.** Nach §3.1 sind Web und nativ gleich groß; deshalb misst ein Wegwerf-Skript (nicht eingecheckt, meine Entscheidung) per Playwright gegen den Prod-Export auf lokaler Supabase jedes Element mit interaktiver Rolle (`button`, `link`, `checkbox`, `radio`, `switch`, `tab`) und meldet alles unter 44 in einer Richtung — über alle Tabs, Sheets, Auth- und Onboarding-Screens. Nativ genügen Stichproben mit `axe describe-ui`. Der Ausgangsbestand aus dem Grep:

| Stelle                                                                                   | heute                                  |
| ---------------------------------------------------------------------------------------- | -------------------------------------- |
| `TopBar`: „+" und Zahnrad                                                                | `h-9 w-9`, kein `hitSlop`              |
| Zurück-Knöpfe als `leading` (Eltern-Profil, Kinderprofil), `OnboardingShell` Zurück/Skip | `h-9 w-9` + `hitSlop`                  |
| Sheet-Köpfe: „Abbrechen"/„Fertig" in Event-, Task- und Settings-Sheets, EventDetail      | Text-Knopf + `hitSlop`                 |
| Auth: „Passwort vergessen?", Registrieren-Zeile, CheckEmail, Register, ResetPassword     | Text-Link + `hitSlop`                  |
| EventDetail: Zeile „Erneut versuchen"                                                    | `hitSlop={8}`                          |
| `CalendarDay`: Tageszelle                                                                | 44 × 52 + `hitSlop={6}`                |
| Onboarding Schritt 4: Farbfelder                                                         | 28 px, `gap` 8, `hitSlop={8}`          |
| Onboarding Schritt 2                                                                     | `hitSlop`                              |
| Kinderprofil: Plus der Tag-Felder                                                        | `hitSlop={13}`                         |
| Kinderprofil: Allergie-Chips                                                             | unter 44, **ohne** `accessibilityRole` |
| `EventRow`                                                                               | `h-9 w-9`                              |

Die Allergie-Chips bekommen ihre Rolle nach Semantik: Mehrfachauswahl → `checkbox` mit `aria-checked`.

**Gegen Rückfall:** eine ESLint-Regel (`no-restricted-syntax`) verbietet das JSX-Attribut `hitSlop`, wie die Regel gegen `Alert.alert` ([ADR-039](../../decision-log.md)) (meine Entscheidung).

### 3.4 Auswahlzustand für Web-Screenreader

In `node_modules` nachgesehen: react-native-web 0.21 liest `aria-checked`, `aria-selected`, `aria-disabled` (und die Einzel-Props `accessibilityChecked` usw.), aber **nicht** `accessibilityState`. React Native 0.88 führt in `View` und `Pressable` `aria-checked`, `aria-selected`, `aria-disabled`, `aria-busy` und `aria-expanded` in den nativen `accessibilityState` zusammen.

Deshalb **ersetzt** `aria-*` das `accessibilityState` an allen 22 Stellen in 19 Dateien, statt daneben zu stehen (meine Entscheidung; der TODO-Eintrag sagte „neben"): eine Prop wirkt auf beiden Plattformen, zwei Props für denselben Zustand laufen auseinander. `checked` → `aria-checked`, `selected` → `aria-selected`, `disabled` → `aria-disabled` oder die `disabled`-Prop des `Pressable`.

- Steht `selected` an einer Rolle, für die ARIA keinen Auswahlzustand kennt (`button`), passt der Builder die Rolle an die Semantik an — Einfachauswahl → `radio` in einer `radiogroup`, Mehrfachauswahl → `checkbox` — statt den Zustand nur umzuhängen.
- Eigene Komponenten, die `accessibilityState` durchreichen, reichen danach `aria-*` durch.
- Dieselbe ESLint-Regel wie in §3.3 verbietet `accessibilityState` (meine Entscheidung).

### 3.5 Feldbeschriftung

- [Field.tsx](../../../app-sections/shared/Field.tsx): Das `TextInput` bekommt `accessibilityLabel={label}`; react-native-web macht daraus `aria-label`.
- Das sichtbare Label bekommt `aria-hidden`, damit es nicht ein zweites Mal angesagt wird (Ziel 5; meine Entscheidung). React Native übersetzt `aria-hidden` nativ in `accessibilityElementsHidden` und `importantForAccessibility="no-hide-descendants"`.
- Das Tag-`TextInput` im Kinderprofil bekommt sein Label genauso. Weitere `TextInput` gibt es nicht.

### 3.6 Deckfläche von `AuthGate` nativ

- `GateFrame` in [AuthGate.tsx](../../../features/auth/AuthGate.tsx) gibt heute nativ die Kinder ohne Container zurück. Neu: **derselbe** dauerhafte Container (`View`, `flex: 1`) auf allen Plattformen. Er wird nie abhängig von `covered` ausgetauscht, nur seine Props wechseln (Anti-Ziel 3).
- Nativ: `aria-hidden={covered}` (siehe §3.5: wird zu `accessibilityElementsHidden` auf iOS und `importantForAccessibility="no-hide-descendants"` auf Android).
- Web: bleibt `inert` ([ADR-041](../../decision-log.md)). Kein `aria-hidden` zusätzlich — `inert` nimmt den Teilbaum schon aus dem Accessibility-Baum, und `aria-hidden` über einem fokussierten Element löst Browserwarnungen aus.
- Der zusätzliche `View` ändert nativ das Layout um eine Ebene; der Sichtlauf prüft Login-Übergang, Tabs und Sheets.

### 3.7 Kopfzeilen-Labels

[TopBar.tsx](../../../app-sections/shared/TopBar.tsx) wird für §3.3 ohnehin angefasst und hat zwei hart verdrahtete englische Labels (meine Entscheidung, sie mitzunehmen):

- Zahnrad: `accessibilityLabel="Settings"` → `t("set.title")` („Einstellungen").
- „+": Der Rückfall `addLabel ?? "Add"` fällt weg. Der einzige Aufrufer mit `onAdd` ([KalenderScreen.tsx](<../../../app-sections/(tabs)/kalender/KalenderScreen.tsx>)) übergibt `addLabel` schon.

## 4. Prüfen

- **Gates:** `format:check`, `lint`, `typecheck`, `test`, `test:rn`. `test:db` ist nicht betroffen, läuft in CI aber mit.
- **`bun run test:rn`:** `Text` setzt `fontFamily.sans`, ein Preset oder Aufrufer überschreibt es; `GateFrame` behält über einen `covered`-Wechsel dieselbe Instanz und setzt nativ `aria-hidden`; ein `Field` ist über `getByLabelText` auffindbar, sein Label nicht doppelt im Accessibility-Baum.
- **`native-build.yml`** beweist, dass die Plugin-Konfiguration kompiliert (frischer Prebuild in CI, ~30 min).
- **Lokaler nativer Build:** `bunx expo prebuild --clean`, dann iOS-Simulator und Android-Emulator. Der Debug-Build spricht mit live → nichts speichern, nichts absenden.
- **Sichtlauf nativ**, iOS und Android, hell und dunkel: alle fünf Tabs, die Sheets, Kinder- und Eltern-Profil, Einstellungen. Inter in allen Gewichten sichtbar verschieden (iOS-Risiko aus §3.2); kein abgeschnittener Text, keine überlappenden Boxen; Kopfzeilen-Kanten bündig. Auth und Onboarding nativ nur, wenn Sven sich dafür abmeldet; sonst über Web.
- **Vorher/Nachher für Sven:** Screenshots der Hauptscreens nebeneinander, wie beim `inlineRem`-Vergleich, bevor der PR aufgeht (meine Entscheidung) — der Schriftwechsel betrifft jeden Screen.
- **Web per Playwright** gegen `Web (lokal)`: das Inventar aus §3.3 meldet nichts unter 44; berechnete `font-family` ist Inter an Text und Eingabefeldern; `aria-checked` steht an Radios und Checkboxen; Eingabefelder haben einen zugänglichen Namen; die Seite zeigt nie eine andere Schrift als Inter.
- **Accessibility-Baum nativ:** VoiceOver gibt es im Simulator nicht. iOS über `axe describe-ui` (Labels, Zustand der Chips, Feldbeschriftung), Android über `adb shell uiautomator dump` (`content-desc`, `checked`).

## 5. Doku am Branch-Ende

- [TODO.md](../../TODO.md): die sechs Einträge löschen („Eingabefelder rendern auf Web in einer Serifenschrift", „Eingabefelder sind für Screenreader nicht beschriftet", „Die Deckfläche von `AuthGate` …", „NativeWind rechnet `rem` nativ mit 14", „Weitere Tippflächen hängen an `hitSlop` …", „`accessibilityState` kommt auf Web nicht im DOM an").
- [roadmap.md](../../roadmap.md): 4.1 entschieden (16), Punkte 1 und 2 der nächsten Branches erledigt.
- ADR-054: `inlineRem: 16` und Svens Vergleich; Inter eingebettet bzw. im Web geladen; `aria-*` statt `accessibilityState`; die beiden Lint-Regeln; Gate-Container nativ. Ersetzt die 38,5-pt-Begründung in ADR-041, nicht dessen Entscheidung.
- [CLAUDE.md](../../../CLAUDE.md): Absatz „Tippflächen" ohne die 38,5-pt-Begründung; je ein kurzer Satz zu `aria-*` statt `accessibilityState` und zu `fontFamily.sans` an Stellen, die an `Text` vorbei rendern.
- [architecture.md](../../architecture.md): Schriften (wo eingebettet, wo geladen, wie Gewichte aufgelöst werden) und `inlineRem` im Theming-Abschnitt.
- [.coderabbit.yaml](../../../.coderabbit.yaml): `path_instructions` um dieselben zwei Regeln, falls sie dort gespiegelt werden.

## 6. Dem Builder überlassen

- Wie das Laden der Schrift im Web bei statischem Export aussieht (§3.2), innerhalb der Anforderungen dort.
- Installationsbefehl und genaue Pfade des Schrift-Pakets.
- Je Stelle: Ausgleich der sichtbaren Lage oder nicht (§3.3), Rolle bei Zuständen an `button` (§3.4).
- Wie `TopBar` erzwingt, dass `onAdd` ein Label mitbringt.
- Ob `EventCreateScreen.jest.tsx` das Titelfeld künftig über das Label findet.
- Reihenfolge und Zuschnitt der Commits innerhalb der a11y-Punkte.
