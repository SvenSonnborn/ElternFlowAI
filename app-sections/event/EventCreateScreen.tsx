import DateTimePicker from "@react-native-community/datetimepicker";
import { addMinutes, format, parseISO, set, startOfDay } from "date-fns";
import { de as deLocale, enUS as enLocale } from "date-fns/locale";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, ScrollView, Switch, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Field } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Text } from "@/design-system/ui";
import { useCurrentParent, useFamilyChildren } from "@/features/auth";
import {
  useCreateEvent,
  useEventTypes,
  useFamilyEvents,
  type RecurrenceOption,
} from "@/features/calendar";

import { ChildPicker } from "./ChildPicker";
import { RecurrenceRadio } from "./RecurrenceRadio";
import { TypePicker } from "./TypePicker";

function mergeDateAndTime(date: Date, time: Date): Date {
  return set(date, {
    hours: time.getHours(),
    minutes: time.getMinutes(),
    seconds: 0,
    milliseconds: 0,
  });
}

function rangesOverlap(a1: Date, a2: Date, b1: Date, b2: Date): boolean {
  return a1.getTime() < b2.getTime() && b1.getTime() < a2.getTime();
}

function initialStart(paramDate: string | undefined): Date {
  const day = paramDate ? parseISO(paramDate) : new Date();
  return set(day, { hours: 9, minutes: 0, seconds: 0, milliseconds: 0 });
}

