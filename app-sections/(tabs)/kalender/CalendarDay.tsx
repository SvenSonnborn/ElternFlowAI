import type { DateData } from "react-native-calendars";
import type { MarkingProps } from "react-native-calendars/src/calendar/day/marking";

import { Pressable, View } from "react-native";

import type { SpanBar } from "@/features/calendar";

import { useTheme } from "@/design-system/ThemeProvider";
import { Text } from "@/design-system/ui";

type DayState = "selected" | "disabled" | "inactive" | "today" | "";

interface CalendarDayProps {
  date?: DateData;
  state?: DayState;
  /**
   * `react-native-calendars` types `marking` narrowly but hands our own object
   * through untouched — `bars` is ours, added in `toDayMarkings`.
   */
  marking?: MarkingProps & { bars?: (SpanBar | null)[] };
  onPress?: (date?: DateData) => void;
}

export function CalendarDay({ date, state, marking, onPress }: CalendarDayProps) {
  const { theme } = useTheme();
  const isToday = state === "today";
  const isSelected = !!marking?.selected;
  const isDisabled = state === "disabled" || state === "inactive";

  const tone: "white" | "ink" | "inkTertiary" | "primaryStrong" = isToday
    ? "white"
    : isDisabled
      ? "inkTertiary"
      : isSelected
        ? "primaryStrong"
        : "ink";

  const pillBg = isToday ? theme.primary : isSelected ? theme.primarySoft : "transparent";
  const dots = isDisabled ? [] : (marking?.dots ?? []).slice(0, 3);
  // Spans keep their bar on neighbouring-month days, unlike dots: a bar that
  // stops at the month edge with a flush "continues" edge and nothing after it
  // is worse than a dimmed one. The day number stays greyed either way.
  const bars = marking?.bars ?? [];

  return (
    <Pressable
      onPress={() => onPress?.(date)}
      accessibilityRole="button"
      accessibilityLabel={date?.dateString}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      className="items-center justify-start"
      style={{ width: 44, height: 52, paddingVertical: 4 }}
    >
      <View
        className="h-9 w-9 items-center justify-center rounded-pill"
        style={{ backgroundColor: pillBg }}
      >
        <Text
          variant="caption"
          tone={tone}
          style={{
            fontVariant: ["tabular-nums"],
            fontWeight: isToday ? "700" : "500",
          }}
        >
          {date?.day ?? ""}
        </Text>
      </View>
      {bars.length > 0 ? (
        <View className="mt-1 w-full gap-0.5">
          {bars.map((bar, lane) => (
            <View
              // A hole renders as an empty row of the same height so the lanes
              // below it keep their vertical position across the whole span.
              key={bar?.key ?? `lane-${lane}`}
              style={{
                height: 3,
                backgroundColor: bar ? bar.color : "transparent",
                // Flush edges are the signal: a bar that is neither start nor end
                // touches both cell borders and reads as one line across the week.
                marginLeft: bar?.isStart ? 4 : 0,
                marginRight: bar?.isEnd ? 4 : 0,
                borderTopLeftRadius: bar?.isStart ? 2 : 0,
                borderBottomLeftRadius: bar?.isStart ? 2 : 0,
                borderTopRightRadius: bar?.isEnd ? 2 : 0,
                borderBottomRightRadius: bar?.isEnd ? 2 : 0,
                opacity: isDisabled ? 0.4 : isToday ? 0.9 : 1,
              }}
            />
          ))}
        </View>
      ) : null}
      {dots.length > 0 ? (
        <View className={bars.length > 0 ? "mt-0.5 flex-row gap-0.5" : "mt-1 flex-row gap-0.5"}>
          {dots.map((dot, i) => (
            <View
              key={dot.key ?? `${date?.dateString}-${i}`}
              style={{
                width: 4,
                height: 4,
                borderRadius: 2,
                backgroundColor: isToday ? "rgba(255,255,255,0.9)" : dot.color,
              }}
            />
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}
