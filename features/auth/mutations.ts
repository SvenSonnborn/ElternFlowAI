import { useMutation, useQueryClient } from "@tanstack/react-query";

import { usePendingDeleteStore } from "@/features/shared";
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

/**
 * Meldet ab — und schließt vorher alle offenen Undo-Fenster.
 *
 * Das `flush()` steht **vor** dem `signOut`, weil eine verzögerte Löschung nur
 * unter der Session gelingt, die sie ausgelöst hat: Der Toast steht direkt
 * über der Tab-Bar, Einstellungen ist ein Tap — sich innerhalb der fünf
 * Sekunden abzumelden ist erreichbar. Danach träfe das `DELETE` einer Aufgabe
 * unter RLS null Zeilen und meldete dabei **keinen** Fehler; die Mutation
 * „gelänge", gelöscht wäre nichts, und beim nächsten Login stünde die Aufgabe
 * wieder da. Bei einem Termin wirft `fetchEventById` stattdessen, und der
 * Fehler-Toast landete in einem `ToastProvider`, den `AuthGate` längst
 * abgeräumt hat — vollständig stumm.
 *
 * `qc.clear()` in `onSettled` räumt aus demselben Grund den Query-Cache; der
 * Pending-Store ist der zweite Modul-Store, den ein Abmelden erreichen muss.
 */
export function useSignOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      usePendingDeleteStore.getState().flush();
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
