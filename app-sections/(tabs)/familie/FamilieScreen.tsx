import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { ChildAvatar, Icon, SectionHeader, TopBar } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Card, Screen, Text } from "@/design-system/ui";
import { children, parents } from "@/features/sample-data";

export function FamilieScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();

  const sub = `${t("familie.childrenCount", { count: children.length })} · ${t("familie.parentsCount", { n: parents.length })}`;

  return (
    <Screen scroll>
      <TopBar title={t("nav.family")} sub={sub} />

      <SectionHeader title={t("familie.parents")} />
      <View className="gap-2">
        {parents.map((parent) => (
          <Card key={parent.name} className="flex-row items-center gap-3">
            <ChildAvatar name={parent.short} color={parent.color} size="lg" />
            <View className="flex-1">
              <Text variant="listTitle">{parent.name}</Text>
              <Text variant="caption" tone="inkSecondary">
                {parent.email}
              </Text>
            </View>
            <Icon name="chevron-right" size={16} color={theme.inkTertiary} />
          </Card>
        ))}
      </View>

      <SectionHeader title={t("familie.children")} />
      <View className="gap-2">
        {children.map((child) => (
          <Pressable
            key={child.id}
            onPress={() => router.push(`/child/${child.id}`)}
            className="active:opacity-80"
          >
            <Card className="flex-row items-center gap-3">
              <ChildAvatar name={child.name} color={child.color} size="lg" />
              <View className="flex-1">
                <Text variant="listTitle">{child.name}</Text>
                <Text variant="caption" tone="inkSecondary">
                  {t("familie.yearsOld", { count: child.age })} · {child.grade}
                </Text>
              </View>
              <Icon name="chevron-right" size={16} color={theme.inkTertiary} />
            </Card>
          </Pressable>
        ))}
      </View>

      <View className="mt-6 gap-3">
        <Button
          label={t("familie.addChild")}
          tone="primary"
          block
          onPress={() => router.push("/child/new")}
        />
        <Button label={t("familie.invitePartner")} variant="soft" tone="neutral" block />
      </View>
    </Screen>
  );
}
