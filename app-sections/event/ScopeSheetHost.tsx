import { usePathname } from "expo-router";
import { useEffect } from "react";

import { ScopeSheet } from "./ScopeSheet";
import { settleScope, useScopeSheetStore } from "./scopeSheetStore";

/**
 * Zeichnet das Scope-Sheet — einmal im Root-Layout montiert, neben
 * `ConflictDialogHost`.
 *
 * Die Frage kommt mitten aus einem laufenden Ablauf des Screens, der
 * `pickScope` aufgerufen hat, und dessen Fortsetzung (zurück navigieren und
 * speichern, löschen und zurück navigieren) gehört zu genau diesem Screen.
 * Das Sheet hängt aber im Root und nicht an diesem Screen: Auf Web können
 * Browser-Zurück, ein AuthGate-Redirect oder ein Deep-Link den Screen
 * abbauen, während das Sheet offen bleibt — ein späterer Tap liefe dann auf
 * dem Screen weiter, der gerade zu sehen ist. Darum zählt ein **Routenwechsel
 * als Abbrechen**: Der Effekt unten löst eine noch offene Anfrage beim
 * Wechsel des Pfads mit `null` auf, das Sheet verschwindet, und der
 * Aufrufer räumt auf wie bei jedem anderen Abbruch.
 *
 * Das Root-Layout ist schlicht die eine Stelle, die beide Aufrufer
 * (Termin-Detail und Termin-Bearbeiten) gemeinsam haben.
 *
 * **Fehlt der Host, löst `pickScope` auf Web und Android nie auf**: Serie
 * löschen tut nichts, und Serie speichern lässt `submitLock` dauerhaft
 * gesperrt. Die Anfrage liegt im Store, es zeichnet sie nur niemand.
 */
export function ScopeSheetHost() {
  const current = useScopeSheetStore((s) => s.current);
  const pathname = usePathname();

  useEffect(() => {
    // Der Cleanup läuft beim Wechsel des Pfads (und beim Abbau des Hosts):
    // `getState()` statt Closure, weil der Effekt nur am Pfad hängt und
    // `current` zu diesem Zeitpunkt längst ein anderer sein kann.
    return () => {
      const open = useScopeSheetStore.getState().current;
      if (open) settleScope(open.id, null);
    };
  }, [pathname]);

  if (!current) return null;

  return (
    <ScopeSheet labels={current.labels} onSettle={(scope) => settleScope(current.id, scope)} />
  );
}
