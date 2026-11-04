import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, View, type ViewProps } from "react-native";

import { touchTarget } from "@/design-system";
import { useTheme } from "@/design-system/ThemeProvider";
import { Text } from "@/design-system/ui";

import { Icon } from "./Icon";

type TopBarProps = ViewProps & {
  title: string;
  sub?: string;
  leading?: React.ReactNode;
  onSettings?: () => void;
  hideSettings?: boolean;
} & ({ onAdd: () => void; addLabel: string } | { onAdd?: undefined; addLabel?: undefined });

/**
 * Kopfzeile der Tabs und Profile: Titel mit Untertitel, links optional ein
 * `leading`-Element, rechts Plus und Zahnrad.
 *
 * `onAdd` gibt es nur zusammen mit `addLabel`: ein Plus ohne Namen hieße für
 * einen Screenreader nur „Taste".
 *
 * Beide Knöpfe zeichnen 36 pt und tippen auf einer Box von `touchTarget.min`
 * (ADR-041). Die Optik sitzt oben rechts in ihrer Box, damit sie bündig mit
 * Titel und Bildschirmrand bleibt; der Überschuss liegt links und unten. Die
 * Boxen stoßen aneinander, der linke Überschuss der Zahnrad-Box ist die
 * sichtbare Lücke zum Plus.
 */
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
  const { t } = useTranslation();
  const { theme } = useTheme();
  const handleSettings = onSettings ?? (() => router.push("/settings"));

  return (
    <View
      {...rest}
      className={`flex-row items-start justify-between pb-4 pt-1 ${className ?? ""}`.trim()}
    >
      {/* pr-1, weil die Knopf-Box links 8 pt Überschuss mitbringt: zusammen
          bleibt die sichtbare Lücke zum Titel bei 12 und der Titel so breit
          wie mit 36er-Knöpfen. */}
      <View className="flex-1 flex-row items-center gap-2.5 pr-1">
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
      <View className="flex-row">
        {onAdd ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={addLabel}
            onPress={onAdd}
            className="items-end active:opacity-70"
            style={{ width: touchTarget.min, height: touchTarget.min }}
          >
            <View
              className="h-9 w-9 items-center justify-center rounded-xl"
              style={{ backgroundColor: theme.primarySoft }}
            >
              <Icon name="plus" size={18} color={theme.primaryStrong} />
            </View>
          </Pressable>
        ) : null}
        {hideSettings ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("set.title")}
            onPress={handleSettings}
            className="items-end active:opacity-70"
            style={{ width: touchTarget.min, height: touchTarget.min }}
          >
            <View className="h-9 w-9 items-center justify-center rounded-xl border border-line bg-card">
              <Icon name="settings" size={16} color={theme.inkSecondary} />
            </View>
          </Pressable>
        )}
      </View>
    </View>
  );
}
