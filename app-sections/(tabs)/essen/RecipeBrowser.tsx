import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, View } from "react-native";

import { Field, Icon, SectionHeader } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Text } from "@/design-system/ui";
import {
  judgeRecipe,
  localize,
  useFamilyAllergies,
  useRecipes,
  type RecipeAllergenVerdict,
  type RecipeRow,
} from "@/features/meals";

import { AllergenBadge } from "./AllergenBadge";

interface JudgedRecipe {
  recipe: RecipeRow;
  verdict: RecipeAllergenVerdict;
}

export function RecipeBrowser() {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const [search, setSearch] = useState("");

  const allergies = useFamilyAllergies();
  const { data, isLoading, error } = useRecipes({ search });

  // Solange die Allergien nicht geladen sind, ist `keys` leer — und ein leeres
  // `keys` heißt für `judgeRecipe` "diese Familie hat keine Allergien", also
  // `safe`. Ohne diesen Zweig blitzte jedes Rezept erst unmarkiert auf und
  // würde dann rot: bei einem Gesundheitsfeature die falsche Richtung. Solange
  // wir es nicht wissen, sagen wir "nicht geprüft". Dasselbe bei einem Fehler.
  // Truthiness statt `!== undefined`: der Hook faltet drei Query-Fehler mit
  // `??` zusammen, im Erfolgsfall steht dort also `null`.
  const allergiesUnknown = allergies.isLoading || Boolean(allergies.error);

  // Bewusst KEIN `excludeAllergens` an die Query: serverseitiges Filtern
  // entfernte die Zeilen, statt sie auszugrauen — der Nutzer könnte "existiert
  // nicht" nicht von "wurde gefiltert" unterscheiden (ADR-014).
  const judged = useMemo<JudgedRecipe[]>(
    () =>
      (data ?? []).map((recipe) => ({
        recipe,
        verdict: allergiesUnknown
          ? ({ status: "unverified" } as const)
          : judgeRecipe(recipe, allergies.keys),
      })),
    [data, allergies.keys, allergiesUnknown],
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
  title: string;
  durationMin: number | null;
  verdict: RecipeAllergenVerdict;
}

function RecipeRowItem({ title, durationMin, verdict }: RecipeRowItemProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();

  const dimmed = verdict.status === "unsafe" || verdict.status === "caution";

  const a11yLabel = useMemo(() => {
    if (verdict.status === "safe") return title;
    if (verdict.status === "unverified") return t("meals.a11y.unverifiedRecipe", { title });

    const list = [...new Set(verdict.hits.map((hit) => hit.key))]
      .map((key) => t(`onb.s4.allergies.${key}`))
      .join(", ");

    return verdict.status === "unsafe"
      ? t("meals.a11y.unsafeRecipe", { title, list })
      : t("meals.a11y.cautionRecipe", { title, list });
  }, [verdict, title, t]);

  return (
    <View
      accessible
      accessibilityLabel={a11yLabel}
      className={`gap-2 rounded-2xl border border-line bg-card p-3 ${dimmed ? "opacity-50" : ""}`}
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
    </View>
  );
}
