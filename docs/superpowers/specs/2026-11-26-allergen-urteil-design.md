# Allergen-Urteil (Roadmap Schritt 4) — Design

**Datum:** 2026-11-26 · **Branch:** `fix/allergen-urteil` · **Status:** zur Abnahme

Grundlage: zwei Einträge in [docs/TODO.md](../../TODO.md) unter „Essen“ und
[Roadmap Schritt 4](../../roadmap.md). Das Urteilsmodell selbst steht in ADR-014.

## 1. Worum es geht

Ein falsches Allergie-Urteil ist der teuerste Fehler, den die App einer Familie machen kann. Zwei
Stellen urteilen heute falsch oder unsauber:

1. **„glutenfreie Nudeln“ meldet Gluten.** Der Negations-Guard in
   [classify.ts](../../../features/meals/allergens/classify.ts) wirkt pro Vorkommen eines Begriffs.
   `gluten` wird verneint, `nudeln` trifft unabhängig davon. Das ist die sichere Richtung, aber bei
   einem so verbreiteten Produkt eine Fehlwarnung, die das Vertrauen in die echten Warnungen kostet.
   Die Grenze, die nicht fallen darf: **„laktosefreie Milch“ bleibt `milk`** (ADR-014 Decision 5).
2. **„Geprüft, nichts gefunden“ hat keine eigene Form.** Ein leeres `contains_allergens` heißt „nie
   klassifiziert“. Überbrückt wird das mit dem Platzhalter-Code `'none'` (`NO_ALLERGENS_CODE`), den
   ein Seed-Rezept trägt. Sauber ist eine eigene Spalte `allergens_classified_at`: Der Zeitstempel
   sagt „wurde geprüft“, das Array nur noch „das wurde gefunden“.

Beides geht ohne den gustar.io-Korpus. Das Nachschärfen der Begriffslisten nicht, das ist Schritt 30.

## 2. Ziele, Nicht-Ziele, Anti-Ziele

**Ziele**

- Wer den Namen eines Allergens selbst verneint („glutenfrei“, „milchfrei“, „ohne Gluten“), räumt
  dieses Allergen für den betroffenen Teil der Zutat ab, auch wenn dort weitere Begriffe des
  Allergens stehen („Nudeln“, „Käse“).
- „geprüft, nichts gefunden“ steht in der Datenbank als `contains_allergens = '{}'` plus gesetztem
  `allergens_classified_at`. Der Code `'none'` verschwindet aus Daten und Code.
- Alle vier Urteilszustände bleiben mit den Seed-Rezepten am Gerät sichtbar.

**Nicht-Ziele**

- Keine neuen Begriffe in den Listen (Schritt 30). Auch nicht der fehlende Oberbegriff für
  Weichtiere oder das englische `fish`.
- Kein Zurücksetzen des Zeitstempels, wenn sich Zutaten ändern. Heute ändert niemand Zutaten: Kein
  Client schreibt Rezepte, der einzige Schreiber ist die Seed-Migration. Die Pflicht gehört zur
  künftigen Edge Function und wird dort im TODO-Eintrag vermerkt.
- Keine UI-Änderung, keine neuen Texte. Die vier Zustände und ihre Texte existieren.
- `intolerances` bleibt ungelesen (eigener TODO-Eintrag).

**Anti-Ziele** (wäre ein Fehlschlag, auch wenn es technisch läuft)

- „laktosefreie Milch“, „Milch oder milchfreier Drink“ oder „Butter und milchfreie Margarine“
  verlieren ihren Milch-Treffer.
- Ein Rezept wird `safe`, ohne dass ein Klassifizierer es geprüft hat. Insbesondere darf der Wegfall
  des Platzhalters kein bisher `unverified` urteilendes Rezept zu `safe` machen.
- Eine Verneinung des Einzelbegriffs („haselnussfrei“) räumt die ganze Gruppe ab (Walnüsse bleiben
  Nüsse).

