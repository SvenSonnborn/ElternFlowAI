export { AuthGate } from "./AuthGate";
export { AVATAR_COLORS, deriveShort } from "./avatarColor";
export {
  useFamily,
  useFamilyChildren,
  useFamilyParents,
  useFamilyPendingInvitations,
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
export { useSignUp, useSignIn, useSignOut, useResetPassword, useUpdatePassword } from "./mutations";
export { passwordStrength, type PasswordStrength, type StrengthLabel } from "./passwordStrength";
export {
  useCreateFamily,
  useAcceptInvitation,
  useCreateChild,
  useCreateInvitation,
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
