import { addDays, format } from "date-fns";
import { de as deLocale, enUS as enLocale } from "date-fns/locale";
import { router } from "expo-router";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { ChildAvatar, EventRow, Icon, SectionHeader, TopBar } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card, Screen, Text } from "@/design-system/ui";
import {
  onboardingResumeStep,
  useCurrentParent,
  useFamilyChildren,
  useFamilyParents,
  useFamilyPendingInvitations,
} from "@/features/auth";
import { segmentsForDay, segmentTimeLabel, useFamilyEvents } from "@/features/calendar";
import { useMealAlternative, useRecipeJudge, useTodaysMeal } from "@/features/meals";
import { getSampleFamilyName } from "@/features/sample-data";
import { useToday } from "@/features/shared";
import { useFamilyTasks } from "@/features/tasks";

import { buildAvatarRow } from "./avatarRow";
import { MealHeroCard } from "./MealHeroCard";
import { MealHeroEmptyCard } from "./MealHeroEmptyCard";
import { OnboardingResumeCard } from "./OnboardingResumeCard";
import { PrepRow } from "./PrepRow";
import { buildTomorrowPrep } from "./tomorrowPrep";

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

  // Der Slot der aktuellen Uhrzeit — `useTodaysMeal` rechnet ihn selbst weiter,
  // wenn die Grenze zwischen Frühstück, Mittag und Abendessen fällt.
  const { entry: mealEntry, slot, isLoading: mealLoading, error: mealError } = useTodaysMeal();
  const judge = useRecipeJudge();
  const mealRecipe = mealEntry?.recipe ?? null;
  const mealVerdict = useMemo(() => (mealRecipe ? judge(mealRecipe) : null), [mealRecipe, judge]);
  // Der Rezept-Pool wird nur geladen, wenn es tatsächlich etwas auszuweichen
  // gibt; der Seed hält den Vorschlag für die Dauer der Mahlzeit fest.
  const alternative = useMealAlternative({
    enabled: mealVerdict?.status === "unsafe" || mealVerdict?.status === "caution",
    excludeId: mealRecipe?.id,
    seed: `${todayKey}-${slot}`,
  });

  const parent = useCurrentParent();
  const familyChildren = useFamilyChildren(parent.data?.family_id);
  const familyParents = useFamilyParents(parent.data?.family_id);
  // Teilt den Query-Key mit dem Familie-Tab; auf dem Dashboard ist die Liste
  // nur ein Zähler — eine offene Einladung heißt „Step 3 ist erledigt".
  const pendingInvitations = useFamilyPendingInvitations(parent.data?.family_id);

  // Wer das Onboarding nach Step 2 verlassen hat, hat eine `parents`-Zeile und
  // landet deshalb hier statt im Flow (ADR-005, Approach C). `null`, solange
  // eine der vier Quellen nicht geantwortet hat.
  const resumeStep = onboardingResumeStep({
    parentId: parent.data?.id,
    parents: familyParents.data,
    childCount: familyChildren.data?.length,
    pendingInviteCount: pendingInvitations.data?.length,
  });

  const greeting = t("dash.greeting.morning", { name: parent.data?.short ?? "" });
  const subtitle = t("dash.subtitle", {
    family: getSampleFamilyName(t),
    date: format(today, "EEEE, d. MMMM", { locale: dateLocale }),
  });

  // Vor dem ersten Fetch ist die Reihe leer — der `+`-Chip bleibt trotzdem
  // stehen, Anlegen funktioniert auch ohne geladene Familie.
  const { visible: avatarRow, overflow } = useMemo(
    () => buildAvatarRow(familyParents.data ?? [], familyChildren.data ?? []),
    [familyParents.data, familyChildren.data],
  );

  // Kein zweiter Roundtrip: `useFamilyTasks` teilt sich den Query-Key mit dem
  // Aufgaben-Tab, und die Termine von morgen liegen ohnehin im Monatsfenster,
  // das `useFamilyEvents` oben schon geladen hat.
  const tasks = useFamilyTasks();
  const tomorrowKey = format(addDays(today, 1), "yyyy-MM-dd");
  const prepPeople = useMemo(
    () =>
      [...(familyParents.data ?? []), ...(familyChildren.data ?? [])].map((person) => ({
        id: person.id,
        name: person.name,
      })),
    [familyParents.data, familyChildren.data],
  );
  const prep = useMemo(
    () =>
      buildTomorrowPrep({
        tasks: tasks.data,
        segments,
        date: tomorrowKey,
        people: prepPeople,
        theme,
        lang,
        t,
      }),
    [tasks.data, segments, tomorrowKey, prepPeople, theme, lang, t],
  );
  // Aus dem Objekt gelöst, damit TypeScript die Null-Prüfung bis in den
  // `onPress`-Closure trägt.
  const { overflowTarget } = prep;
  const prepPending = isLoading || !!error || tasks.isLoading || !!tasks.error;

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

      {resumeStep ? <OnboardingResumeCard step={resumeStep} /> : null}

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

      <SectionHeader
        title={t("dash.meal.question")}
        action={t("action.seeAll")}
        onPressAction={() => router.push("/essen")}
      />
      {/*
       * Dieselbe Zurückhaltung wie bei der Terminliste: die Leer-Karte
       * behauptete „nichts geplant", bevor die Antwort da ist — und nach einem
       * Fehler wüssten wir es erst recht nicht.
       */}
      {mealLoading || mealError ? null : mealRecipe && mealVerdict ? (
        <MealHeroCard
          recipe={mealRecipe}
          slot={slot}
          verdict={mealVerdict}
          alternative={alternative}
          onOpenRecipe={() =>
            router.push({ pathname: "/recipe/[id]", params: { id: mealRecipe.id } })
          }
          onOpenAlternative={
            alternative
              ? () => router.push({ pathname: "/recipe/[id]", params: { id: alternative.id } })
              : undefined
          }
        />
      ) : (
        <MealHeroEmptyCard onPressPlan={() => router.push("/essen")} />
      )}

      <SectionHeader title={t("dash.section.tomorrow")} />
      {/*
       * Dieselbe Zurückhaltung wie bei der Terminliste: „nichts vorzubereiten"
       * ist eine Aussage über morgen, und die lässt sich weder vor der Antwort
       * beider Queries noch nach einem Fehler belegen.
       */}
      {prepPending ? null : prep.visible.length === 0 ? (
        <Card className="items-center py-6">
          <Text variant="caption" tone="inkSecondary">
            {t("dash.tomorrow.empty")}
          </Text>
        </Card>
      ) : (
        <Card>
          <View className="gap-1">
            {prep.visible.map((entry) => (
              <PrepRow
                key={entry.key}
                title={entry.title}
                meta={entry.meta}
                iconName={entry.iconName}
                color={entry.color}
                accessibilityLabel={t(
                  entry.kind === "task" ? "dash.a11y.prepTask" : "dash.a11y.prepEvent",
                  { title: entry.title },
                )}
                onPress={() =>
                  entry.kind === "task"
                    ? router.push({ pathname: "/task/edit/[id]", params: { id: entry.id } })
                    : router.push({
                        pathname: "/event/[id]",
                        params: { id: entry.id, occ: entry.occurrenceDate },
                      })
                }
              />
            ))}
            {overflowTarget ? (
              <Pressable
                onPress={() => router.push(overflowTarget)}
                accessibilityRole="button"
                accessibilityLabel={t("dash.a11y.prepMore", { count: prep.overflow })}
                className="min-h-11 flex-row items-center justify-between border-t border-line pt-2 active:opacity-70"
              >
                <Text variant="caption" tone="primaryStrong">
                  {t("dash.tomorrow.more", { count: prep.overflow })}
                </Text>
                <Icon name="chevron-right" size={16} color={theme.inkTertiary} />
              </Pressable>
            ) : null}
          </View>
        </Card>
      )}
    </Screen>
  );
}
