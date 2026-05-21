import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { ChildAvatar, Icon, SectionHeader, TopBar } from "@/app-sections/shared";
import { palette } from "@/design-system";
import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Card, Screen, Text } from "@/design-system/ui";
import { monthGridMay2026, selectedDayEvents } from "@/features/sample-data";

const WEEKDAYS_DE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const WEEKDAYS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function KalenderScreen() {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const lang = i18n.language.startsWith("de") ? "de" : "en";
  const weekdays = lang === "de" ? WEEKDAYS_DE : WEEKDAYS_EN;
  const monthLabel = t("cal.title.month", { monthName: lang === "de" ? "Mai" : "May", year: 2026 });

  const legend = [
    { k: t("cal.legend.arzt"), c: palette.event.arzt },
    { k: t("cal.legend.schule"), c: palette.event.schule },
    { k: t("cal.legend.sport"), c: palette.event.sport },
    { k: t("cal.legend.ha"), c: palette.event.ha },
  ];

  return (
    <Screen scroll>
      <TopBar title={monthLabel} sub={t("cal.sub")} />

      <View className="mb-3 flex-row items-center justify-between">
        <Pressable className="h-8 w-8 items-center justify-center rounded-lg border border-line bg-card active:opacity-70">
          <Icon name="chevron-left" size={14} color={theme.inkSecondary} />
        </Pressable>
        <Text variant="bodyEmph">{lang === "de" ? "Mai" : "May"}</Text>
        <Pressable className="h-8 w-8 items-center justify-center rounded-lg border border-line bg-card active:opacity-70">
          <Icon name="chevron-right" size={14} color={theme.inkSecondary} />
        </Pressable>
      </View>

      <Card className="p-2">
        <View className="flex-row">
          {weekdays.map((w) => (
            <View key={w} className="flex-1 items-center py-2">
              <Text variant="caption" tone="inkSecondary">
                {w}
              </Text>
            </View>
          ))}
        </View>
        <View className="flex-row flex-wrap">
          {monthGridMay2026.map((cell, i) => {
            const ink = cell.isToday ? "white" : cell.isCurrentMonth ? "ink" : "inkTertiary";
            return (
              <View
                key={i}
                className="items-center justify-start py-1.5"
                style={{ width: `${100 / 7}%`, minHeight: 44 }}
              >
                <View
                  className={`h-9 w-9 items-center justify-center rounded-pill ${
                    cell.isToday ? "bg-primary" : ""
                  }`}
                >
                  <Text
                    variant="caption"
                    tone={ink}
                    style={{
                      fontVariant: ["tabular-nums"],
                      fontWeight: cell.isToday ? "700" : "500",
                    }}
                  >
                    {cell.day}
                  </Text>
                </View>
                {cell.dots.length > 0 && cell.isCurrentMonth ? (
                  <View className="mt-1 flex-row gap-0.5">
                    {cell.dots.slice(0, 3).map((dotColor, di) => (
                      <View
                        key={di}
                        style={{
                          width: 4,
                          height: 4,
                          borderRadius: 2,
                          backgroundColor: cell.isToday ? "rgba(255,255,255,0.9)" : dotColor,
                        }}
                      />
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
        <View className="mt-2 flex-row items-center justify-around border-t border-line pt-3">
          {legend.map((l) => (
            <View key={l.k} className="flex-row items-center gap-1.5">
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: l.c }} />
              <Text variant="caption" tone="inkSecondary">
                {l.k}
              </Text>
            </View>
          ))}
        </View>
      </Card>

      <SectionHeader title={t("cal.selectedDay")} />
      <View className="gap-2">
        {selectedDayEvents.slice(0, 3).map((event) => (
          <View
            key={event.id}
            className="flex-row items-center gap-3 overflow-hidden rounded-2xl border border-line bg-card p-3 pl-4"
          >
            <View
              className="absolute bottom-2 left-1.5 top-2 w-1 rounded-full"
              style={{ backgroundColor: event.tone }}
            />
            <View className="w-12">
              <Text variant="bodyEmph">{event.time}</Text>
              <Text variant="caption" tone="inkSecondary">
                {Math.round(event.durationMin / 60) >= 1
                  ? `${Math.round(event.durationMin / 60)} h`
                  : `${event.durationMin} m`}
              </Text>
            </View>
            <View className="flex-1">
              <Text variant="listTitle" numberOfLines={1}>
                {event.title}
              </Text>
              <View className="mt-0.5 flex-row items-center gap-1.5">
                <ChildAvatar name={event.who.split(" ")[0]} color={event.tone} size="sm" />
                <Text variant="caption" tone="inkSecondary">
                  {event.who}
                </Text>
              </View>
            </View>
            <Icon name={event.iconName} size={16} color={event.tone} />
          </View>
        ))}
      </View>

      <Button label={t("cal.add.voice")} variant="soft" tone="accent" block className="mt-4" />
    </Screen>
  );
}
