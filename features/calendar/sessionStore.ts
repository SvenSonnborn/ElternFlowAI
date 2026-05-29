import type { Session } from "@supabase/supabase-js";

import { useEffect } from "react";
import { create } from "zustand";

import { supabase } from "@/features/supabase";

interface SessionState {
  session: Session | null;
  initialized: boolean;
  setSession: (s: Session | null) => void;
  setInitialized: (b: boolean) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  session: null,
  initialized: false,
  setSession: (s) => set({ session: s }),
  setInitialized: (b) => set({ initialized: b }),
}));

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
        // If session retrieval fails (e.g. AsyncStorage read error), fall back
        // to no-session so the app can boot. Logged so it surfaces in DEV.
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
