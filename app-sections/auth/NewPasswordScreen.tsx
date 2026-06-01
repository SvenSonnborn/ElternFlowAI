import { router } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Field } from "@/app-sections/shared";
import { Button, Text } from "@/design-system/ui";
import { mapAuthError, passwordStrength, useSignOut, useUpdatePassword } from "@/features/auth";

export function NewPasswordScreen() {
  const { t } = useTranslation();
  const update = useUpdatePassword();
  const signOut = useSignOut();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const strength = passwordStrength(password);
  const matches = password.length > 0 && password === confirm;
  const errorKey = update.error ? mapAuthError(update.error) : null;
  const canSubmit = strength.acceptable && matches && !update.isPending && !signOut.isPending;

  async function onSubmit() {
    if (!canSubmit) return;
    try {
      await update.mutateAsync({ password });
      await signOut.mutateAsync();
      Alert.alert(t("auth.newPassword.saved"));
      router.replace("/(auth)/login" as never);
    } catch {
      /* error rendered below */
    }
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled">
        <Text variant="h2" tone="ink">
          {t("auth.newPassword.title")}
        </Text>
        <Text variant="body" tone="inkSecondary" style={{ marginTop: 8 }}>
          {t("auth.newPassword.sub")}
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
          <Field
            label={t("auth.newPassword.newField")}
            iconName="lock"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
          />
          <Field
            label={t("auth.newPassword.confirmField")}
            iconName="lock"
            value={confirm}
            onChangeText={setConfirm}
            placeholder="••••••••"
            error={confirm.length > 0 && !matches ? t("auth.newPassword.pwMismatch") : undefined}
          />
        </View>

        <Button
          label={t("auth.newPassword.save")}
          tone="primary"
          variant="solid"
          size="lg"
          block
          loading={update.isPending || signOut.isPending}
          onPress={() => {
            void onSubmit();
          }}
          disabled={!canSubmit}
          className="mt-6"
        />
      </ScrollView>
    </SafeAreaView>
  );
}
