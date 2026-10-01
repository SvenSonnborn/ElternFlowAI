# Web-Parität, PR B: drei Web-Eigenheiten — Design

**Status:** Approved (Brainstorming)
**Date:** 2026-10-01
**Auftrag:** [docs/roadmap.md](../../roadmap.md) → [Block 3 — Web-Parität](../../roadmap.md#block-3--web-parität), zweiter von zwei PRs. Die Roadmap verlangt für alle drei Punkte zuerst eine Diagnose; dieses Dokument hält ihr Ergebnis und die daraus folgenden Fixes fest.
**Decision-Log:** ein ADR (040) am Branch-Ende.

## 1. Befund

Alle Messungen im Web-Build (`bun run web`) mit Python-Playwright, Chromium.

### 1.1 Agenda-Klick — kein Fehler in der App

Inaktive Tabs bleiben im DOM: ihre Szene liegt mit `z-index: -1` hinter der aktiven und trägt
`aria-hidden="true"`. Dashboard und Kalender-Agenda vergeben für dieselbe Occurrence dasselbe
`aria-label` (`cal.a11y.event`). Der Zwei-Client-Lauf griff per CSS-Locator und `.first` die
verdeckte Dashboard-Zeile; ein Klick auf deren Koordinaten trifft, was darüber liegt — einen
Kalendertag. Ein echter Mausklick auf die Agenda-Zeile navigiert korrekt (gemessen mit einem
Wegwerf-Termin); Screenreader sehen die verdeckte Szene nicht.

**Nebenbefund:** Die Tab-Taste führt den Fokus in die verdeckte Szene — sie ist `aria-hidden`,
aber nicht `inert`. Echtes Tastatur-a11y-Problem, eigener Gegenstand (Roadmap Block 4).

### 1.2 Datums-/Zeit-Input springt zurück

Ziffernweises Tippen verhält sich exakt wie ein unkontrollierter Chrome-Input (Vergleich in
`de-DE` und `en-US`, Werte nach jedem Tastendruck identisch). Zurück springt das Feld nur, wenn
der Browser `""` meldet:

- **Backspace/Entf auf einem Segment** — das Segment springt sofort zurück.
- **Ungültige Kombination** (29.02. im Nicht-Schaltjahr, 31.04.) — React setzt das Feld auf den
  letzten gültigen Wert. Das ist eine Sackgasse: Von 15.10.2026 aus ist 29.02.2028 in
  Feldreihenfolge nicht erreichbar, beim Monat springt das Feld auf 29.10.2026 zurück.

Ursache: `DateTimePickerSheet.web.tsx` führt das Input kontrolliert mit `value` aus dem
Aufrufer; ein unparsbarer Rohwert ruft kein `onPick`, React stellt den alten Wert wieder her.

### 1.3 Render-Schleife beim Login-Übergang

Reproduziert, indem ein frischer Kontext auf `/login` startet und die Sitzung per
`supabase.auth.setSession` erhält. Stack wie im TODO: `useSyncState.flushUpdates` (expo-routers
mitgelieferte React-Navigation) schreibt in einem Layout-Effekt bei jedem Render erneut
Navigator-State.

Ursache: `AuthGate` rendert im Root-Layout bei Splash und Redirect **statt** des `<Stack>`.
Expo-Router verlangt, dass der Root-Navigator gemountet bleibt; nur verschachtelte Layouts dürfen
ihn aufschieben. Experimente, je zwei Läufe:

| Variante                                         | Ergebnis                        |
| ------------------------------------------------ | ------------------------------- |
| Original                                         | Schleife                        |
| ohne Splash, `<Redirect>` ersetzt den Stack      | Schleife, bleibt auf `/login`   |
| `<Redirect>` neben dem Stack, Splash ersetzt ihn | sauber, URL-Umweg über `/login` |
| Stack bleibt durchgehend gemountet               | sauber                          |

Auslöser der Schleife ist ein `<Redirect>`, der einen bereits gemounteten Root-Navigator
ersetzt; der Splash-Unmount verursacht den Umweg. Beim **Kaltstart** dagegen muss das Ersetzen
bleiben: ein von Anfang an gemounteter Stack rendert ohne Sitzung die geschützten Screens, die
dann anonym `events`, `tasks` und `meal_plan_entries` abfragen (gemessen).

## 2. Entscheidungen

1. **Agenda: keine Code-Änderung.** Der TODO-Eintrag entfällt. Der Fokus-Nebenbefund wird ein
   neuer TODO-Eintrag in Block 4.
2. **`AuthGate` hängt den Navigator nach dem ersten Mount nie wieder aus.** Danach steht ein
   `<Redirect>` neben den Kindern, und Warten (Session lädt, Parent lädt) oder ein anstehender
   Redirect zeigen den Splash als deckende Fläche über ihnen statt an ihrer Stelle. Bis zum ersten
   Mount bleibt das heutige Ersetzen (Kaltstart).
3. **Die Entscheidung, was der Gate rendert, ist eine reine Funktion** neben `decideRoute`
   (`features/auth/gateLayout.ts`), damit die Regel „einmal gemountet, nie mehr ausgehängt"
   unter `bun test` festgehalten ist. `AuthGate` wird zum dünnen Renderer.
4. **Datums-Input hält den getippten Zwischenstand.** Meldet der Browser einen unparsbaren
   Rohwert, zeigt das Input diesen Rohwert (lokaler Entwurf) statt des letzten gültigen Werts.
   Gültige Werte gehen weiter sofort über `onPick` hinaus — der Vertrag aus ADR-039 (Scrim
   schließt ohne Übernahme, nimmt aber nichts zurück; „Fertig" übernimmt den angezeigten Wert)
   bleibt auf allen Plattformen gleich. „Fertig" bei unvollständigem Entwurf übernimmt den letzten
   gültigen Wert. Der Entwurf lebt nur, solange das Sheet offen ist.
   Verworfen: das Input unkontrolliert führen und erst bei „Fertig" übernehmen (Vorschlag im
   TODO) — dann verwürfe der Scrim auf Web die Eingabe, auf iOS nicht.
5. **Der Übergang vom Rohwert zu Entwurf und Übernahme ist eine reine Funktion** in
   `webPickerValue.ts`, neben `parseWebPickerValue`; die Web-Komponente lädt nativewind und ist
   unter `bun test` nicht importierbar.

## 3. Umfang

| Datei                                             | Änderung                                                        |
| ------------------------------------------------- | --------------------------------------------------------------- |
| `features/auth/gateLayout.ts` (+ Test)            | neu: reine Render-Entscheidung des Gates                        |
| `features/auth/AuthGate.tsx`                      | rendert nach `gateLayout`, merkt sich den ersten Mount          |
| `app/_layout.tsx`                                 | Kommentar zu `useFamilyRealtime` an das neue Verhalten anpassen |
| `app-sections/shared/webPickerValue.ts` (+ Test)  | neu: `webPickerChange` (Rohwert → Übernahme oder Entwurf)       |
| `app-sections/shared/DateTimePickerSheet.web.tsx` | Entwurf halten; innerer Teil lebt nur bei offenem Sheet         |

Doku am Branch-Ende: ADR-040, `docs/TODO.md` (drei Einträge raus, Fokus-Eintrag rein),
`docs/roadmap.md` (Block 3 erledigt, Block 4 um den Fokus-Eintrag ergänzt),
`docs/architecture.md` (Satz zum Gate bei Redirects).

## 4. Prüfung

- `bun test`: `gateLayout` (Kaltstart ersetzt, nach Mount immer Kinder, Deckfläche bei Warten
  und Redirect), `webPickerChange` (gültig → Übernahme ohne Entwurf, geklemmt → Übernahme,
  `""` und Teilwerte → Entwurf).
- Web-Sichtlauf: Login-Übergang, Kaltstart ohne Sitzung (keine Supabase-Anfragen), Kaltstart
  mit Sitzung auf `/login`, Abmelden aus dem Settings-Sheet (lokal, ohne Server-`signOut`) —
  jeweils Konsole sauber. Datums-Input in `de-DE`: Backspace bleibt leer, 29.02.2028 von einem
  Oktober-2026-Datum aus erreichbar, Zeit-Input analog.
- Nativ: `AuthGate` gilt auch auf iOS/Android; der Login-Übergang dort braucht einen Sichtlauf
  durch den Nutzer (Anmeldung im Simulator/Emulator). Ohne ihn steht im PR „nicht geprüft".
