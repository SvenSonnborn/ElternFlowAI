import { format } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { router } from "expo-router";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, RefreshControl, View } from "react-native";

import { FilterChipRow, TopBar, type FilterChipOption } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Card, Screen, Text } from "@/design-system/ui";
import { useCurrentParent, useFamilyChildren } from "@/features/auth";
import {
  CHILD_ALL,
  CHILD_NONE,
  isFiltered,
  mapTaskError,
  useFamilyTasks,
  useFilteredTaskSections,
  useTaskFilter,
  useTaskFilterStore,
  useTasksStats,
  type DueFilter,
  type StatusFilter,
  type TaskWithType,
} from "@/features/tasks";

import { TaskRow, type TaskUrgency } from "./TaskRow";

/** Eine Sektion des Screens: die Fälligkeits-/Erledigt-Häufchen aus `TaskSections`, benannt und mit ihrer Dringlichkeits-Pille. */
interface TaskGroupEntry {
  key: string;
  label: string;
  items: TaskWithType[];
  urgency: TaskUrgency;
}

/**
 * Kontextuelle Typisierung über den Funktionsparameter statt einer
 * Objekt-Literal-Annotation: `urgency` bleibt so an jeder Aufrufstelle gegen
 * `TaskUrgency` geprüft, ohne dass ein `as const` nötig wäre oder das
 * Widening der bedingt gespreadeten `doneRecent`-Zeile umgangen werden müsste.
 */
function taskGroup(
  key: string,
  label: string,
  items: TaskWithType[],
  urgency: TaskUrgency,
): TaskGroupEntry {
  return { key, label, items, urgency };
}

