import { format } from "date-fns";
import { de as deLocale, enUS as enLocale } from "date-fns/locale";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, ScrollView, Switch, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ChildAvatar, Icon } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Text } from "@/design-system/ui";
import { useCurrentParent, useFamilyChildren } from "@/features/auth";
import { useDeleteEvent, useEvent, type EditScope } from "@/features/calendar";

import { pickScope } from "./scopeDialog";

function ReminderRow({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
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
  const { theme } = useTheme();
  const lang = i18n.language.startsWith("de") ? "de" : "en";
  const dateLocale = lang === "de" ? deLocale : enLocale;
  const [reminder24, setReminder24] = useState(true);
  const [reminder1, setReminder1] = useState(false);

  const { data, isLoading, error } = useEvent(id ?? "", occ);
  const parent = useCurrentParent();
  const familyChildren = useFamilyChildren(parent.data?.family_id);

  const deleteMutation = useDeleteEvent();

  const onEditPress = () => {
    if (!data) return;
    router.push({
      pathname: "/event/edit/[id]",
      params: { id: data.eventId, occ: data.occurrenceDate },
    });
  };

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
            deleteMutation.mutate(
              {
                scope,
                eventId: data.eventId,
                occurrenceDate: data.occurrenceDate,
                isRecurring,
                masterStartAt: data.startAt,
              },
              {
                onSuccess: () => router.back(),
                onError: (err) => {
                  const msg = err instanceof Error ? err.message : "";
                  Alert.alert(t("cal.delete.error"), msg);
                },
              },
            );
          })();
        },
      },
    ]);
  };

  return (
    <SafeAreaView edges={["bottom"]} className="flex-1 bg-card">
      <View className="items-center pb-1 pt-2.5">
        <View className="h-1 w-10 rounded-full" style={{ backgroundColor: theme.lineStrong }} />
      </View>

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
        <>
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 24 }}
          >
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
                  {format(data.startAt, "EEEE, d. MMMM", { locale: dateLocale })}
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
              {data.childId
                ? (() => {
                    const child = (familyChildren.data ?? []).find((c) => c.id === data.childId);
                    if (!child) return null;
                    return (
                      <View className="mt-1 flex-row items-center gap-2">
                        <ChildAvatar name={child.name} color={child.color} size="sm" />
                        <Text variant="caption" tone="inkSecondary">
                          {child.name}
                        </Text>
                      </View>
                    );
                  })()
                : null}
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
                value={reminder24}
                onValueChange={setReminder24}
              />
              <ReminderRow
                label={t("cal.detail.reminder1h")}
                value={reminder1}
                onValueChange={setReminder1}
              />
            </View>
          </ScrollView>

          <View className="flex-row gap-2.5 border-t border-line bg-card px-4 py-3">
            <Button
              label={deleteMutation.isPending ? t("cal.delete.deleting") : t("cal.detail.delete")}
              variant="soft"
              tone="danger"
              className="flex-1"
              disabled={deleteMutation.isPending}
              onPress={onDeletePress}
            />
            <Button
              label={t("cal.detail.edit")}
              tone="primary"
              className="flex-1"
              disabled={deleteMutation.isPending}
              onPress={onEditPress}
            />
          </View>
        </>
      )}
    </SafeAreaView>
  );
}
