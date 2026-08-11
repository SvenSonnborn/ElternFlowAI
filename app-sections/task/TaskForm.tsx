import { format, isValid } from "date-fns";
import { de as deLocale, enUS as enLocale } from "date-fns/locale";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import type { DateTimePickerMode, MemberOption, TypePickerItem } from "@/app-sections/shared";
import type { TaskFormState } from "@/features/tasks";

import { DateTimePickerSheet, Field, MemberPicker, TypePicker } from "@/app-sections/shared";
import { Text } from "@/design-system/ui";

/** Field errors as already-translated text — the screens own the t() call. */
export interface TaskFormErrorText {
  title?: string;
  typeId?: string;
  dueDate?: string;
}

interface TaskFormProps {
  state: TaskFormState;
  onChange: <K extends keyof TaskFormState>(key: K, value: TaskFormState[K]) => void;
  types: TypePickerItem[];
  /** Named `childOptions`, not `children` — that prop name belongs to React. */
  childOptions: MemberOption[];
  errors: TaskFormErrorText;
}

/**
 * Every field of a task, for both the create and the edit screen. Holds no
 * data state and calls no mutation; the only thing it owns is which picker is
 * currently open, which never leaves this file.
 */
export function TaskForm({ state, onChange, types, childOptions, errors }: TaskFormProps) {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language.startsWith("de") ? deLocale : enLocale;
  const [picker, setPicker] = useState<DateTimePickerMode | null>(null);

  // A row with an unparsable due_date must not reach format() — date-fns
  // throws on an Invalid Date, which would take the screen down before the
  // dueDate error could render.
  const dueDateValid = isValid(state.dueDate);
  const pickerBase = dueDateValid ? state.dueDate : new Date();
  const pickerValue = picker === "time" ? (state.dueTime ?? pickerBase) : pickerBase;

  return (
    <>
      <TypePicker
        label={t("hw.form.fieldType")}
        items={types}
        selectedId={state.typeId}
        onSelect={(id) => onChange("typeId", id)}
        error={errors.typeId}
      />

      <MemberPicker
        label={t("hw.form.fieldChild")}
        noMemberLabel={t("hw.form.noChild")}
        options={childOptions}
        selected={state.childId ? { id: state.childId, kind: "child" } : null}
        onSelect={(next) => onChange("childId", next?.id ?? null)}
      />

      <Field
        label={t("hw.form.fieldTitle")}
        value={state.title}
        onChangeText={(text) => onChange("title", text)}
        error={errors.title}
      />

      <Field
        label={t("hw.form.fieldSubject")}
        value={state.subject}
        onChangeText={(text) => onChange("subject", text)}
        placeholder="—"
      />

      <View className="flex-row gap-3">
        <View className="flex-1">
          <Field
            label={t("hw.form.fieldDue")}
            iconName="calendar"
            value={
              dueDateValid ? format(state.dueDate, "E, d. MMM yyyy", { locale: dateLocale }) : "—"
            }
            onPress={() => setPicker("date")}
            error={errors.dueDate}
          />
        </View>
        <View className="flex-1">
          <Field
            label={t("hw.form.fieldDueTime")}
            iconName="clock"
            value={state.dueTime ? format(state.dueTime, "HH:mm") : "—"}
            onPress={() => setPicker("time")}
          />
        </View>
      </View>

      {state.dueTime ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("hw.form.clearTime")}
          onPress={() => onChange("dueTime", null)}
          // Without this there is no way back to "no time" once one is set.
          className="h-11 justify-center self-start px-1 active:opacity-70"
        >
          <Text variant="caption" tone="primaryStrong">
            {t("hw.form.clearTime")}
          </Text>
        </Pressable>
      ) : null}

      <Field
        label={t("hw.form.fieldNotes")}
        value={state.notes}
        onChangeText={(text) => onChange("notes", text)}
        type="multiline"
        placeholder="—"
      />

      <DateTimePickerSheet
        mode={picker}
        value={pickerValue}
        onPick={(selected) => onChange(picker === "time" ? "dueTime" : "dueDate", selected)}
        onClose={() => setPicker(null)}
      />
    </>
  );
}
