import { router } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Field, Icon } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Text } from "@/design-system/ui";
import { useResetPassword } from "@/features/auth";

export function ResetPasswordScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const reset = useResetPassword();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  async function onSubmit() {
    if (!emailLooksValid || reset.isPending) return;
    try {
      await reset.mutateAsync({ email: email.trim() });
    } catch {
      /* enumeration-safe: ignore errors, always show success */
    }
    setSubmitted(true);
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} style={{ marginBottom: 16 }} hitSlop={10}>
          <Icon name="chevron-left" size={24} color={theme.ink} />
        </Pressable>
        <Text variant="h2" tone="ink">
          {t("auth.reset.title")}
        </Text>
        <Text variant="body" tone="inkSecondary" style={{ marginTop: 8 }}>
          {t("auth.reset.sub")}
        </Text>
        <View style={{ marginTop: 24 }}>
          <Field
            label={t("auth.email")}
            iconName="mail"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            placeholder="name@example.com"
          />
        </View>
        <Button
          label={t("auth.reset.submit")}
          tone="primary"
          variant="solid"
          size="lg"
          block
          loading={reset.isPending}
          onPress={() => {
            void onSubmit();
          }}
          disabled={!emailLooksValid || reset.isPending}
          className="mt-6"
        />
        {submitted ? (
          <View
            className="mt-4 rounded-xl border border-primary bg-primary-soft p-3"
            accessibilityRole="alert"
          >
            <Text variant="body" tone="primaryStrong">
              {t("auth.reset.success")}
            </Text>
          </View>
        ) : null}
        <Pressable
          onPress={() => router.replace("/(auth)/login")}
          style={{ marginTop: 24, alignSelf: "center" }}
          hitSlop={10}
        >
          <Text variant="caption" tone="primaryStrong">
            {t("auth.reset.backToLogin")}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
