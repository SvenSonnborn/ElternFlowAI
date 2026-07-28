import DateTimePicker from "@react-native-community/datetimepicker";
import { useTranslation } from "react-i18next";
import { Modal, Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { DateRange, RangeField } from "@/features/calendar";

import { useTheme } from "@/design-system/ThemeProvider";
import { Button } from "@/design-system/ui";

interface DateTimePickerSheetProps {
  /** Which of the four range pickers is open; `null` renders nothing. */
  field: RangeField | null;
  range: DateRange;
  onPick: (field: RangeField, selected: Date) => void;
  onClose: () => void;
}

/**
 * Platform-native date/time picker for a start–end range: a bottom sheet on
 * iOS, the system dialog on Android. Shared by the create and edit forms so the
 * two can never drift apart on picker behaviour.
 */
export function DateTimePickerSheet({ field, range, onPick, onClose }: DateTimePickerSheetProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const isDateField = field === "startDate" || field === "endDate";
  const isEndField = field === "endDate" || field === "endTime";
  const value = isEndField ? range.endAt : range.startAt;

  const onChange = (event: { type: string }, selected?: Date) => {
    if (!field) return;
    if (Platform.OS === "android") onClose();
    if (event.type === "dismissed" || !selected) {
      if (Platform.OS === "ios") onClose();
      return;
    }
    onPick(field, selected);
    // The inline iOS calendar has no confirm affordance of its own, so picking
    // a date closes the sheet. The time spinners stay open until "Fertig".
    if (Platform.OS === "ios" && isDateField) onClose();
  };

  if (Platform.OS !== "ios") {
    if (!field) return null;
    return (
      <DateTimePicker
        value={value}
        mode={isDateField ? "date" : "time"}
        display="default"
        onChange={onChange}
      />
    );
  }

  return (
    <Modal visible={field !== null} transparent animationType="slide" onRequestClose={onClose}>
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
          {field ? (
            <DateTimePicker
              value={value}
              mode={isDateField ? "date" : "time"}
              display={isDateField ? "inline" : "spinner"}
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
