import { type ReactNode } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DS } from "@/design-system";

import { Toast } from "./Toast";
import { useToastStore, type ToastEntry, type ToastPosition } from "./toastStore";

const spec = DS.components.toast;

/**
 * Der Wirt, der die Toasts zeichnet — einmal im Root-Layout montiert, über
 * dem Navigator.
 *
 * Warum hier und nicht pro Screen, wie [patterns/toast.md] den `ToastStack`
 * beschreibt: ein Toast überlebt den Screenwechsel, der ihn ausgelöst hat
 * („gespeichert" erscheint, während der Nutzer schon zurücknavigiert). Ein
 * Stapel pro Screen ginge mit dem Screen verloren. Die Geometrie aus dem
 * Pattern bleibt dieselbe, sie misst nur gegen das Fenster statt gegen den
 * Screen.
 *
 * Der Provider **verteilt nichts** — der Store liegt auf Modulebene, und
 * `useToast()` kommt ohne Context aus. Er ist reine Darstellung; ihn zu
 * vergessen heißt, dass Toasts unsichtbar bleiben, nicht dass etwas wirft.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  const insets = useSafeAreaInsets();

  const top = toasts.filter((t) => t.position === "top");
  const bottom = toasts.filter((t) => t.position === "bottom");

  return (
    <>
      {children}
      <ToastStack
        entries={top}
        position="top"
        // 52 im Design = 44 Statusleiste + 8. Auf Geräten mit größerer
        // Aussparung wächst der Abstand mit, statt darunter zu verschwinden.
        offset={Math.max(spec.stack.top, insets.top + 8)}
        onDismiss={dismiss}
      />
      <ToastStack
        entries={bottom}
        position="bottom"
        // 96 hält 24px Luft über der 72px-Tab-Bar; der Home-Indicator schiebt
        // die Tab-Bar nach oben, also kommt sein Inset hier dazu.
        offset={spec.stack.bottom + insets.bottom}
        onDismiss={dismiss}
      />
    </>
  );
}

interface ToastStackProps {
  entries: ToastEntry[];
  position: ToastPosition;
  offset: number;
  onDismiss: (id: string) => void;
}

function ToastStack({ entries, position, offset, onDismiss }: ToastStackProps) {
  if (entries.length === 0) return null;
  return (
    <View
      // `box-none` statt `none`: der Container selbst nimmt keine Taps an —
      // sonst läge über der halben App eine tote Fläche —, die Toasts darin
      // schon.
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: spec.stack.insetX,
        right: spec.stack.insetX,
        [position]: offset,
        gap: spec.stack.gap,
        zIndex: spec.stack.zIndex,
      }}
    >
      {entries.map((entry) => (
        <Toast key={entry.id} entry={entry} onDismiss={onDismiss} />
      ))}
    </View>
  );
}
