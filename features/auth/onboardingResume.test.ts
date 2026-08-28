import { describe, expect, test } from "bun:test";

import { onboardingResumeStep, type OnboardingResumeInput } from "./onboardingResume";

function input(partial: Partial<OnboardingResumeInput> = {}): OnboardingResumeInput {
  return {
    parentId: "me",
    parents: [{ id: "me" }],
    childCount: 0,
    pendingInviteCount: 0,
    ...partial,
  };
}

describe("onboardingResumeStep", () => {
  test("solo parent without invite and without child → step 3", () => {
    expect(onboardingResumeStep(input())).toBe(3);
  });

  test("pending invite counts as done → falls through to step 4", () => {
    expect(onboardingResumeStep(input({ pendingInviteCount: 1 }))).toBe(4);
  });

  test("partner joined counts as done → falls through to step 4", () => {
    expect(onboardingResumeStep(input({ parents: [{ id: "me" }, { id: "partner" }] }))).toBe(4);
  });

  test("partner missing wins over missing child", () => {
    expect(onboardingResumeStep(input({ childCount: 2 }))).toBe(3);
  });

  test("partner present and at least one child → nothing to resume", () => {
    expect(onboardingResumeStep(input({ pendingInviteCount: 1, childCount: 1 }))).toBeNull();
  });

  test("partner joined and at least one child → nothing to resume", () => {
    expect(
      onboardingResumeStep(input({ parents: [{ id: "me" }, { id: "partner" }], childCount: 1 })),
    ).toBeNull();
  });

  test("stays silent while any source has not answered", () => {
    expect(onboardingResumeStep(input({ parentId: undefined }))).toBeNull();
    expect(onboardingResumeStep(input({ parents: undefined }))).toBeNull();
    expect(onboardingResumeStep(input({ childCount: undefined }))).toBeNull();
    expect(onboardingResumeStep(input({ pendingInviteCount: undefined }))).toBeNull();
  });

  test("stays silent when the own row is missing from the family list", () => {
    // Kann nicht legitim vorkommen — die RLS-Policy auf `parents` hängt an
    // genau dieser Zeile. Wenn doch, beschreiben Parent- und Familien-Antwort
    // verschiedene Familien, und daraus lässt sich nichts schließen.
    expect(onboardingResumeStep(input({ parents: [] }))).toBeNull();
    expect(onboardingResumeStep(input({ parents: [{ id: "someone-else" }] }))).toBeNull();
  });
});
