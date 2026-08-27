import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, View } from "react-native";

import {
  ChildAvatar,
  confirmDestructive,
  Icon,
  SectionHeader,
  TopBar,
} from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Card, Screen, Text } from "@/design-system/ui";
import {
  useCurrentParent,
  useFamilyChildren,
  useFamilyParents,
  useFamilyPendingInvitations,
  useInvitePartner,
  useRegenerateInvitation,
  useRevokeInvitation,
} from "@/features/auth";
import { ageFromBirthday } from "@/features/children";

import { PendingInviteCard } from "./PendingInviteCard";

export function FamilieScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();

  const parent = useCurrentParent();
  const familyId = parent.data?.family_id;
  const childrenQ = useFamilyChildren(familyId);
  const parentsQ = useFamilyParents(familyId);
  const pendingQ = useFamilyPendingInvitations(familyId);
  const invite = useInvitePartner(familyId);
  const regenerate = useRegenerateInvitation();
  const revoke = useRevokeInvitation();

  async function handleRevoke(token: string) {
    if (!familyId) return;
    const confirmed = await confirmDestructive({
      title: t("familie.inviteRevokeTitle"),
      body: t("familie.inviteRevokeBody"),
      confirm: t("familie.inviteRevokeConfirm"),
      cancel: t("action.cancel"),
    });
    if (!confirmed) return;
    revoke.mutate({ familyId, token });
  }

  async function handleRegenerate(token: string) {
    if (!familyId) return;
    // Rotating a link nobody has seen would be pointless, so the new token goes
    // straight into the share sheet.
    const freshToken = await regenerate.mutateAsync({ familyId, token });
    await invite.shareToken(freshToken);
  }

  // Share-sheet dismissal rejects the promise; treat as a soft no-op — the
  // invitation itself was created (or rotated) either way.
  function softShare(run: () => Promise<unknown>) {
    void run().catch(() => {});
  }

  const children = childrenQ.data ?? [];
  const parents = parentsQ.data ?? [];
  const pendingInvites = pendingQ.data ?? [];
  const hasPendingInvite = pendingInvites.length > 0;
  const isLoading =
    parent.isLoading || childrenQ.isLoading || parentsQ.isLoading || pendingQ.isLoading;
  const isError = parent.isError || childrenQ.isError || parentsQ.isError || pendingQ.isError;

  const sub = `${t("familie.childrenCount", { count: children.length })} · ${t("familie.parentsCount", { n: parents.length })}`;

  const errorMessage = invite.errorKey
    ? t(invite.errorKey)
    : revoke.isError || regenerate.isError
      ? t("familie.inviteRevokeError")
      : null;

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
              <PendingInviteCard
                key={inv.token}
                invitation={inv}
                onShare={() => softShare(() => invite.shareToken(inv.token))}
                onRegenerate={() => softShare(() => handleRegenerate(inv.token))}
                onRevoke={() => void handleRevoke(inv.token)}
                isRegenerating={regenerate.isPending}
                isRevoking={revoke.isPending}
              />
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

      {errorMessage ? (
        <View
          className="mt-6 rounded-xl border border-danger bg-danger-soft p-3"
          accessibilityRole="alert"
        >
          <Text variant="body" tone="danger">
            {errorMessage}
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
        <Button
          // Always mints a new invitation. Once one is already open, say so —
          // "Partner einladen" would read like it re-opens the pending one.
          label={hasPendingInvite ? t("familie.inviteAnother") : t("familie.invitePartner")}
          variant="soft"
          tone="primary"
          block
          loading={invite.isPending}
          disabled={!invite.canSend}
          onPress={() => softShare(() => invite.send())}
        />
      </View>
    </Screen>
  );
}
