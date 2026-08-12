import { router, Stack } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { TaskFormState } from "@/features/tasks";

import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Card, Text } from "@/design-system/ui";
import { useCurrentParent, useFamilyChildren } from "@/features/auth";
import {
  emptyTaskForm,
  hasTaskFormErrors,
  mapTaskError,
  toCreateVars,
  useCreateTask,
  useTaskTypes,
  validateTaskForm,
} from "@/features/tasks";

import { TaskForm } from "./TaskForm";
import { useTaskFormOptions } from "./useTaskFormOptions";

export function TaskCreateScreen() {
  const { t } = useTranslation();
  const { theme, nativeVars } = useTheme();

  const types = useTaskTypes();
  const { data: parent } = useCurrentParent();
  const { data: children } = useFamilyChildren(parent?.family_id);
  const createMutation = useCreateTask();

  const [state, setState] = useState<TaskFormState>(() => emptyTaskForm(new Date()));
  const [typeHydrated, setTypeHydrated] = useState(false);

  // Render-phase hydration, same as EventCreateScreen: the default type is
  // only knowable once the lookup has loaded, and an effect would render one
  // frame with nothing selected.
  if (types.data && !typeHydrated) {
    const preferred = types.data.find((type) => type.slug === "hausaufgaben") ?? types.data[0];
    setState((prev) => ({ ...prev, typeId: preferred?.id ?? null }));
    setTypeHydrated(true);
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

  const { typeItems, childOptions } = useTaskFormOptions(types.data, children);

  // Suppressed while the type lookup is still in flight: `typeId` is null at
  // that point too, but the user hasn't had a chance to pick anything yet —
  // showing "please pick a type" here would accuse them before the picker
  // even has options.
  const errors = validateTaskForm(state);
  const showTypeError = !types.isLoading;
  const canSave = !hasTaskFormErrors(errors) && !createMutation.isPending;

  // No history to fall back to on a cold-start deep link straight to
  // `/task/new` — `router.back()` alone would strand the sheet with no way
  // out.
  function goBackOrToTasks() {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/aufgaben");
  }

  function onSave() {
    const vars = toCreateVars(state);
    if (!vars || createMutation.isPending) return;
    createMutation.mutate(vars, { onSuccess: goBackOrToTasks });
  }

  return (
    <SafeAreaView
      edges={["bottom"]}
      style={[{ flex: 1, backgroundColor: theme.card }, nativeVars]}
      className="flex-1 bg-card"
    >
      <Stack.Screen options={{ contentStyle: { flex: 1, backgroundColor: theme.card } }} />

      {types.isLoading ? (
        <View className="flex-1 items-center justify-center px-6">
          <View className="h-24 w-full rounded-2xl" style={{ backgroundColor: theme.cardSubtle }} />
        </View>
      ) : types.error ? (
        // Without this branch a failed type lookup leaves `typeItems` empty
        // and `typeId` null forever — `canSave` stays false with no
        // explanation and no way for the user to recover but a hard reload.
        <View className="flex-1 items-center justify-center px-6">
          <Card className="w-full items-start gap-2">
            <Text variant="bodyEmph">{t("hw.loadError")}</Text>
            <Text variant="caption" tone="inkSecondary">
              {t(mapTaskError(types.error))}
            </Text>
            {/* Default size (md, h-11) on purpose — `sm` is h-9 and would fall
                below the 44×44 touch target. */}
            <Button label={t("action.retry")} variant="soft" onPress={() => void types.refetch()} />
          </Card>
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
            <Text variant="h2">{t("hw.create.title")}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("action.cancel")}
              onPress={goBackOrToTasks}
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
              typeId: showTypeError && errors.typeId ? t(errors.typeId) : undefined,
              dueDate: errors.dueDate ? t(errors.dueDate) : undefined,
            }}
          />

          {createMutation.error ? (
            <Text variant="caption" tone="danger">
              {t(mapTaskError(createMutation.error))}
            </Text>
          ) : null}

          <View
            style={{ marginTop: 12, paddingTop: 18, borderTopWidth: 1, borderTopColor: theme.line }}
          >
            <Button
              block
              label={createMutation.isPending ? t("hw.create.saving") : t("hw.create.save")}
              tone="primary"
              disabled={!canSave}
              onPress={onSave}
            />
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