## 3. Rahmen

- Das Modul `features/meals/allergens/` bleibt frei von React- und Supabase-Imports (ADR-014
  Decision 2), die spätere Edge Function importiert es.
- Migrationen sind wiederholbar (Pfadanweisung in `.coderabbit.yaml`).
- Die Migration geht vor dem Merge live, über den Ablauf aus [SETUP.md](../../../supabase/SETUP.md)
  §7 (ADR-058). Jeder Schritt gegen live erst nach Svens OK.
- `database.types.ts` wird nach der Migration neu erzeugt, nicht von Hand ergänzt.

## 4. Ansätze

**Reichweite der neuen Regel — welche Allergene** (in der Unterhaltung entschieden: alle)

- _Nur Gluten und Milch._ Die zwei Fälle, die wirklich vorkommen. Kleinste Änderung, aber eine
  Sonderliste ohne Regel dahinter.
- **Gewählt: jedes Allergen mit seinem Oberbegriff.** „X-frei“ heißt bei jedem Allergen dasselbe.
  Preis: Eine in sich widersprüchliche Zutat wie „nussfreie Mandelcreme“ verliert ihren Nuss-Treffer.
  Begrenzt dadurch, dass ein weggefallener Zutaten-Treffer ein Rezept nie allein `safe` macht; dafür
  braucht es weiter den Zeitstempel.

**Reichweite innerhalb einer Zutat** (in der Unterhaltung entschieden: Teilstücke)

- _Die ganze Zutat._ Am wenigsten Code. Aber Alternativen in einer Zeile sind in deutschen Rezepten
  häufig, und „Weizennudeln oder glutenfreie Nudeln“ verlöre Gluten.
- **Gewählt: je Teilstück, getrennt an „oder“, „und“, „bzw.“, „/“ (EN „or“, „and“).** Am Komma und
  an Klammern wird nicht getrennt, weil „Nudeln, glutenfrei“ und „Nudeln (glutenfrei)“ gängige
  Schreibweisen sind und greifen sollen.

**Form von „geprüft“** (eine sinnvolle Lösung, in der Unterhaltung vorgeschlagen)

- **Gewählt: nullable Spalte `allergens_classified_at timestamptz`, gesetzt vom Klassifizierer.**
- _Trigger, der den Stempel bei jedem Schreiben von `contains_allergens` setzt:_ kann einen
  Klassifizierer nicht von anderen Schreibern unterscheiden.
- _Boolean statt Zeitstempel:_ gleicher Aufwand, aber der Zeitstempel zeigt später, welche Rezepte
  vor einer neuen Begriffsliste geprüft wurden (Schritt 30).
- _Platzhalter behalten:_ die Roadmap verlangt die saubere Form.

## 5. Die Teile

### A. Selbstbezeichnungen in der Zutatenprüfung

**Markierung.** Ein Begriff in [terms.ts](../../../features/meals/allergens/terms.ts) kann als
Selbstbezeichnung markiert sein: Er benennt das Allergen selbst, nicht eine Sorte oder einen
Begleitstoff. Die Markierung sitzt am Begriff, nicht in einer zweiten Liste, damit kein Oberbegriff
an zwei Stellen gepflegt wird. _Meine Wahl._

Markiert werden nur Begriffe, die schon in der Liste stehen:

| Key           | Selbstbezeichnungen               |
| ------------- | --------------------------------- |
| `gluten`      | `gluten`                          |
| `eggs`        | `ei`, `eier`, `egg`, `eggs`       |
| `fish`        | `fisch`                           |
| `peanuts`     | `erdnuss`, `erdnuesse`, `peanut`  |
| `soy`         | `soja`, `soy`, `soya`             |
| `milk`        | `milch`, `milk`                   |
| `nuts`        | `nuss`, `nut`                     |
| `celery`      | `sellerie`, `celery`              |
| `mustard`     | `senf`, `mustard`                 |
| `sesame`      | `sesam`, `sesame`                 |
| `sulphites`   | `sulfit`, `sulphite`, `sulfite`   |
| `lupin`       | `lupine`, `lupin`                 |
| `crustaceans` | `krebs`                           |
| `molluscs`    | — (kein Oberbegriff in der Liste) |

