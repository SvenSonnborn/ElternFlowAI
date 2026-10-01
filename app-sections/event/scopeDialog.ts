import { ActionSheetIOS, Platform } from "react-native";

import type { EditScope } from "@/features/calendar";

import { requestScope, type ScopeDialogLabels } from "./scopeSheetStore";

export type { ScopeDialogLabels } from "./scopeSheetStore";

/**
 * Fragt, auf welche Termine einer Serie sich Löschen oder Speichern bezieht —
 * „Nur diesen" / „Diesen und folgende" / „Alle", oder `null` bei Abbruch.
 *
 * Drei Plattformen, zwei Wege:
 *
 * - **iOS** bleibt beim nativen `ActionSheetIOS`: Es ist dort die erwartete
 *   Darstellung und trägt vier Einträge samt Abbrechen-Zeile ohne Zutun.
 * - **Android und Web** laufen über das Scope-Sheet (`ScopeSheet`, gezeichnet
 *   von `ScopeSheetHost` im Root-Layout). `Alert.alert` taugt auf keiner von
 *   beiden: React Native schneidet es auf Android auf drei Buttons ab
 *   (`buttons.slice(0, 3)` in `Libraries/Alert/Alert.js`) — „Abbrechen", der
 *   vierte, fehlte dort —, und react-native-web implementiert es als No-op, das
 *   Promise löste auf Web nie auf (beim Speichern blieb `submitLock` dauerhaft
 *   gesperrt).
 *
 * Das Promise löst nur auf, wenn der Host montiert ist; ohne ihn bliebe es auf
 * Android und Web offen.
 */
export function pickScope(labels: ScopeDialogLabels): Promise<EditScope | null> {
  if (Platform.OS === "ios") {
    return new Promise((resolve) => {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: labels.title,
          options: [labels.this, labels.forward, labels.all, labels.cancel],
          cancelButtonIndex: 3,
        },
        (idx) => {
          if (idx === 0) resolve("this");
          else if (idx === 1) resolve("forward");
          else if (idx === 2) resolve("all");
          else resolve(null);
        },
      );
    });
  }
  return requestScope(labels);
}
