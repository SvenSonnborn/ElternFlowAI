import { LinearGradient } from "expo-linear-gradient";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Image, Pressable, View } from "react-native";

import type { MealSlot, RecipeAllergenVerdict, RecipeRow } from "@/features/meals";

import {
  AllergenBadge,
  Icon,
  MEAL_PLACEHOLDER_EMOJI,
  recipeA11yLabel,
} from "@/app-sections/shared";
import { palette } from "@/design-system";
import { Text } from "@/design-system/ui";
import { localize } from "@/features/meals";

interface MealHeroCardProps {
  recipe: RecipeRow;
  /** Der Slot, den `useTodaysMeal` für die aktuelle Uhrzeit gewählt hat. */
  slot: Exclude<MealSlot, "snack">;
  verdict: RecipeAllergenVerdict;
  /**
   * Ein sicheres Ausweichgericht. Nur gesetzt, wenn das geplante ein
   * Familien-Allergen trifft — sonst gibt es nichts auszuweichen.
   */
  alternative?: RecipeRow | null;
  onOpenRecipe: () => void;
  onOpenAlternative?: () => void;
}

/**
 * Was heute auf den Tisch kommt.
 *
 * Kein KI-Badge mehr: die Karte zeigt den Eintrag aus dem Wochenplan der
 * Familie, nicht einen Vorschlag. „Passt perfekt zu deiner Familie" wäre eine
 * Behauptung über eine Auswahl, die niemand getroffen hat (docs/TODO.md) — an
 * seiner Stelle steht der Slot, den die Karte tatsächlich meint.
 */
export function MealHeroCard({
  recipe,
  slot,
  verdict,
  alternative,
  onOpenRecipe,
  onOpenAlternative,
}: MealHeroCardProps) {
  const { t, i18n } = useTranslation();

  const title = localize(recipe.title, i18n.language);
  const a11yLabel = useMemo(() => recipeA11yLabel(t, title, verdict), [t, title, verdict]);

  // Ausweichen lohnt nur, wenn es etwas zu vermeiden gibt: `safe` braucht keine
  // Alternative, und `unverified` heißt „wir wissen es nicht" — daraus einen
  // Wechsel vorzuschlagen behauptete ein Urteil, das nicht gefällt wurde.
  const showAlternative =
    (verdict.status === "unsafe" || verdict.status === "caution") &&
    Boolean(alternative) &&
    Boolean(onOpenAlternative);

  return (
    <LinearGradient
      colors={[palette.mint[500], palette.mint[700]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ borderRadius: 22, padding: 18 }}
    >
      <View className="flex-row items-start gap-3">
        {/* Als eine Ansage gebündelt: Titel und Allergen-Urteil einzeln
            vorgelesen ließen offen, worauf sich die Warnung bezieht. */}
        <View className="flex-1 gap-2" accessible accessibilityLabel={a11yLabel}>
          <View className="flex-row items-center gap-1.5 self-start rounded-pill bg-white/25 px-2.5 py-1">
            <Icon name="utensils" size={12} color="#FFFFFF" />
            <Text variant="pill" tone="white">
              {t(`meals.tabs.${slot}`)}
            </Text>
          </View>
          <Text variant="cardTitle" tone="white" numberOfLines={2}>
            {title}
          </Text>
          {recipe.duration_min != null ? (
            <Text variant="meta" tone="white" style={{ opacity: 0.9 }}>
              {t("meals.duration", { n: recipe.duration_min })}
            </Text>
          ) : null}
          {/* Ohne Ausgrauen, wie im Wochenraster: eine bereits verplante
              Mahlzeit ist kein Suchergebnis unter mehreren (ADR-014). */}
          <AllergenBadge verdict={verdict} />
        </View>

        <View className="h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-white/40 bg-white/20">
          {recipe.image_url ? (
            <Image
              source={{ uri: recipe.image_url }}
              style={{ height: "100%", width: "100%" }}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
          ) : (
            <Text
              style={{ fontSize: 30 }}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              {MEAL_PLACEHOLDER_EMOJI}
            </Text>
          )}
        </View>
      </View>

      <View className="mt-4 flex-row gap-2">
        <Pressable
          onPress={onOpenRecipe}
          accessibilityRole="button"
          className="h-11 flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-white active:opacity-85"
        >
          <Icon name="book-open" size={15} color={palette.slate[700]} />
          <Text variant="button" tone="ink">
            {t("dash.meal.openRecipe")}
          </Text>
        </Pressable>
        {showAlternative ? (
          <Pressable
            onPress={onOpenAlternative}
            accessibilityRole="button"
            className="h-11 flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-black/20 active:opacity-85"
          >
            <Icon name="sparkles" size={15} color="#FFFFFF" />
            <Text variant="button" tone="white" numberOfLines={1}>
              {t("meals.suggest.other")}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </LinearGradient>
  );
}
