import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { UNDO_WINDOW_MS, usePendingDeleteStore, type PendingDeleteKind } from "@/features/shared";

import { useToast } from "./toastStore";

export interface UndoableDeleteArgs {
  kind: PendingDeleteKind;
  /** Wird vom Selektor des Features gelesen — `{ taskId }` bzw. `PendingEventDelete`. */
  target: unknown;
  /** Toast-Titel: benennt das Ergebnis, nicht die Operation. */
  title: string;
  /** Toast-Message: die Spezifika, an denen sich das Ergebnis prüfen lässt. */
  message: string;
  /** Die eigentliche Mutation, üblicherweise `mutation.mutateAsync(vars)`. */
  run: () => Promise<void>;
  errorTitle: string;
  formatError: (err: unknown) => string;
}

/**
 * Verbindet den Pending-Delete-Store mit dem Toast: verstecken, Fenster
 * anbieten, danach löschen — oder eben nicht.
 *
 * Liegt in `app-sections/`, **nicht** in `features/`: er braucht `useToast()`,
 * und `features/*` importiert nirgends aus `app-sections/*`. Diese Richtung
 * umzudrehen wäre die teuerste Zeile dieses Features.
 *
 * Der Toast überschreibt `durationMs` ausdrücklich und läuft damit ab, obwohl
 * er eine Aktion trägt. Das Pattern verbietet das sonst — hier **ist** das
 * Ablaufen die Semantik, und `resolveDuration` sanktioniert den Vorrang des
 * expliziten Werts als Regel 1 (Decision 11 der Spec).
 */
export function useUndoableDelete(): (args: UndoableDeleteArgs) => void {
  const { t } = useTranslation();
  const { show, dismiss } = useToast();
  const schedule = usePendingDeleteStore((state) => state.schedule);
  const undo = usePendingDeleteStore((state) => state.undo);

  return useCallback(
    (args: UndoableDeleteArgs) => {
      // Der Toast entsteht erst nach dem Planen, weil seine Aktion die
      // Pending-Id braucht; `run` wiederum braucht die Toast-Id. Ein Halter
      // löst die Verschränkung, ohne dass eine der beiden Ids zum Zeitpunkt
      // ihrer Benutzung noch leer sein kann: der Timer läuft frühestens
      // UNDO_WINDOW_MS später.
      const held: { toastId?: string } = {};

      const pendingId = schedule(args.kind, args.target, async () => {
        if (held.toastId) dismiss(held.toastId);
        try {
          await args.run();
        } catch (err) {
          // Kein `Alert`: der Nutzer steht längst auf einem anderen Screen, und
          // ein Dialog fünf Sekunden später wäre ein Überfall. Fehler-Toasts
          // laufen nie ab und tragen ihr ✕ (Decision 12 der Spec).
          show({
            title: args.errorTitle,
            message: args.formatError(err),
            variant: "error",
            position: "bottom",
          });
        }
      });

      held.toastId = show({
        title: args.title,
        message: args.message,
        variant: "success",
        position: "bottom",
        durationMs: UNDO_WINDOW_MS,
        action: {
          label: t("action.undo"),
          // Der Rückgabewert (griff das Rückgängigmachen noch?) wird hier
          // bewusst verworfen: `onPress` ist `() => void`, und der einzige
          // Fall, in dem `undo` `false` meldet, ist der Tap im selben Frame,
          // in dem die Löschung schon läuft — dann schließt der Toast ohnehin.
          onPress: () => {
            undo(pendingId);
          },
        },
      });
    },
    [t, show, dismiss, schedule, undo],
  );
}
