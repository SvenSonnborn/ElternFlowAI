import type { TaskWithType } from "./types";

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

/**
 * Someone else changed the task since this form loaded it.
 *
 * Carries their version so the screen can diff it field by field against the
 * user's own input without a second round trip (ADR-031). Unlike the calendar's
 * counterpart, `row` is never null here: the task path detects the conflict via
 * compare-and-swap and then reads the row precisely to fill this in.
 */
export class TaskConflictError extends Error {
  constructor(readonly row: TaskWithType) {
    super("Task was modified by someone else");
    this.name = "TaskConflictError";
  }
}

export type TaskErrorKey =
  | "hw.error.notAuthenticated"
  | "hw.error.staleReference"
  | "hw.error.conflict"
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
  if (err.name === "TaskConflictError") return "hw.error.conflict";

  // Postgres SQLSTATE codes — checked first because they're specific.
  // 42501 is RLS refusing the row; 23503 means the child or task type the row
  // points at is gone. 23514 (the completion CHECK) deliberately has no key:
  // it can only break if this layer writes the three completion columns
  // inconsistently, which is a bug here, not something a parent can act on.
  if (err.code === "42501") return "hw.error.notAuthenticated";
  if (err.code === "23503") return "hw.error.staleReference";

  const message = err.message ?? "";
  // Both word orders on purpose: undici (native, Node) says "fetch failed",
  // browsers and react-native-web say "Failed to fetch".
  if (err.name === "AbortError" || /network|fetch failed|failed to fetch|aborted/i.test(message)) {
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
