import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { Icon, Pill } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Card, Text } from "@/design-system/ui";
import { inviteExpiry, type InvitationRow } from "@/features/auth";

interface PendingInviteCardProps {
  invitation: InvitationRow;
  onShare: () => void;
  onRegenerate: () => void;
  onRevoke: () => void;
  /** Drives this card's regenerate spinner. */
  isRegenerating: boolean;
  /** Any invite action anywhere on the screen is in flight. Disabling is
   *  screen-wide, not per-card: the three mutations share one error banner, so
   *  letting a second action start while one is running lets the loser of the
   *  race report its outcome after the winner already did. */
  isBusy: boolean;
}

/**
 * One open partner invitation, rendered next to the parent cards these become.
 * A token is single-use, so each card stands for exactly one person: share this
 * link with them, rotate it if it went astray, or withdraw it.
 *
 * The card carries no email — `family_invitations` has no such column, and the
 * link travels via the native share sheet rather than a mail we send. Showing a
 * recipient would claim more than the app actually knows.
 */
export function PendingInviteCard({
  invitation,
  onShare,
  onRegenerate,
  onRevoke,
  isRegenerating,
  isBusy,
}: PendingInviteCardProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();

  const { daysLeft, isUrgent } = inviteExpiry(invitation.expires_at, new Date().toISOString());
  // `daysLeft === 0` is expired *or* unparseable. Either way `accept_invitation`
  // would reject the token, so sharing it only wastes the recipient's time —
  // rotating or withdrawing it stays open, those are the ways out.
  const isDead = daysLeft === 0;

  // `isUrgent` covers both "nearly gone" and "already gone", so the pill has to
  // split them again — otherwise an expired invite reads "Läuft bald ab".
  // Expired is only reachable from a stale cache (the query filters it out),
  // but a card that contradicts itself is worse than a branch that rarely runs.
  const status = isDead
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
        </View>
        {/* Revoke sits here as an icon so the action row below keeps two full
            labels — three German labels ("Erneut teilen", "Neu generieren",
            "Widerrufen") do not survive a 360px screen at larger font scales. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("familie.inviteRevoke")}
          disabled={isBusy}
          onPress={onRevoke}
          className={`h-11 w-11 items-center justify-center rounded-full ${
            isBusy ? "opacity-50" : "active:opacity-80"
          }`}
        >
          <Icon name="trash" size={18} color={theme.danger} />
        </Pressable>
      </View>

      <View className="flex-row items-center gap-2">
        <Pill label={status.label} tone={status.tone} />
        {!isDead ? (
          <Text variant="caption" tone="inkSecondary">
            {t("familie.inviteExpiresIn", { count: daysLeft })}
          </Text>
        ) : null}
      </View>

      <View className="flex-row gap-2">
        <Button
          label={t("familie.inviteReshare")}
          variant="soft"
          tone="primary"
          size="md"
          className="flex-1"
          disabled={isBusy || isDead}
          onPress={onShare}
        />
        <Button
          label={t("familie.inviteRegenerate")}
          variant="ghost"
          tone="neutral"
          size="md"
          className="flex-1"
          loading={isRegenerating}
          disabled={isBusy}
          onPress={onRegenerate}
        />
      </View>
    </Card>
  );
}
