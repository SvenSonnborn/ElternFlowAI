import AsyncStorage from "@react-native-async-storage/async-storage";
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";

import {
  clearPendingInviteToken,
  hydratePendingInvite,
  stashPendingInvite,
  usePendingInviteStore,
} from "./pendingInvite";

beforeEach(() => {
  usePendingInviteStore.setState({ token: null, hydrated: false, done: null });
});

afterEach(() => {
  spyOn(AsyncStorage, "getItem").mockRestore();
  spyOn(AsyncStorage, "removeItem").mockRestore();
});

describe("pendingInvite", () => {
  test("stash setzt done zurück", async () => {
    usePendingInviteStore.setState({
      token: "T",
      done: { token: "T", action: "openRegister" },
    });
    await stashPendingInvite("T");
    const s = usePendingInviteStore.getState();
    expect(s.token).toBe("T");
    expect(s.hydrated).toBe(true);
    expect(s.done).toBeNull();
  });

  test("hydrate: gespeicherter Token zählt als ‚Registrierung geöffnet'", async () => {
    spyOn(AsyncStorage, "getItem").mockResolvedValueOnce("T");
    await hydratePendingInvite();
    const s = usePendingInviteStore.getState();
    expect(s.token).toBe("T");
    expect(s.hydrated).toBe(true);
    expect(s.done).toEqual({ token: "T", action: "openRegister" });
  });

  test("hydrate ohne gespeicherten Token", async () => {
    spyOn(AsyncStorage, "getItem").mockResolvedValueOnce(null);
    await hydratePendingInvite();
    const s = usePendingInviteStore.getState();
    expect(s.token).toBeNull();
    expect(s.hydrated).toBe(true);
    expect(s.done).toBeNull();
  });

  test("hydrate überschreibt keinen frisch gemerkten Token", async () => {
    spyOn(AsyncStorage, "getItem").mockResolvedValueOnce("OLD");
    const h = hydratePendingInvite();
    await stashPendingInvite("NEW");
    await h;
    const s = usePendingInviteStore.getState();
    expect(s.token).toBe("NEW");
    expect(s.done).toBeNull();
  });

  test("clear", async () => {
    usePendingInviteStore.setState({
      token: "T",
      hydrated: true,
      done: { token: "T", action: "openRegister" },
    });
    const remove = spyOn(AsyncStorage, "removeItem");
    await clearPendingInviteToken("T");
    const s = usePendingInviteStore.getState();
    expect(s.token).toBeNull();
    expect(s.done).toBeNull();
    expect(remove).toHaveBeenCalledWith("auth.pendingInvite");
  });

  test("clear lässt einen neueren Token stehen", async () => {
    const done = { token: "T2", action: "askSwitchAccount" } as const;
    usePendingInviteStore.setState({ token: "T2", hydrated: true, done });
    const remove = spyOn(AsyncStorage, "removeItem");
    await clearPendingInviteToken("T1");
    const s = usePendingInviteStore.getState();
    expect(s.token).toBe("T2");
    expect(s.done).toEqual(done);
    expect(remove).not.toHaveBeenCalled();
  });
});
