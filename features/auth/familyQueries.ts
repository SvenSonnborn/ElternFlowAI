import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import type { Database } from "@/features/supabase/database.types";

import { supabase } from "@/features/supabase";

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

export function useChild(childId: string | undefined): UseQueryResult<ChildRow | null, Error> {
  return useQuery({
    queryKey: ["child", childId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("children")
        .select("*")
        .eq("id", childId as string)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: Boolean(childId),
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
