import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { Icon, TopBar } from "@/app-sections/shared";
import { palette } from "@/design-system";
import { useTheme } from "@/design-system/ThemeProvider";
import { Screen, Text } from "@/design-system/ui";
import { weeklyMeals } from "@/features/sample-data";

const TABS_DE = ["Abendessen", "Mittag", "Frühstück"];
const TABS_EN = ["Dinner", "Lunch", "Breakfast"];

export function EssenScreen() {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const lang = i18n.language.startsWith("de") ? "de" : "en";
  const tabs = lang === "de" ? TABS_DE : TABS_EN;

  return (
    <Screen scroll>
      <TopBar title={t("meals.title")} sub={t("meals.weekLabel")} />

      <Pressable className="overflow-hidden rounded-2xl active:opacity-90">
        <LinearGradient
          colors={[palette.mint[500], palette.mint[700]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0.4 }}
          style={{ borderRadius: 22, padding: 16 }}
        >
          <View className="flex-row items-center justify-between gap-2">
            <View className="flex-row items-center gap-3">
              <View className="h-10 w-10 items-center justify-center rounded-xl bg-white/20">
                <Icon name="sparkles" size={20} color="#FFFFFF" />
              </View>
              <View>
                <Text variant="cardTitle" tone="white">
                  {t("meals.aiPlan")}
                </Text>
                <Text variant="caption" tone="white" style={{ opacity: 0.85 }}>
                  {t("meals.aiPlanSub")}
                </Text>
              </View>
            </View>
            <Icon name="arrow-right" size={18} color="#FFFFFF" />
          </View>
        </LinearGradient>
      </Pressable>

      <View className="mt-4 flex-row gap-1 rounded-xl border border-line bg-bg-raised p-1">
        {tabs.map((tab, i) => (
          <View
            key={tab}
            className={`flex-1 items-center rounded-lg py-2 ${i === 0 ? "bg-card" : ""}`}
          >
            <Text variant="caption" tone={i === 0 ? "ink" : "inkSecondary"}>
              {tab}
            </Text>
          </View>
        ))}
      </View>

      <View className="mt-4 gap-2">
        {weeklyMeals.map((meal) => {
          const weekday = lang === "de" ? meal.weekdayShort : meal.weekdayShortEn;
          const name = lang === "de" ? meal.name : meal.nameEn;
          return (
            <View
              key={meal.date}
              className={`flex-row items-center gap-3 rounded-2xl border border-line p-3 ${
                meal.isToday ? "bg-primary-soft" : "bg-card"
              }`}
            >
              <View className="w-10 items-center">
                <Text variant="caption" tone="inkSecondary" style={{ textTransform: "uppercase" }}>
                  {weekday}
                </Text>
                <Text
                  variant="cardTitle"
                  tone={meal.isToday ? "primaryStrong" : "ink"}
                  style={{ marginTop: 2 }}
                >
                  {meal.date}
                </Text>
              </View>
              <View
                className={`h-12 w-12 items-center justify-center rounded-xl ${
                  meal.isToday ? "bg-white/70" : "bg-bg-raised"
                }`}
              >
                <Text style={{ fontSize: 24 }}>{meal.emoji}</Text>
              </View>
              <View className="flex-1">
                <Text variant="listTitle" numberOfLines={1}>
                  {name}
                </Text>
                <View className="mt-0.5 flex-row items-center gap-1.5">
                  <Icon name="clock" size={11} color={theme.inkSecondary} />
                  <Text variant="caption" tone="inkSecondary">
                    {t("meals.duration", { n: meal.durationMin })}
                    {meal.isToday ? ` · ${t("meals.today")}` : ""}
                  </Text>
                </View>
              </View>
              <Icon name="more-horizontal" size={18} color={theme.inkTertiary} />
            </View>
          );
        })}
      </View>

      <Pressable className="mt-4 active:opacity-90">
        <LinearGradient
          colors={[theme.accentSoft, theme.card]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ borderRadius: 22, padding: 14 }}
        >
          <View className="flex-row items-center justify-between gap-3">
            <View className="flex-row items-center gap-3">
              <View
                className="h-10 w-10 items-center justify-center rounded-xl"
                style={{ backgroundColor: palette.orange[500] }}
              >
                <Icon name="shopping-cart" size={18} color="#FFFFFF" />
              </View>
              <View className="flex-1 pr-2">
                <Text variant="listTitle">{t("meals.shopping.title")}</Text>
                <Text variant="caption" tone="inkSecondary">
                  {t("meals.shoppingSub")}
                </Text>
              </View>
            </View>
            <Icon name="chevron-right" size={16} color={theme.inkTertiary} />
          </View>
        </LinearGradient>
      </Pressable>
    </Screen>
  );
}
