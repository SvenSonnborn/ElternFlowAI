import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { ChildAvatar, EventRow, Icon, SectionHeader, TopBar } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card, Screen, Text } from "@/design-system/ui";
import {
  children,
  familyName,
  mealPick,
  parents,
  todayEvents,
  tomorrowPrep,
} from "@/features/sample-data";

import { MealHeroCard } from "./MealHeroCard";

const tonePrepBg = {
  mint: "bg-primary-soft",
  orange: "bg-accent-soft",
  warn: "bg-warning-soft",
} as const;

export function DashboardScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const greeting = t("dash.greeting.morning", { name: parents[0]?.short ?? "" });
  const subtitle = t("dash.subtitle", { family: familyName, date: t("dash.subtitleDate") });

  const avatarRow = [
    ...parents.map((p) => ({ key: `parent-${p.short}`, label: p.short, color: p.color })),
    ...children.map((c) => ({ key: `child-${c.id}`, label: c.name, color: c.color })),
  ];

  return (
    <Screen scroll>
      <TopBar title={greeting} sub={subtitle} />

      <View className="mb-1 flex-row items-center gap-2 pl-0.5">
        {avatarRow.map((p) => (
          <ChildAvatar key={p.key} name={p.label} color={p.color} />
        ))}
        <Pressable
          onPress={() => router.push("/child/new")}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={t("dash.addPerson")}
          className="h-8 w-8 items-center justify-center rounded-pill border border-dashed border-line-strong active:opacity-80"
        >
          <Icon name="plus" size={14} color={theme.inkTertiary} />
        </Pressable>
      </View>

      <SectionHeader title={t("dash.section.today")} action={t("action.seeAll")} />
      <Card className="overflow-hidden p-0">
        {todayEvents.map((event, i) => (
          <EventRow
            key={event.id}
            time={event.time}
            title={event.title}
            meta={event.who}
            iconName={event.iconName}
            tone={event.tone}
            isFirst={i === 0}
          />
        ))}
      </Card>

      <SectionHeader title={t("dash.meal.question")} action={t("dash.meal.refresh")} />
      <MealHeroCard meal={mealPick} onOpenRecipe={() => router.push(`/recipe/${mealPick.id}`)} />

      <SectionHeader title={t("dash.section.tomorrow")} />
      <Card>
        <View className="gap-3">
          {tomorrowPrep.map((item) => {
            const iconColor =
              item.tone === "mint"
                ? theme.primaryStrong
                : item.tone === "orange"
                  ? theme.accentStrong
                  : theme.warning;
            return (
              <View key={item.id} className="flex-row items-center gap-2.5">
                <View
                  className={`h-7 w-7 items-center justify-center rounded-lg ${tonePrepBg[item.tone]}`}
                >
                  <Icon name={item.iconName} size={14} color={iconColor} />
                </View>
                <Text variant="listTitle" tone="ink" className="flex-1">
                  {item.title}
                </Text>
              </View>
            );
          })}
        </View>
      </Card>
    </Screen>
  );
}
