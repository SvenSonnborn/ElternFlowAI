import { MutationObserver, QueryClient } from "@tanstack/query-core";
import { describe, expect, test } from "bun:test";

/**
 * Testet keine fremde Bibliothek, sondern eine Garantie, auf der das gesamte
 * Undo-Löschen-Feature steht: `useUndoableDelete` plant die eigentliche
 * Mutation erst fünf Sekunden in der Zukunft (siehe `useUndoableDelete.ts`),
 * und der auslösende Screen ist zu diesem Zeitpunkt längst unmontiert —
 * `onDelete` navigiert sofort nach dem Planen weg (Task 8, `TaskEditScreen.tsx`).
 *
 * Bricht diese Garantie — etwa durch einen Dependency-Bump von
 * `@tanstack/react-query`, den Renovate in diesem Repo automatisch anhebt —,
 * würde `deleteMutation.mutateAsync(...)` nach dem Unmount einfach nichts mehr
 * tun. Das Item ist zu diesem Zeitpunkt nur *versteckt* (der Pending-Delete-
 * Filter blendet es aus den Listen-Hooks aus, siehe `pendingDeletes.ts`) —
 * beim nächsten Refetch käme es kommentarlos zurück. Kein Fehler, kein Log,
 * kein Toast: der Nutzer glaubt, etwas gelöscht zu haben, das nie gelöscht
 * wurde. Dieser Test hält die Voraussetzung dafür fest, dass genau das nicht
 * passiert, direkt gegen `@tanstack/query-core` statt nur in einem Kommentar
 * oder Report.
 *
 * Zwei Fälle, nicht einer: Fall 1 allein würde grün bleiben, selbst wenn
 * beide Callback-Pfade (Hook-Level und Per-Call) nach dem Unsubscribe liefen
 * — er würde also nicht zeigen, *warum* `mutateAsync` ohne zweites Argument
 * die richtige Wahl ist. Erst Fall 2 belegt, dass es den Unterschied
 * tatsächlich gibt, auf den sich Task 8 verlässt.
 */
describe("MutationObserver feuert nach dem Unsubscribe (Unmount-Ersatz)", () => {
  test("Hook-Level-onSettled läuft weiter — der Pfad, den mutateAsync nutzt", async () => {
    const qc = new QueryClient();
    let settled = false;

    const observer = new MutationObserver(qc, {
      // eslint-disable-next-line @typescript-eslint/require-await -- `mutationFn` muss Promise<TData> liefern, der Stub braucht kein await
      mutationFn: async () => "ok",
      onSettled: () => {
        settled = true;
      },
    });

    // `subscribe` simuliert das Mounten des Screens (das ist, was
    // `useMutation` intern über `useSyncExternalStore` tut), der
    // zurückgegebene Unsubscribe das Unmounten.
    const unsubscribe = observer.subscribe(() => {});
    unsubscribe();

    // Entspricht `deleteMutation.mutateAsync({ taskId })` — kein zweites
    // Argument, also keine Per-Call-Callbacks im Spiel.
    await observer.mutate(undefined);

    expect(settled).toBe(true);
  });

  test("Per-Call-onSettled läuft NICHT mehr — der Pfad, den Task 8 bewusst meidet", async () => {
    const qc = new QueryClient();
    let settled = false;

    const observer = new MutationObserver(qc, {
      // eslint-disable-next-line @typescript-eslint/require-await -- `mutationFn` muss Promise<TData> liefern, der Stub braucht kein await
      mutationFn: async () => "ok",
    });

    const unsubscribe = observer.subscribe(() => {});
    unsubscribe();

    // Entspricht der alten Implementierung:
    // `deleteMutation.mutate({ taskId }, { onSuccess, onError })`.
    await observer.mutate(undefined, {
      onSettled: () => {
        settled = true;
      },
    });

    expect(settled).toBe(false);
  });
});
