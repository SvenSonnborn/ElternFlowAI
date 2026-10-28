import { screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { createTestQueryClient, renderScreen } from "@/testing/renderScreen";

import type { FamilyAllergyState } from "./allergens";
import type { RecipeRow } from "./types";

import { mealKeys, normalizeRecipeFilter } from "./queries";
import { useMealAlternative } from "./useMealAlternative";

let mockAllergies: FamilyAllergyState = { kind: "known", keys: [] };

jest.mock("./useFamilyAllergies", () => ({ useFamilyAllergies: () => mockAllergies }));

function recipe(id: string): RecipeRow {
  return {
    id,
    title: { de: id, en: id },
    description: null,
    ingredients: [],
    instructions: [],
    contains_allergens: [],
  } as unknown as RecipeRow;
}

function Probe() {
  const alternative = useMealAlternative({ enabled: true, seed: "2026-10-28-dinner" });
  return <Text testID="out">{alternative?.id ?? "keins"}</Text>;
}

async function renderProbe() {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(mealKeys.recipes(normalizeRecipeFilter({})), [
    recipe("r1"),
    recipe("r2"),
  ]);
  await renderScreen(<Probe />, { queryClient });
  return screen.getByTestId("out").props.children as string;
}

describe("useMealAlternative", () => {
  it("macht ohne bekannte Allergien keinen Vorschlag, auch wenn Rezepte im Cache liegen", async () => {
    mockAllergies = { kind: "unknown" };
    expect(await renderProbe()).toBe("keins");
  });

  it("schlägt mit bekannten Allergien ein Rezept vor", async () => {
    mockAllergies = { kind: "known", keys: [] };
    expect(["r1", "r2"]).toContain(await renderProbe());
  });
});
