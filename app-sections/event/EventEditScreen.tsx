import { format } from "date-fns";
import { de as deLocale, enUS as enLocale } from "date-fns/locale";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { DateTimePickerSheet, Field } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Text } from "@/design-system/ui";
import {
  applyRangePick,
  isDateRangeInvalid,
  isTimeRangeInvalid,
  parseRecurrenceCount,
  toAllDayRange,
  recurrenceToRrule,
  rruleToRecurrence,
  useEvent,
  useUpdateEvent,
  type DateRange,
  type EditScope,
  type RangeField,
  type RecurrenceChanges,
  type RecurrenceOption,
} from "@/features/calendar";

import { RecurrenceCountField } from "./RecurrenceCountField";
import { RecurrenceRadio } from "./RecurrenceRadio";
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
    // The weekday check in `rruleToRecurrence` runs against this occurrence's
    // start rather than the master's dtstart — equivalent here, because a
    // byweekday rule only ever yields occurrences on the days it names.
    const rrule = occurrence.rrule;
    return {
      title: occurrence.title,
      startAt: occurrence.startAt,
      endAt: occurrence.endAt,
      location: occurrence.location ?? "",
      notes: occurrence.description ?? "",
      recurrence: rruleToRecurrence(
        {
          rrule_freq: rrule.freq,
          rrule_interval: rrule.interval,
          rrule_byweekday: rrule.byweekday,
        },
        occurrence.startAt,
      ),
      countText: rrule.count == null ? "" : String(rrule.count),
    };
  }, [occurrence]);

  const [title, setTitle] = useState("");
  const [range, setRange] = useState<DateRange>(() => ({ startAt: new Date(), endAt: new Date() }));
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [recurrence, setRecurrence] = useState<RecurrenceOption>("none");
  const [countText, setCountText] = useState("");
  const [picker, setPicker] = useState<RangeField | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const { startAt, endAt } = range;

  if (initial && !hydrated) {
    setTitle(initial.title);
    setRange({ startAt: initial.startAt, endAt: initial.endAt });
    setLocation(initial.location);
    setNotes(initial.notes);
    setRecurrence(initial.recurrence ?? "none");
    setCountText(initial.countText);
    setHydrated(true);
  }

  // `null` means the stored rule is outside the five V1 options (yearly, every
  // n-th week, an arbitrary weekday set). Showing the radio would rewrite it on
  // save, so the editor stays hidden and the rule is left alone.
  const recurrenceEditable = initial?.recurrence != null;
  const recurrenceDirty =
    recurrenceEditable &&
    (recurrence !== initial.recurrence ||
      (recurrence !== "none" && countText.trim() !== initial.countText));

  // All-day is not editable here (the create form owns that switch), but it must
  // still be respected: an all-day event carries synthetic 00:00/23:59 times, so
  // editing them freely would desync `start_at`/`end_at` from `all_day`.
  const allDay = occurrence?.allDay ?? false;

  const titleError = !title.trim() ? t("cal.edit.error.titleRequired") : "";
  const dateError = isDateRangeInvalid(range) ? t("cal.edit.error.invalidDateRange") : "";
  const timeError =
    !dateError && isTimeRangeInvalid(range, allDay) ? t("cal.edit.error.invalidTimeRange") : "";
  const parsedCount = recurrence === "none" ? null : parseRecurrenceCount(countText);
  const countError = parsedCount === "invalid" ? t("cal.create.error.invalidCount") : "";
  const canSave =
    hydrated && !titleError && !dateError && !timeError && !countError && !updateMutation.isPending;

  /**
   * The series rule, rebuilt from the radio. `null` when the user left the
   * recurrence untouched — the update then keeps the stored rule verbatim.
   */
  function buildRecurrenceChanges(): RecurrenceChanges | null {
    if (!recurrenceDirty || parsedCount === "invalid") return null;
    if (recurrence === "none") {
      return {
        rrule_freq: null,
        rrule_interval: 1,
        rrule_byweekday: null,
        rrule_count: null,
        rrule_until: null,
      };
    }
    const rule = recurrenceToRrule(recurrence, startAt);
    return {
      ...rule,
      rrule_count: parsedCount,
      // COUNT and UNTIL are mutually exclusive (`events_rrule_count_xor_until`).
      // A stored UNTIL — e.g. from an earlier forward-delete — survives only as
      // long as no count replaces it.
      rrule_until: parsedCount == null ? (occurrence?.rrule.until ?? null) : null,
    };
  }

  async function onSave() {
    if (!occurrence || !canSave) return;
    const isRecurring = occurrence.isRecurring;
    const recurrenceChanges = buildRecurrenceChanges();
    let scope: EditScope = "all";
    // A rule change redefines the series, so there is nothing to scope: asking
    // "just this one?" about a new repeat pattern has no coherent answer.
    if (isRecurring && !recurrenceChanges) {
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
    // Re-snap rather than trust the state: the date pickers can move an all-day
    // event across days, and its times must stay 00:00 → 23:59.
    const final = allDay ? toAllDayRange(range) : range;
    updateMutation.mutate(
      {
        scope,
        eventId: occurrence.eventId,
        occurrenceDate: occurrence.occurrenceDate,
        isRecurring,
        changes: {
          title: title.trim(),
          start_at: final.startAt.toISOString(),
          end_at: final.endAt.toISOString(),
          location: location.trim() || null,
          description: notes.trim() || null,
        },
        recurrence: recurrenceChanges,
      },
      {
        onSuccess: () => router.back(),
      },
    );
  }

  // The sheet is range-agnostic now: which end of the range is being edited is
  // calendar knowledge and stays here.
  const pickerMode = picker === null ? null : picker.endsWith("Date") ? "date" : "time";
  const pickerValue = picker === "endDate" || picker === "endTime" ? endAt : startAt;

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

            {recurrenceEditable ? (
              <>
                <RecurrenceRadio
                  label={t("cal.create.fieldRecurrence")}
                  value={recurrence}
                  onChange={setRecurrence}
                />

                {recurrence !== "none" ? (
                  <RecurrenceCountField
                    value={countText}
                    onChangeText={setCountText}
                    error={countError}
                  />
                ) : null}

                {recurrenceDirty ? (
                  <View className="rounded-xl bg-warning-soft px-3 py-2">
                    <Text variant="caption" tone="accentStrong">
                      {t("cal.edit.recurrenceAppliesToAll")}
                    </Text>
                  </View>
                ) : null}
              </>
            ) : null}

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
            mode={pickerMode}
            value={pickerValue}
            onPick={(selected) => {
              if (picker) setRange((prev) => applyRangePick(prev, picker, selected));
            }}
            onClose={() => setPicker(null)}
          />
        </>
      )}
    </SafeAreaView>
  );
}
