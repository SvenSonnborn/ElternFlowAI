# Allergen-Filter für Rezepte — Design

**Status:** Approved (Brainstorming Phase)
**Date:** 2026-08-14
**Decision-Log:** wird als ADR-014 referenziert nach Implementation

---

## 1. Context

Rezepte, die eine Allergie eines Familienmitglieds enthalten, sollen ausgegraut und sichtbar gekennzeichnet werden. `patterns/meals.md` formuliert die Regel absolut: _"Never propose a meal containing an active allergy for any family member."_

Der Meal-Daten-Layer existiert seit [2026-08-13-meals-data-layer](./2026-08-13-meals-data-layer-design.md), hat aber **null Aufrufer** — der Essen-Tab rendert noch `weeklyMeals` aus den Sample-Daten. `features/meals/queries.ts` kennt einen `excludeAllergens`-Parameter, den niemand befüllt.

Die ursprüngliche Aufgabenstellung ging von drei Annahmen aus, die alle nicht zutreffen:

| Annahme                                      | Realität                                                                                                                                                          |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `families.allergies` existiert               | `families` hat nur `id`, `name`, `settings`, Timestamps. Allergien liegen auf `children.allergies` **und** `parents.allergies` (beide `text[]`).                  |
| `useCurrentFamily` existiert                 | Vorhanden sind `useCurrentParent()` (liefert `family_id`), `useFamily`, `useFamilyChildren`, `useFamilyParents`.                                                  |
| `contains_allergens` muss nur geparst werden | Die Spalte ist `text[]` mit `default '{}'`, und **niemand befüllt sie**. Die im Migrations-Kommentar beschriebene Klassifizierungs-Edge-Function existiert nicht. |

Die dritte ist die folgenreiche. Die reale Kette ist vierstufig:

```
Zutat "Weizenmehl" / "wheat flour"
  → [1. Klassifizierer]  → contains_allergens: {wheat}
  → [2. Mapping]         → AllergenKey: gluten
  → [3. Vergleich]       → Treffer
  → [4. Kennzeichnung]
```

Schritt 1 fehlt. Ein Filter, der nur 2–4 baut, gäbe für jedes importierte Rezept `safe` zurück — ein stiller False Negative bei einem Gesundheitsfeature. `docs/TODO.md` benennt das Vokabular-Problem bereits, aber eine Ebene zu hoch: dort steht `eggs ≠ egg`, das eigentliche Problem ist, dass auf der Rezept-Seite überhaupt nichts steht.

### Zielbild

Eine Familie hinterlegt Allergien pro Kind und Elternteil aus einem geschlossenen Vokabular. Der Rezept-Browser im Essen-Tab zeigt jedes Rezept mit einem belastbaren Allergen-Urteil: sicher, enthält (deklariert), möglicherweise (aus Zutaten erschlossen), oder ungeprüft. Das Regelwerk, das dieses Urteil bildet, ist ein reines TypeScript-Modul ohne React- und ohne Supabase-Abhängigkeit, damit der spätere gustar.io-Import-Worker exakt dasselbe Modul verwendet.

### Was explizit nicht abgedeckt ist

- **Wochenplan-Rewire** — der Essen-Tab hängt weiter an `weeklyMeals`; die Umstellung auf `useMealPlans` bleibt die eigene Iteration aus `docs/TODO.md`.
- **Meal-Mutationen** — Mahlzeit setzen/tauschen/löschen.
- **`intolerances`** — die Spalte existiert auf `children` und `parents`, wird hier aber nicht gelesen. Unverträglichkeiten sind medizinisch etwas anderes als Allergien (siehe Decision 7) und brauchen ein eigenes Urteilsmodell.
- **Freitext-Allergene ("+ Andere")** — bewusst verworfen, siehe Decision 2.
- **LLM-Klassifizierung beim Import** — die Edge Function bleibt eine eigene Spec; dieses Design liefert ihr das Vokabular und den Testrahmen.
- **KI-Vorschlagslogik** — der Meal-Picker, der `patterns/meals.md` V2/V3 bedient. Er wird `isRecipeSafeForFamily` mitbenutzen, statt die Regel zu duplizieren.

