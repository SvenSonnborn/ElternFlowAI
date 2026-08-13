# Spec · Meal-Planner-Daten-Layer

**Datum:** 2026-08-13 · **Branch:** `feat/meals-data-layer` · **Status:** freigegeben

## Ziel

`features/meals/` liefert dem Essen-Tab die Daten, die er heute aus
[`features/sample-data/meals.ts`](../../../features/sample-data/meals.ts) bezieht:
den Wochenplan der Familie, die Mahlzeit für jetzt, ein einzelnes Rezept und
eine durchsuchbare Rezeptliste. Vier Hooks über zwei Tabellen, lesend.

Das Schema steht seit
[20260529093329_recipes_and_meal_plan.sql](../../../supabase/migrations/20260529093329_recipes_and_meal_plan.sql);
zwischen ihm und der UI liegt bislang nichts.

## Scope

**Drin:** ein neuer Ordner `features/meals/` mit Types, JSONB-Normalisierung,
reiner Wochenlogik, vier Hooks und zwei Testdateien; die Extraktion des
bestehenden `useToday()` nach `features/shared/`; das Löschen des
Placeholder-Ordners `features/meal-planner/`; die zugehörigen CLAUDE.md- und
TODO-Einträge.

**Bewusst draußen:**

- **Mutationen.** Mahlzeit setzen, tauschen, löschen. Der Layer ist lesend; die
  Schreibseite kommt mit dem Screen, der sie auslöst.
- **Screen-Wiring.** [EssenScreen](<../../../app-sections/(tabs)/essen/EssenScreen.tsx>)
  bleibt auf den Sample-Daten, `features/sample-data/meals.ts` bleibt liegen.
  Ein Layer ohne Consumer ist die kleinere Änderung als beides in einem PR.
- **Allergene automatisch aus `children.allergy_keys`.** `useRecipes` nimmt sie
  als Parameter. Siehe Entscheidung 5.
- **Einkaufsliste und KI-Vorschläge.** Eigene Iterationen, eigene Verträge
  (`MealPick` in [patterns/meals.md](../../../patterns/meals.md)).
- **Rezept-Seeds.** Der globale Pool füllt sich über den gustar.io-Worker, der
  laut CLAUDE.md deferred ist. Siehe Ausgangslage.

Keine Migration, kein Types-Regen, kein Eingriff ins Handoff-Bundle.

## Ausgangslage

Zwei Tabellen, beide mit `force row level security`:

- **`recipes`** — globaler Pool. `created_by_family_id IS NULL` heißt „für alle
  lesbar, vom Client unveränderlich"; gesetzt heißt „privates Familienrezept".
  Die SELECT-Policy gibt beides frei. `title`, `description`, `ingredients` und
  `instructions` sind `jsonb` und landen in
  [database.types.ts](../../../features/supabase/database.types.ts) als
  untypisiertes `Json`.
- **`meal_plan_entries`** — `unique (family_id, date, meal_slot)`. Pro Tag und
  Slot höchstens ein Eintrag; `recipe_id` ist `NOT NULL` mit
  `ON DELETE RESTRICT`.

Drei Beobachtungen prägen das Design:

1. **Der Rezept-Pool ist heute leer.** `supabase/` enthält keine Seeds und keinen
   `insert into public.recipes`. `useRecipes` liefert bis zum gustar.io-Worker
   realistisch `[]`. Der Hook wird trotzdem vollständig gebaut — die Indizes
   (`recipes_contains_allergens_gin`, `recipes_keywords_gin`) existieren bereits
   für genau diese Abfrage, und die Alternative wäre ein zweiter Durchgang durch
   dieselbe Datei am Tag der ersten Rezepte.
2. **Das Unique-Constraint bestimmt die Datenform.** Höchstens ein Eintrag je
   Tag+Slot heißt: ein `Record<MealSlot, Entry | null>` je Tag kann die Realität
   nicht verlieren. Eine Liste könnte mehr ausdrücken, als die DB zulässt.
3. **`useToday()` existiert schon.** In
   [features/tasks/queries.ts](../../../features/tasks/queries.ts) — lokale
   Mitternacht, aktualisiert per Timer _und_ `AppState`-Listener, weil
   JS-Timer im Hintergrund suspendiert sind und den Tageswechsel sonst
   verschlafen. Dieser Layer braucht dasselbe an zwei Stellen.

## Architektur

### Dateilayout — `features/meals/`

