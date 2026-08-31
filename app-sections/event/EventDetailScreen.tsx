import { format, parseISO } from "date-fns";
import { de as deLocale, enUS as enLocale } from "date-fns/locale";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { Alert, Pressable, ScrollView, Switch, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { ChildAvatar, Icon, useUndoableDelete } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Text } from "@/design-system/ui";
import { useCurrentParent, useFamilyChildren, useFamilyParents } from "@/features/auth";
import {
  isMultiDay,
  REMINDER_OFFSET_1H,
  REMINDER_OFFSET_24H,
  useDeleteEvent,
  useEvent,
  useEventReminders,
  useToggleReminder,
  type EditScope,
} from "@/features/calendar";

import { pickScope } from "./scopeDialog";

function ReminderRow({
  label,
  value,
  disabled,
  onValueChange,
}: {
  label: string;
  value: boolean;
  disabled: boolean;
  onValueChange: (b: boolean) => void;
}) {
  const { theme } = useTheme();
  return (
    <View className="flex-row items-center justify-between border-b border-line py-3.5">
      <View className="flex-row items-center gap-2.5">
        <View
          className="h-8 w-8 items-center justify-center rounded-xl"
          style={{ backgroundColor: theme.primarySoft }}
        >
          <Icon name="bell" size={14} color={theme.primaryStrong} />
        </View>
        <Text variant="listTitle">{label}</Text>
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
        trackColor={{ false: theme.line, true: theme.primary }}
        thumbColor={theme.card}
      />
    </View>
  );
}

