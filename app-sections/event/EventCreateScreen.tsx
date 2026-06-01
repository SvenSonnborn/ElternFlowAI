import DateTimePicker from "@react-native-community/datetimepicker";
import { addMinutes, format, parseISO, set, startOfDay } from "date-fns";
import { de as deLocale, enUS as enLocale } from "date-fns/locale";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Platform, Pressable, ScrollView, Switch, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { Field, Icon } from "@/app-sections/shared";
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
  const { theme, nativeVars } = useTheme();
  const insets = useSafeAreaInsets();
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
    if (Platform.OS === "android") setPicker(null);
    if (event.type === "dismissed" || !selected) {
      if (Platform.OS === "ios") setPicker(null);
      return;
    }
    if (picker === "date") {
      setStartAt(mergeDateAndTime(selected, startAt));
      setEndAt(mergeDateAndTime(selected, endAt));
      if (Platform.OS === "ios") setPicker(null);
    } else if (picker === "startTime") {
      setStartAt(mergeDateAndTime(startAt, selected));
    } else if (picker === "endTime") {
      setEndAt(mergeDateAndTime(endAt, selected));
    }
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
    <SafeAreaView
      edges={["bottom"]}
      style={[{ flex: 1, backgroundColor: theme.card }, nativeVars]}
      className="flex-1 bg-card"
    >
      <Stack.Screen
        options={{
          contentStyle: { flex: 1, backgroundColor: theme.card },
        }}
      />
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
          <Text variant="h2">{t("cal.create.title")}</Text>
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

        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: allDay }}
          accessibilityLabel={t("cal.create.fieldAllDay")}
          onPress={() => setAllDay(!allDay)}
          className="flex-row items-center justify-between rounded-xl border px-3.5 active:opacity-70"
          style={{
            minHeight: 52,
            borderColor: allDay ? theme.primary : theme.line,
            backgroundColor: allDay ? theme.primarySoft : theme.card,
          }}
        >
          <View className="flex-row items-center gap-2.5">
            <Icon name="clock" size={18} color={allDay ? theme.primaryStrong : theme.inkTertiary} />
            <Text variant="body" tone={allDay ? "primaryStrong" : "ink"}>
              {t("cal.create.fieldAllDay")}
            </Text>
          </View>
          <Switch
            value={allDay}
            onValueChange={setAllDay}
            trackColor={{ false: theme.line, true: theme.primary }}
            ios_backgroundColor={theme.line}
            style={{ alignSelf: "center" }}
          />
        </Pressable>

        <View
          className="flex-row gap-3"
          pointerEvents={allDay ? "none" : "auto"}
          style={{ opacity: allDay ? 0.4 : 1 }}
        >
          <View className="flex-1">
            <Field
              label={t("cal.edit.fieldStart")}
              iconName="clock"
              value={allDay ? "—" : format(startAt, "HH:mm")}
              onPress={allDay ? undefined : () => setPicker("startTime")}
            />
          </View>
          <View className="flex-1">
            <Field
              label={t("cal.edit.fieldEnd")}
              iconName="clock"
              value={allDay ? "—" : format(endAt, "HH:mm")}
              onPress={allDay ? undefined : () => setPicker("endTime")}
              error={allDay ? undefined : timeError}
            />
          </View>
        </View>

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

        <View
          style={{
            marginTop: 12,
            paddingTop: 18,
            borderTopWidth: 1,
            borderTopColor: theme.line,
          }}
        >
          <Button
            block
            label={createMutation.isPending ? t("cal.create.saving") : t("cal.create.save")}
            tone="primary"
            disabled={!canSave}
            onPress={onSave}
          />
        </View>
      </ScrollView>

      {Platform.OS === "ios" ? (
        <Modal
          visible={picker !== null}
          transparent
          animationType="slide"
          onRequestClose={() => setPicker(null)}
        >
          <Pressable
            style={{ flex: 1, backgroundColor: theme.overlay, justifyContent: "flex-end" }}
            onPress={() => setPicker(null)}
          >
            <Pressable
              onPress={(e) => e.stopPropagation()}
              style={{
                backgroundColor: theme.card,
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                paddingHorizontal: 16,
                paddingTop: 12,
                paddingBottom: 16 + insets.bottom,
              }}
            >
              <View style={{ alignItems: "center", marginBottom: 8 }}>
                <View
                  style={{
                    width: 40,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: theme.lineStrong,
                  }}
                />
              </View>
              {picker ? (
                <DateTimePicker
                  value={picker === "date" ? startAt : picker === "startTime" ? startAt : endAt}
                  mode={picker === "date" ? "date" : "time"}
                  display={picker === "date" ? "inline" : "spinner"}
                  onChange={onPickerChange}
                  themeVariant={theme.card === "#FFFFFF" ? "light" : "dark"}
                />
              ) : null}
              <View style={{ marginTop: 8 }}>
                <Button
                  block
                  label={t("action.done")}
                  tone="primary"
                  onPress={() => setPicker(null)}
                />
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      ) : picker ? (
        <DateTimePicker
          value={picker === "date" ? startAt : picker === "startTime" ? startAt : endAt}
          mode={picker === "date" ? "date" : "time"}
          display="default"
          onChange={onPickerChange}
        />
      ) : null}
    </SafeAreaView>
  );
}
