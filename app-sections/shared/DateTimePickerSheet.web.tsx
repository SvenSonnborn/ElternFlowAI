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
                // date-fns parse() only back-fills unspecified units from the
                // reference date if the pattern omits those units. In date mode
                // (pattern "yyyy-MM-dd"), the clock is missing—parse always resets
                // it to 00:00:00, losing the original time. We must carry it over
                // explicitly. In time mode (pattern "HH:mm"), the date is missing—
                // parse correctly back-fills it from the reference, so no carry
                // needed. Guard: if value is invalid, use epoch as the fallback.
                const baseValue = isValid(value) ? value : new Date(0);
                const parsed = parse(event.target.value, pattern, baseValue);
                if (!isValid(parsed)) return;

                if (isDateMode) {
                  // Explicitly carry over the clock from the reference date
                  const next = new Date(parsed);
                  next.setHours(
                    baseValue.getHours(),
                    baseValue.getMinutes(),
                    baseValue.getSeconds(),
                    baseValue.getMilliseconds(),
                  );
                  onPick(next);
                } else {
                  // Time mode: date is already preserved from baseValue
                  onPick(parsed);
                }
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
