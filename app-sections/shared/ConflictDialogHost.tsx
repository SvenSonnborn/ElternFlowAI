import { ConflictDialog } from "./ConflictDialog";
import { useConflictStore } from "./conflictStore";

/**
 * Zeichnet den Konflikt-Dialog — einmal im Root-Layout montiert, neben dem
 * `ToastProvider` und aus demselben Grund: Das Bearbeiten-Sheet ist zu, bevor
 * der Server antwortet, ein Dialog im Screen wäre nie sichtbar (ADR-031).
 *
 * Der Wirt **verteilt nichts** — `useConflict()` kommt ohne Context aus. Ihn zu
 * vergessen heißt, dass Konflikte unbemerkt bleiben, nicht dass etwas wirft.
 */
export function ConflictDialogHost() {
  // Der Kopf der Warteschlange, nicht ein einzelner Eintrag: Ein zweiter
  // Konflikt verdrängt den ersten nicht mehr, er wartet (siehe `conflictStore`).
  // `queue[0]` ist referenzstabil, Zustands `Object.is`-Vergleich trägt das
  // also ohne eigenen Equality-Fn.
  const current = useConflictStore((s) => s.queue[0] ?? null);
  const dismiss = useConflictStore((s) => s.dismiss);

  if (!current) return null;

  return (
    <ConflictDialog
      entry={current}
      onKeepMine={() => {
        // Erst schließen, dann schicken: Der zweite Versuch kann selbst wieder
        // kollidieren und einen neuen Dialog öffnen — ein `dismiss` danach
        // nähme genau den wieder weg.
        dismiss(current.id);
        current.onKeepMine();
      }}
      onKeepTheirs={() => {
        dismiss(current.id);
      }}
    />
  );
}
