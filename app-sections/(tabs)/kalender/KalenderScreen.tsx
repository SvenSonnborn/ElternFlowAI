import { format, parseISO } from "date-fns";
import { de as deLocale, enUS as enLocale } from "date-fns/locale";
import { useRouter } from "expo-router";
import { type TFunction } from "i18next";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Calendar } from "react-native-calendars";

import { ChildAvatar, Icon, SectionHeader, TopBar } from "@/app-sections/shared";
import { palette } from "@/design-system";
import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Card, Screen, Text } from "@/design-system/ui";
import { useCurrentParent, useFamilyChildren } from "@/features/auth";
import {
  buildCalendarTheme,
  setCalendarLocale,
  useFamilyEvents,
  useMarkedDates,
} from "@/features/calendar";

import { CalendarDay } from "./CalendarDay";

const LEGEND: { slug: "arzt" | "schule" | "sport" | "ha" | "family" | "meal"; color: string }[] = [
  { slug: "arzt", color: palette.event.arzt },
  { slug: "schule", color: palette.event.schule },
  { slug: "sport", color: palette.event.sport },
  { slug: "ha", color: palette.event.ha },
  { slug: "family", color: palette.event.family },
  { slug: "meal", color: palette.event.meal },
];

function formatDurationLabel(durationMin: number, t: TFunction): string {
  if (durationMin >= 60) {
    const h = Math.round(durationMin / 60);
    return `${h} ${t("cal.duration.hourShort")}`;
  }
  return `${durationMin} ${t("cal.duration.minuteShort")}`;
}

export function KalenderScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { theme, themeName } = useTheme();
  const lang = i18n.language.startsWith("de") ? "de" : "en";
  const dateLocale = lang === "de" ? deLocale : enLocale;

  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [visibleMonth, setVisibleMonth] = useState(() => new Date());

  useEffect(() => {
    setCalendarLocale(lang);
  }, [lang]);

  const { data: occurrences } = useFamilyEvents(visibleMonth);
  const markedDates = useMarkedDates(occurrences, selectedDate, theme.primarySoft);
  const parent = useCurrentParent();
  const familyChildren = useFamilyChildren(parent.data?.family_id);

  const dayEvents = useMemo(
    () =>
      occurrences
        .filter((o) => o.occurrenceDate === selectedDate)
        .sort((a, b) => a.startAt.getTime() - b.startAt.getTime()),
    [occurrences, selectedDate],
  );

  const monthName = format(visibleMonth, "LLLL", { locale: dateLocale });
  const year = format(visibleMonth, "yyyy");
  const monthLabel = t("cal.title.month", { monthName, year });
  const selectedDayLabel = format(parseISO(selectedDate), "EEEE, d. MMMM", { locale: dateLocale });

  const calendarTheme = useMemo(() => buildCalendarTheme(theme), [theme]);

  return (
    <Screen scroll>
      <TopBar title={monthLabel} sub={t("cal.sub")} />

      <Card className="p-2">
        <Calendar
          key={`${themeName}-${lang}`}
          current={format(visibleMonth, "yyyy-MM-dd")}
          markingType="multi-dot"
          markedDates={markedDates}
          dayComponent={CalendarDay}
          onDayPress={(d) => setSelectedDate(d.dateString)}
          onMonthChange={(m) => setVisibleMonth(parseISO(m.dateString))}
          theme={calendarTheme}
          firstDay={1}
          enableSwipeMonths
          hideExtraDays={false}
        />
        <View className="mt-2 flex-row flex-wrap items-center justify-around gap-y-2 border-t border-line pt-3">
          {LEGEND.map((item) => (
            <View key={item.slug} className="flex-row items-center gap-1.5">
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: item.color }} />
              <Text variant="caption" tone="inkSecondary">
                {t(`cal.legend.${item.slug}`)}
              </Text>
            </View>
          ))}
        </View>
      </Card>

      <SectionHeader title={selectedDayLabel} />
      {dayEvents.length === 0 ? (
        <View className="items-center rounded-2xl border border-line bg-card px-4 py-6">
          <Text variant="caption" tone="inkSecondary">
            {t("cal.empty")}
          </Text>
        </View>
      ) : (
        <View className="gap-2">
          {dayEvents.map((occ) => {
            const child = occ.childId
              ? (familyChildren.data ?? []).find((c) => c.id === occ.childId)
              : null;
            const durationMin = Math.max(
              0,
              Math.round((occ.endAt.getTime() - occ.startAt.getTime()) / 60_000),
            );
            const timeLabel = occ.allDay ? "—" : format(occ.startAt, "HH:mm");
            const typeLabel = lang === "de" ? occ.type.labelDe : occ.type.labelEn;
            return (
              <Pressable
                key={`${occ.eventId}-${occ.occurrenceDate}`}
                onPress={() =>
                  router.push({
                    pathname: "/event/[id]",
                    params: { id: occ.eventId, occ: occ.occurrenceDate },
                  })
                }
                className="flex-row items-center gap-3 overflow-hidden rounded-2xl border border-line bg-card p-3 pl-4 active:opacity-70"
              >
                <View
                  className="absolute bottom-2 left-1.5 top-2 w-1 rounded-full"
                  style={{ backgroundColor: occ.type.color }}
                />
                <View className="w-12">
                  <Text variant="bodyEmph" style={{ fontVariant: ["tabular-nums"] }}>
                    {timeLabel}
                  </Text>
                  <Text variant="caption" tone="inkSecondary">
                    {formatDurationLabel(durationMin, t)}
                  </Text>
                </View>
                <View className="flex-1">
                  <Text variant="listTitle" numberOfLines={1}>
                    {occ.title}
                  </Text>
                  <View className="mt-0.5 flex-row items-center gap-1.5">
                    {child ? <ChildAvatar name={child.name} color={child.color} size="sm" /> : null}
                    <Text variant="caption" tone="inkSecondary" numberOfLines={1}>
                      {child ? `${child.name} · ${typeLabel}` : typeLabel}
                    </Text>
                  </View>
                </View>
                <Icon name={occ.type.iconName} size={16} color={occ.type.color} />
              </Pressable>
            );
          })}
        </View>
      )}

      <Button label={t("cal.add.voice")} variant="soft" tone="accent" block className="mt-4" />
    </Screen>
  );
}
