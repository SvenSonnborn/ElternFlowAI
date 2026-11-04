import { fireEvent, screen } from "@testing-library/react-native";

import { useThemeStore } from "@/design-system/themeStore";
import i18n from "@/features/i18n";
import { renderScreen } from "@/testing/renderScreen";

import { SettingsScreen } from "./SettingsScreen";

jest.mock("@/features/auth", () => ({
  ...jest.requireActual<typeof import("@/features/auth")>("@/features/auth"),
  useSession: () => ({ session: null }),
  useCurrentParent: () => ({ data: undefined }),
  useFamilyParents: () => ({ data: undefined }),
  useFamilyChildren: () => ({ data: undefined }),
  useSignOut: () => ({ mutate: jest.fn() }),
}));

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn(), canGoBack: () => true },
  Stack: { Screen: () => null },
}));

describe("SettingsScreen: Dunkles Design ist eine Bedienstelle", () => {
  it("die Zeile ist der einzige Schalter und wechselt das Theme", async () => {
    await renderScreen(<SettingsScreen />);
    const name = i18n.t("set.darkMode");

    // Der RN-Schalter in der Zeile ist verborgen und zählt nicht mit.
    expect(screen.getAllByRole("switch")).toHaveLength(1);
    expect(screen.getByRole("switch", { name })).not.toBeChecked();
    await fireEvent.press(screen.getByRole("switch", { name }));

    expect(useThemeStore.getState().themeName).toBe("dark");
    expect(screen.getByRole("switch", { name })).toBeChecked();
  });
});
