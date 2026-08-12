import { router, Stack, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { MemberOption, TypePickerItem } from "@/app-sections/shared";
import type { TaskFormState } from "@/features/tasks";

import { confirmDestructive } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Text } from "@/design-system/ui";
import { useCurrentParent, useFamilyChildren } from "@/features/auth";
import {
  emptyTaskForm,
  hasTaskFormErrors,
  mapTaskError,
  taskToForm,
  taskTypeColorFor,
  taskTypeLabelKey,
  toTaskChanges,
  useDeleteTask,
  useTask,
  useTaskTypes,
  useUpdateTask,
  validateTaskForm,
} from "@/features/tasks";

import { TaskForm } from "./TaskForm";

export function TaskEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const taskId = id ?? "";
  const { t } = useTranslation();
  const { theme, nativeVars } = useTheme();

  const { data: task, isLoading } = useTask(taskId);
  const types = useTaskTypes();
  const { data: parent } = useCurrentParent();
  const { data: children } = useFamilyChildren(parent?.family_id);
  const updateMutation = useUpdateTask();
  const deleteMutation = useDeleteTask();

  const [state, setState] = useState<TaskFormState>(() => emptyTaskForm(new Date()));
  const [hydrated, setHydrated] = useState(false);

  if (task && !hydrated) {
    setState(taskToForm(task));
    setHydrated(true);
  }

  // Written as a copy-then-assign rather than `{ ...prev, [key]: value }`:
  // a computed key with a generic type widens the spread's inferred type and
  // TypeScript stops seeing it as a TaskFormState.
  function handleChange<K extends keyof TaskFormState>(key: K, value: TaskFormState[K]) {
    setState((prev) => {
      const next: TaskFormState = { ...prev };
      next[key] = value;
      return next;
    });
  }

  const typeItems: TypePickerItem[] = useMemo(
    () =>
      (types.data ?? []).map((type) => ({
        id: type.id,
        label: t(taskTypeLabelKey(type.slug), { defaultValue: type.slug }),
        color: taskTypeColorFor(type.color, theme),
      })),
    [types.data, t, theme],
  );

  const childOptions: MemberOption[] = useMemo(
    () =>
      (children ?? []).map((child) => ({
        id: child.id,
        name: child.name,
        color: child.color,
        kind: "child" as const,
      })),
    [children],
  );

  const errors = validateTaskForm(state);
  const canSave = hydrated && !hasTaskFormErrors(errors) && !updateMutation.isPending;

  function onSave() {
    const changes = toTaskChanges(state);
    if (!changes || !task || updateMutation.isPending) return;
    updateMutation.mutate({ taskId: task.id, changes }, { onSuccess: () => router.back() });
  }

  async function onDelete() {
    if (!task || deleteMutation.isPending) return;
    const confirmed = await confirmDestructive({
      title: t("hw.delete.confirmTitle"),
      body: t("hw.delete.confirmBody"),
      confirm: t("hw.delete.confirmOk"),
      cancel: t("action.cancel"),
    });
    if (!confirmed) return;
    deleteMutation.mutate(
      { taskId: task.id },
      {
        onSuccess: () => router.back(),
        onError: (err) => Alert.alert(t("hw.delete.error"), t(mapTaskError(err))),
      },
    );
  }

  return (
    <SafeAreaView
      edges={["bottom"]}
      style={[{ flex: 1, backgroundColor: theme.card }, nativeVars]}
      className="flex-1 bg-card"
    >
      <Stack.Screen options={{ contentStyle: { flex: 1, backgroundColor: theme.card } }} />

      {isLoading ? (
        <View className="flex-1 items-center justify-center px-6">
          <View className="h-24 w-full rounded-2xl" style={{ backgroundColor: theme.cardSubtle }} />
        </View>
      ) : !task ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text variant="listTitle" tone="danger">
            {t("hw.notFound")}
          </Text>
          <View className="mt-4">
            <Button label={t("action.back")} variant="soft" onPress={() => router.back()} />
          </View>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1, backgroundColor: theme.card }}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 4,
            paddingBottom: 24,
            gap: 14,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="flex-row items-center justify-between pb-3 pt-4">
            <Text variant="h2">{t("hw.edit.title")}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("action.cancel")}
              onPress={() => router.back()}
              className="px-2 py-1 active:opacity-70"
              hitSlop={12}
            >
              <Text variant="bodyEmph" tone="inkSecondary">
                {t("action.cancel")}
              </Text>
            </Pressable>
          </View>

          <TaskForm
            state={state}
            onChange={handleChange}
            types={typeItems}
            childOptions={childOptions}
            errors={{
              title: errors.title ? t(errors.title) : undefined,
              typeId: errors.typeId ? t(errors.typeId) : undefined,
              dueDate: errors.dueDate ? t(errors.dueDate) : undefined,
            }}
          />

          {updateMutation.error ? (
            <Text variant="caption" tone="danger">
              {t(mapTaskError(updateMutation.error))}
            </Text>
          ) : null}

          <View
            style={{ marginTop: 12, paddingTop: 18, borderTopWidth: 1, borderTopColor: theme.line }}
          >
            <Button
              block
              label={updateMutation.isPending ? t("hw.edit.saving") : t("hw.edit.save")}
              tone="primary"
              disabled={!canSave}
              onPress={onSave}
            />
            <View className="mt-3">
              <Button
                block
                variant="soft"
                tone="danger"
                label={
                  deleteMutation.isPending ? t("hw.delete.deleting") : t("hw.delete.confirmOk")
                }
                disabled={deleteMutation.isPending || updateMutation.isPending}
                onPress={() => void onDelete()}
              />
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