---

## 2. Decisions Summary

| #   | Thema         | Entscheidung                                                              | Verworfene Alternative                                            |
| --- | ------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1   | Urteilsmodell | Vier Zustände: `safe` / `unsafe` / `caution` / `unverified`               | Boolean `safe`/`unsafe`, bei dem fehlende Daten als sicher gelten |
| 2   | Vokabular     | EU-14 Pflichtallergene, geschlossen, kein Freitext                        | Bei sechs Keys bleiben; EU-14 plus Freitext-Feld                  |
| 3   | Ort der Logik | Reines TS-Modul `features/meals/allergens/`, importierbar aus Deno        | Postgres-Funktion; LLM-Klassifizierung als einzige Quelle         |
| 4   | Zweite Quelle | Zutaten-Heuristik über DE/EN-Begriffslisten                               | Nur `contains_allergens` vertrauen                                |
| 5   | Matching      | Substring als Default, `word`-Modus für kurze Terme, Negativlisten je Key | Einheitliches Substring- oder Wortgrenzen-Matching                |
| 6   | Negation      | Guard pro Term-Vorkommen, nicht pro Key                                   | Guard pro Key (verwirft zu viel)                                  |
| 7   | Laktose       | `laktosefrei` hebt `milk` **nicht** auf                                   | Generischer `frei`-Guard ohne Ausnahme                            |
| 8   | Filterort     | Client-seitig, `excludeAllergens` bleibt ungenutzt                        | Serverseitig via `not(…, "ov", …)`                                |
| 9   | Picker        | Beide ausgelieferten Picker auf 14 Keys erweitern                         | Nur Daten-Layer; aufklappbare Gruppierung                         |
| 10  | Seeds         | Migration mit klassifizierten Beispielrezepten                            | Auf den gustar.io-Worker warten                                   |

---

## 3. Architecture

### 3.1 Ort der Logik (Decision 3)

Drei Kandidaten standen zur Wahl:

- **Postgres-Funktion + generated column.** Indexierbar und ein einziger Ort. Verworfen: Begriffslisten in SQL zu pflegen ist zäh, die Zutaten liegen als `jsonb`, und die Regeln wären im `bun test`-Runner nicht prüfbar — bei einem Sicherheitsfeature das entscheidende Gegenargument.
- **LLM-Klassifizierung beim Import.** Semantisch am stärksten; erkennt "Ceviche enthält Fisch" ohne jede Liste. Verworfen als _alleinige_ Quelle: nicht deterministisch, also nicht testbar, kostet pro Rezept, und der LLM-Provider ist laut `CLAUDE.md` noch nicht gewählt.
- **Reines TypeScript-Modul.** Gewählt.

Das Modul unter `features/meals/allergens/` importiert **weder React noch Supabase** — nur Typen. Damit kann die spätere Edge Function (Deno) exakt dieselbe Datei importieren und `contains_allergens` beim Import befüllen. Ein Vokabular, ein Regelwerk, ein Testsatz.

Das LLM ist dann kein Ersatz, sondern eine zusätzliche Quelle: es füllt den `declared`-Kanal, das deterministische Regelwerk bleibt als Gegenprobe und als Sicherheitsnetz für alles, was es nicht erwischt hat.

### 3.2 Datenfluss

```
children.allergies[] ─┐
                      ├─ useFamilyAllergies() → AllergenKey[]
parents.allergies[]  ─┘                              │
                                                     ▼
recipes.contains_allergens[] ──→ declaredHits ──┐
                                                 ├─→ judgeRecipe() → RecipeAllergenVerdict
recipes.ingredients[].name{de,en} ─→ scanIngredients() ─┘              │
                                                                       ▼
                                                        RecipeRow-Zeile: Opazität + Badge
```

### 3.3 Dateien