export function EventDetailScreen() {
  const { id, occ } = useLocalSearchParams<{ id?: string; occ?: string }>();
  const { t, i18n } = useTranslation();
  const { theme, nativeVars } = useTheme();
  const insets = useSafeAreaInsets();
  const lang = i18n.language.startsWith("de") ? "de" : "en";
  const dateLocale = lang === "de" ? deLocale : enLocale;

  const { data, isLoading, error } = useEvent(id ?? "", occ);
  const parent = useCurrentParent();
  const familyChildren = useFamilyChildren(parent.data?.family_id);
  const familyParents = useFamilyParents(parent.data?.family_id);

  const deleteMutation = useDeleteEvent();
  const undoableDelete = useUndoableDelete();
  const reminders = useEventReminders(id ?? "");
  const toggleReminder = useToggleReminder();
  const familyId = parent.data?.family_id ?? null;
  const reminderOffsets = reminders.data ?? [];
  // Until the row list has loaded there is nothing truthful to render, so the
  // switches stay off and locked rather than guessing a default. A failed read
  // is locked too: `isPending` is already false by then and the empty fallback
  // would otherwise claim every reminder is off.
  const remindersLocked =
    !familyId || !id || reminders.isPending || reminders.isError || toggleReminder.isPending;

  const onReminderToggle = (offsetMinutes: number) => (enabled: boolean) => {
    if (!familyId || !id) return;
    toggleReminder.mutate(
      { eventId: id, familyId, offsetMinutes, enabled },
      {
        onError: (err) => {
          Alert.alert(
            t("cal.detail.reminderError"),
            err instanceof Error ? err.message : undefined,
          );
        },
      },
    );
  };

  const onEditPress = () => {
    if (!data) return;
    router.push({
      pathname: "/event/edit/[id]",
      params: { id: data.eventId, occ: data.occurrenceDate },
    });
  };

  /**
   * Was der Toast unter dem Titel zeigt: der Termin-Titel, bei einer Serie mit
   * dem Umfang der Löschung. Ohne diese Angabe wäre der Toast Dekoration — bei
   * „ganze Serie" ist der Unterschied zu „nur dieser Termin" genau das, was der
   * Nutzer prüfen können muss, bevor das Fenster zugeht.
   */
  function undoMessage(title: string, scope: EditScope, occurrenceDate: string): string {
    if (scope === "all") return `${title} · ${t("cal.delete.undoScopeAll")}`;
    if (scope === "forward") {
      // Dasselbe Format wie die Datumszeile des Screens weiter unten.
      const date = format(parseISO(occurrenceDate), "d. MMM", { locale: dateLocale });
      return `${title} · ${t("cal.delete.undoScopeForward", { date })}`;
    }
    return title;
  }

  const onDeletePress = () => {
    if (!data) return;
    Alert.alert(t("cal.delete.confirmTitle"), t("cal.delete.confirmBody"), [
      { text: t("action.cancel"), style: "cancel" },
      {
        text: t("cal.delete.confirmOk"),
        style: "destructive",
        onPress: () => {
          void (async () => {
            const isRecurring = data.isRecurring;
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
            // Bei einem Einzeltermin ist `scope` immer "all" (der Dialog kommt
            // gar nicht) — dort trägt der Toast nur den Titel, kein Serien-
            // Zusatz, weil es keine Serie gibt.
            const message = isRecurring
              ? undoMessage(data.title, scope, data.occurrenceDate)
              : data.title;

            undoableDelete({
              kind: "event",
              target: {
                eventId: data.eventId,
                occurrenceDate: data.occurrenceDate,
                scope,
              },
              title: t("cal.delete.undoTitle"),
              message,
              run: () =>
                deleteMutation.mutateAsync({
                  scope,
                  eventId: data.eventId,
                  occurrenceDate: data.occurrenceDate,
                  isRecurring,
                }),
              errorTitle: t("cal.delete.error"),
              formatError: (err) => (err instanceof Error ? err.message : ""),
            });
            router.back();
          })();
        },
      },
    ]);
  };

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
      ) : error || !data ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text variant="listTitle" tone="danger" className="mb-2">
            {t("cal.detail.title")}
          </Text>
          <Text variant="caption" tone="inkSecondary">
            {error instanceof Error ? error.message : "—"}
          </Text>
          <View className="mt-4">
            <Button label={t("cal.detail.close")} variant="soft" onPress={() => router.back()} />
          </View>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1, backgroundColor: theme.card }}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 4,
            paddingBottom: 48 + insets.bottom,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="flex-row items-center justify-between pb-3 pt-4">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("cal.detail.close")}
              onPress={() => router.back()}
              className="px-2 py-1 active:opacity-70"
              hitSlop={12}
            >
              <Text variant="bodyEmph" tone="inkSecondary">
                {t("cal.detail.close")}
              </Text>
            </Pressable>
            <Text variant="caption" tone="inkTertiary">
              {t("cal.detail.title")}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("cal.detail.edit")}
              onPress={onEditPress}
              className="px-2 py-1 active:opacity-70"
              hitSlop={12}
            >
              <Text variant="bodyEmph" tone="primaryStrong">
                {t("cal.detail.edit")}
              </Text>
            </Pressable>
          </View>

          <View
            className="flex-row items-center gap-1.5 self-start rounded-pill px-2.5 py-1"
            style={{ backgroundColor: `${data.type.color}26` }}
          >
            <Icon name={data.type.iconName} size={11} color={data.type.color} />
            <Text variant="pill" style={{ color: data.type.color }}>
              {lang === "de" ? data.type.labelDe : data.type.labelEn}
            </Text>
          </View>
          <Text variant="h2" className="mt-2" numberOfLines={3}>
            {data.title}
          </Text>

          <View className="mt-3 gap-2">
            <View className="flex-row items-center gap-2">
              <Icon name="clock" size={14} color={theme.inkSecondary} />
              <Text variant="caption" tone="inkSecondary">
                {isMultiDay(data)
                  ? `${format(data.startAt, "E, d. MMM", { locale: dateLocale })} – ${format(data.endAt, "E, d. MMM", { locale: dateLocale })}`
                  : format(data.startAt, "EEEE, d. MMMM", { locale: dateLocale })}
                {" · "}
                {data.allDay
                  ? "—"
                  : `${format(data.startAt, "HH:mm")} – ${format(data.endAt, "HH:mm")}`}
              </Text>
            </View>
            {data.location ? (
              <View className="flex-row items-center gap-2">
                <Icon name="map-pin" size={14} color={theme.inkSecondary} />
                <Text variant="caption" tone="inkSecondary" numberOfLines={2}>
                  {data.location}
                </Text>
              </View>
            ) : null}
            {(() => {
              const person = data.childId
                ? (familyChildren.data ?? []).find((c) => c.id === data.childId)
                : data.parentId
                  ? (familyParents.data ?? []).find((p) => p.id === data.parentId)
                  : null;
              if (!person) return null;
              return (
                <View className="mt-1 flex-row items-center gap-2">
                  <ChildAvatar name={person.name} color={person.color} size="sm" />
                  <Text variant="caption" tone="inkSecondary">
                    {person.name}
                  </Text>
                </View>
              );
            })()}
          </View>

          <View className="mt-5">
            <Text variant="eyebrow" tone="inkSecondary" className="mb-1">
              {t("cal.detail.notes")}
            </Text>
            <Text variant="body" tone={data.description ? "ink" : "inkTertiary"}>
              {data.description ?? "—"}
            </Text>
          </View>

          <View className="mt-6">
            <ReminderRow
              label={t("cal.detail.reminder24h")}
              value={reminderOffsets.includes(REMINDER_OFFSET_24H)}
              disabled={remindersLocked}
              onValueChange={onReminderToggle(REMINDER_OFFSET_24H)}
            />
            <ReminderRow
              label={t("cal.detail.reminder1h")}
              value={reminderOffsets.includes(REMINDER_OFFSET_1H)}
              disabled={remindersLocked}
              onValueChange={onReminderToggle(REMINDER_OFFSET_1H)}
            />
            {reminders.isError ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("action.retry")}
                onPress={() => void reminders.refetch()}
                className="flex-row items-center justify-between py-3 active:opacity-70"
                hitSlop={8}
              >
                <Text variant="caption" tone="danger" className="flex-1">
                  {t("cal.detail.reminderError")}
                </Text>
                <Text variant="bodyEmph" tone="primaryStrong">
                  {t("action.retry")}
                </Text>
              </Pressable>
            ) : null}
          </View>

          <View className="mt-6">
            <Button
              label={t("cal.detail.delete")}
              variant="soft"
              tone="danger"
              block
              onPress={onDeletePress}
            />
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
