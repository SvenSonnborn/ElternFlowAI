import { usePreventRemove, useRoute } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";

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
 * `allowLeave()` ist einseitig: Die Sperre kommt für diesen Mount nicht
 * zurück. Deshalb nur unmittelbar vor einer Navigation aufrufen, die nicht
 * scheitern kann.
 *
 * Plattformen: iOS fängt das Wegwischen über `preventNativeDismiss`, auf Web
 * kommt `beforeunload` hinzu. Auf Android verwirft Wischen und Scrim-Tipp
 * ohne Rückfrage: Das Sheet ist nativ schon geschlossen, wenn die Sperre
 * greifen könnte, und eine Rückfrage danach ließe bei „Weiter bearbeiten“ eine
 * Geisterroute zurück (docs/TODO.md). Der native Dismiss ist die POP-Aktion
 * mit der eigenen Route als `source` (`makePopAction` des NativeStack);
 * „Abbrechen“ und die Zurück-Taste sind `GO_BACK` und fragen weiter.
 *
 * `saving` markiert ein laufendes Speichern. Dann bleibt die Sperre auch bei
 * unverändertem Formular stehen — ein Schließen mitten im Schreiben ließe den
 * Fehlschlag ins Leere laufen —, doch der Callback kehrt ohne Rückfrage
 * zurück: „Änderungen verwerfen?“ wäre falsch, weil das Speichern ohnehin
 * weiterläuft. Der Android-Fall bleibt davor und geht auch jetzt durch, weil
 * das Sheet dort nativ schon zu ist (siehe oben). Endet das Speichern ohne
 * `allowLeave()`, also mit Fehler, gilt wieder `dirty` allein.
 *
 * `onNativeDismiss` läuft im Android-Fall synchron vor `repeat()`: Der Screen
 * ist dann für den Nutzer weg, abgebaut wird er aber erst nach dem nächsten
 * Render, und ein Effekt-Cleanup läuft noch später. Ein Formular, das am Ende
 * seines Speicherns wissen muss, ob es noch steht (`hasLeft` in den
 * Aufgaben-Formularen), setzt sein Flag hier statt erst im Cleanup.
 */
export function useDiscardGuard(
  dirty: boolean,
  saving = false,
  onNativeDismiss?: () => void,
): () => void {
  const { t } = useTranslation();
  const [leaving, setLeaving] = useState(false);
  const { key: routeKey } = useRoute();

  const disablePrevention = usePreventRemove((dirty || saving) && !leaving, ({ data, repeat }) => {
    const { action } = data;
    if (Platform.OS === "android" && action.type === "POP" && action.source === routeKey) {
      onNativeDismiss?.();
      setLeaving(true);
      repeat();
      return;
    }
    if (saving) return;
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
