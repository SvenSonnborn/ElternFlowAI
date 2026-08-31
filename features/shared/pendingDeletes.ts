import { useMemo } from "react";
import { create } from "zustand";

/**
 * Die Warteschlange der Löschungen, die noch rückgängig gemacht werden können.
 *
 * Der Kniff des ganzen Features steht in diesem Modul: eine Löschung wird
 * nicht ausgeführt und später zurückgenommen, sondern **verzögert**. Das Item
 * ist in der Zwischenzeit nur *versteckt* — die beiden Listen-Hooks filtern es
 * heraus —, und „Rückgängig" heißt schlicht, den Eintrag zu entfernen, bevor
 * der Timer feuert. Deshalb gibt es hier keinen Rollback: es gibt nichts
 * zurückzurollen (siehe Decision 1 der Spec).
 *
 * Bewusst **ohne `react-native`-Import**, wie `toastStore.ts` — so laufen die
 * Tests unter Bun, ohne sich auf die Mocks aus `bun.test.preload.ts` zu
 * verlassen. Der `AppState`-Teil lebt in `useFlushPendingDeletes.ts`.
 */

export type PendingDeleteKind = "task" | "event";

/** Wie lange „Rückgängig" erreichbar bleibt. Siehe Decision 10 der Spec. */
export const UNDO_WINDOW_MS = 5000;

export interface PendingDelete {
  id: string;
  kind: PendingDeleteKind;
  /**
   * Vom besitzenden Feature interpretiert — `features/shared` darf nichts aus
   * `features/calendar` importieren, ohne die Abhängigkeitsrichtung
   * umzudrehen. `kind` ist der Diskriminator, der den einen Cast pro Feature
   * absichert (Decision 2 der Spec).
   */
  target: unknown;
  /** Die eigentliche Mutation. Läuft genau einmal — oder nie. */
  run: () => Promise<void>;
}

interface PendingDeleteState {
  entries: PendingDelete[];
  schedule: (
    kind: PendingDeleteKind,
    target: unknown,
    run: () => Promise<void>,
    delayMs?: number,
  ) => string;
  undo: (id: string) => void;
  flush: () => void;
}

// Timer und Laufmarker gehören nicht in den Store: sie lösen kein Rendern aus,
// und ein `setTimeout`-Handle im State würde bei jedem Abonnenten als Änderung
// durchschlagen.
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const running = new Set<string>();

let sequence = 0;

function clearTimer(id: string): void {
  const handle = timers.get(id);
  if (handle !== undefined) {
    clearTimeout(handle);
    timers.delete(id);
  }
}

function remove(id: string): void {
  usePendingDeleteStore.setState((state) => ({
    entries: state.entries.filter((entry) => entry.id !== id),
  }));
}

/**
 * Führt eine Löschung aus und gibt das Item danach wieder frei — **auch wenn
 * die Mutation wirft**. Ein Eintrag, der nach einem Fehler stehen bliebe,
 * würde das Item für den Rest der Sitzung unsichtbar halten, obwohl es auf dem
 * Server noch existiert.
 *
 * `running` schützt vor Doppelausführung: `flush()` darf mehrfach kommen (zwei
 * schnelle App-Wechsel), während `run` noch läuft.
 *
 * Der `catch` fängt `run` ab und loggt: beide Aufrufer von `commit`
 * (`schedule`s Timer, `flush`) rufen mit `void` auf, niemand hängt sich an die
 * zurückgegebene Promise — ohne den `catch` würde eine abgelehnte
 * `run`-Promise zu einem unhandled rejection statt zu einem sauber entfernten
 * Eintrag. Der geloggte Fall ist der *unerwartete* Fehler (ein Bug in `run`),
 * nicht der erwartete Netzwerkfehler — den fängt der Aufrufer selbst ab und
 * meldet ihn per Toast, bevor er den Store überhaupt erreicht. Wie
 * `mapTaskError`/`mapAuthError` und `deepLinkHandler` loggt dieses Modul einen
 * solchen Fall statt ihn spurlos zu schlucken.
 */
async function commit(id: string): Promise<void> {
  if (running.has(id)) return;
  const entry = usePendingDeleteStore.getState().entries.find((e) => e.id === id);
  if (!entry) return;

  clearTimer(id);
  running.add(id);
  try {
    await entry.run();
  } catch (error) {
    console.error("[pendingDeletes] commit failed", { id, error });
  } finally {
    running.delete(id);
    remove(id);
  }
}

export const usePendingDeleteStore = create<PendingDeleteState>((set, get) => ({
  entries: [],

  schedule: (kind, target, run, delayMs = UNDO_WINDOW_MS) => {
    sequence += 1;
    const id = `pending-delete-${sequence}`;
    set((state) => ({ entries: [...state.entries, { id, kind, target, run }] }));
    timers.set(
      id,
      setTimeout(() => {
        void commit(id);
      }, delayMs),
    );
    return id;
  },

  undo: (id) => {
    clearTimer(id);
    remove(id);
  },

  flush: () => {
    for (const entry of get().entries) {
      void commit(entry.id);
    }
  },
}));

/**
 * Die offenen Löschungen eines Features, referenzstabil solange sich nichts
 * ändert — die Listen-Hooks hängen sie an `useMemo`-Abhängigkeiten, ein bei
 * jedem Render neues Array würde dort die Memoisierung wertlos machen.
 */
export function usePendingDeletes(kind: PendingDeleteKind): PendingDelete[] {
  const entries = usePendingDeleteStore((state) => state.entries);
  return useMemo(() => entries.filter((entry) => entry.kind === kind), [entries, kind]);
}

/**
 * Ob ein `AppState`-Wechsel das Undo-Fenster schließen soll.
 *
 * Nur `background`. Auf iOS tritt `inactive` auch beim Herunterziehen des
 * Kontrollzentrums, bei einer Anruf-Einblendung und in der App-Switcher-
 * Vorschau auf — dort zu committen nähme dem Nutzer das Fenster weg, ohne dass
 * er die App verlassen hat (Decision 4 der Spec).
 */
export function shouldFlushOnStateChange(next: string): boolean {
  return next === "background";
}
