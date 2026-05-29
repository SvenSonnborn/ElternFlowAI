import type { DateData } from "react-native-calendars";
import type { MarkingProps } from "react-native-calendars/src/calendar/day/marking";

import { Pressable, View } from "react-native";

import { useTheme } from "@/design-system/ThemeProvider";
import { Text } from "@/design-system/ui";

type DayState = "selected" | "disabled" | "inactive" | "today" | "";

interface CalendarDayProps {
  date?: DateData;
  state?: DayState;
  marking?: MarkingProps;
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

  return (
    <Pressable
      onPress={() => onPress?.(date)}
      accessibilityRole="button"
      accessibilityLabel={date?.dateString}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      className="items-center justify-start"
      style={{ width: 44, height: 44, paddingVertical: 4 }}
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
      {dots.length > 0 ? (
        <View className="mt-1 flex-row gap-0.5">
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
