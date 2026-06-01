import { router } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Field, Icon } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Text } from "@/design-system/ui";
import { mapAuthError, passwordStrength, useSignUp } from "@/features/auth";

function StrengthMeter({ score }: { score: number }) {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 4, marginTop: 6 }}>
      {[1, 2, 3, 4].map((bar) => (
        <View
          key={bar}
          style={{
            flex: 1,
            height: 4,
            borderRadius: 2,
            backgroundColor: score >= bar ? theme.primary : theme.line,
          }}
        />
      ))}
    </View>
  );
}

export function RegisterScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const signUp = useSignUp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);

  const strength = passwordStrength(password);
  const errorKey = signUp.error ? mapAuthError(signUp.error) : null;
  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSubmit = emailLooksValid && strength.acceptable && termsAccepted && !signUp.isPending;

  async function onSubmit() {
    if (!canSubmit) return;
    try {
      await signUp.mutateAsync({ email: email.trim(), password });
      router.replace({
        pathname: "/(auth)/check-email" as never,
        params: { email: email.trim() },
      });
    } catch {
      /* error rendered below */
    }
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled">
        <Pressable
          onPress={() => router.back()}
          style={{ marginBottom: 16 }}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t("action.back")}
        >
          <Icon name="chevron-left" size={24} color={theme.ink} />
        </Pressable>

        <Text variant="h2" tone="ink">
          {t("auth.register.title")}
        </Text>
        <Text variant="body" tone="inkSecondary" style={{ marginTop: 8 }}>
          {t("auth.register.sub")}
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
          <View>
            <Field
              label={t("auth.password")}
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
            {password.length > 0 ? (
              <View style={{ marginTop: 8 }}>
                <StrengthMeter score={strength.score} />
                <Text variant="caption" tone="inkSecondary" style={{ marginTop: 4 }}>
                  {t(`auth.passwordStrength.${strength.label}`)}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <Pressable
          onPress={() => setTermsAccepted((v) => !v)}
          style={{ flexDirection: "row", gap: 12, alignItems: "flex-start", marginTop: 20 }}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: termsAccepted }}
        >
          <View
            style={{
              width: 20,
              height: 20,
              borderRadius: 4,
              borderWidth: 2,
              borderColor: termsAccepted ? theme.primary : theme.line,
              backgroundColor: termsAccepted ? theme.primary : "transparent",
              alignItems: "center",
              justifyContent: "center",
              marginTop: 2,
            }}
          >
            {termsAccepted ? <Icon name="check" size={14} color={theme.onMint} /> : null}
          </View>
          <Text variant="body" tone="inkSecondary" style={{ flex: 1 }}>
            {t("auth.register.terms")}
          </Text>
        </Pressable>

        <Button
          label={t("auth.register.submit")}
          tone="primary"
          variant="solid"
          size="lg"
          block
          loading={signUp.isPending}
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
