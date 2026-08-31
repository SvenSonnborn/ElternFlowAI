import { useEffect } from "react";
import { AppState, Platform } from "react-native";

import { shouldFlushOnStateChange, usePendingDeleteStore } from "./pendingDeletes";

/**
 * Schließt offene Undo-Fenster, wenn die App in den Hintergrund geht.
 *
 * Das **verengt** den App-Kill-Fall, beseitigt ihn aber nicht: `flush()` stößt
 * die Requests nur an und hält die App nicht am Leben — iOS suspendiert kurz
 * nach `applicationDidEnterBackground`, und `commit()` wartet auf ein nacktes
 * `fetch` ohne Background-Task. Ohne diesen Listener bliebe das Fenster
 * dagegen ganz offen: Ein App-Kill verschluckte die Mutation, das Item wäre
 * lokal weg und käme beim nächsten Refetch wieder, ohne dass jemand etwas
 * getan hätte (Decision 4 der Spec).
 *
 * **Auf Web bewusst abgeschaltet.** Die Plattformprüfung steht hier und nicht
 * in `shouldFlushOnStateChange`, damit `pendingDeletes.ts` ohne
 * `react-native`-Import bleibt und unter Bun ohne RN-Mocks testbar ist.
 *
 * Der Grund: `react-native-web` kennt überhaupt nur `active` und `background`
 * und bildet `visibilitychange → hidden` direkt auf `background` ab
 * (`AppState/index.js`). Genau die Vorgänge, die Decision 5 auf iOS als
 * `inactive` ausnimmt, weil der Nutzer die App gar nicht verlassen hat, melden
 * hier also `background`: Tab-Wechsel, Fenster minimieren, Bildschirm sperren.
 * Wer für zwei Sekunden den Tab wechselt, verlöre sein Undo-Fenster — und das
 * liest sich wie ein Fehler, nicht wie eine Regel. Der Anlass fürs Flushen
 * verschwindet auf Web nicht ganz (ein geschlossener Tab verschluckt die
 * Mutation wie ein App-Kill), ist vom harmlosen Tab-Wechsel aber nicht zu
 * unterscheiden — und der ist ungleich häufiger.
 *
 * Eigene Datei, weil sie `react-native` importiert und `pendingDeletes.ts` das
 * nicht tun soll. Einmal im Root-Layout rufen.
 */
export function useFlushPendingDeletes(): void {
  useEffect(() => {
    if (Platform.OS === "web") return;
    const subscription = AppState.addEventListener("change", (next) => {
      if (shouldFlushOnStateChange(next)) {
        // Bewusst nicht abgewartet: der Listener kann nichts zurückhalten, die
        // App geht ohnehin in den Hintergrund. `useSignOut` wartet dagegen.
        void usePendingDeleteStore.getState().flush();
      }
    });
    return () => subscription.remove();
  }, []);
}
