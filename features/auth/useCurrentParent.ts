import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import type { Database } from "@/features/supabase/database.types";

import { supabase } from "@/features/supabase";

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
