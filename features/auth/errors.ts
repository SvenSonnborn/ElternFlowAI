export type AuthErrorKey =
  | "auth.error.invalidCredentials"
  | "auth.error.emailTaken"
  | "auth.error.emailNotConfirmed"
  | "auth.error.weakPassword"
  | "auth.error.alreadyInFamily"
  | "auth.error.linkExpired"
  | "auth.error.notAuthenticated"
  | "auth.error.network"
  | "auth.error.generic";

interface ErrorLike {
  message?: string;
  code?: string;
  name?: string;
}

function asErrorLike(input: unknown): ErrorLike | null {
  if (input == null) return null;
  if (typeof input !== "object") return null;
  return input;
}

export function mapAuthError(input: unknown): AuthErrorKey {
  const err = asErrorLike(input);
  if (!err) {
    if (input !== null && input !== undefined) {
      console.error("[mapAuthError] non-object input", input);
    }
    return "auth.error.generic";
  }

  // Postgres SQLSTATE codes — checked first because they're specific.
  if (err.code === "23505") return "auth.error.alreadyInFamily";
  if (err.code === "22023") return "auth.error.linkExpired";
  if (err.code === "42501") return "auth.error.notAuthenticated";

  const message = err.message ?? "";

  if (err.name === "AbortError" || /network|fetch failed|aborted/i.test(message)) {
    return "auth.error.network";
  }
  if (/invalid login credentials/i.test(message)) return "auth.error.invalidCredentials";
  if (/user already registered|already exists/i.test(message)) return "auth.error.emailTaken";
  if (/email not confirmed/i.test(message)) return "auth.error.emailNotConfirmed";
  if (/password.*(at least|too short|short)/i.test(message)) return "auth.error.weakPassword";

  console.error("[mapAuthError] unmapped error", input);
  return "auth.error.generic";
}
