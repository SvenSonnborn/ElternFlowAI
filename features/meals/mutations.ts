import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/features/supabase/database.types";

import type { MealPlanEntryWithRecipe, MealSlot, RecipeRow } from "./types";

import { MealSlotOccupiedError } from "./errors";
import { normalizeRecipe } from "./normalize";

const ENTRY_SELECT = "*, recipes(*)";

export interface PlanMealVars {
  /** `yyyy-MM-dd`, ein lokaler Kalendertag. */
  date: string;
  slot: MealSlot;
  recipe: RecipeRow;
}

export interface ReplaceMealVars {
  entryId: string;
  /** Die `recipe_id`, die der Nutzer auf dem Platz *gesehen* hat. */
  seenRecipeId: string;
  /** Platz des Eintrags — für die Nachlese und den Fallback auf Einplanen. */
  date: string;
  slot: MealSlot;
  recipe: RecipeRow;
}

export interface RemoveMealVars {
  entryId: string;
  /** Die `recipe_id`, die der Nutzer auf dem Platz *gesehen* hat. */
  seenRecipeId: string;
  date: string;
  slot: MealSlot;
}

/** Die Spalten der Eltern-Zeile, die der Schreibpfad braucht. */
export interface MealParent {
  id: string;
  family_id: string;
}

type EntryWithEmbed = Database["public"]["Tables"]["meal_plan_entries"]["Row"] & {
  recipes: Database["public"]["Tables"]["recipes"]["Row"] | null;
};

/** Wie `fetchMealPlanWeek`: singular `recipe`, JSONB-Felder dekodiert. */
function toEntry({ recipes, ...entry }: EntryWithEmbed): MealPlanEntryWithRecipe {
  return { ...entry, recipe: recipes ? normalizeRecipe(recipes) : null };
}

/**
 * Der Schnitt, an dem der Schreibpfad die Datenbank berührt — dasselbe Muster
 * wie `TaskOps` in [features/tasks/mutations.ts](../tasks/mutations.ts).
 *
 * **Die Ops melden, die reinen Funktionen urteilen.** `updateRecipe` und
 * `deleteEntry` liefern `false` bei null getroffenen Zeilen, statt zu werfen;
 * ob das „fremde Änderung" oder „schon erledigt" heißt, entscheidet die
 * Nachlese in `replaceMeal`/`removeMeal`.
 */
export interface MealOps {
  /** Der Eintrag auf dem Platz samt Rezept, oder `null`, wenn er frei ist. */
  fetchSlot: (date: string, slot: MealSlot) => Promise<MealPlanEntryWithRecipe | null>;
  /** `"taken"`, wenn der Platz belegt ist (Postgres `23505`). */
  insertEntry: (row: {
    family_id: string;
    created_by: string;
    date: string;
    meal_slot: MealSlot;
    recipe_id: string;
  }) => Promise<MealPlanEntryWithRecipe | "taken">;
  /** `true`, wenn der Eintrag noch das gesehene Rezept trug und getauscht wurde. */
  updateRecipe: (entryId: string, seenRecipeId: string, recipeId: string) => Promise<boolean>;
  /** `true`, wenn der Eintrag noch das gesehene Rezept trug und gelöscht wurde. */
  deleteEntry: (entryId: string, seenRecipeId: string) => Promise<boolean>;
}

/**
 * Kapselt die PostgREST-Aufrufe des Essensplans.
 *
 * `meal_plan_entries` hat kein `updated_at`, also ist die gesehene
 * `recipe_id` das Compare-and-Swap-Token: `.eq("recipe_id", seen)` trifft nur,
 * solange niemand das Rezept des Platzes geändert hat. `.select("id")
 * .maybeSingle()` ist die andere Hälfte — **ohne sie meldet PostgREST bei null
 * Zeilen `error: null`**, und „gelungen" ließe sich nicht von „nichts
 * passiert" unterscheiden (vgl. `createSupabaseTaskOps`).
 */
