import { format } from "date-fns";
import { de as deLocale, enUS as enLocale } from "date-fns/locale";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Field } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Text } from "@/design-system/ui";
import {
  applyRangePick,
  isDateRangeInvalid,
  isTimeRangeInvalid,
  useEvent,
  useUpdateEvent,
  type DateRange,
  type EditScope,
  type RangeField,
} from "@/features/calendar";

import { DateTimePickerSheet } from "./DateTimePickerSheet";
import { pickScope } from "./scopeDialog";

export function EventEditScreen() {
  const { id, occ } = useLocalSearchParams<{ id?: string; occ?: string }>();
  const { t, i18n } = useTranslation();
  const { theme, nativeVars } = useTheme();
  const lang = i18n.language.startsWith("de") ? "de" : "en";
  const dateLocale = lang === "de" ? deLocale : enLocale;

  const { data: occurrence, isLoading } = useEvent(id ?? "", occ);
  const updateMutation = useUpdateEvent();

  const initial = useMemo(() => {
    if (!occurrence) return null;
    return {
      title: occurrence.title,
      startAt: occurrence.startAt,
      endAt: occurrence.endAt,
      location: occurrence.location ?? "",
      notes: occurrence.description ?? "",
    };
  }, [occurrence]);

  const [title, setTitle] = useState("");
  const [range, setRange] = useState<DateRange>(() => ({ startAt: new Date(), endAt: new Date() }));
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [picker, setPicker] = useState<RangeField | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const { startAt, endAt } = range;

  if (initial && !hydrated) {
    setTitle(initial.title);
    setRange({ startAt: initial.startAt, endAt: initial.endAt });
    setLocation(initial.location);
    setNotes(initial.notes);
    setHydrated(true);
  }

  const titleError = !title.trim() ? t("cal.edit.error.titleRequired") : "";
  const dateError = isDateRangeInvalid(range) ? t("cal.edit.error.invalidDateRange") : "";
  const timeError =
    !dateError && isTimeRangeInvalid(range, false) ? t("cal.edit.error.invalidTimeRange") : "";
  const canSave = hydrated && !titleError && !dateError && !timeError && !updateMutation.isPending;

  async function onSave() {
    if (!occurrence || !canSave) return;
    const isRecurring = occurrence.isRecurring;
    let scope: EditScope = "all";
    if (isRecurring) {
      const labels = {
        title: t("cal.scope.title"),
        this: t("cal.scope.this"),
        forward: t("cal.scope.forward"),
        all: t("cal.scope.all"),
        cancel: t("action.cancel"),
      };
      const chosen = await pickScope(labels);
      if (!chosen) return;
      scope = chosen;
    }
    updateMutation.mutate(
      {
        scope,
        eventId: occurrence.eventId,
        occurrenceDate: occurrence.occurrenceDate,
        isRecurring,
        changes: {
          title: title.trim(),
          start_at: startAt.toISOString(),
          end_at: endAt.toISOString(),
          location: location.trim() || null,
          description: notes.trim() || null,
        },
      },
      {
        onSuccess: () => router.back(),
      },
    );
  }

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

      {isLoading ? (
        <View className="flex-1 items-center justify-center px-6">
          <View className="h-24 w-full rounded-2xl" style={{ backgroundColor: theme.cardSubtle }} />
        </View>
      ) : !occurrence ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text variant="listTitle" tone="danger">
            {t("cal.edit.title")}
          </Text>
          <View className="mt-4">
            <Button label={t("cal.detail.close")} variant="soft" onPress={() => router.back()} />
          </View>
        </View>
      ) : (
        <>
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
              <Text variant="h2">{t("cal.edit.title")}</Text>
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

            {updateMutation.error ? (
              <Text variant="caption" tone="danger">
                {t("cal.edit.error.network")}
                {": "}
                {updateMutation.error instanceof Error ? updateMutation.error.message : ""}
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
                label={updateMutation.isPending ? t("cal.edit.saving") : t("cal.edit.save")}
                tone="primary"
                disabled={!canSave}
                onPress={() => void onSave()}
              />
            </View>
          </ScrollView>

          <DateTimePickerSheet
            field={picker}
            range={range}
            onPick={(field, selected) => setRange((prev) => applyRangePick(prev, field, selected))}
            onClose={() => setPicker(null)}
          />
        </>
      )}
    </SafeAreaView>
  );
}
