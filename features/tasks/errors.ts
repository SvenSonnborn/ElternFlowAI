/**
 * Thrown before any network call when a mutation needs the current parent row
 * and it is not loaded. Naming the failure locally beats firing a request that
 * RLS will reject with 42501 a round trip later.
 */
export class MissingParentError extends Error {
  constructor() {
    super("Current parent is not loaded");
    this.name = "MissingParentError";
  }
}

export type TaskErrorKey =
  | "hw.error.notAuthenticated"
  | "hw.error.staleReference"
  | "hw.error.network"
  | "hw.error.generic";

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

/**
 * Classifies the *cause*, not the operation — which title sits above it is the
 * screen's call. Mirrors mapAuthError in features/auth/errors.ts.
 */
export function mapTaskError(input: unknown): TaskErrorKey {
  const err = asErrorLike(input);
  if (!err) return "hw.error.generic";

  if (err.name === "MissingParentError") return "hw.error.notAuthenticated";

  // Postgres SQLSTATE codes — checked first because they're specific.
  // 42501 is RLS refusing the row; 23503 means the child or task type the row
  // points at is gone. 23514 (the completion CHECK) deliberately has no key:
  // it can only break if this layer writes the three completion columns
  // inconsistently, which is a bug here, not something a parent can act on.
  if (err.code === "42501") return "hw.error.notAuthenticated";
  if (err.code === "23503") return "hw.error.staleReference";

  const message = err.message ?? "";
  if (err.name === "AbortError" || /network|fetch failed|aborted/i.test(message)) {
    return "hw.error.network";
  }

  // Log only safe primitives — a Supabase error message can echo the payload,
  // and task titles are private ("Attest für Schulpsychologe abgeben").
  console.error("[mapTaskError] unmapped error", {
    code: err.code ?? null,
    name: err.name ?? null,
    hasMessage: message.length > 0,
  });
  return "hw.error.generic";
}
