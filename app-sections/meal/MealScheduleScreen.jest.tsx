import { act, fireEvent, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import { Alert, type AlertButton } from "react-native";

import type { MealPlanEntryWithRecipe, RecipeRow } from "@/features/meals";
import type { FamilyAllergyState } from "@/features/meals/allergens";

import { useToastStore } from "@/app-sections/shared";
import i18n from "@/features/i18n";
import { mealKeys, slotForTime, toDateKey, weekStartFor } from "@/features/meals";
import { createTestQueryClient, renderScreen } from "@/testing/renderScreen";

import { MealScheduleScreen } from "./MealScheduleScreen";

const mockPlan = jest.fn();
const mockReplace = jest.fn();
let mockAllergies: FamilyAllergyState = { kind: "known", keys: [] };
let mockParams: Record<string, string> = {};

// Nur die Schreib-Hooks und die Allergien werden ersetzt: `useMealPlanning`
// samt Dialogen und `runPlanning` laufen echt — das ist der Zweck dieses Tests.
jest.mock("@/features/meals", () => ({
  ...jest.requireActual<typeof import("@/features/meals")>("@/features/meals"),
  usePlanMeal: () => ({ mutateAsync: mockPlan }),
  useReplaceMeal: () => ({ mutateAsync: mockReplace }),
  useFamilyAllergies: () => mockAllergies,
}));

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  Stack: { Screen: () => null },
}));

function recipe(id: string, de: string): RecipeRow {
  return {
    id,
    title: { de, en: de },
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
    recipe_dedup_hash: id,
    servings: 4,
    source: "user_custom",
    source_external_id: null,
    source_url: null,
  };
}

const R = recipe("r-new", "Linsensuppe");
const spaghetti = recipe("r-old", "Spaghetti");

const now = new Date();
const slot = slotForTime(now);
const E: MealPlanEntryWithRecipe = {
  id: "e1",
  family_id: "f1",
  date: toDateKey(now),
  meal_slot: slot,
  recipe_id: "r-old",
  recipe: spaghetti,
} as unknown as MealPlanEntryWithRecipe;

function client(occupied: boolean) {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(mealKeys.recipe(R.id), R);
  queryClient.setQueryData(
    mealKeys.plan(toDateKey(weekStartFor(now))),
    occupied ? [E] : ([] as MealPlanEntryWithRecipe[]),
  );
  return queryClient;
}

function lastDialog() {
  const spy = jest.spyOn(Alert, "alert");
  return spy;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { recipeId: "r-new" };
  mockPlan.mockResolvedValue(undefined);
  mockReplace.mockResolvedValue(undefined);
  mockAllergies = { kind: "known", keys: [] };
  useToastStore.getState().clear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("MealScheduleScreen", () => {
  it("fragt bei belegtem Platz nach und ersetzt nach „Ja, ersetzen“", async () => {
    const alertSpy = lastDialog();
    await renderScreen(<MealScheduleScreen />, { queryClient: client(true) });
    await fireEvent.press(screen.getByRole("button", { name: i18n.t("meals.schedule.submit") }));

    expect(alertSpy).toHaveBeenCalledTimes(1);
    const [title, body, buttons] = alertSpy.mock.calls[0] as [string, string, AlertButton[]];
    expect(title).toBe(i18n.t("meals.planning.replaceTitle"));
    expect(body).toContain("Spaghetti");

    const confirm = buttons.find((b) => b.text === i18n.t("meals.planning.replaceConfirm"));
    await act(() => {
      confirm?.onPress?.();
    });
    expect(mockReplace).toHaveBeenCalledWith({
      date: toDateKey(now),
      slot,
      entryId: "e1",
      seenRecipeId: "r-old",
      recipe: R,
    });
    expect(mockPlan).not.toHaveBeenCalled();
    expect(router.back).toHaveBeenCalled();
  });

  it("zeigt ein gescheitertes Ersetzen als Zeile im Sheet und bleibt offen", async () => {
    // Ein Toast läge auf iOS unter dem Sheet; die Zeile muss im Sheet stehen.
    mockReplace.mockRejectedValue(new Error("netz"));
    const alertSpy = lastDialog();
    await renderScreen(<MealScheduleScreen />, { queryClient: client(true) });
    expect(screen.queryByText(i18n.t("meals.error.generic"))).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: i18n.t("meals.schedule.submit") }));

    const buttons = alertSpy.mock.calls[0][2] as AlertButton[];
    const confirm = buttons.find((b) => b.text === i18n.t("meals.planning.replaceConfirm"));
    await act(() => {
      confirm?.onPress?.();
    });

    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(screen.getByText(i18n.t("meals.error.generic"))).toBeTruthy();
    expect(useToastStore.getState().toasts).toHaveLength(0);
    expect(router.back).not.toHaveBeenCalled();
  });

  it("schließt, wenn es das Rezept nicht gibt", async () => {
    mockParams = { recipeId: "r-unknown" };
    const queryClient = createTestQueryClient();
    // Die Query ist fertig und hat nichts gefunden (`fetchRecipeById` → `null`).
    queryClient.setQueryData(mealKeys.recipe("r-unknown"), null);
    await renderScreen(<MealScheduleScreen />, { queryClient });
    expect(router.back).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: i18n.t("meals.schedule.submit") })).toBeNull();
  });

  it("schließt ohne recipeId", async () => {
    mockParams = {};
    await renderScreen(<MealScheduleScreen />, { queryClient: client(false) });
    expect(router.back).toHaveBeenCalled();
  });

  it("schreibt bei „Nein“ nichts und bleibt offen", async () => {
    const alertSpy = lastDialog();
    await renderScreen(<MealScheduleScreen />, { queryClient: client(true) });
    await fireEvent.press(screen.getByRole("button", { name: i18n.t("meals.schedule.submit") }));
    const buttons = alertSpy.mock.calls[0][2] as AlertButton[];
    const cancel = buttons.find((b) => b.text === i18n.t("meals.planning.replaceCancel"));
    await act(() => {
      cancel?.onPress?.();
    });
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockPlan).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });

  it("plant einen freien Platz, zeigt einen Toast und geht zurück", async () => {
    const alertSpy = lastDialog();
    await renderScreen(<MealScheduleScreen />, { queryClient: client(false) });
    await fireEvent.press(screen.getByRole("button", { name: i18n.t("meals.schedule.submit") }));

    expect(alertSpy).not.toHaveBeenCalled();
    expect(mockPlan).toHaveBeenCalledTimes(1);
    expect(router.back).toHaveBeenCalled();
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.variant).toBe("success");
  });

  it("sperrt „Einplanen“, solange die Allergien laden", async () => {
    mockAllergies = { kind: "loading" };
    await renderScreen(<MealScheduleScreen />, { queryClient: client(false) });
    const submit = screen.getByRole("button", { name: i18n.t("meals.schedule.submit") });
    expect(submit).toBeDisabled();
    await fireEvent.press(submit);
    expect(mockPlan).not.toHaveBeenCalled();
  });

  it("markiert den vorbelegten Slot als gewählt", async () => {
    await renderScreen(<MealScheduleScreen />, { queryClient: client(false) });
    const chosen = screen.getByRole("button", { name: i18n.t(`meals.tabs.${slot}`) });
    expect(chosen.props.accessibilityState).toMatchObject({ selected: true });
  });
});
