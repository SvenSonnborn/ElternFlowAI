import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import { router } from "expo-router";

import { supabase } from "@/features/supabase";

export type ParsedDeepLink =
  | { kind: "auth-confirm"; tokenHash: string; otpType: "email" }
  | { kind: "auth-recovery"; tokenHash: string; otpType: "recovery" }
  | { kind: "invite"; token: string };

const PENDING_INVITE_KEY = "auth.pendingInvite";

function tryParseUrl(input: string): URL | null {
  if (!input) return null;
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

export function parseDeepLink(rawUrl: string): ParsedDeepLink | null {
  const url = tryParseUrl(rawUrl);
  if (!url) return null;
  if (url.protocol !== "elternflow:") return null;

  const host = url.hostname || url.pathname.split("/")[1];

  if (host === "auth") {
    const subPath = url.pathname.replace(/^\/+/, "").split("/").filter(Boolean);
    const action = host === url.hostname ? subPath[0] : subPath[1];
    const tokenHash = url.searchParams.get("token_hash");
    const type = url.searchParams.get("type");
    if (!tokenHash) return null;
    if (action === "confirm" && type === "email") {
      return { kind: "auth-confirm", tokenHash, otpType: "email" };
    }
    if (action === "recovery" && type === "recovery") {
      return { kind: "auth-recovery", tokenHash, otpType: "recovery" };
    }
    return null;
  }

  if (host === "invite") {
    const segments = (url.hostname ? url.pathname : url.pathname)
      .replace(/^\/+/, "")
      .split("/")
      .filter(Boolean);
    const token = url.hostname === "invite" ? segments[0] : segments[1];
    if (!token) return null;
    return { kind: "invite", token };
  }

  return null;
}

export async function getPendingInviteToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(PENDING_INVITE_KEY);
  } catch {
    return null;
  }
}

export async function clearPendingInviteToken(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PENDING_INVITE_KEY);
  } catch {
    /* ignore — best-effort */
  }
}

/** Called from app/_layout.tsx. Returns a cleanup function. */
export function initDeepLinkHandler(): () => void {
  const handle = async (rawUrl: string | null) => {
    if (!rawUrl) return;
    const parsed = parseDeepLink(rawUrl);
    if (!parsed) return;

    if (parsed.kind === "auth-confirm" || parsed.kind === "auth-recovery") {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: parsed.tokenHash,
        type: parsed.otpType,
      });
      if (error) {
        console.warn("[deepLinkHandler] verifyOtp failed", error);
        if (parsed.kind === "auth-recovery") {
          router.replace("/(auth)/reset-password" as never);
        }
        return;
      }
      if (parsed.kind === "auth-recovery") {
        router.replace("/(auth)/new-password" as never);
      }
      // For confirm: AuthGate will route to /(onboarding)/2 once the session is set.
      return;
    }

    if (parsed.kind === "invite") {
      // Stash so onboarding can pick it up after sign-in.
      try {
        await AsyncStorage.setItem(PENDING_INVITE_KEY, parsed.token);
      } catch (e) {
        console.warn("[deepLinkHandler] failed to stash invite", e);
      }
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace("/(auth)/login" as never);
        return;
      }
      router.replace("/(onboarding)/2" as never);
      return;
    }
  };

  void Linking.getInitialURL().then(handle);
  const sub = Linking.addEventListener("url", ({ url }) => void handle(url));
  return () => sub.remove();
}
