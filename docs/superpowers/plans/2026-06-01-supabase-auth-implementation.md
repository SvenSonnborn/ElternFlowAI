# Supabase Auth + Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring Supabase Email+Password Auth live with strict email-confirm, the 5-step onboarding (Approach C: incremental real-inserts via existing RPCs), reset-password flow, partner-invite via share-sheet, and an auth-gated router. Remove the calendar's sample-data fallback.

**Architecture:** Single `<AuthGate>` in `app/_layout.tsx` decides between three route groups: `(auth)`, `(onboarding)`, `(tabs)`. `useSession()` (Zustand, moved from `features/calendar/sessionStore.ts`) is the auth-state source of truth. `useCurrentParent()` (TanStack Query) is the bridge to the family. Onboarding Step 2 commits via `rpc("create_family")` — Steps 3 + 4 are optional INSERTs, Step 5 is a read-only recap.

**Tech Stack:** Expo Router 6 · React 19 · React Native 0.81 · TypeScript strict · `@supabase/supabase-js` · `@tanstack/react-query` · Zustand · `react-i18next` · `expo-linking` · `expo-sharing` · Bun's `bun:test` runner

**Spec:** [docs/superpowers/specs/2026-06-01-supabase-auth-design.md](../specs/2026-06-01-supabase-auth-design.md)

**Branch:** `feature/auth-v1`

---

## Conventions used in this plan

- **Tests are co-located** (e.g. `features/auth/errors.test.ts`, not in `__tests__/`) — matches existing pattern in `features/calendar/recurrence.test.ts`.
- **Test runner:** `bun:test` for logic tests. Imports: `import { describe, expect, mock, test } from "bun:test"`.
- **i18n catalogs** live at `features/i18n/locales/{de,en}.json`. DE is canonical, EN mirrors.
- **Each task ends with a commit** (Conventional-Commits, no `Co-Authored-By` trailer per CLAUDE.md).
- **`bun run check` after every UI task** (`format:check && lint && typecheck`). Tests via `bun test`.
- **MCP usage:** Only for read-only Supabase verification (schema introspection, advisors). No ad-hoc SQL via MCP — every DB change goes through `supabase/migrations/`.

---

## Phase 0 — Setup & Verification

### Task 0.1 — Pre-flight verification

**Files:** none (read-only checks)

- [ ] **Step 1: Verify branch + clean tree**

Run: `git branch --show-current && git status`
Expected: branch `feature/auth-v1`, working tree clean.

- [ ] **Step 2: Verify `app.json` deep-link scheme is set**

Run: `grep -F '"scheme"' app.json`
Expected: `"scheme": "elternflow",`
If missing: add it (this plan assumes it exists, which the brainstorming session confirmed).

- [ ] **Step 3: Verify Supabase migrations are applied**

Use the Supabase MCP to list applied migrations and confirm the following are present:

- `20260529090123_helpers_and_core` (families, parents, children, `current_family_id`)
- `20260529091002_onboarding_rpcs` (family_invitations, `create_family`, `accept_invitation`)
- `20260529100841_pr3_review_fixes` (most recent)

If any are missing, **stop and flag this to the user** — applying migrations to a project with existing data needs a human review.

- [ ] **Step 4: Verify Supabase advisors are clean for auth-related objects**

Use the Supabase MCP `get_advisors` (lints type=security and type=performance). Expected: no new criticals on `parents`, `families`, `family_invitations`, or the two RPCs.

If anything is reported as critical, capture it and surface to the user before continuing.

### Task 0.2 — Write `supabase/SETUP.md`

**Files:**

- Create: `supabase/SETUP.md`

- [ ] **Step 1: Write the SETUP.md checklist**

```markdown
# Supabase Project Setup

Reproducible checklist for the Eltern Flow Supabase project. Run through this once per environment (dev, staging, prod). Items marked **Dashboard-only** can't be set via MCP / SQL and must be clicked through in the Supabase Dashboard.

## 1. Project basics

- Region: `eu-central-1` (Frankfurt) — keep data in the EU (privacy promise in [patterns/onboarding.md](../patterns/onboarding.md) Step 2).
- Free Tier is fine for dev. Production will need Pro for backups + bigger SMTP allotment.

## 2. ENV in the app (`.env.local`)
```

EXPO_PUBLIC_SUPABASE_URL=<project URL>
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key, NOT secret>

```
Never put the `secret`/legacy `service_role` key here — it bypasses RLS.

## 3. Database (`supabase/migrations/`)
All migrations are committed to the repo. Apply in order via Supabase CLI or MCP `apply_migration`.

## 4. Authentication — Dashboard-only settings

### Authentication → Settings → User Signups
- ✅ Enable email signups
- ✅ **Confirm email** (strict mode — required for V1 auth flow)
- ❌ Enable phone signups

### Authentication → URL Configuration
- **Site URL:** `elternflow://`
- **Additional Redirect URLs:**
  - `elternflow://auth/confirm`
  - `elternflow://auth/recovery`
  - `http://localhost:8081/auth/confirm`   (dev web-bundle smoke-test)
  - `http://localhost:8081/auth/recovery`

### Authentication → Email Templates (DE versions, EN as fallback)
Adjust three templates so the action link uses the `elternflow://` scheme:

**Confirm signup**
- Subject: `Bestätige deine E-Mail für Eltern Flow`
- Action link href: `{{ .ConfirmationURL }}` (Supabase will substitute the redirect URL configured above)

**Reset password**
- Subject: `Setze dein Eltern-Flow-Passwort zurück`
- Action link target: `elternflow://auth/recovery`

**Magic Link** + **Invite User**: leave defaults. V1 doesn't use them.

### Authentication → Rate Limits
- Sign-up: 30 / hour (default)
- Sign-in: 30 / hour (default)
- Password recovery: **5 / hour** (lower than default — prevents email abuse)

### Authentication → SMTP
**V1:** keep the built-in Supabase SMTP. Hard limit: ~4 emails per hour, sufficient for dev.

**Before production:** switch to a real SMTP provider (Resend / Mailgun / Postmark). Config block to fill in:
- Sender email: `noreply@<your-domain>`
- Sender name: `Eltern Flow`
- Host, Port, User, Pass: provider credentials

### Auth Providers (Google, Apple, etc.)
Leave **disabled** for V1. The Login screen renders these as disabled buttons. Adding them is a separate iteration (Apple Developer Cert, Google Cloud Console, deep-link callback handlers).

## 5. Verification after setup
- Sign up a test account in the app → check the inbox for the confirm email
- Click the link → app should open and route to `/(onboarding)/2`
- If the email never arrives or the link opens the wrong URL, recheck the **URL Configuration** and **Email Templates** sections above

## 6. Production-readiness backlog
- Custom SMTP provider
- Custom email-template branding (logo, colors)
- Auth attack surface review (rate limits, captcha for sign-up)
- Account-deletion flow (DSGVO Art. 17)
```

- [ ] **Step 2: Verify the file renders correctly**

Run: `bun run format:check supabase/SETUP.md`
Expected: no formatting issues, or auto-fix with `bun run format`.

- [ ] **Step 3: Commit**

```bash
git add supabase/SETUP.md
git commit -m "docs(supabase): SETUP.md checklist for dashboard-only auth config"
```

### Task 0.3 — Wait for user to apply Supabase Dashboard settings

This task is a **human checkpoint**, not code. Before Phase 1 Smoke-Tests can run end-to-end, the user must:

- [ ] **Step 1: Hand off to user**

> "I've written `supabase/SETUP.md`. Before we wire up screens, please click through Section 4 in the Supabase Dashboard (Confirm Email, URL Configuration, Email Templates, Rate Limits). The code can be built without it, but smoke-tests will fail. Reply when done."

Do not commit anything in this task. Wait for user confirmation.

---

## Phase 1 — `features/auth/` Foundation

### Task 1.1 — Move + extend `sessionStore` from calendar to auth

The Zustand session store already exists at `features/calendar/sessionStore.ts`. Move it to `features/auth/session.ts` and replace its boolean `initialized` flag with a status enum, because the rest of the plan distinguishes `loading` / `unauthenticated` / `authenticated`.

**Files:**

- Create: `features/auth/session.ts`
- Create: `features/auth/session.test.ts`
- Delete (later, in Task 5.1): `features/calendar/sessionStore.ts`
- Modify (later, in Task 5.1): `features/calendar/index.ts` (drop `useSessionStore` / `useInitSession` re-exports)

- [ ] **Step 1: Write the failing test**

`features/auth/session.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { selectStatus, type SessionStoreSnapshot } from "./session";

const empty: SessionStoreSnapshot = { session: null, initialized: false };
const ready: SessionStoreSnapshot = { session: null, initialized: true };
const authed: SessionStoreSnapshot = {
  session: { user: { id: "u1" }, access_token: "x" } as never,
  initialized: true,
};

