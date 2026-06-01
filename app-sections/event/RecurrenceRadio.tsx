import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import type { RecurrenceOption } from "@/features/calendar";

import { useTheme } from "@/design-system/ThemeProvider";
import { Text } from "@/design-system/ui";

interface RecurrenceRadioProps {
  label: string;
  value: RecurrenceOption;
  onChange: (next: RecurrenceOption) => void;
}

const OPTIONS: RecurrenceOption[] = ["none", "daily", "weekdays", "weekly", "monthly"];

export function RecurrenceRadio({ label, value, onChange }: RecurrenceRadioProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();

  return (
    <View>
      <Text
        variant="caption"
        tone="inkSecondary"
        style={{ textTransform: "uppercase", fontWeight: "700", letterSpacing: 1.2 }}
      >
        {label}
      </Text>
      <View
        className="mt-1.5 overflow-hidden rounded-xl border bg-card"
        style={{ borderColor: theme.line }}
      >
        {OPTIONS.map((opt, idx) => {
          const isSelected = opt === value;
          const isLast = idx === OPTIONS.length - 1;
          return (
            <Pressable
              key={opt}
              accessibilityRole="radio"
              accessibilityLabel={t(`cal.recur.${opt}`)}
              accessibilityState={{ selected: isSelected, checked: isSelected }}
              onPress={() => onChange(opt)}
              className="h-12 flex-row items-center gap-3 px-3.5 active:opacity-70"
              style={{
                borderBottomWidth: isLast ? 0 : 1,
                borderBottomColor: theme.line,
              }}
            >
              <View
                className="items-center justify-center rounded-full"
                style={{
                  width: 20,
                  height: 20,
                  borderWidth: 2,
                  borderColor: isSelected ? theme.primaryStrong : theme.lineStrong,
                }}
              >
                {isSelected ? (
                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: theme.primaryStrong,
                    }}
                  />
                ) : null}
              </View>
              <Text variant="body" tone={isSelected ? "ink" : "inkSecondary"}>
                {t(`cal.recur.${opt}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
