import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { Icon } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Card, Text } from "@/design-system/ui";

interface MealHeroEmptyCardProps {
  onPressPlan: () => void;
}

/**
 * Der Hero, solange für den aktuellen Slot nichts im Wochenplan steht.
 *
 * Bewusst ohne Gradient und ohne Badge: `patterns/dashboard.md` beschreibt den
 * Ersatzzustand als statische Karte, und der Mint-Verlauf ist die Auszeichnung
 * für ein Gericht, das es hier nicht gibt. Ein Verlauf ohne Inhalt sähe aus
 * wie ein Ladefehler.
 */
export function MealHeroEmptyCard({ onPressPlan }: MealHeroEmptyCardProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();

  return (
    <Card className="gap-3">
      <View className="flex-row items-center gap-3">
        <View className="h-10 w-10 items-center justify-center rounded-xl bg-primary-soft">
          <Icon name="utensils" size={18} color={theme.primaryStrong} />
        </View>
        <View className="flex-1">
          <Text variant="listTitle" tone="ink">
            {t("dash.meal.empty.title")}
          </Text>
          <Text variant="caption" tone="inkSecondary">
            {t("dash.meal.empty.sub")}
          </Text>
        </View>
      </View>
      {/* Default-Größe (md, h-11) mit Absicht — `sm` ist h-9 und fiele unter
          das 44×44-Ziel. */}
      <Button label={t("dash.meal.empty.cta")} variant="soft" block onPress={onPressPlan} />
    </Card>
  );
}