describe("selectStatus", () => {
  test("returns 'loading' before init completes", () => {
    expect(selectStatus(empty)).toBe("loading");
  });
  test("returns 'unauthenticated' after init with no session", () => {
    expect(selectStatus(ready)).toBe("unauthenticated");
  });
  test("returns 'authenticated' once a session is set", () => {
    expect(selectStatus(authed)).toBe("authenticated");
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

Run: `bun test features/auth/session.test.ts`
Expected: FAIL — cannot find module `./session`.

- [ ] **Step 3: Create `features/auth/session.ts`**

```ts
import type { Session } from "@supabase/supabase-js";

import { useEffect } from "react";
import { create } from "zustand";

import { supabase } from "@/features/supabase";

export type SessionStatus = "loading" | "unauthenticated" | "authenticated";

export interface SessionStoreSnapshot {
  session: Session | null;
  initialized: boolean;
}

interface SessionState extends SessionStoreSnapshot {
  setSession: (s: Session | null) => void;
  setInitialized: (b: boolean) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  session: null,
  initialized: false,
  setSession: (s) => set({ session: s }),
  setInitialized: (b) => set({ initialized: b }),
}));

export function selectStatus(snapshot: SessionStoreSnapshot): SessionStatus {
  if (!snapshot.initialized) return "loading";
  return snapshot.session ? "authenticated" : "unauthenticated";
}

export function useSession(): {
  status: SessionStatus;
  session: Session | null;
  userId: string | null;
} {
  const snapshot = useSessionStore((s) => ({ session: s.session, initialized: s.initialized }));
  const status = selectStatus(snapshot);
  return { status, session: snapshot.session, userId: snapshot.session?.user.id ?? null };
}

export function useInitSession(): void {
  const setSession = useSessionStore((s) => s.setSession);
  const setInitialized = useSessionStore((s) => s.setInitialized);

  useEffect(() => {
    let mounted = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setSession(data.session);
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        console.warn("supabase.auth.getSession failed", err);
        setSession(null);
      })
      .finally(() => {
        if (!mounted) return;
        setInitialized(true);
      });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      if (!mounted) return;
      setSession(sess);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [setSession, setInitialized]);
}
```

- [ ] **Step 4: Run the test, expect pass**

Run: `bun test features/auth/session.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

Don't delete `features/calendar/sessionStore.ts` yet — calendar still imports it via `useInitSession` in `app/_layout.tsx`. The cleanup happens in Task 5.1 after we re-wire `app/_layout.tsx` to use the new module.

```bash
git add features/auth/session.ts features/auth/session.test.ts
git commit -m "feat(auth): add session store with status enum + selectStatus helper"
```

### Task 1.2 — `useCurrentParent` hook

**Files:**

- Create: `features/auth/useCurrentParent.ts`
- Create: `features/auth/useCurrentParent.test.ts`

- [ ] **Step 1: Write the failing test (covers query-key + enabled logic, NOT the fetch itself)**

`features/auth/useCurrentParent.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { currentParentKey, shouldFetchParent } from "./useCurrentParent";

describe("currentParentKey", () => {
  test("includes the user id so different users have different caches", () => {
    expect(currentParentKey("u1")).toEqual(["currentParent", "u1"]);
    expect(currentParentKey("u2")).toEqual(["currentParent", "u2"]);
  });
  test("uses a sentinel when no user id is known", () => {
    expect(currentParentKey(null)).toEqual(["currentParent", "anonymous"]);
  });
});

describe("shouldFetchParent", () => {
  test("enables only when authenticated", () => {
    expect(shouldFetchParent("loading")).toBe(false);
    expect(shouldFetchParent("unauthenticated")).toBe(false);
    expect(shouldFetchParent("authenticated")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

Run: `bun test features/auth/useCurrentParent.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`features/auth/useCurrentParent.ts`:

```ts
import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { supabase } from "@/features/supabase";
import type { Database } from "@/features/supabase/database.types";

import { useSession, type SessionStatus } from "./session";

export type ParentRow = Database["public"]["Tables"]["parents"]["Row"];

export function currentParentKey(userId: string | null): readonly [string, string] {
  return ["currentParent", userId ?? "anonymous"] as const;
}

export function shouldFetchParent(status: SessionStatus): boolean {
  return status === "authenticated";
}

async function fetchCurrentParent(userId: string): Promise<ParentRow | null> {
  const { data, error } = await supabase
    .from("parents")
    .select("*")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export function useCurrentParent(): UseQueryResult<ParentRow | null, Error> {
  const { status, userId } = useSession();
  return useQuery({
    queryKey: currentParentKey(userId),
    queryFn: () => fetchCurrentParent(userId as string),
    enabled: shouldFetchParent(status) && userId !== null,
    staleTime: 60_000,
  });
}
```

- [ ] **Step 4: Run the test, expect pass**

Run: `bun test features/auth/useCurrentParent.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add features/auth/useCurrentParent.ts features/auth/useCurrentParent.test.ts
git commit -m "feat(auth): useCurrentParent hook + key + enabled helpers"
```

### Task 1.3 — `errors.ts` Supabase → i18n mapping

**Files:**

- Create: `features/auth/errors.ts`
- Create: `features/auth/errors.test.ts`

- [ ] **Step 1: Write the failing test**

`features/auth/errors.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { mapAuthError } from "./errors";

describe("mapAuthError", () => {
  test("Invalid login credentials → auth.error.invalidCredentials", () => {
    expect(mapAuthError({ message: "Invalid login credentials" })).toBe(
      "auth.error.invalidCredentials",
    );
  });
  test("User already registered → auth.error.emailTaken", () => {
    expect(mapAuthError({ message: "User already registered" })).toBe("auth.error.emailTaken");
  });
  test("Email not confirmed → auth.error.emailNotConfirmed", () => {
    expect(mapAuthError({ message: "Email not confirmed" })).toBe("auth.error.emailNotConfirmed");
  });
  test("password length error → auth.error.weakPassword", () => {
    expect(mapAuthError({ message: "Password should be at least 8 characters" })).toBe(
      "auth.error.weakPassword",
    );
  });
  test("Postgres 23505 → auth.error.alreadyInFamily", () => {
    expect(mapAuthError({ code: "23505", message: "user already belongs to a family" })).toBe(
      "auth.error.alreadyInFamily",
    );
  });
  test("Postgres 22023 → auth.error.linkExpired", () => {
    expect(mapAuthError({ code: "22023", message: "invitation invalid or expired" })).toBe(
      "auth.error.linkExpired",
    );
  });
  test("Postgres 42501 → auth.error.notAuthenticated (caller should redirect)", () => {
    expect(mapAuthError({ code: "42501", message: "not authenticated" })).toBe(
      "auth.error.notAuthenticated",
    );
  });
  test("Network-like → auth.error.network", () => {
    expect(mapAuthError({ message: "Network request failed" })).toBe("auth.error.network");
    expect(mapAuthError({ name: "AbortError", message: "aborted" })).toBe("auth.error.network");
  });
  test("Unknown shape → auth.error.generic", () => {
    expect(mapAuthError({ message: "something exploded" })).toBe("auth.error.generic");
    expect(mapAuthError(null)).toBe("auth.error.generic");
    expect(mapAuthError(undefined)).toBe("auth.error.generic");
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

Run: `bun test features/auth/errors.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`features/auth/errors.ts`:

```ts
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
  return input as ErrorLike;
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
```

- [ ] **Step 4: Run the test, expect pass**

Run: `bun test features/auth/errors.test.ts`
Expected: PASS — 9 tests.

- [ ] **Step 5: Commit**

```bash
git add features/auth/errors.ts features/auth/errors.test.ts
git commit -m "feat(auth): mapAuthError supabase→i18n with postgres SQLSTATE handling"
```

### Task 1.4 — `mutations.ts` — auth-side mutations

**Files:**

- Create: `features/auth/mutations.ts`

- [ ] **Step 1: Implement**

`features/auth/mutations.ts`:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/features/supabase";

interface SignUpVars {
  email: string;
  password: string;
}

interface SignInVars {
  email: string;
  password: string;
}

interface ResetVars {
  email: string;
}

interface UpdatePasswordVars {
  password: string;
}

export function useSignUp() {
  return useMutation({
    mutationFn: async ({ email, password }: SignUpVars) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: "elternflow://auth/confirm" },
      });
      if (error) throw error;
      return data;
    },
  });
}

export function useSignIn() {
  return useMutation({
    mutationFn: async ({ email, password }: SignInVars) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data;
    },
  });
}

export function useSignOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },
    onSettled: () => {
      // Always clear cached server-state — even on partial signOut errors —
      // to prevent the previous user's family data leaking on next render.
      qc.clear();
    },
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: async ({ email }: ResetVars) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: "elternflow://auth/recovery",
      });
      if (error) throw error;
    },
  });
}

export function useUpdatePassword() {
  return useMutation({
    mutationFn: async ({ password }: UpdatePasswordVars) => {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
    },
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add features/auth/mutations.ts
git commit -m "feat(auth): signUp/signIn/signOut/resetPassword/updatePassword mutations"
```

### Task 1.5 — `onboardingMutations.ts` — RPC + insert mutations

**Files:**

- Create: `features/auth/onboardingMutations.ts`

- [ ] **Step 1: Implement**

`features/auth/onboardingMutations.ts`:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/features/supabase";
import type { Database } from "@/features/supabase/database.types";

import { currentParentKey } from "./useCurrentParent";
import { useSession } from "./session";

type ChildInsert = Database["public"]["Tables"]["children"]["Insert"];
type InvitationRow = Database["public"]["Tables"]["family_invitations"]["Row"];

interface CreateFamilyVars {
  familyName: string;
  parentName: string;
  short: string;
  color: string;
}

interface AcceptInvitationVars {
  token: string;
  parentName: string;
  short: string;
  color: string;
}

interface CreateChildVars {
  familyId: string;
  name: string;
  birthday: string; // ISO date YYYY-MM-DD
  color: string;
  school: string | null;
  allergies: string[];
}

interface CreateInvitationVars {
  familyId: string;
}

export function useCreateFamily() {
  const qc = useQueryClient();
  const { userId } = useSession();
  return useMutation({
    mutationFn: async ({ familyName, parentName, short, color }: CreateFamilyVars) => {
      const { data, error } = await supabase.rpc("create_family", {
        p_family_name: familyName,
        p_parent_name: parentName,
        p_short: short,
        p_color: color,
      });
      if (error) throw error;
      return data as string; // family_id
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: currentParentKey(userId) });
    },
  });
}

export function useAcceptInvitation() {
  const qc = useQueryClient();
  const { userId } = useSession();
  return useMutation({
    mutationFn: async ({ token, parentName, short, color }: AcceptInvitationVars) => {
      const { data, error } = await supabase.rpc("accept_invitation", {
        p_token: token,
        p_parent_name: parentName,
        p_short: short,
        p_color: color,
      });
      if (error) throw error;
      return data as string; // family_id
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: currentParentKey(userId) });
    },
  });
}

export function useCreateChild() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: CreateChildVars) => {
      const insert: ChildInsert = {
        family_id: vars.familyId,
        name: vars.name,
        birthday: vars.birthday,
        color: vars.color,
        school: vars.school,
        allergies: vars.allergies,
      };
      const { data, error } = await supabase.from("children").insert(insert).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ["family", vars.familyId, "children"] });
    },
  });
}

export function useCreateInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ familyId }: CreateInvitationVars): Promise<InvitationRow> => {
      const { data, error } = await supabase
        .from("family_invitations")
        .insert({ family_id: familyId })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ["family", vars.familyId, "invitations"] });
    },
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: PASS. If `family_invitations` types are missing from `database.types.ts`, regenerate via Supabase MCP `generate_typescript_types` and overwrite `features/supabase/database.types.ts` — then commit that as a separate prep commit before continuing.

- [ ] **Step 3: Commit**

```bash
git add features/auth/onboardingMutations.ts
git commit -m "feat(auth): RPC + insert mutations for onboarding (family/child/invite)"
```

### Task 1.6 — `AuthGate` — pure routing function + React wrapper

The routing decision is a pure function. Test the pure function exhaustively, then wrap it in `<AuthGate>`.

**Files:**

- Create: `features/auth/decideRoute.ts`
- Create: `features/auth/decideRoute.test.ts`
- Create: `features/auth/AuthGate.tsx`

- [ ] **Step 1: Write the failing test**

`features/auth/decideRoute.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { decideRoute, type RouteDecisionInput } from "./decideRoute";

function input(partial: Partial<RouteDecisionInput>): RouteDecisionInput {
  return {
    sessionStatus: "loading",
    hasParent: false,
    currentGroup: "tabs",
    parentIsLoading: false,
    ...partial,
  };
}

describe("decideRoute", () => {
  test("loading session → wait (null)", () => {
    expect(decideRoute(input({ sessionStatus: "loading" }))).toBeNull();
  });

  test("authenticated + parent query still loading → wait (null)", () => {
    expect(
      decideRoute(input({ sessionStatus: "authenticated", parentIsLoading: true })),
    ).toBeNull();
  });

  test("unauthenticated outside (auth) → redirect to login", () => {
    expect(decideRoute(input({ sessionStatus: "unauthenticated", currentGroup: "tabs" }))).toBe(
      "/(auth)/login",
    );
    expect(
      decideRoute(input({ sessionStatus: "unauthenticated", currentGroup: "onboarding" })),
    ).toBe("/(auth)/login");
  });

  test("unauthenticated in (auth) → stay (null)", () => {
    expect(
      decideRoute(input({ sessionStatus: "unauthenticated", currentGroup: "auth" })),
    ).toBeNull();
  });

  test("authenticated + no parent + outside (onboarding) → redirect to onboarding step 2", () => {
    expect(
      decideRoute(
        input({ sessionStatus: "authenticated", hasParent: false, currentGroup: "tabs" }),
      ),
    ).toBe("/(onboarding)/2");
    expect(
      decideRoute(
        input({ sessionStatus: "authenticated", hasParent: false, currentGroup: "auth" }),
      ),
    ).toBe("/(onboarding)/2");
  });

  test("authenticated + no parent + in (onboarding) → stay (null)", () => {
    expect(
      decideRoute(
        input({ sessionStatus: "authenticated", hasParent: false, currentGroup: "onboarding" }),
      ),
    ).toBeNull();
  });

  test("authenticated + parent + in (auth) → redirect to tabs", () => {
    expect(
      decideRoute(input({ sessionStatus: "authenticated", hasParent: true, currentGroup: "auth" })),
    ).toBe("/(tabs)");
  });

  test("authenticated + parent + in (onboarding) → stay (mid-flow after step 2)", () => {
    expect(
      decideRoute(
        input({ sessionStatus: "authenticated", hasParent: true, currentGroup: "onboarding" }),
      ),
    ).toBeNull();
  });

  test("authenticated + parent + in (tabs) → stay (null)", () => {
    expect(
      decideRoute(input({ sessionStatus: "authenticated", hasParent: true, currentGroup: "tabs" })),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

Run: `bun test features/auth/decideRoute.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `decideRoute`**

`features/auth/decideRoute.ts`:

```ts
import type { SessionStatus } from "./session";

export type RouteGroup = "auth" | "onboarding" | "tabs" | "other";

export interface RouteDecisionInput {
  sessionStatus: SessionStatus;
  hasParent: boolean;
  parentIsLoading: boolean;
  currentGroup: RouteGroup;
}

export type RoutePath = "/(auth)/login" | "/(onboarding)/2" | "/(tabs)";

/**
 * Decide whether to redirect, given session + parent + current location.
 * Returns `null` to mean "stay where you are".
 *
 * Critical rule: a user inside (onboarding) is never auto-redirected to
 * (tabs) when the parent row appears mid-flow (which happens right after
 * Step 2 commits via create_family RPC). Only Step 5's explicit "Zum
 * Dashboard" button leaves the onboarding group.
 */
export function decideRoute(input: RouteDecisionInput): RoutePath | null {
  if (input.sessionStatus === "loading") return null;
  if (input.sessionStatus === "authenticated" && input.parentIsLoading) return null;

  if (input.sessionStatus === "unauthenticated") {
    return input.currentGroup === "auth" ? null : "/(auth)/login";
  }

  // authenticated
  if (!input.hasParent) {
    return input.currentGroup === "onboarding" ? null : "/(onboarding)/2";
  }

  // authenticated + has parent
  if (input.currentGroup === "auth") return "/(tabs)";
  return null;
}
```

- [ ] **Step 4: Run the test, expect pass**

Run: `bun test features/auth/decideRoute.test.ts`
Expected: PASS — 9 tests.

- [ ] **Step 5: Implement `AuthGate` React wrapper**

`features/auth/AuthGate.tsx`:

```tsx
import { Redirect, useSegments } from "expo-router";
import { type ReactNode } from "react";
import { View } from "react-native";

import { useTheme } from "@/design-system/ThemeProvider";

import { decideRoute, type RouteGroup } from "./decideRoute";
import { useSession } from "./session";
import { useCurrentParent } from "./useCurrentParent";

function segmentToGroup(segment: string | undefined): RouteGroup {
  if (segment === "(auth)") return "auth";
  if (segment === "(onboarding)") return "onboarding";
  if (segment === "(tabs)") return "tabs";
  return "other";
}

function SplashFallback() {
  const { theme } = useTheme();
  return <View style={{ flex: 1, backgroundColor: theme.bg }} />;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const parent = useCurrentParent();
  const segments = useSegments();
  const currentGroup = segmentToGroup(segments[0]);

  const target = decideRoute({
    sessionStatus: status,
    hasParent: parent.data != null,
    parentIsLoading: parent.isLoading,
    currentGroup,
  });

  if (status === "loading") return <SplashFallback />;
  if (status === "authenticated" && parent.isLoading) return <SplashFallback />;
  if (target) return <Redirect href={target} />;
  return <>{children}</>;
}
```

- [ ] **Step 6: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add features/auth/decideRoute.ts features/auth/decideRoute.test.ts features/auth/AuthGate.tsx
git commit -m "feat(auth): AuthGate with pure decideRoute (9 routing scenarios tested)"
```

### Task 1.7 — `deepLinkHandler.ts` — parse + dispatch

Three URL types: `auth/confirm`, `auth/recovery`, `invite/<token>`.

**Files:**

- Create: `features/auth/deepLinkHandler.ts`
- Create: `features/auth/deepLinkHandler.test.ts`

- [ ] **Step 1: Write the failing test**

`features/auth/deepLinkHandler.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { parseDeepLink, type ParsedDeepLink } from "./deepLinkHandler";

