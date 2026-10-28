import type { Ingredient } from "../types";
import type { AllergenKey } from "./keys";

import { scanIngredients } from "./classify";
import { isKnownDeclaredCode, keysForDeclaredCode } from "./terms";

export type AllergenSource = "declared" | "ingredient";

export interface AllergenHit {
  readonly key: AllergenKey;
  readonly source: AllergenSource;
  readonly evidence: string;
}

export type RecipeAllergenVerdict =
  | { status: "safe" }
  | { status: "unsafe"; hits: AllergenHit[] }
  | { status: "caution"; hits: AllergenHit[] }
  | { status: "unverified" };

/**
 * Strukturell getypt statt an `RecipeRow` gebunden: die spätere
 * Klassifizierungs-Edge-Function reicht ein einfaches Objekt herein und muss
 * dafür nicht die halbe Datenbank-Typdatei importieren.
 */
export interface JudgeableRecipe {
  readonly contains_allergens: readonly string[] | null;
  readonly ingredients: readonly Ingredient[];
}

export function judgeRecipe(
  recipe: JudgeableRecipe,
  familyKeys: readonly AllergenKey[],
): RecipeAllergenVerdict {
  // Nichts zu prüfen — und ohne diesen Kurzschluss stünde bei jeder Familie
  // ohne Allergie-Eintrag überall "nicht geprüft".
  if (familyKeys.length === 0) return { status: "safe" };

  const relevant = new Set(familyKeys);
  const declaredCodes = recipe.contains_allergens ?? [];

  const declaredHits: AllergenHit[] = [];
  let hasUnknownCode = false;

  for (const code of declaredCodes) {
    // Mehrzahl: ein mehrdeutiger Code wie `shellfish` meint Krebs- UND
    // Weichtiere und muss beide treffen.
    const keys = keysForDeclaredCode(code);
    if (keys.length === 0) {
      // Ein Code, den wir nicht auflösen können, ist keine Entwarnung: er
      // könnte in einem fremden Vokabular genau das gesuchte Allergen
      // benennen. `NO_ALLERGENS_CODE` ist die eine bekannte Ausnahme.
      if (!isKnownDeclaredCode(code)) hasUnknownCode = true;
      continue;
    }
    for (const key of keys) {
      if (relevant.has(key) && !declaredHits.some((hit) => hit.key === key)) {
        declaredHits.push({ key, source: "declared", evidence: code });
      }
    }
  }
  if (declaredHits.length > 0) return { status: "unsafe", hits: declaredHits };

  const ingredientHits = scanIngredients(recipe.ingredients)
    .filter((match) => relevant.has(match.key))
    .map((match): AllergenHit => ({ ...match, source: "ingredient" }));
  if (ingredientHits.length > 0) return { status: "caution", hits: ingredientHits };

  // Eine vollständig verstandene Deklaration ohne Treffer ist eine echte
  // Entwarnung. Eine leere ist keine — die Heuristik kann Anwesenheit belegen,
  // nie Abwesenheit —, und eine mit unbekanntem Code ebenfalls nicht.
  return declaredCodes.length > 0 && !hasUnknownCode
    ? { status: "safe" }
    : { status: "unverified" };
}

/**
 * Was `useFamilyAllergies` liefert — als Parameter, damit die Regel ohne React
 * testbar bleibt. `keys` gibt es nur im Zustand `known`: so kann kein Aufrufer
 * ein leeres Array als „keine Allergien" lesen, wenn die Daten fehlen.
 */
export type FamilyAllergyState =
  | { readonly kind: "known"; readonly keys: readonly AllergenKey[] }
  | { readonly kind: "loading" }
  | { readonly kind: "unknown" };

/** Der Teil einer TanStack-Query, den `familyAllergyKind` braucht. */
export interface AllergySource {
  readonly data: unknown;
  readonly error: unknown;
  readonly isFetching: boolean;
}

/**
 * Verdichtet die Query-Kette hinter den Familien-Allergien (Elternteil, Kinder,
 * Eltern) zu einem Zustand. Die erste passende Regel gewinnt:
 *
 * 1. irgendein `error` → `unknown`
 * 2. überall `data !== undefined` → `known` (`null` zählt: ein Elternteil ohne
 *    Zeile ist eine Antwort)
 * 3. irgendein `isFetching` → `loading`
 * 4. sonst → `unknown`
 *
 * Regel 3 nutzt `isFetching` statt `isLoading` und gilt über die **ganze**
 * Kette: Kinder und Eltern sind deaktiviert, bis das Elternteil seine
 * `family_id` liefert; in der Lücke dazwischen lädt keine von ihnen, die Kette
 * aber sehr wohl. Regel 4 fängt pausierte (Web offline) und deaktivierte
 * Queries ohne Daten ab — sie gelten bewusst als unbekannt, nicht als „lädt":
 * sonst wartete das Einplanen offline endlos.
 */
export function familyAllergyKind(sources: readonly AllergySource[]): FamilyAllergyState["kind"] {
  if (sources.some((source) => Boolean(source.error))) return "unknown";
  if (sources.every((source) => source.data !== undefined)) return "known";
  if (sources.some((source) => source.isFetching)) return "loading";
  return "unknown";
}

/**
 * Das Urteil **inklusive** des Zustands der Familien-Allergien.
 *
 * Ein leeres `keys` heißt für `judgeRecipe` „diese Familie hat keine Allergien"
 * und ergibt `safe` — bei `loading` und `unknown` wäre das eine Entwarnung, die
 * niemand geben kann. Bei einem Gesundheitsfeature ist das die falsche
 * Richtung: solange wir es nicht wissen, sagen wir „nicht geprüft".
 *
 * Die Regel steht hier statt in jedem Screen, der urteilt — sonst hätte sie ab
 * dem zweiten Aufrufer zwei Definitionen, die auseinanderlaufen können.
 */
export function judgeWithAllergyState(
  recipe: JudgeableRecipe,
  allergies: FamilyAllergyState,
): RecipeAllergenVerdict {
  if (allergies.kind !== "known") return { status: "unverified" };
  return judgeRecipe(recipe, allergies.keys);
}

/** Der schmale Boolean für Aufrufer ohne Bedarf an Nuancen — etwa die KI-Vorschlagslogik. */
export function isRecipeSafeForFamily(
  recipe: JudgeableRecipe,
  familyKeys: readonly AllergenKey[],
): boolean {
  return judgeRecipe(recipe, familyKeys).status === "safe";
}

/**
 * Die betroffenen Keys — als `AllergenKey`, nicht als Rezept-Code: lokalisierte
 * Labels gibt es nur für die Keys (`onb.s4.allergies.<key>`), ein rohes `wheat`
 * hätte keinen Katalog-Eintrag fürs Badge.
 */
export function matchedAllergens(
  recipe: JudgeableRecipe,
  familyKeys: readonly AllergenKey[],
): AllergenKey[] {
  const verdict = judgeRecipe(recipe, familyKeys);
  if (verdict.status === "safe" || verdict.status === "unverified") return [];
  return [...new Set(verdict.hits.map((hit) => hit.key))].sort();
}
