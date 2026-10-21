import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { Icon } from "@/app-sections/shared";
import { touchTarget } from "@/design-system";
import { useTheme } from "@/design-system/ThemeProvider";
import { Text } from "@/design-system/ui";
import { shiftWeek, weekStartFor } from "@/features/meals";
import { useToday } from "@/features/shared";

interface WeekNavProps {
  /** Der Montag der angezeigten Woche. */
  weekStart: Date;
  /** Ob `weekStart` die Woche von heute ist — dann entfällt „Diese Woche". */
  isCurrentWeek: boolean;
  onChange: (weekStart: Date) => void;
}

/**
 * Wochen-Navigation des Essen-Tabs: zurück, vor und — nur abseits der
 * aktuellen Woche — der Sprung zurück zu heute. Blättern ist unbegrenzt, weil
 * Eltern freitags die *kommende* Woche planen.
 *
 * Alle drei Flächen sind `touchTarget.min` groß und tragen ihre Optik in einer
 * inneren `View` (Vorbild `FilterChipRow`, ADR-041). Die Pfeile heißen „prev"
 * und „next" und nicht „links/rechts", damit sie in RTL-Sprachen nicht lügen.
 */
export function WeekNav({ weekStart, isCurrentWeek, onChange }: WeekNavProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const today = useToday();

  return (
    <View className="mt-3 flex-row items-center gap-1">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("meals.week.prev")}
        onPress={() => onChange(shiftWeek(weekStart, -1))}
        className="items-center justify-center active:opacity-70"
        style={{ width: touchTarget.min, height: touchTarget.min }}
      >
        <Icon name="chevron-left" size={20} color={theme.ink} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("meals.week.next")}
        onPress={() => onChange(shiftWeek(weekStart, 1))}
        className="items-center justify-center active:opacity-70"
        style={{ width: touchTarget.min, height: touchTarget.min }}
      >
        <Icon name="chevron-right" size={20} color={theme.ink} />
      </Pressable>
      {isCurrentWeek ? null : (
        <Pressable
          accessibilityRole="button"
          onPress={() => onChange(weekStartFor(today))}
          className="justify-center active:opacity-70"
          style={{ minHeight: touchTarget.min }}
        >
          <View className="rounded-pill bg-primary-soft px-3 py-1.5">
            <Text variant="caption" tone="primaryStrong">
              {t("meals.week.current")}
            </Text>
          </View>
        </Pressable>
      )}
    </View>
  );
}