```
types.ts         Types (DB-abgeleitet + Layer-eigene)
normalize.ts     Json → typisiert, defensiv · localize() · escapeLike()
week.ts          Wochenfenster · groupByDay · slotForTime
queries.ts       mealKeys · fetch*() · use*()
index.ts         Barrel
normalize.test.ts
week.test.ts
```

Aufteilung nach dem Muster von `features/tasks` (`stats.ts`/`filter.ts` neben
`queries.ts`) und `features/calendar` (`expand.ts`/`spans.ts`): was Tests
verdient, liegt außerhalb von `queries.ts`, die Hooks bleiben dünne Wrapper.

`features/meal-planner/` (nur eine Placeholder-README) wird gelöscht. Der Name
`meals` folgt dem i18n-Namespace `meals.*`, `patterns/meals.md` und
`features/sample-data/meals.ts`; CLAUDE.md-Ordnerbaum wird im selben Commit
nachgezogen.

### `useToday` wandert nach `features/shared/`

`useTodaysMeal` braucht den heutigen Tag, und `MealPlanDay.isToday` braucht ihn
auch. Eine zweite Kopie des Hooks würde dasselbe subtile Verhalten (Timer über
`addDays` statt +24 h wegen DST, `AppState`-Listener für den im Hintergrund
verpassten Mitternachtswechsel, Identitätserhalt der `Date`-Instanz für den
Query-Key) ein zweites Mal pflegen müssen.

Deshalb: neues `features/shared/useToday.ts` mit dem unveränderten Hook,
[features/tasks/queries.ts](../../../features/tasks/queries.ts) importiert von
dort statt ihn lokal zu definieren. Verhalten identisch, nur der Ort ändert
sich. `features/shared/` ist neu und bekommt eine Zeile im CLAUDE.md-Baum.

### Types

```ts
export type MealSlot = Database["public"]["Enums"]["meal_slot_enum"];
export type LocalizedText = { de: string; en?: string };

export interface Ingredient {
  amount: string | null;
  unit: string | null;
  name: LocalizedText;
}

export type RecipeRow = Omit<
  Database["public"]["Tables"]["recipes"]["Row"],
  "title" | "description" | "ingredients" | "instructions"
> & {
  title: LocalizedText;
  description: LocalizedText | null;
  ingredients: Ingredient[];
  instructions: LocalizedText[];
};

export type MealPlanEntryRow = Database["public"]["Tables"]["meal_plan_entries"]["Row"];
export type MealPlanEntryWithRecipe = MealPlanEntryRow & { recipe: RecipeRow | null };

export interface MealPlanDay {
  /** ISO-Kalendertag, `yyyy-MM-dd` — derselbe Raum wie `meal_plan_entries.date`. */
  date: string;
  isToday: boolean;
  slots: Record<MealSlot, MealPlanEntryWithRecipe | null>;
}

export interface RecipeFilter {
  search?: string;
  /** Normalisierte Codes wie in `recipes.contains_allergens` (`milk`, `egg`, …). */
  excludeAllergens?: string[];
  limit?: number;
}

/** Was `useRecipes` aus einem `RecipeFilter` macht — Cache-Key und Abfrage lesen dies. */
export interface NormalizedRecipeFilter {
  search: string; // getrimmt, ggf. ""
  excludeAllergens: string[]; // sortiert, dedupliziert
  limit: number;
}
```

`RecipeRow` überschreibt die vier `Json`-Felder per `Omit`, statt einen eigenen
Typ danebenzustellen: alles Übrige (`contains_allergens`, `duration_min`,
`image_url`, …) bleibt automatisch an der generierten Quelle hängen und driftet
beim nächsten Types-Regen nicht weg.

Das Embed heißt **`recipe`**, nicht `recipes` — abweichend von
`TaskWithType.task_types` in
[features/tasks/types.ts](../../../features/tasks/types.ts). Begründung: der
Fetcher schreibt die Zeile ohnehin um, um die JSONB-Felder zu dekodieren, der
PostgREST-Name ist an dieser Stelle also kein rohes Artefakt mehr, und
`entry.recipes.title` liest sich bei einer to-one-Beziehung falsch. Nullable
bleibt es wie `task_types`: PostgREST liefert `null` für ein Embed, das RLS
nicht freigibt.

### Normalisierung

`normalize.ts` ist die einzige Stelle im Layer, an der geraten werden muss —
`jsonb` garantiert keine Form. Sie rät defensiv und wirft nie:

