import { getISOWeek } from "date-fns";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, RefreshControl, View } from "react-native";

import { Icon, TopBar } from "@/app-sections/shared";
import { palette } from "@/design-system";
import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Card, Screen, Text } from "@/design-system/ui";
import {
  formatWeekRange,
  slotForTime,
  toDateKey,
  useMealPlans,
  weekStartFor,
  type MealSlot,
} from "@/features/meals";
import { useToday } from "@/features/shared";

import { RecipeBrowser } from "./RecipeBrowser";
import { WeekNav } from "./WeekNav";
import { WeekPlanGrid } from "./WeekPlanGrid";

export function EssenScreen() {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const lang = i18n.language.startsWith("de") ? "de" : "en";

  const today = useToday();
  // Die gewählte Woche gehört dem Nutzer: Start ist die Woche von heute, danach
  // wird sie nicht mehr nachgezogen — auch nicht um Mitternacht auf Montag, ein
  // Umspringen unter der Hand risse ihn aus der Woche, die er gerade plant.
  const [weekStart, setWeekStart] = useState(() => weekStartFor(today));
  const isCurrentWeek = toDateKey(weekStart) === toDateKey(weekStartFor(today));
  // Slot-Tab und offenes Zeilen-Menü leben hier und nicht im Raster: Während
  // eine neue Woche lädt, steht statt `WeekPlanGrid` ein Spinner, und State im
  // Raster fiele beim Wiedereinhängen auf seinen Startwert zurück.
  // Behaviour-Rule aus `patterns/meals.md`: vor 11 Frühstück, 11–15 Mittag,
  // sonst Abendessen. Nur als *Startwert* — danach gehört der Tab dem Nutzer,
  // ein Umspringen um 15:00 Uhr unter der Hand wäre übergriffig.
  const [slot, setSlot] = useState<MealSlot>(() => slotForTime(new Date()));
  const [openMenuDate, setOpenMenuDate] = useState<string | null>(null);
  // Ein Wochenwechsel schließt das Menü: Seine Zeile ist nicht mehr zu sehen,
  // und beim Zurückblättern soll es nicht wieder aufspringen.
  const changeWeek = (next: Date) => {
    setWeekStart(next);
    setOpenMenuDate(null);
  };
  // Der Screen besitzt die Query, obwohl das Raster sie rendert: Wochenlabel
  // und Pull-to-Refresh hängen an derselben Antwort, und `Screen` trägt den
  // `RefreshControl`. Ein Callback nach oben wäre der Umweg.
  const { data: days, isLoading, isRefetching, error, refetch } = useMealPlans(weekStart);

  return (
    <Screen
      scroll
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetch}
          tintColor={theme.inkTertiary}
        />
      }
    >
      <TopBar
        title={t("meals.title")}
        sub={t("meals.weekLabel", {
          week: getISOWeek(weekStart),
          range: formatWeekRange(weekStart, lang),
        })}
      />
      <WeekNav weekStart={weekStart} isCurrentWeek={isCurrentWeek} onChange={changeWeek} />

      <Pressable className="mt-3 overflow-hidden rounded-2xl active:opacity-90">
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

      {isLoading ? (
        <View className="mt-10 items-center">
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : error ? (
        <Card className="mt-4 items-start gap-2">
          <Text variant="bodyEmph">{t("meals.plan.loadError")}</Text>
          {/* Default-Größe (md, h-11) mit Absicht — `sm` ist h-9 und fiele
              unter das 44×44-Ziel. */}
          <Button label={t("action.retry")} variant="soft" onPress={refetch} />
        </Card>
      ) : (
        <WeekPlanGrid
          days={days}
          slot={slot}
          onSlotChange={setSlot}
          openMenuDate={openMenuDate}
          onOpenMenuChange={setOpenMenuDate}
        />
      )}

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

      <RecipeBrowser />
    </Screen>
  );
}