```
features/meals/allergens/
├─ keys.ts        AllergenKey (EU-14) + ALLERGEN_KEYS
├─ fold.ts        fold() — Sprach-Normalisierung
├─ terms.ts       ALLERGEN_SPECS — Deklarations-Codes, DE/EN-Terme, Negativlisten
├─ classify.ts    scanIngredients() — Zutaten → Treffer
├─ judge.ts       judgeRecipe() · isRecipeSafeForFamily() · matchedAllergens()
├─ index.ts       Barrel
└─ *.test.ts      pro Modul

features/meals/useFamilyAllergies.ts

app-sections/(tabs)/essen/
├─ RecipeBrowser.tsx
└─ AllergenBadge.tsx

supabase/migrations/<ts>_seed_recipes.sql
```

`features/children/allergies.ts` wird zur Re-Export-Schicht: `AllergyKey` bleibt als deprecated Alias auf `AllergenKey` bestehen, damit die beiden Picker und die bestehenden Imports nicht in derselben Iteration umgeschrieben werden müssen.

---

## 4. Vokabular (Decision 2)

Die 14 Pflichtallergene nach Anhang II der EU-Verordnung 1169/2011. Die sechs bestehenden Keys sind eine echte Teilmenge und behalten ihre exakte Schreibweise — **kein Datenmigrations-Fall**, im Gegensatz zum Backfill von 2026-06-04.

| Key           | Bestand | DE-Label   | EN-Label    |
| ------------- | ------- | ---------- | ----------- |
| `gluten`      | ✓       | Gluten     | Gluten      |
| `crustaceans` | neu     | Krebstiere | Crustaceans |
| `eggs`        | ✓       | Eier       | Eggs        |
| `fish`        | neu     | Fisch      | Fish        |
| `peanuts`     | ✓       | Erdnüsse   | Peanuts     |
| `soy`         | ✓       | Soja       | Soy         |
| `milk`        | ✓       | Milch      | Milk        |
| `nuts`        | ✓       | Nüsse      | Nuts        |
| `celery`      | neu     | Sellerie   | Celery      |
| `mustard`     | neu     | Senf       | Mustard     |
| `sesame`      | neu     | Sesam      | Sesame      |
| `sulphites`   | neu     | Sulfite    | Sulphites   |
| `lupin`       | neu     | Lupinen    | Lupin       |
| `molluscs`    | neu     | Weichtiere | Molluscs    |

Freitext wurde verworfen, weil er genau dort ansetzt, wo das Matching still scheitert: ein getipptes "Nüsse aller Art" findet keine Regel, und ein nicht gefundener Treffer ist ein False Negative. Das geschlossene Vokabular ist der Grund, warum das Regelwerk überhaupt vollständig testbar ist. Der Preis: Exoten (Fructose, Histamin, Nickel) bleiben unabbildbar — vermerkt in `docs/TODO.md`.

---

## 5. Algorithmus

### 5.1 Normalisierung — `fold()` (Decision 5)

```
fold(s):
  1. toLowerCase()
  2. ä→ae · ö→oe · ü→ue · ß→ss
  3. NFD-Normalisierung, Combining Marks strippen   (é→e, für FR/IT-Lehnwörter)
  4. [^a-z0-9]+ → " "
  5. trim, Mehrfach-Spaces kollabieren
```

**Die Reihenfolge von 2 und 3 ist die Pointe.** Umgekehrt würde "Nüsse" über NFD zu `nusse` statt `nuesse` — und wer "Nuesse" tippt, träfe nicht mehr. Deutsche Umlautfaltung ist `ae/oe/ue`, nicht das Strippen des Diakritikums.

Begriffslisten werden **lesbar** gepflegt ("Haselnuss", "hazelnut") und beim Modul-Load durch dieselbe `fold()`-Funktion gezogen. Eine Definition, nicht zwei.

### 5.2 Matching-Modi (Decision 5)

