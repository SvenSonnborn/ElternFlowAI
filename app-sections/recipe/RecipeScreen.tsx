import { LinearGradient } from "expo-linear-gradient";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Image, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Icon, Pill } from "@/app-sections/shared";
import { palette } from "@/design-system";
import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Text } from "@/design-system/ui";
import {
  formatAmount,
  localize,
  useRecipeById,
  useRecipeJudge,
  type RecipeAllergenVerdict,
  type RecipeRow,
} from "@/features/meals";

const TAB_KEYS = ["ingredients", "steps", "nutrition"] as const;
type TabKey = (typeof TAB_KEYS)[number];

/** Was `recipes.difficulty` laut Spaltenkommentar führen darf. */
const DIFFICULTY_KEYS = ["easy", "medium", "hard"] as const;

/**
 * Die Spalte ist ein freies `text` — ein Wert außerhalb der drei bekannten
 * hätte keinen Katalog-Eintrag und würde als roher Schlüssel angezeigt.
 */
function isDifficultyKey(value: string | null): value is (typeof DIFFICULTY_KEYS)[number] {
  return DIFFICULTY_KEYS.some((key) => key === value);
}

/**
 * Der Platzhalter im Header. `recipes` führt keine Emoji-Spalte — anders als die
 * früheren Sample-Daten, wo je Gericht eines hinterlegt war. Ein aus dem Titel
 * geratenes Emoji wäre schlechter als ein neutrales.
 */
const FALLBACK_EMOJI = "🍽";

export function RecipeScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { t } = useTranslation();
  const { theme, nativeVars } = useTheme();

  const { data, isLoading, error } = useRecipeById(id ?? "");

  return (
    <SafeAreaView
      edges={["bottom"]}
      style={[{ flex: 1, backgroundColor: theme.card }, nativeVars]}
      className="flex-1 bg-card"
    >
      <Stack.Screen options={{ contentStyle: { flex: 1, backgroundColor: theme.card } }} />

      <View className="items-center pb-1 pt-2.5">
        <View className="h-1 w-10 rounded-full" style={{ backgroundColor: theme.lineStrong }} />
      </View>

      {isLoading ? (
        <RecipeSkeleton />
      ) : error ? (
        <RecipeFallback message={t("recipe.loadError")} />
      ) : !data ? (
        // `useRecipeById` liefert `null`, wenn die Zeile fehlt oder RLS sie nicht
        // freigibt — beides ist „gibt es nicht", kein Ladefehler.
        <RecipeFallback message={t("recipe.notFound")} />
      ) : (
        <RecipeContent recipe={data} />
      )}
    </SafeAreaView>
  );
}

function RecipeSkeleton() {
  const { theme } = useTheme();

  return (
    <View className="flex-1 px-5 pt-2">
      <View className="h-44 rounded-3xl" style={{ backgroundColor: theme.cardSubtle }} />
      <View className="mt-4 h-6 w-2/3 rounded-lg" style={{ backgroundColor: theme.cardSubtle }} />
      <View className="mt-3 h-4 w-1/2 rounded-lg" style={{ backgroundColor: theme.cardSubtle }} />
    </View>
  );
}

function RecipeFallback({ message }: { message: string }) {
  const { t } = useTranslation();

  return (
    <View className="flex-1 items-center justify-center px-6">
      <Text variant="listTitle" tone="danger" className="text-center">
        {message}
      </Text>
      <View className="mt-4">
        <Button label={t("recipe.close")} variant="soft" onPress={() => router.back()} />
      </View>
    </View>
  );
}

