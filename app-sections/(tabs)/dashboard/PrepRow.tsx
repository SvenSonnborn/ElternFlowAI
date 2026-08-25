import { Pressable, View } from "react-native";

import type { IconName } from "@/app-sections/shared";

import { Icon } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Text } from "@/design-system/ui";

interface PrepRowProps {
  title: string;
  /** „16:30 · Mia · Besorgung" — leer, wenn nichts davon bekannt ist. */
  meta: string;
  iconName: IconName;
  /** Hex des Typs; die Kachel tönt sich daraus, wie in `EventRow`. */
  color: string;
  accessibilityLabel: string;
  onPress: () => void;
}

/**
 * Eine Zeile der „Morgen vorbereiten"-Karte.
 *
 * Bewusst nicht `EventRow`: `patterns/dashboard.md` gibt der Prep-Sektion eine
 * leichtere Form als der Terminliste darüber, und eine 72px-Zeitspalte stünde
 * bei jeder Aufgabe ohne `due_time` leer. Die Uhrzeit steht deshalb in der
 * Meta-Zeile.
 */
export function PrepRow({
  title,
  meta,
  iconName,
  color,
  accessibilityLabel,
  onPress,
}: PrepRowProps) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      // `min-h-11` statt hitSlop: die Zeilen stehen dicht übereinander, ein
      // hitSlop ragte in den Nachbarn. Kachel (28) + Meta-Zeile bleiben
      // darunter, `justify-center` hält den kurzen Fall mittig.
      className="min-h-11 flex-row items-center gap-2.5 py-1 active:opacity-70"
    >
      <View
        className="h-7 w-7 items-center justify-center rounded-lg"
        style={{ backgroundColor: `${color}26` }}
      >
        <Icon name={iconName} size={14} color={color} />
      </View>
      <View className="flex-1">
        <Text variant="listTitle" tone="ink" numberOfLines={1}>
          {title}
        </Text>
        {meta ? (
          <Text variant="caption" tone="inkSecondary" numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
      <Icon name="chevron-right" size={16} color={theme.inkTertiary} />
    </Pressable>
  );
}
