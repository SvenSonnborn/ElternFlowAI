import { usePreventRemove } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { confirmDestructive } from "./confirmDialog";

/**
 * Fragt vor dem Verwerfen geänderter Formulareingaben nach — beim Wegwischen
 * des Sheets wie bei „Abbrechen" (jedes Entfernen der Route, das
 * `usePreventRemove` abfängt). Gibt `allowLeave` zurück: Wer nach dem Speichern
 * selbst navigiert, ruft es im selben Handler **vor** dem Navigationsaufruf.
 *
 * `leaving` ist lokaler State und kein bloßes `disablePrevention()`, damit auch
 * der Prop `preventRemove` fällt — `usePreventRemove` warnt im Dev-Build sonst
 * über einen veralteten Wert. Der direkte Aufruf danach trägt, weil der
 * Navigations-Reducer die Sperrliste beim nächsten Render liest; `repeat()` in
 * der Bestätigung arbeitet intern genauso.
 *
 * Plattformen: iOS fängt das Wegwischen über `preventNativeDismiss`, auf Web
 * kommt `beforeunload` hinzu; Android-Wischen bleibt ohne Rückfrage (docs/TODO.md).
 */
export function useDiscardGuard(dirty: boolean): () => void {
  const { t } = useTranslation();
  const [leaving, setLeaving] = useState(false);

  const disablePrevention = usePreventRemove(dirty && !leaving, ({ repeat }) => {
    void confirmDestructive({
      title: t("form.discard.title"),
      body: t("form.discard.body"),
      confirm: t("form.discard.confirm"),
      cancel: t("form.discard.cancel"),
    }).then((discard) => {
      if (!discard) return;
      setLeaving(true);
      repeat();
    });
  });

  return () => {
    setLeaving(true);
    disablePrevention();
  };
}