function RecipeContent({ recipe }: { recipe: RecipeRow }) {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const [tab, setTab] = useState<TabKey>("ingredients");

  const title = localize(recipe.title, i18n.language);
  const description = localize(recipe.description, i18n.language);

  // Derselbe Urteiler wie im Rezept-Browser: er sagt „nicht geprüft", solange
  // die Familien-Allergien unbekannt sind, statt stillschweigend zu entwarnen.
  const judge = useRecipeJudge();
  const verdict = useMemo<RecipeAllergenVerdict>(() => judge(recipe), [judge, recipe]);

  return (
    <>
      <View className="mx-4 mt-2 overflow-hidden rounded-3xl">
        {/*
         * Beide Zweige sind für Screenreader stumm: der Titel steht direkt
         * darunter als Überschrift, eine Bildbeschriftung läse ihn ein zweites
         * Mal vor — und der Platzhalter würde sonst als „Besteck" angesagt.
         */}
        {recipe.image_url ? (
          <Image
            source={{ uri: recipe.image_url }}
            style={{ height: 180, width: "100%" }}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        ) : (
          <LinearGradient
            colors={["#FFC56B", palette.orange[500], palette.avatar.pink]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ height: 180, alignItems: "center", justifyContent: "center" }}
          >
            <Text
              style={{ fontSize: 60 }}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              {FALLBACK_EMOJI}
            </Text>
          </LinearGradient>
        )}
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 24 }}
      >
        {/*
         * Hier stand `dash.meal.badge` („Passt perfekt zu deiner Familie") —
         * die Behauptung des KI-Vorschlags auf dem Dashboard. Auf einem selbst
         * gesuchten Rezept ist sie unverdient und stünde bei einem `unsafe`-
         * Urteil direkt neben „Enthält Ei". An ihre Stelle treten die echten
         * `diet_tags` der Zeile.
         */}
        <DietTags tags={recipe.diet_tags} />
        <Text variant="h2" className="mt-2" numberOfLines={2}>
          {title}
        </Text>
        {description ? (
          <Text variant="body" tone="inkSecondary" className="mt-1.5">
            {description}
          </Text>
        ) : null}

        <MetaRow recipe={recipe} />

        <AllergyNotice verdict={verdict} />

        <View className="mt-4 flex-row gap-6 border-b border-line">
          {TAB_KEYS.map((key) => {
            const active = key === tab;
            return (
              <Pressable
                key={key}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => setTab(key)}
                className="items-center justify-end pb-2 active:opacity-70"
                // 44×44 ist die Untergrenze aus CLAUDE.md. Die Höhe braucht das
                // Minimum, weil die Zeile sonst nur so hoch wäre wie die
                // Beschriftung; die Breite, weil ein kurzes Label wie "Steps"
                // darunter bliebe.
                style={{
                  minHeight: 44,
                  minWidth: 44,
                  borderBottomWidth: active ? 2 : 0,
                  borderBottomColor: theme.primary,
                }}
              >
                <Text variant="caption" tone={active ? "ink" : "inkTertiary"}>
                  {t(`recipe.tab.${key}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {tab === "ingredients" ? <IngredientList recipe={recipe} /> : null}
        {tab === "steps" ? <StepList recipe={recipe} /> : null}
        {tab === "nutrition" ? (
          // Die Tabelle führt keine Nährwert-Spalte; der Tab hält den Platz, den
          // `patterns/meals.md` dafür vorsieht (docs/TODO.md).
          <Text variant="caption" tone="inkSecondary" className="mt-3">
            {t("recipe.empty.nutrition")}
          </Text>
        ) : null}
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
    </>
  );
}

/**
 * Die `diet_tags` der Zeile. Laut Spaltenkommentar der Migration sind sie
 * ausdrücklich **nur** UI-Badges und nie Filtergrundlage — dafür ist
 * `contains_allergens` zuständig, das die Karte darunter auswertet.
 *
 * Die Werte kommen roh aus der Quelle (`vegan`, `gluten-free`, …) und laufen
 * deshalb nicht durch den i18n-Katalog: sie sind Daten, kein UI-Text, und das
 * Vokabular ist offen — ein fehlender Katalog-Eintrag zeigte sonst gar nichts.
 */
function DietTags({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;

  return (
    <View className="flex-row flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <Pill key={tag} label={tag} tone="mint" />
      ))}
    </View>
  );
}

function MetaRow({ recipe }: { recipe: RecipeRow }) {
  const { t } = useTranslation();
  const { theme } = useTheme();

  const difficulty = isDifficultyKey(recipe.difficulty)
    ? t(`recipe.difficulty.${recipe.difficulty}`)
    : null;

  // Jedes Feld ist einzeln nullable — eine Zeile mit „null Min." wäre schlechter
  // als eine kürzere Zeile.
  if (recipe.duration_min === null && recipe.servings === null && !difficulty) return null;

  return (
    <View className="mt-2 flex-row items-center gap-3.5">
      {recipe.duration_min !== null ? (
        <View className="flex-row items-center gap-1">
          <Icon name="clock" size={13} color={theme.inkSecondary} />
          <Text variant="caption" tone="inkSecondary">
            {t("meals.duration", { n: recipe.duration_min })}
          </Text>
        </View>
      ) : null}
      {recipe.servings !== null ? (
        <View className="flex-row items-center gap-1">
          <Icon name="users" size={13} color={theme.inkSecondary} />
          <Text variant="caption" tone="inkSecondary">
            {t("recipe.servings", { count: recipe.servings })}
          </Text>
        </View>
      ) : null}
      {difficulty ? (
        <Text variant="caption" tone="inkSecondary">
          {difficulty}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Das Urteil als Karte. Anders als die Badge im Rezept-Browser nennt sie auch
 * die Belege — bei `caution` die Zutaten, die den Verdacht ausgelöst haben.
 * Bewusst NICHT bei `unsafe`: dort ist die Evidenz der rohe Deklarationscode
 * (`egg`, `wheat`), für den es keinen lokalisierten Katalog-Eintrag gibt.
 *
 * Steht über den Tabs, nicht in der Zutatenliste: eine Allergie-Warnung darf
 * nicht davon abhängen, welcher Tab gerade offen ist.
 */
function AllergyNotice({ verdict }: { verdict: RecipeAllergenVerdict }) {
  const { t } = useTranslation();
  const { theme } = useTheme();

  const content = useMemo(() => {
    if (verdict.status === "safe") return null;

    if (verdict.status === "unverified") {
      return {
        headline: t("recipe.allergy.unverified"),
        body: t("recipe.allergy.unverifiedBody"),
        background: theme.bgRaised,
        iconColor: theme.inkSecondary,
        iconName: "shield" as const,
        tone: "ink" as const,
      };
    }

    const list = [...new Set(verdict.hits.map((hit) => hit.key))]
      .map((key) => t(`onb.s4.allergies.${key}`))
      .join(", ");

    if (verdict.status === "unsafe") {
      return {
        headline: t("recipe.allergy.unsafe", { list }),
        body: t("recipe.allergy.unsafeBody"),
        background: theme.dangerSoft,
        iconColor: theme.danger,
        iconName: "alert-triangle" as const,
        tone: "danger" as const,
      };
    }

    const evidence = [...new Set(verdict.hits.map((hit) => hit.evidence))].join(", ");
    return {
      headline: t("recipe.allergy.caution", { list }),
      body: t("recipe.allergy.cautionBody", { evidence }),
      background: theme.warningSoft,
      iconColor: theme.warning,
      iconName: "alert-triangle" as const,
      tone: "accentStrong" as const,
    };
  }, [verdict, t, theme]);

  if (!content) return null;

  return (
    <View
      accessible
      accessibilityLabel={`${content.headline}. ${content.body}`}
      className="mt-4 rounded-2xl p-3.5"
      style={{ backgroundColor: content.background }}
    >
      <View className="mb-1 flex-row items-center gap-1.5">
        <Icon name={content.iconName} size={14} color={content.iconColor} />
        <Text variant="listTitle" tone={content.tone} className="flex-1">
          {content.headline}
        </Text>
      </View>
      <Text variant="caption" tone="inkSecondary">
        {content.body}
      </Text>
    </View>
  );
}

function IngredientList({ recipe }: { recipe: RecipeRow }) {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();

  if (recipe.ingredients.length === 0) {
    return (
      <Text variant="caption" tone="inkSecondary" className="mt-3">
        {t("recipe.empty.ingredients")}
      </Text>
    );
  }

  const amounts = recipe.ingredients.map((ingredient) => formatAmount(ingredient));
  // Die Mengenspalte steht oder fällt für die ganze Liste: pro Zeile entschieden
  // rückten die Namen unterschiedlich weit ein („Salz" ohne Menge sprünge nach
  // links). Hat kein einziger Eintrag eine Menge, entfällt die Spalte ganz.
  const hasAmounts = amounts.some(Boolean);

  return (
    <View className="mt-3 gap-2">
      {recipe.ingredients.map((ingredient, i) => {
        return (
          <View
            // Zutatennamen wiederholen sich („Salz" für Teig und Wasser), der
            // Index gehört deshalb in den Schlüssel.
            key={`${i}-${localize(ingredient.name, "de")}`}
            className={`flex-row items-center gap-2.5 py-1.5 ${i === 0 ? "" : "border-t border-line"}`}
          >
            {hasAmounts ? (
              <Text variant="listTitle" style={{ width: 64 }}>
                {amounts[i]}
              </Text>
            ) : null}
            <Text variant="body" className="flex-1">
              {localize(ingredient.name, i18n.language)}
            </Text>
            <View
              className="h-5 w-5 items-center justify-center rounded-md"
              style={{ backgroundColor: theme.primarySoft }}
            >
              <Icon name="check" size={12} color={theme.primaryStrong} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function StepList({ recipe }: { recipe: RecipeRow }) {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();

  if (recipe.instructions.length === 0) {
    return (
      <Text variant="caption" tone="inkSecondary" className="mt-3">
        {t("recipe.empty.steps")}
      </Text>
    );
  }

  return (
    <View className="mt-3 gap-3">
      {recipe.instructions.map((step, i) => (
        <View key={`${i}-${localize(step, "de")}`} className="flex-row gap-3">
          <View
            className="h-6 w-6 items-center justify-center rounded-pill"
            style={{ backgroundColor: theme.primarySoft }}
          >
            <Text variant="caption" tone="primaryStrong">
              {i + 1}
            </Text>
          </View>
          <Text variant="body" className="flex-1">
            {localize(step, i18n.language)}
          </Text>
        </View>
      ))}
    </View>
  );
}
