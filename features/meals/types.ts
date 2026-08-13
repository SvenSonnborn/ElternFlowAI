import type { Database } from "@/features/supabase/database.types";

export type MealSlot = Database["public"]["Enums"]["meal_slot_enum"];

/**
 * Ein Text in beiden Katalogsprachen. `de` ist laut CLAUDE.md die kanonische
 * Sprache und deshalb nicht optional — leer, wenn die Quelle nichts lieferte.
 */
export interface LocalizedText {
  de: string;
  en?: string;
}

export interface Ingredient {
  amount: string | null;
  unit: string | null;
  name: LocalizedText;
}

type DbRecipeRow = Database["public"]["Tables"]["recipes"]["Row"];

/**
 * Die Rezept-Zeile, nachdem `normalize.ts` die vier `jsonb`-Spalten dekodiert
 * hat. `Omit` statt eigenem Typ: alles Übrige hängt weiter an der generierten
 * Quelle und driftet beim nächsten Types-Regen nicht weg.
 */
export type RecipeRow = Omit<
  DbRecipeRow,
  "title" | "description" | "ingredients" | "instructions"
> & {
  title: LocalizedText;
  description: LocalizedText | null;
  ingredients: Ingredient[];
  instructions: LocalizedText[];
};

export type MealPlanEntryRow = Database["public"]["Tables"]["meal_plan_entries"]["Row"];

/**
 * Ein Wochenplan-Eintrag mit seinem Rezept. Singular `recipe` statt des
 * PostgREST-Namens `recipes`: der Fetcher schreibt die Zeile ohnehin um, um die
 * JSONB-Felder zu dekodieren. Nullable, weil PostgREST `null` für ein Embed
 * liefert, das RLS nicht freigibt.
 */
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
  search: string;
  excludeAllergens: string[];
  limit: number;
}
