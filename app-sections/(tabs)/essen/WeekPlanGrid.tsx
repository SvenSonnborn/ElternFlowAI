import { format, parseISO } from "date-fns";
import { de as deLocale, enUS as enLocale } from "date-fns/locale";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import {
  AllergenBadge,
  Icon,
  MEAL_PLACEHOLDER_EMOJI,
  recipeA11yLabel,
  useUndoableDelete,
} from "@/app-sections/shared";
import { touchTarget } from "@/design-system";
import { useTheme } from "@/design-system/ThemeProvider";
import { Text } from "@/design-system/ui";
import {
  isOptimisticEntry,
  localize,
  mapMealError,
  slotForTime,
  useRecipeJudge,
  useRemoveMeal,
  type MealPlanDay,
  type MealPlanEntryWithRecipe,
  type RecipeAllergenVerdict,
  type RecipeRow,
} from "@/features/meals";

/**
 * Die drei ersten in der Reihenfolge aus `patterns/meals.md` V1 (Abendessen ·
 * Mittag · Frühstück), `snack` hinten angehängt.
 *
 * **Bewusste Abweichung vom Pattern**, das nur die ersten drei führt: das
 * `meal_slot_enum` kennt vier Slots und `groupByDay` legt jeden in jeden Tag —
 * ohne vierten Tab bliebe ein `snack`-Eintrag unsichtbar statt ungeplant. Die
 * Abweichung ist abgestimmt und in ADR-017 protokolliert; `patterns/meals.md`
 * gehört dem Designer und wurde deshalb nicht mitgeändert (docs/TODO.md).
 */