`krebs` steht als Teilwort-Begriff in der Liste und trifft damit auch „Krebstiere“. Weichtiere haben
keinen Oberbegriff in der Liste, und das englische `fish` fehlt ganz. Beides kommt erst mit den
Begriffslisten in Schritt 30, weil ein neuer Begriff ändert, was erkannt wird, und dort seine
Testfälle braucht. Praktisch fehlt dadurch nichts: Ohne den Begriff meldet „ohne Weichtiere“ auch
nichts, was abzuräumen wäre. _Meine Wahl; weicht bei Weichtieren von „alle 14“ ab._

**Teilstücke.** Der Zutatenname wird vor der Prüfung getrennt:

- an den Zeichen `/` und `&` im Originaltext, vor `fold()`, weil `fold()` beide zu Leerzeichen
  macht (`&` ist _meine Wahl_, es steht für „und“);
- danach an den gefalteten Wörtern `oder`, `or`, `und`, `and`, `bzw`, nur als ganzes Wort
  („mandel“ enthält „and“ und bleibt heil). Kein Begriff und kein Ausschluss in `terms.ts` enthält
  eines dieser Wörter als ganzes Wort, das Trennen zerschneidet also keinen Begriff.

Jedes Teilstück wird für sich geprüft, die Keys aller Teilstücke werden vereinigt. Wie heute
vereinigt `scanIngredients` danach die Keys aus `name.de` und `name.en`: Räumt nur eine Sprache ab,
bleibt der Treffer der anderen. Für die bestehende Prüfung pro Vorkommen ändert das Trennen nichts:
Ein Trennwort ist weder Negationspräfix noch -suffix.

**Regel je Teilstück und Allergen.** Das Allergen fällt im Teilstück weg, wenn beides gilt:

1. Mindestens ein Vorkommen einer Selbstbezeichnung ist verneint (bestehender `isNegated`) **und
   beginnt am Wortanfang.**
2. Kein Vorkommen einer Selbstbezeichnung ist unverneint, egal an welcher Stelle im Wort.

Sonst gilt die bisherige Prüfung pro Vorkommen unverändert. Wortgrenze im `word`-Modus und
Ausschlussliste gelten für Selbstbezeichnungen wie für jeden Begriff.

Wortanfang heißt: im gefalteten Teilstück an Position 0 oder direkt nach einem Leerzeichen. Weil
`fold()` Bindestriche zu Leerzeichen macht, zählt der Anfang nach einem Bindestrich mit. _Meine
Wahl._

Die Markierung ändert nicht, wann ein Begriff trifft. In „eifreie Nudeln“ trifft `ei` im
`word`-Modus nicht; es gibt nichts abzuräumen, und Eier werden wie heute nicht gemeldet. _Meine
Wahl, keine neue Trefferregel._

Warum der Wortanfang: In „haselnussfreie Schokolade mit Walnüssen“ steckt `nuss` in „haselnuss“.
Verneint ist dort die Sorte, nicht die Gruppe; ohne die Bedingung fiele der Walnuss-Treffer weg.
Dasselbe gilt für „thunfischfrei“. Warum Bedingung 2 jede Stelle zählt: In „Vollmilch, milchfrei“
oder „Milch, milchfreie Alternative“ ist echte Milch genannt, der Treffer bleibt. Im Zweifel bleibt
der Treffer.

Bekannte Grenze, die sichere Richtung: In „gluten- und laktosefreie Nudeln“ trennt das „und“ die
Verneinung von den Nudeln, Gluten bleibt gemeldet. So wie heute.

