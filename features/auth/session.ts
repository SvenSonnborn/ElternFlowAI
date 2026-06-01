import type { Session } from "@supabase/supabase-js";

import { useEffect } from "react";
import { create } from "zustand";

import { supabase } from "@/features/supabase";

export type SessionStatus = "loading" | "unauthenticated" | "authenticated";

export interface SessionStoreSnapshot {
  session: Session | null;
  initialized: boolean;
}

interface SessionState extends SessionStoreSnapshot {
  setSession: (s: Session | null) => void;
  setInitialized: (b: boolean) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  session: null,
  initialized: false,
  setSession: (s) => set({ session: s }),
  setInitialized: (b) => set({ initialized: b }),
}));

export function selectStatus(snapshot: SessionStoreSnapshot): SessionStatus {
  if (!snapshot.initialized) return "loading";
  return snapshot.session ? "authenticated" : "unauthenticated";
}

export function useSession(): {
  status: SessionStatus;
  session: Session | null;
  userId: string | null;
} {
  // Subscribe to each field individually — Zustand compares with Object.is,
  // so a selector that returns a fresh object every call would trigger an
  // infinite render loop (the new object reference always !== the previous).
  const session = useSessionStore((s) => s.session);
  const initialized = useSessionStore((s) => s.initialized);
  const status = selectStatus({ session, initialized });
  return { status, session, userId: session?.user.id ?? null };
}

export function useInitSession(): void {
  const setSession = useSessionStore((s) => s.setSession);
  const setInitialized = useSessionStore((s) => s.setInitialized);

  useEffect(() => {
    let mounted = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setSession(data.session);
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        console.warn("supabase.auth.getSession failed", err);
        setSession(null);
      })
      .finally(() => {
        if (!mounted) return;
        setInitialized(true);
      });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      if (!mounted) return;
      setSession(sess);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [setSession, setInitialized]);
}
