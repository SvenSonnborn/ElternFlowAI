import { format, parseISO } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Alert, Pressable, View } from "react-native";

import type { ChildRow } from "@/features/auth";
import type { TaskWithType } from "@/features/tasks";

import { ChildAvatar, Icon, Pill } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card, Text } from "@/design-system/ui";
import { mapTaskError, taskTypeColorFor, useToggleTaskDone } from "@/features/tasks";

interface TaskRowProps {
  task: TaskWithType;
  /** Absent for parent errands and chores, which hang on no child. */
  child?: ChildRow;
  /** Set for the "today" section: tints the card and shows the urgent pill. */
  urgent: boolean;
}

export function TaskRow({ task, child, urgent }: TaskRowProps) {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();

  // One mutation per row, not one for the whole list. A shared instance would
  // let a failing toggle's rollback wipe another row's in-flight optimistic
  // update — and locking on a shared `isPending` would swallow taps on every
  // other row while one is saving.
  const toggle = useToggleTaskDone();

  function handleToggle() {
    toggle.mutate(
      { taskId: task.id, done: !task.is_done },
      // The layer classifies, the screen presents — that is what mapTaskError
      // is for.
      { onError: (err) => Alert.alert(t(mapTaskError(err))) },
    );
  }

  const isGerman = i18n.language.startsWith("de");
  const locale = isGerman ? de : enUS;
  // parseISO, never new Date(): `due_date` is a Postgres `date`, and
  // new Date("2026-08-11") would read UTC midnight and shift the day.
  // The pattern differs per language, not just the month name: the dot after
  // the day is a German convention, English wants "Aug 11".
  const due = format(parseISO(task.due_date), isGerman ? "d. MMM" : "MMM d", { locale });
  const badgeColor = taskTypeColorFor(task.task_types?.color, theme);

  return (
    <Card
      variant={urgent ? "tinted" : "base"}
      tint="warning"
      className="flex-row items-center gap-2.5"
    >
      <Pressable
        onPress={handleToggle}
        disabled={toggle.isPending}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: task.is_done, disabled: toggle.isPending }}
        accessibilityLabel={task.title}
        // `invalidateTasks` returns its promise, so `isPending` only clears
        // once the refetched rows are in — the row stays locked until the
        // server state is on screen, which is what rules out a double write.
        className="h-11 w-11 items-center justify-center"
        style={{ opacity: toggle.isPending ? 0.5 : 1 }}
      >
        <View
          className="h-5 w-5 items-center justify-center rounded-md"
          style={{
            backgroundColor: task.is_done ? theme.success : "transparent",
            borderWidth: task.is_done ? 0 : 1.5,
            borderColor: theme.lineStrong,
          }}
        >
          {task.is_done ? <Icon name="check" size={13} color="#FFFFFF" /> : null}
        </View>
      </Pressable>

      <Pressable
        onPress={() => router.push({ pathname: "/task/edit/[id]", params: { id: task.id } })}
        accessibilityRole="button"
        accessibilityLabel={task.title}
        className="flex-1 active:opacity-70"
      >
        {task.subject || urgent ? (
          <View className="mb-1 flex-row items-center gap-1.5">
            {task.subject ? (
              <View
                className="rounded-pill px-2 py-0.5"
                style={{ backgroundColor: `${badgeColor}22` }}
              >
                <Text variant="pill" style={{ color: badgeColor }}>
                  {task.subject}
                </Text>
              </View>
            ) : null}
            {urgent ? <Pill label={t("hw.dueToday")} tone="warn" /> : null}
          </View>
        ) : null}

        <Text
          variant="listTitle"
          tone={task.is_done ? "inkTertiary" : "ink"}
          style={task.is_done ? { textDecorationLine: "line-through" } : undefined}
        >
          {task.title}
        </Text>
        <Text variant="caption" tone="inkSecondary" className="mt-0.5">
          {t("hw.due", { when: due })}
        </Text>
      </Pressable>

      {child ? <ChildAvatar name={child.name} color={child.color} size="sm" /> : null}
    </Card>
  );
}
