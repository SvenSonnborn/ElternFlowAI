import { addMinutes, format, parseISO, set } from "date-fns";
import { de as deLocale, enUS as enLocale } from "date-fns/locale";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Switch, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Field, Icon } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Text } from "@/design-system/ui";
import { useCurrentParent, useFamilyChildren, useFamilyParents } from "@/features/auth";
import {
  applyRangePick,
  isDateRangeInvalid,
  isTimeRangeInvalid,
  toAllDayRange,
  useCreateEvent,
  useEventTypes,
  useFamilyEvents,
  type DateRange,
  type RangeField,
  type RecurrenceOption,
} from "@/features/calendar";

import { DateTimePickerSheet } from "./DateTimePickerSheet";
import { MemberPicker, type MemberOption, type SelectedMember } from "./MemberPicker";
import { RecurrenceRadio } from "./RecurrenceRadio";
import { TypePicker } from "./TypePicker";

function rangesOverlap(a1: Date, a2: Date, b1: Date, b2: Date): boolean {
  return a1.getTime() < b2.getTime() && b1.getTime() < a2.getTime();
}

function initialRange(paramDate: string | undefined): DateRange {
  const day = paramDate ? parseISO(paramDate) : new Date();
  const startAt = set(day, { hours: 9, minutes: 0, seconds: 0, milliseconds: 0 });
  return { startAt, endAt: addMinutes(startAt, 60) };
}

export function EventCreateScreen() {
  const { date: paramDate } = useLocalSearchParams<{ date?: string }>();
  const { t, i18n } = useTranslation();
  const { theme, nativeVars } = useTheme();
  const lang = i18n.language.startsWith("de") ? "de" : "en";
  const dateLocale = lang === "de" ? deLocale : enLocale;

  const parent = useCurrentParent();
  const familyId = parent.data?.family_id ?? null;
  const familyChildren = useFamilyChildren(familyId ?? undefined);
  const familyParents = useFamilyParents(familyId ?? undefined);
  const eventTypes = useEventTypes();
  const createMutation = useCreateEvent();

  const [title, setTitle] = useState("");
  const [range, setRange] = useState<DateRange>(() => initialRange(paramDate));
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [typeId, setTypeId] = useState<string | null>(null);
  const [member, setMember] = useState<SelectedMember | null>(null);
  const [recurrence, setRecurrence] = useState<RecurrenceOption>("none");
  const [picker, setPicker] = useState<RangeField | null>(null);
  const [typeHydrated, setTypeHydrated] = useState(false);
  const { startAt, endAt } = range;

  if (eventTypes.data && !typeHydrated) {
    const defaultType =
      eventTypes.data.find((tp) => tp.slug === "family") ?? eventTypes.data[0] ?? null;
    setTypeId(defaultType?.id ?? null);
    setTypeHydrated(true);
  }

  const occurrences = useFamilyEvents(startAt).data;
  const conflicts = useMemo(() => {
    const dateStr = format(startAt, "yyyy-MM-dd");
    const checked = allDay ? toAllDayRange({ startAt, endAt }) : { startAt, endAt };
    const samePerson = (o: { childId: string | null; parentId: string | null }) => {
      if (member === null) return true; // family-wide event conflicts with everything that day
      if (o.childId === null && o.parentId === null) return true; // existing family-wide conflicts with anyone
      if (member.kind === "child" && o.childId === member.id) return true;
      if (member.kind === "parent" && o.parentId === member.id) return true;
      return false;
    };
    return occurrences.filter(
      (o) =>
        o.occurrenceDate === dateStr &&
        samePerson(o) &&
        rangesOverlap(o.startAt, o.endAt, checked.startAt, checked.endAt),
    );
  }, [occurrences, startAt, endAt, member, allDay]);

  const titleError = !title.trim() ? t("cal.edit.error.titleRequired") : "";
  const dateError = isDateRangeInvalid(range) ? t("cal.edit.error.invalidDateRange") : "";
  const timeError =
    !dateError && isTimeRangeInvalid(range, allDay) ? t("cal.edit.error.invalidTimeRange") : "";
  const typeError = !typeId ? t("cal.create.error.typeRequired") : "";
  const canSave =
    !titleError &&
    !dateError &&
    !timeError &&
    !typeError &&
    !!familyId &&
    !createMutation.isPending;

  function onSave() {
    if (!canSave || !familyId || !typeId) return;
    const final = allDay ? toAllDayRange(range) : range;
    const childId = member?.kind === "child" ? member.id : null;
    const parentId = member?.kind === "parent" ? member.id : null;
    createMutation.mutate(
      {
        familyId,
        typeId,
        childId,
        parentId,
        title: title.trim(),
        startAt: final.startAt.toISOString(),
        endAt: final.endAt.toISOString(),
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

  const memberOptions: MemberOption[] = [
    ...(familyParents.data ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      kind: "parent" as const,
    })),
    ...(familyChildren.data ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      kind: "child" as const,
    })),
  ];

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

        <MemberPicker
          label={t("cal.create.fieldMember")}
          noMemberLabel={t("cal.create.noMember")}
          options={memberOptions}
          selected={member}
          onSelect={setMember}
        />

        <Field
          label={t("cal.edit.fieldTitle")}
          value={title}
          onChangeText={setTitle}
          error={titleError}
        />

        <View className="flex-row gap-3">
          <View className="flex-1">
            <Field
              label={t("cal.edit.fieldStartDate")}
              iconName="calendar"
              value={format(startAt, "E, d. MMM yyyy", { locale: dateLocale })}
              onPress={() => setPicker("startDate")}
            />
          </View>
          <View className="flex-1">
            <Field
              label={t("cal.edit.fieldEndDate")}
              iconName="calendar"
              value={format(endAt, "E, d. MMM yyyy", { locale: dateLocale })}
              onPress={() => setPicker("endDate")}
              error={dateError}
            />
          </View>
        </View>

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

      <DateTimePickerSheet
        field={picker}
        range={range}
        onPick={(field, selected) => setRange((prev) => applyRangePick(prev, field, selected))}
        onClose={() => setPicker(null)}
      />
    </SafeAreaView>
  );
}
