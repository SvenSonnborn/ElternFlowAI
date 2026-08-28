import { create } from "zustand";

import { DS } from "@/design-system";

/**
 * Der Zustand hinter der Toast-Komponente — Warteschlange, Laufzeiten,
 * `useToast()`.
 *
 * Geometrie und Zeiten kommen aus `DS.components.toast` ([patterns/toast.md]),
 * nicht aus Konstanten hier: die Spezifikation gehört dem Designer, dieses
 * Modul entscheidet nur, *welcher* Toast wie lange in der Liste steht.
 *
 * Die Datei importiert bewusst kein `react-native` — so lassen sich die reinen
 * Funktionen unter Bun testen, ohne die RN-Mocks aus `bun.test.preload.ts` zu
 * brauchen.
 */

const spec = DS.components.toast;

export type ToastVariant = "success" | "error" | "info";
export type ToastPosition = "top" | "bottom";

export interface ToastAction {
  label: string;
  onPress: () => void;
}

export interface ShowToastOptions {
  title: string;
  message?: string;
  /** Default `info` — die neutrale Variante, die nichts behauptet. */
  variant?: ToastVariant;
  /** Default `top`, wie im Pattern. */
  position?: ToastPosition;
  action?: ToastAction;
  /**
   * Überschreibt die Laufzeit der Variante. `null` heißt: bleibt stehen, bis
   * jemand ihn schließt.
   */
  durationMs?: number | null;
}

export interface ToastEntry {
  id: string;
  title: string;
  message?: string;
  variant: ToastVariant;
  position: ToastPosition;
  action?: ToastAction;
  durationMs: number | null;
}

/**
 * Wie lange ein Toast steht, in Millisekunden — `null` heißt „bis er
 * geschlossen wird".
 *
 * Zwei Regeln aus dem Pattern, in dieser Reihenfolge:
 * 1. Ein ausdrücklich übergebener Wert gewinnt immer, auch die `null`.
 * 2. Ein Toast mit Aktion läuft nie ab. Der Countdown würde dem Nutzer genau
 *    den Knopf wegnehmen, wegen dem der Toast überhaupt da ist — das gilt für
 *    jede Variante, nicht nur für Fehler.
 */
export function resolveDuration(
  variant: ToastVariant,
  hasAction: boolean,
  override?: number | null,
): number | null {
  if (override !== undefined) return override;
  if (hasAction) return null;
  return spec.timing.autoDismissMs[variant];
}

/**
 * Hängt `entry` an und wirft den ältesten Toast heraus, sobald der Stapel voll
 * ist (`DS.components.toast.stack.max`, aktuell 2).
 *
 * Verdrängt wird der älteste, nicht der neue: das jüngste Ereignis ist das,
 * auf das der Nutzer gerade reagiert.
 */
export function enqueue(
  list: readonly ToastEntry[],
  entry: ToastEntry,
  max: number = spec.stack.max,
): ToastEntry[] {
  return [...list, entry].slice(-max);
}

/**
 * Baut den Eintrag aus den Optionen — Defaults an einer Stelle, damit Store
 * und Test dieselbe Zuordnung sehen.
 */
export function buildToast(id: string, options: ShowToastOptions): ToastEntry {
  const variant = options.variant ?? "info";
  return {
    id,
    title: options.title,
    message: options.message,
    variant,
    position: options.position ?? "top",
    action: options.action,
    durationMs: resolveDuration(variant, options.action != null, options.durationMs),
  };
}

// Laufende Nummer statt Zufalls-ID: der Toast lebt Sekunden, eine Kollision
// über einen App-Lauf hinweg gibt es nicht, und Tests bleiben lesbar.
let sequence = 0;

export function nextToastId(): string {
  sequence += 1;
  return `toast-${sequence}`;
}

interface ToastState {
  toasts: ToastEntry[];
  /** Zeigt einen Toast und gibt seine Id zurück (zum vorzeitigen Schließen). */
  show: (options: ShowToastOptions) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  show: (options) => {
    const entry = buildToast(nextToastId(), options);
    set((state) => ({ toasts: enqueue(state.toasts, entry) }));
    return entry.id;
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

export interface ToastApi {
  show: (options: ShowToastOptions) => string;
  dismiss: (id: string) => void;
}

/**
 * Der Zugriff für Features: `const toast = useToast(); toast.show({ … })`.
 *
 * Bewusst ohne Context — der Store liegt auf Modulebene, der Hook funktioniert
 * also auch in Bäumen, die der `ToastProvider` nicht umschließt (etwa den
 * nativen Modal-Screens, die react-native-screens in einem eigenen
 * ViewController hostet). Der Provider zeichnet die Toasts, er verteilt sie
 * nicht.
 *
 * Die beiden Funktionen sind über die Lebenszeit des Stores stabil und dürfen
 * damit gefahrlos in Dependency-Arrays stehen.
 */
export function useToast(): ToastApi {
  const show = useToastStore((s) => s.show);
  const dismiss = useToastStore((s) => s.dismiss);
  return { show, dismiss };
}
