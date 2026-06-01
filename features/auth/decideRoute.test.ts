import { describe, expect, test } from "bun:test";

import { decideRoute, type RouteDecisionInput } from "./decideRoute";

function input(partial: Partial<RouteDecisionInput>): RouteDecisionInput {
  return {
    sessionStatus: "loading",
    hasParent: false,
    currentGroup: "tabs",
    parentIsLoading: false,
    ...partial,
  };
}

describe("decideRoute", () => {
  test("loading session → wait (null)", () => {
    expect(decideRoute(input({ sessionStatus: "loading" }))).toBeNull();
  });

  test("authenticated + parent query still loading → wait (null)", () => {
    expect(
      decideRoute(input({ sessionStatus: "authenticated", parentIsLoading: true })),
    ).toBeNull();
  });

  test("unauthenticated outside (auth) → redirect to login", () => {
    expect(decideRoute(input({ sessionStatus: "unauthenticated", currentGroup: "tabs" }))).toBe(
      "/(auth)/login",
    );
    expect(
      decideRoute(input({ sessionStatus: "unauthenticated", currentGroup: "onboarding" })),
    ).toBe("/(auth)/login");
  });

  test("unauthenticated in (auth) → stay (null)", () => {
    expect(
      decideRoute(input({ sessionStatus: "unauthenticated", currentGroup: "auth" })),
    ).toBeNull();
  });

  test("authenticated + no parent + outside (onboarding) → redirect to onboarding step 2", () => {
    expect(
      decideRoute(
        input({ sessionStatus: "authenticated", hasParent: false, currentGroup: "tabs" }),
      ),
    ).toBe("/(onboarding)/2");
    expect(
      decideRoute(
        input({ sessionStatus: "authenticated", hasParent: false, currentGroup: "auth" }),
      ),
    ).toBe("/(onboarding)/2");
  });

  test("authenticated + no parent + in (onboarding) → stay (null)", () => {
    expect(
      decideRoute(
        input({ sessionStatus: "authenticated", hasParent: false, currentGroup: "onboarding" }),
      ),
    ).toBeNull();
  });

  test("authenticated + parent + in (auth) → redirect to tabs", () => {
    expect(
      decideRoute(input({ sessionStatus: "authenticated", hasParent: true, currentGroup: "auth" })),
    ).toBe("/(tabs)");
  });

  test("authenticated + parent + in (onboarding) → stay (mid-flow after step 2)", () => {
    expect(
      decideRoute(
        input({ sessionStatus: "authenticated", hasParent: true, currentGroup: "onboarding" }),
      ),
    ).toBeNull();
  });

  test("authenticated + parent + in (tabs) → stay (null)", () => {
    expect(
      decideRoute(input({ sessionStatus: "authenticated", hasParent: true, currentGroup: "tabs" })),
    ).toBeNull();
  });
});
