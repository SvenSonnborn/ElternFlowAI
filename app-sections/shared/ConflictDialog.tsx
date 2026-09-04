import { Modal, Pressable, ScrollView, View } from "react-native";

import { DS } from "@/design-system";
import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Text } from "@/design-system/ui";

import type { ConflictEntry } from "./conflictStore";

interface ConflictDialogProps {
  entry: ConflictEntry;
  onKeepMine: () => void;
  onKeepTheirs: () => void;
}

/**
 * Der Vergleich zweier Fassungen, mit zwei Auswegen.
 *
 * `Modal` statt `Alert.alert`, und das ist keine Geschmacksfrage:
 * react-native-web implementiert `Alert.alert` als No-Op (`static alert() {}`),
 * der Dialog wäre im Web-Bundle unsichtbar — ausgerechnet dort, wo der
 * Zwei-Client-Test läuft (ADR-031). Die Bauform ist dieselbe wie in
 * `DateTimePickerSheet.web.tsx`.
 *
 * Bewusst nur **zwei** Aktionen: „Abbrechen" fiele mit „Andere Fassung
 * behalten" zusammen, weil das Bearbeiten-Sheet längst zu ist — es gibt kein
 * Formular mehr, in das ein Abbruch zurückführen könnte. Der Scrim-Tap wirkt
 * wie „behalten": nichts tun heißt hier, dass die fremde Fassung gilt.
 *
 * `rows` darf leer sein (Compare-and-Swap ohne fremde Fassung). Dann steht der
 * Text allein — stilles Durchwinken wäre der Fehler, gegen den der Dialog
 * gebaut ist.
 */
export function ConflictDialog({ entry, onKeepMine, onKeepTheirs }: ConflictDialogProps) {
  const { theme } = useTheme();

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onKeepTheirs}>
      <Pressable
        style={{
          flex: 1,
          backgroundColor: DS.components.bottomSheet.scrimColor,
          justifyContent: "center",
          alignItems: "center",
          padding: 24,
        }}
        accessibilityLabel={entry.keepTheirsLabel}
        onPress={onKeepTheirs}
      >
        <Pressable
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
          <Text variant="h2">{entry.title}</Text>
          <Text variant="body" tone="inkSecondary">
            {entry.body}
          </Text>

          {entry.rows.length > 0 ? (
            <ScrollView style={{ maxHeight: 260 }} contentContainerStyle={{ gap: 12 }}>
              {entry.rows.map((row) => (
                <View
                  key={row.label}
                  style={{
                    backgroundColor: theme.cardSubtle,
                    borderRadius: 14,
                    padding: 12,
                    gap: 6,
                  }}
                >
                  <Text variant="caption" tone="inkTertiary">
                    {row.label}
                  </Text>
                  <Text variant="body">{row.theirs}</Text>
                  <Text variant="body" tone="primaryStrong">
                    {row.mine}
                  </Text>
                </View>
              ))}
            </ScrollView>
          ) : null}

          <View style={{ gap: 8 }}>
            <Button label={entry.keepMineLabel} size="lg" block onPress={onKeepMine} />
            <Button
              label={entry.keepTheirsLabel}
              variant="soft"
              tone="neutral"
              size="lg"
              block
              onPress={onKeepTheirs}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
