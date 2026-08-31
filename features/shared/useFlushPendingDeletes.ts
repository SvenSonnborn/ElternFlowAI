import { useEffect } from "react";
import { AppState } from "react-native";

import { shouldFlushOnStateChange, usePendingDeleteStore } from "./pendingDeletes";

/**
 * Schließt offene Undo-Fenster, wenn die App in den Hintergrund geht.
 *
 * Das macht das Löschen deterministisch: entweder der Nutzer drückt innerhalb
 * des Fensters „Rückgängig", oder die Löschung passiert wirklich. Ohne diesen
 * Listener verschluckte ein App-Kill im Fenster die Mutation — das Item wäre
 * lokal weg und käme beim nächsten Refetch wieder, ohne dass jemand etwas
 * getan hätte (Decision 4 der Spec).
 *
 * Eigene Datei, weil sie `react-native` importiert und `pendingDeletes.ts` das
 * nicht tun soll. Einmal im Root-Layout rufen.
 */
export function useFlushPendingDeletes(): void {
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (shouldFlushOnStateChange(next)) {
        usePendingDeleteStore.getState().flush();
      }
    });
    return () => subscription.remove();
  }, []);
}
