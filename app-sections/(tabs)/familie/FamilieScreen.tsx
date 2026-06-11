import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, View } from "react-native";

import { ChildAvatar, Icon, SectionHeader, TopBar } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Card, Screen, Text } from "@/design-system/ui";
import { useCurrentParent, useFamilyChildren, useFamilyParents } from "@/features/auth";
import { ageFromBirthday } from "@/features/children";

export function FamilieScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();

  const parent = useCurrentParent();
  const familyId = parent.data?.family_id;
  const childrenQ = useFamilyChildren(familyId);
  const parentsQ = useFamilyParents(familyId);

  const children = childrenQ.data ?? [];
  const parents = parentsQ.data ?? [];
  const isLoading = parent.isLoading || childrenQ.isLoading || parentsQ.isLoading;
  const isError = parent.isError || childrenQ.isError || parentsQ.isError;

  const sub = `${t("familie.childrenCount", { count: children.length })} · ${t("familie.parentsCount", { n: parents.length })}`;

  return (
    <Screen scroll>
      <TopBar title={t("nav.family")} sub={sub} />

      {isLoading ? (
        <View className="items-center py-10">
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : isError ? (
        <Card className="items-center py-6">
          <Text variant="body" tone="inkSecondary">
            {t("familie.loadError")}
          </Text>
        </Card>
      ) : (
        <>
          <SectionHeader title={t("familie.parents")} />
          <View className="gap-2">
            {parents.map((p) => (
              <Card key={p.id} className="flex-row items-center gap-3">
                <ChildAvatar name={p.name} color={p.color} size="lg" />
                <View className="flex-1">
                  <Text variant="listTitle">{p.name}</Text>
                </View>
              </Card>
            ))}
          </View>

          <SectionHeader title={t("familie.children")} />
          {children.length === 0 ? (
            <Card className="items-center py-6">
              <Text variant="body" tone="inkSecondary" className="text-center">
                {t("familie.empty")}
              </Text>
            </Card>
          ) : (
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
                        {t("familie.yearsOld", { count: ageFromBirthday(child.birthday) })}
                        {child.grade ? ` · ${child.grade}` : ""}
                      </Text>
                    </View>
                    <Icon name="chevron-right" size={16} color={theme.inkTertiary} />
                  </Card>
                </Pressable>
              ))}
            </View>
          )}
        </>
      )}

      <View className="mt-6 gap-3">
        <Button
          label={t("familie.addChild")}
          tone="primary"
          block
          onPress={() => router.push("/child/new")}
        />
        {/* Disabled stub — invite flow is not wired yet (see docs/TODO.md), so onPress is intentionally omitted. */}
        <Button
          label={`${t("familie.invitePartner")} · ${t("auth.soon")}`}
          variant="soft"
          tone="neutral"
          block
          disabled
        />
      </View>
    </Screen>
  );
}
