import { Pressable, View } from "react-native";

import { Text } from "@/design-system/ui";

interface SectionHeaderProps {
  title: string;
  action?: string;
  onPressAction?: () => void;
  className?: string;
}

export function SectionHeader({ title, action, onPressAction, className }: SectionHeaderProps) {
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
      ) : null}
    </View>
  );
}
