# Meal-Plan-Mutationen (Block 6) — Design

**Status:** Approved (Brainstorming)
**Date:** 2026-10-21
**Auftrag:** [docs/roadmap.md](../../roadmap.md) → [Block 6 — Meal-Plan-Mutationen](../../roadmap.md#block-6--meal-plan-mutationen-der-größte-feature-unlock)
**Decision-Log:** ein ADR (043) am Branch-Ende, darin die Optimistik-Entscheidung.

## 1. Worum es geht

Im Essen-Tab lässt sich heute nichts einplanen. Rezepte kann man ansehen, aber auf keinen Tag legen. „Essen planen" auf dem Dashboard führt nur in den Essen-Tab, und dort kommt man auch nicht weiter. `features/meals/` ist rein lesend. Die Datenbank ist dagegen bereit: `meal_plan_entries` hat Policies für INSERT, UPDATE und DELETE, und `unique (family_id, date, meal_slot)` erlaubt einen Eintrag pro Familie, Tag und Mahlzeit.

Gebraucht werden zwei Wege, beide gleich wichtig:

- **Wochenplanung.** Freitags vor dem Einkauf geht man die kommende Woche durch und legt Tag für Tag Rezepte fest. Der Einstieg ist die Wochenübersicht.
- **Spontan.** Man entscheidet kurzfristig, was es gibt, und trägt es ein. Der Einstieg ist das Rezept.

## 2. Die Abläufe

1. **Leeren Tag planen.** In der Wochenübersicht (Slot-Tab „Abendessen") ist Dienstag leer. Ein Tipp auf die Zeile öffnet die Rezept-Auswahl. Sie zeigt oben, wofür man wählt („Abendessen · Di, 28.10."), darunter den bekannten Rezept-Browser mit Suche. Ein Tipp auf ein Rezept plant es ein, die Auswahl schließt sich, und die Zeile zeigt das Rezept sofort.
2. **Woche wechseln.** Über der Übersicht kann man eine Woche vor oder zurück blättern, ohne Grenze. Ist eine andere Woche als die laufende offen, führt „Diese Woche" zurück. Vergangene Wochen bleiben ansehbar und änderbar.
3. **Vom Rezept aus.** Im Rezept steht „Zum Essensplan hinzufügen". Er öffnet die Wahl von Tag und Mahlzeit, vorbelegt mit heute und der Mahlzeit, die gerade dran ist. Nach dem Einplanen bestätigt ein Toast den Eintrag, und man bleibt im Rezept.
4. **Belegter Platz.** Ist der gewählte Platz schon belegt, fragt die App: „Am Dienstag, 28.10., ist für das Abendessen schon _Spaghetti_ eingetragen. Möchtest du das ersetzen?" „Ja" ersetzt, „Nein" lässt alles, wie es war. Derselbe Dialog erscheint, wenn der Platz erst beim Schreiben belegt ist, weil jemand anderes ihn gerade gefüllt hat.
5. **Allergie-Hinweis.** Hat das gewählte Rezept das Urteil `unsafe` oder `caution` für die Familie (`judgeRecipe`, ADR-014), erscheint vor dem Einplanen ein Hinweis mit Rezept und betroffenen Allergenen, mit „Trotzdem hinzufügen" und „Abbrechen". Bei `unverified` erscheint er nicht, denn dann stünde er vor fast jedem importierten Rezept, und das Abzeichen zeigt den Zustand ohnehin. Kommen beide Fragen zusammen, kommt der Allergie-Hinweis zuerst, weil er das Rezept betrifft und nicht den Platz.
   - **Allergien der Familie unbekannt** (meine Entscheidung). `judgeWithAllergyState` liefert `unverified`, solange `useFamilyAllergies` lädt oder gescheitert ist. Das darf nicht in „kein Hinweis" münden. Solange die Allergien laden, wartet das Einplanen auf sie. Ist das Laden gescheitert, kommt statt des Allergie-Hinweises einer, der sagt, dass die Allergien nicht geprüft werden konnten, ebenfalls mit „Trotzdem hinzufügen" und „Abbrechen".
6. **Geplanten Eintrag ändern.** Ein Tipp auf eine geplante Zeile öffnet wie heute das Rezept. Das `⋯`-Menü der Zeile (mindestens 44×44, mit a11y-Label) bietet „Anderes Rezept wählen" und „Löschen".
   - „Anderes Rezept wählen" öffnet die Auswahl für denselben Platz und ersetzt ohne Ersetzen-Dialog, denn die Absicht ist klar. Der Allergie-Hinweis gilt trotzdem.
   - „Löschen" entfernt den Eintrag sofort und bietet „Rückgängig" an, wie beim Löschen von Aufgaben.
7. **Dashboard, nichts geplant.** „Essen planen" öffnet die Rezept-Auswahl für heute und die Mahlzeit, die der Hero gerade zeigt (`useTodaysMeal().slot`).
8. **Dashboard, Allergie-Treffer.** Die Hero-Karte bietet heute ein sicheres Ausweichgericht an, ihr Knopf öffnet aber nur dessen Rezept. Künftig ersetzt der Knopf das geplante Essen durch das Ausweichgericht. Ein Toast bestätigt mit „Rückgängig", denn ein versehentlicher Tipp auf dem Dashboard soll nichts kosten. Das Ausweichgericht ist per Definition sicher und braucht keinen Allergie-Hinweis.

## 3. Ziele, Nicht-Ziele, Anti-Ziele

**Ziele**

1. Planen, Ersetzen und Löschen über eine Mutationsschicht in `features/meals/`, mit sofortiger Anzeige (optimistisch).
2. Alle acht Abläufe aus Abschnitt 2, auf iOS, Android und Web.
3. Wochen blättern ohne Grenze.
4. Die Abfolge der Dialoge (Allergie, belegter Platz) ist reine, getestete Logik.

**Nicht-Ziele** — jedes hat einen Eintrag in `docs/TODO.md`:

- Portionen und Notizen pro Eintrag. Die Spalten `servings_override` und `notes` existieren, die Oberfläche kommt später. _Neuer Eintrag._
- Live-Sync des Essensplans zwischen Geräten. Änderungen eines anderen Elternteils erscheinen beim nächsten Laden, nicht sofort. Der Kalender hat das über ADR-030, `meal_plan_entries` nicht. _Neuer Eintrag._
- Einkaufsliste und „Kochen starten". _Steht schon unter „Fußzeilen-Buttons sind unverdrahtet"._
- KI-Vorschläge und der Meal-Picker aus V2/V3. _Steht schon unter „Der Meal-Picker aus V2/V3 fehlt weiterhin"._
- Mehrere Rezepte pro Platz. Das Schema verbietet es.

**Anti-Ziele** — daran wäre der Block gescheitert, auch wenn alles grün ist:

- **Fremde Änderungen werden still überschrieben.** Ersetzen und Löschen wirken nur auf den Stand, den der Nutzer gesehen hat. Hat ein anderer Elternteil den Platz inzwischen geändert, wird nichts geschrieben, und der Nutzer sieht den neuen Stand (beim Ersetzen erneut den Dialog).
- **Ein Rezept mit Familien-Allergen landet ohne Hinweis im Plan.**
- **Ein Ablauf endet auf Web stumm.** Kein `Alert.alert` außerhalb von `confirmDialog.ts` (ADR-039), Menüs und Dialoge funktionieren auf allen drei Plattformen.
- **Ein Bedienelement sieht nach Aktion aus und tut nichts**, oder es ist kleiner als 44×44. Das ist die Lehre hinter dem entfernten Kebab und dem entfernten Herz-Button.
- **Ein gescheitertes Schreiben bleibt als Erfolg stehen.** Scheitert ein Schreiben, verschwindet die optimistische Anzeige wieder, und ein Fehler-Toast sagt, was nicht geklappt hat.

## 4. Entwurf

### 4.1 Mutationsschicht

`features/meals/mutations.ts`, nach dem Vorbild von `features/tasks/mutations.ts`: ein injizierbarer Ops-Schnitt (wie `TaskOps`), reine Funktionen darüber, Hooks obendrauf.

- **Einplanen** auf einen freien Platz ist ein INSERT. Verletzt er die Eindeutigkeit, weil der Platz inzwischen belegt ist, endet er in einem eigenen Fehler, der den aktuellen Eintrag mitträgt. Daran hängt der Dialog aus Ablauf 4.
- **Ersetzen** ist ein UPDATE von `recipe_id` auf der Zeile, die der Nutzer gesehen hat. Geschrieben wird nur, wenn sie noch das gesehene Rezept trägt. Ist das nicht mehr so, endet es im selben Fehler mit dem frischen Stand. Ist die gesehene Zeile ganz verschwunden, weil ein anderer Elternteil sie gelöscht hat, ist der Platz frei: Dann wird eingeplant wie auf einen leeren Platz, ohne Dialog, denn es wird nichts Fremdes überschrieben (meine Entscheidung). Das ersetzt hier, was ADR-031 im Kalender über `updated_at` löst; `meal_plan_entries` hat keine solche Spalte, und `recipe_id` ist das einzige Feld, das sich ändert. **Keine Migration.**
- **Löschen** ist ein DELETE auf derselben Bedingung (gesehene Zeile, gesehenes Rezept). Trifft es nichts, weil ein anderer Elternteil den Eintrag inzwischen ersetzt oder schon gelöscht hat, gilt Folgendes: Ist er gelöscht, ist das Ziel erreicht. Ist er ersetzt, bleibt er stehen, und ein Toast meldet, dass sich der Eintrag inzwischen geändert hat.

**Optimistik: Cache-Patch wie bei den Aufgaben, kein Overlay wie im Kalender.** Der Kalender braucht sein Overlay-Modell (ADR-027), weil er Occurrences aus Regeln expandiert. Ein Essens-Eintrag ist eine einzelne Zeile in genau einer Wochen-Query (`mealKeys.plan(weekStart)`). `onMutate` patcht diese Woche, hält einen Snapshot und stellt ihn im Fehlerfall wieder her. `onSettled` invalidiert `mealKeys.plansRoot`. Eine optimistisch eingefügte Zeile trägt bis zur Antwort des Servers eine vorläufige ID. Ihr `⋯`-Menü ist so lange aus, weil Ersetzen und Löschen auf der echten ID arbeiten (meine Entscheidung). Damit entsteht kein drittes Occurrence-Overlay, und der geparkte TODO-Eintrag „Vereinigung der beiden Occurrence-Overlays" bleibt geparkt. Das ist der Kern von ADR-043.

**Löschen mit Rückgängig** läuft über den bestehenden Pending-Delete-Store (`features/shared/pendingDeletes.ts`, `useUndoableDelete`) mit einer neuen Art `"meal"`. Ein vorgemerkter Eintrag ist in Wochenübersicht und Hero ausgeblendet, wie es `useFamilyTasks` für Aufgaben tut. `useMealPlans` und `useTodaysMeal` filtern heute noch nicht, das kommt dazu. Plant man in den fünf Sekunden auf genau diesen Platz, wird das vorgemerkte Löschen sofort abgeschlossen und danach eingeplant. Der Platz sieht leer aus, also soll er sich auch so verhalten, und kein Ersetzen-Dialog nennt das gerade gelöschte Rezept (meine Entscheidung).

### 4.2 Die Dialog-Abfolge

Eine reine Funktion entscheidet aus Urteil (`RecipeAllergenVerdict`), Zustand der Familien-Allergien (geladen oder gescheitert; während des Ladens wird gewartet, Ablauf 5), Belegung des Ziel-Platzes und Absicht (neu einplanen oder bewusst ersetzen), welche Fragen in welcher Reihenfolge kommen (Abschnitt 2, Ablauf 4 bis 6). Gezeigt werden die Fragen über `confirmDestructive` aus `@/app-sections/shared`, auf Web also über `window.confirm`. Beide Abbrüche schreiben nichts.

### 4.3 Wochenübersicht (`EssenScreen`, `WeekPlanGrid`)

- `EssenScreen` hält die gewählte Woche als State, Startwert `weekStartFor(useToday())`. Vor und zurück verschieben ihn um sieben Tage, „Diese Woche" setzt ihn zurück. Das Wochenlabel (`meals.weekLabel`) folgt der gewählten Woche.
- Die Hervorhebung „heute" erscheint nur in der laufenden Woche, das liefert `MealPlanDay.isToday` schon.
- Eine leere Zeile wird zum Knopf (`accessibilityRole="button"`, Label nennt Mahlzeit und Tag) und öffnet die Auswahl (4.4).
- Eine geplante Zeile bleibt beim Tipp das Rezept. Das `⋯` daneben ist ein eigenes Bedienelement, nicht Teil des Zeilen-`Pressable` (siehe den Kommentar zum entfernten Kebab in `WeekPlanGrid.tsx`). Das Menü funktioniert auf allen Plattformen, so wie die Scope-Auswahl über `pickScope` (ActionSheetIOS auf iOS, ein Sheet sonst, ADR-039).

### 4.4 Rezept-Auswahl

- Neue Route nach der Routing-Konvention: `app/meal/pick.tsx` als dünner Re-Export, die Umsetzung in `app-sections/meal/`. Parameter sind Datum (`YYYY-MM-DD`), Mahlzeit und optional der zu ersetzende Eintrag (Zeile und gesehenes Rezept).
- Oben steht, wofür gewählt wird, darunter der vorhandene `RecipeBrowser` in einem Auswahlmodus: Ein Tipp wählt das Rezept, statt es zu öffnen. Suche, Urteils-Abzeichen und Reihenfolge bleiben, wie sie sind.
- Nach der Wahl laufen die Dialoge (4.2), dann wird geschrieben und die Auswahl geschlossen (`router.back()`, mit Rückfall auf den Essen-Tab bei einem Kaltstart-Deeplink wie in `TaskEditScreen`). Die Route trägt nur Datum, Mahlzeit und das Ersetzen-Ziel. Die betroffene Woche leitet die Mutation selbst aus dem Datum ab (`weekStartFor`).

### 4.5 Vom Rezept aus (`RecipeScreen`)

- „Zum Essensplan hinzufügen" kommt als eigener Knopf über die bestehende Fußzeile („Einkauf" · „Kochen starten"). Die Fußzeile aus dem Handoff bleibt unverändert. **Meine Entscheidung, Frage an den Designer.**
- Der Knopf öffnet die Wahl von Tag und Mahlzeit in einem Sheet. Das Datum kommt aus dem vorhandenen `DateTimePickerSheet` im Datumsmodus (die Web-Variante gibt es seit ADR-010), die Mahlzeit aus den vier Slots, beschriftet mit `meals.tabs.*`. Vorbelegt sind heute und `slotForTime(jetzt)`. Ändert man das Datum auf einen anderen Tag, bleibt die gewählte Mahlzeit stehen.
- Danach laufen die Dialoge (4.2), es wird geschrieben, und ein Toast bestätigt Tag und Mahlzeit.

### 4.6 Dashboard

- `MealHeroEmptyCard`: „Essen planen" öffnet die Auswahl (4.4) für heute und den aktuellen Slot statt `router.push("/essen")`.
- `MealHeroCard`: Der Ausweich-Knopf ersetzt das geplante Essen durch das Ausweichgericht (Ersetzen aus 4.1, gesehener Stand). Danach kommt ein Toast mit „Rückgängig", das das vorige Rezept zurücksetzt. Auch das Rückgängig ist ein Ersetzen auf dem gesehenen Stand: Trägt der Platz inzwischen nicht mehr das Ausweichgericht, wird nichts geschrieben, und ein Toast meldet, dass sich der Eintrag geändert hat. Ein Toast mit Aktion für etwas anderes als Löschen ist neu, `ToastAction` trägt ihn bereits. Der Knopf braucht einen neuen Text, Vorschlag „Stattdessen kochen". **Frage an den Designer.**

### 4.7 Texte

- Alle neuen Texte stehen auf Deutsch und Englisch in `features/i18n/locales/{de,en}.json`, unter `meals.*` bzw. `dash.*`, in Du-Form und im Ton der App: warm, ruhig, nicht kindlich.
- `docs/COPY.md` gehört dem Designer und bleibt unberührt. Die neuen Keys kommen in den bestehenden TODO-Eintrag „Neue i18n-Keys fehlen in `docs/COPY.md`".

### 4.8 Tests

- **Unter `bun test`:** die Mutationsschicht über den Ops-Schnitt (insbesondere belegter Platz, veralteter Stand beim Ersetzen und Löschen, Rollback) und die Dialog-Abfolge (4.2) vollständig.
- **Unter `jest` (`*.jest.tsx`, ADR-042):** mindestens ein Ablauf durch die echte Oberfläche, nämlich Einplanen auf einen belegten Platz bis zum Ersetzen. Wie viel mehr, entscheidet der Plan.

## 5. Randbedingungen

- Handoff-Bundle unberührt (`design-system/{…}.ts`, `docs/{HANDOFF,COPY,ICONS,README}.md`, `patterns/*.md`). Abweichungen vom Pattern werden als Frage an den Designer festgehalten, nicht still umgesetzt.
- Tippflächen mindestens 44×44 über die Box mit `touchTarget.min`, nicht über `hitSlop` (ADR-041).
- Kein `Alert.alert` außerhalb von `confirmDialog.ts` (ADR-039).
- Voice-FAB bleibt auf den Tabs erreichbar. Die neue Auswahl-Route liegt wie die Rezept-Route über den Tabs.
- Keine Migration. Wird doch eine nötig, kommt sie mit RLS-Policies und regenerierten Typen (`features/supabase/database.types.ts`).
- Gates wie immer: `bun test`, `bun run test:rn`, typecheck, lint, format:check, Web-Export.

## 6. Fragen an den Designer

Sie blockieren den Block nicht. Gebaut wird nach dem Vorschlag, die Fragen kommen in `docs/TODO.md`.

1. Das `⋯`-Menü der geplanten Zeile: Reichen „Anderes Rezept wählen" und „Löschen"? (Das Pattern zeigt das Kebab, nennt aber keine Aktionen.)
2. Text des Tausch-Knopfs im Hero, Vorschlag „Stattdessen kochen".
3. Wochen blättern in V1: Das Pattern führt die Wochenleiste erst unter V2. Für die Freitags-Planung ist sie Pflicht. Gebaut wird schlichtes Vor und Zurück mit „Diese Woche".
4. Platz von „Zum Essensplan hinzufügen" im Rezept-Modal, über der Fußzeile aus dem Handoff.
5. Die neuen Copy-Keys gegenlesen und in `docs/COPY.md` nachtragen.

## 7. Dem Bauenden überlassen

- Form des Ops-Schnitts und der Fehlerklasse für den belegten Platz.
- Ob die Auswahl ein eigener Screen oder ein Sheet über der Route ist, solange sie über eine Route erreichbar ist und Zurück funktioniert.
- Gestaltung der Wochen-Navigation im Rahmen der vorhandenen Bausteine (`TopBar`, `Icon`, `Button`).
- Wie das Menü der Zeile technisch umgesetzt wird, solange es auf iOS, Android und Web funktioniert.
- Genaue Copy-Formulierungen innerhalb der Vorgaben aus 4.7.
