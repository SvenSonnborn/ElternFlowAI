import type { SessionStatus } from "./session";

export type RouteGroup = "auth" | "onboarding" | "tabs" | "other";

export interface RouteDecisionInput {
  sessionStatus: SessionStatus;
  hasParent: boolean;
  parentIsLoading: boolean;
  currentGroup: RouteGroup;
}

export type RoutePath = "/(auth)/login" | "/(onboarding)/2" | "/(tabs)";

/**
 * Decide whether to redirect, given session + parent + current location.
 * Returns `null` to mean "stay where you are".
 *
 * Critical rule: a user inside (onboarding) is never auto-redirected to
 * (tabs) when the parent row appears mid-flow (which happens right after
 * Step 2 commits via create_family RPC). Only Step 5's explicit "Zum
 * Dashboard" button leaves the onboarding group.
 */
export function decideRoute(input: RouteDecisionInput): RoutePath | null {
  if (input.sessionStatus === "loading") return null;
  if (input.sessionStatus === "authenticated" && input.parentIsLoading) return null;

  if (input.sessionStatus === "unauthenticated") {
    return input.currentGroup === "auth" ? null : "/(auth)/login";
  }

  // authenticated
  if (!input.hasParent) {
    return input.currentGroup === "onboarding" ? null : "/(onboarding)/2";
  }

  // authenticated + has parent
  if (input.currentGroup === "auth") return "/(tabs)";
  return null;
}
