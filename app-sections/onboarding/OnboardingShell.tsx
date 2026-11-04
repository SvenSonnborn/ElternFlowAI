import { router } from "expo-router";
import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Icon } from "@/app-sections/shared";
import { touchTarget } from "@/design-system";
import { useTheme } from "@/design-system/ThemeProvider";
import { Text } from "@/design-system/ui";

interface OnboardingShellProps {
  step: 2 | 3 | 4 | 5;
  total?: number;
  showSkip?: boolean;
  onSkip?: () => void;
  children: ReactNode;
  footer: ReactNode;
}

export function OnboardingShell({
  step,
  total = 5,
  showSkip = false,
  onSkip,
  children,
  footer,
}: OnboardingShellProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 16,
          // 3 + 44er-Box + 3: die Kopfzeile bleibt so hoch wie mit dem
          // 26 pt hohen Pfeil und 12 oben und unten.
          paddingVertical: 3,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t("onb.actions.back")}
          // Pfeil bündig links in der 44er-Box. -20 lässt die Box nur 24 breit
          // zählen, so bleiben die Punkte dort, wo sie neben dem Pfeil standen.
          style={{
            width: touchTarget.min,
            height: touchTarget.min,
            justifyContent: "center",
            alignItems: "flex-start",
            marginRight: -20,
          }}
        >
          <Icon name="chevron-left" size={24} color={theme.ink} />
        </Pressable>
        <View style={{ flexDirection: "row", gap: 6 }}>
          {Array.from({ length: total }).map((_, i) => {
            const active = i + 1 <= step;
            return (
              <View
                key={i}
                style={{
                  width: 22,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: active ? theme.primary : theme.lineStrong,
                }}
              />
            );
          })}
        </View>
        {showSkip ? (
          <Pressable
            onPress={onSkip}
            accessibilityRole="button"
            style={{
              minWidth: touchTarget.min,
              minHeight: touchTarget.min,
              justifyContent: "center",
              alignItems: "flex-end",
            }}
          >
            <Text variant="caption" tone="inkSecondary">
              {t("onb.actions.skip")}
            </Text>
          </Pressable>
        ) : (
          <View style={{ width: 24 }} />
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 24, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text variant="caption" tone="inkSecondary" style={{ textTransform: "uppercase" }}>
          {t("onb.stepCounter", { n: step, total })}
        </Text>
        {children}
      </ScrollView>

      <View
        style={{
          paddingHorizontal: 24,
          paddingTop: 12,
          paddingBottom: 24,
          gap: 8,
          borderTopWidth: 1,
          borderTopColor: theme.line,
          backgroundColor: theme.bg,
        }}
      >
        {footer}
      </View>
    </SafeAreaView>
  );
}
