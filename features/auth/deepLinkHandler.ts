import * as Linking from "expo-linking";
import { router } from "expo-router";

import { supabase } from "@/features/supabase";

import { hydratePendingInvite, stashPendingInvite } from "./pendingInvite";

export type ParsedDeepLink =
  | { kind: "auth-confirm"; tokenHash: string; otpType: "email" }
  | { kind: "auth-recovery"; tokenHash: string; otpType: "recovery" }
  | { kind: "invite"; token: string };

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

/**
 * `redirectSystemPath` für `app/+native-intent.tsx`. Einladungslinks (voll als
 * `elternflow://invite/<token>` oder als Pfad `/invite/<token>`) gehen beim
 * Kaltstart auf `/`, weil Expo Router `/invite/<token>` sonst auf `+not-found`
 * routet. Bei laufender App (`initial: false`) kommt `null` zurück — Expo
 * Router navigiert dann gar nicht, und der Nutzer bleibt, wo er ist; `/` holte
 * ihn etwa aus den Onboarding-Schritten 3–5. Den Token merkt `initDeepLinkHandler`
 * selbst: beim Kaltstart über `Linking.getInitialURL()`, bei laufender App über
 * den `url`-Listener. Entschieden wird auf dem aktuellen Screen von
 * `InviteLinkHost` bzw. von Schritt 2 über den Store.
 * Alles andere bleibt unverändert. Wirft nie.
 */
export function redirectInviteSystemPath(options: {
  path: string;
  initial: boolean;
}): string | null {
  const { path, initial } = options;
  const target = initial ? "/" : null;
  try {
    if (parseDeepLink(path)?.kind === "invite") return target;
    if (/^\/invite\/[^/?#]+/.test(path)) return target;
  } catch {
    /* fällt auf den Pfad zurück */
  }
  return path;
}

/** Ob die Start-URL dieser JS-Laufzeit schon behandelt ist (s. `initDeepLinkHandler`). */
let initialUrlHandled = false;

/**
 * Called from app/_layout.tsx. Returns a cleanup function.
 *
 * Liest zuerst den gemerkten Einladungstoken aus AsyncStorage in den Store;
 * Onboarding-Schritt 2 wartet auf genau dieses `hydrated`.
 *
 * Das Root-Layout wird beim Kaltstart zweimal gemountet (beobachtet im
 * iOS-Debug-Build), und `getInitialURL` liefert jedem Mount denselben Link.
 * Deshalb wird die Start-URL nur beim ersten Aufruf behandelt: Ein zweites
 * Merken setzte `done` zurück und öffnete die Registrierung ein zweites Mal,
 * ein zweites `verifyOtp` schlüge am verbrauchten Token fehl. Der `url`-Listener
 * gilt dagegen pro Mount.
 */
export function initDeepLinkHandler(): () => void {
  void hydratePendingInvite();
  const handle = async (rawUrl: string | null) => {
    try {
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
            router.replace("/(auth)/reset-password");
          }
          return;
        }
        if (parsed.kind === "auth-recovery") {
          router.replace("/(auth)/new-password");
        }
        // For confirm: AuthGate will route to /(onboarding)/2 once the session is set.
        return;
      }

      if (parsed.kind === "invite") {
        // Nur merken, nicht navigieren: Beim Kaltstart schreibt
        // `app/+native-intent.tsx` den Link auf `/` um, bei laufender App
        // bleibt der Screen stehen. Den Rest erledigen `AuthGate` (ohne
        // Familie → Schritt 2) und `InviteLinkHost` (Registrierung oder Rückfrage).
        await stashPendingInvite(parsed.token);
        return;
      }
    } catch (e) {
      // Any unexpected throw (network blip, native bridge, router) is logged
      // and swallowed — a failed deep-link must not crash the app; AuthGate
      // still routes correctly from the current session state on next render.
      console.warn("[deepLinkHandler] handle failed", e);
    }
  };

  if (!initialUrlHandled) {
    initialUrlHandled = true;
    Linking.getInitialURL()
      .then(handle)
      .catch((e: unknown) => console.warn("[deepLinkHandler] getInitialURL failed", e));
  }
  const sub = Linking.addEventListener("url", ({ url }) => void handle(url));
  return () => sub.remove();
}