describe("parseDeepLink", () => {
  test("confirm URL with token_hash and type=email", () => {
    const result = parseDeepLink("elternflow://auth/confirm?token_hash=abc123&type=email");
    const expected: ParsedDeepLink = {
      kind: "auth-confirm",
      tokenHash: "abc123",
      otpType: "email",
    };
    expect(result).toEqual(expected);
  });

  test("recovery URL", () => {
    const result = parseDeepLink("elternflow://auth/recovery?token_hash=xyz789&type=recovery");
    expect(result).toEqual({
      kind: "auth-recovery",
      tokenHash: "xyz789",
      otpType: "recovery",
    });
  });

  test("invite URL with token in path", () => {
    const result = parseDeepLink("elternflow://invite/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    expect(result).toEqual({
      kind: "invite",
      token: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    });
  });

  test("missing token_hash → null (malformed)", () => {
    expect(parseDeepLink("elternflow://auth/confirm?type=email")).toBeNull();
  });

  test("unknown host → null", () => {
    expect(parseDeepLink("elternflow://settings")).toBeNull();
  });

  test("non-elternflow scheme → null", () => {
    expect(parseDeepLink("https://example.com/auth/confirm")).toBeNull();
  });

  test("invalid URL string → null", () => {
    expect(parseDeepLink("not a url")).toBeNull();
    expect(parseDeepLink("")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

Run: `bun test features/auth/deepLinkHandler.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`features/auth/deepLinkHandler.ts`:

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import { router } from "expo-router";

import { supabase } from "@/features/supabase";

export type ParsedDeepLink =
  | { kind: "auth-confirm"; tokenHash: string; otpType: "email" }
  | { kind: "auth-recovery"; tokenHash: string; otpType: "recovery" }
  | { kind: "invite"; token: string };

const PENDING_INVITE_KEY = "auth.pendingInvite";

function tryParseUrl(input: string): URL | null {
  if (!input) return null;
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

export function parseDeepLink(rawUrl: string): ParsedDeepLink | null {
  const url = tryParseUrl(rawUrl);
  if (!url) return null;
  if (url.protocol !== "elternflow:") return null;

  const host = url.hostname || url.pathname.split("/")[1];

  if (host === "auth") {
    const subPath = url.pathname.replace(/^\/+/, "").split("/").filter(Boolean);
    const action = host === url.hostname ? subPath[0] : subPath[1];
    const tokenHash = url.searchParams.get("token_hash");
    const type = url.searchParams.get("type");
    if (!tokenHash) return null;
    if (action === "confirm" && type === "email") {
      return { kind: "auth-confirm", tokenHash, otpType: "email" };
    }
    if (action === "recovery" && type === "recovery") {
      return { kind: "auth-recovery", tokenHash, otpType: "recovery" };
    }
    return null;
  }

  if (host === "invite") {
    const segments = (url.hostname ? url.pathname : url.pathname)
      .replace(/^\/+/, "")
      .split("/")
      .filter(Boolean);
    const token = url.hostname === "invite" ? segments[0] : segments[1];
    if (!token) return null;
    return { kind: "invite", token };
  }

  return null;
}

export async function getPendingInviteToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(PENDING_INVITE_KEY);
  } catch {
    return null;
  }
}

export async function clearPendingInviteToken(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PENDING_INVITE_KEY);
  } catch {
    /* ignore — best-effort */
  }
}

/** Called from app/_layout.tsx. Returns a cleanup function. */
export function initDeepLinkHandler(): () => void {
  const handle = async (rawUrl: string | null) => {
    if (!rawUrl) return;
    const parsed = parseDeepLink(rawUrl);
    if (!parsed) return;

    if (parsed.kind === "auth-confirm" || parsed.kind === "auth-recovery") {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: parsed.tokenHash,
        type: parsed.otpType,
      });
      if (error) {
        console.warn("[deepLinkHandler] verifyOtp failed", error);
        if (parsed.kind === "auth-recovery") {
          router.replace("/(auth)/reset-password");
        }
        return;
      }
      if (parsed.kind === "auth-recovery") {
        router.replace("/(auth)/new-password");
      }
      // For confirm: AuthGate will route to /(onboarding)/2 once the session is set.
      return;
    }

    if (parsed.kind === "invite") {
      // Stash so onboarding can pick it up after sign-in.
      try {
        await AsyncStorage.setItem(PENDING_INVITE_KEY, parsed.token);
      } catch (e) {
        console.warn("[deepLinkHandler] failed to stash invite", e);
      }
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace("/(auth)/login");
        return;
      }
      // Has a session — let onboarding/2 consume the invite. Step 2 reads
      // pendingInvite from AsyncStorage. AuthGate handles "already in a
      // family" routing.
      router.replace("/(onboarding)/2");
      return;
    }
  };

  void Linking.getInitialURL().then(handle);
  const sub = Linking.addEventListener("url", ({ url }) => void handle(url));
  return () => sub.remove();
}
```

- [ ] **Step 4: Run the test, expect pass**

Run: `bun test features/auth/deepLinkHandler.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add features/auth/deepLinkHandler.ts features/auth/deepLinkHandler.test.ts
git commit -m "feat(auth): deepLinkHandler for confirm/recovery/invite URLs"
```

### Task 1.8 — Wire `AuthGate` + `initDeepLinkHandler` into root layout

**Files:**

- Modify: `app/_layout.tsx`

- [ ] **Step 1: Read the current file**

You already have its contents from the spec exploration. The change is: import from `@/features/auth` instead of `@/features/calendar`, mount `<AuthGate>` around `<Stack>`, init the deep-link handler, and add the new route groups to the stack.

- [ ] **Step 2: Replace the file**

Replace `app/_layout.tsx` with:

```tsx
import "@/global.css";
import "@/features/i18n";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ThemeProvider, useTheme } from "@/design-system/ThemeProvider";
import { AuthGate, initDeepLinkHandler, useInitSession } from "@/features/auth";

function ThemedStack() {
  const { theme } = useTheme();
  useInitSession();
  useEffect(() => initDeepLinkHandler(), []);
  return (
    <AuthGate>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="recipe/[id]" options={{ presentation: "modal", headerShown: false }} />
        <Stack.Screen
          name="event/[id]"
          options={{
            presentation: "formSheet",
            headerShown: false,
            gestureEnabled: true,
            sheetAllowedDetents: [0.72],
            sheetCornerRadius: 26,
            sheetGrabberVisible: true,
            contentStyle: { flex: 1, backgroundColor: theme.bg },
          }}
        />
        <Stack.Screen
          name="event/edit/[id]"
          options={{
            presentation: "formSheet",
            headerShown: false,
            gestureEnabled: true,
            sheetAllowedDetents: [0.85],
            sheetCornerRadius: 26,
            sheetGrabberVisible: true,
            contentStyle: { flex: 1, backgroundColor: theme.bg },
          }}
        />
        <Stack.Screen name="child/[id]" options={{ presentation: "card", headerShown: false }} />
        <Stack.Screen name="child/new" options={{ presentation: "card", headerShown: false }} />
        <Stack.Screen
          name="settings"
          options={{
            presentation: "formSheet",
            headerShown: false,
            gestureEnabled: true,
            sheetAllowedDetents: [0.82],
            sheetCornerRadius: 26,
            sheetGrabberVisible: true,
            sheetExpandsWhenScrolledToEdge: false,
            contentStyle: { flex: 1, backgroundColor: theme.bg },
          }}
        />
        <Stack.Screen name="+not-found" options={{ presentation: "modal" }} />
      </Stack>
    </AuthGate>
  );
}

export default function RootLayout() {
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, staleTime: 30_000 },
        },
      }),
    [],
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <StatusBar style="auto" />
            <ThemedStack />
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: PASS (`@/features/auth` doesn't yet have a barrel — Task 1.9 adds it. Either do Task 1.9 first, or temporarily import from the individual files: `from "@/features/auth/AuthGate"` etc. then switch to barrel in Task 1.9).

- [ ] **Step 4: Commit**

Defer this commit until after Task 1.9 — they go together.

### Task 1.9 — `features/auth/index.ts` barrel + delete obsolete calendar session usage

**Files:**

- Create: `features/auth/index.ts`

- [ ] **Step 1: Write the barrel**

`features/auth/index.ts`:

```ts
export { AuthGate } from "./AuthGate";
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
```

- [ ] **Step 2: Typecheck + lint**

Run: `bun run check`
Expected: PASS.

- [ ] **Step 3: Commit (combined with Task 1.8)**

```bash
git add features/auth/index.ts app/_layout.tsx
git commit -m "feat(auth): mount AuthGate + deep-link handler in root layout"
```

### Task 1.10 — Phase 1 verification

- [ ] **Step 1: Full test suite**

Run: `bun test`
Expected: all tests PASS — existing tests + the new auth/session/parent/errors/decideRoute/deepLinkHandler tests.

- [ ] **Step 2: Full lint + typecheck**

Run: `bun run check`
Expected: PASS.

- [ ] **Step 3: Note about runtime smoke**

The app won't successfully render yet — `(auth)` and `(onboarding)` route groups don't exist, so any redirect to them throws. That's fine; Phase 2 adds them. Do NOT try to launch the app between Phase 1 and Phase 2.

---

## Phase 2 — Auth Screens (Login, Register, Check-Email)

### Task 2.1 — i18n keys for auth (DE + EN)

**Files:**

- Modify: `features/i18n/locales/de.json`
- Modify: `features/i18n/locales/en.json`

- [ ] **Step 1: Read current shape**

Run: `head -20 features/i18n/locales/de.json`
Confirm the JSON structure (nested or flat-with-dots). The plan assumes **nested** (`auth: { signIn: "Anmelden", ... }`) — adjust if the existing file uses flat dot-keys.

- [ ] **Step 2: Add new keys**

Add under `auth` in DE:

```json
"auth": {
  "signIn": "Anmelden",
  "signUp": "Konto erstellen",
  "signOut": "Abmelden",
  "email": "E-Mail",
  "password": "Passwort",
  "forgot": "Passwort vergessen?",
  "stay": "Eingeloggt bleiben",
  "or": "ODER",
  "google": "Mit Google anmelden",
  "apple": "Mit Apple anmelden",
  "tagline": "Der KI-Assistent für moderne Familien.",
  "newHere": "Neu hier?",
  "soon": "Bald verfügbar",
  "register": {
    "title": "Konto erstellen",
    "sub": "Mit dieser E-Mail teilst du später Kalender und Listen mit deinem Partner.",
    "terms": "Ich stimme den AGB und der Datenschutzerklärung zu.",
    "submit": "Konto erstellen"
  },
  "checkEmail": {
    "title": "Schau in dein Postfach",
    "sub": "Wir haben dir einen Link an {{email}} geschickt. Tippe ihn an, um deine E-Mail zu bestätigen.",
    "resend": "Mail erneut senden",
    "wrongEmail": "Falsche E-Mail? Zurück"
  },
  "reset": {
    "title": "Passwort zurücksetzen",
    "sub": "Wir senden dir einen Link an deine E-Mail.",
    "submit": "Link senden",
    "success": "Falls die E-Mail registriert ist, findest du gleich einen Link in deinem Postfach.",
    "backToLogin": "Doch wieder eingefallen? Anmelden"
  },
  "newPassword": {
    "title": "Neues Passwort wählen",
    "sub": "Mind. 8 Zeichen. Buchstaben und Zahlen empfohlen.",
    "newField": "Neues Passwort",
    "confirmField": "Bestätigen",
    "save": "Passwort speichern",
    "pwMismatch": "Die Passwörter stimmen nicht überein.",
    "saved": "Passwort geändert. Bitte erneut anmelden."
  },
  "password": {
    "strength": {
      "weak": "Schwach",
      "fair": "Okay",
      "good": "Gut",
      "strong": "Stark"
    }
  },
  "error": {
    "title": "E-Mail oder Passwort falsch",
    "help": "Versuch es noch einmal oder setze dein Passwort zurück.",
    "invalidCredentials": "E-Mail oder Passwort falsch.",
    "emailTaken": "Diese E-Mail ist bereits registriert.",
    "emailNotConfirmed": "Bitte bestätige zuerst deine E-Mail.",
    "weakPassword": "Mindestens 8 Zeichen, bitte.",
    "alreadyInFamily": "Du gehörst bereits zu einer Familie.",
    "linkExpired": "Der Link ist abgelaufen oder wurde bereits verwendet.",
    "notAuthenticated": "Bitte erneut anmelden.",
    "network": "Verbindung fehlgeschlagen. Bitte später erneut versuchen.",
    "generic": "Etwas ist schiefgelaufen. Bitte später erneut versuchen."
  }
}
```

And the matching English under `auth` in EN:

```json
"auth": {
  "signIn": "Sign in",
  "signUp": "Create account",
  "signOut": "Sign out",
  "email": "Email",
  "password": "Password",
  "forgot": "Forgot password?",
  "stay": "Stay signed in",
  "or": "OR",
  "google": "Continue with Google",
  "apple": "Continue with Apple",
  "tagline": "The AI assistant for modern families.",
  "newHere": "New here?",
  "soon": "Coming soon",
  "register": {
    "title": "Create your account",
    "sub": "You'll use this email to share calendar and lists with your partner.",
    "terms": "I agree to the terms and privacy policy.",
    "submit": "Create account"
  },
  "checkEmail": {
    "title": "Check your inbox",
    "sub": "We sent a link to {{email}}. Tap it to confirm your email.",
    "resend": "Resend email",
    "wrongEmail": "Wrong email? Go back"
  },
  "reset": {
    "title": "Reset password",
    "sub": "We'll send a link to your email.",
    "submit": "Send link",
    "success": "If that email is registered, you'll find a link in your inbox shortly.",
    "backToLogin": "Remembered it? Sign in"
  },
  "newPassword": {
    "title": "Pick a new password",
    "sub": "At least 8 characters. Letters and numbers recommended.",
    "newField": "New password",
    "confirmField": "Confirm",
    "save": "Save password",
    "pwMismatch": "Passwords do not match.",
    "saved": "Password updated. Please sign in again."
  },
  "password": {
    "strength": {
      "weak": "Weak",
      "fair": "OK",
      "good": "Good",
      "strong": "Strong"
    }
  },
  "error": {
    "title": "Email or password incorrect",
    "help": "Try again or reset your password.",
    "invalidCredentials": "Email or password incorrect.",
    "emailTaken": "This email is already registered.",
    "emailNotConfirmed": "Please confirm your email first.",
    "weakPassword": "At least 8 characters, please.",
    "alreadyInFamily": "You're already part of a family.",
    "linkExpired": "This link has expired or was already used.",
    "notAuthenticated": "Please sign in again.",
    "network": "Connection failed. Please try again later.",
    "generic": "Something went wrong. Please try again later."
  }
}
```

If the existing JSON has different `auth.*` keys already (`signIn`, `tagline`, etc.), **merge** instead of replacing — keep all existing keys and only add the missing ones.

- [ ] **Step 3: Verify lint passes**

Run: `bun run lint`
Expected: PASS. The `eslint-plugin-i18next` rule will flag any unused/missing keys later when screens use them.

- [ ] **Step 4: Commit**

```bash
git add features/i18n/locales/de.json features/i18n/locales/en.json
git commit -m "feat(i18n): auth + reset-password + new-password catalogs (DE/EN)"
```

### Task 2.2 — `app/(auth)/_layout.tsx`

**Files:**

- Create: `app/(auth)/_layout.tsx`

- [ ] **Step 1: Implement**

```tsx
import { Stack } from "expo-router";

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "fade",
        contentStyle: { backgroundColor: "transparent" },
      }}
    />
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(auth)/_layout.tsx"
git commit -m "feat(auth): (auth) route group layout"
```

### Task 2.3 — `LoginScreen` + route file

The visual spec is in [patterns/login.md](../../../patterns/login.md) — V1 (centered). Social-Buttons + Magic-Link render as disabled with `auth.soon` tooltip-ish caption.

**Files:**

- Create: `app-sections/auth/LoginScreen.tsx`
- Create: `app/(auth)/login.tsx`

- [ ] **Step 1: Implement `LoginScreen`**

`app-sections/auth/LoginScreen.tsx`:

```tsx
import { Link, router } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Field } from "@/app-sections/shared";
import { Button, Text } from "@/design-system/ui";
import { mapAuthError, useSignIn } from "@/features/auth";

export function LoginScreen() {
  const { t } = useTranslation();
  const signIn = useSignIn();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const errorKey = signIn.error ? mapAuthError(signIn.error) : null;
  const canSubmit = email.trim().length > 0 && password.length > 0 && !signIn.isPending;

  async function onSubmit() {
    if (!canSubmit) return;
    try {
      await signIn.mutateAsync({ email: email.trim(), password });
      // AuthGate routes based on parent presence.
    } catch {
      // error rendered via signIn.error → errorKey
    }
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: 24, justifyContent: "center" }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ alignItems: "center", marginBottom: 32 }}>
          <Text variant="h1" tone="ink">
            Eltern Flow
          </Text>
          <Text variant="body" tone="inkSecondary" style={{ marginTop: 8, textAlign: "center" }}>
            {t("auth.tagline")}
          </Text>
        </View>

        {errorKey ? (
          <View
            className="mb-4 rounded-xl border border-danger bg-danger-soft p-3"
            accessibilityRole="alert"
          >
            <Text variant="bodyStrong" tone="danger">
              {t("auth.error.title")}
            </Text>
            <Text variant="body" tone="danger">
              {t(errorKey)}
            </Text>
          </View>
        ) : null}

        <View style={{ gap: 16 }}>
          <Field
            label={t("auth.email")}
            iconName="mail"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            placeholder="name@example.com"
          />
          <Field
            label={t("auth.password")}
            iconName="lock"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
          />
        </View>

        <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 12 }}>
          <Link href="/(auth)/reset-password" asChild>
            <Text variant="caption" tone="primaryStrong">
              {t("auth.forgot")}
            </Text>
          </Link>
        </View>

        <Button
          label={signIn.isPending ? "…" : t("auth.signIn")}
          tone="primary"
          variant="solid"
          size="lg"
          block
          loading={signIn.isPending}
          onPress={onSubmit}
          disabled={!canSubmit}
          className="mt-6"
        />

        <View className="my-6 flex-row items-center gap-3">
          <View className="h-px flex-1 bg-line" />
          <Text variant="caption" tone="inkTertiary">
            {t("auth.or")}
          </Text>
          <View className="h-px flex-1 bg-line" />
        </View>

        <View style={{ gap: 12 }}>
          <Button
            label={`${t("auth.google")} (${t("auth.soon")})`}
            tone="neutral"
            variant="soft"
            size="lg"
            block
            disabled
          />
          <Button
            label={`${t("auth.apple")} (${t("auth.soon")})`}
            tone="neutral"
            variant="soft"
            size="lg"
            block
            disabled
          />
        </View>

        <View style={{ flexDirection: "row", justifyContent: "center", marginTop: 24, gap: 4 }}>
          <Text variant="body" tone="inkSecondary">
            {t("auth.newHere")}
          </Text>
          <Text
            variant="bodyStrong"
            tone="primaryStrong"
            onPress={() => router.push("/(auth)/register")}
          >
            {t("auth.signUp")}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Create the route file**

