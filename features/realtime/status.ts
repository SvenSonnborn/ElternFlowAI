import type { REALTIME_SUBSCRIBE_STATES } from "@supabase/supabase-js";

import { create } from "zustand";

/**
 * Verbindungszustand des Familien-Kanals — ein Store, weil ihn zwei Screens
 * anzeigen (`<SyncNotice />` auf Kalender und Dashboard), aber nur ein einziger
 * Mountpunkt ihn schreibt (`useFamilyRealtime`).
 *
 * Die Datei importiert bewusst kein `react-native` und kein Feature, damit sie
 * unter `bun test` ohne die Mocks aus `bun.test.preload.ts` lädt.
 */

/** `idle` heißt: keine `family_id`, es gibt nichts zu abonnieren. */
export type RealtimeStatus =
  "idle" | "subscribing" | "subscribed" | "timedOut" | "error" | "closed";

/**
 * Konvertiert Supabase-`REALTIME_SUBSCRIBE_STATES` zu menschenlesbaren Status.
 *
 * Der `switch` hat bewusst keinen `default`-Zweig: Der Template-Literal-Typ
 * `` `${REALTIME_SUBSCRIBE_STATES}` `` garantiert TypeScript die Vollständigkeit.
 * Ein `default` nähme genau diese Garantie weg — ein künftiger fünfter Zustand
 * fiele dann stumm durch, statt den Compiler zu wecken.
 */
export function toRealtimeStatus(state: `${REALTIME_SUBSCRIBE_STATES}`): RealtimeStatus {
  switch (state) {
    case "SUBSCRIBED":
      return "subscribed";
    case "TIMED_OUT":
      return "timedOut";
    case "CLOSED":
      return "closed";
    case "CHANNEL_ERROR":
      return "error";
  }
}

interface RealtimeStatusState {
  status: RealtimeStatus;
  /**
   * Ob der Kanal lange genug weg ist, dass es den Nutzer etwas angeht. Der
   * Timer dafür liegt in `useFamilyRealtime` und nicht in der anzeigenden
   * Komponente: ein `setState` aus einem Timer heraus fiele unter
   * `react-hooks/set-state-in-effect` (in diesem Repo ein Error), ein
   * Store-Write nicht — und ein Timer an einer Stelle schlägt einen pro Screen.
   */
  degraded: boolean;
  setStatus: (status: RealtimeStatus) => void;
  setDegraded: (value: boolean) => void;
}

export const useRealtimeStatusStore = create<RealtimeStatusState>((set) => ({
  status: "idle",
  degraded: false,
  // `subscribed` räumt das Flag mit ab: Die Verbindung steht wieder, ein
  // stehengebliebener Hinweis wäre schlicht falsch. Jeder andere Wechsel lässt
  // es unberührt — ob er „lange genug" dauert, entscheidet der Timer.
  setStatus: (status) => set(status === "subscribed" ? { status, degraded: false } : { status }),
  setDegraded: (degraded) => set({ degraded }),
}));
