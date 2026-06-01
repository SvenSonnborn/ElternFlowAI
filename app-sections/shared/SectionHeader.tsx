import { Pressable, View } from "react-native";

import { useTheme } from "@/design-system/ThemeProvider";
import { Text } from "@/design-system/ui";

import { Icon } from "./Icon";

interface SectionHeaderProps {
  title: string;
  action?: string;
  onPressAction?: () => void;
  onPressAdd?: () => void;
  addLabel?: string;
  className?: string;
}

export function SectionHeader({
  title,
  action,
  onPressAction,
  onPressAdd,
  addLabel,
  className,
}: SectionHeaderProps) {
  const { theme } = useTheme();
  return (
    <View className={`mb-2 mt-5 flex-row items-end justify-between ${className ?? ""}`.trim()}>
      <Text variant="bodyEmph" tone="ink">
        {title}
      </Text>
      {action ? (
        <Pressable onPress={onPressAction} className="active:opacity-60">
          <Text variant="meta" tone="primaryStrong">
            {action}
          </Text>
        </Pressable>
      ) : onPressAdd ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={addLabel ?? "Add"}
          onPress={onPressAdd}
          className="h-8 w-8 items-center justify-center rounded-xl border border-line bg-card active:opacity-70"
        >
          <Icon name="plus" size={16} color={theme.inkSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}
