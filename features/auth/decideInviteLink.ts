import type { RouteGroup } from "./decideRoute";
import type { SessionStatus } from "./session";

export type InviteLinkAction = "openRegister" | "askSwitchAccount";

/** Welcher Token mit welcher Aktion schon bedient wurde. */
export interface InviteLinkDone {
  token: string;
  action: InviteLinkAction;
}

export interface InviteLinkInput {
  sessionStatus: SessionStatus;
  hasParent: boolean;
  parentIsLoading: boolean;
  currentGroup: RouteGroup;
  token: string | null;
  done: InviteLinkDone | null;
}

/**
 * Entscheidet, was ein gemerkter Einladungstoken jetzt auslöst. `null` heißt
 * „nichts tun" (Form wie `decideRoute`: früh `null`).
 *
 * - Abgemeldet im `auth`-Stapel: Registrierung öffnen — außer genau dieser
 *   Token wurde dort schon geöffnet. `done` merkt Token *und* Aktion: nach
 *   „anderes Konto" (Aktion `askSwitchAccount`) wird abgemeldet, und dieselbe
 *   Einladung muss die Registrierung noch einmal öffnen.
 * - Mit Familie: nachfragen, ob das Konto gewechselt werden soll. Im
 *   Onboarding bleibt es still (Anti-Ziel 2 der Spec): Dort ist der Beitritt
 *   über Schritt 2 eben gelungen, eine Rückfrage würde ihn unterbrechen. Im
 *   `auth`-Stapel leitet das Gate ohnehin gleich zu den Tabs, die Rückfrage
 *   kommt dann von dort.
 * - Ohne Familie führt `decideRoute` zu Schritt 2, der den Token selbst nutzt.
 */
export function decideInviteLink(input: InviteLinkInput): InviteLinkAction | null {
  const { token, done } = input;
  if (!token) return null;
  if (input.sessionStatus === "loading") return null;

  if (input.sessionStatus === "unauthenticated") {
    if (input.currentGroup !== "auth") return null;
    if (done?.token === token && done.action === "openRegister") return null;
    return "openRegister";
  }

  if (input.parentIsLoading) return null;
  if (!input.hasParent) return null;
  if (input.currentGroup === "onboarding" || input.currentGroup === "auth") return null;
  if (done?.token === token && done.action === "askSwitchAccount") return null;
  return "askSwitchAccount";
}