**Schnittstelle.** `scanText(text: string): AllergenKey[]` und `scanIngredients` behalten ihre
Signaturen. `evidence` bleibt der ganze Zutatenname.

### B. Spalte `allergens_classified_at`

**Migration** `supabase/migrations/<zeitstempel>_allergens_classified_at.sql`, wiederholbar:

1. `alter table public.recipes add column if not exists allergens_classified_at timestamptz;`
   (nullable, kein Default).
2. Rückfüllung: Jede Zeile mit nicht leerem `contains_allergens` und noch leerem Zeitstempel bekommt
   `allergens_classified_at = created_at`. Diese Zeilen hat jemand klassifiziert, zur Zeit ihres
   Anlegens. _Meine Wahl, `created_at` statt `now()`._
3. Danach `'none'` aus allen Arrays entfernen (`array_remove`). Reihenfolge zählt: erst stempeln,
   solange `'none'` die Zeile noch als geprüft ausweist.
4. Spaltenkommentare: der neue für `allergens_classified_at`; der von `contains_allergens` bekommt
   den Satz zur Bedeutung des leeren Arrays (leer + Zeitstempel = nichts gefunden, leer ohne
   Zeitstempel = nie geprüft).

Kein Index (niemand filtert danach), kein CHECK, keine neue Policy: Die bestehenden Policies auf
`recipes` gelten für die neue Spalte wie für `contains_allergens`.

Seed-Rezepte danach: vier mit Zeitstempel (eins davon mit `'{}'`, vorher `'none'`), zwei ohne. Damit
bleiben `safe`, `unsafe`, `caution` und `unverified` am Gerät erreichbar. Die alte Seed-Migration
bleibt unverändert, sie ist eingespielte Geschichte.

**Typen.** `database.types.ts` neu erzeugen. `RecipeRow` übernimmt die Spalte automatisch
(`Omit<DbRecipeRow, …>`, `normalizeRecipe` reicht sie per Spread durch).

**Urteil** in [judge.ts](../../../features/meals/allergens/judge.ts):

- `JudgeableRecipe` bekommt das Pflichtfeld `readonly allergens_classified_at: string | null`.
  Pflicht statt optional, damit jeder Aufrufer und jede Test-Fixture die Frage „geprüft?“ beantwortet.
- Deklarierte Treffer → `unsafe` und Zutaten-Treffer → `caution` wie bisher, unabhängig vom
  Zeitstempel. Ein Fund ist ein Fund.
- `safe` nur, wenn `allergens_classified_at` gesetzt ist **und** kein unbekannter Code vorkommt.
  Sonst `unverified`.
- Verhaltensänderung, gewollt: Ein Rezept mit bekannten Codes, aber ohne Zeitstempel, urteilt
  `unverified` statt `safe`. Nach der Rückfüllung gibt es so ein Rezept nicht.
- `NO_ALLERGENS_CODE` entfällt samt Export aus `index.ts`. Ein übrig gebliebenes `'none'` ist danach
  ein unbekannter Code und verhindert `safe`. `isKnownDeclaredCode` bleibt, verliert aber den
  `none`-Zweig.

**Ältere App-Stände** lesen das frühere `'none'`-Rezept nach der Migration als `'{}'` und urteilen
`unverified` statt `safe`. Die vorsichtige Richtung; kein Schreibpfad ist betroffen.

## 6. Tests

**`classify.test.ts`** (`bun test`). Das bisherige `test.todo` wird ein echter Test. Fälle, mit
erwartetem Ergebnis:

