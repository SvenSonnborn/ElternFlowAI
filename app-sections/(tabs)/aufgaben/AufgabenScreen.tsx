import { format } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Alert, RefreshControl, View } from "react-native";

import type { TaskWithType } from "@/features/tasks";

import { TopBar } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Card, Screen, Text } from "@/design-system/ui";
import { useCurrentParent, useFamilyChildren } from "@/features/auth";
import {
  mapTaskError,
  useFamilyTasks,
  useTasksSections,
  useTasksStats,
  useToggleTaskDone,
} from "@/features/tasks";

import { TaskRow } from "./TaskRow";

export function AufgabenScreen() {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();

  const { isLoading, isRefetching, error, refetch } = useFamilyTasks();
  const sections = useTasksSections();
  const stats = useTasksStats();
  const toggle = useToggleTaskDone();

  const { data: parent } = useCurrentParent();
  const { data: children } = useFamilyChildren(parent?.family_id);

  const childById = useMemo(
    () => new Map((children ?? []).map((child) => [child.id, child])),
    [children],
  );

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

  const groups = [
    { key: "today", label: t("hw.dueToday"), items: sections.today, urgent: true },
    { key: "upcoming", label: t("hw.upcoming"), items: sections.upcoming, urgent: false },
    { key: "doneToday", label: t("hw.doneToday"), items: sections.doneToday, urgent: false },
  ].filter((group) => group.items.length > 0);

  function handleToggle(task: TaskWithType) {
    toggle.mutate(
      { taskId: task.id, done: !task.is_done },
      // The layer classifies, the screen presents — that is what mapTaskError
      // is for.
      { onError: (err) => Alert.alert(t(mapTaskError(err))) },
    );
  }

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

          {groups.length === 0 ? (
            <Card className="mt-5 gap-1">
              <Text variant="bodyEmph">{t("hw.empty.title")}</Text>
              <Text variant="caption" tone="inkSecondary">
                {t("hw.empty.sub")}
              </Text>
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
                      urgent={group.urgent}
                      onToggle={() => handleToggle(task)}
                    />
                  ))}
                </View>
              </View>
            ))
          )}
        </>
      )}

      <Button label={t("hw.addVoice")} variant="soft" tone="accent" block className="mt-5" />
    </Screen>
  );
}
