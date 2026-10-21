import { format } from "date-fns";
import { de as deLocale, enUS as enLocale } from "date-fns/locale";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";

import { DateTimePickerSheet, Field, useToast } from "@/app-sections/shared";
import { touchTarget } from "@/design-system";
import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Text } from "@/design-system/ui";
import { localize, slotForTime, toDateKey, useRecipeById, type MealSlot } from "@/features/meals";

import { PlanningErrorLine } from "./PlanningErrorLine";
import { useMealPlanning } from "./useMealPlanning";

const SLOTS: readonly MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];

/** Schließt das Sheet; ohne Verlauf (Kaltstart per Deep Link) zurück zum Essen-Tab. */
function close() {
  if (router.canGoBack()) router.back();
  else router.replace("/(tabs)/essen");
}

/**
 * „Zum Essensplan hinzufügen" für `/meal/schedule` (Param `recipeId`): Tag und
 * Slot wählen, einplanen. Der spontane Einstieg neben der Wochenübersicht —
 * Allergie-Hinweis, Ersetzen-Dialog und Schreiben übernimmt `useMealPlanning`
 * wie dort, der Screen schließt und meldet sich nur bei `"planned"`.
 *
 * „Einplanen" bleibt gesperrt, solange das Rezept oder die Familien-Allergien
 * laden oder ein Schreibvorgang läuft: sonst ließe sich ohne Allergie-Urteil
 * einplanen (Review Focus 5) oder doppelt tippen. Vorbelegt sind heute und der
 * Slot der aktuellen Tageszeit (`slotForTime`). Ein gescheitertes Schreiben
 * steht als Zeile über dem Knopf, nicht als Toast (`PlanningErrorLine`).
 *
 * Fehlt `recipeId` oder findet die Query kein Rezept (`null` oder Fehler,
 * etwa nach einem veralteten Deep Link), schließt das Sheet sofort — wie
 * `MealPickScreen` bei ungültigen Params; „Einplanen" bliebe sonst für immer
 * gesperrt, ohne zu sagen, warum.
 */
export function MealScheduleScreen() {
  const { recipeId } = useLocalSearchParams<{ recipeId?: string }>();
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const toast = useToast();
  const recipeQuery = useRecipeById(recipeId ?? "");
  const recipe = recipeQuery.data;
  const { planRecipe, allergiesLoading, busy, error } = useMealPlanning();

  const [date, setDate] = useState(() => new Date());
  const [slot, setSlot] = useState<MealSlot>(() => slotForTime(new Date()));
  const [pickerOpen, setPickerOpen] = useState(false);

  // `isPending` heißt „noch keine Antwort"; danach ist ein fehlendes Rezept
  // endgültig. Ein gescheiterter Hintergrund-Refetch mit Daten im Cache zählt
  // nicht — das Rezept ist ja da.
  const recipeMissing = !recipeId || (!recipeQuery.isPending && !recipe);
  useEffect(() => {
    if (recipeMissing) close();
  }, [recipeMissing]);

  const isGerman = i18n.language.startsWith("de");
  const dateLocale = isGerman ? deLocale : enLocale;
  const fieldDay = format(date, isGerman ? "EEEE, d. MMMM yyyy" : "EEEE, MMMM d, yyyy", {
    locale: dateLocale,
  });
  const toastDay = format(date, isGerman ? "EEEEEE, d.M." : "EEE, MMM d", { locale: dateLocale });

  if (recipeMissing) return null;

  const disabled = !recipe || allergiesLoading || busy;

  async function onSubmit() {
    if (!recipe) return;
    const result = await planRecipe({ recipe, date: toDateKey(date), slot });
    if (result !== "planned") return;
    toast.show({
      title: t("meals.schedule.done", { slot: t(`meals.tabs.${slot}`), day: toastDay }),
      variant: "success",
    });
    close();
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.card }}>
      <View className="flex-row items-center justify-between px-5 pb-1 pt-4">
        <Text variant="h2" style={{ flexShrink: 1 }}>
          {t("meals.schedule.title")}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("action.cancel")}
          onPress={close}
          style={{ minWidth: touchTarget.min, minHeight: touchTarget.min }}
          className="items-center justify-center active:opacity-70"
        >
          <Text variant="bodyEmph" tone="inkSecondary">
            {t("action.cancel")}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text variant="listTitle" numberOfLines={2}>
          {recipe ? localize(recipe.title, i18n.language) : ""}
        </Text>

        <Field
          label={t("meals.schedule.dateLabel")}
          iconName="calendar"
          value={fieldDay}
          onPress={() => setPickerOpen(true)}
        />

        <View>
          <Text
            variant="caption"
            tone="inkSecondary"
            style={{ textTransform: "uppercase", fontWeight: "700", letterSpacing: 1.2 }}
          >
            {t("meals.schedule.slotLabel")}
          </Text>
          <View className="mt-1.5 flex-row flex-wrap gap-2">
            {SLOTS.map((key) => {
              const selected = key === slot;
              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel={t(`meals.tabs.${key}`)}
                  accessibilityState={{ selected }}
                  onPress={() => setSlot(key)}
                  style={{ minWidth: touchTarget.min, minHeight: touchTarget.min }}
                  className="items-center justify-center active:opacity-80"
                >
                  <View
                    className="items-center justify-center rounded-pill px-4 py-2"
                    style={{
                      backgroundColor: selected ? theme.primarySoft : theme.cardSubtle,
                      borderWidth: 1,
                      borderColor: selected ? theme.primary : theme.line,
                    }}
                  >
                    <Text variant="bodyEmph" tone={selected ? "primaryStrong" : "ink"}>
                      {t(`meals.tabs.${key}`)}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        <PlanningErrorLine error={error} />

        <Button
          label={t("meals.schedule.submit")}
          tone="primary"
          block
          disabled={disabled}
          onPress={() => void onSubmit()}
        />
      </ScrollView>

      <DateTimePickerSheet
        mode={pickerOpen ? "date" : null}
        value={date}
        accessibilityLabel={t("meals.schedule.dateLabel")}
        onPick={setDate}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  );
}
