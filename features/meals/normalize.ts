import type { Database, Json } from "@/features/supabase/database.types";

import type { Ingredient, LocalizedText, RecipeRow } from "./types";

type DbRecipeRow = Database["public"]["Tables"]["recipes"]["Row"];

/** Der einzige `Json`-Fall, in dem Key-Zugriff erlaubt ist. */
function asRecord(value: Json | undefined): { [key: string]: Json | undefined } | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}

/** Ein Skalar als getrimmter String, oder `null`. Zahlen kommen aus dem Crawler vor. */
function asScalar(value: Json | undefined): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  return null;
}

function isEmpty(text: LocalizedText): boolean {
  return !text.de && !text.en;
}

/**
 * `jsonb` garantiert keine Form, also wird hier geraten — defensiv und ohne zu
 * werfen. Ein einzelnes kaputtes Rezept aus dem Crawler darf nicht den ganzen
 * Wochenplan abschießen.
 */
export function toLocalizedText(value: Json | undefined): LocalizedText {
  if (typeof value === "string") return { de: value };

  const record = asRecord(value);
  if (!record) return { de: "" };

  const de = typeof record.de === "string" ? record.de : "";
  const en = typeof record.en === "string" ? record.en : "";
  return en ? { de, en } : { de };
}

/** Wie `toLocalizedText`, aber ein durchweg leerer Text wird zu `null`. */
export function toOptionalLocalizedText(value: Json | null): LocalizedText | null {
  if (value === null) return null;
  const text = toLocalizedText(value);
  return isEmpty(text) ? null : text;
}

export function toIngredients(value: Json): Ingredient[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    const record = asRecord(item);
    if (!record) return [];

    const name = toLocalizedText(record.name);
    // Ohne Namen ist die Zutat unbrauchbar — Menge und Einheit allein sagen nichts.
    if (isEmpty(name)) return [];

    return [{ amount: asScalar(record.amount), unit: asScalar(record.unit), name }];
  });
}

export function toInstructions(value: Json): LocalizedText[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((step) => {
    const text = toLocalizedText(step);
    return isEmpty(text) ? [] : [text];
  });
}

export function normalizeRecipe(row: DbRecipeRow): RecipeRow {
  const { title, description, ingredients, instructions, ...rest } = row;

  return {
    ...rest,
    title: toLocalizedText(title),
    description: toOptionalLocalizedText(description),
    ingredients: toIngredients(ingredients),
    instructions: toInstructions(instructions),
  };
}

/**
 * Der Text in der gewünschten Sprache, sonst in der anderen. DE ist die
 * kanonische Sprache, aber ein leeres Feld ist keine Übersetzung, sondern eine
 * Lücke — deshalb greift der Fallback in beide Richtungen.
 */
export function localize(text: LocalizedText | null | undefined, lang: string): string {
  if (!text) return "";

  const preferEn = lang.startsWith("en");
  const primary = preferEn ? text.en : text.de;
  const fallback = preferEn ? text.de : text.en;

  if (primary?.trim()) return primary;
  return fallback ?? "";
}

/**
 * Macht eine Nutzereingabe für `ilike` harmlos. `%` und `_` sind LIKE-Platzhalter
 * und werden maskiert; `*` lässt sich nicht maskieren, weil PostgREST es vor der
 * Abfrage selbst durch `%` ersetzt — es fliegt deshalb raus.
 */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (char) => `\\${char}`).replace(/\*/g, "");
}
