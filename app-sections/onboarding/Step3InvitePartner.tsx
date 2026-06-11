import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { Icon, type IconName } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Text } from "@/design-system/ui";
import { useCurrentParent, useInvitePartner } from "@/features/auth";

import { OnboardingShell } from "./OnboardingShell";

export function Step3InvitePartner() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const parent = useCurrentParent();
  const familyId = parent.data?.family_id;
  const invite = useInvitePartner(familyId);

  const { errorKey } = invite;

  async function onSend() {
    try {
      if (await invite.send()) router.push("/(onboarding)/4");
    } catch {
      /* error rendered below; Share.share rejects when the user dismisses,
         which we treat as a soft-skip — don't navigate. */
    }
  }

  function onLater() {
    router.push("/(onboarding)/4");
  }

  const shared: { icon: IconName; key: "calendar" | "tasks" | "meals" | "children" }[] = [
    { icon: "calendar", key: "calendar" },
    { icon: "check-square", key: "tasks" },
    { icon: "utensils", key: "meals" },
    { icon: "users", key: "children" },
  ];

  return (
    <OnboardingShell
      step={3}
      showSkip
      onSkip={onLater}
      footer={
        <View style={{ gap: 8 }}>
          <Button
            label={t("onb.s3.send")}
            tone="primary"
            variant="solid"
            size="lg"
            block
            loading={invite.isPending}
            onPress={() => {
              void onSend();
            }}
            disabled={!invite.canSend}
          />
          <Button
            label={t("onb.s3.later")}
            tone="neutral"
            variant="ghost"
            size="lg"
            block
            onPress={onLater}
          />
        </View>
      }
    >
      <Text variant="h2" tone="ink" style={{ marginTop: 12 }}>
        {t("onb.s3.title")}
      </Text>
      <Text variant="body" tone="inkSecondary" style={{ marginTop: 8 }}>
        {t("onb.s3.sub")}
      </Text>

      {errorKey ? (
        <View
          className="mt-4 rounded-xl border border-danger bg-danger-soft p-3"
          accessibilityRole="alert"
        >
          <Text variant="body" tone="danger">
            {t(errorKey)}
          </Text>
        </View>
      ) : null}

      <View className="mt-6 rounded-2xl border border-line bg-card p-4">
        {shared.map((s) => (
          <View
            key={s.key}
            style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 }}
          >
            <Icon name={s.icon} size={18} color={theme.primaryStrong} />
            <Text variant="body" tone="ink">
              {t(`onb.s3.shared.${s.key}`)}
            </Text>
          </View>
        ))}
      </View>
    </OnboardingShell>
  );
}
