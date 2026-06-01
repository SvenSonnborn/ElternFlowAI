import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Icon } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Text } from "@/design-system/ui";
import { supabase } from "@/features/supabase";

export function CheckEmailScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const params = useLocalSearchParams<{ email?: string }>();
  const email = params.email ?? "";
  const [resent, setResent] = useState(false);
  const [pending, setPending] = useState(false);

  async function onResend() {
    if (!email || pending) return;
    setPending(true);
    try {
      // Supabase's dedicated resend endpoint — does NOT require the password.
      await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: "elternflow://auth/confirm" },
      });
    } catch {
      /* swallowed — resend is best-effort UX */
    }
    setResent(true);
    setPending(false);
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 24, flexGrow: 1, justifyContent: "center" }}>
        <View style={{ alignItems: "center", marginBottom: 32 }}>
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: theme.primarySoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="mail" size={36} color={theme.primaryStrong} />
          </View>
        </View>

        <Text variant="h2" tone="ink" style={{ textAlign: "center" }}>
          {t("auth.checkEmail.title")}
        </Text>
        <Text variant="body" tone="inkSecondary" style={{ textAlign: "center", marginTop: 12 }}>
          {t("auth.checkEmail.sub", { email })}
        </Text>

        <Button
          label={resent ? t("auth.checkEmail.title") : t("auth.checkEmail.resend")}
          tone="primary"
          variant="soft"
          size="lg"
          block
          onPress={() => {
            void onResend();
          }}
          disabled={resent || pending}
          loading={pending}
          className="mt-8"
        />

        <Pressable
          onPress={() => router.back()}
          style={{ marginTop: 16, alignSelf: "center" }}
          hitSlop={10}
        >
          <Text variant="caption" tone="inkSecondary">
            {t("auth.checkEmail.wrongEmail")}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