Deutsch schreibt Komposita zusammen, also ist **Substring der Default**: `weizen` trifft "Vollkornweizenmehl", `haselnuss` trifft "Haselnusskerne".

Pauschales Substring-Matching ist aber gefährlich. Der Beweis:

| Term     | Falsch getroffen                           | Folge                                                                                          |
| -------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `ei`     | **Reis**, **Weizen**                       | Ein Reisgericht wäre für ein eiallergisches Kind rot markiert                                  |
| `weizen` | **Buchweizen**                             | Buchweizen ist glutenfrei — das Rezept für ein Zöliakie-Kind wäre fälschlich gesperrt          |
| `wein`   | **Schweinefleisch**                        | Jedes Schweinegericht meldete Sulfite                                                          |
| `mehl`   | **Mandelmehl**, **Reismehl**, **Maismehl** | Fast jedes Rezept meldete Gluten — die Kennzeichnung würde bedeutungslos                       |
| `nuss`   | **Kokosnuss**, **Muskatnuss**              | Beide sind botanisch keine Schalenfrüchte und in der EU-Kennzeichnung nicht als solche geführt |
| `nuss`   | **Erdnuss**                                | Vermischt zwei getrennte Keys                                                                  |

Deshalb trägt jeder Term einen Modus:

```ts
type MatchMode = "substring" | "word"; // default: "substring"

interface Term {
  text: string;
  mode?: MatchMode;
}

interface AllergenSpec {
  key: AllergenKey;
  declaredCodes: readonly string[]; // akzeptiert in contains_allergens
  terms: readonly Term[]; // Zutaten-Heuristik
  exclude: readonly string[]; // verwerfen, wenn einer davon das Vorkommen umschließt
}
```

Als Faustregel folgt der Modus der Sprache: **deutsche Terme laufen Substring** (Komposita werden zusammengeschrieben — `nuss` muss "Nussmischung" und "Haselnusskerne" finden, `hafer` muss "Haferflocken" finden), **kurze englische Terme laufen `word`** (dort trennt das Leerzeichen ohnehin, und `nut` als Substring träfe "nutmeg", "coconut", "nutrition"). Einzige deutsche Ausnahme ist `ei` — zwei Buchstaben gehen in zu vielen Wörtern auf.

Häufige Komposita stehen zusätzlich explizit in der Liste (`eigelb`, `eiweiss`, `eiernudeln`), weil `word` sie sonst verfehlt.

### 5.3 Negation (Decisions 6 + 7)

Nach einem Termtreffer wird der umgebende Text geprüft:

- **Suffix** unmittelbar nach dem Treffer: `frei`, `free`, `los`, `ersatz`, `alternative`
- **Präfix** unmittelbar davor: `ohne`, `without`, `vegan`, `veganer`, `vegane`, `pflanzlich`

**Der Guard wirkt pro Vorkommen, nicht pro Key.** Ein Key trifft, sobald **mindestens ein nicht-negiertes Vorkommen** übrig bleibt. Das löst den Laktose-Fall ohne Sonderregel:

| Zutat                   | `laktose` | `milch`              | Ergebnis    | Korrekt?                           |
| ----------------------- | --------- | -------------------- | ----------- | ---------------------------------- |
| "laktosefreie Milch"    | negiert   | **trifft**           | `milk`      | ✓ Kasein ist unverändert enthalten |
| "milchfreie Schokolade" | —         | negiert              | kein `milk` | ✓                                  |
| "laktosefreier Joghurt" | negiert   | `joghurt` **trifft** | `milk`      | ✓                                  |

Das ist die Stelle, an der ein naiver Guard aus einer Sicherheits- eine Gesundheitslücke macht: laktosefrei heißt gespaltener Milchzucker, nicht entferntes Milcheiweiß. Ein milchallergisches Kind kann das nicht essen, ein laktoseintolerantes schon. Das Schema trennt beides bereits in `allergies` und `intolerances`; der Guard muss diese Trennung respektieren.

