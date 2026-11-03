import { router, useSegments } from "expo-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { confirmDestructive } from "@/app-sections/shared";
import {
  clearPendingInviteToken,
  decideInviteLink,
  markInviteLinkDone,
  segmentToGroup,
  useCurrentParent,
  usePendingInviteStore,
  useSession,
  useSignOut,
} from "@/features/auth";

/**
 * Setzt um, was `decideInviteLink` für einen gemerkten Einladungstoken
 * entscheidet: Registrierung öffnen oder nach einem anderen Konto fragen.
 *
 * Genau eine Stelle, weil sie beide Einstiege erreicht — den Link bei
 * bestehender Sitzung und den Login nach einem schon gemerkten Token. Eine
 * zweite Prüfung, etwa im Link-Handler, fragte doppelt, sobald die Parent-Zeile
 * nachlädt (Anti-Ziel 3 der Spec zum DB-Aufräumen).
 *
 * Sitzt unter `AuthGate` neben den anderen Hosts, weil `router.push` den
 * gemounteten Root-Navigator braucht. Dass der Gate ihn beim Redirect ohne
 * Sitzung mit abbaut, ist gewollt: Token und `done` liegen im Store, der im
 * Login neu gemountete Host macht dort weiter.
 *
 * Nach „Mit anderem Konto fortfahren" meldet er nur ab und navigiert nicht
 * selbst: Den Weg nach `/login` nimmt der Redirect von `AuthGate`, ein eigenes
 * Navigieren liefe gegen ihn (ADR-040). Im Login öffnet der neu gemountete Host
 * die Registrierung, weil `done` dort noch auf `askSwitchAccount` steht.
 */
export function InviteLinkHost(): null {
  const { t } = useTranslation();
  const { status } = useSession();
  const parent = useCurrentParent();
  const segments = useSegments();
  const token = usePendingInviteStore((s) => s.token);
  const done = usePendingInviteStore((s) => s.done);
  const { mutateAsync: signOut } = useSignOut();

  const action = decideInviteLink({
    sessionStatus: status,
    hasParent: parent.data != null,
    parentIsLoading: parent.isLoading,
    currentGroup: segmentToGroup(segments[0]),
    token,
    done,
  });

  useEffect(() => {
    if (!action || !token) return;
    // Zuerst festhalten, vor allem Asynchronen: Der nächste Render sieht `done`
    // und fragt nicht ein zweites Mal.
    markInviteLinkDone({ token, action });
    if (action === "openRegister") {
      // Der Login bleibt darunter im Stapel — `router.back()` in
      // `RegisterScreen` führt dorthin zurück.
      router.push("/(auth)/register");
      return;
    }
    confirmDestructive({
      title: t("auth.invite.otherAccountTitle"),
      body: t("auth.invite.otherAccountBody"),
      confirm: t("auth.invite.otherAccountConfirm"),
      cancel: t("action.cancel"),
    })
      .then((ok) => (ok ? signOut() : clearPendingInviteToken()))
      .catch((e: unknown) => console.warn("[InviteLinkHost] invite link handling failed", e));
  }, [action, token, t, signOut]);

  return null;
}