`app/(auth)/login.tsx`:

```tsx
export { LoginScreen as default } from "@/app-sections/auth/LoginScreen";
```

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: PASS. If `Text` doesn't accept `onPress`, wrap it in a `<Pressable>` instead — adjust to match the existing `Text` component's API.

- [ ] **Step 4: Commit**

```bash
git add app-sections/auth/LoginScreen.tsx "app/(auth)/login.tsx"
git commit -m "feat(auth): LoginScreen — email/password sign-in with disabled social/magic-link"
```

### Task 2.4 — `RegisterScreen` + route

**Files:**

- Create: `app-sections/auth/RegisterScreen.tsx`
- Create: `app/(auth)/register.tsx`
- Create: `features/auth/passwordStrength.ts`
- Create: `features/auth/passwordStrength.test.ts`

- [ ] **Step 1: Write failing test for password strength**

`features/auth/passwordStrength.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { passwordStrength } from "./passwordStrength";

describe("passwordStrength", () => {
  test("returns 0 for empty", () => {
    expect(passwordStrength("").score).toBe(0);
    expect(passwordStrength("").label).toBe("weak");
  });
  test("scores by length + variety (1-4 bars)", () => {
    expect(passwordStrength("abc").score).toBe(1);
    expect(passwordStrength("abcdefgh").score).toBe(2);
    expect(passwordStrength("abcdefg1").score).toBe(3);
    expect(passwordStrength("Abcdefg1!").score).toBe(4);
  });
  test("acceptable starts at score >= 3", () => {
    expect(passwordStrength("abcdefg1").acceptable).toBe(true);
    expect(passwordStrength("abcdefgh").acceptable).toBe(false);
  });
});
```

- [ ] **Step 2: Run, expect fail**

Run: `bun test features/auth/passwordStrength.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`features/auth/passwordStrength.ts`:

```ts
export type StrengthLabel = "weak" | "fair" | "good" | "strong";

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: StrengthLabel;
  acceptable: boolean;
}

export function passwordStrength(input: string): PasswordStrength {
  if (input.length === 0) return { score: 0, label: "weak", acceptable: false };

  let score = 0;
  if (input.length >= 6) score += 1;
  if (input.length >= 8) score += 1;
  if (/\d/.test(input)) score += 1;
  if (/[A-Z]/.test(input) && /[^a-zA-Z0-9]/.test(input)) score += 1;

  const clamped = Math.min(4, Math.max(1, score)) as 1 | 2 | 3 | 4;
  const label: StrengthLabel =
    clamped === 1 ? "weak" : clamped === 2 ? "fair" : clamped === 3 ? "good" : "strong";

  return { score: clamped, label, acceptable: clamped >= 3 };
}
```

- [ ] **Step 4: Run, expect pass**

Run: `bun test features/auth/passwordStrength.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Add to barrel**

Edit `features/auth/index.ts` — append:

```ts
export { passwordStrength, type PasswordStrength, type StrengthLabel } from "./passwordStrength";
```

- [ ] **Step 6: Implement `RegisterScreen`**

`app-sections/auth/RegisterScreen.tsx`:

```tsx
import { router } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Field, Icon } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Text } from "@/design-system/ui";
import { mapAuthError, passwordStrength, useSignUp } from "@/features/auth";

function StrengthMeter({ score }: { score: number }) {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 4, marginTop: 6 }}>
      {[1, 2, 3, 4].map((bar) => (
        <View
          key={bar}
          style={{
            flex: 1,
            height: 4,
            borderRadius: 2,
            backgroundColor: score >= bar ? theme.primary : theme.line,
          }}
        />
      ))}
    </View>
  );
}

export function RegisterScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const signUp = useSignUp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);

  const strength = passwordStrength(password);
  const errorKey = signUp.error ? mapAuthError(signUp.error) : null;
  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSubmit = emailLooksValid && strength.acceptable && termsAccepted && !signUp.isPending;

  async function onSubmit() {
    if (!canSubmit) return;
    try {
      await signUp.mutateAsync({ email: email.trim(), password });
      router.replace({ pathname: "/(auth)/check-email", params: { email: email.trim() } });
    } catch {
      /* error rendered below */
    }
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} style={{ marginBottom: 16 }} hitSlop={10}>
          <Icon name="arrow-left" size={24} color={theme.ink} />
        </Pressable>

        <Text variant="h2" tone="ink">
          {t("auth.register.title")}
        </Text>
        <Text variant="body" tone="inkSecondary" style={{ marginTop: 8 }}>
          {t("auth.register.sub")}
        </Text>

        {errorKey ? (
          <View
            className="mt-4 rounded-xl border border-danger bg-danger-soft p-3"
            accessibilityRole="alert"
          >
            <Text variant="body" tone="danger">
              {t(errorKey)}
            </Text>
          </View>
        ) : null}

        <View style={{ gap: 16, marginTop: 24 }}>
          <Field
            label={t("auth.email")}
            iconName="mail"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            placeholder="name@example.com"
          />
          <View>
            <Field
              label={t("auth.password")}
              iconName="lock"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
            />
            {password.length > 0 ? (
              <View style={{ marginTop: 8 }}>
                <StrengthMeter score={strength.score} />
                <Text variant="caption" tone="inkSecondary" style={{ marginTop: 4 }}>
                  {t(`auth.password.strength.${strength.label}`)}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <Pressable
          onPress={() => setTermsAccepted((v) => !v)}
          style={{ flexDirection: "row", gap: 12, alignItems: "flex-start", marginTop: 20 }}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: termsAccepted }}
        >
          <View
            style={{
              width: 20,
              height: 20,
              borderRadius: 4,
              borderWidth: 2,
              borderColor: termsAccepted ? theme.primary : theme.line,
              backgroundColor: termsAccepted ? theme.primary : "transparent",
              alignItems: "center",
              justifyContent: "center",
              marginTop: 2,
            }}
          >
            {termsAccepted ? <Icon name="check" size={14} color={theme.onMint} /> : null}
          </View>
          <Text variant="body" tone="inkSecondary" style={{ flex: 1 }}>
            {t("auth.register.terms")}
          </Text>
        </Pressable>

        <Button
          label={t("auth.register.submit")}
          tone="primary"
          variant="solid"
          size="lg"
          block
          loading={signUp.isPending}
          onPress={onSubmit}
          disabled={!canSubmit}
          className="mt-6"
        />
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 7: Create route file**

`app/(auth)/register.tsx`:

```tsx
export { RegisterScreen as default } from "@/app-sections/auth/RegisterScreen";
```

- [ ] **Step 8: Typecheck**

Run: `bun run check`
Expected: PASS. If `Icon` lacks an `arrow-left` or `check` name, pick the closest existing name from `app-sections/shared/Icon.tsx`.

- [ ] **Step 9: Commit**

```bash
git add features/auth/passwordStrength.ts features/auth/passwordStrength.test.ts features/auth/index.ts app-sections/auth/RegisterScreen.tsx "app/(auth)/register.tsx"
git commit -m "feat(auth): RegisterScreen with 4-bar strength meter + terms checkbox"
```

### Task 2.5 — `CheckEmailScreen` + route

**Files:**

- Create: `app-sections/auth/CheckEmailScreen.tsx`
- Create: `app/(auth)/check-email.tsx`

- [ ] **Step 1: Implement**

`app-sections/auth/CheckEmailScreen.tsx`:

```tsx
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Icon } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Text } from "@/design-system/ui";
import { supabase } from "@/features/supabase";

export function CheckEmailScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const params = useLocalSearchParams<{ email?: string }>();
  const email = params.email ?? "";
  const [resent, setResent] = useState(false);
  const [pending, setPending] = useState(false);

  async function onResend() {
    if (!email || pending) return;
    setPending(true);
    try {
      // Supabase's dedicated resend endpoint — does NOT require the password.
      await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: "elternflow://auth/confirm" },
      });
    } catch {
      /* swallowed — resend is best-effort UX */
    }
    setResent(true);
    setPending(false);
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 24, flexGrow: 1, justifyContent: "center" }}>
        <View style={{ alignItems: "center", marginBottom: 32 }}>
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: theme.primarySoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="mail" size={36} color={theme.primaryStrong} />
          </View>
        </View>

        <Text variant="h2" tone="ink" style={{ textAlign: "center" }}>
          {t("auth.checkEmail.title")}
        </Text>
        <Text variant="body" tone="inkSecondary" style={{ textAlign: "center", marginTop: 12 }}>
          {t("auth.checkEmail.sub", { email })}
        </Text>

        <Button
          label={resent ? t("auth.checkEmail.title") : t("auth.checkEmail.resend")}
          tone="primary"
          variant="soft"
          size="lg"
          block
          onPress={onResend}
          disabled={resent || pending}
          loading={pending}
          className="mt-8"
        />

        <Pressable onPress={() => router.back()} style={{ marginTop: 16, alignSelf: "center" }}>
          <Text variant="caption" tone="inkSecondary">
            {t("auth.checkEmail.wrongEmail")}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Route file**

`app/(auth)/check-email.tsx`:

```tsx
export { CheckEmailScreen as default } from "@/app-sections/auth/CheckEmailScreen";
```

- [ ] **Step 3: Typecheck**

Run: `bun run check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app-sections/auth/CheckEmailScreen.tsx "app/(auth)/check-email.tsx"
git commit -m "feat(auth): CheckEmailScreen with resend + back-to-register"
```

### Task 2.6 — Manual smoke checkpoint after Phase 2

Phase 2 ends with the user able to:

- Open the app on a fresh install → land on `/(auth)/login`
- Tap "Konto erstellen" → `/(auth)/register`
- Fill the form → submit → land on `/(auth)/check-email`
- Receive the confirm email (depends on Task 0.3 being done)
- Tap the email link → app reopens, AuthGate redirects somewhere — but `/(onboarding)/2` doesn't exist yet, so this **will throw**. That's expected; Phase 4 adds it.

- [ ] **Step 1: Smoke test on simulator**

Run: `bun start` then `i` for iOS sim. Verify:

- Login screen renders
- Form inputs accept input
- "Konto erstellen" navigates to Register
- Register form validates email + password + terms
- Submit creates a Supabase user (verify via MCP or Supabase Dashboard: Authentication → Users)
- Confirm email arrives in inbox

- [ ] **Step 2: If anything fails**

Don't continue to Phase 3. Diagnose: typically either (a) `SETUP.md` URL Configuration is wrong, (b) `auth.signUp` `emailRedirectTo` mismatches the configured redirect URL, or (c) a typo in i18n key.

---

## Phase 3 — Reset-Password Flow

### Task 3.1 — Write `patterns/reset-password.md`

**Files:**

- Create: `patterns/reset-password.md`

- [ ] **Step 1: Write the pattern doc**

```markdown
# Pattern · Reset Password & New Password

## Goal

Recover account access without admin contact. Two screens; deep-link bridge between them; cannot reach the second screen without a valid recovery token.

## Anatomy — Screen 1: Reset Password

1. Top bar with back arrow only (no progress)
2. H2 `auth.reset.title`
3. Sub `auth.reset.sub`
4. Email field
5. Primary CTA `auth.reset.submit`
6. After submit: success banner (`auth.reset.success`) under the button — _always_, regardless of whether the email exists (enumeration protection)
7. Footer link `auth.reset.backToLogin`

## Anatomy — Screen 2: New Password

Reachable only via `elternflow://auth/recovery?token_hash=…&type=recovery`. The deep-link handler verifies the OTP and routes here. If the recovery session is missing, this screen redirects back to `/(auth)/reset-password` with a toast.