export function AufgabenScreen() {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();

  const { isLoading, isRefetching, error, refetch } = useFamilyTasks();
  const sections = useFilteredTaskSections();

  const filter = useTaskFilter();
  const setStatus = useTaskFilterStore((s) => s.setStatus);
  const setDue = useTaskFilterStore((s) => s.setDue);
  const setChild = useTaskFilterStore((s) => s.setChild);
  const resetFilter = useTaskFilterStore((s) => s.reset);
  const filterActive = isFiltered(filter);
  const stats = useTasksStats();

  const { data: parent } = useCurrentParent();
  const { data: children } = useFamilyChildren(parent?.family_id);

  const childById = useMemo(
    () => new Map((children ?? []).map((child) => [child.id, child])),
    [children],
  );

  const statusOptions: FilterChipOption<StatusFilter>[] = [
    { id: "all", label: t("hw.filter.all") },
    { id: "open", label: t("hw.filter.open") },
    { id: "done", label: t("hw.filter.done") },
  ];

  // Die Fenster spiegeln die Stat-Kacheln: „Diese Woche" liefert genau die
  // Zeilen, die die gleichnamige Kachel zählt.
  const dueOptions: FilterChipOption<DueFilter>[] = [
    { id: "all", label: t("hw.filter.all") },
    { id: "overdue", label: t("hw.overdue") },
    { id: "today", label: t("hw.filter.today") },
    { id: "week", label: t("hw.thisWeek") },
    { id: "longTerm", label: t("hw.longTerm") },
  ];

  const childOptions: FilterChipOption<string>[] = [
    { id: CHILD_ALL, label: t("hw.filter.all") },
    ...(children ?? []).map((child) => ({
      id: child.id,
      label: child.name,
      dotColor: child.color,
    })),
    { id: CHILD_NONE, label: t("hw.form.noChild") },
  ];

  const locale = i18n.language.startsWith("de") ? de : enUS;

  const statTiles = [
    {
      n: String(stats.dueToday),
      label: t("hw.dueToday"),
      bg: "bg-warning-soft",
      tone: theme.warning,
    },
    {
      n: String(stats.thisWeek),
      label: t("hw.thisWeek"),
      bg: "bg-primary-soft",
      tone: theme.primaryStrong,
    },
    {
      n: `${stats.donePct}%`,
      label: t("hw.doneRate"),
      bg: "bg-success-soft",
      tone: theme.success,
    },
  ];

  const allGroups: TaskGroupEntry[] = [
    taskGroup("overdue", t("hw.overdue"), sections.overdue, "overdue"),
    taskGroup("today", t("hw.dueToday"), sections.today, "today"),
    taskGroup("upcoming", t("hw.upcoming"), sections.upcoming, "none"),
    taskGroup("doneToday", t("hw.doneToday"), sections.doneToday, "none"),
    // Sobald irgendein Filter aktiv ist, nicht nur unter „Erledigt": sonst
    // kann eine Zeile, die der Filter durchlässt (z. B. „Alle" + „Überfällig"
    // auf eine gestern erledigte überfällige Aufgabe), in `doneRecent` landen
    // und dort stillschweigend verschwinden — der Screen zeigt dann "Keine
    // Treffer", obwohl eine passende Zeile existiert. Im ungefilterten
    // Default-Zustand bleibt die Sektion weiterhin weg, sonst wüchse die
    // Standardansicht um eine Woche Historie.
    ...(filterActive
      ? [taskGroup("doneRecent", t("hw.doneRecent"), sections.doneRecent, "none")]
      : []),
  ];
  const groups = allGroups.filter((group) => group.items.length > 0);

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
        title={t("hw.title")}
        sub={t("hw.sub", {
          weekday: format(new Date(), "EEEE", { locale }),
          open: stats.open,
          done: stats.doneToday,
        })}
      />

      {isLoading ? (
        <View className="mt-10 items-center">
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : error ? (
        <Card className="items-start gap-2">
          <Text variant="bodyEmph">{t("hw.loadError")}</Text>
          <Text variant="caption" tone="inkSecondary">
            {t(mapTaskError(error))}
          </Text>
          {/* Default size (md, h-11) on purpose — `sm` is h-9 and would fall
              below the 44×44 touch target. */}
          <Button label={t("action.retry")} variant="soft" onPress={refetch} />
        </Card>
      ) : (
        <>
          <View className="flex-row gap-2">
            {statTiles.map((s) => (
              <View key={s.label} className={`flex-1 rounded-2xl p-3 ${s.bg}`}>
                <Text variant="h2" style={{ color: s.tone, fontSize: 22 }}>
                  {s.n}
                </Text>
                <Text variant="caption" tone="inkSecondary" className="mt-0.5">
                  {s.label}
                </Text>
              </View>
            ))}
          </View>

          <View className="mt-4 gap-2">
            <FilterChipRow
              accessibilityLabel={t("hw.filter.a11y.status")}
              options={statusOptions}
              selectedId={filter.status}
              onSelect={setStatus}
            />
            <FilterChipRow
              accessibilityLabel={t("hw.filter.a11y.due")}
              options={dueOptions}
              selectedId={filter.due}
              onSelect={setDue}
            />
            {/* Ohne Kinder in der Familie hat weder „Alle" noch „Ohne Kind"
                eine Bedeutung — dieselbe Logik wie MemberPickers Early-Return. */}
            {(children ?? []).length > 0 ? (
              <FilterChipRow
                accessibilityLabel={t("hw.filter.a11y.child")}
                options={childOptions}
                selectedId={filter.childId}
                onSelect={setChild}
              />
            ) : null}
            {filterActive ? (
              <View className="items-end">
                <Button
                  label={t("hw.filter.reset")}
                  variant="ghost"
                  tone="neutral"
                  onPress={resetFilter}
                />
              </View>
            ) : null}
          </View>

          {groups.length === 0 ? (
            <Card className="mt-5 items-start gap-1">
              <Text variant="bodyEmph">
                {filterActive ? t("hw.filter.empty.title") : t("hw.empty.title")}
              </Text>
              <Text variant="caption" tone="inkSecondary">
                {filterActive ? t("hw.filter.empty.sub") : t("hw.empty.sub")}
              </Text>
              {/* Im Card `soft` statt `ghost` wie in der Leiste: ein
                  transparenter Button wäre hier der einzige Ausweg und dürfte
                  nicht der unauffälligste sein. Gleiche Wahl wie die
                  Retry-Aktion der Fehler-Card. */}
              {filterActive ? (
                <Button
                  label={t("hw.filter.reset")}
                  variant="soft"
                  onPress={resetFilter}
                  className="mt-2"
                />
              ) : null}
            </Card>
          ) : (
            groups.map((group) => (
              <View key={group.key} className="mt-5">
                <Text variant="bodyEmph" className="mb-2">
                  {group.label}
                </Text>
                <View className="gap-2">
                  {group.items.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      child={task.child_id ? childById.get(task.child_id) : undefined}
                      urgency={group.urgency}
                    />
                  ))}
                </View>
              </View>
            ))
          )}
        </>
      )}

      {/* Outside the loading/error branch on purpose: adding a task must work
          even when the list itself is unavailable. */}
      <Button
        label={t("hw.add")}
        tone="primary"
        block
        className="mt-5"
        onPress={() => router.push("/task/new")}
      />
      <Button label={t("hw.addVoice")} variant="soft" tone="accent" block className="mt-2" />
    </Screen>
  );
}
