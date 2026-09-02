import type { RealtimeStatus } from "./status";

/**
 * Ab wann ein Verbindungsverlust den Nutzer etwas angeht.
 *
 * Die Schwelle ist der Punkt: Ein normaler Reconnect nach Bildschirmsperre
 * dauert unter einer Sekunde. Ohne sie blitzte bei jedem App-Wechsel ein
 * Hinweis auf, den niemand lesen kann und den keiner braucht.
 */
export const DEGRADED_AFTER_MS = 10_000;

/**
 * Ob nach einem Statuswechsel der verpasste Stand nachzuladen ist.
 *
 * Broadcasts werden **nicht** nachgeliefert: Nach jeder Unterbrechung ist der
 * Cache stumm veraltet. Das erste Abonnieren ist ausgenommen — dort holt die
 * Query ihre Daten ohnehin gerade selbst, ein zweiter Lauf wäre reine Last.
 */
export function shouldRefetchAfterResubscribe(prev: RealtimeStatus, next: RealtimeStatus): boolean {
  if (next !== "subscribed") return false;
  return prev === "closed" || prev === "timedOut" || prev === "error";
}

/**
 * Wie lange dieser Status anhalten darf, bevor er sichtbar wird — `null` heißt
 * „gar nicht melden".
 *
 * `subscribing` bekommt dieselbe Frist wie ein echter Verlust: Ein Abo, das
 * nach zehn Sekunden immer noch nicht steht, ist praktisch dasselbe wie ein
 * abgerissenes.
 */
export function degradedDelayMs(status: RealtimeStatus): number | null {
  if (status === "subscribed" || status === "idle") return null;
  return DEGRADED_AFTER_MS;
}
