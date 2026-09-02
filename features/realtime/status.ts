import type { REALTIME_SUBSCRIBE_STATES } from "@supabase/supabase-js";

import { create } from "zustand";

import type { FamilyChange } from "./normalize";

/**
 * Verbindungszustand des Familien-Kanals — ein Store, weil ihn zwei Screens
 * anzeigen (`<SyncNotice />` auf Kalender und Dashboard), aber nur ein einziger
 * Mountpunkt ihn schreibt (`useFamilyRealtime`).
 *
 * Die Datei importiert bewusst kein `react-native` und kein Feature, damit sie
 * unter `bun test` ohne die Mocks aus `bun.test.preload.ts` lädt. `FamilyChange`
 * aus `./normalize` ist unproblematisch — das Modul ist selbst frei von beidem.
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

/**
 * `FamilyChange` plus eine monoton steigende Sequenznummer für den `__DEV__`-
 * Ringpuffer in `recentChanges`: `receivedAt` allein taugt nicht als
 * React-Key — zwei Broadcasts teilen sich ohne Weiteres dieselbe Millisekunde.
 */
export interface DebugChange extends FamilyChange {
  seq: number;
}

/**
 * Deckel für `recentChanges` — genug, um eine Testreihe im Realtime-Debug-
 * Screen zu überblicken, wenig genug für eine flüssige Liste.
 */
export const DEBUG_CHANGE_LOG_LIMIT = 50;

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
  /**
   * Ringpuffer der zuletzt empfangenen Broadcasts, nur unter `__DEV__` befüllt
   * (siehe `useFamilyRealtime`) — Grundlage des Realtime-Debug-Screens. Der
   * öffnet seit einer Korrektur in Task 6 bewusst **keinen eigenen Kanal**
   * mehr: `subscribeToFamilyChanges` entsorgt jeden Altkanal mit passendem
   * `subTopic`, bevor es einen neuen anlegt — ein zweites Abo auf demselben
   * Topic risse also den einen App-Kanal aus `ThemedStack` ein.
   */
  recentChanges: DebugChange[];
  setStatus: (status: RealtimeStatus) => void;
  setDegraded: (value: boolean) => void;
  /** Reiht `change` vorn in `recentChanges` ein und deckelt auf `DEBUG_CHANGE_LOG_LIMIT`. */
  pushChange: (change: FamilyChange) => void;
  /** Leert `recentChanges`, ohne den Verbindungsstatus zu berühren. */
  clearChanges: () => void;
}

export const useRealtimeStatusStore = create<RealtimeStatusState>((set) => ({
  status: "idle",
  degraded: false,
  recentChanges: [],
  // `subscribed` räumt das Flag mit ab: Die Verbindung steht wieder, ein
  // stehengebliebener Hinweis wäre schlicht falsch. Jeder andere Wechsel lässt
  // es unberührt — ob er „lange genug" dauert, entscheidet der Timer.
  setStatus: (status) => set(status === "subscribed" ? { status, degraded: false } : { status }),
  setDegraded: (degraded) => set({ degraded }),
  // Die `seq` leitet sich vom aktuellen Kopf des Puffers ab statt von einem
  // externen Zähler: So bleibt der komplette Zustand in Zustand's `state` und
  // damit über `setState` in Tests zurücksetzbar, ohne ein zweites,
  // unsichtbares Modul-Feld pflegen zu müssen.
  pushChange: (change) =>
    set((state) => {
      const seq = (state.recentChanges[0]?.seq ?? 0) + 1;
      return {
        recentChanges: [{ ...change, seq }, ...state.recentChanges].slice(
          0,
          DEBUG_CHANGE_LOG_LIMIT,
        ),
      };
    }),
  clearChanges: () => set({ recentChanges: [] }),
}));
