import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { Database } from "@/features/supabase/database.types";

import { supabase } from "@/features/supabase";

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
}

interface RevokeInvitationVars {
  familyId: string;
  token: string;
}

type RegenerateInvitationVars = RevokeInvitationVars;

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

/**
 * Creates a partner invitation: one row, one single-use token, one person.
 *
 * Every call inserts — there is no reuse shortcut. That shortcut existed while
 * a partial unique index allowed only one open invitation per family; dropping
 * it (20260827080254) made "invite one more person" a thing the UI can express,
 * and re-sharing an existing link is now the card's own action rather than a
 * side effect of tapping create.
 */
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

/**
 * Rotates one invitation: the old token is retired and a fresh one takes its
 * place, for a link that leaked or that never reached the person it was meant
 * for. Returns the new token so the caller can share it right away.
 *
 * Goes through the `regenerate_invitation` RPC rather than a delete followed by
 * an insert, so the two writes cannot come apart: a client that dies between
 * them would otherwise leave the family one invitation short, with nothing left
 * to retry against. The RPC scopes to `current_family_id()` itself, since
 * SECURITY DEFINER puts it past RLS.
 */
export function useRegenerateInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ token }: RegenerateInvitationVars): Promise<string> => {
      const { data, error } = await supabase.rpc("regenerate_invitation", { p_token: token });
      if (error) throw error;
      return data; // the fresh token
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
