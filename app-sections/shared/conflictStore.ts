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

/**
 * Wie oft ein Konflikt **stillschweigend** wiederholt werden darf, bevor der
 * Dialog erscheint.
 *
 * Weicht inhaltlich nichts ab, speichern die Edit-Screens ohne Rückfrage mit
 * frischer Basis-Version durch — richtig so, ein Versionssprung ohne
 * Abweichung darf niemanden anhalten. Ohne Obergrenze ist das aber eine
 * Schleife ohne Abbruchbedingung: Schreibt ein zweiter Client die Zeile
 * fortlaufend (etwa ein `is_done`-Toggle in einer Schleife), wiederholt sich
 * `speichern → Konflikt → kein Feld weicht ab → speichern` beliebig oft, jedes
 * Mal ein voller Roundtrip, ohne dass der Nutzer je etwas sieht.
 *
 * Nach dem Limit erscheint der Dialog — dann zwar ohne Vergleichszeilen, aber
 * sichtbar. Dieselbe Überlegung wie beim Compare-and-Swap ohne fremde Fassung:
 * lieber ein Dialog, der wenig sagt, als stilles Weiterlaufen.
 *
 * Gilt **nur** für die stille Wiederholung. Ein Tap auf „Deine Fassung
 * speichern" ist eine bewusste Entscheidung und setzt den Zähler zurück.
 */
export const MAX_CONFLICT_AUTO_RETRIES = 3;

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
  /**
   * FIFO. Ein Modal zeigt genau einen Dialog — weitere **warten**, statt den
   * ersten zu verdrängen.
   *
   * Vorher ersetzte ein zweiter Konflikt den ersten. Der nahm dabei seinen
   * `onKeepMine` mit, und die Eingaben des Nutzers waren ersatzlos weg, ohne
   * dass er je eine Wahl gesehen hätte — genau der stille Verlust, gegen den
   * dieses Feature gebaut ist. Erreichbar, sobald zwei Mutationen kurz
   * hintereinander scheitern: Beide Edit-Screens verlassen sich beim Zeigen
   * des Dialogs, ihre Konflikte treffen also unabhängig voneinander hier ein.
   *
   * Bewusst **ungedeckelt**, anders als der Toast-Stapel (`toastStore.ts`,
   * `DS.components.toast.stack.max`): Ein Toast ist eine Mitteilung, die man
   * verpassen darf; ein Konflikt ist eine offene Entscheidung über Daten, die
   * sonst verloren gehen. Die Länge begrenzt sich von selbst — jeder Konflikt
   * endet in einer Nutzerwahl, und die stille Wiederholung hat mit
   * {@link MAX_CONFLICT_AUTO_RETRIES} ihre eigene Obergrenze.
   */
  queue: ConflictEntry[];
  show: (options: ShowConflictOptions) => string;
  dismiss: (id: string) => void;
}

export const useConflictStore = create<ConflictState>((set) => ({
  queue: [],
  show: (options) => {
    const entry: ConflictEntry = { ...options, id: nextConflictId() };
    set((state) => ({ queue: [...state.queue, entry] }));
    return entry.id;
  },
  // Entfernt genau *diesen* Eintrag, gleich an welcher Stelle er steht. Der
  // Nutzer kann in A wählen, während B schon wartet — ohne den Id-Vergleich
  // nähme A's Handler B mit weg, ohne dass jemand es gesehen hat.
  dismiss: (id) => set((state) => ({ queue: state.queue.filter((entry) => entry.id !== id) })),
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
