/**
 * Gemerkter Einladungstoken: Zustand-Store neben AsyncStorage. AsyncStorage
 * überlebt den Kaltstart, der Store macht den Token reaktiv — der Host der
 * Einladungslink-Entscheidung und Onboarding-Schritt 2 sehen Änderungen sofort.
 *
 * `hydratePendingInvite` markiert einen gelesenen Token als bereits
 * geroutet (`done: openRegister`): Er wurde beim Eintreffen schon behandelt,
 * ein Neustart soll die Registrierung nicht noch einmal aufklappen.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

import type { InviteLinkDone } from "./decideInviteLink";

const PENDING_INVITE_KEY = "auth.pendingInvite";

interface PendingInviteState {
  token: string | null;
  hydrated: boolean;
  done: InviteLinkDone | null;
}

/**
 * `token: null` heißt erst dann „kein Token", wenn `hydrated` steht — davor ist
 * AsyncStorage nur noch nicht gelesen. Wer daraus einen Weg ableitet (Schritt 2:
 * Einladung oder neue Familie), wartet auf `hydrated`.
 */
export const usePendingInviteStore = create<PendingInviteState>(() => ({
  token: null,
  hydrated: false,
  done: null,
}));

/**
 * Merkt einen frisch eingetroffenen Token. Der Store wird zuerst gesetzt
 * (reaktiv, `done` zurück, weil der Link neu ist), AsyncStorage danach als
 * Best-Effort.
 */
export async function stashPendingInvite(token: string): Promise<void> {
  usePendingInviteStore.setState({ token, hydrated: true, done: null });
  try {
    await AsyncStorage.setItem(PENDING_INVITE_KEY, token);
  } catch (e) {
    console.warn("[pendingInvite] failed to stash invite", e);
  }
}

/**
 * Liest AsyncStorage einmal in den Store. Geprüft wird erst *nach* dem Lesen:
 * Ist der Store inzwischen `hydrated` (frischer Link während des Lesens oder
 * zweiter Aufruf im StrictMode), bleibt er unangetastet.
 */
export async function hydratePendingInvite(): Promise<void> {
  let stored: string | null = null;
  try {
    stored = await AsyncStorage.getItem(PENDING_INVITE_KEY);
  } catch {
    stored = null;
  }
  if (usePendingInviteStore.getState().hydrated) return;
  usePendingInviteStore.setState({
    token: stored,
    hydrated: true,
    done: stored ? { token: stored, action: "openRegister" } : null,
  });
}

/** Hält fest, dass der Token mit dieser Aktion bedient wurde. */
export function markInviteLinkDone(done: InviteLinkDone): void {
  usePendingInviteStore.setState({ done });
}

/**
 * Verwirft genau diesen Token (Store und AsyncStorage), z. B. nach gelungenem
 * Beitritt. Ist inzwischen ein anderer gemerkt — ein zweiter Link, während der
 * Dialog zum ersten offen war oder der Beitritt lief —, bleibt der stehen.
 */
export async function clearPendingInviteToken(token: string): Promise<void> {
  if (usePendingInviteStore.getState().token !== token) return;
  usePendingInviteStore.setState({ token: null, done: null });
  try {
    await AsyncStorage.removeItem(PENDING_INVITE_KEY);
  } catch {
    /* ignore — best-effort */
  }
}
