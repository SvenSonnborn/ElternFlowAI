import { create } from "zustand";

/**
 * Der Zustand hinter dem Konflikt-Dialog.
 *
 * Warum ein Store im Root-Layout und nicht lokaler State im Bearbeiten-Screen:
 * `EventEditScreen.onSave` ruft `goBackOrToKalender()` **vor** `save(vars)` —
 * die Änderung steht dank `onMutate` schon im Kalender, das Sheet schließt
 * sofort. Ein Dialog als Screen-State wäre unmontiert, wenn der Server
 * antwortet. Dieselbe Lehre, die ADR-025 für den Toast gezogen hat.
 *
 * Bewusst **ohne** `react-native`-Import, wie `toastStore.ts` und
 * `pendingDeletes.ts` — so läuft die Suite unter Bun, ohne sich auf die Mocks
 * aus `bun.test.preload.ts` zu verlassen.
 */

/** Eine Zeile des Vergleichs. Beide Seiten kommen fertig formatiert an. */
export interface ConflictRow {
  /** Feldname, schon übersetzt — der Screen kennt die passenden `field*`-Keys. */
  label: string;
  theirs: string;
  mine: string;
}

export interface ShowConflictOptions {
  title: string;
  body: string;
  /**
   * Leer heißt nicht „kein Dialog" — das entscheidet der Aufrufer, bevor er
   * hierher kommt. Leer heißt: erkannt, aber die fremde Fassung liegt nicht
   * vor (der Compare-and-Swap-Fall, siehe `EventConflictError.row === null`).
   */
  rows: ConflictRow[];
  keepMineLabel: string;
  keepTheirsLabel: string;
  /** Schickt dieselbe Mutation erneut, mit frischer Basis-Version. */
  onKeepMine: () => void;
}

export interface ConflictEntry extends ShowConflictOptions {
  id: string;
}

// Laufende Nummer statt Zufalls-Id — wie `nextToastId`.
let sequence = 0;

function nextConflictId(): string {
  sequence += 1;
  return `conflict-${sequence}`;
}

interface ConflictState {
  /** Ein Modal kann nur einen Dialog zeigen; ein zweiter ersetzt den ersten. */
  current: ConflictEntry | null;
  show: (options: ShowConflictOptions) => string;
  dismiss: (id: string) => void;
}

export const useConflictStore = create<ConflictState>((set) => ({
  current: null,
  show: (options) => {
    const entry: ConflictEntry = { ...options, id: nextConflictId() };
    set({ current: entry });
    return entry.id;
  },
  // Nur schließen, wenn genau *dieser* Dialog noch steht: Der Nutzer kann in A
  // wählen, während B bereits darüber liegt — ohne den Vergleich nähme A's
  // Handler B mit weg, ohne dass jemand es gesehen hat.
  dismiss: (id) => set((state) => (state.current?.id === id ? { current: null } : state)),
}));

export interface ConflictApi {
  show: (options: ShowConflictOptions) => string;
  dismiss: (id: string) => void;
}

/**
 * Der Zugriff für Screens. Bewusst ohne Context — der Store liegt auf
 * Modulebene, der Hook funktioniert also auch in Bäumen, die der Wirt nicht
 * umschließt (etwa den nativen Modal-Screens). Der Wirt zeichnet, er verteilt
 * nicht. Dieselbe Bauform wie `useToast()`.
 */
export function useConflict(): ConflictApi {
  const show = useConflictStore((s) => s.show);
  const dismiss = useConflictStore((s) => s.dismiss);
  return { show, dismiss };
}
