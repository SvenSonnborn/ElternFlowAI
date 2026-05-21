import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Icon, Pill } from "@/app-sections/shared";
import { palette } from "@/design-system";
import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Text } from "@/design-system/ui";
import { recipe } from "@/features/sample-data";

const TABS_DE = ["Zutaten", "Zubereitung", "Nährwerte"];
const TABS_EN = ["Ingredients", "Steps", "Nutrition"];

export function RecipeScreen() {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const lang = i18n.language.startsWith("de") ? "de" : "en";
  const tabs = lang === "de" ? TABS_DE : TABS_EN;
  const title = lang === "de" ? recipe.title : recipe.titleEn;
  const noteText = lang === "de" ? recipe.note : recipe.noteEn;

  return (
    <SafeAreaView edges={["bottom"]} className="flex-1 bg-card">
      <View className="items-center pb-1 pt-2.5">
        <View className="h-1 w-10 rounded-full" style={{ backgroundColor: theme.lineStrong }} />
      </View>

      <View className="mx-4 mt-2 overflow-hidden rounded-3xl">
        <LinearGradient
          colors={["#FFC56B", palette.orange[500], palette.avatar.pink]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            height: 180,
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
          }}
        >
          <Text style={{ fontSize: 60 }}>{recipe.emoji}</Text>
          <Pressable
            className="absolute right-3 top-3 h-9 w-9 items-center justify-center rounded-pill active:opacity-80"
            style={{ backgroundColor: "rgba(255,255,255,0.92)" }}
          >
            <Icon name="heart" size={16} color={theme.accent} />
          </Pressable>
        </LinearGradient>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 24 }}
      >
        <Pill
          label={t("dash.meal.badge")}
          tone="mint"
          leading={<Icon name="sparkles" size={11} color={theme.primaryStrong} />}
        />
        <Text variant="h2" className="mt-2" numberOfLines={2}>
          {title}
        </Text>
        <View className="mt-2 flex-row items-center gap-3.5">
          <View className="flex-row items-center gap-1">
            <Icon name="clock" size={13} color={theme.inkSecondary} />
            <Text variant="caption" tone="inkSecondary">
              {t("meals.duration", { n: recipe.durationMin })}
            </Text>
          </View>
          <View className="flex-row items-center gap-1">
            <Icon name="users" size={13} color={theme.inkSecondary} />
            <Text variant="caption" tone="inkSecondary">
              {t("recipe.servings", { count: recipe.servings })}
            </Text>
          </View>
          <Text variant="caption" tone="inkSecondary">
            🌶 {recipe.spice}
          </Text>
        </View>

        <View className="mt-4 flex-row gap-6 border-b border-line">
          {tabs.map((tab, i) => (
            <View
              key={tab}
              className="pb-2"
              style={{
                borderBottomWidth: i === 0 ? 2 : 0,
                borderBottomColor: theme.primary,
              }}
            >
              <Text variant="caption" tone={i === 0 ? "ink" : "inkTertiary"}>
                {tab}
              </Text>
            </View>
          ))}
        </View>

        <View className="mt-3 gap-2">
          {recipe.ingredients.map((ing, i) => (
            <View
              key={ing.name}
              className={`flex-row items-center gap-2.5 py-1.5 ${
                i === 0 ? "" : "border-t border-line"
              }`}
            >
              <Text variant="listTitle" style={{ width: 64 }}>
                {ing.amount}
              </Text>
              <Text variant="body" className="flex-1">
                {lang === "de" ? ing.name : ing.nameEn}
              </Text>
              <View
                className="h-5 w-5 items-center justify-center rounded-md"
                style={{ backgroundColor: theme.primarySoft }}
              >
                <Icon name="check" size={12} color={theme.primaryStrong} />
              </View>
            </View>
          ))}
        </View>

        <View className="mt-4 rounded-2xl p-3.5" style={{ backgroundColor: theme.accentSoft }}>
          <View className="mb-1 flex-row items-center gap-1.5">
            <Icon name="alert-triangle" size={14} color={theme.accentStrong} />
            <Text variant="listTitle" tone="accentStrong">
              {t("recipe.noteLabel")}
            </Text>
          </View>
          <Text variant="caption" tone="inkSecondary">
            {noteText}
          </Text>
        </View>
      </ScrollView>

      <View className="flex-row gap-2.5 border-t border-line bg-card px-4 py-3">
        <Button
          label={t("recipe.shopping")}
          variant="soft"
          tone="neutral"
          className="flex-1"
          onPress={() => router.back()}
        />
        <View style={{ flex: 1.6 }}>
          <Button label={t("recipe.startCooking")} tone="primary" block />
        </View>
      </View>
    </SafeAreaView>
  );
}
