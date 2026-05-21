import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { Button, Card, Screen, Text } from "@/design-system/ui";

export function DashboardEmptyScreen() {
  const { t } = useTranslation();

  return (
    <Screen scroll>
      <View className="mb-1">
        <Text variant="h1">{t("dash.empty.welcome.title")}</Text>
        <Text variant="meta" tone="inkSecondary" className="mt-1">
          {t("dash.empty.welcome.sub")}
        </Text>
      </View>

      <Card className="mt-6">
        <Text variant="h2">{t("dash.empty.title")}</Text>
        <Text variant="body" tone="inkSecondary" className="mt-3">
          {t("dash.empty.sub")}
        </Text>
        <View className="mt-5 gap-3">
          <Button label={t("dash.empty.addChild")} tone="primary" block />
          <Button label={t("dash.empty.invite")} variant="soft" tone="neutral" block />
        </View>
      </Card>

      <Card variant="tinted" tint="accent" className="mt-4">
        <Text variant="eyebrow" tone="accentStrong">
          {t("voice.fab.label")}
        </Text>
        <Text variant="body" className="mt-2">
          {t("voice.overlay.exampleEvent")}
        </Text>
      </Card>
    </Screen>
  );
}
