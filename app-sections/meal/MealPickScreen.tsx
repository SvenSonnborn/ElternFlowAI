import { format, isValid, parseISO } from "date-fns";
import { de as deLocale, enUS as enLocale } from "date-fns/locale";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";

import { RecipeBrowser } from "@/app-sections/(tabs)/essen/RecipeBrowser";
import { touchTarget } from "@/design-system";
import { useTheme } from "@/design-system/ThemeProvider";
import { Text } from "@/design-system/ui";
import { type MealSlot, type RecipeRow } from "@/features/meals";

import { PlanningErrorLine } from "./PlanningErrorLine";
import { useMealPlanning } from "./useMealPlanning";

const SLOTS: readonly MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Schließt die Auswahl; ohne Verlauf (Kaltstart per Deep Link) zurück zum Essen-Tab. */
function close() {
  if (router.canGoBack()) router.back();
  else router.replace("/(tabs)/essen");
}

/**
 * Rezept-Auswahl für `/meal/pick` (Params `date`, `slot`, optional `entryId` +
 * `seenRecipeId` für „Anderes Rezept wählen"). Zeigt den Rezept-Browser im
 * Auswahlmodus; die Dialoge (Allergie-Hinweis, Ersetzen) und das Schreiben
 * übernimmt `useMealPlanning`, der Screen schließt nur bei `"planned"`.
 *
 * Die Auswahl bleibt gesperrt, solange die Familien-Allergien laden oder ein
 * Schreibvorgang läuft: sonst ließe sich ohne Allergie-Urteil einplanen
 * (Review Focus 5) oder doppelt tippen. Damit das Warten nicht wie ein toter
 * Tipp aussieht, sind die Zeilen dann blass und die Kopfzeile dreht einen
 * Spinner. Ein gescheitertes Schreiben steht als Zeile unter der Kopfzeile,
 * nicht als Toast (`PlanningErrorLine`). Ungültige Params schließen sofort —
 * ein Sheet ohne Ziel hätte nichts zu planen.
 */
export function MealPickScreen() {
  const params = useLocalSearchParams<{
    date?: string;
    slot?: string;
    entryId?: string;
    seenRecipeId?: string;
  }>();
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const { planRecipe, allergiesLoading, busy, error } = useMealPlanning();

  const date = params.date ?? "";
  const parsed = DATE_KEY.test(date) ? parseISO(date) : null;
  const dateValid = parsed !== null && isValid(parsed);
  const slot = SLOTS.find((s) => s === params.slot);
  const valid = dateValid && slot !== undefined;

  useEffect(() => {
    if (!valid) close();
  }, [valid]);

  if (!valid || !parsed || !slot) return null;

  const waiting = allergiesLoading || busy;

  const isGerman = i18n.language.startsWith("de");
  const day = format(parsed, isGerman ? "EEEEEE, d.M." : "EEE, MMM d", {
    locale: isGerman ? deLocale : enLocale,
  });

  async function onPick(recipe: RecipeRow) {
    if (!slot) return;
    const replaceTarget =
      params.entryId && params.seenRecipeId
        ? { entryId: params.entryId, seenRecipeId: params.seenRecipeId }
        : undefined;
    const result = await planRecipe({
      recipe,
      date,
      slot,
      ...(replaceTarget ? { replaceTarget } : {}),
    });
    if (result === "planned") close();
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.card }}>
      <View className="flex-row items-center justify-between px-5 pb-1 pt-4">
        <Text variant="h2" style={{ flexShrink: 1 }}>
          {t("meals.pick.title", { slot: t(`meals.tabs.${slot}`), day })}
        </Text>
        <View className="flex-row items-center gap-2">
          {waiting ? <ActivityIndicator color={theme.primary} /> : null}
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
      </View>
      {/* Außerhalb der Liste: Wer weit unten getippt hat, sähe die Zeile
          sonst nicht. */}
      {error ? (
        <View className="px-5 pb-1">
          <PlanningErrorLine error={error} />
        </View>
      ) : null}
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <RecipeBrowser onPick={(recipe) => void onPick(recipe)} pickDisabled={waiting} />
      </ScrollView>
    </View>
  );
}
