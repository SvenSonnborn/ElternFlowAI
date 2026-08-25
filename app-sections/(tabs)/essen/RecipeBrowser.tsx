import { router } from "expo-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, View } from "react-native";

import { AllergenBadge, Field, Icon, recipeA11yLabel, SectionHeader } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Text } from "@/design-system/ui";
import {
  localize,
  useRecipeJudge,
  useRecipes,
  type RecipeAllergenVerdict,
  type RecipeRow,
} from "@/features/meals";

interface JudgedRecipe {
  recipe: RecipeRow;
  verdict: RecipeAllergenVerdict;
}

export function RecipeBrowser() {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const [search, setSearch] = useState("");

  // Der Urteiler kennt den Ladezustand der Familien-Allergien und sagt "nicht
  // geprüft", solange er unbekannt ist — die Regel liegt in `judgeWithAllergyState`.
  const judge = useRecipeJudge();
  const { data, isLoading, error } = useRecipes({ search });

  // Bewusst KEIN `excludeAllergens` an die Query: serverseitiges Filtern
  // entfernte die Zeilen, statt sie auszugrauen — der Nutzer könnte "existiert
  // nicht" nicht von "wurde gefiltert" unterscheiden (ADR-014).
  const judged = useMemo<JudgedRecipe[]>(
    () => (data ?? []).map((recipe) => ({ recipe, verdict: judge(recipe) })),
    [data, judge],
  );

  return (
    <View className="mt-6">
      <SectionHeader title={t("meals.browse.title")} />

      <Field
        label={t("meals.browse.search")}
        iconName="search"
        value={search}
        onChangeText={setSearch}
        placeholder={t("meals.browse.searchPlaceholder")}
        autoCorrect={false}
      />

      {isLoading ? <ActivityIndicator className="mt-4" color={theme.primary} /> : null}

      {error ? (
        <Text variant="caption" tone="danger" style={{ marginTop: 12 }}>
          {t("meals.browse.loadError")}
        </Text>
      ) : null}

      {!isLoading && !error && judged.length === 0 ? (
        <Text variant="caption" tone="inkSecondary" style={{ marginTop: 12 }}>
          {t("meals.browse.empty")}
        </Text>
      ) : null}

      <View className="mt-3 gap-2">
        {judged.map(({ recipe, verdict }) => (
          <RecipeRowItem
            key={recipe.id}
            id={recipe.id}
            title={localize(recipe.title, i18n.language)}
            durationMin={recipe.duration_min}
            verdict={verdict}
          />
        ))}
      </View>
    </View>
  );
}

interface RecipeRowItemProps {
  id: string;
  title: string;
  durationMin: number | null;
  verdict: RecipeAllergenVerdict;
}

function RecipeRowItem({ id, title, durationMin, verdict }: RecipeRowItemProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();

  const dimmed = verdict.status === "unsafe" || verdict.status === "caution";

  const a11yLabel = useMemo(() => recipeA11yLabel(t, title, verdict), [t, title, verdict]);

  return (
    // Auch ein ausgegrautes Rezept bleibt drückbar: ADR-014 graut aus statt zu
    // entfernen, und die Detailansicht ist genau der Ort, an dem das Urteil
    // seine Belege nennt.
    <Pressable
      accessible
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      onPress={() => router.push({ pathname: "/recipe/[id]", params: { id } })}
      className={`gap-2 rounded-2xl border border-line bg-card p-3 active:opacity-80 ${dimmed ? "opacity-50" : ""}`}
    >
      <Text variant="listTitle" numberOfLines={1}>
        {title}
      </Text>

      <View className="flex-row flex-wrap items-center gap-2">
        {durationMin !== null ? (
          <View className="flex-row items-center gap-1.5">
            <Icon name="clock" size={11} color={theme.inkSecondary} />
            <Text variant="caption" tone="inkSecondary">
              {t("meals.duration", { n: durationMin })}
            </Text>
          </View>
        ) : null}
        <AllergenBadge verdict={verdict} />
      </View>
    </Pressable>
  );
}
