import { format, parseISO } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import type { ChildRow } from "@/features/auth";
import type { TaskWithType } from "@/features/tasks";

import { ChildAvatar, Icon, Pill } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Card, Text } from "@/design-system/ui";
import { taskTypeColorFor } from "@/features/tasks";

interface TaskRowProps {
  task: TaskWithType;
  /** Absent for parent errands and chores, which hang on no child. */
  child?: ChildRow;
  /** Set for the "today" section: tints the card and shows the urgent pill. */
  urgent: boolean;
  onToggle: () => void;
}

export function TaskRow({ task, child, urgent, onToggle }: TaskRowProps) {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();

  const locale = i18n.language.startsWith("de") ? de : enUS;
  // parseISO, never new Date(): `due_date` is a Postgres `date`, and
  // new Date("2026-08-11") would read UTC midnight and shift the day.
  const due = format(parseISO(task.due_date), "d. MMM", { locale });
  const badgeColor = taskTypeColorFor(task.task_types?.color, theme);

  return (
    <Card
      variant={urgent ? "tinted" : "base"}
      tint="warning"
      className="flex-row items-center gap-2.5"
    >
      <Pressable
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: task.is_done }}
        accessibilityLabel={task.title}
        className="h-11 w-11 items-center justify-center"
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

      <View className="flex-1">
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
      </View>

      {child ? <ChildAvatar name={child.name} color={child.color} size="sm" /> : null}
    </Card>
  );
}
