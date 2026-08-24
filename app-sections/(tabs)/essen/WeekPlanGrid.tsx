import { format, parseISO } from "date-fns";
import { de as deLocale, enUS as enLocale } from "date-fns/locale";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { Icon } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card, Text } from "@/design-system/ui";
import {
  localize,
  slotForTime,
  useRecipeJudge,
  type MealPlanDay,
  type RecipeAllergenVerdict,
  type RecipeRow,
} from "@/features/meals";

import { AllergenBadge } from "./AllergenBadge";
import { recipeA11yLabel } from "./recipeA11y";

/**
 * Reihenfolge aus `patterns/meals.md` V1 (Abendessen · Mittag · Frühstück).
 * `snack` steht im `meal_slot_enum`, hat im Screen aber keinen Platz — der
 * Layer führt ihn weiter mit, sichtbar ist er nicht (docs/TODO.md).
 */
const SLOT_TABS = ["dinner", "lunch", "breakfast"] as const;
type SlotTab = (typeof SLOT_TABS)[number];

/**
 * `recipes` führt keine Emoji-Spalte, anders als die früheren Sample-Daten.
 * Dieselbe Vertretung wie im Header der Rezept-Detailansicht.
 */
const FALLBACK_EMOJI = "🍽";

interface WeekPlanGridProps {
  /** Genau sieben Tage, Mo–So — so, wie `useMealPlans` sie liefert. */
  days: MealPlanDay[];
}

/**
 * Das Wochenraster des Essen-Tabs: eine Slot-Auswahl über sieben Tageszeilen.
 *
 * Nimmt die Tage als Prop statt selbst zu laden, damit der Screen darüber den
 * `RefreshControl` und das Wochenlabel aus derselben Query speisen kann, ohne
 * `refetch` durch einen Callback nach oben zu reichen.
 */
