import { format } from "date-fns";
import { de as deLocale, enUS as enLocale } from "date-fns/locale";
import { router } from "expo-router";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { ChildAvatar, EventRow, Icon, SectionHeader, TopBar } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card, Screen, Text } from "@/design-system/ui";
import { useCurrentParent, useFamilyChildren, useFamilyParents } from "@/features/auth";
import { segmentsForDay, segmentTimeLabel, useFamilyEvents } from "@/features/calendar";
import { familyName, mealPick, tomorrowPrep } from "@/features/sample-data";
import { useToday } from "@/features/shared";

import { buildAvatarRow } from "./avatarRow";
import { MealHeroCard } from "./MealHeroCard";

const tonePrepBg = {
  mint: "bg-primary-soft",
  orange: "bg-accent-soft",
  warn: "bg-warning-soft",
} as const;

export function DashboardScreen() {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const lang = i18n.language.startsWith("de") ? "de" : "en";
  const dateLocale = lang === "de" ? deLocale : enLocale;

  const today = useToday();
  const todayKey = format(today, "yyyy-MM-dd");
  // Passing today's date means the range key matches the calendar tab's on
  // mount — both tabs read the same cached month instead of fetching twice.
  const { segments, isLoading, error } = useFamilyEvents(today);
  const todaySegments = useMemo(() => segmentsForDay(segments, todayKey), [segments, todayKey]);

  const parent = useCurrentParent();
  const familyChildren = useFamilyChildren(parent.data?.family_id);
  const familyParents = useFamilyParents(parent.data?.family_id);

  const greeting = t("dash.greeting.morning", { name: parent.data?.short ?? "" });
  const subtitle = t("dash.subtitle", {
    family: familyName,
    date: format(today, "EEEE, d. MMMM", { locale: dateLocale }),
  });

  // Vor dem ersten Fetch ist die Reihe leer — der `+`-Chip bleibt trotzdem
  // stehen, Anlegen funktioniert auch ohne geladene Familie.
  const { visible: avatarRow, overflow } = useMemo(
    () => buildAvatarRow(familyParents.data ?? [], familyChildren.data ?? []),
    [familyParents.data, familyChildren.data],
  );

  return (
    <Screen scroll>
      <TopBar title={greeting} sub={subtitle} />

      {/*
       * Jede Kachel ist echte 44x44 statt 32px + hitSlop: die Ziele liegen
       * nebeneinander, ein hitSlop würde in den Nachbarn hineinragen. Die
       * 44er-Box zentriert einen 32px-Avatar, lässt also 6px Luft nach links —
       * `-ml-1` zieht die Reihe wieder auf die Kante der Karten darunter.
       * `flex-wrap`, weil die volle Reihe (5 Avatare + Overflow + Anlegen =
       * 308px) auf einem 320pt-Gerät breiter ist als der Inhalt: ohne Umbruch
       * schnitte RN den `+`-Button ab, statt ihn in die zweite Zeile zu legen.
       */}
      <View className="-ml-1 mb-1 flex-row flex-wrap items-center">
        {avatarRow.map((entry) => (
          <Pressable
            key={`${entry.kind}-${entry.id}`}
            onPress={() =>
              entry.kind === "child" ? router.push(`/child/${entry.id}`) : router.push("/familie")
            }
            accessibilityRole="button"
            accessibilityLabel={
              entry.kind === "child"
                ? t("dash.a11y.openChild", { name: entry.name })
                : t("dash.a11y.openFamily", { name: entry.name })
            }
            className="h-11 w-11 items-center justify-center active:opacity-80"
          >
            <ChildAvatar name={entry.name} color={entry.color} />
          </Pressable>
        ))}
        {overflow > 0 ? (
          <Pressable
            onPress={() => router.push("/familie")}
            accessibilityRole="button"
            accessibilityLabel={t("dash.a11y.moreMembers", { count: overflow })}
            className="h-11 w-11 items-center justify-center active:opacity-80"
          >
            <View className="h-8 w-8 items-center justify-center rounded-pill border border-line bg-card-subtle">
              <Text variant="pill" tone="inkSecondary">{`+${overflow}`}</Text>
            </View>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => router.push("/child/new")}
          accessibilityRole="button"
          accessibilityLabel={t("dash.addPerson")}
          className="h-11 w-11 items-center justify-center rounded-pill border border-dashed border-line-strong active:opacity-80"
        >
          <Icon name="plus" size={14} color={theme.inkTertiary} />
        </Pressable>
      </View>

      <SectionHeader
        title={t("dash.section.today")}
        action={t("action.seeAll")}
        onPressAction={() => router.push("/kalender")}
      />
      {/*
       * Nothing while the query is in flight or has failed: "alles ruhig" is a
       * statement about the day, and claiming it before the events are in — or
       * after they failed to arrive — would be a claim we cannot back.
       */}
      {isLoading || error ? null : todaySegments.length === 0 ? (
        <Card className="items-center py-6">
          <Text variant="caption" tone="inkSecondary">
            {t("dash.today.empty")}
          </Text>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          {todaySegments.map((seg, i) => {
            const occ = seg.occurrence;
            const person = occ.childId
              ? (familyChildren.data ?? []).find((c) => c.id === occ.childId)
              : occ.parentId
                ? (familyParents.data ?? []).find((p) => p.id === occ.parentId)
                : null;
            const isSpan = seg.total > 1;
            const timeLabel = segmentTimeLabel(seg, t);
            const typeLabel = lang === "de" ? occ.type.labelDe : occ.type.labelEn;
            return (
              <EventRow
                key={`${occ.eventId}-${occ.occurrenceDate}-${seg.date}`}
                time={timeLabel}
                timeCompact={isSpan && !occ.allDay}
                title={occ.title}
                meta={person ? `${person.name} · ${typeLabel}` : typeLabel}
                iconName={occ.type.iconName}
                tone={occ.type.color}
                isFirst={i === 0}
                accessibilityLabel={
                  isSpan
                    ? t("cal.a11y.eventSpan", {
                        title: occ.title,
                        day: t("cal.span.dayOf", { index: seg.index + 1, total: seg.total }),
                        time: timeLabel,
                      })
                    : t("cal.a11y.event", { title: occ.title, time: timeLabel })
                }
                onPress={() =>
                  router.push({
                    pathname: "/event/[id]",
                    params: { id: occ.eventId, occ: occ.occurrenceDate },
                  })
                }
              />
            );
          })}
        </Card>
      )}

      <SectionHeader title={t("dash.meal.question")} action={t("dash.meal.refresh")} />
      {/*
       * Kein `onOpenRecipe`: `mealPick` ist Sample-Data, seine `id` ("meal-1")
       * ist keine UUID und `recipes.id` ist `uuid` — der Aufruf endete in der
       * Detailansicht im Fehlerzweig. Solange die Karte nicht an
       * `useTodaysMeal` hängt, hat sie keine echte Rezept-ID zu verlinken
       * (docs/TODO.md); `onAddToShopping` fehlt aus demselben Grund. Ohne
       * beide Callbacks blendet die Karte ihre Aktionszeile aus.
       */}
      <MealHeroCard meal={mealPick} />

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
