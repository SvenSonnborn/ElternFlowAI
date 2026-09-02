import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { useCurrentParent } from "@/features/auth";
import { supabase } from "@/features/supabase";

import type { FamilyChange } from "./normalize";
import type { RealtimeStatus } from "./status";

import { COALESCE_WINDOW_MS } from "./coalesce";
import { invalidationKeysFor, reconnectInvalidationKeys } from "./dispatch";
import { degradedDelayMs, shouldRefetchAfterResubscribe } from "./reconnect";
import { useRealtimeStatusStore } from "./status";
import { subscribeToFamilyChanges } from "./subscribe";

/**
 * Der eine Mountpunkt des Familien-Kanals.
 *
 * Aufgerufen in `ThemedStack` (app/_layout.tsx) und **nur dort**. Die
 * naheliegende Stelle wäre `useFamilyEvents` gewesen — so steht es im Issue —,
 * aber der Hook hat drei Aufrufer, zwei davon dauerhaft gemountet (Kalender und
 * Dashboard). Das wären drei Kanäle auf einem Topic für eine Wirkung, die
 * global ist (ADR-030 Decision 4). Der Aufruf steht **vor** `<AuthGate>`: Der
 * Gate rendert bei Redirects `<Redirect>` statt seiner Kinder, ein Abo darunter
 * würde bei jedem Routenwechsel ab- und wieder aufgebaut.
 *
 * Vier Aufgaben, die zusammengehören, weil sie alle am selben Lebenszyklus
 * hängen: abonnieren, eingehende Änderungen 300 ms sammeln und einmal
 * invalidieren, nach einem Verbindungsverlust nachladen, und den
 * Degraded-Timer stellen, den `<SyncNotice />` anzeigt.
 */
export function useFamilyRealtime(): void {
  const qc = useQueryClient();
  const parent = useCurrentParent();
  const familyId = parent.data?.family_id ?? null;

  const buffer = useRef<FamilyChange[]>([]);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const degradeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousStatus = useRef<RealtimeStatus>("idle");

  useEffect(() => {
    const store = useRealtimeStatusStore.getState();

    if (!familyId) {
      store.setStatus("idle");
      store.setDegraded(false);
      previousStatus.current = "idle";
      return;
    }

    // Das `await` in `subscribeToFamilyChanges` (setAuth) kann nach dem Unmount
    // durchlaufen. Ohne diesen Marker bliebe der eben erzeugte Kanal verwaist
    // stehen — sichtbar erst als doppelte Ereignisse nach dem nächsten Mount.
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    const flush = () => {
      flushTimer.current = null;
      const changes = buffer.current;
      buffer.current = [];
      for (const key of invalidationKeysFor(changes)) {
        void qc.invalidateQueries({ queryKey: key });
      }
    };

    const handleStatus = (status: RealtimeStatus) => {
      const previous = previousStatus.current;
      previousStatus.current = status;
      useRealtimeStatusStore.getState().setStatus(status);

      if (degradeTimer.current) clearTimeout(degradeTimer.current);
      const delay = degradedDelayMs(status);
      degradeTimer.current =
        delay === null
          ? null
          : setTimeout(() => {
              useRealtimeStatusStore.getState().setDegraded(true);
            }, delay);

      // Verpasste Broadcasts kommen nicht nach: nach einer Unterbrechung ist
      // der Cache stumm veraltet.
      if (shouldRefetchAfterResubscribe(previous, status)) {
        for (const key of reconnectInvalidationKeys()) {
          void qc.invalidateQueries({ queryKey: key });
        }
      }
    };

    void subscribeToFamilyChanges({
      client: supabase,
      familyId,
      onChange: (change) => {
        buffer.current.push(change);
        if (flushTimer.current === null) {
          flushTimer.current = setTimeout(flush, COALESCE_WINDOW_MS);
        }
      },
      onStatus: handleStatus,
    }).then(
      (cleanup) => {
        if (cancelled) {
          cleanup();
          return;
        }
        unsubscribe = cleanup;
      },
      (error: unknown) => {
        // `setAuth` kann ablehnen (kein Token, kein Netz). Das ist kein
        // Kanal-Zustand, den der Server meldet — ohne diesen Zweig bliebe der
        // Status auf `subscribing` stehen und niemand erführe davon.
        console.error("[useFamilyRealtime] Kanal konnte nicht aufgebaut werden", { error });
        if (!cancelled) handleStatus("error");
      },
    );

    return () => {
      cancelled = true;
      unsubscribe?.();
      if (flushTimer.current) clearTimeout(flushTimer.current);
      if (degradeTimer.current) clearTimeout(degradeTimer.current);
      flushTimer.current = null;
      degradeTimer.current = null;
      buffer.current = [];
    };
  }, [familyId, qc]);
}