Die Negation hebt außerdem nur den **getroffenen** Key auf: veganer Käse aus Cashews bleibt ein `nuts`-Treffer.

### 5.4 Negativlisten je Key

`exclude` verwirft ein Vorkommen, wenn es Teil eines gelisteten Begriffs ist:

| Key         | exclude                                                                                                                                                                                 | Grund                                              |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `nuts`      | `erdnuss`, `peanut`, `kokosnuss`, `coconut`, `muskatnuss`, `muskat`, `nutmeg`, `nutrition`                                                                                              | Keine Schalenfrüchte im Sinne der EU-Kennzeichnung |
| `gluten`    | `buchweizen`, `buckwheat`, `reisnudeln`, `glasnudeln`, `rice noodle`, `mandelmehl`, `reismehl`, `maismehl`, `kokosmehl`, `kichererbsenmehl`, `almond flour`, `rice flour`, `corn flour` | Glutenfreie Mehle, Pseudogetreide und Reisnudeln   |
| `milk`      | `hafermilch`, `sojamilch`, `mandelmilch`, `reismilch`, `kokosmilch`, `oat milk`, `soy milk`, `almond milk`, `rice milk`, `coconut milk`                                                 | Pflanzendrinks enthalten kein Milcheiweiß          |
| `sulphites` | `schwein`                                                                                                                                                                               | "Schweinefleisch" enthält den Term `wein`          |

Buchweizen ist der lehrreichste Eintrag: er enthält `weizen` als Substring, ist aber ein Pseudogetreide und **glutenfrei**. Ohne diesen Ausschluss würde die App einem Zöliakie-Kind ausgerechnet die Rezepte sperren, die für es gemacht sind — ein False Positive, der das Feature aktiv schädlich macht statt nur lästig.

Die Pflanzendrink-Ausschlüsse zeigen das Modell von seiner richtigen Seite: "Mandelmilch" verliert den `milk`-Treffer, behält aber den `nuts`-Treffer über `mandel`. "Sojamilch" verliert `milk`, behält `soy`.

### 5.5 Begriffslisten (Startkorpus)

Nicht vollständig, sondern der Stand, gegen den die Tests laufen. Erweiterung ist erwartet und billig — die Tests sind der Schutz.

| Key           | DE                                                                                                                                 | EN                                                                                     |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `gluten`      | weizen, dinkel, roggen, gerste, hafer, grieß, bulgur, couscous, seitan, paniermehl, vollkorn, nudeln, spaghetti, pasta, brot       | wheat, barley, rye, spelt, oats, semolina, breadcrumb, pasta, noodle, bread            |
| `crustaceans` | garnele, krabbe, hummer, krebs, scampi                                                                                             | shrimp, prawn, lobster, crab, crayfish                                                 |
| `eggs`        | `ei`(word), `eier`(word), eigelb, eiweiss, eiernudeln, mayonnaise                                                                  | egg, yolk, albumen, mayonnaise                                                         |
| `fish`        | fisch, lachs, thunfisch, kabeljau, hering, sardelle, anchovi, worcester, dashi, bonito                                             | fish, salmon, tuna, cod, herring, anchovy, worcestershire, dashi, bonito               |
| `peanuts`     | erdnuss, erdnuesse                                                                                                                 | peanut, groundnut, arachis                                                             |
| `soy`         | soja, tofu, edamame, miso, tempeh                                                                                                  | soy, soya, soybean, tofu, edamame                                                      |
| `milk`        | milch, butter, sahne, quark, joghurt, kaese, parmesan, mozzarella, frischkaese, schmand, mascarpone, ricotta, molke, laktose, ghee | milk, cream, cheese, yogurt, whey, butter, lactose                                     |
| `nuts`        | haselnuss, walnuss, mandel, cashew, pistazie, pekan, macadamia, paranuss, nuss                                                     | hazelnut, walnut, almond, cashew, pistachio, pecan, macadamia, brazil nut, `nut`(word) |
| `celery`      | sellerie                                                                                                                           | celery, celeriac                                                                       |
| `mustard`     | senf, dijon                                                                                                                        | mustard                                                                                |
| `sesame`      | sesam, tahin, hummus                                                                                                               | sesame, tahini, hummus                                                                 |
| `sulphites`   | sulfit, schwefeldioxid, trockenfruechte, wein                                                                                      | sulphite, sulfite, sulphur dioxide, `wine`(word)                                       |
| `lupin`       | lupine, lupinenmehl                                                                                                                | lupin, lupine                                                                          |
| `molluscs`    | muschel, tintenfisch, calamari, auster, jakobsmuschel                                                                              | mussel, squid, octopus, oyster, clam, scallop                                          |

