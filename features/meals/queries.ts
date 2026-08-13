import { keepPreviousData, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { addDays } from "date-fns";
import { useMemo } from "react";

import { useToday } from "@/features/shared";
import { supabase } from "@/features/supabase";

import type {
  MealPlanDay,
  MealPlanEntryWithRecipe,
  MealSlot,
  NormalizedRecipeFilter,
  RecipeFilter,
  RecipeRow,
} from "./types";

import { escapeLike, normalizeRecipe } from "./normalize";
import { groupByDay, slotForTime, toDateKey, weekStartFor } from "./week";

const ENTRY_SELECT = "*, recipes(*)";

const DEFAULT_RECIPE_LIMIT = 50;

export const mealKeys = {
  /** Alles zum Meal-Planner. */
  all: ["meals"] as const,
  /**
   * Nur die Wochenpläne. Spätere Mutationen invalidieren hierüber alle Wochen,
   * ohne den langlebigen `recipe`-Cache mitzureißen — dieselbe Trennung wie
   * `taskKeys.familyRoot` gegenüber `taskKeys.all`.
   */
  plansRoot: ["meals", "plan"] as const,
  plan: (weekStart: string) => ["meals", "plan", weekStart] as const,
  recipesRoot: ["meals", "recipes"] as const,
  recipes: (filter: NormalizedRecipeFilter) => ["meals", "recipes", filter] as const,
  recipe: (id: string) => ["meals", "recipe", id] as const,
};

/** Was ein Allergen-Code sein darf — dieselbe Form wie `contains_allergens`. */
const ALLERGEN_CODE_PATTERN = /^[a-z0-9_-]+$/;

/**
 * Bringt einen Filter in die Form, die Cache-Key und Abfrage teilen. Ohne das
 * wären `{}` und `{ limit: 50 }` zwei Einträge für dieselbe Abfrage, und
 * `["milk","egg"]` ein dritter neben `["egg","milk"]`.
 *
 * Codes, die nicht auf `ALLERGEN_CODE_PATTERN` passen, werden verworfen statt
 * durchgereicht: Ein `,` würde in der Postgres-Array-Literalsyntax
 * `{a,b}` ein zweites Element aufmachen, `""` ergäbe das leere Literal `{}`
 * (matcht nichts), und `}` würde PostgREST mit 400 quittieren. Kein
 * Injection-Risiko — PostgREST bindet das geparste Array als Parameter —, aber
 * ein Verhaltensfehler, sobald ein freies "+ Andere"-Allergenfeld existiert
 * (docs/TODO.md).
 */
export function normalizeRecipeFilter(filter: RecipeFilter): NormalizedRecipeFilter {
  const codes = (filter.excludeAllergens ?? []).filter((code) => ALLERGEN_CODE_PATTERN.test(code));

  return {
    search: filter.search?.trim() ?? "",
    excludeAllergens: [...new Set(codes)].sort(),
    limit: filter.limit ?? DEFAULT_RECIPE_LIMIT,
  };
}

/**
 * Die Einträge einer Kalenderwoche.
 *
 * Kein `family_id`-Filter: `meal_plan_entries` läuft mit `force row level
 * security` und `family_id = current_family_id()` auf allen vier Kommandos, die
 * Policy ist also die einzige Definition von "meine Familie". Ein Client-Filter
 * wäre eine zweite, die davon wegdriften kann.
 */
export async function fetchMealPlanWeek(weekStart: Date): Promise<MealPlanEntryWithRecipe[]> {
  const { data, error } = await supabase
    .from("meal_plan_entries")
    .select(ENTRY_SELECT)
    .gte("date", toDateKey(weekStart))
    .lte("date", toDateKey(addDays(weekStart, 6)))
    .order("date", { ascending: true });
  if (error) throw error;

  return (data ?? []).map(({ recipes, ...entry }) => ({
    ...entry,
    recipe: recipes ? normalizeRecipe(recipes) : null,
  }));
}

export async function fetchRecipeById(id: string): Promise<RecipeRow | null> {
  const { data, error } = await supabase.from("recipes").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? normalizeRecipe(data) : null;
}

/**
 * Der sichtbare Rezept-Pool, gefiltert.
 *
 * Gefiltert wird gegen `contains_allergens`, nicht gegen `diet_tags` — der
 * Spaltenkommentar in der Migration ist da eindeutig: `diet_tags` sind
 * UI-Badges, `contains_allergens` ist die Quelle der Wahrheit. `not(…, "ov", …)`
 * heißt "überlappt nicht" — eine *negierte* Overlap-Bedingung ist aber nicht
 * indexierbar, `recipes_contains_allergens_gin` bedient nur `&&`/`@>`/`<@`, also
 * scannt Postgres hier sequenziell. Dasselbe gilt für die beiden anderen
 * Prädikate unten: `ilike '%…%'` hat keinen Trigram-Index, `created_at` gar
 * keinen (docs/TODO.md — kein Problem, solange der Pool leer ist).
 */
export async function fetchRecipes(filter: NormalizedRecipeFilter): Promise<RecipeRow[]> {
  let query = supabase.from("recipes").select("*");

  if (filter.search) {
    query = query.ilike("title->>de", `%${escapeLike(filter.search)}%`);
  }
  if (filter.excludeAllergens.length > 0) {
    query = query.not("contains_allergens", "ov", `{${filter.excludeAllergens.join(",")}}`);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    // Tiebreaker: `created_at` defaults to transaction time, so a bulk insert
    // from the gustar.io worker shares one timestamp across a whole batch and
    // Postgres may return those rows in any order between calls. Same fix as
    // `byDueAsc`'s `id`-tiebreak in features/tasks/stats.ts.
    .order("id", { ascending: true })
    .limit(filter.limit);
  if (error) throw error;

  return (data ?? []).map(normalizeRecipe);
}

interface UseMealPlansResult {
  /** Immer sieben Tage, Mo–So. */
  data: MealPlanDay[];
  isLoading: boolean;
  /** True während eines Pull-to-Refresh oder eines Hintergrund-Refetch. */
  isRefetching: boolean;
  error: unknown;
  /** Auf `() => void` verengt: Aufrufer reichen das direkt an `onRefresh`. */
  refetch: () => void;
}

/**
 * Der Wochenplan der Familie.
 *
 * `weekStart` wird selbst auf den Montag gezogen — ein Aufrufer, der irgendein
 * Datum aus der Woche übergibt, landet damit auf demselben Cache-Eintrag statt
 * einen siebten anzulegen.
 */
export function useMealPlans(weekStart: Date): UseMealPlansResult {
  const today = useToday();
  const start = useMemo(() => weekStartFor(weekStart), [weekStart]);

  const query = useQuery({
    queryKey: mealKeys.plan(toDateKey(start)),
    queryFn: () => fetchMealPlanWeek(start),
  });

  const data = useMemo(
    () => groupByDay(query.data ?? [], start, today),
    [query.data, start, today],
  );

  return {
    data,
    isLoading: query.isLoading,
    isRefetching: query.isRefetching,
    error: query.error,
    refetch: () => void query.refetch(),
  };
}

interface UseTodaysMealResult {
  /** `null`, wenn für diesen Slot nichts geplant ist — kein Fallback auf einen anderen. */
  entry: MealPlanEntryWithRecipe | null;
  /** `slotForTime` wählt nie `snack` — der Typ hält diese Garantie an einer Stelle. */
  slot: Exclude<MealSlot, "snack">;
  isLoading: boolean;
  error: unknown;
}

/**
 * Die Mahlzeit für jetzt — ein Selektor auf `useMealPlans`, keine eigene Query.
 * Heute liegt per Definition in der aktuellen Woche, der Cache-Eintrag existiert
 * also ohnehin; ein eigener Key wäre eine zweite Kopie derselben Zeile, die
 * keine spätere Mutation invalidiert. Analog zu `useTask` in features/tasks.
 */
export function useTodaysMeal(): UseTodaysMealResult {
  const today = useToday();
  const weekStart = useMemo(() => weekStartFor(today), [today]);
  const { data, isLoading, error } = useMealPlans(weekStart);

  // Der Slot wird pro Render aus der Uhrzeit gelesen und aktualisiert sich nicht
  // von selbst, wenn 11:00 oder 15:00 bei offenem Screen vergeht (docs/TODO.md).
  const slot = slotForTime(new Date());

  const entry = useMemo(() => data.find((day) => day.isToday)?.slots[slot] ?? null, [data, slot]);

  return { entry, slot, isLoading, error };
}

/**
 * Ein einzelnes Rezept — hier doch eine eigene Query, weil die Rezeptliste
 * gefiltert und limitiert ist: ein Rezept aus einem Wochenplan-Eintrag muss in
 * ihr nicht vorkommen. Pool-Rezepte sind serverseitig unveränderlich, daher der
 * lange `staleTime`.
 */
export function useRecipeById(id: string): UseQueryResult<RecipeRow | null, Error> {
  return useQuery({
    queryKey: mealKeys.recipe(id),
    queryFn: () => fetchRecipeById(id),
    enabled: !!id,
    staleTime: 5 * 60_000,
  });
}

/**
 * Der Rezept-Pool. `keepPreviousData`, damit die Liste beim Tippen nicht auf
 * `isLoading` zurückfällt und weiß blinkt.
 *
 * Der Filter wird pro Render neu normalisiert; React Query hasht Query-Keys
 * strukturell, ein frisches Objekt gleichen Inhalts trifft also denselben
 * Cache-Eintrag.
 */
export function useRecipes(filter: RecipeFilter = {}): UseQueryResult<RecipeRow[], Error> {
  const normalized = normalizeRecipeFilter(filter);

  return useQuery({
    queryKey: mealKeys.recipes(normalized),
    queryFn: () => fetchRecipes(normalized),
    placeholderData: keepPreviousData,
  });
}