| Text                                     | Erwartung                      |
| ---------------------------------------- | ------------------------------ |
| glutenfreie Nudeln                       | ohne `gluten`                  |
| Nudeln, glutenfrei · Nudeln (glutenfrei) | ohne `gluten`                  |
| gluten free pasta · Nudeln ohne Gluten   | ohne `gluten`                  |
| milchfreier Käse                         | ohne `milk`                    |
| laktosefreie Milch                       | mit `milk`                     |
| Weizennudeln oder glutenfreie Nudeln     | mit `gluten`                   |
| Butter und milchfreie Margarine          | mit `milk`                     |
| Milch / milchfreier Drink · Milch & …    | mit `milk`                     |
| Milch, milchfreie Alternative            | mit `milk`                     |
| Vollmilch, milchfrei                     | mit `milk`                     |
| haselnussfreie Schokolade mit Walnüssen  | mit `nuts`                     |
| nussfreie Mandelcreme                    | ohne `nuts` (gewollter Preis)  |
| gluten- und laktosefreie Nudeln          | mit `gluten` (bekannte Grenze) |

Die bestehenden Golden- und Negationsfälle bleiben grün.

**`judge.test.ts`**: leeres Array mit Zeitstempel → `safe`; leeres Array ohne → `unverified`;
`['none']` mit Zeitstempel → `unverified`; bekannte Codes ohne Zeitstempel → `unverified`; ein
deklarierter Treffer ohne Zeitstempel → `unsafe`; Zutaten-Treffer mit Zeitstempel → `caution`.
Fixtures in den übrigen Tests (`alternative`, `planningSteps`, `normalize`, `queries`, `*.jest.tsx`)
bekommen das neue Feld. Wo eine Fixture `['none']` als „geprüft, nichts gefunden“ benutzt
(`alternative.test.ts`), wird daraus `[]` mit Zeitstempel; ihr erwartetes Urteil bleibt gleich, der
Kommentar dort zieht mit.

**pgTAP** (`test:db`): Spalte existiert als nullable `timestamptz`; keine Zeile enthält `'none'`;
jede Zeile mit nicht leerem Array hat einen Zeitstempel; das frühere `'none'`-Seed-Rezept hat `'{}'`
und einen Zeitstempel; die zwei leeren Seed-Rezepte haben keinen.

**Wiederholbarkeit**: die Migration lokal mehrfach hintereinander einspielen, `test:db` danach grün.

## 7. Einspielen auf live

Ablauf wie bei ADR-060, nach [SETUP.md](../../../supabase/SETUP.md) §7, jeder Schritt gegen live nach
Svens OK:

1. Abgleich vorher (`parity.sql`).
2. Lesende Prüfung: wie viele Rezepte tragen `'none'`, wie viele ein nicht leeres Array, wie viele
   ein leeres. Erwartet: die Seed-Werte (1 · 4 · 2). Weicht das ab, hält die Einspielung an, und
   Sven entscheidet.
3. Einspielen über die Management-API, Body byte-genau aus der Datei.
4. Datei auf die Live-Version umbenennen.
5. Abgleich nachher, Advisors, `database.types.ts` gegen live vergleichen.

## 8. Dem Umsetzer überlassen

- Wie die Markierung am Begriff aussieht (Feld am `Term`, Form des `t()`-Aufrufs) und wie
  `FoldedSpec` sie trägt.
- Ob das Trennen in eine eigene Funktion wandert und ob sie exportiert wird.
- Name und Ort der pgTAP-Datei.

## 9. Am Branch-Ende

- **ADR-061**: Selbstbezeichnungen und Teilstücke (verfeinert ADR-014 Decision 5);
  `allergens_classified_at` statt `'none'` (löst die Ausnahme in ADR-014 Decision 3 und die
  Consequence „keine saubere Ausdrucksform“ ab).
- **`docs/TODO.md`**: die zwei Einträge löschen. Der Eintrag zur Edge Function bekommt: Sie setzt
  `allergens_classified_at` und muss ihn zurücksetzen, sobald sich Zutaten ändern.
- **Roadmap**: Schritt 4 entfernen.
- Kommentare an `NO_ALLERGENS_CODE`-Stellen und am `test.todo` verschwinden mit dem Code.
