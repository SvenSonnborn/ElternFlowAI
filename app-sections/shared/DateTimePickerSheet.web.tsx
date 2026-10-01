import { format, isValid } from "date-fns";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, View } from "react-native";

import { useTheme } from "@/design-system/ThemeProvider";
import { Button } from "@/design-system/ui";

import type { DateTimePickerSheetProps } from "./DateTimePickerSheet.types";

import { parseWebPickerValue } from "./webPickerValue";

/**
 * Web counterpart of DateTimePickerSheet. `@react-native-community/datetimepicker`
 * has no web implementation — rendering it there opens nothing and floods the
 * console with "Maximum update depth exceeded" — so this file takes over on web
 * and the native module never enters the web bundle at all.
 *
 * Raw `<input>` is legitimate here: on web the renderer is react-dom.
 *
 * "Fertig" accepts what the input shows (`onPick(value)`, then `onClose()`);
 * scrim tap and Escape (`onRequestClose`) are a pure cancel. Same contract as
 * the native sheet: the sheet opens on `value` as if selected — for an empty
 * birthday a 2018-01-01 placeholder — and an untouched "Fertig" must not leave
 * the caller's state empty, which is also what Android's OK does.
 */
export function DateTimePickerSheet({
  mode,
  value,
  accessibilityLabel,
  maximumDate,
  onPick,
  onClose,
}: DateTimePickerSheetProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();

  if (!mode) return null;

  const isDateMode = mode === "date";
  const pattern = isDateMode ? "yyyy-MM-dd" : "HH:mm";

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{
          flex: 1,
          backgroundColor: theme.overlay,
          justifyContent: "center",
          alignItems: "center",
        }}
        onPress={onClose}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: theme.card,
            borderRadius: 20,
            padding: 16,
            gap: 12,
            minWidth: 260,
          }}
        >
          <View>
            <input
              type={isDateMode ? "date" : "time"}
              // The only naming this control gets: the sheet has no visible
              // label, and the field that opened it is behind the modal.
              aria-label={accessibilityLabel}
              value={isValid(value) ? format(value, pattern) : ""}
              // `max` begrenzt nur die Auswahl im Browser-Picker, nicht das Tippen —
              // einen Wert hinter dem Maximum klemmt `parseWebPickerValue` im onChange.
              max={isDateMode && maximumDate ? format(maximumDate, "yyyy-MM-dd") : undefined}
              onChange={(event) => {
                const next = parseWebPickerValue(event.target.value, mode, value, maximumDate);
                if (next) onPick(next);
              }}
              style={{
                fontFamily: "Inter",
                fontSize: 16,
                padding: 12,
                width: "100%",
                minHeight: 44,
                boxSizing: "border-box",
                borderRadius: 12,
                border: `1px solid ${theme.line}`,
                background: theme.card,
                color: theme.ink,
              }}
            />
          </View>
          <Button
            block
            label={t("action.done")}
            tone="primary"
            onPress={() => {
              if (isValid(value)) onPick(value);
              onClose();
            }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
