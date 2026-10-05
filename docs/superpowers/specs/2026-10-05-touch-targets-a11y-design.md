# Touch-Targets & a11y (Block 4) — Design

**Status:** Approved (Brainstorming)
**Date:** 2026-10-05
**Auftrag:** [docs/roadmap.md](../../roadmap.md) → [Block 4 — Touch-Targets & a11y](../../roadmap.md#block-4--touch-targets--a11y). Alle Punkte in einem PR, danach eine gemeinsame Sichtprüfung.
**Decision-Log:** ein ADR (041) am Branch-Ende.

## 1. Befund

Alle fünf Punkte des Blocks bestehen im Code so, wie Roadmap und `docs/TODO.md` sie beschreiben.
Drei Dinge kamen beim Nachlesen dazu:

- **`hitSlop` wirkt auf Web gar nicht.** react-native-web kennt die Eigenschaft nicht. Der in der
  Roadmap vorgeschlagene Fix (`py-1` am Container, wie in `FilterChipRow`) hilft deshalb nur nativ;
  auf Web bleiben alle drei Pillen-Reihen bei 36 px.
- **Die Abschaltung inaktiver Tab-Szenen greift auf Web nicht.** Der Tab-Navigator blendet
  inaktive Szenen über `react-native-screens` aus (`detachInactiveScreens`, auf Web per Default
  an). `react-native-screens` meldet sich auf Web aber als abgeschaltet, der Navigator rendert
  dann eine schlichte `View`. Übrig bleibt nur das `aria-hidden` der Szene — sie ist für
  Screenreader weg, für die Tab-Taste nicht.
- **Der Kind-Filter kann ganz unsichtbar werden.** Wird das letzte Kind gelöscht, während sein
  Chip aktiv ist, blendet `AufgabenScreen` die Kind-Reihe aus; der Filter bleibt gesetzt und die
  Liste leer.

## 2. Entwurf

### 2.1 Pillen: Tippfläche statt `hitSlop`

Gilt für `TypePicker`, die „Kein Mitglied"-Pille in `MemberPicker` und `FilterChipRow`
([app-sections/shared/](../../../app-sections/shared/)).

- Das `Pressable` ist 44 px hoch (`h-11`) und zentriert seinen Inhalt; die sichtbare Pille ist
  eine innere `View` mit der bisherigen Optik (36 px, Rand, Farben). `hitSlop` entfällt, ebenso das
  `py-1` in `FilterChipRow` samt seinem Kommentar.
- Die Reihen behalten nur ihren waagerechten Abstand (`gap-x-2`). Der senkrechte Abstand zwischen
  umbrochenen Zeilen ergibt sich aus den Tippflächen: 44 px Raster, wie bisher 36 + 8.
- `TypePicker` wächst dadurch um je 4 px nach oben und unten. Der Abstand zwischen Beschriftung
  und Pillen wird um diese 4 px verkleinert, damit er optisch bleibt. In `FilterChipRow` ändert
  sich nichts Sichtbares, in `MemberPicker` auch nicht (die Avatar-Knöpfe sind höher als die Pille).
- `FilterChipRow` behält `minWidth: 44` und die Rollen `radiogroup`/`radio`.
- Die Avatar-Knöpfe in `MemberPicker` sind bei kurzen Namen rechnerisch 40 px breit. Sie bekommen
  eine Mindestbreite von 44 px.

### 2.2 Farbfelder im Kinderprofil

[ChildProfileScreen.tsx](../../../app-sections/child-profile/ChildProfileScreen.tsx) übernimmt den
Aufbau aus `ParentProfileScreen`: jedes Farbfeld sitzt mittig in einer 44×44-Box, die Boxen
kacheln ohne Lücke. `hitSlop` und `gap-2` entfallen. Labels, Hint und `selected`-Zustand bleiben.

### 2.3 Kind-Filter gegen die Kinderliste abgleichen

- Neue reine Funktion in [features/tasks/filter.ts](../../../features/tasks/filter.ts):
  `resolveChildFilter(childId, knownChildIds)`. `CHILD_ALL` und `CHILD_NONE` bleiben, eine
  bekannte ID bleibt, eine unbekannte ID wird zu `CHILD_ALL`. Ist `knownChildIds` `undefined`
  (Liste noch nicht geladen), bleibt die Auswahl unangetastet.
- `useTaskFilter()` zieht aus `filterStore.ts` nach `queries.ts` um und liefert dort den
  abgeglichenen Filter: Store-Auswahl plus `useFamilyChildren`. Es bleibt der einzige öffentliche
  Lese-Hook; `AufgabenScreen` und `useFilteredTaskSections` lesen ihn unverändert.
- Abgeleitet beim Lesen, nicht per Effekt in den Store zurückgeschrieben: kein Zwischenbild mit
  leerer Liste, und der Store bleibt frei von Server-Daten.
- `filterStore.ts` darf `@/features/auth` nicht importieren — sein Test lädt das Modul unter
  `bun test`, und der Auth-Barrel zieht `AuthGate` und damit das nativewind-Runtime herein.

### 2.4 Kürzel der Eltern

`ChildAvatar` nimmt `short` schon an. Durchgereicht wird es an den Stellen mit 32-px-Avatar:

- Dashboard-Reihe: `AvatarParent` und `AvatarEntry` in
  [avatarRow.ts](<../../../app-sections/(tabs)/dashboard/avatarRow.ts>) tragen `short` (nur Eltern).
- Profil-Karte in [SettingsScreen.tsx](../../../app-sections/settings/SettingsScreen.tsx).
- `MemberPicker`: `MemberOption` bekommt ein optionales `short`, `EventCreateScreen` setzt es für
  Eltern.

Nicht an den 24-px-Avataren in Tagesagenda und Termin-Detail: drei Zeichen passen dort
rechnerisch nicht hinein. Der TODO-Eintrag wird auf diese zwei Stellen verkleinert.

### 2.5 Verdeckte Tab-Szenen (nur Web)

In [app/(tabs)/\_layout.tsx](<../../../app/(tabs)/_layout.tsx>) wird `screenOptions` zur Funktion.
Auf Web bekommt jede Szene, die im Tab-Navigator nicht die fokussierte Route ist,
`sceneStyle: { visibility: "hidden" }`. Das nimmt sie aus Tab-Reihenfolge und Screenreader-Baum;
Layout und Scrollposition bleiben erhalten. React Navigations Stack behandelt verdeckte Karten auf
Web genauso.

- Fokus wird am Zustand des **Tab-Navigators** abgelesen, nicht über `navigation.isFocused()`.
  Letzteres ist auch dann falsch, wenn ein Root-Screen (Sheet, Modal) über den Tabs liegt — die
  Tabs dahinter müssen sichtbar bleiben.
- Nativ ändert sich nichts.
- Ausweichweg, falls die Option beim Tab-Wechsel nicht neu ausgewertet wird: `screenLayout` mit
  einer `View`, die auf Web `inert` trägt.

Verworfen: `enableScreens(true)` auf Web. Der Schalter gilt für jeden Navigator der App und setzt
inaktive Szenen auf `display: none`.

### 2.6 Deckfläche von `AuthGate` (nur Web)

Im `app`-Zweig von [AuthGate.tsx](../../../features/auth/AuthGate.tsx) stehen die Kinder auf Web in
einem dauerhaften Container (`flex: 1`), der `inert` trägt, solange `layout.cover` gilt. Der
Container ist im `app`-Zweig immer da, sein Umschalten mountet den Navigator also nie neu
([ADR-040](../../decision-log.md) Decision 2 bleibt unberührt). Nativ rendert der Gate wie bisher
ein Fragment. `gateLayout` ändert sich nicht.

## 3. Tests und Prüfung

**Unit, Test zuerst:** `resolveChildFilter` (bekannte ID, unbekannte ID, beide Sentinels, Liste
`undefined`, leere Liste) · `buildAvatarRow` (Eltern tragen `short`, Kinder nicht).

**Web-Sichtlauf (Playwright), mit Wegwerf-Daten:**

1. Jede geänderte Tippfläche misst mindestens 44×44: Pillen in Termin- und Aufgaben-Formular,
   Filter-Chips, Farbfelder, Avatar-Knöpfe.
2. Tab-Taste: Der Fokus landet auf keinem Element einer verdeckten Tab-Szene. Der Lauf muss auf
   `main` scheitern. Ein Tab-Wechsel und zurück hält die Scrollposition; ein Sheet über den Tabs
   lässt sie sichtbar.
3. Kind-Filter: Kind anlegen, Chip wählen, Kind löschen — „Alle" ist markiert, die Liste voll.
4. Kürzel: ein geändertes Kürzel erscheint in Dashboard-Reihe, Einstellungen und Termin-Formular.
5. `AuthGate`: Login-Übergang, Kaltstart mit und ohne Sitzung, „Abmelden" mit abgefangenem
   Server-Logout und schneller Wieder-Login — Konsole sauber wie nach Block 3. Während die
   Deckfläche liegt, trägt der Container `inert`.
6. Screenshots von Termin-Formular, Aufgaben-Formular, Kinderprofil, Dashboard und Einstellungen,
   light und dark.

**Nicht geprüft:** iOS und Android. Die Tippflächen sind dort reines Layout (`h-11`), 2.5 und 2.6
sind auf Web begrenzt.

## 4. Nicht enthalten

- Ein geteilter Pillen-Baustein für die drei Reihen. Der Umbau bleibt je Komponente.
- Die Sperre der Deckfläche für native Screenreader. Sie bräuchte denselben Container auf iOS und
  Android und damit eine native Sichtprüfung; bleibt als TODO-Eintrag.
- Weitere Tippflächen unter 44 px, die der Sichtlauf findet: als ein TODO-Eintrag notiert, nicht
  hier behoben.

## 5. Doku am Branch-Ende

- ADR-041: Tippfläche statt `hitSlop`, verdeckte Szenen auf Web, Container um den Gate.
- `docs/TODO.md`: die vier erledigten Einträge entfernen, den Fokus-Eintrag auf den nativen Rest
  und den Kürzel-Eintrag auf die 24-px-Avatare verkleinern.
- `docs/roadmap.md`: Block 4 abhaken.
- `CLAUDE.md`: die Konvention „Tippfläche über die Box, nicht über `hitSlop`" bei den
  Import-Konventionen ergänzen, neben der `Alert`-Regel. Dieselbe Zeile in die
  Screen-Anweisung von `.coderabbit.yaml`.
- Eigener Commit, unabhängig von Block 4: Roadmap 0.1 ist erledigt (das Ruleset trägt die sechs
  Required Checks), der TODO-Eintrag dazu entfällt, der CI-Abschnitt in `CLAUDE.md` wird berichtigt.
