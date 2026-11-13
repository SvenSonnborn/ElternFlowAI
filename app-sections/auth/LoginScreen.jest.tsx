import { screen } from "@testing-library/react-native";

import { renderScreen } from "@/testing/renderScreen";

import { LoginScreen } from "./LoginScreen";

jest.mock("expo-router", () => ({
  Link: ({ children }: { children: unknown }) => children,
  router: { push: jest.fn() },
}));

describe("LoginScreen", () => {
  it("trägt an der Wurzel die testID, auf die der Startcheck wartet", async () => {
    await renderScreen(<LoginScreen />);

    // Vertrag mit `.maestro/startcheck.yaml`: Der Startcheck in der CI erkennt
    // den Login an dieser testID, nicht am Text, der an Gerätesprache und Copy
    // hängt. Wer sie umbenennt, muss den Flow mitziehen.
    expect(screen.getByTestId("login-screen")).toBeTruthy();
  });
});
