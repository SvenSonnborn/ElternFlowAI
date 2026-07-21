import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, View } from "react-native";

import { ChildAvatar, Icon, SectionHeader, TopBar } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Card, Screen, Text } from "@/design-system/ui";
import {
  useCurrentParent,
  useFamilyChildren,
  useFamilyParents,
  useFamilyPendingInvitations,
  useInvitePartner,
} from "@/features/auth";
import { ageFromBirthday } from "@/features/children";

export function FamilieScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();

  const parent = useCurrentParent();
  const familyId = parent.data?.family_id;
  const childrenQ = useFamilyChildren(familyId);
  const parentsQ = useFamilyParents(familyId);
  const pendingQ = useFamilyPendingInvitations(familyId);
  const invite = useInvitePartner(familyId);

  const children = childrenQ.data ?? [];
  const parents = parentsQ.data ?? [];
  const pendingInvites = pendingQ.data ?? [];
  const isLoading =
    parent.isLoading || childrenQ.isLoading || parentsQ.isLoading || pendingQ.isLoading;
  const isError = parent.isError || childrenQ.isError || parentsQ.isError || pendingQ.isError;

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
            {pendingInvites.map((inv) => (
              <Card key={inv.token} className="flex-row items-center gap-3">
                <View
                  className="h-11 w-11 items-center justify-center rounded-full bg-primary-soft"
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                >
                  <Icon name="mail" size={18} color={theme.primaryStrong} />
                </View>
                <View className="flex-1">
                  <Text variant="listTitle" tone="inkSecondary">
                    {t("familie.invitePending")}
                  </Text>
                </View>
                <View className="rounded-full bg-primary-soft px-3 py-1">
                  <Text variant="caption" tone="primaryStrong">
                    {t("familie.invitedPill")}
                  </Text>
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

      {invite.errorKey ? (
        <View
          className="mt-6 rounded-xl border border-danger bg-danger-soft p-3"
          accessibilityRole="alert"
        >
          <Text variant="body" tone="danger">
            {t(invite.errorKey)}
          </Text>
        </View>
      ) : null}

      <View className="mt-6 gap-3">
        <Button
          label={t("familie.addChild")}
          tone="primary"
          block
          onPress={() => router.push("/child/new")}
        />
        {/* Disabled stub — invite flow is not wired yet (see docs/TODO.md), so onPress is intentionally omitted. */}
        <Button
          label={t("familie.invitePartner")}
          variant="soft"
          tone="primary"
          block
          loading={invite.isPending}
          disabled={!invite.canSend}
          onPress={() => {
            // Share-sheet dismissal rejects the promise; treat as a soft no-op.
            void invite.send().catch(() => {});
          }}
        />
      </View>
    </Screen>
  );
}
