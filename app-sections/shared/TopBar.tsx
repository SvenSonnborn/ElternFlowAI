import { router } from "expo-router";
import { Pressable, View, type ViewProps } from "react-native";

import { useTheme } from "@/design-system/ThemeProvider";
import { Text } from "@/design-system/ui";

import { Icon } from "./Icon";

interface TopBarProps extends ViewProps {
  title: string;
  sub?: string;
  leading?: React.ReactNode;
  onSettings?: () => void;
  hideSettings?: boolean;
  onAdd?: () => void;
  addLabel?: string;
}

export function TopBar({
  title,
  sub,
  leading,
  onSettings,
  hideSettings,
  onAdd,
  addLabel,
  className,
  ...rest
}: TopBarProps) {
  const { theme } = useTheme();
  const handleSettings = onSettings ?? (() => router.push("/settings"));

  return (
    <View
      {...rest}
      className={`flex-row items-start justify-between pb-4 pt-1 ${className ?? ""}`.trim()}
    >
      <View className="flex-1 flex-row items-center gap-2.5 pr-3">
        {leading}
        <View className="flex-1">
          <Text variant="h1" numberOfLines={1}>
            {title}
          </Text>
          {sub ? (
            <Text variant="meta" tone="inkSecondary" className="mt-0.5" numberOfLines={1}>
              {sub}
            </Text>
          ) : null}
        </View>
      </View>
      <View className="flex-row items-center gap-2">
        {onAdd ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={addLabel ?? "Add"}
            onPress={onAdd}
            className="h-9 w-9 items-center justify-center rounded-xl active:opacity-70"
            style={{ backgroundColor: theme.primarySoft }}
          >
            <Icon name="plus" size={18} color={theme.primaryStrong} />
          </Pressable>
        ) : null}
        {hideSettings ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Settings"
            onPress={handleSettings}
            className="h-9 w-9 items-center justify-center rounded-xl border border-line bg-card active:opacity-70"
          >
            <Icon name="settings" size={16} color={theme.inkSecondary} />
          </Pressable>
        )}
      </View>
    </View>
  );
}