| Eingabe                        | `toLocalizedText`     |
| ------------------------------ | --------------------- |
| `{ de: "Pasta", en: "Pasta" }` | unverändert           |
| `"Pasta"` (nackter String)     | `{ de: "Pasta" }`     |
| `{ en: "Pasta" }`              | `{ de: "", en: "…" }` |
| `null`, `42`, `[]`, `{}`       | `{ de: "" }`          |

`toIngredients` und `toInstructions` erwarten Arrays und **filtern unbrauchbare
Elemente heraus**, statt zu werfen: ein einzelnes kaputtes Rezept aus dem
Crawler darf nicht den ganzen Wochenplan abschießen. Kein Array → `[]`.

`localize(text, lang)` nimmt den Wert der gewünschten Sprache, wenn er nicht
leer ist, sonst den der anderen, sonst `""`. Damit liefert ein Rezept, das nur
`en` führt, auch auf Deutsch etwas Lesbares — DE ist laut CLAUDE.md die
kanonische Sprache, aber ein leeres Feld ist keine Übersetzung, sondern eine
Lücke.

### Query-Keys

```ts
export const mealKeys = {
  all: ["meals"] as const,
  plansRoot: ["meals", "plan"] as const,
  plan: (weekStart: string) => ["meals", "plan", weekStart] as const,
  recipesRoot: ["meals", "recipes"] as const,
  recipes: (filter: NormalizedRecipeFilter) => ["meals", "recipes", filter] as const,
  recipe: (id: string) => ["meals", "recipe", id] as const,
};
```

`plansRoot` und `recipesRoot` existieren für spätere Mutationen: sie
invalidieren dann alle Wochen bzw. alle Filtervarianten, ohne über `all` auch
den langlebigen `recipe`-Cache mitzureißen — dieselbe Trennung wie
`taskKeys.familyRoot` gegenüber `taskKeys.all`.

`mealKeys.recipes` nimmt den **normalisierten** Filter, nicht den rohen:
`search` getrimmt, `excludeAllergens` sortiert und dedupliziert, `limit`
aufgefüllt. Sonst wären `{}` und `{ limit: 50 }` zwei Cache-Einträge für
dieselbe Abfrage, und `["milk","egg"]` ein dritter neben `["egg","milk"]`.
`useRecipes` normalisiert einmal und speist damit sowohl den Key als auch die
Abfrage.

### Die vier Hooks

**`useMealPlans(weekStart: Date)`** — ein Cache-Eintrag je Woche.

Der Hook zieht das Argument selbst auf den Wochenanfang:
`startOfWeek(weekStart, { weekStartsOn: 1 })`. Montag, weil DE die primäre
Locale ist und `patterns/meals.md` sieben Reihen Mo–So beschreibt. Dass der Hook
normalisiert statt zu fordern, hält den Cache zusammen — ein Aufrufer, der
irgendein Datum aus der Woche übergibt, landet auf demselben Eintrag statt einen
siebten anzulegen.

```ts
supabase
  .from("meal_plan_entries")
  .select("*, recipes(*)")
  .gte("date", format(weekStart, "yyyy-MM-dd"))
  .lte("date", format(addDays(weekStart, 6), "yyyy-MM-dd"))
  .order("date", { ascending: true });
```

**Kein `family_id`-Filter.** `meal_plan_entries` läuft mit
`force row level security` und `family_id = current_family_id()` auf allen vier
Kommandos; ein Client-Filter wäre eine zweite Definition von „meine Familie",
die von der Policy wegdriften kann. Dieselbe Begründung wie in
[features/tasks/queries.ts](../../../features/tasks/queries.ts).

Danach `groupByDay(rows, weekStart, today)` → **immer sieben** `MealPlanDay`,
auch wenn nichts geplant ist. Das Mo–So-Raster aus
[patterns/meals.md](../../../patterns/meals.md) rendert damit ohne
Sonderbehandlung für Lücken. Rückgabe wie `useFamilyTasks`:
`{ data, isLoading, isRefetching, error, refetch }`, `refetch` auf `() => void`
verengt für `onRefresh`.

**`useTodaysMeal()`** — Selektor auf `useMealPlans(Wochenstart von heute)`, keine
eigene Query. Heute liegt per Definition in dieser Woche, der Cache-Eintrag
existiert also ohnehin; ein eigener Key wäre eine zweite Kopie derselben Zeile,
die keine spätere Mutation invalidiert. Analog zu `useTask` in
[features/tasks/queries.ts](../../../features/tasks/queries.ts).