1. H2 `auth.newPassword.title`
2. Sub `auth.newPassword.sub`
3. Password field + 4-bar strength meter
4. Confirm password field
5. Primary CTA `auth.newPassword.save`
6. Success: signOut + redirect `/(auth)/login` + toast `auth.newPassword.saved`

## Validation

- Email format check on blur (Screen 1).
- Password ≥ 8 chars, score ≥ 3 (`passwordStrength.acceptable === true`).
- Confirm match — `auth.newPassword.pwMismatch` inline if mismatch.

## Why force sign-out after password change

Recovery sessions are a special transient state. Letting the user remain authenticated after a password change would grant tabs access without a fresh login — sloppy. Force a sign-out and prompt for the new password. One extra step; clean state.

## Accessibility

- Both fields wire to `autoComplete="new-password"`.
- Strength meter labels (`weak`/`fair`/`good`/`strong`) are announced as supplementary text, not as the only error message.
- Error banner has `accessibilityRole="alert"`.
```

- [ ] **Step 2: Commit**

```bash
git add patterns/reset-password.md
git commit -m "docs(patterns): reset-password pattern (two screens + deep-link bridge)"
```

### Task 3.2 — `ResetPasswordScreen` + route

**Files:**

- Create: `app-sections/auth/ResetPasswordScreen.tsx`
- Create: `app/(auth)/reset-password.tsx`

- [ ] **Step 1: Implement**

`app-sections/auth/ResetPasswordScreen.tsx`:

```tsx
import { router } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Field, Icon } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Text } from "@/design-system/ui";
import { useResetPassword } from "@/features/auth";

export function ResetPasswordScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const reset = useResetPassword();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  async function onSubmit() {
    if (!emailLooksValid || reset.isPending) return;
    try {
      await reset.mutateAsync({ email: email.trim() });
    } catch {
      /* enumeration-safe: ignore errors, always show success */
    }
    setSubmitted(true);
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} style={{ marginBottom: 16 }} hitSlop={10}>
          <Icon name="arrow-left" size={24} color={theme.ink} />
        </Pressable>
        <Text variant="h2" tone="ink">
          {t("auth.reset.title")}
        </Text>
        <Text variant="body" tone="inkSecondary" style={{ marginTop: 8 }}>
          {t("auth.reset.sub")}
        </Text>
        <View style={{ marginTop: 24 }}>
          <Field
            label={t("auth.email")}
            iconName="mail"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            placeholder="name@example.com"
          />
        </View>
        <Button
          label={t("auth.reset.submit")}
          tone="primary"
          variant="solid"
          size="lg"
          block
          loading={reset.isPending}
          onPress={onSubmit}
          disabled={!emailLooksValid || reset.isPending}
          className="mt-6"
        />
        {submitted ? (
          <View
            className="mt-4 rounded-xl border border-primary bg-primary-soft p-3"
            accessibilityRole="status"
          >
            <Text variant="body" tone="primaryStrong">
              {t("auth.reset.success")}
            </Text>
          </View>
        ) : null}
        <Pressable
          onPress={() => router.replace("/(auth)/login")}
          style={{ marginTop: 24, alignSelf: "center" }}
        >
          <Text variant="caption" tone="primaryStrong">
            {t("auth.reset.backToLogin")}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Route file**

`app/(auth)/reset-password.tsx`:

```tsx
export { ResetPasswordScreen as default } from "@/app-sections/auth/ResetPasswordScreen";
```

- [ ] **Step 3: Typecheck + commit**

```bash
bun run check
git add app-sections/auth/ResetPasswordScreen.tsx "app/(auth)/reset-password.tsx"
git commit -m "feat(auth): ResetPasswordScreen with enumeration-safe success state"
```

### Task 3.3 — `NewPasswordScreen` + route

**Files:**

- Create: `app-sections/auth/NewPasswordScreen.tsx`
- Create: `app/(auth)/new-password.tsx`

- [ ] **Step 1: Implement**

`app-sections/auth/NewPasswordScreen.tsx`:

```tsx
import { router } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Field } from "@/app-sections/shared";
import { Button, Text } from "@/design-system/ui";
import { mapAuthError, passwordStrength, useSignOut, useUpdatePassword } from "@/features/auth";

export function NewPasswordScreen() {
  const { t } = useTranslation();
  const update = useUpdatePassword();
  const signOut = useSignOut();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const strength = passwordStrength(password);
  const matches = password.length > 0 && password === confirm;
  const errorKey = update.error ? mapAuthError(update.error) : null;
  const canSubmit = strength.acceptable && matches && !update.isPending && !signOut.isPending;

  async function onSubmit() {
    if (!canSubmit) return;
    try {
      await update.mutateAsync({ password });
      await signOut.mutateAsync();
      Alert.alert(t("auth.newPassword.saved"));
      router.replace("/(auth)/login");
    } catch {
      /* error rendered below */
    }
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled">
        <Text variant="h2" tone="ink">
          {t("auth.newPassword.title")}
        </Text>
        <Text variant="body" tone="inkSecondary" style={{ marginTop: 8 }}>
          {t("auth.newPassword.sub")}
        </Text>

        {errorKey ? (
          <View
            className="mt-4 rounded-xl border border-danger bg-danger-soft p-3"
            accessibilityRole="alert"
          >
            <Text variant="body" tone="danger">
              {t(errorKey)}
            </Text>
          </View>
        ) : null}

        <View style={{ gap: 16, marginTop: 24 }}>
          <Field
            label={t("auth.newPassword.newField")}
            iconName="lock"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
          />
          <Field
            label={t("auth.newPassword.confirmField")}
            iconName="lock"
            value={confirm}
            onChangeText={setConfirm}
            placeholder="••••••••"
            error={confirm.length > 0 && !matches ? t("auth.newPassword.pwMismatch") : undefined}
          />
        </View>

        <Button
          label={t("auth.newPassword.save")}
          tone="primary"
          variant="solid"
          size="lg"
          block
          loading={update.isPending || signOut.isPending}
          onPress={onSubmit}
          disabled={!canSubmit}
          className="mt-6"
        />
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Route file**

`app/(auth)/new-password.tsx`:

```tsx
export { NewPasswordScreen as default } from "@/app-sections/auth/NewPasswordScreen";
```

- [ ] **Step 3: Typecheck + commit**

```bash
bun run check
git add app-sections/auth/NewPasswordScreen.tsx "app/(auth)/new-password.tsx"
git commit -m "feat(auth): NewPasswordScreen with strength meter + force sign-out after change"
```

---

## Phase 4 — Onboarding

### Task 4.1 — i18n keys for onboarding

**Files:**

- Modify: `features/i18n/locales/de.json`
- Modify: `features/i18n/locales/en.json`

- [ ] **Step 1: Merge new `onb.*` keys**

Under `onb` in DE — merge with existing (the brainstorming session confirmed `onb.s1–s5` keys exist from `docs/COPY.md`). Add the new sub-keys:

```json
"onb": {
  "stepCounter": "Schritt {{n}} von {{total}}",
  "actions": {
    "next": "Weiter",
    "back": "Zurück",
    "skip": "Überspringen"
  },
  "s2": {
    "title": "Wie heißt deine Familie?",
    "sub": "Du siehst diesen Namen oben auf dem Dashboard.",
    "familyField": "Familienname",
    "parentName": {
      "label": "Dein Name",
      "placeholder": "Anna"
    },
    "color": {
      "label": "Deine Farbe"
    },
    "submit": "Weiter",
    "submitInvite": "Familie beitreten",
    "privacy": {
      "title": "Eure Daten gehören euch",
      "sub": "Verschlüsselt in der EU gespeichert. Keine Werbung."
    }
  },
  "s3": {
    "title": "Lade deinen Partner ein",
    "sub": "Termine, Aufgaben und Einkaufslisten werden in Echtzeit geteilt.",
    "partnerField": "E-Mail des Partners",
    "send": "Einladung senden",
    "later": "Später einladen",
    "shareSubject": "Komm in unsere Eltern-Flow-Familie",
    "shareMessage": "Tritt unserer Familie auf Eltern Flow bei",
    "pendingPill": "Eingeladen",
    "shared": {
      "calendar": "Gemeinsamer Kalender",
      "tasks": "Aufgabenlisten",
      "meals": "Essensplan",
      "children": "Kinderprofile"
    }
  },
  "s4": {
    "title": "Erzähl uns von deinem Kind",
    "sub": "Du kannst weitere Kinder später anlegen — oder die KI mit deiner Stimme bitten.",
    "nameField": "Name",
    "birthdayField": "Geburtstag",
    "schoolField": "Schule / Kita",
    "allergiesLabel": "Allergien & Unverträglichkeiten",
    "voice": "Lieber per Sprache erzählen",
    "save": "Weiter",
    "skip": "Überspringen"
  },
  "s5": {
    "title": "Alles bereit!",
    "sub": "Eltern Flow ist eingerichtet.",
    "cta": "Zum Dashboard",
    "secondary": "Weiteres Kind anlegen",
    "recap": {
      "you": "Du",
      "partner": "Partner",
      "partnerPending": "Eingeladen (noch nicht angenommen)",
      "partnerNone": "Niemand eingeladen",
      "children": "Kinder",
      "childrenNone": "Noch kein Kind angelegt"
    },
    "empty": {
      "title": "Fast geschafft",
      "sub": "Du kannst Partner und Kinder jederzeit hinzufügen."
    }
  }
}
```

And mirror in EN.

- [ ] **Step 2: Lint + commit**

```bash
bun run lint
git add features/i18n/locales/de.json features/i18n/locales/en.json
git commit -m "feat(i18n): onboarding step 2-5 catalogs (DE/EN)"
```

### Task 4.2 — `OnboardingShell` + `(onboarding)` layout + `[step]` dispatcher

**Files:**

- Create: `app-sections/onboarding/OnboardingShell.tsx`
- Create: `app/(onboarding)/_layout.tsx`
- Create: `app/(onboarding)/[step].tsx`
- Create: `app-sections/onboarding/OnboardingStepScreen.tsx`

- [ ] **Step 1: Implement `OnboardingShell`**

`app-sections/onboarding/OnboardingShell.tsx`:

```tsx
import { router } from "expo-router";
import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Icon } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Text } from "@/design-system/ui";

interface OnboardingShellProps {
  step: 2 | 3 | 4 | 5;
  total?: number;
  showSkip?: boolean;
  onSkip?: () => void;
  children: ReactNode;
  footer: ReactNode;
}

