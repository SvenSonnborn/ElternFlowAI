import { View } from "react-native";

import { touchTarget } from "@/design-system";
import { useTheme } from "@/design-system/ThemeProvider";
import { Text } from "@/design-system/ui";

import { SelectionPressable } from "./SelectionPressable";

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
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        className="mt-0.5 flex-row flex-wrap gap-x-2"
      >
        {items.map((item) => {
          const isSelected = item.id === selectedId;
          return (
            <SelectionPressable
              key={item.id}
              accessibilityRole="radio"
              accessibilityLabel={item.label}
              aria-checked={isSelected}
              onPress={() => onSelect(item.id)}
              // The pill is 36 px tall by design, so the tap area is 44 around
              // it. hitSlop can't do that: React Native clips it at the parent's
              // bounds and react-native-web ignores it. Wrapped rows sit on the
              // 44 px grid, hence no vertical gap. The height is a number, not
              // `h-11`: one source for the 44; a rem class hangs on a Metro
              // setting nobody sees next to the Pressable. `minWidth` keeps a
              // one-letter label at 44 wide as well.
              className="justify-center active:opacity-70"
              style={{ height: touchTarget.min, minWidth: touchTarget.min }}
            >
              <View
                className="h-9 flex-row items-center justify-center gap-1.5 rounded-pill border px-3"
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
            </SelectionPressable>
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
