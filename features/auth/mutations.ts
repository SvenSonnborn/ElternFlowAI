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
