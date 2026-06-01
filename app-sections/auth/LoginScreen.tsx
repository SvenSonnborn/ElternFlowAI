import { Link, router } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Field } from "@/app-sections/shared";
import { Button, Text } from "@/design-system/ui";
import { mapAuthError, useSignIn } from "@/features/auth";

export function LoginScreen() {
  const { t } = useTranslation();
  const signIn = useSignIn();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const errorKey = signIn.error ? mapAuthError(signIn.error) : null;
  const canSubmit = email.trim().length > 0 && password.length > 0 && !signIn.isPending;

  async function onSubmit() {
    if (!canSubmit) return;
    try {
      await signIn.mutateAsync({ email: email.trim(), password });
      // AuthGate routes based on parent presence.
    } catch {
      // error rendered via signIn.error → errorKey
    }
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: 24, justifyContent: "center" }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ alignItems: "center", marginBottom: 32 }}>
          <Text variant="h1" tone="ink">
            {t("app.name")}
          </Text>
          <Text variant="body" tone="inkSecondary" style={{ marginTop: 8, textAlign: "center" }}>
            {t("auth.tagline")}
          </Text>
        </View>

        {errorKey ? (
          <View
            className="mb-4 rounded-xl border border-danger bg-danger-soft p-3"
            accessibilityRole="alert"
          >
            <Text variant="bodyEmph" tone="danger">
              {t("auth.error.title")}
            </Text>
            <Text variant="body" tone="danger">
              {t(errorKey)}
            </Text>
          </View>
        ) : null}

        <View style={{ gap: 16 }}>
          <Field
            label={t("auth.email")}
            iconName="mail"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            placeholder="name@example.com"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
          />
          <Field
            label={t("auth.password")}
            iconName="lock"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="current-password"
            textContentType="password"
          />
        </View>

        <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 12 }}>
          <Link href={"/(auth)/reset-password"} asChild>
            <Pressable hitSlop={10}>
              <Text variant="caption" tone="primaryStrong">
                {t("auth.forgot")}
              </Text>
            </Pressable>
          </Link>
        </View>

        <Button
          label={signIn.isPending ? "…" : t("auth.signIn")}
          tone="primary"
          variant="solid"
          size="lg"
          block
          loading={signIn.isPending}
          onPress={() => {
            void onSubmit();
          }}
          disabled={!canSubmit}
          className="mt-6"
        />

        <View className="my-6 flex-row items-center gap-3">
          <View className="h-px flex-1 bg-line" />
          <Text variant="caption" tone="inkTertiary">
            {t("auth.or")}
          </Text>
          <View className="h-px flex-1 bg-line" />
        </View>

        <View style={{ gap: 12 }}>
          <Button
            label={`${t("auth.google")} (${t("auth.soon")})`}
            tone="neutral"
            variant="soft"
            size="lg"
            block
            disabled
          />
          <Button
            label={`${t("auth.apple")} (${t("auth.soon")})`}
            tone="neutral"
            variant="soft"
            size="lg"
            block
            disabled
          />
        </View>

        <Pressable
          onPress={() => router.push("/(auth)/register")}
          style={{ flexDirection: "row", justifyContent: "center", marginTop: 24, gap: 4 }}
          hitSlop={10}
        >
          <Text variant="body" tone="inkSecondary">
            {t("auth.newHere")}
          </Text>
          <Text variant="bodyEmph" tone="primaryStrong">
            {t("auth.signUp")}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
