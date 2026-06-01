import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, View } from "react-native";

import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Text } from "@/design-system/ui";
import {
  useCurrentParent,
  useFamily,
  useFamilyChildren,
  useFamilyParents,
  useFamilyPendingInvitations,
} from "@/features/auth";

import { OnboardingShell } from "./OnboardingShell";

export function Step5Done() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const parent = useCurrentParent();
  const familyId = parent.data?.family_id;
  const family = useFamily(familyId);
  const parents = useFamilyParents(familyId);
  const children = useFamilyChildren(familyId);
  const invitations = useFamilyPendingInvitations(familyId);

  const loading =
    parent.isLoading ||
    family.isLoading ||
    parents.isLoading ||
    children.isLoading ||
    invitations.isLoading;

  if (loading) {
    return (
      <OnboardingShell
        step={5}
        footer={
          <Button label={t("onb.s5.cta")} tone="primary" variant="solid" size="lg" block disabled />
        }
      >
        <View style={{ marginTop: 48, alignItems: "center" }}>
          <ActivityIndicator color={theme.primary} />
        </View>
      </OnboardingShell>
    );
  }

  const partner = (parents.data ?? []).find((p) => p.id !== parent.data?.id);
  const hasInvite = (invitations.data ?? []).length > 0;
  const childList = children.data ?? [];
  const showEmptyVariant = !partner && !hasInvite && childList.length === 0;

  return (
    <OnboardingShell
      step={5}
      footer={
        <View style={{ gap: 8 }}>
          <Button
            label={t("onb.s5.cta")}
            tone="primary"
            variant="solid"
            size="lg"
            block
            onPress={() => router.replace("/(tabs)")}
          />
          {!showEmptyVariant && childList.length > 0 ? (
            <Button
              label={t("onb.s5.secondary")}
              tone="neutral"
              variant="ghost"
              size="lg"
              block
              onPress={() => router.push("/(onboarding)/4" as never)}
            />
          ) : null}
        </View>
      }
    >
      <View style={{ alignItems: "center", marginTop: 12 }}>
        <View
          style={{
            width: 96,
            height: 96,
            borderRadius: 48,
            backgroundColor: theme.primary,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text variant="h1" tone="onMint">
            {t("onb.s5.checkmark")}
          </Text>
        </View>
        <Text variant="h2" tone="ink" style={{ marginTop: 16, textAlign: "center" }}>
          {t("onb.s5.title")}
        </Text>
        <Text variant="body" tone="inkSecondary" style={{ marginTop: 8, textAlign: "center" }}>
          {t("onb.s5.sub")}
        </Text>
      </View>

      {showEmptyVariant ? (
        <View className="mt-8 rounded-2xl border border-line bg-card p-4" accessibilityRole="text">
          <Text variant="bodyEmph" tone="ink">
            {t("onb.s5.empty.title")}
          </Text>
          <Text variant="body" tone="inkSecondary" style={{ marginTop: 6 }}>
            {t("onb.s5.empty.sub")}
          </Text>
        </View>
      ) : (
        <View style={{ marginTop: 32, gap: 16 }}>
          <View className="rounded-2xl border border-line bg-card p-4">
            <Text variant="caption" tone="inkSecondary" style={{ textTransform: "uppercase" }}>
              {t("onb.s5.recap.you")}
            </Text>
            <Text variant="bodyEmph" tone="ink" style={{ marginTop: 4 }}>
              {parent.data?.name}
            </Text>
          </View>
          <View className="rounded-2xl border border-line bg-card p-4">
            <Text variant="caption" tone="inkSecondary" style={{ textTransform: "uppercase" }}>
              {t("onb.s5.recap.partner")}
            </Text>
            <Text variant="bodyEmph" tone="ink" style={{ marginTop: 4 }}>
              {partner
                ? partner.name
                : hasInvite
                  ? t("onb.s5.recap.partnerPending")
                  : t("onb.s5.recap.partnerNone")}
            </Text>
          </View>
          <View className="rounded-2xl border border-line bg-card p-4">
            <Text variant="caption" tone="inkSecondary" style={{ textTransform: "uppercase" }}>
              {t("onb.s5.recap.children")}
            </Text>
            {childList.length > 0 ? (
              childList.map((c) => (
                <Text key={c.id} variant="bodyEmph" tone="ink" style={{ marginTop: 4 }}>
                  {c.name}
                  {c.allergies.length > 0 ? ` · ${c.allergies.join(", ")}` : ""}
                </Text>
              ))
            ) : (
              <Text variant="body" tone="inkSecondary" style={{ marginTop: 4 }}>
                {t("onb.s5.recap.childrenNone")}
              </Text>
            )}
          </View>
        </View>
      )}
    </OnboardingShell>
  );
}
