import { Pressable, View } from "react-native";

import { useTheme } from "@/design-system/ThemeProvider";
import { Text } from "@/design-system/ui";

export interface TypePickerItem {
  id: string;
  /** Already translated — slug-to-label resolution differs per feature. */
  label: string;
  /** Already resolved to a hex value. */
  color: string;
}

interface TypePickerProps {
  label: string;
  items: TypePickerItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  error?: string;
}

export function TypePicker({ label, items, selectedId, onSelect, error }: TypePickerProps) {
  const { theme } = useTheme();

  return (
    <View>
      <Text
        variant="caption"
        tone="inkSecondary"
        style={{ textTransform: "uppercase", fontWeight: "700", letterSpacing: 1.2 }}
      >
        {label}
      </Text>
      <View className="mt-0.5 flex-row flex-wrap gap-x-2">
        {items.map((item) => {
          const isSelected = item.id === selectedId;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: isSelected }}
              onPress={() => onSelect(item.id)}
              // The pill is 36 px tall by design, so the tap area is 44 around
              // it. hitSlop can't do that: React Native clips it at the parent's
              // bounds and react-native-web ignores it. Wrapped rows sit on the
              // 44 px grid, hence no vertical gap.
              className="h-11 justify-center active:opacity-70"
            >
              <View
                className="h-9 flex-row items-center gap-1.5 rounded-pill border px-3"
                style={{
                  backgroundColor: isSelected ? `${item.color}26` : theme.cardSubtle,
                  borderColor: isSelected ? item.color : theme.line,
                }}
              >
                <View
                  style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.color }}
                />
                <Text
                  variant="pill"
                  style={{ color: isSelected ? item.color : theme.inkSecondary }}
                >
                  {item.label}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      {error ? (
        <Text variant="caption" tone="danger">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
