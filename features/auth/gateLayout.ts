import type { RoutePath } from "./decideRoute";
import type { SessionStatus } from "./session";

export interface GateLayoutInput {
  sessionStatus: SessionStatus;
  parentIsLoading: boolean;
  /** Ergebnis von `decideRoute`. */
  target: RoutePath | null;
  /** Hat der Gate seine Kinder (den Root-Navigator) schon einmal gerendert? */
  navigatorMounted: boolean;
}

export type GateLayout =
  /** Kinder NICHT rendern, Splash an ihrer Stelle. */
  | { kind: "splash" }
  /** Kinder NICHT rendern, `<Redirect>` an ihrer Stelle. */
  | { kind: "redirect"; href: RoutePath }
  /** Kinder rendern; `redirect` daneben, `cover` als deckende Fläche darüber. */
  | { kind: "app"; redirect: RoutePath | null; cover: boolean };

/**
 * Entscheidet, was `AuthGate` rendert — Splash, Redirect oder die Kinder —
 * und hält dabei die eine Regel fest, die der Gate sonst nur im Kopf trägt:
 * **Einmal gemountet, wird der Root-Navigator nie wieder ausgehängt.**
 *
 * Warum: Expo-Router verlangt einen gemounteten Root-Navigator; nur
 * verschachtelte Layouts dürfen ihn aufschieben. Ein `<Redirect>`, der einen
 * schon gemounteten Root-Navigator ersetzt, lässt `useSyncState.flushUpdates`
 * beim Login-Übergang in „Maximum update depth exceeded" laufen (Spec
 * `2026-10-01-web-parity-quirks-design.md` §1.3). Deshalb steht nach dem ersten
 * Mount der Redirect *neben* den Kindern, und Warten sowie ein anstehender
 * Redirect zeigen den Splash als Deckfläche *über* ihnen (`cover`) statt an
 * ihrer Stelle.
 *
 * Beim Kaltstart bleibt das Ersetzen bewusst: Stünde der Stack von Anfang an,
 * mounteten ohne Sitzung die geschützten Screens und fragten anonym `events`,
 * `tasks` und `meal_plan_entries` ab. Darum gilt vor dem ersten Mount das
 * alte Verhalten (Splash bzw. Redirect statt der Kinder).
 *
 * „Warten" heißt `loading` oder (`authenticated` und Parent lädt) — dieselbe
 * Bedingung, bei der `decideRoute` `null` liefert, damit niemand während des
 * Wartens umgeleitet wird.
 *
 * Rein und ohne `react-native`-Import, damit die Regel unter `bun test` steht;
 * `AuthGate` ist nur noch der Renderer dazu.
 */
export function gateLayout(input: GateLayoutInput): GateLayout {
  const waiting =
    input.sessionStatus === "loading" ||
    (input.sessionStatus === "authenticated" && input.parentIsLoading);

  if (input.navigatorMounted) {
    return { kind: "app", redirect: input.target, cover: waiting || input.target !== null };
  }

  if (waiting) return { kind: "splash" };
  if (input.target) return { kind: "redirect", href: input.target };
  return { kind: "app", redirect: null, cover: false };
}
