import { Pressable, View } from "react-native";

import { useTheme } from "@/design-system/ThemeProvider";
import { Text } from "@/design-system/ui";

import { Icon, type IconName } from "./Icon";

export interface EventRowProps {
  time: string;
  title: string;
  meta: string;
  iconName: IconName;
  tone: string;
  isFirst?: boolean;
  /**
   * Set for descriptive time labels ("ab 09:00", "durchgehend") — a bare time
   * is the scannable datum and stays prominent, while the phrases would
   * truncate at body size.
   */
  timeCompact?: boolean;
  accessibilityLabel?: string;
  onPress?: () => void;
}

export function EventRow({
  time,
  title,
  meta,
  iconName,
  tone,
  isFirst,
  timeCompact,
  accessibilityLabel,
  onPress,
}: EventRowProps) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className={`flex-row items-center gap-3 px-4 py-3.5 ${isFirst ? "" : "border-t border-line"} active:opacity-70`}
    >
      {/* 72px, not the bare width of "08:00": the column also carries
          "Ganztägig" and "durchgehend" — same measure as the calendar's day
          list. */}
      <View className="w-[72px]">
        <Text
          variant={timeCompact ? "caption" : "bodyEmph"}
          tone="ink"
          style={{ fontVariant: ["tabular-nums"] }}
          numberOfLines={1}
        >
          {time}
        </Text>
      </View>
      <View
        className="h-9 w-9 items-center justify-center rounded-xl"
        style={{ backgroundColor: `${tone}26` }}
      >
        <Icon name={iconName} size={18} color={tone} />
      </View>
      <View className="flex-1">
        <Text variant="listTitle" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="caption" tone="inkSecondary" numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <Icon name="chevron-right" size={16} color={theme.inkTertiary} />
    </Pressable>
  );
}