export function OnboardingShell({
  step,
  total = 5,
  showSkip = false,
  onSkip,
  children,
  footer,
}: OnboardingShellProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 16,
          paddingVertical: 12,
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Icon name="arrow-left" size={24} color={theme.ink} />
        </Pressable>
        <View style={{ flexDirection: "row", gap: 6 }}>
          {Array.from({ length: total }).map((_, i) => {
            const active = i + 1 <= step;
            return (
              <View
                key={i}
                style={{
                  width: 22,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: active ? theme.primary : theme.lineStrong,
                }}
              />
            );
          })}
        </View>
        {showSkip ? (
          <Pressable onPress={onSkip} hitSlop={10}>
            <Text variant="caption" tone="inkSecondary">
              {t("onb.actions.skip")}
            </Text>
          </Pressable>
        ) : (
          <View style={{ width: 24 }} />
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 24, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text variant="caption" tone="inkSecondary" style={{ textTransform: "uppercase" }}>
          {t("onb.stepCounter", { n: step, total })}
        </Text>
        {children}
      </ScrollView>

      <View
        style={{
          paddingHorizontal: 24,
          paddingTop: 12,
          paddingBottom: 24,
          gap: 8,
          borderTopWidth: 1,
          borderTopColor: theme.line,
          backgroundColor: theme.bg,
        }}
      >
        {footer}
      </View>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: `(onboarding)/_layout.tsx`**

`app/(onboarding)/_layout.tsx`:

```tsx
import { Stack } from "expo-router";

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
      }}
    />
  );
}
```

- [ ] **Step 3: `[step].tsx` dispatcher**

`app/(onboarding)/[step].tsx`:

```tsx
export { OnboardingStepScreen as default } from "@/app-sections/onboarding/OnboardingStepScreen";
```

- [ ] **Step 4: `OnboardingStepScreen` dispatcher**

`app-sections/onboarding/OnboardingStepScreen.tsx`:

```tsx
import { useLocalSearchParams } from "expo-router";

import { Step2FamilyAndName } from "./Step2FamilyAndName";
import { Step3InvitePartner } from "./Step3InvitePartner";
import { Step4FirstChild } from "./Step4FirstChild";
import { Step5Done } from "./Step5Done";

export function OnboardingStepScreen() {
  const { step } = useLocalSearchParams<{ step?: string }>();
  switch (step) {
    case "2":
      return <Step2FamilyAndName />;
    case "3":
      return <Step3InvitePartner />;
    case "4":
      return <Step4FirstChild />;
    case "5":
      return <Step5Done />;
    default:
      return <Step2FamilyAndName />;
  }
}
```

The four step files don't exist yet. Create stub files so this typechecks now:

`app-sections/onboarding/Step2FamilyAndName.tsx`:

```tsx
export function Step2FamilyAndName() {
  return null;
}
```

`app-sections/onboarding/Step3InvitePartner.tsx`:

```tsx
export function Step3InvitePartner() {
  return null;
}
```

`app-sections/onboarding/Step4FirstChild.tsx`:

```tsx
export function Step4FirstChild() {
  return null;
}
```

`app-sections/onboarding/Step5Done.tsx`:

```tsx
export function Step5Done() {
  return null;
}
```

- [ ] **Step 5: Typecheck + commit**

```bash
bun run check
git add "app/(onboarding)/_layout.tsx" "app/(onboarding)/[step].tsx" app-sections/onboarding/
git commit -m "feat(onboarding): shell + (onboarding) route group + step dispatcher (stubs)"
```

### Task 4.3 — `Step2FamilyAndName` (with invite path)

The most complex step — it commits via `create_family` OR `accept_invitation` depending on whether a pending invite is stashed.

**Files:**

- Modify: `app-sections/onboarding/Step2FamilyAndName.tsx`
- Create: `features/auth/avatarColor.ts`
- Create: `features/auth/avatarColor.test.ts`

- [ ] **Step 1: Helper — derive short initial + default color**

`features/auth/avatarColor.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { AVATAR_COLORS, deriveShort } from "./avatarColor";

describe("deriveShort", () => {
  test("first two letters uppercase", () => {
    expect(deriveShort("Anna")).toBe("AN");
    expect(deriveShort("jan")).toBe("JA");
  });
  test("single letter is doubled", () => {
    expect(deriveShort("X")).toBe("XX");
  });
  test("empty falls back to ??", () => {
    expect(deriveShort("")).toBe("??");
    expect(deriveShort("   ")).toBe("??");
  });
  test("trims whitespace", () => {
    expect(deriveShort("  Maria  ")).toBe("MA");
  });
  test("multi-word uses first letter of each", () => {
    expect(deriveShort("Anna Becker")).toBe("AB");
  });
});

describe("AVATAR_COLORS", () => {
  test("provides 6 valid hex chips", () => {
    expect(AVATAR_COLORS.length).toBe(6);
    AVATAR_COLORS.forEach((c) => expect(/^#[0-9A-Fa-f]{6}$/.test(c)).toBe(true));
  });
});
```

- [ ] **Step 2: Run, expect fail**

Run: `bun test features/auth/avatarColor.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`features/auth/avatarColor.ts`:

```ts
export const AVATAR_COLORS = [
  "#7DB6A8", // mint
  "#E8A56A", // orange
  "#A78BFA", // violet
  "#F47AA8", // pink
  "#5BB0E0", // blue
  "#C4B45D", // ochre
] as const;

export function deriveShort(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) return "??";
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "??";
  if (words.length === 1) {
    const w = words[0];
    if (w.length === 1) return (w + w).toUpperCase();
    return w.slice(0, 2).toUpperCase();
  }
  return (words[0][0] + words[1][0]).toUpperCase();
}
```

- [ ] **Step 4: Run, expect pass**

Run: `bun test features/auth/avatarColor.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Add to barrel** (`features/auth/index.ts`)

Append:

```ts
export { AVATAR_COLORS, deriveShort } from "./avatarColor";
```

- [ ] **Step 6: Implement `Step2FamilyAndName`**

`app-sections/onboarding/Step2FamilyAndName.tsx`:

```tsx
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { Field } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Text } from "@/design-system/ui";
import {
  AVATAR_COLORS,
  clearPendingInviteToken,
  deriveShort,
  getPendingInviteToken,
  mapAuthError,
  useAcceptInvitation,
  useCreateFamily,
} from "@/features/auth";

import { OnboardingShell } from "./OnboardingShell";

export function Step2FamilyAndName() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const createFamily = useCreateFamily();
  const acceptInvitation = useAcceptInvitation();

  const [familyName, setFamilyName] = useState("");
  const [parentName, setParentName] = useState("");
  const [color, setColor] = useState<string>(AVATAR_COLORS[0]);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteChecked, setInviteChecked] = useState(false);

  useEffect(() => {
    void getPendingInviteToken().then((token) => {
      setInviteToken(token);
      setInviteChecked(true);
    });
  }, []);

  const isInvitePath = inviteToken !== null;
  const familyOk = isInvitePath || familyName.trim().length >= 2;
  const parentOk = parentName.trim().length >= 2;
  const pending = createFamily.isPending || acceptInvitation.isPending;
  const canSubmit = inviteChecked && familyOk && parentOk && !pending;
  const errorKey = createFamily.error
    ? mapAuthError(createFamily.error)
    : acceptInvitation.error
      ? mapAuthError(acceptInvitation.error)
      : null;

  async function onSubmit() {
    if (!canSubmit) return;
    const short = deriveShort(parentName);
    try {
      if (isInvitePath && inviteToken) {
        await acceptInvitation.mutateAsync({
          token: inviteToken,
          parentName: parentName.trim(),
          short,
          color,
        });
        await clearPendingInviteToken();
      } else {
        await createFamily.mutateAsync({
          familyName: familyName.trim(),
          parentName: parentName.trim(),
          short,
          color,
        });
      }
      router.push("/(onboarding)/3");
    } catch (err) {
      // If the user already belongs to a family (23505), the AuthGate will
      // route to /(tabs) on its next render anyway — but we still want a
      // visible toast. mapAuthError → auth.error.alreadyInFamily.
      if (mapAuthError(err) === "auth.error.alreadyInFamily") {
        router.replace("/(tabs)");
      }
    }
  }

  return (
    <OnboardingShell
      step={2}
      footer={
        <Button
          label={isInvitePath ? t("onb.s2.submitInvite") : t("onb.s2.submit")}
          tone="primary"
          variant="solid"
          size="lg"
          block
          loading={pending}
          onPress={onSubmit}
          disabled={!canSubmit}
        />
      }
    >
      <Text variant="h2" tone="ink" style={{ marginTop: 12 }}>
        {t("onb.s2.title")}
      </Text>
      <Text variant="body" tone="inkSecondary" style={{ marginTop: 8 }}>
        {t("onb.s2.sub")}
      </Text>

      {errorKey ? (
        <View
          className="mt-4 rounded-xl border border-danger bg-danger-soft p-3"
          accessibilityRole="alert"
        >
          <Text variant="body" tone="danger">
            {t(errorKey)}
          </Text>
        </View>
      ) : null}

      <View style={{ gap: 16, marginTop: 24 }}>
        {!isInvitePath ? (
          <Field
            label={t("onb.s2.familyField")}
            iconName="users"
            value={familyName}
            onChangeText={setFamilyName}
            placeholder="Familie Becker"
          />
        ) : null}
        <Field
          label={t("onb.s2.parentName.label")}
          iconName="user"
          value={parentName}
          onChangeText={setParentName}
          placeholder={t("onb.s2.parentName.placeholder")}
        />
        <View>
          <Text
            variant="caption"
            tone="inkSecondary"
            style={{ textTransform: "uppercase", fontWeight: "700", letterSpacing: 1.2 }}
          >
            {t("onb.s2.color.label")}
          </Text>
          <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
            {AVATAR_COLORS.map((c) => (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: c,
                  borderWidth: 3,
                  borderColor: color === c ? theme.ink : "transparent",
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: color === c }}
              />
            ))}
          </View>
        </View>
      </View>

      <View
        className="mt-6 rounded-2xl border border-line bg-card-subtle p-4"
        style={{ flexDirection: "row", gap: 12 }}
      >
        <Text variant="bodyStrong" tone="ink">
          {t("onb.s2.privacy.title")}
        </Text>
      </View>
      <Text variant="caption" tone="inkSecondary" style={{ marginTop: 4 }}>
        {t("onb.s2.privacy.sub")}
      </Text>
    </OnboardingShell>
  );
}
```

- [ ] **Step 7: Typecheck + commit**

```bash
bun run check
git add features/auth/avatarColor.ts features/auth/avatarColor.test.ts features/auth/index.ts app-sections/onboarding/Step2FamilyAndName.tsx
git commit -m "feat(onboarding): Step 2 - family + parent name + color, with invite-path branch"
```

### Task 4.4 — `Step3InvitePartner`

**Files:**

- Modify: `app-sections/onboarding/Step3InvitePartner.tsx`

Uses React Native's built-in `Share` API (NOT `expo-sharing` — that's for files only). No new dependency needed.

- [ ] **Step 1: Implement**

`app-sections/onboarding/Step3InvitePartner.tsx`:

```tsx
import { router } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Share, View } from "react-native";

import { Field, Icon } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Text } from "@/design-system/ui";
import { mapAuthError, useCreateInvitation, useCurrentParent } from "@/features/auth";

import { OnboardingShell } from "./OnboardingShell";

export function Step3InvitePartner() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const parent = useCurrentParent();
  const createInvitation = useCreateInvitation();
  const [partnerEmail, setPartnerEmail] = useState("");

  const errorKey = createInvitation.error ? mapAuthError(createInvitation.error) : null;
  const familyId = parent.data?.family_id;
  const canSubmit = Boolean(familyId) && !createInvitation.isPending;

  async function onSend() {
    if (!familyId || !canSubmit) return;
    try {
      const invite = await createInvitation.mutateAsync({ familyId });
      const link = `elternflow://invite/${invite.token}`;
      const message = `${t("onb.s3.shareMessage")}\n\n${link}`;
      // Share.share is the cross-platform RN built-in. iOS uses `url` (better
      // share-extension preview), Android uses `message`. We pass both.
      await Share.share(
        { url: link, message, title: t("onb.s3.shareSubject") },
        { subject: t("onb.s3.shareSubject"), dialogTitle: t("onb.s3.shareSubject") },
      );
      router.push("/(onboarding)/4");
    } catch {
      /* error rendered below; Share.share rejects when the user dismisses,
         which we treat as a soft-skip — don't navigate. */
    }
  }

  function onLater() {
    router.push("/(onboarding)/4");
  }

  const shared = [
    { icon: "calendar", key: "calendar" as const },
    { icon: "check-square", key: "tasks" as const },
    { icon: "utensils", key: "meals" as const },
    { icon: "users", key: "children" as const },
  ];

  return (
    <OnboardingShell
      step={3}
      showSkip
      onSkip={onLater}
      footer={
        <View style={{ gap: 8 }}>
          <Button
            label={t("onb.s3.send")}
            tone="primary"
            variant="solid"
            size="lg"
            block
            loading={createInvitation.isPending}
            onPress={onSend}
            disabled={!canSubmit}
          />
          <Button
            label={t("onb.s3.later")}
            tone="neutral"
            variant="ghost"
            size="lg"
            block
            onPress={onLater}
          />
        </View>
      }
    >
      <Text variant="h2" tone="ink" style={{ marginTop: 12 }}>
        {t("onb.s3.title")}
      </Text>
      <Text variant="body" tone="inkSecondary" style={{ marginTop: 8 }}>
        {t("onb.s3.sub")}
      </Text>

      {errorKey ? (
        <View
          className="mt-4 rounded-xl border border-danger bg-danger-soft p-3"
          accessibilityRole="alert"
        >
          <Text variant="body" tone="danger">
            {t(errorKey)}
          </Text>
        </View>
      ) : null}

      <View style={{ marginTop: 24 }}>
        <Field
          label={t("onb.s3.partnerField")}
          iconName="mail"
          value={partnerEmail}
          onChangeText={setPartnerEmail}
          keyboardType="email-address"
          placeholder="partner@example.com"
        />
      </View>

      <View className="mt-6 rounded-2xl border border-line bg-card-subtle p-4">
        {shared.map((s) => (
          <View
            key={s.key}
            style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 }}
          >
            <Icon name={s.icon} size={18} color={theme.primaryStrong} />
            <Text variant="body" tone="ink">
              {t(`onb.s3.shared.${s.key}`)}
            </Text>
          </View>
        ))}
      </View>
    </OnboardingShell>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
bun run check
git add app-sections/onboarding/Step3InvitePartner.tsx
git commit -m "feat(onboarding): Step 3 - partner invite via Share API"
```

### Task 4.5 — `Step4FirstChild`

**Files:**

- Modify: `app-sections/onboarding/Step4FirstChild.tsx`

- [ ] **Step 1: Implement**

`app-sections/onboarding/Step4FirstChild.tsx`:

```tsx
import DateTimePicker from "@react-native-community/datetimepicker";
import { format } from "date-fns";
import { router } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, Pressable, View } from "react-native";

import { Field, Icon } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Text } from "@/design-system/ui";
import { AVATAR_COLORS, mapAuthError, useCreateChild, useCurrentParent } from "@/features/auth";

import { OnboardingShell } from "./OnboardingShell";

const COMMON_ALLERGIES = ["Erdnüsse", "Milch", "Eier", "Gluten", "Soja", "Nüsse"] as const;

