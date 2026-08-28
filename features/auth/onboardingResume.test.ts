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

  test("an empty parents list is not a loaded family — no partner is claimed", () => {
    // Kann nur passieren, wenn RLS die Zeilen wegfiltert; dann ist die eigene
    // Zeile nicht dabei und `hasPartner` bleibt falsch.
    expect(onboardingResumeStep(input({ parents: [] }))).toBe(3);
  });
});