`hummus` und `wein` sind bewusst heuristisch: Hummus enthält üblicherweise Tahin, Wein fast immer Sulfite. Beide landen im `caution`-Kanal, nie in `unsafe` — genau dafür ist die Trennung da.

Gescannt werden **beide** Sprachvarianten von `Ingredient.name` (`{de, en?}`), damit ein Rezept mit englischen Zutaten aus dem Crawler ebenso erfasst wird wie ein deutsches.

### 5.6 Urteil — `judgeRecipe()` (Decision 1)

```ts
type AllergenSource = "declared" | "ingredient";

interface AllergenHit {
  key: AllergenKey;
  source: AllergenSource;
  evidence: string; // der auslösende Code bzw. Zutatenname — für a11y und Debugging
}

type RecipeAllergenVerdict =
  | { status: "safe" }
  | { status: "unsafe"; hits: AllergenHit[] } // mind. ein declared-Treffer
  | { status: "caution"; hits: AllergenHit[] } // nur ingredient-Treffer
  | { status: "unverified" }; // keine Deklaration, nichts gefunden
```

Entscheidungsreihenfolge:

1. Familie hat keine Allergien → `safe`. Kein Rauschen für Familien ohne Allergien; ohne diese Regel bekäme jede Familie ohne Eintrag überall `unverified`.
2. Mindestens ein `declared`-Treffer → `unsafe`.
3. Mindestens ein `ingredient`-Treffer → `caution`.
4. Kein Treffer, `contains_allergens` **nicht leer** → `safe`.
5. Kein Treffer, `contains_allergens` leer → `unverified`.

**Regel 5 ist der Kern.** Eine leere Deklaration wird nie zu Grün: die Heuristik kann Anwesenheit belegen, niemals Abwesenheit. Solange kein klassifizierter Rezept-Pool existiert, ist die Liste dadurch laut — das ist der bewusst gewählte, ehrliche Preis.

`isRecipeSafeForFamily(recipe, keys)` ist der schmale Boolean-Wrapper (`status === "safe"`) für Aufrufer, die kein differenziertes Urteil brauchen — etwa die spätere KI-Vorschlagslogik. `matchedAllergens(recipe, keys)` liefert nur die Keys, für die Badge-Beschriftung.

Die Rückgabe erfolgt als `AllergenKey`, nicht als Rezept-Code: lokalisierte Labels existieren nur für die Keys (`onb.s4.allergies.*`), ein rohes `wheat` hätte keinen Katalog-Eintrag.

**Grundregel über allem:** im Zweifel melden. Ein False Positive kostet einen überflüssigen Hinweis, ein False Negative kostet mehr.

---

## 6. Familien-Allergien

```ts
function useFamilyAllergies(): {
  keys: AllergenKey[];
  isLoading: boolean;
  error: unknown;
};
```

`useCurrentParent()` → `family_id`, dann `useFamilyChildren` + `useFamilyParents`, Vereinigung beider `allergies`-Arrays, normalisiert und sortiert.

Kein `useCurrentFamily`: `useCurrentParent` liefert die `family_id` bereits, und ein zusätzlicher Hook hätte keinen zweiten Aufrufer. Die Aggregation über Kinder **und** Eltern folgt `patterns/meals.md` — "any family member" schließt Eltern ein, und `parents.allergies` existiert im Schema.

