import DateTimePicker from "@react-native-community/datetimepicker";
import { useTranslation } from "react-i18next";
import { Modal, Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/design-system/ThemeProvider";
import { Button } from "@/design-system/ui";

import type { DateTimePickerSheetProps } from "./DateTimePickerSheet.types";

/**
 * Platform-native date/time picker: a bottom sheet on iOS, the system dialog
 * on Android, a `<input type="date">` on web (see the .web.tsx sibling).
 *
 * It knows nothing about what the value means — a range's start, a task's due
 * date. The caller maps its own state onto `mode` + `value`.
 */
export function DateTimePickerSheet({ mode, value, onPick, onClose }: DateTimePickerSheetProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const isDateMode = mode === "date";

  const onChange = (event: { type: string }, selected?: Date) => {
    if (!mode) return;
    if (Platform.OS === "android") onClose();
    if (event.type === "dismissed" || !selected) {
      if (Platform.OS === "ios") onClose();
      return;
    }
    onPick(selected);
    // The inline iOS calendar has no confirm affordance of its own, so picking
    // a date closes the sheet. The time spinners stay open until "Fertig".
    if (Platform.OS === "ios" && isDateMode) onClose();
  };

  if (Platform.OS !== "ios") {
    if (!mode) return null;
    return (
      <DateTimePicker
        value={value}
        mode={isDateMode ? "date" : "time"}
        display="default"
        onChange={onChange}
      />
    );
  }

  return (
    <Modal visible={mode !== null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: theme.overlay, justifyContent: "flex-end" }}
        onPress={onClose}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: theme.card,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: 16 + insets.bottom,
          }}
        >
          <View style={{ alignItems: "center", marginBottom: 8 }}>
            <View
              style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: theme.lineStrong }}
            />
          </View>
          {mode ? (
            <DateTimePicker
              value={value}
              mode={mode}
              display={isDateMode ? "inline" : "spinner"}
              onChange={onChange}
              themeVariant={theme.card === "#FFFFFF" ? "light" : "dark"}
            />
          ) : null}
          <View style={{ marginTop: 8 }}>
            <Button block label={t("action.done")} tone="primary" onPress={onClose} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
