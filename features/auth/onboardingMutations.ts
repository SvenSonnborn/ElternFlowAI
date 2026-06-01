import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { Database } from "@/features/supabase/database.types";

import { supabase } from "@/features/supabase";

import { useSession } from "./session";
import { currentParentKey } from "./useCurrentParent";

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
