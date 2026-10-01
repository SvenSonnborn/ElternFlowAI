import { ScopeSheet } from "./ScopeSheet";
import { settleScope, useScopeSheetStore } from "./scopeSheetStore";

/**
 * Zeichnet das Scope-Sheet — einmal im Root-Layout montiert, neben
 * `ConflictDialogHost`.
 *
 * Anders als dort muss hier nichts einen Screenwechsel überleben: Die Frage
 * kommt mitten aus einem laufenden Ablauf und ist beantwortet, bevor der
 * Screen wechselt. Das Root-Layout ist schlicht die eine Stelle, die beide
 * Aufrufer (Termin-Detail und Termin-Bearbeiten) gemeinsam haben.
 *
 * **Fehlt der Host, löst `pickScope` auf Web und Android nie auf**: Serie
 * löschen tut nichts, und Serie speichern lässt `submitLock` dauerhaft
 * gesperrt. Die Anfrage liegt im Store, es zeichnet sie nur niemand.
 */
export function ScopeSheetHost() {
  const current = useScopeSheetStore((s) => s.current);

  if (!current) return null;

  return (
    <ScopeSheet labels={current.labels} onSettle={(scope) => settleScope(current.id, scope)} />
  );
}
