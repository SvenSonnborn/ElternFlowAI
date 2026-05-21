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
  onPress?: () => void;
}

export function EventRow({ time, title, meta, iconName, tone, isFirst, onPress }: EventRowProps) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-3 px-4 py-3.5 ${isFirst ? "" : "border-t border-line"} active:opacity-70`}
    >
      <View className="w-11">
        <Text variant="bodyEmph" tone="ink" style={{ fontVariant: ["tabular-nums"] }}>
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