Der Hook liegt unter `features/meals/`, weil Meals der einzige Verbraucher ist; er zieht um, sobald ein zweiter dazukommt.

---

## 7. UI

### 7.1 RecipeBrowser

Neuer Abschnitt **unterhalb** des bestehenden Wochenplans im `EssenScreen`. Der Sample-Daten-Wochenplan bleibt unangetastet.

Suchfeld → `useRecipes({ search })`. Pro Zeile: Titel via `localize()`, Dauer, Allergen-Badge.

**Kein `excludeAllergens` an die Query (Decision 8).** Serverseitiges Filtern würde die Zeilen entfernen, statt sie auszugrauen — der Nutzer könnte "existiert nicht" nicht von "wurde gefiltert" unterscheiden. Das Urteil fällt clientseitig, memoisiert über `useMemo` pro Rezeptliste. Nebeneffekt: die nicht-indexierbare `not(…, "ov", …)`-Bedingung entfällt.

### 7.2 Darstellung

| Status       | Zeile        | Badge                                                    |
| ------------ | ------------ | -------------------------------------------------------- |
| `safe`       | normal       | keins                                                    |
| `unsafe`     | `opacity-50` | `bg-danger-soft` / `text-danger` — "enthält Ei"          |
| `caution`    | `opacity-50` | `bg-warning-soft` / `text-warning` — "möglicherweise Ei" |
| `unverified` | normal       | `bg-bg-raised` / `text-ink-tertiary` — "nicht geprüft"   |

Bei mehreren Treffern listet das Badge bis zu zwei Labels und hängt "+N" an.

### 7.3 Badge-Ton

`app-sections/shared/Pill.tsx` führt bereits alle drei benötigten Töne: `danger` (`bg-danger-soft`/`text-danger`), `warn` und `ink`. `AllergenBadge` ist deshalb ein dünner Wrapper um `Pill`, der nur Verdict → Ton + lokalisiertes Label + "+N"-Kürzung abbildet — keine eigene Ton-Komposition.

Die SPEC-Datei `design-system/components.ts` kennt in `pill.tones` keinen `danger`-Eintrag, aber das ist der Handoff-Katalog, nicht die Implementierung; die React-Komponente ist Claude-eigen und vollständig. Kein Designer-Follow-up nötig.

### 7.4 Picker (Decision 9)

`Step4FirstChild` und `ChildProfileScreen` rendern beide `ALLERGY_KEYS` als Chip-Reihe. Beide werden auf die 14 Keys erweitert. Die Chip-Reihe wird dadurch sichtbar dichter — das ist die Änderung, die der Designer nachziehen soll; `patterns/onboarding.md` und `patterns/child-profile.md` beschreiben den bisherigen Umfang.

`ChildProfileScreen:348` rendert bereits Nicht-Key-Werte roh durch — das bleibt als Schutz für Altdaten bestehen.

### 7.5 i18n

Neue Keys in `de.json` + `en.json`:

- `onb.s4.allergies.{crustaceans,fish,celery,mustard,sesame,sulphites,lupin,molluscs}` — 8 × 2 Sprachen
- `meals.browse.{title,search,empty,loadError}`
- `meals.allergen.{contains,maybe,unverified,more}` — z. B. `"enthält {{list}}"`, `"möglicherweise {{list}}"`, `"nicht geprüft"`, `"+{{n}}"`
- `meals.a11y.{unsafeRecipe,cautionRecipe,unverifiedRecipe}`

`docs/COPY.md` ist Designer-Eigentum und wird nicht editiert — die neuen Keys gehen als Nachtrag-Eintrag in `docs/TODO.md`, wie bei `set.footer` und den Kalender-Keys.

---

## 8. Seeds (Decision 10)

Migration mit ~10 globalen Rezepten (`created_by_family_id = null`), realistischen Zutaten in DE+EN und **korrekt befülltem** `contains_allergens`. Ohne sie ist die Liste leer und nichts von alledem ist am laufenden Gerät prüfbar.

