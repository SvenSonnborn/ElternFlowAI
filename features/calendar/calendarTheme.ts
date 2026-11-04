import type { Theme as RNCalendarTheme } from "react-native-calendars/src/types";

import type { Theme } from "@/design-system/themes";

import { fontFamily } from "@/design-system";

export function buildCalendarTheme(t: Theme): RNCalendarTheme {
  return {
    calendarBackground: t.card,
    backgroundColor: t.card,
    textSectionTitleColor: t.inkSecondary,
    dayTextColor: t.ink,
    textDisabledColor: t.inkTertiary,
    todayTextColor: t.onMint,
    todayBackgroundColor: t.primary,
    selectedDayBackgroundColor: t.primarySoft,
    selectedDayTextColor: t.primaryStrong,
    monthTextColor: t.ink,
    arrowColor: t.primary,
    // Monatstitel und Wochentage rendert die Bibliothek selbst; ohne Familie
    // fielen sie auf Web in die Systemschrift (-apple-system) zurück.
    textMonthFontFamily: fontFamily.sans,
    textDayHeaderFontFamily: fontFamily.sans,
    textDayFontFamily: fontFamily.sans,
    textDayFontWeight: "500",
    textMonthFontWeight: "700",
    textDayHeaderFontWeight: "600",
    textDayFontSize: 14,
    textMonthFontSize: 16,
    textDayHeaderFontSize: 12,
  };
}
