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
      <View className="mt-1.5 flex-row flex-wrap gap-2">
        {items.map((item) => {
          const isSelected = item.id === selectedId;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: isSelected }}
              onPress={() => onSelect(item.id)}
              // The pill is 36 px tall by design; hitSlop takes the touch
              // target to 44 without touching the visual spec.
              hitSlop={{ top: 4, bottom: 4 }}
              className="h-9 flex-row items-center gap-1.5 rounded-pill border px-3 active:opacity-70"
              style={{
                backgroundColor: isSelected ? `${item.color}26` : theme.cardSubtle,
                borderColor: isSelected ? item.color : theme.line,
              }}
            >
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.color }} />
              <Text variant="pill" style={{ color: isSelected ? item.color : theme.inkSecondary }}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {error ? (
        <Text variant="caption" tone="danger" className="mt-1">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