`recipe_dedup_hash` ist `not null unique` — die Seeds setzen ein stabiles `'seed-' || slug` statt eines berechneten Hashes; das ist ehrlicher als ein Pseudo-Hash und kollidiert nicht mit echten Importen. `on conflict (recipe_dedup_hash) do nothing` macht die Migration wiederholbar.

Die Auswahl deckt bewusst alle vier Urteilszustände ab, inklusive mindestens eines Rezepts mit leerem `contains_allergens` für den `unverified`-Pfad und eines mit heuristisch erkennbarer, aber nicht deklarierter Zutat für `caution`.

---

## 9. Testing

`bun test`, Testdateien neben den Modulen.

**Golden-Corpus** — realistische Zutatenlisten mit erwarteten Keys, in DE und EN:

| Rezept              | Erwartet                         |
| ------------------- | -------------------------------- |
| Spaghetti Carbonara | `eggs`, `milk`, `gluten`         |
| Pad Thai            | `peanuts`, `fish`, `eggs`, `soy` |
| Hummus              | `sesame`                         |
| Caesar Dressing     | `fish`, `eggs`, `milk`, `gluten` |
| Miso-Suppe          | `soy`, `fish`                    |

**Falsche Freunde** — dürfen nicht treffen: "Reis" ≠ `eggs`, "Weizen" ≠ `eggs`, "Buchweizenmehl" ≠ `gluten`, "Schweinefleisch" ≠ `sulphites`, "Kokosnuss" ≠ `nuts`, "Muskatnuss" ≠ `nuts`. Und zwei, die nur _einen_ der beiden Keys verlieren dürfen: "Erdnussbutter" ≠ `nuts`, aber = `peanuts`; "Mandelmehl" ≠ `gluten`, aber = `nuts`.

**Negation** — "glutenfreies Mehl" ≠ `gluten`, "ohne Ei" ≠ `eggs`, "vegane Sahne" ≠ `milk`, **"laktosefreie Milch" = `milk`**, "veganer Käse mit Cashews" = `nuts`.

**Faltung** — "Nüsse", "Nuesse", "NÜSSE", "nuesse" liefern identische Ergebnisse.

**Urteil** — je ein Fall pro Zustand, insbesondere: leeres `contains_allergens` ohne Zutatentreffer ergibt `unverified`, nicht `safe`; Familie ohne Allergien ergibt `safe` auch bei leerer Deklaration.

**Vollständigkeit** — ein Test, der bricht, sobald ein `ALLERGEN_KEYS`-Eintrag ohne DE-Term, ohne EN-Term oder ohne i18n-Label dasteht. Das ist der Schutz gegen die Klasse Fehler, die diese Iteration überhaupt ausgelöst hat.

Abschließend `bun run typecheck`, `bun lint`, `bun format:check`, `bunx expo export --platform web`.

---

## 10. Dokumentations-Auswirkung

**ADR-014** — die Mapping- und Urteilsentscheidung: wer besitzt das Rezept-Vokabular, warum vier Zustände statt Boolean, warum clientseitig gefiltert, warum `laktosefrei` eine Ausnahme ist.

**`docs/TODO.md`** — entfällt: der Vokabular-Mismatch-Eintrag (durch diese Iteration gelöst). Angepasst: der Eintrag zum leeren Rezept-Pool (Seeds da, gustar.io-Worker offen) und der zu `excludeAllergens` (der Parameter bleibt ungenutzt, das Urteil fällt clientseitig). Neu: Klassifizierungs-Edge-Function als Owner des `declared`-Kanals; neue i18n-Keys für `docs/COPY.md`; dichtere Chip-Reihe in beiden Pattern-Docs; `intolerances` ungenutzt; kein Freitext-Allergen; Begriffslisten als lebender Korpus, der mit echten Rezeptdaten nachgeschärft werden muss.

**`CLAUDE.md`** — der neue Ordner `features/meals/allergens/` in der Folder-Structure.