export function WeekPlanGrid({ days }: WeekPlanGridProps) {
  const { t } = useTranslation();
  // Behaviour-Rule aus `patterns/meals.md`: vor 11 Frühstück, 11–15 Mittag,
  // sonst Abendessen. Nur als *Startwert* — danach gehört der Tab dem Nutzer,
  // ein Umspringen um 15:00 Uhr unter der Hand wäre übergriffig.
  const [slot, setSlot] = useState<SlotTab>(() => slotForTime(new Date()));
  const judge = useRecipeJudge();

  const rows = useMemo(
    () =>
      days.map((day) => {
        // Ein Eintrag ohne sichtbares Rezept zählt als „nichts geplant": das
        // Embed ist `null`, wenn RLS die Rezept-Zeile nicht freigibt (ein
        // privates Rezept einer fremden Familie). Praktisch unerreichbar,
        // solange die App nur globale und eigene Rezepte verplant — die Zeile
        // wäre sonst ein Kästchen ohne Titel und ohne Ziel (docs/TODO.md).
        const recipe = day.slots[slot]?.recipe ?? null;
        return {
          date: day.date,
          isToday: day.isToday,
          recipe,
          verdict: recipe ? judge(recipe) : null,
        };
      }),
    [days, slot, judge],
  );

  const isEmpty = rows.every((row) => row.recipe === null);

  return (
    <>
      <View className="mt-4 flex-row gap-1 rounded-xl border border-line bg-bg-raised p-1">
        {SLOT_TABS.map((tab) => {
          const active = tab === slot;
          return (
            <Pressable
              key={tab}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => setSlot(tab)}
              // 44 statt der 34 px aus dem Handoff-Layout: dort war die Leiste
              // Dekoration, hier ist sie bedienbar — damit greift die
              // 44×44-Regel aus CLAUDE.md.
              style={{ minHeight: 44 }}
              className={`flex-1 items-center justify-center rounded-lg px-2 active:opacity-80 ${
                active ? "bg-card" : ""
              }`}
            >
              <Text variant="caption" tone={active ? "ink" : "inkSecondary"}>
                {t(`meals.tabs.${tab}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {isEmpty ? (
        // Sieben identische Platzhalterzeilen wären nur Rauschen; die Zeilen
        // halten das Mo–So-Raster erst zusammen, wenn es etwas zu halten gibt.
        <Card className="mt-4">
          <Text variant="caption" tone="inkSecondary">
            {t("meals.plan.empty")}
          </Text>
        </Card>
      ) : (
        <View className="mt-4 gap-2">
          {rows.map((row) => (
            <DayRow key={row.date} {...row} />
          ))}
        </View>
      )}
    </>
  );
}

interface DayRowProps {
  /** ISO-Kalendertag, `yyyy-MM-dd`. */
  date: string;
  isToday: boolean;
  recipe: RecipeRow | null;
  verdict: RecipeAllergenVerdict | null;
}

function DayRow({ date, isToday, recipe, verdict }: DayRowProps) {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const isGerman = i18n.language.startsWith("de");

  const parsed = parseISO(date);
  // Deutsch kürzt zweistellig ("Mo"), Englisch dreistellig ("Mon") — "EEE"
  // ergäbe im Deutschen "Mo." mit Abkürzungspunkt.
  const weekday = format(parsed, isGerman ? "EEEEEE" : "EEE", {
    locale: isGerman ? deLocale : enLocale,
  });

  const title = recipe ? localize(recipe.title, i18n.language) : t("meals.plan.emptyDay");

  const meta = useMemo(() => {
    const parts: string[] = [];
    if (recipe?.duration_min != null) parts.push(t("meals.duration", { n: recipe.duration_min }));
    if (isToday) parts.push(t("meals.today"));
    return parts.join(" · ");
  }, [recipe, isToday, t]);

  const a11yLabel = useMemo(() => {
    const dayName = format(parsed, "EEEE", { locale: isGerman ? deLocale : enLocale });
    const label = `${dayName}, ${title}`;
    return verdict ? recipeA11yLabel(t, label, verdict) : label;
  }, [parsed, isGerman, title, verdict, t]);

  const body = (
    <>
      <View className="w-10 items-center">
        <Text variant="caption" tone="inkSecondary" style={{ textTransform: "uppercase" }}>
          {weekday}
        </Text>
        <Text variant="cardTitle" tone={isToday ? "primaryStrong" : "ink"} style={{ marginTop: 2 }}>
          {format(parsed, "d")}
        </Text>
      </View>

      <View
        className={`h-12 w-12 items-center justify-center rounded-xl ${
          isToday ? "bg-white/70" : "bg-bg-raised"
        }`}
      >
        {recipe ? (
          <Text style={{ fontSize: 24 }}>{FALLBACK_EMOJI}</Text>
        ) : (
          <Icon name="plus" size={18} color={theme.inkTertiary} />
        )}
      </View>

      <View className="flex-1">
        <Text
          variant="listTitle"
          tone={recipe ? "ink" : "inkTertiary"}
          numberOfLines={1}
          style={{ flexShrink: 1 }}
        >
          {title}
        </Text>
        <View className="mt-0.5 flex-row flex-wrap items-center gap-1.5">
          {meta ? (
            <>
              <Icon name="clock" size={11} color={theme.inkSecondary} />
              <Text variant="caption" tone="inkSecondary">
                {meta}
              </Text>
            </>
          ) : null}
          {/* Badge ohne Ausgrauen — anders als im Rezept-Browser darunter.
              Dort heißt blass „die schlechtere Wahl unter mehreren" (ADR-014);
              eine bereits verplante Mahlzeit ist kein Suchergebnis, und ein
              Warnhinweis, der seine eigene Zeile unauffälliger macht, arbeitet
              gegen sich. Dasselbe Urteil, andere Darstellung. */}
          {verdict ? <AllergenBadge verdict={verdict} /> : null}
        </View>
      </View>

      {/* Dekorativ, wie die Fußzeilen-Buttons der Detailansicht: das Kebab
          steht so in der V1-Zeilenanatomie des Patterns, es gibt aber noch
          keine Mutation, die es auslösen könnte (docs/TODO.md). */}
      {recipe ? <Icon name="more-horizontal" size={18} color={theme.inkTertiary} /> : null}
    </>
  );

  const className = `flex-row items-center gap-3 rounded-2xl border border-line p-3 ${
    isToday ? "bg-primary-soft" : "bg-card"
  }`;

  if (!recipe) {
    return (
      <View accessible accessibilityLabel={a11yLabel} className={className}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      accessible
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      onPress={() => router.push({ pathname: "/recipe/[id]", params: { id: recipe.id } })}
      className={`${className} active:opacity-80`}
    >
      {body}
    </Pressable>
  );
}
