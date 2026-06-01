import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import type { Database } from "@/features/supabase/database.types";

import { useTheme } from "@/design-system/ThemeProvider";
import { Text } from "@/design-system/ui";
import { eventColorFor, typeLabelsForSlug } from "@/features/calendar";

type EventTypeRow = Database["public"]["Tables"]["event_types"]["Row"];

interface TypePickerProps {
  label: string;
  types: EventTypeRow[];
  selectedTypeId: string | null;
  onSelect: (typeId: string) => void;
  error?: string;
}

export function TypePicker({ label, types, selectedTypeId, onSelect, error }: TypePickerProps) {
  const { theme } = useTheme();
  const { i18n } = useTranslation();
  const lang = i18n.language.startsWith("de") ? "de" : "en";

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
        {types.map((type) => {
          const color = eventColorFor(type.slug, type.color, theme);
          const labels = typeLabelsForSlug(type.slug);
          const isSelected = type.id === selectedTypeId;
          return (
            <Pressable
              key={type.id}
              accessibilityRole="button"
              accessibilityLabel={lang === "de" ? labels.de : labels.en}
              accessibilityState={{ selected: isSelected }}
              onPress={() => onSelect(type.id)}
              className="h-9 flex-row items-center gap-1.5 rounded-pill border px-3 active:opacity-70"
              style={{
                backgroundColor: isSelected ? `${color}26` : theme.cardSubtle,
                borderColor: isSelected ? color : theme.line,
              }}
            >
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
              <Text variant="pill" style={{ color: isSelected ? color : theme.inkSecondary }}>
                {lang === "de" ? labels.de : labels.en}
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
