import { fireEvent, screen } from "@testing-library/react-native";
import { router } from "expo-router";

import { useToastStore } from "@/app-sections/shared";
import i18n from "@/features/i18n";
import { renderScreen } from "@/testing/renderScreen";

import { NewPasswordScreen } from "./NewPasswordScreen";

const mockUpdate = { mutateAsync: jest.fn(), isPending: false, error: null };
const mockSignOut = { mutateAsync: jest.fn(), isPending: false, error: null };

jest.mock("@/features/auth", () => ({
  ...jest.requireActual<typeof import("@/features/auth")>("@/features/auth"),
  useUpdatePassword: () => mockUpdate,
  useSignOut: () => mockSignOut,
}));

jest.mock("expo-router", () => ({
  router: { replace: jest.fn() },
}));

async function submit() {
  await renderScreen(<NewPasswordScreen />);
  await fireEvent.changeText(
    screen.getByLabelText(i18n.t("auth.newPassword.newField")),
    "Sicher#2026",
  );
  await fireEvent.changeText(
    screen.getByLabelText(i18n.t("auth.newPassword.confirmField")),
    "Sicher#2026",
  );
  await fireEvent.press(screen.getByText(i18n.t("auth.newPassword.save")));
}

describe("NewPasswordScreen: Erfolgsmeldung", () => {
  beforeEach(() => {
    useToastStore.getState().clear();
    jest.clearAllMocks();
    mockUpdate.mutateAsync.mockResolvedValue(undefined);
    mockSignOut.mutateAsync.mockResolvedValue(undefined);
  });

  it("meldet den Passwortwechsel als success-Toast und wechselt zum Login", async () => {
    await submit();
    expect(useToastStore.getState().toasts[0]).toMatchObject({
      title: i18n.t("auth.newPassword.saved"),
      variant: "success",
      position: "top",
    });
    expect(router.replace).toHaveBeenCalledWith("/(auth)/login");
  });

  it("zeigt den Toast auch, wenn das Abmelden scheitert", async () => {
    mockSignOut.mutateAsync.mockRejectedValue(new Error("signOut"));
    await submit();
    expect(useToastStore.getState().toasts).toHaveLength(1);
    expect(router.replace).toHaveBeenCalledWith("/(auth)/login");
  });

  it("ohne gespeichertes Passwort kein Toast", async () => {
    mockUpdate.mutateAsync.mockRejectedValue(new Error("update"));
    await submit();
    expect(useToastStore.getState().toasts).toHaveLength(0);
    expect(router.replace).not.toHaveBeenCalled();
  });
});