const SLOT_TABS = ["dinner", "lunch", "breakfast", "snack"] as const;
type SlotTab = (typeof SLOT_TABS)[number];

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
  const { t, i18n } = useTranslation();
  // Behaviour-Rule aus `patterns/meals.md`: vor 11 Frühstück, 11–15 Mittag,
  // sonst Abendessen. Nur als *Startwert* — danach gehört der Tab dem Nutzer,
  // ein Umspringen um 15:00 Uhr unter der Hand wäre übergriffig.
  const [slot, setSlot] = useState<SlotTab>(() => slotForTime(new Date()));
  // Höchstens ein Menü offen. Es hängt an Woche *und* Tag, damit es beim
  // Zurückblättern nicht wieder aufspringt; ein Slot-Wechsel schließt es, weil
  // die Zeile darunter dann ein anderer Eintrag ist.
  const weekKey = days[0]?.date ?? "";
  const [open, setOpen] = useState<{ week: string; date: string } | null>(null);
  const openDate = open?.week === weekKey ? open.date : null;
  const judge = useRecipeJudge();
  const removeMeal = useRemoveMeal();
  const undoableDelete = useUndoableDelete();

  const selectSlot = (tab: SlotTab) => {
    setSlot(tab);
    setOpen(null);
  };

  const deleteEntry = (entry: MealPlanEntryWithRecipe, recipe: RecipeRow) => {
    setOpen(null);
    const vars = {
      entryId: entry.id,
      seenRecipeId: entry.recipe_id,
      date: entry.date,
      slot: entry.meal_slot,
    };
    undoableDelete({
      kind: "meal",
      target: { entryId: entry.id, date: entry.date, slot: entry.meal_slot },
      title: t("meals.row.deleted"),
      message: localize(recipe.title, i18n.language),
      run: () => removeMeal.mutateAsync(vars),
      errorTitle: t("meals.error.deleteFailed"),
      formatError: (err) => t(mapMealError(err)),
    });
  };

  const changeEntry = (entry: MealPlanEntryWithRecipe) => {
    setOpen(null);
    router.push({
      pathname: "/meal/pick",
      params: {
        date: entry.date,
        slot: entry.meal_slot,
        entryId: entry.id,
        seenRecipeId: entry.recipe_id,
      },
    });
  };

  const rows = useMemo(
    () =>
      days.map((day) => {
        // Ein Eintrag ohne sichtbares Rezept zählt als „nichts geplant": das
        // Embed ist `null`, wenn RLS die Rezept-Zeile nicht freigibt (ein
        // privates Rezept einer fremden Familie). Praktisch unerreichbar,
        // solange die App nur globale und eigene Rezepte verplant — die Zeile
        // wäre sonst ein Kästchen ohne Titel und ohne Ziel (docs/TODO.md).
        const entry = day.slots[slot] ?? null;
        const recipe = entry?.recipe ?? null;
        return {
          date: day.date,
          isToday: day.isToday,
          // Ohne sichtbares Rezept gibt es auch keinen Eintrag zu bearbeiten.
          entry: recipe ? entry : null,
          recipe,
          verdict: recipe ? judge(recipe) : null,
        };
      }),
    [days, slot, judge],
  );

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
              onPress={() => selectSlot(tab)}
              // 44 statt der 34 px aus dem Handoff-Layout: dort war die Leiste
              // Dekoration, hier ist sie bedienbar — damit greift die
              // 44×44-Regel aus CLAUDE.md.
              style={{ minHeight: 44 }}
              // `px-1` statt `px-2`: seit `snack` dazukam teilen sich vier
              // Tabs die Zeile, und „Abendessen" ist mit 11px-Caption das
              // längste Label. `numberOfLines` verhindert den Umbruch in eine
              // zweite Zeile, der die Höhen der Nachbarn mitzöge.
              className={`flex-1 items-center justify-center rounded-lg px-1 active:opacity-80 ${
                active ? "bg-card" : ""
              }`}
            >
              <Text
                variant="caption"
                tone={active ? "ink" : "inkSecondary"}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {t(`meals.tabs.${tab}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View className="mt-4 gap-2">
        {rows.map((row) => (
          <DayRow
            key={row.date}
            slot={slot}
            {...row}
            menuOpen={openDate === row.date}
            onToggleMenu={() =>
              setOpen(openDate === row.date ? null : { week: weekKey, date: row.date })
            }
            onChangeEntry={changeEntry}
            onDeleteEntry={deleteEntry}
          />
        ))}
      </View>
    </>
  );
}

interface DayRowProps {
  /** Der aktive Slot-Tab — eine leere Zeile plant genau diesen Slot. */
  slot: SlotTab;
  /** ISO-Kalendertag, `yyyy-MM-dd`. */
  date: string;
  isToday: boolean;
  /** Der Eintrag hinter `recipe`; `null`, wo nichts geplant ist. */
  entry: MealPlanEntryWithRecipe | null;
  recipe: RecipeRow | null;
  verdict: RecipeAllergenVerdict | null;
  menuOpen: boolean;
  /**
   * Bewusst nicht `onPress`: RNTLs `fireEvent.press` läuft zur nächsten
   * `onPress`-Prop hoch und umginge so ein deaktiviertes inneres `Pressable`.
   */
  onToggleMenu: () => void;
  onChangeEntry: (entry: MealPlanEntryWithRecipe) => void;
  onDeleteEntry: (entry: MealPlanEntryWithRecipe, recipe: RecipeRow) => void;
}

function DayRow({
  slot,
  date,
  isToday,
  entry,
  recipe,
  verdict,
  menuOpen,
  onToggleMenu,
  onChangeEntry,
  onDeleteEntry,
}: DayRowProps) {
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
    // Leere Zeile ist ein Knopf: das Label nennt die Handlung, nicht den Zustand.
    if (!recipe) return t("meals.a11y.planDay", { slot: t(`meals.tabs.${slot}`), day: dayName });
    const label = `${dayName}, ${title}`;
    return verdict ? recipeA11yLabel(t, label, verdict) : label;
  }, [parsed, isGerman, title, verdict, recipe, slot, t]);

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
          <Text style={{ fontSize: 24 }}>{MEAL_PLACEHOLDER_EMOJI}</Text>
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
    </>
  );

  const containerClass = `rounded-2xl border border-line ${isToday ? "bg-primary-soft" : "bg-card"}`;
  const dayName = format(parsed, "EEEE", { locale: isGerman ? deLocale : enLocale });

  if (!recipe || !entry) {
    return (
      // Ein leerer Tag ist die Einladung, etwas zu planen — Datum und Slot
      // kennt die Zeile bereits, die Auswahl (`/meal/pick`) braucht nur beides.
      <Pressable
        accessible
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        onPress={() => router.push({ pathname: "/meal/pick", params: { date, slot } })}
        className={`${containerClass} flex-row items-center gap-3 p-3 active:opacity-80`}
      >
        {body}
      </Pressable>
    );
  }

  // Eine optimistische Zeile gibt es nur im Cache; ihre Id an den Server zu
  // schicken wäre ein Schuss ins Leere (`isOptimisticEntry`). Bis der Refetch
  // die echte Id bringt, bleibt die Zeile menülos.
  const menuAvailable = !isOptimisticEntry(entry);

  return (
    <View className={containerClass}>
      <View className="flex-row items-center">
        <Pressable
          accessible
          accessibilityRole="button"
          accessibilityLabel={a11yLabel}
          onPress={() => router.push({ pathname: "/recipe/[id]", params: { id: recipe.id } })}
          className="flex-1 flex-row items-center gap-3 p-3 active:opacity-80"
        >
          {body}
        </Pressable>
        {/* Eigenes Bedienelement *neben* der Zeile, nicht in ihr: Ein Kebab
            innerhalb des Zeilen-`Pressable` ohne eigenen `onPress` traf bei
            jedem Tap die Zeile und öffnete das Rezept. Als Geschwister hat es
            seine eigene 44-Box (ADR-041) und fängt seinen Tap selbst. */}
        {menuAvailable ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("meals.a11y.rowMenu", { day: dayName })}
            accessibilityState={{ expanded: menuOpen }}
            onPress={onToggleMenu}
            className="items-center justify-center active:opacity-70"
            style={{ width: touchTarget.min, height: touchTarget.min, marginRight: 4 }}
          >
            <Icon name="more-horizontal" size={20} color={theme.inkSecondary} />
          </Pressable>
        ) : null}
      </View>
      {menuAvailable && menuOpen ? (
        <View className="flex-row gap-2 border-t border-line px-3 py-2">
          <Pressable
            accessibilityRole="button"
            onPress={() => onChangeEntry(entry)}
            className="flex-1 items-center justify-center rounded-xl bg-bg-raised px-3 active:opacity-70"
            style={{ minHeight: touchTarget.min }}
          >
            <Text variant="caption" tone="ink">
              {t("meals.row.change")}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => onDeleteEntry(entry, recipe)}
            className="flex-1 items-center justify-center rounded-xl bg-danger-soft px-3 active:opacity-70"
            style={{ minHeight: touchTarget.min }}
          >
            <Text variant="caption" tone="danger">
              {t("meals.row.delete")}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
