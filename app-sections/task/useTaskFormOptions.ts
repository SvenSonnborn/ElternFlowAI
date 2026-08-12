import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { MemberOption, TypePickerItem } from "@/app-sections/shared";
import type { ChildRow } from "@/features/auth";
import type { TaskTypeRow } from "@/features/tasks";

import { useTheme } from "@/design-system/ThemeProvider";
import { taskTypeColorFor, taskTypeLabelKey } from "@/features/tasks";

interface UseTaskFormOptionsResult {
  typeItems: TypePickerItem[];
  childOptions: MemberOption[];
}

/**
 * Maps the raw `task_types` lookup and the family's children into the shapes
 * `TaskForm`'s pickers need: slug→i18n-key and colour-role→hex resolution for
 * types, and the `kind: "child"` tagging `MemberPicker` requires.
 *
 * Was a byte-identical pair of memos in both TaskCreateScreen and
 * TaskEditScreen — pulled out here so the mapping only drifts once. Takes the
 * raw rows rather than owning the queries itself: `TaskCreateScreen` still
 * needs the raw `types.data` for its default-type hydration (the slug isn't
 * carried on `TypePickerItem`), so both screens keep calling `useTaskTypes()`
 * and `useFamilyChildren()` themselves.
 */
export function useTaskFormOptions(
  types: TaskTypeRow[] | undefined,
  children: ChildRow[] | undefined,
): UseTaskFormOptionsResult {
  const { t } = useTranslation();
  const { theme } = useTheme();

  const typeItems: TypePickerItem[] = useMemo(
    () =>
      (types ?? []).map((type) => ({
        id: type.id,
        label: t(taskTypeLabelKey(type.slug), { defaultValue: type.slug }),
        color: taskTypeColorFor(type.color, theme),
      })),
    [types, t, theme],
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

  return { typeItems, childOptions };
}
