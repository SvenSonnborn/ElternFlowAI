import { waitFor } from "@testing-library/react-native";
import { router } from "expo-router";

import { usePendingInviteStore } from "@/features/auth";
import { renderScreen } from "@/testing/renderScreen";

import { InviteLinkHost } from "./InviteLinkHost";

const mockConfirm = jest.fn<Promise<boolean>, [unknown]>();
const mockSignOut = jest.fn<Promise<void>, []>();
let mockStatus: "authenticated" | "unauthenticated" = "authenticated";
let mockSegments: string[] = ["(tabs)"];

// Echter Store und echtes `decideInviteLink` aus dem Barrel; gemockt sind nur
// Sitzung, Parent-Zeile und das Abmelden.
jest.mock("@/features/auth", () => ({
  ...jest.requireActual<typeof import("@/features/auth")>("@/features/auth"),
  useSession: () => ({
    status: mockStatus,
    session: null,
    userId: mockStatus === "authenticated" ? "u1" : null,
  }),
  useCurrentParent: () =>
    mockStatus === "authenticated"
      ? { data: { id: "p1", family_id: "f1" }, isLoading: false }
      : { data: undefined, isLoading: false },
  useSignOut: () => ({ mutateAsync: mockSignOut }),
}));

jest.mock("@/app-sections/shared", () => ({
  ...jest.requireActual<typeof import("@/app-sections/shared")>("@/app-sections/shared"),
  confirmDestructive: (labels: unknown) => mockConfirm(labels),
}));

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useSegments: () => mockSegments,
}));

/** Merkt einen Token so, wie es `stashPendingInvite` beim Eintreffen des Links tut. */
function stash(token: string) {
  usePendingInviteStore.setState({ token, hydrated: true, done: null });
}

describe("InviteLinkHost", () => {
  beforeEach(() => {
    mockConfirm.mockReset();
    mockSignOut.mockReset().mockResolvedValue(undefined);
    jest.mocked(router.push).mockReset();
    usePendingInviteStore.setState({ token: null, hydrated: false, done: null });
  });

  it("fragt einmal und meldet nach Bestätigung ab", async () => {
    mockStatus = "authenticated";
    mockSegments = ["(tabs)"];
    mockConfirm.mockResolvedValue(true);
    stash("T");

    const { rerender } = await renderScreen(<InviteLinkHost />);
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
    // `rerender` ersetzt den Baum aus `renderScreen` samt Providern — der Host
    // montiert also neu, wie unter `AuthGate` nach einem Wechsel. Gefragt wird
    // trotzdem nicht noch einmal: Das „erledigt" liegt im Store, nicht in der
    // Instanz.
    await rerender(<InviteLinkHost />);

    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(mockConfirm).toHaveBeenCalledWith({
      title: "Dieses Konto gehört bereits zu einer Familie.",
      body: expect.any(String),
      confirm: "Mit anderem Konto fortfahren",
      cancel: "Abbrechen",
    });
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(usePendingInviteStore.getState().token).toBe("T");
    expect(router.push).not.toHaveBeenCalled();
  });

  it("Abbrechen verwirft den Token", async () => {
    mockStatus = "authenticated";
    mockSegments = ["(tabs)"];
    mockConfirm.mockResolvedValue(false);
    stash("T");

    await renderScreen(<InviteLinkHost />);
    await waitFor(() => expect(usePendingInviteStore.getState().token).toBeNull());

    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("abgemeldet im Login öffnet die Registrierung einmal", async () => {
    mockStatus = "unauthenticated";
    mockSegments = ["(auth)"];
    stash("T");

    const { rerender } = await renderScreen(<InviteLinkHost />);
    await rerender(<InviteLinkHost />);

    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith("/(auth)/register");
    expect(mockConfirm).not.toHaveBeenCalled();
  });
});
