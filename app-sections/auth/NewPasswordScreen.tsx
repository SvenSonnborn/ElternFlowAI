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
  const errorKey = update.error
    ? mapAuthError(update.error)
    : signOut.error
      ? mapAuthError(signOut.error)
      : null;
  const canSubmit = strength.acceptable && matches && !update.isPending && !signOut.isPending;

  async function onSubmit() {
    if (!canSubmit) return;
    try {
      await update.mutateAsync({ password });
    } catch {
      return; // password update failed — banner renders, do not navigate
    }
    // Password was changed. Whether or not signOut succeeds, navigate to login —
    // staying on this screen with a recovery session would let the user back
    // into tabs without re-authenticating with the new password.
    try {
      await signOut.mutateAsync();
    } catch {
      /* signOut error surfaced via errorKey; still proceed to login */
    }
    Alert.alert(t("auth.newPassword.saved"));
    router.replace("/(auth)/login");
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
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            textContentType="newPassword"
          />
          <Field
            label={t("auth.newPassword.confirmField")}
            iconName="lock"
            value={confirm}
            onChangeText={setConfirm}
            placeholder="••••••••"
            error={confirm.length > 0 && !matches ? t("auth.newPassword.pwMismatch") : undefined}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            textContentType="newPassword"
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
