export {
  ALLERGEN_KEYS,
  isAllergenKey,
  isRecipeSafeForFamily,
  judgeRecipe,
  judgeWithAllergyState,
  keysForDeclaredCode,
  matchedAllergens,
  mergeAllergies,
  scanIngredients,
  scanText,
  type AllergenHit,
  type AllergenKey,
  type AllergenSource,
  type FamilyAllergyState,
  type JudgeableRecipe,
  type RecipeAllergenVerdict,
} from "./allergens";
export { pickAlternative } from "./alternative";
export {
  mapMealError,
  MealSlotOccupiedError,
  MissingParentError,
  type MealErrorKey,
} from "./errors";
export {
  createSupabaseMealOps,
  planMeal,
  removeMeal,
  replaceMeal,
  type MealOps,
  type MealParent,
  type PlanMealVars,
  type RemoveMealVars,
  type ReplaceMealVars,
} from "./mutations";
export {
  applyPlan,
  applyRemove,
  applyReplace,
  isOptimisticEntry,
  OPTIMISTIC_ID_PREFIX,
  optimisticEntry,
  patchMealWeek,
  restoreMealWeek,
  type MealWeekSnapshot,
} from "./optimistic";
export {
  findPendingMealDelete,
  usePendingMealIds,
  withoutPendingMealDeletes,
  type PendingMealDelete,
} from "./pendingDeletes";
export {
  escapeLike,
  formatAmount,
  localize,
  normalizeRecipe,
  toIngredients,
  toInstructions,
  toLocalizedText,
  toOptionalLocalizedText,
} from "./normalize";
export {
  fetchMealPlanWeek,
  fetchRecipeById,
  fetchRecipes,
  mealKeys,
  normalizeRecipeFilter,
  useMealPlans,
  useRecipeById,
  useRecipes,
  useTodaysMeal,
} from "./queries";
export type {
  Ingredient,
  LocalizedText,
  MealPlanDay,
  MealPlanEntryRow,
  MealPlanEntryWithRecipe,
  MealSlot,
  NormalizedRecipeFilter,
  RecipeFilter,
  RecipeRow,
} from "./types";
export { useFamilyAllergies } from "./useFamilyAllergies";
export { useMealAlternative } from "./useMealAlternative";
export { usePlanMeal, useRemoveMeal, useReplaceMeal } from "./useMealMutations";
export { useRecipeJudge } from "./useRecipeJudge";
export {
  formatWeekRange,
  groupByDay,
  nextSlotBoundary,
  slotForTime,
  toDateKey,
  weekDayKeys,
  weekStartFor,
} from "./week";
