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
    /*
     * `min-h-11` statt `hitSlop`: react-native-web kennt `hitSlop` nur am
     * Legacy-`Touchable`, nicht an `Pressable` — auf Web wäre die
     * Trefferfläche sonst 17 px hoch geblieben. Die Zeile trägt die
     * Mindesthöhe deshalb selbst, und der bisherige `mt-5` entfällt: die
     * 26 px transparenter Raum über dem bodyEmph-Titel ersetzen ihn.
     */
    <View className={`mb-2 min-h-11 flex-row items-end justify-between ${className ?? ""}`.trim()}>
      <Text variant="bodyEmph" tone="ink">
        {title}
      </Text>
      {action ? (
        <Pressable
          accessibilityRole="button"
          onPress={onPressAction}
          // items-end/justify-end halten den Text genau dort, wo er vorher
          // saß — die Fläche wächst nach oben und links ins Transparente.
          className="min-h-11 min-w-11 items-end justify-end active:opacity-60"
        >
          <Text variant="meta" tone="primaryStrong">
            {action}
          </Text>
        </Pressable>
      ) : onPressAdd ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={addLabel ?? "Add"}
          onPress={onPressAdd}
          className="h-11 w-11 items-end justify-end active:opacity-70"
        >
          {/* Sichtbar bleiben die 32 px des Buttons, tastbar sind 44. */}
          <View className="h-8 w-8 items-center justify-center rounded-xl border border-line bg-card">
            <Icon name="plus" size={16} color={theme.inkSecondary} />
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}
