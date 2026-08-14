export { scanIngredients, scanText, type TermMatch } from "./classify";
export { fold } from "./fold";
export {
  isRecipeSafeForFamily,
  judgeRecipe,
  matchedAllergens,
  type AllergenHit,
  type AllergenSource,
  type JudgeableRecipe,
  type RecipeAllergenVerdict,
} from "./judge";
export { ALLERGEN_KEYS, isAllergenKey, type AllergenKey } from "./keys";
export { mergeAllergies, type AllergyBearer } from "./members";
export {
  ALLERGEN_SPECS,
  isKnownDeclaredCode,
  keyForDeclaredCode,
  NO_ALLERGENS_CODE,
  type AllergenSpec,
  type MatchMode,
  type Term,
} from "./terms";
