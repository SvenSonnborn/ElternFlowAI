import { router, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { ChildAvatar, Field, Icon, Pill, TopBar } from "@/app-sections/shared";
import { palette } from "@/design-system";
import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Screen, Text } from "@/design-system/ui";
import { ALLERGY_KEYS } from "@/features/children";
import { children } from "@/features/sample-data";

export function ChildProfileScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const params = useLocalSearchParams<{ id?: string }>();

  const child = useMemo(() => children.find((c) => c.id === params.id), [params.id]);
  const isEdit = Boolean(child);
  const allergySuggestions = ALLERGY_KEYS.filter((key) => !child?.allergies.includes(key));

  const titleText =
    isEdit && child ? t("child.editTitle", { name: child.name }) : t("child.newTitle");
  const subText = isEdit && child ? t("child.editSub", { age: child.age }) : t("child.newSub");

  return (
    <Screen scroll>
      <TopBar
        title={titleText}
        sub={subText}
        leading={
          <Pressable
            onPress={() => router.back()}
            className="h-9 w-9 items-center justify-center rounded-xl border border-line bg-card active:opacity-70"
          >
            <Icon name="chevron-left" size={16} color={theme.inkSecondary} />
          </Pressable>
        }
        hideSettings
      />

      <View className="mb-5 items-center">
        <View>
          <ChildAvatar
            name={child?.name ?? "+"}
            color={child?.color ?? palette.avatar.peach}
            size="xl"
          />
          <View
            className="absolute -bottom-1 -right-1 h-7 w-7 items-center justify-center rounded-pill border-2 bg-primary"
            style={{ borderColor: theme.bg }}
          >
            <Icon name="edit" size={13} color="#FFFFFF" />
          </View>
        </View>
        <Text variant="caption" tone="inkSecondary" className="mt-2">
          {t("child.avatarHint")}
        </Text>
      </View>

      <View className="gap-3.5">
        <View className="flex-row gap-2.5">
          <View className="flex-1">
            <Field label={t("child.name")} value={child?.name ?? ""} />
          </View>
          <View style={{ width: 90 }}>
            <Field label={t("child.age")} value={child ? String(child.age) : ""} />
          </View>
        </View>

        <Field label={t("child.birthday")} iconName="cake" value={child?.birthday ?? ""} />
        <Field
          label={t("child.school")}
          iconName="school"
          value={child ? `${child.school} · ${child.grade}` : ""}
        />

        <View className="mt-2">
          <View className="mb-2 flex-row items-center justify-between">
            <Text
              variant="caption"
              tone="inkSecondary"
              style={{ textTransform: "uppercase", fontWeight: "700", letterSpacing: 1.2 }}
            >
              {t("child.allergies")}
            </Text>
            <Icon name="alert-triangle" size={14} color={theme.warning} />
          </View>
          <View className="flex-row flex-wrap gap-1.5">
            {child?.allergies.map((a) => (
              <Pill
                key={a}
                label={t(`onb.s4.allergies.${a}`)}
                tone="warn"
                leading={<Icon name="check" size={11} color={theme.accentStrong} />}
              />
            ))}
            {allergySuggestions.map((key) => (
              <Pill key={key} label={t(`onb.s4.allergies.${key}`)} tone="ink" />
            ))}
            <Pill
              label={t("child.addOther")}
              tone="ink"
              leading={<Icon name="plus" size={11} color={theme.inkSecondary} />}
            />
          </View>
        </View>

        <View>
          <Text
            variant="caption"
            tone="inkSecondary"
            className="mb-2"
            style={{ textTransform: "uppercase", fontWeight: "700", letterSpacing: 1.2 }}
          >
            {t("child.likes")}
          </Text>
          <View className="flex-row flex-wrap gap-1.5">
            {(child?.likes ?? []).map((like) => (
              <Pill
                key={like}
                label={like}
                tone="success"
                leading={<Icon name="heart" size={11} color={theme.success} />}
              />
            ))}
            <Pill
              label=""
              tone="ink"
              leading={<Icon name="plus" size={11} color={theme.inkSecondary} />}
            />
          </View>
        </View>

        <View>
          <Text
            variant="caption"
            tone="inkSecondary"
            className="mb-2"
            style={{ textTransform: "uppercase", fontWeight: "700", letterSpacing: 1.2 }}
          >
            {t("child.dislikes")}
          </Text>
          <View className="flex-row flex-wrap gap-1.5">
            {(child?.dislikes ?? []).map((d) => (
              <Pill key={d} label={d} tone="ink" />
            ))}
            <Pill
              label=""
              tone="ink"
              leading={<Icon name="plus" size={11} color={theme.inkSecondary} />}
            />
          </View>
        </View>

        <Button label={t("child.voiceAdd")} variant="soft" tone="accent" block className="mt-2" />
        <Button label={t("action.save")} tone="primary" block size="lg" />
      </View>
    </Screen>
  );
}