export function EventCreateScreen() {
  const { date: paramDate } = useLocalSearchParams<{ date?: string }>();
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const lang = i18n.language.startsWith("de") ? "de" : "en";
  const dateLocale = lang === "de" ? deLocale : enLocale;

  const parent = useCurrentParent();
  const familyId = parent.data?.family_id ?? null;
  const familyChildren = useFamilyChildren(familyId ?? undefined);
  const eventTypes = useEventTypes();
  const createMutation = useCreateEvent();

  const [title, setTitle] = useState("");
  const [startAt, setStartAt] = useState<Date>(() => initialStart(paramDate));
  const [endAt, setEndAt] = useState<Date>(() => addMinutes(initialStart(paramDate), 60));
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [typeId, setTypeId] = useState<string | null>(null);
  const [childId, setChildId] = useState<string | null>(null);
  const [recurrence, setRecurrence] = useState<RecurrenceOption>("none");
  const [picker, setPicker] = useState<"date" | "startTime" | "endTime" | null>(null);
  const [typeHydrated, setTypeHydrated] = useState(false);

  if (eventTypes.data && !typeHydrated) {
    const defaultType =
      eventTypes.data.find((tp) => tp.slug === "family") ?? eventTypes.data[0] ?? null;
    setTypeId(defaultType?.id ?? null);
    setTypeHydrated(true);
  }

  const occurrences = useFamilyEvents(startAt).data;
  const conflicts = useMemo(() => {
    const dateStr = format(startAt, "yyyy-MM-dd");
    const checkStart = allDay ? startOfDay(startAt) : startAt;
    const checkEnd = allDay ? set(startAt, { hours: 23, minutes: 59 }) : endAt;
    return occurrences.filter(
      (o) =>
        o.occurrenceDate === dateStr &&
        (childId === null || o.childId === null || o.childId === childId) &&
        rangesOverlap(o.startAt, o.endAt, checkStart, checkEnd),
    );
  }, [occurrences, startAt, endAt, childId, allDay]);

  const titleError = !title.trim() ? t("cal.edit.error.titleRequired") : "";
  const timeError =
    !allDay && endAt.getTime() <= startAt.getTime() ? t("cal.edit.error.invalidTimeRange") : "";
  const typeError = !typeId ? t("cal.create.error.typeRequired") : "";
  const canSave =
    !titleError && !timeError && !typeError && !!familyId && !createMutation.isPending;

  const onPickerChange = (event: { type: string }, selected?: Date) => {
    if (Platform.OS !== "ios") setPicker(null);
    if (event.type === "dismissed" || !selected) return;
    if (picker === "date") {
      setStartAt(mergeDateAndTime(selected, startAt));
      setEndAt(mergeDateAndTime(selected, endAt));
    } else if (picker === "startTime") {
      setStartAt(mergeDateAndTime(startAt, selected));
    } else if (picker === "endTime") {
      setEndAt(mergeDateAndTime(endAt, selected));
    }
    if (Platform.OS === "ios") setPicker(null);
  };

  function onSave() {
    if (!canSave || !familyId || !typeId) return;
    const finalStart = allDay
      ? set(startAt, { hours: 0, minutes: 0, seconds: 0, milliseconds: 0 })
      : startAt;
    const finalEnd = allDay ? set(startAt, { hours: 23, minutes: 59, seconds: 0 }) : endAt;
    createMutation.mutate(
      {
        familyId,
        typeId,
        childId,
        title: title.trim(),
        startAt: finalStart.toISOString(),
        endAt: finalEnd.toISOString(),
        allDay,
        location: location.trim() || null,
        description: notes.trim() || null,
        recurrence,
        createdBy: parent.data?.id ?? null,
      },
      {
        onSuccess: () => router.back(),
      },
    );
  }

  const childOptions =
    familyChildren.data?.map((c) => ({ id: c.id, name: c.name, color: c.color })) ?? [];

  return (
    <SafeAreaView edges={["bottom"]} className="flex-1 bg-card">
      <View className="items-center pb-1 pt-2.5">
        <View className="h-1 w-10 rounded-full" style={{ backgroundColor: theme.lineStrong }} />
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 14,
          paddingBottom: 24,
          gap: 14,
        }}
      >
        <Text variant="h2">{t("cal.create.title")}</Text>

        <TypePicker
          label={t("cal.create.fieldType")}
          types={eventTypes.data ?? []}
          selectedTypeId={typeId}
          onSelect={setTypeId}
          error={typeError}
        />

        <ChildPicker
          label={t("cal.create.fieldChild")}
          noChildLabel={t("cal.create.noChild")}
          options={childOptions}
          selectedChildId={childId}
          onSelect={setChildId}
        />

        <Field
          label={t("cal.edit.fieldTitle")}
          value={title}
          onChangeText={setTitle}
          error={titleError}
        />

        <Field
          label={t("cal.edit.fieldDate")}
          iconName="calendar"
          value={format(startAt, "EEEE, d. MMMM yyyy", { locale: dateLocale })}
          onPress={() => setPicker("date")}
        />

        <View
          className="flex-row items-center justify-between rounded-xl border bg-card px-3.5 py-2.5"
          style={{ borderColor: theme.line }}
        >
          <Text variant="body" tone="ink">
            {t("cal.create.fieldAllDay")}
          </Text>
          <Switch
            value={allDay}
            onValueChange={setAllDay}
            trackColor={{ false: theme.line, true: theme.primary }}
            thumbColor={theme.card}
          />
        </View>

        {!allDay ? (
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field
                label={t("cal.edit.fieldStart")}
                iconName="clock"
                value={format(startAt, "HH:mm")}
                onPress={() => setPicker("startTime")}
              />
            </View>
            <View className="flex-1">
              <Field
                label={t("cal.edit.fieldEnd")}
                iconName="clock"
                value={format(endAt, "HH:mm")}
                onPress={() => setPicker("endTime")}
                error={timeError}
              />
            </View>
          </View>
        ) : null}

        {conflicts.length > 0 ? (
          <View className="rounded-xl bg-warning-soft px-3 py-2">
            <Text variant="caption" tone="accentStrong">
              {t("cal.create.conflict", {
                count: conflicts.length,
                title: conflicts[0].title,
                from: format(conflicts[0].startAt, "HH:mm"),
                to: format(conflicts[0].endAt, "HH:mm"),
              })}
            </Text>
          </View>
        ) : null}

        <Field
          label={t("cal.edit.fieldLocation")}
          iconName="map-pin"
          value={location}
          onChangeText={setLocation}
          placeholder="—"
        />

        <Field
          label={t("cal.edit.fieldNotes")}
          value={notes}
          onChangeText={setNotes}
          type="multiline"
          placeholder="—"
        />

        <RecurrenceRadio
          label={t("cal.create.fieldRecurrence")}
          value={recurrence}
          onChange={setRecurrence}
        />

        {!familyId ? (
          <Text variant="caption" tone="danger">
            {t("cal.create.error.noFamily")}
          </Text>
        ) : null}

        {createMutation.error ? (
          <Text variant="caption" tone="danger">
            {t("cal.edit.error.network")}
            {": "}
            {createMutation.error instanceof Error ? createMutation.error.message : ""}
          </Text>
        ) : null}
      </ScrollView>

      {picker ? (
        <DateTimePicker
          value={picker === "date" ? startAt : picker === "startTime" ? startAt : endAt}
          mode={picker === "date" ? "date" : "time"}
          onChange={onPickerChange}
          display={Platform.OS === "ios" ? "spinner" : "default"}
        />
      ) : null}

      <View className="flex-row gap-2.5 border-t border-line bg-card px-4 py-3">
        <Button
          label={t("action.cancel")}
          variant="soft"
          tone="neutral"
          className="flex-1"
          onPress={() => router.back()}
        />
        <Button
          label={createMutation.isPending ? t("cal.create.saving") : t("cal.create.save")}
          tone="primary"
          className="flex-1"
          disabled={!canSave}
          onPress={onSave}
        />
      </View>
    </SafeAreaView>
  );
}
