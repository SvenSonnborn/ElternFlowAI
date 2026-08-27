import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { Database } from "@/features/supabase/database.types";

import { supabase } from "@/features/supabase";

import { pickReusableInvite } from "./inviteSelection";
import { useSession } from "./session";
import { currentParentKey } from "./useCurrentParent";

type ChildInsert = Database["public"]["Tables"]["children"]["Insert"];
type ChildUpdate = Database["public"]["Tables"]["children"]["Update"];
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
  // Optional taste/grade profile. Onboarding (Step 4) omits these and lets the
  // DB defaults ('{}' / NULL) apply; the standalone child profile screen sends them.
  grade?: string | null;
  likes?: string[];
  dislikes?: string[];
}

interface UpdateChildVars {
  id: string;
  familyId: string;
  name: string;
  birthday: string; // ISO date YYYY-MM-DD
  color: string;
  school: string | null;
  grade: string | null;
  allergies: string[];
  likes: string[];
  dislikes: string[];
}

interface DeleteChildVars {
  id: string;
  familyId: string;
}

interface CreateInvitationVars {
  familyId: string;
  /** Mint a brand-new token even if a usable one exists — the "neu generieren"
   *  path, for a link that leaked or that the partner never received. */
  force?: boolean;
}

interface RevokeInvitationVars {
  familyId: string;
  token: string;
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
      return data; // family_id
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
      return data; // family_id
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
        ...(vars.grade !== undefined ? { grade: vars.grade } : {}),
        ...(vars.likes !== undefined ? { likes: vars.likes } : {}),
        ...(vars.dislikes !== undefined ? { dislikes: vars.dislikes } : {}),
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

export function useUpdateChild() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: UpdateChildVars) => {
      const update: ChildUpdate = {
        name: vars.name,
        birthday: vars.birthday,
        color: vars.color,
        school: vars.school,
        grade: vars.grade,
        allergies: vars.allergies,
        likes: vars.likes,
        dislikes: vars.dislikes,
        updated_at: new Date().toISOString(),
      };
      // family_id scope is belt-and-suspenders on top of the RLS update policy.
      const { data, error } = await supabase
        .from("children")
        .update(update)
        .eq("id", vars.id)
        .eq("family_id", vars.familyId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ["family", vars.familyId, "children"] });
      void qc.invalidateQueries({ queryKey: ["child", vars.id] });
    },
  });
}

export function useDeleteChild() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, familyId }: DeleteChildVars) => {
      // family_id scope is belt-and-suspenders on top of the RLS delete policy.
      const { error } = await supabase
        .from("children")
        .delete()
        .eq("id", id)
        .eq("family_id", familyId);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ["family", vars.familyId, "children"] });
      void qc.invalidateQueries({ queryKey: ["child", vars.id] });
    },
  });
}

async function fetchUnusedInvitations(familyId: string): Promise<InvitationRow[]> {
  const { data, error } = await supabase
    .from("family_invitations")
    .select("*")
    .eq("family_id", familyId)
    .is("used_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/**
 * Creates a partner invitation — or reuses the family's existing pending one.
 *
 * A family needs at most one live invite link at a time, so this is idempotent:
 * if a non-expired unused invite already exists we re-share it instead of
 * minting a new row. Without this, every tap of "Partner einladen" spawned a
 * fresh invitation (see docs/TODO.md history). The DB also enforces the
 * invariant via a partial unique index (one unused invite per family), so the
 * insert below can lose a race — we recover by re-reading the winner's row.
 *
 * Pass `force` to bypass the reuse shortcut and rotate the token instead.
 */
export function useCreateInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ familyId, force }: CreateInvitationVars): Promise<InvitationRow> => {
      const unused = await fetchUnusedInvitations(familyId);
      if (!force) {
        const reusable = pickReusableInvite(unused, new Date().toISOString());
        if (reusable) return reusable;
      }

      // Clear the remaining unused invites so the partial unique index doesn't
      // block the fresh insert. Without `force` these are all expired; with it
      // we retire the live one too — that retirement *is* the regeneration.
      const staleTokens = unused.map((i) => i.token);
      if (staleTokens.length > 0) {
        const { error: delError } = await supabase
          .from("family_invitations")
          .delete()
          .in("token", staleTokens);
        if (delError) throw delError;
      }

      const { data, error } = await supabase
        .from("family_invitations")
        .insert({ family_id: familyId })
        .select()
        .single();
      if (error) {
        // 23505 = a concurrent caller inserted first; reuse their invite. That
        // also satisfies `force`: the winner's row is itself a fresh token.
        if (error.code === "23505") {
          const raced = pickReusableInvite(
            await fetchUnusedInvitations(familyId),
            new Date().toISOString(),
          );
          if (raced) return raced;
        }
        throw error;
      }
      return data;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ["family", vars.familyId, "invitations"] });
    },
  });
}

/**
 * Withdraws a pending invitation: the row is deleted, so its deep link stops
 * resolving in `accept_invitation`. Deleting rather than stamping `used_at`
 * keeps the partial unique index free for the next invite — a revoked token is
 * not a used one, and the family should be able to invite again right away.
 */
export function useRevokeInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ familyId, token }: RevokeInvitationVars) => {
      // family_id scope is belt-and-suspenders on top of the RLS delete policy.
      const { error } = await supabase
        .from("family_invitations")
        .delete()
        .eq("token", token)
        .eq("family_id", familyId);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ["family", vars.familyId, "invitations"] });
    },
  });
}
