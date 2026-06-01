import { router } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { Field } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Text } from "@/design-system/ui";
import {
  AVATAR_COLORS,
  clearPendingInviteToken,
  deriveShort,
  getPendingInviteToken,
  mapAuthError,
  useAcceptInvitation,
  useCreateFamily,
} from "@/features/auth";

import { OnboardingShell } from "./OnboardingShell";

export function Step2FamilyAndName() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const createFamily = useCreateFamily();
  const acceptInvitation = useAcceptInvitation();

  const [familyName, setFamilyName] = useState("");
  const [parentName, setParentName] = useState("");
  const [color, setColor] = useState<string>(AVATAR_COLORS[0]);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteChecked, setInviteChecked] = useState(false);

  useEffect(() => {
    void getPendingInviteToken().then((token) => {
      setInviteToken(token);
      setInviteChecked(true);
    });
  }, []);

  const isInvitePath = inviteToken !== null;
  const familyOk = isInvitePath || familyName.trim().length >= 2;
  const parentOk = parentName.trim().length >= 2;
  const pending = createFamily.isPending || acceptInvitation.isPending;
  const canSubmit = inviteChecked && familyOk && parentOk && !pending;
  const errorKey = createFamily.error
    ? mapAuthError(createFamily.error)
    : acceptInvitation.error
      ? mapAuthError(acceptInvitation.error)
      : null;

  async function onSubmit() {
    if (!canSubmit) return;
    const short = deriveShort(parentName);
    try {
      if (isInvitePath && inviteToken) {
        await acceptInvitation.mutateAsync({
          token: inviteToken,
          parentName: parentName.trim(),
          short,
          color,
        });
        await clearPendingInviteToken();
      } else {
        await createFamily.mutateAsync({
          familyName: familyName.trim(),
          parentName: parentName.trim(),
          short,
          color,
        });
      }
      router.push("/(onboarding)/3");
    } catch (err) {
      // If the user already belongs to a family (23505), the AuthGate would
      // route to /(tabs) on its next render anyway — make it explicit.
      if (mapAuthError(err) === "auth.error.alreadyInFamily") {
        router.replace("/(tabs)");
      }
    }
  }

  return (
    <OnboardingShell
      step={2}
      footer={
        <Button
          label={isInvitePath ? t("onb.s2.submitInvite") : t("onb.s2.submit")}
          tone="primary"
          variant="solid"
          size="lg"
          block
          loading={pending}
          onPress={() => {
            void onSubmit();
          }}
          disabled={!canSubmit}
        />
      }
    >
      <Text variant="h2" tone="ink" style={{ marginTop: 12 }}>
        {t("onb.s2.title")}
      </Text>
      <Text variant="body" tone="inkSecondary" style={{ marginTop: 8 }}>
        {t("onb.s2.sub")}
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

      <View style={{ gap: 16, marginTop: 24 }}>
        {!isInvitePath ? (
          <Field
            label={t("onb.s2.familyField")}
            iconName="users"
            value={familyName}
            onChangeText={setFamilyName}
            placeholder={t("onb.s2.familyPlaceholder")}
          />
        ) : null}
        <Field
          label={t("onb.s2.parentName.label")}
          iconName="user"
          value={parentName}
          onChangeText={setParentName}
          placeholder={t("onb.s2.parentName.placeholder")}
        />
        <View>
          <Text
            variant="caption"
            tone="inkSecondary"
            style={{ textTransform: "uppercase", fontWeight: "700", letterSpacing: 1.2 }}
          >
            {t("onb.s2.color.label")}
          </Text>
          <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
            {AVATAR_COLORS.map((c) => (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                hitSlop={4}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: c,
                  borderWidth: 3,
                  borderColor: color === c ? theme.ink : "transparent",
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: color === c }}
              />
            ))}
          </View>
        </View>
      </View>

      <View className="mt-6 rounded-2xl border border-line bg-card-subtle p-4">
        <Text variant="bodyEmph" tone="ink">
          {t("onb.s2.privacy.title")}
        </Text>
        <Text variant="caption" tone="inkSecondary" style={{ marginTop: 4 }}>
          {t("onb.s2.privacy.sub")}
        </Text>
      </View>
    </OnboardingShell>
  );
}
