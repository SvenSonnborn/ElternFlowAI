/**
 * Welcher Onboarding-Schritt einem zurückkehrenden User noch fehlt.
 *
 * Hintergrund: Nur Step 2 committet (ADR-005, Approach C). Wer die App
 * zwischen Step 2 und Step 5 schließt, hat eine `parents`-Zeile — der
 * AuthGate ({@link decideRoute}) lässt ihn deshalb auf `(tabs)`, obwohl weder
 * Partner noch Kind angelegt sind. Diese Funktion benennt den Rest, damit das
 * Dashboard eine Fortsetzen-CTA zeigen kann, statt den User mit lauter
 * Leer-Zuständen allein zu lassen.
 */

export type OnboardingResumeStep = 3 | 4;

export interface OnboardingResumeInput {
  /** Die eigene `parents`-Zeile — `undefined`, solange die Query nicht geantwortet hat. */
  parentId: string | undefined;
  /** Alle Eltern der Familie, inklusive der eigenen Zeile. */
  parents: readonly { id: string }[] | undefined;
  childCount: number | undefined;
  /** Offene (unbenutzte, nicht abgelaufene) Einladungen der Familie. */
  pendingInviteCount: number | undefined;
}

/**
 * Der früheste offene Schritt, oder `null` wenn nichts (mehr) offen ist.
 *
 * Step 3 hat Vorrang vor Step 4, weil das die Reihenfolge des Flows ist: wer
 * bei 3 einsteigt, läuft über „Später einladen" ohnehin in 4 weiter. Der
 * umgekehrte Einstieg würde Step 3 dauerhaft überspringen.
 */
export function onboardingResumeStep(input: OnboardingResumeInput): OnboardingResumeStep | null {
  const { parentId, parents, childCount, pendingInviteCount } = input;

  // Vor der letzten Antwort — und nach einem Fehler, der `data` undefined
  // lässt — sagt die Karte nichts. „Du bist noch nicht fertig" ist eine
  // Behauptung über die Familie, und die lässt sich mit halben Daten nicht
  // belegen; ein Aufblitzen bei jedem Dashboard-Start wäre der teurere Fehler.
  if (!parentId || !parents || childCount === undefined || pendingInviteCount === undefined) {
    return null;
  }

  // Die eigene Zeile muss in der Liste stehen. Die RLS-Policy auf `parents` ist
  // `family_id = current_family_id()`, und `current_family_id()` liest genau
  // diese Zeile — sie kann also nicht legitim fehlen. Fehlt sie doch (etwa
  // weil `useCurrentParent` nach einem Familienwechsel noch die alte Zeile
  // hält), passen Parent- und Familien-Antwort nicht zusammen, und „kein
  // Partner" wäre dann aus zwei Antworten über zwei Familien geschlossen.
  if (!parents.some((p) => p.id === parentId)) return null;

  // „Partner fehlt" heißt: keine zweite Eltern-Zeile UND keine offene
  // Einladung. Eine verschickte Einladung zählt als erledigt — der Schritt
  // liegt dann beim Eingeladenen, nicht mehr bei uns.
  const hasPartner = parents.some((p) => p.id !== parentId);
  if (!hasPartner && pendingInviteCount === 0) return 3;

  if (childCount === 0) return 4;

  return null;
}

/** Ziel-Route je offenem Schritt. Wird von Dashboard-CTA und Empty-State geteilt. */
export const ONBOARDING_RESUME_HREF = {
  3: "/(onboarding)/3",
  4: "/(onboarding)/4",
} as const satisfies Record<OnboardingResumeStep, string>;
