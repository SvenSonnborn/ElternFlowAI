import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import type { MealPick } from "@/features/sample-data";

import { Icon } from "@/app-sections/shared";
import { palette } from "@/design-system";
import { Text } from "@/design-system/ui";

interface MealHeroCardProps {
  meal: MealPick;
  onOpenRecipe?: () => void;
  onAddToShopping?: () => void;
}

export function MealHeroCard({ meal, onOpenRecipe, onAddToShopping }: MealHeroCardProps) {
  const { t } = useTranslation();
  return (
    <LinearGradient
      colors={[palette.mint[500], palette.mint[700]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ borderRadius: 22, padding: 18 }}
    >
      <View className="flex-row items-start gap-3">
        <View className="flex-1 gap-2">
          <View className="flex-row items-center gap-1.5 self-start rounded-pill bg-white/25 px-2.5 py-1">
            <Icon name="sparkles" size={12} color="#FFFFFF" />
            <Text variant="pill" tone="white">
              {t("dash.meal.badge")}
            </Text>
          </View>
          <Text variant="cardTitle" tone="white" numberOfLines={2}>
            {meal.title}
          </Text>
          <Text variant="meta" tone="white" style={{ opacity: 0.9 }}>
            {meal.reason}
          </Text>
        </View>
        <View className="h-16 w-16 items-center justify-center rounded-2xl border border-white/40 bg-white/20">
          <Text style={{ fontSize: 30 }}>{meal.emoji}</Text>
        </View>
      </View>
      <View className="mt-4 flex-row gap-2">
        <Pressable
          onPress={onOpenRecipe}
          className="h-11 flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-white active:opacity-85"
        >
          <Icon name="book-open" size={15} color={palette.slate[700]} />
          <Text variant="button" tone="ink">
            {t("dash.meal.openRecipe")}
          </Text>
        </Pressable>
        <Pressable
          onPress={onAddToShopping}
          className="h-11 flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-black/20 active:opacity-85"
        >
          <Icon name="shopping-cart" size={15} color="#FFFFFF" />
          <Text variant="button" tone="white">
            {t("dash.meal.toShopping")}
          </Text>
        </Pressable>
      </View>
    </LinearGradient>
  );
}
