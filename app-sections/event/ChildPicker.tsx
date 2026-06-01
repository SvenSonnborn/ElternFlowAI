import { Pressable, View } from "react-native";

import { ChildAvatar } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Text } from "@/design-system/ui";

interface ChildOption {
  id: string;
  name: string;
  color: string;
}

interface ChildPickerProps {
  label: string;
  noChildLabel: string;
  children: ChildOption[];
  selectedChildId: string | null;
  onSelect: (id: string | null) => void;
}

export function ChildPicker({
  label,
  noChildLabel,
  children,
  selectedChildId,
  onSelect,
}: ChildPickerProps) {
  const { theme } = useTheme();
  if (children.length === 0) return null;

  return (
    <View>
      <Text
        variant="caption"
        tone="inkSecondary"
        style={{ textTransform: "uppercase", fontWeight: "700", letterSpacing: 1.2 }}
      >
        {label}
      </Text>
      <View className="mt-1.5 flex-row flex-wrap items-center gap-3">
        {children.map((child) => {
          const isSelected = child.id === selectedChildId;
          return (
            <Pressable
              key={child.id}
              accessibilityRole="button"
              accessibilityLabel={child.name}
              accessibilityState={{ selected: isSelected }}
              onPress={() => onSelect(child.id)}
              className="items-center active:opacity-70"
            >
              <View
                className="items-center justify-center rounded-pill"
                style={{
                  padding: 2,
                  borderWidth: 2,
                  borderColor: isSelected ? theme.primaryStrong : "transparent",
                }}
              >
                <ChildAvatar name={child.name} color={child.color} size="md" />
              </View>
              <Text variant="caption" tone="inkSecondary" className="mt-1">
                {child.name}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={noChildLabel}
          accessibilityState={{ selected: selectedChildId === null }}
          onPress={() => onSelect(null)}
          className="h-9 flex-row items-center rounded-pill border px-3 active:opacity-70"
          style={{
            backgroundColor: selectedChildId === null ? theme.primarySoft : theme.cardSubtle,
            borderColor: selectedChildId === null ? theme.primary : theme.line,
          }}
        >
          <Text
            variant="pill"
            style={{
              color: selectedChildId === null ? theme.primaryStrong : theme.inkSecondary,
            }}
          >
            {noChildLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
