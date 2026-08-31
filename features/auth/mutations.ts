import { useMutation, useQueryClient } from "@tanstack/react-query";

// Direkt aus dem Modul statt aus `@/features/calendar`: Das Barrel re-exportiert
// `./hooks`, das über `useTheme` das nativewind-Runtime hereinzieht und unter
// `bun test` beim Modul-Laden scheitert (siehe docs/TODO.md). Die
// Abhängigkeitsrichtung stimmt — `features/auth` darf aus `features/calendar`
// lesen, umgekehrt nicht; `features/calendar` importiert nichts aus
// `features/auth`, es entsteht also kein Zyklus.
import { useOptimisticEventsStore } from "@/features/calendar/optimisticEvents";
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
 * Pending-Store ist der zweite Modul-Store, den ein Abmelden erreichen muss,
 * der Optimistic-Store aus [ADR-027](../../docs/decision-log.md) der dritte.
 */
export function useSignOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      // Warten, nicht nur anstoßen: `signOut` entfernt die lokale Session, und
      // ein DELETE, das seinen Token erst danach auflöst, liefe unangemeldet und
      // schlüge unter RLS lautlos fehl — `error: null` bei null getroffenen Zeilen.
      // Der Watchdog in `commit` begrenzt, wie lange das Abmelden dafür wartet.
      await usePendingDeleteStore.getState().flush();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },
    onSettled: () => {
      // Always clear cached server-state — even on partial signOut errors —
      // to prevent the previous user's family data leaking on next render.
      qc.clear();
      // Dasselbe für das Optimistic-Overlay: Es liegt **über** den Query-Daten,
      // `qc.clear()` erreicht es also nicht. Ein noch offener Eintrag stünde
      // sonst im Kalender des nächsten Familienmitglieds, das sich auf demselben
      // Gerät anmeldet — mit Titel, Ort und Kind-Zuordnung.
      useOptimisticEventsStore.getState().clear();
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
