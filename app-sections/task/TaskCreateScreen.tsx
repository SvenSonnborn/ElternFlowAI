import { router, Stack } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { TaskFormState } from "@/features/tasks";

import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Text } from "@/design-system/ui";
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

  const errors = validateTaskForm(state);
  const canSave = !hasTaskFormErrors(errors) && !createMutation.isPending;

  function onSave() {
    const vars = toCreateVars(state);
    if (!vars || createMutation.isPending) return;
    createMutation.mutate(vars, { onSuccess: () => router.back() });
  }

  return (
    <SafeAreaView
      edges={["bottom"]}
      style={[{ flex: 1, backgroundColor: theme.card }, nativeVars]}
      className="flex-1 bg-card"
    >
      <Stack.Screen options={{ contentStyle: { flex: 1, backgroundColor: theme.card } }} />
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
    </SafeAreaView>
  );
}