export function createSupabaseMealOps(client: SupabaseClient<Database>): MealOps {
  return {
    fetchSlot: async (date, slot) => {
      const { data, error } = await client
        .from("meal_plan_entries")
        .select(ENTRY_SELECT)
        .eq("date", date)
        .eq("meal_slot", slot)
        .maybeSingle();
      if (error) throw error;
      return data ? toEntry(data) : null;
    },

    insertEntry: async (row) => {
      const { data, error } = await client
        .from("meal_plan_entries")
        .insert(row)
        .select(ENTRY_SELECT)
        .single();
      // `unique (family_id, date, meal_slot)`: Ein Elternteil war schneller.
      if (error) {
        if (error.code === "23505") return "taken";
        throw error;
      }
      return toEntry(data);
    },

    updateRecipe: async (entryId, seenRecipeId, recipeId) => {
      const { data, error } = await client
        .from("meal_plan_entries")
        .update({ recipe_id: recipeId })
        .eq("id", entryId)
        .eq("recipe_id", seenRecipeId)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      return data !== null;
    },

    deleteEntry: async (entryId, seenRecipeId) => {
      const { data, error } = await client
        .from("meal_plan_entries")
        .delete()
        .eq("id", entryId)
        .eq("recipe_id", seenRecipeId)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      return data !== null;
    },
  };
}

/**
 * Plant ein Rezept auf einen Platz.
 *
 * Das INSERT ist der Detektor: Trifft es die Eindeutigkeit, hat ein anderer
 * Elternteil den Platz zwischenzeitlich belegt — dann wird gelesen und
 * `MealSlotOccupiedError` mit dem frischen Eintrag geworfen, damit der Aufrufer
 * den Ersetzen-Dialog zeigen kann statt eines Fehler-Toasts. Ist der Platz bei
 * der Nachlese schon wieder frei (jemand hat gelöscht), gibt es genau einen
 * zweiten Versuch; mehr wäre eine Schleife gegen einen, der im Takt ein- und
 * auslöscht.
 */
export async function planMeal(
  vars: PlanMealVars,
  parent: MealParent,
  deps: MealOps,
): Promise<MealPlanEntryWithRecipe> {
  const row = {
    family_id: parent.family_id,
    created_by: parent.id,
    date: vars.date,
    meal_slot: vars.slot,
    recipe_id: vars.recipe.id,
  };

  const first = await deps.insertEntry(row);
  if (first !== "taken") return first;

  const current = await deps.fetchSlot(vars.date, vars.slot);
  if (current) throw new MealSlotOccupiedError(current);

  const second = await deps.insertEntry(row);
  if (second !== "taken") return second;

  const latest = await deps.fetchSlot(vars.date, vars.slot);
  if (latest) throw new MealSlotOccupiedError(latest);
  throw new Error("Meal slot flipped between taken and free");
}

/**
 * Tauscht das Rezept eines Eintrags, solange der Platz noch trägt, was der
 * Nutzer gesehen hat. Gelesen wird erst, wenn das Compare-and-Swap verfehlt:
 * Der Normalfall kostet keinen zusätzlichen Roundtrip.
 *
 * Verfehlt es, gibt es drei Fälle: Der Platz ist leer (jemand hat gelöscht —
 * dann wird eingeplant, die Absicht „dieses Rezept dort" bleibt erfüllbar),
 * er trägt schon das Zielrezept (nichts zu tun) oder ein anderes (fremde
 * Änderung, der Aufrufer fragt neu).
 */
export async function replaceMeal(
  vars: ReplaceMealVars,
  parent: MealParent,
  deps: MealOps,
): Promise<void> {
  const hit = await deps.updateRecipe(vars.entryId, vars.seenRecipeId, vars.recipe.id);
  if (hit) return;

  const current = await deps.fetchSlot(vars.date, vars.slot);
  if (!current) {
    await planMeal({ date: vars.date, slot: vars.slot, recipe: vars.recipe }, parent, deps);
    return;
  }
  if (current.recipe_id === vars.recipe.id) return;
  throw new MealSlotOccupiedError(current);
}

/**
 * Löscht einen Eintrag, solange er noch das gesehene Rezept trägt. **Ein
 * bereits leerer Platz ist ein Erfolg:** Die Absicht ist erfüllt, gleich wessen
 * DELETE sie erwischt hat. Trägt der Platz dagegen etwas anderes, wäre Löschen
 * ein Überschreiben fremder Arbeit — das meldet der Fehler.
 */
export async function removeMeal(vars: RemoveMealVars, deps: MealOps): Promise<void> {
  const hit = await deps.deleteEntry(vars.entryId, vars.seenRecipeId);
  if (hit) return;

  const current = await deps.fetchSlot(vars.date, vars.slot);
  if (!current) return;
  throw new MealSlotOccupiedError(current);
}
