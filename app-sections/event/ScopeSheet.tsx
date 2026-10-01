import { Modal, Pressable, View } from "react-native";

import type { EditScope } from "@/features/calendar";

import { DS } from "@/design-system";
import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Text } from "@/design-system/ui";

import type { ScopeDialogLabels } from "./scopeSheetStore";

interface ScopeSheetProps {
  labels: ScopeDialogLabels;
  /** `null` heißt abgebrochen — Knopf „Abbrechen", Scrim-Tap und Android-Zurück. */
  onSettle: (scope: EditScope | null) => void;
}

/**
 * Die Scope-Frage für Serientermine als Karte auf einem Scrim, für Android und
 * Web (iOS nimmt `ActionSheetIOS`, siehe `pickScope`).
 *
 * `Modal` statt `Alert.alert`: React Native schneidet `Alert` auf Android auf
 * drei Buttons ab — „Abbrechen" fehlte —, und react-native-web implementiert es
 * als No-op. Die Bauform ist dieselbe wie `ConflictDialog`; auch die
 * `accessible={false}`-Begründung an Scrim und Karte ist dort nachzulesen und
 * gilt hier unverändert (sonst verschmilzt die Karte mit allen vier Knöpfen zu
 * einem A11y-Element).
 *
 * Anders als dort gibt es einen eigenen „Abbrechen"-Knopf: Das Formular lebt
 * hinter dem Sheet weiter, ein Abbruch führt also zu etwas zurück. Scrim-Tap
 * und `onRequestClose` (Android-Zurück) wirken wie dieser Knopf.
 */
export function ScopeSheet({ labels, onSettle }: ScopeSheetProps) {
  const { theme } = useTheme();

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => onSettle(null)}>
      {/* `accessible={false}` an beiden `Pressable`: Begründung in `ConflictDialog`. */}
      <Pressable
        style={{
          flex: 1,
          backgroundColor: DS.components.bottomSheet.scrimColor,
          justifyContent: "center",
          alignItems: "center",
          padding: 24,
        }}
        accessible={false}
        importantForAccessibility="no"
        onPress={() => onSettle(null)}
      >
        <Pressable
          accessible={false}
          onPress={(event) => event.stopPropagation()}
          style={{
            backgroundColor: theme.card,
            borderRadius: 20,
            padding: 20,
            gap: 14,
            width: "100%",
            maxWidth: 420,
          }}
        >
          <Text variant="h2" accessibilityRole="header">
            {labels.title}
          </Text>

          <View style={{ gap: 8 }}>
            <Button
              label={labels.this}
              variant="soft"
              tone="primary"
              size="lg"
              block
              onPress={() => onSettle("this")}
            />
            <Button
              label={labels.forward}
              variant="soft"
              tone="primary"
              size="lg"
              block
              onPress={() => onSettle("forward")}
            />
            <Button
              label={labels.all}
              variant="soft"
              tone="primary"
              size="lg"
              block
              onPress={() => onSettle("all")}
            />
            <Button
              label={labels.cancel}
              variant="ghost"
              tone="neutral"
              size="lg"
              block
              onPress={() => onSettle(null)}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
