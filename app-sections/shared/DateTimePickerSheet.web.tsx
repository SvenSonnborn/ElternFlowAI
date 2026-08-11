import { format, isValid, parse } from "date-fns";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, View } from "react-native";

import { useTheme } from "@/design-system/ThemeProvider";
import { Button } from "@/design-system/ui";

import type { DateTimePickerSheetProps } from "./DateTimePickerSheet.types";

/**
 * Web counterpart of DateTimePickerSheet. `@react-native-community/datetimepicker`
 * has no web implementation — rendering it there opens nothing and floods the
 * console with "Maximum update depth exceeded" — so this file takes over on web
 * and the native module never enters the web bundle at all.
 *
 * Raw `<input>` is legitimate here: on web the renderer is react-dom.
 */
export function DateTimePickerSheet({ mode, value, onPick, onClose }: DateTimePickerSheetProps) {
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
              value={isValid(value) ? format(value, pattern) : ""}
              onChange={(event) => {
                // Parsing against `value` keeps the part the input does not
                // edit: the date picker leaves the clock alone and vice versa.
                const next = parse(event.target.value, pattern, value);
                if (isValid(next)) onPick(next);
              }}
              style={{
                fontFamily: "Inter",
                fontSize: 16,
                padding: 12,
                width: "100%",
                boxSizing: "border-box",
                borderRadius: 12,
                border: `1px solid ${theme.line}`,
                background: theme.card,
                color: theme.ink,
              }}
            />
          </View>
          <Button block label={t("action.done")} tone="primary" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