export function Step4FirstChild() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const parent = useCurrentParent();
  const createChild = useCreateChild();

  const [name, setName] = useState("");
  const [birthday, setBirthday] = useState<Date | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [color, setColor] = useState<string>(AVATAR_COLORS[0]);
  const [school, setSchool] = useState("");
  const [allergies, setAllergies] = useState<Set<string>>(new Set());

  const familyId = parent.data?.family_id;
  const errorKey = createChild.error ? mapAuthError(createChild.error) : null;
  const canSubmit =
    Boolean(familyId) && name.trim().length >= 1 && birthday !== null && !createChild.isPending;

  function toggleAllergy(a: string) {
    setAllergies((prev) => {
      const next = new Set(prev);
      if (next.has(a)) next.delete(a);
      else next.add(a);
      return next;
    });
  }

  async function onSave() {
    if (!familyId || !canSubmit || !birthday) return;
    try {
      await createChild.mutateAsync({
        familyId,
        name: name.trim(),
        birthday: format(birthday, "yyyy-MM-dd"),
        color,
        school: school.trim() || null,
        allergies: Array.from(allergies),
      });
      router.push("/(onboarding)/5");
    } catch {
      /* error rendered below */
    }
  }

  function onSkip() {
    router.push("/(onboarding)/5");
  }

  return (
    <OnboardingShell
      step={4}
      showSkip
      onSkip={onSkip}
      footer={
        <View style={{ gap: 8 }}>
          <Button
            label={t("onb.s4.save")}
            tone="primary"
            variant="solid"
            size="lg"
            block
            loading={createChild.isPending}
            onPress={onSave}
            disabled={!canSubmit}
          />
          <Button
            label={t("onb.s4.voice") + " · " + t("auth.soon")}
            tone="neutral"
            variant="soft"
            size="lg"
            block
            disabled
          />
        </View>
      }
    >
      <Text variant="h2" tone="ink" style={{ marginTop: 12 }}>
        {t("onb.s4.title")}
      </Text>
      <Text variant="body" tone="inkSecondary" style={{ marginTop: 8 }}>
        {t("onb.s4.sub")}
      </Text>

      {errorKey ? (
        <View
          className="mt-4 rounded-xl border border-danger bg-danger-soft p-3"
          accessibilityRole="alert"
        >
          <Text variant="body" tone="danger">
            {t(errorKey)}
          </Text>
        </View>
      ) : null}

      <View style={{ gap: 16, marginTop: 24 }}>
        <View style={{ alignItems: "center" }}>
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: color,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text variant="h2" tone="white">
              {name.charAt(0).toUpperCase() || "?"}
            </Text>
          </View>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            {AVATAR_COLORS.map((c) => (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: c,
                  borderWidth: 2,
                  borderColor: color === c ? theme.ink : "transparent",
                }}
              />
            ))}
          </View>
        </View>

        <Field
          label={t("onb.s4.nameField")}
          value={name}
          onChangeText={setName}
          placeholder="Ben"
        />

        <Field
          label={t("onb.s4.birthdayField")}
          iconName="calendar"
          value={birthday ? format(birthday, "dd.MM.yyyy") : ""}
          onPress={() => setPickerOpen(true)}
          placeholder="TT.MM.JJJJ"
        />

        {pickerOpen ? (
          <DateTimePicker
            value={birthday ?? new Date(2018, 0, 1)}
            mode="date"
            maximumDate={new Date()}
            onChange={(event, d) => {
              if (Platform.OS !== "ios") setPickerOpen(false);
              if (event.type === "dismissed" || !d) return;
              setBirthday(d);
              if (Platform.OS === "ios") setPickerOpen(false);
            }}
          />
        ) : null}

        <Field
          label={t("onb.s4.schoolField")}
          iconName="book-open"
          value={school}
          onChangeText={setSchool}
          placeholder="Grundschule am Park"
        />

        <View>
          <Text
            variant="caption"
            tone="inkSecondary"
            style={{ textTransform: "uppercase", fontWeight: "700", letterSpacing: 1.2 }}
          >
            {t("onb.s4.allergiesLabel")}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            {COMMON_ALLERGIES.map((a) => {
              const selected = allergies.has(a);
              return (
                <Pressable
                  key={a}
                  onPress={() => toggleAllergy(a)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 999,
                    backgroundColor: selected ? theme.primarySoft : theme.card,
                    borderWidth: 1,
                    borderColor: selected ? theme.primary : theme.line,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {selected ? <Icon name="check" size={14} color={theme.primaryStrong} /> : null}
                  <Text variant="caption" tone={selected ? "primaryStrong" : "inkSecondary"}>
                    {a}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </OnboardingShell>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
bun run check
git add app-sections/onboarding/Step4FirstChild.tsx
git commit -m "feat(onboarding): Step 4 - first child with avatar, birthday, allergies"
```

### Task 4.6 — `Step5Done` (recap with empty variant)

**Files:**

- Modify: `app-sections/onboarding/Step5Done.tsx`
- Create: `features/auth/familyQueries.ts`

- [ ] **Step 1: Helper queries**

`features/auth/familyQueries.ts`:

```ts
import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { supabase } from "@/features/supabase";
import type { Database } from "@/features/supabase/database.types";

export type FamilyRow = Database["public"]["Tables"]["families"]["Row"];
export type ParentRow = Database["public"]["Tables"]["parents"]["Row"];
export type ChildRow = Database["public"]["Tables"]["children"]["Row"];
export type InvitationRow = Database["public"]["Tables"]["family_invitations"]["Row"];

export function useFamily(familyId: string | undefined): UseQueryResult<FamilyRow | null, Error> {
  return useQuery({
    queryKey: ["family", familyId, "self"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("families")
        .select("*")
        .eq("id", familyId as string)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: Boolean(familyId),
  });
}

export function useFamilyParents(familyId: string | undefined): UseQueryResult<ParentRow[], Error> {
  return useQuery({
    queryKey: ["family", familyId, "parents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parents")
        .select("*")
        .eq("family_id", familyId as string);
      if (error) throw error;
      return data ?? [];
    },
    enabled: Boolean(familyId),
  });
}

export function useFamilyChildren(familyId: string | undefined): UseQueryResult<ChildRow[], Error> {
  return useQuery({
    queryKey: ["family", familyId, "children"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("children")
        .select("*")
        .eq("family_id", familyId as string);
      if (error) throw error;
      return data ?? [];
    },
    enabled: Boolean(familyId),
  });
}

export function useFamilyPendingInvitations(
  familyId: string | undefined,
): UseQueryResult<InvitationRow[], Error> {
  return useQuery({
    queryKey: ["family", familyId, "invitations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("family_invitations")
        .select("*")
        .eq("family_id", familyId as string)
        .is("used_at", null);
      if (error) throw error;
      return data ?? [];
    },
    enabled: Boolean(familyId),
  });
}
```

- [ ] **Step 2: Barrel export**

Append to `features/auth/index.ts`:

```ts
export {
  useFamily,
  useFamilyChildren,
  useFamilyParents,
  useFamilyPendingInvitations,
  type ChildRow,
  type FamilyRow,
  type InvitationRow,
} from "./familyQueries";
```

- [ ] **Step 3: Implement `Step5Done`**

`app-sections/onboarding/Step5Done.tsx`:

```tsx
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, View } from "react-native";

import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Text } from "@/design-system/ui";
import {
  useCurrentParent,
  useFamily,
  useFamilyChildren,
  useFamilyParents,
  useFamilyPendingInvitations,
} from "@/features/auth";

import { OnboardingShell } from "./OnboardingShell";

export function Step5Done() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const parent = useCurrentParent();
  const familyId = parent.data?.family_id;
  const family = useFamily(familyId);
  const parents = useFamilyParents(familyId);
  const children = useFamilyChildren(familyId);
  const invitations = useFamilyPendingInvitations(familyId);

  const loading =
    parent.isLoading ||
    family.isLoading ||
    parents.isLoading ||
    children.isLoading ||
    invitations.isLoading;

  if (loading) {
    return (
      <OnboardingShell
        step={5}
        footer={
          <Button label={t("onb.s5.cta")} tone="primary" variant="solid" size="lg" block disabled />
        }
      >
        <View style={{ marginTop: 48, alignItems: "center" }}>
          <ActivityIndicator color={theme.primary} />
        </View>
      </OnboardingShell>
    );
  }

  const partner = (parents.data ?? []).find((p) => p.id !== parent.data?.id);
  const hasInvite = (invitations.data ?? []).length > 0;
  const childList = children.data ?? [];
  const showEmptyVariant = !partner && !hasInvite && childList.length === 0;

  return (
    <OnboardingShell
      step={5}
      footer={
        <View style={{ gap: 8 }}>
          <Button
            label={t("onb.s5.cta")}
            tone="primary"
            variant="solid"
            size="lg"
            block
            onPress={() => router.replace("/(tabs)")}
          />
          {!showEmptyVariant && childList.length > 0 ? (
            <Button
              label={t("onb.s5.secondary")}
              tone="neutral"
              variant="ghost"
              size="lg"
              block
              onPress={() => router.push("/(onboarding)/4")}
            />
          ) : null}
        </View>
      }
    >
      <View style={{ alignItems: "center", marginTop: 12 }}>
        <View
          style={{
            width: 96,
            height: 96,
            borderRadius: 48,
            backgroundColor: theme.primary,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text variant="h1" tone="onMint">
            ✓
          </Text>
        </View>
        <Text variant="h2" tone="ink" style={{ marginTop: 16, textAlign: "center" }}>
          {t("onb.s5.title")}
        </Text>
        <Text variant="body" tone="inkSecondary" style={{ marginTop: 8, textAlign: "center" }}>
          {t("onb.s5.sub")}
        </Text>
      </View>

      {showEmptyVariant ? (
        <View
          className="mt-8 rounded-2xl border border-line bg-card-subtle p-4"
          accessibilityRole="text"
        >
          <Text variant="bodyStrong" tone="ink">
            {t("onb.s5.empty.title")}
          </Text>
          <Text variant="body" tone="inkSecondary" style={{ marginTop: 6 }}>
            {t("onb.s5.empty.sub")}
          </Text>
        </View>
      ) : (
        <View style={{ marginTop: 32, gap: 16 }}>
          <View className="rounded-2xl border border-line bg-card p-4">
            <Text variant="caption" tone="inkSecondary" style={{ textTransform: "uppercase" }}>
              {t("onb.s5.recap.you")}
            </Text>
            <Text variant="bodyStrong" tone="ink" style={{ marginTop: 4 }}>
              {parent.data?.name}
            </Text>
          </View>
          <View className="rounded-2xl border border-line bg-card p-4">
            <Text variant="caption" tone="inkSecondary" style={{ textTransform: "uppercase" }}>
              {t("onb.s5.recap.partner")}
            </Text>
            <Text variant="bodyStrong" tone="ink" style={{ marginTop: 4 }}>
              {partner
                ? partner.name
                : hasInvite
                  ? t("onb.s5.recap.partnerPending")
                  : t("onb.s5.recap.partnerNone")}
            </Text>
          </View>
          <View className="rounded-2xl border border-line bg-card p-4">
            <Text variant="caption" tone="inkSecondary" style={{ textTransform: "uppercase" }}>
              {t("onb.s5.recap.children")}
            </Text>
            {childList.length > 0 ? (
              childList.map((c) => (
                <Text key={c.id} variant="bodyStrong" tone="ink" style={{ marginTop: 4 }}>
                  {c.name}
                  {c.allergies.length > 0 ? ` · ${c.allergies.join(", ")}` : ""}
                </Text>
              ))
            ) : (
              <Text variant="body" tone="inkSecondary" style={{ marginTop: 4 }}>
                {t("onb.s5.recap.childrenNone")}
              </Text>
            )}
          </View>
        </View>
      )}
    </OnboardingShell>
  );
}
```

- [ ] **Step 4: Typecheck + commit**

```bash
bun run check
git add features/auth/familyQueries.ts features/auth/index.ts app-sections/onboarding/Step5Done.tsx
git commit -m "feat(onboarding): Step 5 - recap with empty variant for skipped 3+4"
```

---

## Phase 5 — Calendar Cleanup

### Task 5.1 — Remove old calendar sessionStore + sample-data fallback

**Files:**

- Delete: `features/calendar/sessionStore.ts`
- Modify: `features/calendar/index.ts`
- Modify: every file that imported `useSessionStore` or `useInitSession` from `@/features/calendar`

- [ ] **Step 1: Find all importers**

Run:

```bash
grep -rn "from \"@/features/calendar\"" --include "*.ts" --include "*.tsx" -l | xargs grep -l "useSessionStore\|useInitSession" 2>/dev/null
```

Expected output: list of files (the root `app/_layout.tsx` was already migrated in Task 1.8, but `features/calendar/sample.ts` / sample-fallback code paths may still reference the old store).

- [ ] **Step 2: Re-route imports**

For each file in the grep output, replace:

- `useSessionStore`/`useInitSession` from `@/features/calendar` → `@/features/auth`

- [ ] **Step 3: Find and remove sample-data fallback paths**

Run:

```bash
grep -rn "sample" features/calendar/ app-sections/\(tabs\)/kalender/ --include "*.ts" --include "*.tsx" | grep -v test
```

For each match, decide:

- If it's a Sample-Data import inside a calendar query/screen → REMOVE the import, the conditional fallback, and any related branch.
- If it's `features/calendar/sample.ts` itself → keep the file (Smoke-Test artifact per spec), but make sure nothing app-side imports it.

The pattern: `app-sections/(tabs)/kalender/KalenderScreen.tsx` likely has `useSessionStore` → returns sample if no session. Remove the session check entirely — the AuthGate guarantees a session by the time this screen renders.

- [ ] **Step 4: Remove the `cal.detail.requiresAuth` alert from EventDetailScreen**

Run: `grep -n "cal.detail.requiresAuth\|requiresAuth" app-sections/event/EventDetailScreen.tsx`

Remove the Alert + the conditional that produces it. The Edit/Delete buttons no longer need to guard on session — they always have one.

Also remove the unused i18n key from de.json / en.json:

- `cal.detail.requiresAuth`

- [ ] **Step 5: Delete sessionStore file**

```bash
rm features/calendar/sessionStore.ts
```

- [ ] **Step 6: Drop re-exports from `features/calendar/index.ts`**

Open `features/calendar/index.ts` and remove the line:

```ts
export { useSessionStore, useInitSession } from "./sessionStore";
```

- [ ] **Step 7: Run full verification**

```bash
bun run check
bun test
```

Both must PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(calendar): drop sample-data fallback + move session to features/auth"
```

### Task 5.2 — Update `features/calendar/sample.ts` doc comment

**Files:**

- Modify: `features/calendar/sample.ts`

- [ ] **Step 1: Update the file's header comment** so future readers know it's smoke-test-only:

Add at the top of `features/calendar/sample.ts`:

```ts
/**
 * Sample calendar seeds — kept for Smoke-Test / Storybook-style verification only.
 * The app no longer imports this in production paths; AuthGate guarantees a real
 * Supabase session before any calendar screen mounts.
 */
```

- [ ] **Step 2: Commit**

```bash
git add features/calendar/sample.ts
git commit -m "docs(calendar): mark sample.ts as smoke-test-only"
```

---

## Phase 6 — Documentation Updates

### Task 6.1 — ADR-004 in `docs/decision-log.md`

**Files:**

- Modify: `docs/decision-log.md`

- [ ] **Step 1: Append the ADR**

Append at the bottom of `docs/decision-log.md`:

```markdown
## ADR-004 — Supabase Auth + Onboarding (Approach C) (2026-06-01)

### Status

Accepted. Ergänzt ADR-003 (Supabase-Anbindung).

### Context

Supabase Auth, das 5-Step-Onboarding, der Reset-Password-Flow und der Partner-Invite waren als „Out of Scope" in ADR-001 markiert. Mit dem Spec-Doc [docs/superpowers/specs/2026-06-01-supabase-auth-design.md](./superpowers/specs/2026-06-01-supabase-auth-design.md) wurde der Plan dafür festgelegt; diese ADR fixiert die Architektur-Entscheidungen.

### Decisions

1. **Approach C — Incremental Real-Inserts.** Statt eines lokalen Onboarding-Drafts oder eines server-side `family_drafts`-Schemas committed Step 2 direkt via `rpc("create_family", …)`. Steps 3 + 4 sind optionale INSERTs gegen `family_invitations` und `children`. Step 5 ist eine read-only Recap. Begründung: Pattern Step 5 ist ohnehin kein Commit-Punkt, Approach C nutzt die bereits existierenden RPCs, bringt keine neue Migration mit und ist robust gegen App-Crashes.

2. **Strict Email-Confirm.** Supabase-Setting „Confirm Email" eingeschaltet. Zwischen Step 1 (`RegisterScreen` in `(auth)`) und Step 2 (`(onboarding)/2`) liegt der `CheckEmailScreen`, der dem User signalisiert, dass die Mail-Bestätigung pending ist. Deep-Link `elternflow://auth/confirm` verifiziert die OTP und löst über `onAuthStateChange` → `AuthGate` den Übergang zu Onboarding aus.

3. **V1 only Email + Password.** Magic-Link und Social-Logins (Google / Apple) sind als disabled-Buttons sichtbar mit `auth.soon`-Suffix. Reason: jeder Provider bringt eigene Iterationen mit (Cert / Console / Deep-Link-Setup, Apple Sign In ist auf iOS App Store Pflicht sobald irgendein Social-Provider live geht).

4. **Partner-Invite via Share-Sheet, nicht Edge Function.** Step 3 erzeugt eine `family_invitations`-Row (RPC) und öffnet `Sharing.shareAsync` mit `elternflow://invite/<token>`. Server-Side-Mail ist out-of-scope (eigene Iteration mit Mail-Provider). Race-Condition zwischen zwei Klicks fängt der `FOR UPDATE`-Lock in `accept_invitation` ab; zweite Klick kriegt Postgres-Code `22023` → UI mapped auf `auth.error.linkExpired`.

5. **AuthGate als einziger Routing-Entscheider.** `<AuthGate>` im Root-Layout, gespeist von `useSession()` (Zustand-Store, von `features/calendar/sessionStore.ts` nach `features/auth/session.ts` migriert) und `useCurrentParent()` (TanStack-Query). Die Routing-Logik ist als pure Function `decideRoute(...)` extrahiert und exhaustiv getestet (9 State-Combos). Wichtige Subtlety: AuthGate wirft NICHT aus `(onboarding)` raus, wenn der `parents`-Row mid-flow (Step 2 → Step 3) entsteht — nur Step 5's explizites „Zum Dashboard" verlässt die Gruppe.

6. **AsyncStorage statt SecureStore für die Session.** Übernommen von ADR-003. Re-Evaluierung sobald PII direkt auf dem Gerät persistiert wird.

7. **Sample-Data-Fallback im Kalender entfernt.** AuthGate garantiert eine echte Supabase-Session, bevor `(tabs)` rendert. `features/calendar/sessionStore.ts` ist gelöscht (Move nach `features/auth/session.ts`); `cal.detail.requiresAuth`-Alert in EventDetailScreen entfällt. `features/calendar/sample.ts` bleibt als Smoke-Test-Artifact.

### Consequences

- Neue Dependencies: `expo-sharing` (Step 3 Share-Sheet).
- Patches im Bestand: `app/_layout.tsx` (AuthGate + DeepLink-Init), `app/(tabs)/_layout.tsx` (Sample-Fallback raus), `app-sections/event/EventDetailScreen.tsx` (`requiresAuth`-Alert raus), `features/calendar/index.ts` (Session-Re-Exports raus), `patterns/onboarding.md` (Step 2 erweitert auf „Familienname + Dein Name + Avatar-Color"; „draft Family server-side" entschärft auf „Step 2 commited direkt").
- Neuer Pattern-Doc: [patterns/reset-password.md](../patterns/reset-password.md) (im Spec war kein Reset-Pattern vorhanden).
- Dashboard-Settings nicht via Migration: separate Checkliste in [supabase/SETUP.md](../supabase/SETUP.md).
- Resume-nach-Abbruch-CTA auf Dashboard wurde bewusst nicht V1 — siehe [docs/TODO.md](./TODO.md).
```

- [ ] **Step 2: Commit**

```bash
git add docs/decision-log.md
git commit -m "docs(adr): ADR-004 Supabase auth + onboarding (Approach C)"
```

### Task 6.2 — Update `docs/COPY.md` with the new keys

**Files:**

- Modify: `docs/COPY.md`

- [ ] **Step 1: Append new keys to the Auth + Onboarding tables**

The existing tables already cover `auth.signIn`, `auth.signUp`, `auth.email`, `auth.password`, `auth.forgot`, `auth.stay`, `auth.or`, `auth.google`, `auth.apple`, `auth.tagline`, `auth.error.title`, `auth.error.help`, `auth.magicLink`, `auth.newHere`.

Add to the Auth table:
| Key | DE | EN |
| --- | --- | --- |
| `auth.signOut` | Abmelden | Sign out |
| `auth.soon` | Bald verfügbar | Coming soon |
| `auth.register.title` | Konto erstellen | Create your account |
| `auth.register.sub` | Mit dieser E-Mail teilst du später Kalender und Listen mit deinem Partner. | You'll use this email to share calendar and lists with your partner. |
| `auth.register.terms` | Ich stimme den AGB und der Datenschutzerklärung zu. | I agree to the terms and privacy policy. |
| `auth.register.submit` | Konto erstellen | Create account |
| `auth.checkEmail.title` | Schau in dein Postfach | Check your inbox |
| `auth.checkEmail.sub` | Wir haben dir einen Link an {{email}} geschickt. Tippe ihn an, um deine E-Mail zu bestätigen. | We sent a link to {{email}}. Tap it to confirm your email. |
| `auth.checkEmail.resend` | Mail erneut senden | Resend email |
| `auth.checkEmail.wrongEmail` | Falsche E-Mail? Zurück | Wrong email? Go back |
| `auth.reset.title` | Passwort zurücksetzen | Reset password |
| `auth.reset.sub` | Wir senden dir einen Link an deine E-Mail. | We'll send a link to your email. |
| `auth.reset.submit` | Link senden | Send link |
| `auth.reset.success` | Falls die E-Mail registriert ist, findest du gleich einen Link in deinem Postfach. | If that email is registered, you'll find a link in your inbox shortly. |
| `auth.reset.backToLogin` | Doch wieder eingefallen? Anmelden | Remembered it? Sign in |
| `auth.newPassword.*` | (siehe `de.json`) | (siehe `en.json`) |
| `auth.password.strength.{weak\|fair\|good\|strong}` | Schwach / Okay / Gut / Stark | Weak / OK / Good / Strong |
| `auth.error.invalidCredentials` | E-Mail oder Passwort falsch. | Email or password incorrect. |
| `auth.error.emailTaken` | Diese E-Mail ist bereits registriert. | This email is already registered. |
| `auth.error.emailNotConfirmed` | Bitte bestätige zuerst deine E-Mail. | Please confirm your email first. |
| `auth.error.weakPassword` | Mindestens 8 Zeichen, bitte. | At least 8 characters, please. |
| `auth.error.alreadyInFamily` | Du gehörst bereits zu einer Familie. | You're already part of a family. |
| `auth.error.linkExpired` | Der Link ist abgelaufen oder wurde bereits verwendet. | This link has expired or was already used. |
| `auth.error.notAuthenticated` | Bitte erneut anmelden. | Please sign in again. |
| `auth.error.network` | Verbindung fehlgeschlagen. Bitte später erneut versuchen. | Connection failed. Please try again later. |
| `auth.error.generic` | Etwas ist schiefgelaufen. Bitte später erneut versuchen. | Something went wrong. Please try again later. |

Add to the Onboarding table the new sub-keys: `onb.s2.parentName.*`, `onb.s2.color.*`, `onb.s2.submitInvite`, `onb.s3.shareSubject`, `onb.s3.shareMessage`, `onb.s3.pendingPill`, `onb.s3.shared.*`, `onb.s4.skip`, `onb.s4.voice`, `onb.s5.recap.*`, `onb.s5.empty.*`.

- [ ] **Step 2: Commit**

```bash
git add docs/COPY.md
git commit -m "docs(copy): auth + onboarding copy deck (DE/EN) — register, checkEmail, reset, recap"
```

### Task 6.3 — Patch `patterns/onboarding.md`

**Files:**

- Modify: `patterns/onboarding.md`

- [ ] **Step 1: Update Step 2 — add the parent-name + avatar-color sub-spec**

Find the `## Step 2 · Family name` section and rewrite it to:

```markdown
## Step 2 · Family name + Your name

- Family-name field with `users` leading icon. Suggestion chips: "Familie {Localpart}", "Team {Localpart}", … (tap fills the field). **Hidden when the user arrived via an invitation** (`elternflow://invite/<token>` was stashed by deepLinkHandler) — the invited partner joins the existing family rather than naming a new one.
- Parent-name field with `user` leading icon (your own name).
- Avatar color picker: 6 chips from `AVATAR_COLORS`. The initial `short` (e.g. "AN" for "Anna") is auto-derived from the parent name on submit.
- Privacy assurance card at the bottom: shield icon, "Eure Daten gehören euch", "Verschlüsselt in der EU gespeichert. Keine Werbung."

**Commit-Pfad:** Step 2 is the only step that commits a row before the user reaches Step 5 — Submit calls `rpc("create_family")` (or `rpc("accept_invitation")` on the invite path). From this point on, the user has a `parents` row and the AuthGate would in principle allow `(tabs)`, but the AuthGate has an explicit carve-out so the user stays in `(onboarding)` until Step 5 explicitly leaves.
```

- [ ] **Step 2: Replace the obsolete "Persistence" section**

Find the `## Persistence` section and replace its body:

```markdown
## Persistence

Approach C (per ADR-004): Step 2 commits via `rpc("create_family")`. Steps 3 + 4 are optional INSERTs (skip = no INSERT). Step 5 is a read-only recap — it never commits, it just reads. No `family_drafts` table, no local-only buffer.

If the user closes the app between Step 2 and Step 5: the `parents` row already exists, so on re-open AuthGate routes to `/(tabs)`. The dashboard's empty-state ([dashboard-empty.md](./dashboard-empty.md)) catches missing children and partners.
```

- [ ] **Step 3: Commit**

```bash
git add patterns/onboarding.md
git commit -m "docs(patterns): onboarding step 2 + persistence revised for Approach C"
```

### Task 6.4 — Update `CLAUDE.md`

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Find the Supabase bullet**

Search for the Supabase bullet in the Tech-stack section. It currently says something like:

> "Supabase JS Client … Auth-Flow + Edge Functions sind die nächsten Iterationen."

Replace with:

```markdown
- **Supabase JS Client** (`@supabase/supabase-js` + AsyncStorage session) via [features/supabase/](features/supabase/). MCP via Supabases hosted HTTP-Server (`mcp.supabase.com`, project-scoped, OAuth) — Konfig in `.mcp.json`. App-ENV in `.env.local` (siehe `.env.example`). Schema mit RLS-Policies in `supabase/migrations/`, TypeScript-Types in `features/supabase/database.types.ts` (generiert). Auth-Flow lebt seit ADR-004 (Email+Passwort, strict Confirm-Email, Reset-Password, 5-Step-Onboarding mit Share-Sheet-Invite, `features/auth/AuthGate`). Realtime + Edge Functions sind die nächsten Iterationen.
```

- [ ] **Step 2: Append a note about the new folder**

In the "Folder structure" section, add under `features/`:

```
features/auth/           Session-Store · AuthGate · DeepLinkHandler · Onboarding-Mutations
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): mark auth-flow live (ADR-004), document features/auth folder"
```

---

## Phase 7 — Final Verification

### Task 7.1 — Full repo check

- [ ] **Step 1: Format + lint + typecheck + tests**

```bash
bun run check && bun test
```

All four must PASS. If anything fails: stop and fix root cause before continuing — do not commit a green-by-skipping fix.

- [ ] **Step 2: Web smoke**

```bash
bunx expo export --platform web --output-dir /tmp/eltern-web
```

Expected: build succeeds. The web bundle is a sanity check; the auth deep-link flow itself only works on iOS/Android in V1.

### Task 7.2 — Manual smoke checklist

Run on iOS sim (or hardware). Each item must be observed live.

- [ ] **Fresh-install path:** delete the app from sim, reinstall, launch → lands on `/(auth)/login`.
- [ ] **Sign-up:** tap "Konto erstellen" → fill email/password/terms → submit → `/(auth)/check-email`.
- [ ] **Confirm email:** receive email, tap link → app reopens → AuthGate routes to `/(onboarding)/2`.
- [ ] **Onboarding Step 2:** enter Familienname + parent name + pick a color → submit → `/(onboarding)/3`. Check via Supabase MCP that `families` + `parents` rows exist.
- [ ] **Onboarding Step 3 (skip path):** tap "Später einladen" → `/(onboarding)/4`.
- [ ] **Onboarding Step 4:** enter child name + birthday + allergies → save → `/(onboarding)/5`.
- [ ] **Onboarding Step 5:** recap shows the parent + the child + "Niemand eingeladen" → tap "Zum Dashboard" → `/(tabs)`.
- [ ] **Logout:** open Settings → sign out → AuthGate routes back to `/(auth)/login`. TanStack cache cleared.
- [ ] **Login:** sign back in → routes to `/(tabs)` (parent row exists). No re-onboarding.
- [ ] **Reset-password:** sign out, on Login tap "Passwort vergessen?" → enter email → submit → success banner. Receive email → tap link → land on `/(auth)/new-password` → enter new password + confirm → save → toast → land on Login → sign in with new password.
- [ ] **Partner-invite happy path:** Use a second test account. From first account: Onboarding Step 3 → tap "Einladung senden" → share-sheet opens → copy the `elternflow://invite/<token>` link → send to second device or open on the second sim. Second sim: link opens → after sign-up + confirm → Onboarding Step 2 in invite-mode (family-name hidden) → submit → both parents see each other in Family tab.
- [ ] **Partner-invite race:** open the same token twice with two different new accounts → second one shows `auth.error.linkExpired`.

If any item fails, capture the symptom (screen + console output) and fix before continuing.

### Task 7.3 — Open PR

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feature/auth-v1
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create --title "feat(auth): Supabase auth + 5-step onboarding (Approach C)" --body "$(cat <<'EOF'
## Summary

- Email + Passwort Sign-Up / Sign-In / Reset-Password mit strict Confirm-Email
- 5-Step Onboarding (Steps 2-5 als `(onboarding)` Route-Group, Step 1 als `RegisterScreen` in `(auth)`)
- Partner-Invite via Share-Sheet + `elternflow://invite/<token>` Deep-Link
- AuthGate als zentraler Routing-Entscheider (9 State-Combos pure-function-tested)
- Calendar Sample-Data-Fallback entfernt (AuthGate garantiert Session)
- `features/auth/` neuer Feature-Slice (Session aus calendar gemigrated)

Spec: `docs/superpowers/specs/2026-06-01-supabase-auth-design.md`
Plan: `docs/superpowers/plans/2026-06-01-supabase-auth-implementation.md`
ADR: `docs/decision-log.md` ADR-004

## Test plan

- [x] `bun run check` (format + lint + typecheck) green
- [x] `bun test` green (new tests: session, useCurrentParent, errors, decideRoute, deepLinkHandler, passwordStrength, avatarColor)
- [x] Manual smoke (see plan Task 7.2) — fresh install → onboarding → dashboard → logout → login → reset password → partner invite happy + race paths
- [x] Supabase Dashboard configured per `supabase/SETUP.md`
EOF
)"
```

Replace placeholders only if any check was NOT actually green.

---

## Note on test coverage gap

The spec listed an `onboardingMutations.test.ts` for `create_family` + `accept_invitation` paths. This plan intentionally does NOT create that file — the substance (postgres SQLSTATE codes 23505 / 22023 / 42501 → i18n-key mapping) is already exhaustively tested in `features/auth/errors.test.ts`. The mutations themselves are thin wrappers over `supabase.rpc(...)` and would only require mocking the Supabase client, which adds maintenance without surfacing real bugs. If post-V1 we observe RPC integration issues, add an integration test against a local Supabase via Docker.
