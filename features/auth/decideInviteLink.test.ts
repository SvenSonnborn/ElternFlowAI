import { describe, expect, test } from "bun:test";

import { decideInviteLink, type InviteLinkInput } from "./decideInviteLink";

const base: InviteLinkInput = {
  sessionStatus: "authenticated",
  hasParent: true,
  parentIsLoading: false,
  currentGroup: "tabs",
  token: "T",
  done: null,
};

const loggedOut: Partial<InviteLinkInput> = {
  sessionStatus: "unauthenticated",
  hasParent: false,
  currentGroup: "auth",
};

const cases: [string, Partial<InviteLinkInput>, ReturnType<typeof decideInviteLink>][] = [
  ["kein Token, angemeldet", { token: null }, null],
  ["kein Token, abgemeldet", { ...loggedOut, token: null }, null],
  ["kein Token, Sitzung lädt", { sessionStatus: "loading", token: null }, null],
  ["Sitzung lädt", { sessionStatus: "loading" }, null],
  ["abgemeldet im Login-Stapel", loggedOut, "openRegister"],
  [
    "abgemeldet, Registrierung für diesen Token schon geöffnet",
    { ...loggedOut, done: { token: "T", action: "openRegister" } },
    null,
  ],
  [
    "abgemeldet, Registrierung für anderen Token geöffnet",
    { ...loggedOut, done: { token: "OLD", action: "openRegister" } },
    "openRegister",
  ],
  [
    "abgemeldet nach anderes Konto",
    { ...loggedOut, done: { token: "T", action: "askSwitchAccount" } },
    "openRegister",
  ],
  ["abgemeldet außerhalb auth", { ...loggedOut, currentGroup: "other" }, null],
  ["Parent lädt", { parentIsLoading: true }, null],
  ["ohne Familie", { hasParent: false }, null],
  ["mit Familie in Tabs", {}, "askSwitchAccount"],
  ["mit Familie in other", { currentGroup: "other" }, "askSwitchAccount"],
  ["mit Familie im Onboarding", { currentGroup: "onboarding" }, null],
  ["mit Familie im Login-Stapel", { currentGroup: "auth" }, null],
  ["schon gefragt", { done: { token: "T", action: "askSwitchAccount" } }, null],
  [
    "abgemeldet getippt, dann mit Familienkonto angemeldet",
    { done: { token: "T", action: "openRegister" } },
    "askSwitchAccount",
  ],
];

describe("decideInviteLink", () => {
  test.each(cases)("%s", (_name, override, expected) => {
    expect(decideInviteLink({ ...base, ...override })).toBe(expected);
  });
});
