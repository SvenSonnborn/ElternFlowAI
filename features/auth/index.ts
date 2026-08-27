export { AuthGate } from "./AuthGate";
export {
  AVATAR_COLORS,
  capShort,
  deriveShort,
  normalizeShort,
  SHORT_MAX_LENGTH,
} from "./avatarColor";
export {
  useChild,
  useFamily,
  useFamilyChildren,
  useFamilyParents,
  useFamilyPendingInvitations,
  useParent,
  type ChildRow,
  type FamilyRow,
  type InvitationRow,
} from "./familyQueries";
export {
  decideRoute,
  type RouteDecisionInput,
  type RouteGroup,
  type RoutePath,
} from "./decideRoute";
export {
  initDeepLinkHandler,
  parseDeepLink,
  getPendingInviteToken,
  clearPendingInviteToken,
  type ParsedDeepLink,
} from "./deepLinkHandler";
export { mapAuthError, type AuthErrorKey } from "./errors";
export { inviteExpiry, type InviteExpiry } from "./inviteStatus";
export { useSignUp, useSignIn, useSignOut, useResetPassword, useUpdatePassword } from "./mutations";
export { passwordStrength, type PasswordStrength, type StrengthLabel } from "./passwordStrength";
export {
  useCreateFamily,
  useAcceptInvitation,
  useCreateChild,
  useUpdateChild,
  useDeleteChild,
  useUpdateParent,
  useCreateInvitation,
  useRegenerateInvitation,
  useRevokeInvitation,
} from "./onboardingMutations";
export {
  selectStatus,
  useInitSession,
  useSession,
  useSessionStore,
  type SessionStatus,
  type SessionStoreSnapshot,
} from "./session";
export {
  currentParentKey,
  shouldFetchParent,
  useCurrentParent,
  type ParentRow,
} from "./useCurrentParent";
export { useInvitePartner } from "./useInvitePartner";
