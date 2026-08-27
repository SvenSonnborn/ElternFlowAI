import { useTranslation } from "react-i18next";
import { Share } from "react-native";

import { mapAuthError, type AuthErrorKey } from "./errors";
import { useCreateInvitation } from "./onboardingMutations";

interface UseInvitePartner {
  /** Creates a fresh invitation and opens the native share sheet. Resolves
   *  `true` if the share sheet was reached, `false` if the call was a no-op (no
   *  family / already in flight). Rejects only on a real create error. */
  send: () => Promise<boolean>;
  /** Opens the share sheet for an invitation that already exists. No mutation,
   *  so it works for any listed token — the "erneut teilen" action. */
  shareToken: (token: string) => Promise<void>;
  isPending: boolean;
  errorKey: AuthErrorKey | null;
  canSend: boolean;
}

/**
 * Shared invite-partner flow: create a `family_invitations` row, build the
 * `elternflow://invite/{token}` deep link, and open the cross-platform share
 * sheet. Used by both onboarding Step 3 and the Familie tab. Navigation is left
 * to the caller — this hook only handles the create + share.
 *
 * A token is single-use (`accept_invitation` stamps `used_at`), so `send()`
 * means "invite one more person", not "share again". Re-sharing a link that
 * already exists goes through {@link UseInvitePartner.shareToken} instead,
 * which is why the two are separate.
 */
export function useInvitePartner(familyId: string | undefined): UseInvitePartner {
  const { t } = useTranslation();
  const createInvitation = useCreateInvitation();

  const canSend = Boolean(familyId) && !createInvitation.isPending;
  const errorKey = createInvitation.error ? mapAuthError(createInvitation.error) : null;

  async function shareToken(token: string): Promise<void> {
    const link = `elternflow://invite/${token}`;
    const message = `${t("onb.s3.shareMessage")}\n\n${link}`;
    // Share.share is the cross-platform RN built-in. iOS uses `url` (better
    // share-extension preview), Android uses `message`. We pass both.
    await Share.share(
      { url: link, message, title: t("onb.s3.shareSubject") },
      { subject: t("onb.s3.shareSubject"), dialogTitle: t("onb.s3.shareSubject") },
    );
  }

  async function send(): Promise<boolean> {
    if (!familyId || !canSend) return false;
    const invite = await createInvitation.mutateAsync({ familyId });
    await shareToken(invite.token);
    return true;
  }

  return { send, shareToken, isPending: createInvitation.isPending, errorKey, canSend };
}
