# Roadmap — Schritt für Schritt durch `docs/TODO.md`

Diese Datei ordnet die offenen Einträge aus [docs/TODO.md](./TODO.md) in nummerierte Schritte. Sie
ersetzt `TODO.md` nicht — dort steht **was** offen ist und **warum** es vertagt wurde, hier steht
**wann** es drankommt und **woran es hängt**. Ein Eintrag erscheint hier nur mit seinem Titel,
gruppiert nach dem Abschnitt, unter dem er in `TODO.md` steht.

Jeder offene Eintrag gehört zu genau einem Schritt oder steht unter
[Geparkt](#geparkt--wartet-auf-ein-signal) bzw. [Beobachten](#beobachten). Die Schritte laufen der
Reihe nach. Ordnungsprinzip: **Korrektheit zuerst.** Erst hört stiller Datenverlust auf, dann folgen
Werkzeug und Komfort, der Designer-Durchgang, die großen Migrationen und zuletzt, was an Anbietern
hängt. Blockierte Schritte stehen mit in der Liste; ihre Zeile **Vorher nötig** sagt, was wir
entscheiden oder besorgen müssen, um sie zu entblocken.

## Legende

| Marker           | Bedeutung                                                                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 🎨               | Braucht eine Designer-Entscheidung oder einen Copy-Key. Das Handoff-Bundle ist off-limits (CLAUDE.md Non-negotiable 1) — der Code-Teil kann trotzdem vorbereitet werden. |
| 🔒               | Extern blockiert: Anbieter, Domain, Konto oder Geld.                                                                                                                     |
| **Vorher nötig** | Was entschieden oder bereitgestellt sein muss, bevor der Schritt beginnt. Fehlt die Zeile, kann er sofort losgehen.                                                      |
| **S / M / L**    | Aufwand: S = ein Commit, M = eine Iteration mit Testlauf, L = eigene Iteration mit Spec, Migration oder Zwei-Client-Durchgang.                                           |

---

## Die Schritte auf einen Blick

| Schritt                                                                                        | Aufwand | Vorher nötig                                       |
| ---------------------------------------------------------------------------------------------- | ------- | -------------------------------------------------- |
| [3. Datenbank-Hygiene](#3-datenbank-hygiene)                                                   | M       | Grenzwerte für Name, Kürzel, Farbe                 |
| [4. Allergen-Urteil](#4-allergen-urteil)                                                       | M       | —                                                  |
| [5. Toast](#5-toast)                                                                           | S       | —                                                  |
| [6. Barrierefreiheit und Theming ohne Designer](#6-barrierefreiheit-und-theming-ohne-designer) | M       | —                                                  |
| [7. Kalender-Komfort](#7-kalender-komfort)                                                     | M       | —                                                  |
| [8. Live-Sync des Essensplans](#8-live-sync-des-essensplans)                                   | L       | —                                                  |
| [9. Werkzeug und Renovate](#9-werkzeug-und-renovate)                                           | S–M     | —                                                  |
| [10. Geräte-Runde iOS und Android](#10-geräte-runde-ios-und-android)                           | M       | —                                                  |
| [11. E2E-Lauf mit Konto](#11-e2e-lauf-mit-konto)                                               | L       | —                                                  |
| [12. Entscheidungsrunde](#12-entscheidungsrunde)                                               | S       | sieben Antworten von dir                           |
| [13. Die Entscheidungen bauen](#13-die-entscheidungen-bauen)                                   | M–L     | Schritt 12                                         |
| [14. Copy-Deck nachtragen](#14-copy-deck-nachtragen) 🎨                                        | M       | Freigabe für `docs/COPY.md`                        |
| [15. Pattern-Docs nachziehen](#15-pattern-docs-nachziehen) 🎨                                  | M       | Freigabe für `patterns/`, zwei Richtungsfragen     |
| [16. Kalender-Design](#16-kalender-design) 🎨                                                  | M–L     | Designer                                           |
| [17. Dashboard-Design](#17-dashboard-design) 🎨                                                | M       | Designer                                           |
| [18. Familie, Einstellungen, Aufgaben](#18-familie-einstellungen-aufgaben) 🎨                  | M       | Designer, Zielscreens für Coming-soon-Rows         |
| [19. Undo und Toast](#19-undo-und-toast) 🎨                                                    | M       | Designer                                           |
| [20. Konto und Einladungen](#20-konto-und-einladungen) 🎨 🔒                                   | L       | Account-Screen, Mail-Zustellweg                    |
| [21. Essen-Ausbau](#21-essen-ausbau) 🎨                                                        | L       | Patterns für Einkauf, Kochen, Favoriten, Portionen |
| [22. Icons auf `@react-native-vector-icons`](#22-icons-auf-react-native-vector-icons)          | M       | —                                                  |
| [23. Tailwind v4](#23-tailwind-v4)                                                             | L       | NativeWind-Unterstützung prüfen                    |
| [24. `AuthGate` auf `Stack.Protected`](#24-authgate-auf-stackprotected)                        | L       | —                                                  |
| [25. `rrule` ablösen](#25-rrule-ablösen)                                                       | L       | Ersatz wählen                                      |
| [26. Release-Grundlage](#26-release-grundlage) 🔒                                              | L       | Apple- und Google-Konto, Bundle-ID, Signing        |
| [27. Universal Links für Einladungen](#27-universal-links-für-einladungen) 🔒                  | M       | eigene Domain, Schritt 26                          |
| [28. Erinnerungen](#28-erinnerungen) 🔒                                                        | L       | Schritt 26, Firebase-Projekt                       |
| [29. Sprachassistent](#29-sprachassistent) 🔒                                                  | L       | STT- und LLM-Anbieter, Kosten, Datenschutz         |
| [30. Rezepte über gustar.io](#30-rezepte-über-gustario) 🔒                                     | L       | API-Zugang                                         |
| [31. Abos](#31-abos) 🔒                                                                        | L       | Preismodell, Store-Abo oder Stripe                 |
| [32. Social Logins](#32-social-logins) 🔒                                                      | M       | Schritt 26, Google-OAuth-Client                    |

---

## Sofort machbar

Kein Blocker. Jeder Schritt ist ein eigener Branch; die Reihenfolge folgt dem Schaden, den der
offene Punkt heute anrichten kann.

### 3. Datenbank-Hygiene

**M** · Eine Migration, ein `test:db`-Lauf. Steht vor dem Live-Sync (Schritt 8), weil der auf
denselben Tabellen aufsetzt.

**Vorher nötig:** Grenzwerte für Name, Kürzel und Farbe. Ich leite einen Vorschlag aus den
Client-Regeln ab, du bestätigst ihn.

- [Conflict-Detection](./TODO.md#conflict-detection-siehe-adr-031)
  - `families`, `parents` und `children` tragen dasselbe tote `updated_at`
- [Familie](./TODO.md#familie--child-profile-live-daten-v1)
  - Name, Kürzel und Farbe haben serverseitig keine Grenzen
- [Essen](./TODO.md#essen--meal-planner-daten-layer-v1)
  - Kein Index bedient den Rezept-Query-Pfad
- [Weitere](./TODO.md#weitere-out-of-scope-items)
  - Der Performance-Advisor meldet Fremdschlüssel ohne Index und nie benutzte Indizes
  - Neue Funktionen und Sequenzen in `public` bekommen `anon` weiter über die Default-ACL

### 4. Allergen-Urteil

**M** · Ein falsches Allergie-Urteil ist der teuerste Fehler, den die App einer Familie machen kann.
Beide Punkte gehen ohne den gustar.io-Korpus; das Nachschärfen der Begriffslisten nicht
(Schritt 30).

- [Essen](./TODO.md#essen--meal-planner-daten-layer-v1)
  - Ein negiertes Schlüsselwort räumt den Key nicht ab
  - Ein geprüftes Rezept ohne Fund hat keine saubere Ausdrucksform

### 5. Toast

**S** · Klein, und danach melden Web und nativ Erfolge gleich.

- [Weitere](./TODO.md#weitere-out-of-scope-items)
  - Toast statt `showAlert` für Erfolgsmeldungen
- [Toast](./TODO.md#toast)
  - Das Ausblenden kollabiert die Höhe nicht

### 6. Barrierefreiheit und Theming ohne Designer

**M** · Alles, was ohne neue Copy oder Designentscheidung geht. Der Rest folgt in den Schritten 16
und 18.

- [Weitere](./TODO.md#weitere-out-of-scope-items)
  - Die Statusleiste folgt dem System, nicht dem App-Theme
  - Das Plus-Feld des heutigen Tags im Essensplan ist im dunklen Design hellgrau
  - Kalender-Tageszellen sagen ein ISO-Datum an und keinen Auswahlzustand
  - Initialen-Avatare stehen in der Ansage ganzer Zeilen
  - Radiogruppen wechseln auf Web nicht per Pfeiltaste

### 7. Kalender-Komfort

**M** · Kein Datenverlust mehr, aber im Alltag spürbar.

- [Calendar](./TODO.md#calendar-v1--siehe-adr-008)
  - Datumsformat in den Termin-Formularen ist Deutsch-geprägt für beide Sprachen
- [Calendar Optimistic UI](./TODO.md#calendar-optimistic-ui-siehe-adr-027)
  - Eine Regeländerung wird nicht optimistisch abgebildet
  - Unter „Alle“ ohne Regeländerung zeigt die bearbeitete verschobene Occurrence kurz Master-Werte
- [Conflict-Detection](./TODO.md#conflict-detection-siehe-adr-031)
  - Unter „Alle“ auf einer Occurrence mit Override beschreibt der Konflikt-Dialog einen Schreibvorgang, der sie nicht erreicht
- [Weitere](./TODO.md#weitere-out-of-scope-items)
  - Auf Englisch zeigt der Kalender beim ersten Öffnen deutsche Wochentage
- [Dashboard](./TODO.md#dashboard)
  - Der Overflow-Link kann nur einen Tab treffen

### 8. Live-Sync des Essensplans

**L** · Zwei-Client-Durchgang nach dem Vorbild des Kalenders ([ADR-030](./decision-log.md)).

- [Essen](./TODO.md#essen--meal-planner-daten-layer-v1)
  - Kein Live-Sync des Essensplans

### 9. Werkzeug und Renovate

**S–M** · Mehrere kleine Commits in einem Branch; jeder spätere Schritt profitiert davon.

- [Renovate](./TODO.md#renovate--dependencies-siehe-adr-013)
  - Workaround für den AssetRegistry-Mock entfernen
  - Der Maestro-Pin des Startchecks hat keinen Update-Pfad
  - Die Lockfile-Maintenance kennt kein Mindestalter
  - Die Lockfile-Wartung zieht exakt gepinnte SDK-Pakete nicht nach
- [Weitere](./TODO.md#weitere-out-of-scope-items)
  - Der Linter meldet keine überflüssigen Null-Prüfungen
- [Calendar](./TODO.md#calendar-v1--siehe-adr-008)
  - Tests hängen an der Leserzone
- [Calendar Optimistic UI](./TODO.md#calendar-optimistic-ui-siehe-adr-027)
  - `features/calendar/hooks.ts` ist unter `bun test` nicht ladbar

### 10. Geräte-Runde iOS und Android

**M** · Alles, was sich nur im Simulator oder Emulator prüfen lässt, in einer Sitzung.

- [Renovate](./TODO.md#renovate--dependencies-siehe-adr-013)
  - Ob der JDK-17-Pin noch nötig ist, ist ungeprüft
- [Weitere](./TODO.md#weitere-out-of-scope-items)
  - Auf Android verwerfen Wischen und Scrim-Tipp Formular-Sheets ohne Rückfrage
- [Essen](./TODO.md#essen--meal-planner-daten-layer-v1)
  - Die Slot-Leiste ist mit vier Tabs am Gerät ungeprüft
- [Realtime](./TODO.md#realtime-siehe-adr-030)
  - Debug-Screen: Dark-Theme auf iOS und jede Ansicht auf Android stehen noch aus

### 11. E2E-Lauf mit Konto

**L** · Erweitert den Maestro-Startcheck ([ADR-057](./decision-log.md)) um die lokale Supabase und
ein Testkonto. Danach lassen sich weitere Abläufe ohne Handarbeit prüfen.

- [Undo-Delete](./TODO.md#undo-delete-siehe-adr-026)
  - Hintergrund-Flushen ist nur per E2E prüfbar

---

## Entscheidungen, dann Bau

### 12. Entscheidungsrunde

**S** · Ein Gespräch, eine Frage pro Eintrag. Jede Antwort landet im ADR des Branches, der sie baut.

**Vorher nötig:** deine Antworten auf diese Fragen:

1. **Fehlt die bearbeitete Occurrence in der fremden Fassung, tut „Deine Fassung speichern" …**
   ([Calendar](./TODO.md#calendar-v1--siehe-adr-008)) — Was soll „Deine Fassung speichern" für eine
   Occurrence heißen, die die fremde Fassung nicht mehr erzeugt?
2. **Onboarding-Schritt 2 übergeht beim Zurück aus Schritt 3 die bestehende Familie**
   ([Auth / Onboarding](./TODO.md#auth--onboarding)) — Was zeigt Schritt 2 einem Elternteil, das
   schon eine Familie hat?
3. **Ein abgelaufener gemerkter Einladungstoken sperrt Schritt 2 auf den Beitritt**
   ([Auth / Onboarding](./TODO.md#auth--onboarding)) — Token bei `22023` verwerfen und auf „Familie
   gründen" umschalten, oder den Ablauf schon beim Merken prüfen?
4. **Verwaiste Familien bleiben für immer stehen**
   ([Familie](./TODO.md#familie--child-profile-live-daten-v1)) — Wie lange bleiben die Daten einer
   verwaisten Familie stehen, und wer löscht sie wann?
5. **`intolerances` wird nicht gelesen** ([Essen](./TODO.md#essen--meal-planner-daten-layer-v1)) —
   Wie soll die App Intoleranzen (Laktose, Fructose, Histamin) neben dem Allergie-Urteil bewerten?
6. **Required Status Checks binden den Repo-Admin nicht**
   ([Renovate](./TODO.md#renovate--dependencies-siehe-adr-013)) — Bleibt der Bypass auf `always`,
   oder geht er auf `pull_request`? Umstellen kannst nur du; das Token darf keine Rulesets ändern.
7. **„Diesen und alle folgenden“ von einer per „Nur diesen“ verschobenen Occurrence übernimmt …**
   ([Calendar](./TODO.md#calendar-v1--siehe-adr-008)) — Wo und mit welchen Werten beginnt die
   abgespaltene Serie, wenn die geöffnete Occurrence per „Nur diesen“ verschoben wurde?

### 13. Die Entscheidungen bauen

**M–L** · Je nach Antwort ein oder mehrere Branches: Kalender und Onboarding mit Tests auf dem
Schreibpfad, verwaiste Familien als Migration, Intoleranzen als eigenes Urteilsmodell.

**Vorher nötig:** Schritt 12.

---

## Designer-Durchgang

🎨 Hier hängt alles am Handoff-Bundle.

**Vorher nötig für die ganze Phase:** Entweder gibst du frei, dass ich `docs/COPY.md` und
`patterns/*.md` aus dem Code heraus entwerfe und der Designer gegenliest, oder der Designer schreibt
sie selbst. Bis dahin lässt sich nur der Code-Teil vorbereiten.

### 14. Copy-Deck nachtragen

**M** · Reine Nachträge: Die Keys sind gebaut und in beiden Katalogen übersetzt, nur das Deck kennt
sie nicht.

- [Calendar](./TODO.md#calendar-v1--siehe-adr-008)
  - Neue Kalender-Keys fehlen in `docs/COPY.md`
- [Auth / Onboarding](./TODO.md#auth--onboarding)
  - Neue `dash.resume.*`-Keys fehlen in `docs/COPY.md`
  - Neue `auth.invite.*`-Keys fehlen in `docs/COPY.md`
- [Familie](./TODO.md#familie--child-profile-live-daten-v1)
  - Neue `familie.*`-Invite-Keys fehlen in `docs/COPY.md`
  - Neuer `color.*`-Namespace fehlt in `docs/COPY.md`
  - Neue `parent.*`-Keys fehlen in `docs/COPY.md`
- [Einstellungen](./TODO.md#einstellungen-phase-1)
  - `set.footer` fehlt in `docs/COPY.md`
- [Aufgaben](./TODO.md#aufgaben--tasks-daten-layer-v1)
  - Neue Aufgaben-Keys fehlen in `docs/COPY.md`
  - `hw.error.*` fehlen in `docs/COPY.md`
  - Neue Formular-Keys fehlen in `docs/COPY.md`
  - `form.discard.*` fehlt in `docs/COPY.md`
  - Neue Filter-Keys fehlen in `docs/COPY.md`
  - `dash.greeting.evening` fehlt in `docs/COPY.md` und `patterns/dashboard.md` (der Pattern-Teil in
    Schritt 15)
- [Essen](./TODO.md#essen--meal-planner-daten-layer-v1)
  - Neue i18n-Keys fehlen in `docs/COPY.md`
- [Undo-Delete](./TODO.md#undo-delete-siehe-adr-026)
  - Die neuen Undo-Copy-Keys fehlen in `docs/COPY.md`
- [Realtime](./TODO.md#realtime-siehe-adr-030)
  - Der Debug-Screen steht nicht in `docs/COPY.md`
- [Weitere](./TODO.md#weitere-out-of-scope-items)
  - Die EN-Fassung der Sample-Copy ist von uns, nicht vom Designer

### 15. Pattern-Docs nachziehen

**M** · Die Abweichungen im Code sind freigegeben, die Docs müssen nachziehen.

**Vorher nötig:** zwei Richtungsfragen. Soll die Kalender-Legende `ha` zeigen (dann braucht es einen
`event_types`-Datensatz) oder fällt der Swatch weg? Und ist `dashboard-empty.md` eine Karte oder ein
eigener Screen?

- [Calendar](./TODO.md#calendar-v1--siehe-adr-008)
  - Kalender-Legende zeigt eine Kategorie ohne Datenbasis
- [Auth / Onboarding](./TODO.md#auth--onboarding)
  - `patterns/dashboard-empty.md` beschreibt einen Screen, den keine Route mountet
- [Familie](./TODO.md#familie--child-profile-live-daten-v1)
  - Es gibt kein `patterns/parent-profile.md`
- [Aufgaben](./TODO.md#aufgaben--tasks-daten-layer-v1)
  - `patterns/homework.md` beschreibt einen V1/V2-Umschalter, den es nicht gibt
  - `patterns/homework.md` kennt kein Anlege-Formular
  - `patterns/homework.md` kennt keine Filterleiste und nennt drei Sektionen statt fünf
  - `dash.greeting.evening` fehlt in `docs/COPY.md` und `patterns/dashboard.md` (Pattern-Teil)
- [Essen](./TODO.md#essen--meal-planner-daten-layer-v1)
  - Designer-Abstimmung Essen-Tab: Zeilen-Menü und Wochen-Blättern
  - Chip-Reihe in beiden Pattern-Docs veraltet
  - `patterns/meals.md` beschreibt drei Slot-Tabs, der Screen rendert vier

### 16. Kalender-Design

**M–L** · Was im Kalender nur mit Copy oder einer Designentscheidung weitergeht.

- [Calendar](./TODO.md#calendar-v1--siehe-adr-008)
  - Ganztägig ist im Edit-Form nicht umschaltbar
  - Eine Datumsänderung unter Scope „alle Termine" wird stillschweigend verworfen
  - Der Konflikt-Dialog verschweigt, was an einer Regeländerung hängt
  - Eine fremde Absage der bearbeiteten Occurrence erscheint als Dialog ohne Zeilen …
  - Die Zone eines neuen Termins kommt unsichtbar vom Gerät
  - Bestandstermine tragen pauschal `Europe/Berlin`
  - Punkte auf der Heute-Zelle sind unsichtbar
  - Der Sprach-FAB verdeckt die Karte „Termin per Sprache“
- [Weitere](./TODO.md#weitere-out-of-scope-items)
  - Kalender-Tageszellen sind bei 320 pt schmaler als 44
  - Die Monatspfeile des Kalenders haben keine Rolle und keinen Namen
  - Die Kollisionsprüfung sieht nur eine Occurrence einer Serie (Anlegen: die erste, Bearbeiten: die bearbeitete)

### 17. Dashboard-Design

**M** · Fehler- und Leerzustände, die heute gar nichts rendern.

- [Dashboard](./TODO.md#dashboard)
  - Die Leer-Karte des Heros benennt die Mahlzeit nicht
  - Ein geplanter Eintrag ohne sichtbares Rezept liest sich auch im Hero als „nichts geplant“
  - Fehlgeschlagene Meal-Query bleibt stumm
  - Die Copy der Prep-Karte gehört gegengelesen
  - Auch die Prep-Karte schweigt bei Fehlern
  - Der Familienname ist weiter Sample-Data
  - Die Avatar-Reihe filtert nichts (Filter-Teil; der Long-Press folgt in Schritt 29)
  - Fehlgeschlagene Event-Query bleibt stumm
- [Essen](./TODO.md#essen--meal-planner-daten-layer-v1)
  - Ein geplanter Eintrag ohne sichtbares Rezept liest sich als „nichts geplant“
- [Aufgaben](./TODO.md#aufgaben--tasks-daten-layer-v1)
  - Kein Einstieg ins Anlegen vom Dashboard

### 18. Familie, Einstellungen, Aufgaben

**M** · Kleinere Copy- und Designfragen aus drei Tabs.

**Vorher nötig:** Zielscreens für Datenschutz, Verknüpfte Apps und Hilfe & Support. Den Inhalt der
Datenschutz-Seite liefert kein Designer.

- [Familie](./TODO.md#familie--child-profile-live-daten-v1)
  - Das Kürzel der Eltern passt nicht in jeden Avatar
  - „+ Andere“-Custom-Allergen
- [Essen](./TODO.md#essen--meal-planner-daten-layer-v1)
  - Kein Freitext-Allergen (zusammen mit „+ Andere“)
- [Einstellungen](./TODO.md#einstellungen-phase-1)
  - Logout-Confirm hat keinen Body-Text
  - Coming-soon-Rows ohne Ziel (ohne den Sprachassistenten, der folgt in Schritt 29)
- [Aufgaben](./TODO.md#aufgaben--tasks-daten-layer-v1)
  - `hw.due` zeigt ein nacktes Datum, der Mock zeigte relative Wörter
  - Für „du gehörst nicht mehr zur Familie" fehlt ein eigener Text
- [Weitere](./TODO.md#weitere-out-of-scope-items)
  - Tag-Pillen im Kinderprofil sagen nicht an, dass ein Tipp das Tag entfernt
  - Die Spur eines ausgeschalteten Schalters ist im dunklen Design kaum sichtbar

### 19. Undo und Toast

**M** · Die beiden offenen Fragen am Undo-Toast und die Benennung der Radien.

- [Undo-Delete](./TODO.md#undo-delete-siehe-adr-026)
  - Das Undo-Fenster ist nicht verlängerbar
  - Das ✕ am Undo-Toast schließt, ohne rückgängig zu machen und ohne vorzeitig zu committen
- [Toast](./TODO.md#toast)
  - Die Design-Prototyp-CSS und die Token-Skala benennen dieselben Radien verschieden

### 20. Konto und Einladungen

**L** · 🔒 zusätzlich zum Designer.

**Vorher nötig:** ein Design für den Account-Screen (eigene Route oder `/parent/[id]`, mit Abo und
„Konto löschen"?) und ein Zustellweg für Mails — ein SMTP-Anbieter für Supabase Auth oder eine Edge
Function.

- [Einstellungen](./TODO.md#einstellungen-phase-1)
  - Account-Detail-Route hinter der Profil-Card
- [Familie](./TODO.md#familie--child-profile-live-daten-v1)
  - E-Mail-Adresse ist nirgends änderbar
  - Einladungen sind nicht adressiert

### 21. Essen-Ausbau

**L** · Neue Funktionen statt Korrekturen, deshalb nach allem anderen im Essen-Tab.

**Vorher nötig:** Patterns für Einkaufsliste (`/meals/shopping`), Kochmodus, Favoriten sowie
Portionen und Notizen.

- [Essen](./TODO.md#essen--meal-planner-daten-layer-v1)
  - Portionen und Notizen pro Eintrag fehlen
  - Kein Favorisieren von Rezepten
  - Fußzeilen-Buttons sind unverdrahtet

---

## Block 10 — Große Migrationen

Kein Zeitdruck, je eine eigene Iteration. Der Block heißt weiter so, weil
[ADR-057](./decision-log.md) auf ihn verweist.

### 22. Icons auf `@react-native-vector-icons`

**M** · Kein Breaking Change, deshalb die erste der Migrationen.

- [Weitere](./TODO.md#weitere-out-of-scope-items)
  - `@expo/vector-icons` → scoped `@react-native-vector-icons/*`

### 23. Tailwind v4

**L** · Trifft das Theming-Fundament und damit jeden Screen.

**Vorher nötig:** prüfen, ob eine stabile NativeWind-Version Tailwind v4 trägt. Wenn nicht, wartet
der Schritt darauf.

- [Weitere](./TODO.md#weitere-out-of-scope-items)
  - Tailwind v3 → v4

### 24. `AuthGate` auf `Stack.Protected`

**L** · Jeder Login- und Abmeldepfad ist betroffen; Sichtprüfung auf iOS und Android ist Pflicht.

- [Auth / Onboarding](./TODO.md#auth--onboarding)
  - `AuthGate` folgt nicht Expos Auth-Muster

### 25. `rrule` ablösen

**L** · Der Schreibpfad ist seit [ADR-058](./decision-log.md#adr-058--kalender-stille-fehler-im-schreibpfad-laden-über-events_in_range-regel-occurrence-als-anker-2026-11-24) frei von bekannten stillen Fehlern, der Tausch kann also darauf aufsetzen.

**Vorher nötig:** Ersatz wählen — eigene Berechnung oder eine gepflegte Bibliothek. Ich bereite den
Vergleich vor, wir entscheiden zusammen.

- [Renovate](./TODO.md#renovate--dependencies-siehe-adr-013)
  - `rrule` wird nicht mehr gepflegt

---

## Extern blockiert — entblocken wir zusammen

🔒 Diese Schritte hängen an Konten, Anbietern oder Geld. Unter **Vorher nötig** steht, was du
besorgen oder entscheiden musst; den Rest übernehme ich. Der Sammeleintrag **„gustar.io Worker +
Stripe + Expo Notifications"** ([Weitere](./TODO.md#weitere-out-of-scope-items)) fällt weg, sobald
die Schritte 28, 30 und 31 erledigt sind.

### 26. Release-Grundlage

**L** · Voraussetzung für die Schritte 27, 28 und 32.

**Vorher nötig:**

- Mitgliedschaft im Apple Developer Program und ein Konto in der Google Play Console
- Bundle-ID und Package-Name festlegen
- Signing von EAS verwalten lassen oder selbst halten (der EAS-Account `sf-sven` existiert)

- [Weitere](./TODO.md#weitere-out-of-scope-items)
  - EAS für Release, Signing und Store-Auslieferung
  - `app.json` heißt noch „Eltern Flow AI"
  - `eas build --local` als gemeinsame Build-Definition (erst, wenn `eas.json` steht)
- [Einstellungen](./TODO.md#einstellungen-phase-1)
  - Build-Nummer fehlt

### 27. Universal Links für Einladungen

**M** · Erst dann lassen sich Einladungen aus WhatsApp und Mail-Clients antippen.

**Vorher nötig:** eine eigene Domain mit Hosting für `/.well-known/` und Schritt 26 (Team-ID und
Signing-Fingerprint stehen in den Dateien dort).

- [Auth / Onboarding](./TODO.md#auth--onboarding)
  - Invite-Link ist ein Custom Scheme ohne Web-Fallback

### 28. Erinnerungen

**L** · Expo Notifications, Issue [#25](https://github.com/SvenSonnborn/ElternFlowAI/issues/25).
Bringt die erste Edge Function samt pg_cron ins Repo.

**Vorher nötig:** Schritt 26 (der APNs-Key kommt aus dem Apple-Konto) und ein Firebase-Projekt für
FCM.

- [Calendar](./TODO.md#calendar-v1--siehe-adr-008)
  - Reminder-Rows werden noch nicht zugestellt
- [Aufgaben](./TODO.md#aufgaben--tasks-daten-layer-v1)
  - Task-Zeilen haben keine Erinnerungs-Aktion mehr
- [Einstellungen](./TODO.md#einstellungen-phase-1)
  - Mitteilungen zeigen keinen echten Status

### 29. Sprachassistent

**L** · Issue [#23](https://github.com/SvenSonnborn/ElternFlowAI/issues/23), der größte einzelne
Block: das Voice-Overlay nach [patterns/settings-voice.md](../patterns/settings-voice.md). Heute
öffnet der FAB einen Platzhalter.

**Vorher nötig:** STT- und LLM-Anbieter wählen, ein Kostenrahmen und die Datenschutzfrage
(Auftragsverarbeitung, Daten von Kindern).

- [Calendar](./TODO.md#calendar-v1--siehe-adr-008)
  - Voice-Add-Flow
- [Familie](./TODO.md#familie--child-profile-live-daten-v1)
  - Voice-Add im Child-Profile
  - Likes/Dislikes ohne AI-Vorschläge
- [Einstellungen](./TODO.md#einstellungen-phase-1)
  - Coming-soon-Rows ohne Ziel (Sprachassistent-Teil)
- [Dashboard](./TODO.md#dashboard)
  - Die Prep-Karte ist eine Liste, keine Vorbereitung
  - Die Avatar-Reihe filtert nichts (Long-Press-Teil)
  - Die leere Hero-Karte hat keinen Voice-Einstieg

### 30. Rezepte über gustar.io

**L** · Issues [#24](https://github.com/SvenSonnborn/ElternFlowAI/issues/24) und
[#88](https://github.com/SvenSonnborn/ElternFlowAI/issues/88). Erst mit echtem Korpus lassen sich die
Allergen-Begriffe nachschärfen.

**Vorher nötig:** API-Zugang zu gustar.io.

- [Essen](./TODO.md#essen--meal-planner-daten-layer-v1)
  - Nur sechs Seed-Rezepte, alle ohne Bild
  - Die Rezept-Detailansicht hat keine Nährwerte
  - Die Klassifizierungs-Edge-Function fehlt weiterhin
  - Die Begriffslisten sind ein Startkorpus
  - Der Meal-Picker aus V2/V3 fehlt weiterhin
  - 🎨 `diet_tags` werden roh angezeigt
- [Toast](./TODO.md#toast)
  - 🎨 `solid` ist nicht gebaut (sein Anlass ist der Allergie-Konflikt im Essensplaner)

### 31. Abos

**L** · Issue [#26](https://github.com/SvenSonnborn/ElternFlowAI/issues/26). In `TODO.md` steht dazu
nur der Sammeleintrag.

**Vorher nötig:** ein Preismodell und die Entscheidung zwischen Abo über die Stores (In-App-Kauf) und
Stripe, danach das passende Konto.

### 32. Social Logins

**M** · Issue [#27](https://github.com/SvenSonnborn/ElternFlowAI/issues/27). In `TODO.md` steht dazu
kein Eintrag.

**Vorher nötig:** das Apple-Konto aus Schritt 26 (Sign in with Apple) und ein Google-OAuth-Client.

---

## Geparkt — wartet auf ein Signal

Diese Einträge sind **absichtlich** offen. Sie jetzt zu erledigen hieße, ohne den nächsten
Datenpunkt zu raten; die rechte Spalte nennt das Signal.

| Eintrag                                                                                                                                                         | Wird fällig, wenn …                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vereinigung der beiden Occurrence-Overlays** ([Optimistic UI](./TODO.md#calendar-optimistic-ui-siehe-adr-027))                                                | ein **drittes** Overlay dazukommt                                                                                                                                                                         |
| **`TaskCreateScreen` und `TaskEditScreen` teilen sich weiterhin Kopfzeile und Shell** ([Aufgaben](./TODO.md#aufgaben--tasks-daten-layer-v1))                    | ein **dritter** Task-Screen dazukommt (ADR-010 Decision 4 nimmt die ~30 identischen Zeilen bewusst in Kauf)                                                                                               |
| **`subscribeToFamilyChanges` entsorgt Altkanäle ohne Zustandsprüfung** ([Realtime](./TODO.md#realtime-siehe-adr-030))                                           | ein **zweiter** Abonnent desselben Topics existiert — an dem sich die richtige Verengung entscheiden lässt. Die Falle ist nicht hypothetisch: genau sie hat den Debug-Screen auf den Ringpuffer umgebaut. |
| **`useTasksSections` hat keinen Aufrufer mehr** ([Aufgaben](./TODO.md#aufgaben--tasks-daten-layer-v1))                                                          | **gar nicht** — bleibt absichtlich. Der Eintrag steht da, damit der Hook bei der nächsten Aufräumrunde nicht als Löschkandidat wirkt.                                                                     |
| **Reminder gelten für die ganze Serie, nicht pro Termin** ([Calendar](./TODO.md#calendar-v1--siehe-adr-008))                                                    | Pro-Occurrence-Erinnerungen real gebraucht werden (Schema-Erweiterung)                                                                                                                                    |
| **Recurrence-Editor bleibt für nicht-darstellbare Regeln verborgen** ([Calendar](./TODO.md#calendar-v1--siehe-adr-008))                                         | Regeln aus einem iCal-Import oder echten RRULE-Editor stammen — beides existiert nicht                                                                                                                    |
| **Wiederholung lässt sich nicht „ab hier“ ändern** ([Calendar](./TODO.md#calendar-v1--siehe-adr-008))                                                           | es ein Nutzersignal gibt; ohne das ist es Spekulation                                                                                                                                                     |
| **Balken-Budget im Monatsraster ist zwei pro Tag** ([Calendar](./TODO.md#calendar-v1--siehe-adr-008))                                                           | drei parallele Spannen real vorkommen                                                                                                                                                                     |
| **Deep-Links von vor diesem PR können auf die falsche Occurrence schreiben, nicht nur eine andere anzeigen** ([Calendar](./TODO.md#calendar-v1--siehe-adr-008)) | **gar nicht** — kein Fix vorgesehen. Der Eintrag hält fest, dass die Prämisse „nur ein falsches Ziel" nicht mehr uneingeschränkt gilt.                                                                    |
| **Toasts liegen hinter nativen Modal-Screens** ([Toast](./TODO.md#toast))                                                                                       | ein Sheet einen Toast zeigen will, solange es offen ist                                                                                                                                                   |
| **Erledigte Tasks sind nur 7 Tage weit sichtbar** ([Aufgaben](./TODO.md#aufgaben--tasks-daten-layer-v1))                                                        | ein Verlauf-/Archiv-Screen entsteht (braucht eigene paginierte Query)                                                                                                                                     |
| **`useCreateTask` ist nicht optimistisch** ([Aufgaben](./TODO.md#aufgaben--tasks-daten-layer-v1))                                                               | ein Screen die Latenz beim Anlegen spürbar macht                                                                                                                                                          |
| **Ein verlorenes Broadcast ist stumm** ([Realtime](./TODO.md#realtime-siehe-adr-030))                                                                           | es serverseitige Beobachtbarkeit gibt (Alert auf die `WARNING`-Logzeile) oder einen Client-Heartbeat                                                                                                      |

---

## Beobachten

Keine Arbeit, solange der Auslöser nicht eintritt.

- **Type-aware Lint in CI ohne Expo-Typen** ([Weitere](./TODO.md#weitere-out-of-scope-items)) —
  sobald CI-Lint und lokaler Lint auseinanderlaufen
- **`dependency-review.yml` und Renovates `vulnerabilityAlerts` überlappen im Zweck**
  ([Renovate](./TODO.md#renovate--dependencies-siehe-adr-013)) — nach einigen Monaten Betrieb
  vergleichen
- **Die Git-Hooks laufen im Sync-Workflow mit**
  ([Renovate](./TODO.md#renovate--dependencies-siehe-adr-013)) — sobald jemand den Pre-Push-Hook
  wieder aktiviert
- **Das Lade-Prädikat lädt jeden vergangenen Einzeltermin der Familie**
  ([Calendar](./TODO.md#calendar-v1--siehe-adr-008)) — sobald eine Familie so viele vergangene
  Einzeltermine hat, dass ein Fensterwechsel spürbar langsam wird
- **Regel 3 muss bei jedem SDK-Sprung gegen `relatedPackages` abgeglichen werden**
  ([Renovate](./TODO.md#renovate--dependencies-siehe-adr-013)) — bei jedem SDK-Sprung

---

## Pflege dieser Datei

- **`TODO.md` bleibt der Backlog.** Erledigtes wird dort **gelöscht** (CLAUDE.md → „Out-of-scope
  TODOs"), nicht abgehakt. Hier verschwindet ein erledigter Eintrag ebenso, ein leerer Schritt ganz;
  die übrigen Schritte behalten ihre Nummer.
- **Neue Funde** gehen nach `TODO.md` und stehen hier höchstens als Titel im passenden Schritt. Der
  Text eines Eintrags lebt nur an einer Stelle (CLAUDE.md → „Wo was steht").
- **Keine Links auf Schritt-Anker** aus ADRs, Specs oder Plänen — sie verschwinden mit dem Schritt.
  Einzige Ausnahme ist die Überschrift von Block 10.
- **Alte Nummern.** ADRs, Specs und Pläne bis 2026-11-18 nennen Blöcke und Punkte der vorigen
  Fassung (Block 1–9, 1.3, 8.3 …). Die Schritte hier sind neu nummeriert und entsprechen ihnen nicht;
  was ein alter Block umgesetzt hat, steht im ADR, der ihn nennt.
- **Verschiebt sich die Reihenfolge**, gehört der Grund in den Schritt — diese Datei ist eine
  Begründung, keine Liste.