Gibt `{ entry, slot, isLoading, error }` zurück. `slot` kommt aus
`slotForTime()` — die Regel steht im Handoff
([patterns/meals.md](../../../patterns/meals.md), „Behaviour rules"): vor 11 Uhr
`breakfast`, 11–15 Uhr `lunch`, sonst `dinner`. `snack` wird nie automatisch
gewählt.

Ist für diesen Slot nichts geplant, ist `entry` `null` — **kein Fallback auf
einen anderen Slot**. Abends das Frühstück anzuzeigen wäre schlechter als der
Leerzustand.

**`useRecipeById(id: string)`** — hier _doch_ eine eigene Query
(`.eq("id", id).maybeSingle()`), weil die Rezeptliste gefiltert und limitiert
ist: ein Rezept aus einem Wochenplan-Eintrag muss in ihr nicht vorkommen. Der
Selektor-Trick von `useTodaysMeal` trägt hier also nicht.
`staleTime: 5 * 60_000` wie `useTaskTypes` — Pool-Rezepte sind serverseitig
unveränderlich, und private ändert nur die eigene Familie.

**`useRecipes(filter: RecipeFilter = {})`**

```ts
let q = supabase.from("recipes").select("*");
if (search) q = q.ilike("title->>de", `%${escapeLike(search)}%`);
if (allergens.length) q = q.not("contains_allergens", "ov", `{${allergens.join(",")}}`);
q = q.order("created_at", { ascending: false }).limit(limit ?? 50);
```

`not(…, "ov", …)` ist „überlappt _nicht_" und trifft den
`recipes_contains_allergens_gin`-Index. Gefiltert wird gegen
`contains_allergens`, **nicht** gegen `diet_tags` — der Spaltenkommentar in der
Migration ist da eindeutig: `diet_tags` sind UI-Badges, `contains_allergens` ist
die Quelle der Wahrheit für Allergenfilterung.

`escapeLike` maskiert `%` und `_` in der Nutzereingabe — ohne das wäre ein
getipptes `%` ein Platzhalter, der alles trifft. Der Helper wohnt in
`normalize.ts`: er bringt einen Wert in eine Form, der die Abfrage trauen kann,
und ist damit dieselbe Sorte Arbeit wie der Rest der Datei — und dort testbar.

`placeholderData: keepPreviousData`, damit die Liste beim Tippen nicht auf
`isLoading` zurückfällt und weiß blinkt.

### Zeitzonen

`meal_plan_entries.date` ist `date`, nicht `timestamptz` — ein Kalendertag ohne
Zone. Der Layer bleibt deshalb durchgehend im String-Raum `yyyy-MM-dd` und
formatiert Fenstergrenzen mit `date-fns/format` aus der **lokalen** Zeit. Ein
`toISOString()` auf lokaler Mitternacht würde östlich von UTC einen Tag zu früh
landen und den Montag aus dem Fenster schneiden.

`isToday` vergleicht denselben formatierten String, nicht `Date`-Instanzen.

### Fehlerbehandlung

Die Fetcher werfen den `PostgrestError` unverändert, React Query trägt ihn, die
Hooks reichen `error` durch — wie `useFamilyTasks`. **Kein `errors.ts`**: die
deutschen Fehlertexte in
[features/tasks/errors.ts](../../../features/tasks/errors.ts) existieren für
Constraint-Verletzungen beim Schreiben, und dieser Layer schreibt nicht.

### Tests

`bun test`, Imports aus `bun:test` — wie alle Tests im Repo.

- **`normalize.test.ts`** — die Tabelle oben Zeile für Zeile, plus:
  Zutaten-Array mit einem kaputten Element behält die intakten; `instructions:
null` → `[]`; `localize` fällt in beide Richtungen auf die gefüllte Sprache
  zurück; `escapeLike` maskiert `%`, `_` und den Backslash selbst.
- **`week.test.ts`** — `groupByDay` liefert sieben Tage bei leerer Eingabe;
  ordnet einen Eintrag dem richtigen Tag _und_ Slot zu; ignoriert Zeilen
  außerhalb des Fensters; `isToday` trifft genau einen Tag (und keinen, wenn die
  Woche in der Vergangenheit liegt). `slotForTime` an den Grenzen 10:59 / 11:00
  / 14:59 / 15:00.

Die Hooks bleiben ungetestet — im Repo gibt es keine RTL-Hook-Infrastruktur, und
alles Getestete in `features/tasks` ist rein.

## RLS-Check

| Hook            | Tabelle             | Policy                                                  | Client-Filter nötig? |
| --------------- | ------------------- | ------------------------------------------------------- | -------------------- |
| `useMealPlans`  | `meal_plan_entries` | `select own family` → `family_id = current_family_id()` | nein                 |
| `useMealPlans`  | `recipes` (Embed)   | `select global or own private`                          | nein                 |
| `useRecipeById` | `recipes`           | dieselbe                                                | nein                 |
| `useRecipes`    | `recipes`           | dieselbe                                                | nein                 |

Das Embed `recipes(*)` kann theoretisch `null` liefern, wenn ein Eintrag auf ein
Rezept zeigt, das die Familie nicht lesen darf. Praktisch verhindert das Fix 11
aus
[20260529100841_pr3_review_fixes.sql](../../../supabase/migrations/20260529100841_pr3_review_fixes.sql):
INSERT und UPDATE auf `meal_plan_entries` validieren, dass `recipe_id` global
oder familieneigen ist. Der Typ bleibt trotzdem nullable — die Policy ist die
Garantie, nicht der Typ.

## Entscheidungen

1. **JSONB wird im Layer typisiert, nicht in den Screens.** Jeder Consumer
   bräuchte sonst denselben Cast, und der erste, der ihn vergisst, crasht auf
   einem Crawler-Rezept. Preis: Runtime-Normalisierung plus Tests.
2. **`Record<MealSlot, …>` statt Liste je Tag.** Das Unique-Constraint erlaubt
   höchstens einen Eintrag je Tag+Slot; die Form bildet das ab, und der
   Slot-Tab-Screen aus `patterns/meals.md` liest `day.slots[activeSlot]` ohne
   Suche.
3. **`useTodaysMeal` ist ein Selektor, `useRecipeById` eine Query.** Der
   Unterschied ist, ob die Zeile garantiert im Cache liegt: heute liegt immer in
   der aktuellen Woche, ein beliebiges Rezept liegt nicht immer in einer
   gefilterten, limitierten Liste.
4. **`useToday` wird extrahiert statt kopiert.** Zwei Kopien eines Hooks mit
   DST- und Hintergrund-Sonderfällen driften auseinander, sobald einer davon
   repariert wird.
5. **Allergene sind ein Parameter, keine Ableitung.** Ein automatischer Zugriff
   auf `children.allergy_keys` würde `features/meals` an `features/children`
   koppeln, den Hook schwerer testbar machen und die Filterregel an zwei Orten
   festschreiben (hier und in der späteren KI-Vorschlagslogik). Der Aufrufer
   übergibt sie.
6. **`useRecipes` wird jetzt vollständig gebaut, obwohl der Pool leer ist.** Die
   Indizes existieren, die Abfrage ist klein, und die Alternative wäre ein
   zweiter Durchgang durch dieselbe Datei.

## Doku-Folgen

- **CLAUDE.md** — Ordnerbaum: `features/meals/` beschrieben, `features/shared/`
  ergänzt, `features/meal-planner/` entfernt.
- **docs/TODO.md** — neue Einträge für die Nicht-Ziele: Mutationen,
  Screen-Wiring samt Ablösung von `features/sample-data/meals.ts`, Allergene aus
  den Kinderprofilen, leerer Rezept-Pool bis zum gustar.io-Worker.
- **Kein ADR.** Nichts hier widerspricht einer bestehenden Entscheidung oder
  legt eine neue repoweite Konvention fest; die Abweichungen (`recipe` statt
  `recipes`, Selektor statt Query) sind hier begründet und lokal.

## Offene Punkte

- **`patterns/meals.md` beschreibt vier Slots im Schema, aber nur drei Tabs**
  (Abendessen · Mittag · Frühstück). `snack` existiert im Enum und wird vom
  Layer geführt, hat aber keinen Platz in V1 des Screens. Das ist kein Konflikt,
  solange nichts `snack` schreibt — beim Screen-Wiring mit dem Designer klären.
- **Der `MealPick`-Vertrag aus `patterns/meals.md`** (`emoji`, `reason`,
  `reasonItems`, `alternates`) hat im Schema keine Entsprechung. Er gehört zur
  KI-Iteration und wird hier bewusst nicht vorweggenommen.
