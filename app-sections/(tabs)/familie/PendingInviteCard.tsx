import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { Icon, Pill } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Card, Text } from "@/design-system/ui";
import { inviteExpiry, type InvitationRow } from "@/features/auth";

interface PendingInviteCardProps {
  invitation: InvitationRow;
  onRegenerate: () => void;
  onRevoke: () => void;
  isRegenerating: boolean;
  isRevoking: boolean;
}

/**
 * One open partner invitation, rendered next to the parent cards it will one
 * day become. Shows how much life the link has left and offers the two ways out
 * of a stuck invite: rotate the token, or withdraw it.
 *
 * The card carries no email — `family_invitations` has no such column, and the
 * link travels via the native share sheet rather than a mail we send. Showing a
 * recipient would claim more than the app actually knows.
 */
export function PendingInviteCard({
  invitation,
  onRegenerate,
  onRevoke,
  isRegenerating,
  isRevoking,
}: PendingInviteCardProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();

  const { daysLeft, isUrgent } = inviteExpiry(invitation.expires_at, new Date().toISOString());
  const busy = isRegenerating || isRevoking;

  // `isUrgent` covers both "nearly gone" and "already gone", so the pill has to
  // split them again — otherwise an expired invite reads "Läuft bald ab".
  // Expired is only reachable from a stale cache (the query filters it out),
  // but a card that contradicts itself is worse than a branch that rarely runs.
  const status =
    daysLeft === 0
      ? { label: t("familie.inviteExpired"), tone: "danger" as const }
      : isUrgent
        ? { label: t("familie.inviteExpiringSoon"), tone: "warn" as const }
        : { label: t("familie.invitedPill"), tone: "mint" as const };

  return (
    <Card className="gap-3">
      <View className="flex-row items-center gap-3">
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
          {daysLeft > 0 ? (
            <Text variant="caption" tone="inkSecondary">
              {t("familie.inviteExpiresIn", { count: daysLeft })}
            </Text>
          ) : null}
        </View>
        <Pill label={status.label} tone={status.tone} />
      </View>

      <View className="flex-row gap-2">
        <Button
          label={t("familie.inviteRegenerate")}
          variant="soft"
          tone="primary"
          size="md"
          className="flex-1"
          loading={isRegenerating}
          disabled={busy}
          onPress={onRegenerate}
        />
        <Button
          label={t("familie.inviteRevoke")}
          variant="ghost"
          tone="danger"
          size="md"
          className="flex-1"
          loading={isRevoking}
          disabled={busy}
          onPress={onRevoke}
        />
      </View>
    </Card>
  );
}
