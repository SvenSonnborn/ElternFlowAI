import { fireEvent, screen } from "@testing-library/react-native";

import type { RecipeAllergenVerdict, RecipeRow } from "@/features/meals";

import { renderScreen } from "@/testing/renderScreen";

import { MealHeroCard } from "./MealHeroCard";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

const recipe = { id: "r1", title: { de: "Garnelen", en: "Prawns" }, duration_min: 20 } as RecipeRow;
const alternative = { id: "r2", title: { de: "Nudeln", en: "Pasta" } } as RecipeRow;
const verdict = {
  status: "unsafe",
  hits: [],
  unverifiedReasons: [],
} as unknown as RecipeAllergenVerdict;

describe("MealHeroCard", () => {
  it("löst den Tausch aus und benennt das Ausweichgericht im Label", async () => {
    const onSwapAlternative = jest.fn();
    await renderScreen(
      <MealHeroCard
        recipe={recipe}
        slot="dinner"
        verdict={verdict}
        alternative={alternative}
        onOpenRecipe={jest.fn()}
        onSwapAlternative={onSwapAlternative}
      />,
    );

    const button = screen.getByText("Stattdessen kochen");
    await fireEvent.press(button);
    expect(onSwapAlternative).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText(/Nudeln/)).toBeTruthy();
  });

  it("zeigt ohne Ausweichgericht keinen Tausch-Knopf", async () => {
    await renderScreen(
      <MealHeroCard
        recipe={recipe}
        slot="dinner"
        verdict={verdict}
        alternative={null}
        onOpenRecipe={jest.fn()}
        onSwapAlternative={jest.fn()}
      />,
    );
    expect(screen.queryByText("Stattdessen kochen")).toBeNull();
  });
});
