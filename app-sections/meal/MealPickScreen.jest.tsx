import { fireEvent, screen } from "@testing-library/react-native";
import { router } from "expo-router";

import type { RecipeRow } from "@/features/meals";

import { mealKeys, normalizeRecipeFilter } from "@/features/meals";
import { createTestQueryClient, renderScreen } from "@/testing/renderScreen";

import { MealPickScreen } from "./MealPickScreen";

const mockPlanRecipe = jest.fn();
const mockPlanning = { allergiesLoading: false, busy: false };
let mockParams: Record<string, string> = {};

jest.mock("@/app-sections/meal/useMealPlanning", () => ({
  useMealPlanning: () => ({ planRecipe: mockPlanRecipe, ...mockPlanning }),
}));

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  Stack: { Screen: () => null },
}));

const nudeln: RecipeRow = {
  id: "r1",
  title: { de: "Nudeln mit Tomatensoße", en: "Pasta" },
  description: null,
  ingredients: [],
  instructions: [],
  contains_allergens: [],
  created_at: "2026-09-01T00:00:00.000Z",
  created_by_family_id: null,
  diet_tags: [],
  difficulty: null,
  duration_min: 20,
  fetched_at: "2026-09-01T00:00:00.000Z",
  image_url: null,
  keywords: [],
  recipe_dedup_hash: "h1",
  servings: 4,
  source: "user_custom",
  source_external_id: null,
  source_url: null,
};

function seededClient() {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(mealKeys.recipes(normalizeRecipeFilter({ search: "" })), [nudeln]);
  return queryClient;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { date: "2026-10-28", slot: "dinner" };
  mockPlanning.allergiesLoading = false;
  mockPlanning.busy = false;
  mockPlanRecipe.mockResolvedValue("planned");
});

describe("MealPickScreen", () => {
  it("plant das getippte Rezept für Tag und Slot und schließt", async () => {
    await renderScreen(<MealPickScreen />, { queryClient: seededClient() });
    expect(screen.getByText("Abendessen · Mi, 28.10.")).toBeTruthy();
    await fireEvent.press(screen.getByText("Nudeln mit Tomatensoße"));
    expect(mockPlanRecipe).toHaveBeenCalledWith({
      recipe: nudeln,
      date: "2026-10-28",
      slot: "dinner",
    });
    expect(router.back).toHaveBeenCalled();
  });

  it("bleibt offen, wenn nicht eingeplant wurde", async () => {
    mockPlanRecipe.mockResolvedValue("cancelled");
    await renderScreen(<MealPickScreen />, { queryClient: seededClient() });
    await fireEvent.press(screen.getByText("Nudeln mit Tomatensoße"));
    expect(router.back).not.toHaveBeenCalled();
  });

  it("ignoriert Tipps, solange die Allergien laden", async () => {
    mockPlanning.allergiesLoading = true;
    await renderScreen(<MealPickScreen />, { queryClient: seededClient() });
    await fireEvent.press(screen.getByText("Nudeln mit Tomatensoße"));
    expect(mockPlanRecipe).not.toHaveBeenCalled();
  });

  it("gibt das Ersetzen-Ziel mit, wenn die Route es trägt", async () => {
    mockParams = { date: "2026-10-28", slot: "dinner", entryId: "e1", seenRecipeId: "r0" };
    await renderScreen(<MealPickScreen />, { queryClient: seededClient() });
    await fireEvent.press(screen.getByText("Nudeln mit Tomatensoße"));
    expect(mockPlanRecipe).toHaveBeenCalledWith({
      recipe: nudeln,
      date: "2026-10-28",
      slot: "dinner",
      replaceTarget: { entryId: "e1", seenRecipeId: "r0" },
    });
  });

  it("schließt sofort bei ungültigem Datum", async () => {
    mockParams = { date: "kaputt", slot: "dinner" };
    await renderScreen(<MealPickScreen />, { queryClient: seededClient() });
    expect(router.back).toHaveBeenCalled();
  });
});
