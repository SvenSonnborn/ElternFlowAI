import { fireEvent, screen } from "@testing-library/react-native";

import { touchTarget } from "@/design-system";
import i18n from "@/features/i18n";
import { renderScreen } from "@/testing/renderScreen";

import { ChildProfileScreen } from "./ChildProfileScreen";

const mockMutation = { mutateAsync: jest.fn(), isPending: false, error: null };

jest.mock("@/features/auth", () => ({
  ...jest.requireActual<typeof import("@/features/auth")>("@/features/auth"),
  useCurrentParent: () => ({ data: { id: "p1", family_id: "f1" } }),
  useChild: () => ({
    data: {
      id: "c1",
      name: "Mia",
      birthday: "2018-03-01",
      color: "#14B8A6",
      school: null,
      grade: null,
      allergies: ["gluten"],
      likes: ["Nudeln"],
      dislikes: [],
    },
    isLoading: false,
    isError: false,
  }),
  useCreateChild: () => mockMutation,
  useUpdateChild: () => mockMutation,
  useDeleteChild: () => mockMutation,
}));

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "c1" }),
  router: { canGoBack: () => true, back: jest.fn(), replace: jest.fn(), push: jest.fn() },
  Stack: { Screen: () => null },
}));

const box = { minWidth: touchTarget.min, minHeight: touchTarget.min };

describe("ChildProfileScreen: Tippflächen im Inhalt", () => {
  it("Tag-Pillen sind Knöpfe mit Namen aus dem Text und 44er-Box", async () => {
    await renderScreen(<ChildProfileScreen />);
    expect(screen.getByRole("button", { name: "Nudeln" })).toHaveStyle(box);
  });

  it("Allergie-Chips liegen in 44er-Boxen", async () => {
    await renderScreen(<ChildProfileScreen />);
    expect(screen.getByRole("checkbox", { name: i18n.t("onb.s4.allergies.gluten") })).toHaveStyle(
      box,
    );
    expect(screen.getByRole("checkbox", { name: i18n.t("onb.s4.allergies.eggs") })).toHaveStyle(
      box,
    );
  });

  it("das Plus im Tag-Feld ist eine 44er-Box und fügt hinzu", async () => {
    await renderScreen(<ChildProfileScreen />);
    const input = screen.getByLabelText(i18n.t("child.likes"));
    await fireEvent.changeText(input, "Pizza");
    const plus = screen.getByRole("button", { name: i18n.t("child.likesAdd") });
    expect(plus).toHaveStyle(box);
    await fireEvent.press(plus);
    expect(screen.getByRole("button", { name: "Pizza" })).toBeTruthy();
  });
});
