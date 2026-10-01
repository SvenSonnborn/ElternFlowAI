import { format, isValid } from "date-fns";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, View } from "react-native";

import { useTheme } from "@/design-system/ThemeProvider";
import { Button } from "@/design-system/ui";

import type { DateTimePickerMode, DateTimePickerSheetProps } from "./DateTimePickerSheet.types";

import { webPickerChange } from "./webPickerValue";

/**
 * Web counterpart of DateTimePickerSheet. `@react-native-community/datetimepicker`
 * has no web implementation — rendering it there opens nothing and floods the
 * console with "Maximum update depth exceeded" — so this file takes over on web
 * and the native module never enters the web bundle at all.
 *
 * Raw `<input>` is legitimate here: on web the renderer is react-dom.
 *
 * "Fertig" accepts what the input shows (`onPick(value)`, then `onClose()`);
 * scrim tap and Escape (`onRequestClose`) close without accepting the shown
 * value — edits already typed were committed by the input's `onChange` and
 * stay. Same contract as the native sheet: the sheet opens on `value` as if
 * selected — for an empty birthday a 2018-01-01 placeholder — and an untouched
 * "Fertig" must not leave the caller's state empty, which is also what
 * Android's OK does.
 *
 * Meldet der Browser einen unparsbaren Rohwert (ein gelöschtes Segment, 29.02.
 * im Nicht-Schaltjahr), zeigt das Input ihn als lokalen Entwurf, statt auf den
 * Wert des Aufrufers zurückzuspringen; "Fertig" übernimmt dann den letzten
 * gültigen Wert. Der Entwurf lebt nur, solange das Sheet offen ist, und ein
 * anderes Feld beginnt nie mit dem des vorigen (`key` am inneren Teil).
 */
export function DateTimePickerSheet({ mode, ...props }: DateTimePickerSheetProps) {
  if (!mode) return null;
  // Eigener innerer Teil statt Hooks im äußeren: die dürfen nicht hinter dem
  // frühen `return null` stehen. Der `key` setzt den Entwurf beim Wechsel von
  // Feld oder Modus zurück.
  return <PickerSheetBody key={`${mode}:${props.accessibilityLabel}`} mode={mode} {...props} />;
}

type PickerSheetBodyProps = Omit<DateTimePickerSheetProps, "mode"> & { mode: DateTimePickerMode };

function PickerSheetBody({
  mode,
  value,
  accessibilityLabel,
  maximumDate,
  onPick,
  onClose,
}: PickerSheetBodyProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [draft, setDraft] = useState<string | null>(null);

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
              value={draft ?? (isValid(value) ? format(value, pattern) : "")}
              // `max` begrenzt nur die Auswahl im Browser-Picker, nicht das Tippen —
              // einen Wert hinter dem Maximum klemmt `parseWebPickerValue` im onChange.
              max={isDateMode && maximumDate ? format(maximumDate, "yyyy-MM-dd") : undefined}
              onChange={(event) => {
                const result = webPickerChange(event.target.value, mode, value, maximumDate);
                setDraft(result.draft);
                if (result.pick) onPick(result.pick);
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
