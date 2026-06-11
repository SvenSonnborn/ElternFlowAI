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
