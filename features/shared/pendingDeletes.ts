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

/**
 * Wie lange `commit` höchstens auf `run()` wartet, bevor es den Eintrag
 * freigibt.
 *
 * Es gibt sonst **keine** Obergrenze: [client.ts](../supabase/client.ts) setzt
 * dem `fetch` kein Timeout, und `useDeleteEvent.onSuccess` gibt zusätzlich
 * sein `invalidateQueries` zurück — gewartet wird also auch auf den Refetch.
 * Hinter einem Captive Portal steht die Verbindung, die Antwort kommt nie, und
 * `fetch` resolved weder noch rejected: ohne Watchdog bliebe der Eintrag für
 * den Rest der Sitzung stehen und hielte das Item aus jeder Liste heraus.
 */
export const COMMIT_TIMEOUT_MS = 30_000;

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
  /**
   * Obergrenze für das Warten auf `run` (siehe `COMMIT_TIMEOUT_MS`). Liegt am
   * Eintrag statt an `commit`, damit `flush()` ohne eigenen Timeout-Parameter
   * auskommt und die Tests den Watchdog genauso kurz stellen können wie
   * `delayMs`.
   */
  timeoutMs: number;
}

interface PendingDeleteState {
  entries: PendingDelete[];
  schedule: (
    kind: PendingDeleteKind,
    target: unknown,
    run: () => Promise<void>,
    delayMs?: number,
    timeoutMs?: number,
  ) => string;
  /** `true`, wenn der Eintrag noch aufzuhalten war — siehe `undo` unten. */
  undo: (id: string) => boolean;
  /**
   * Führt alle offenen Löschungen sofort aus. Das zurückgegebene Promise
   * settelt, wenn sie durch sind — `useSignOut` wartet darauf, damit das
   * DELETE noch angemeldet läuft; ohne das Warten könnte `signOut` die lokale
   * Session entfernen, bevor die Mutation ihren Token aufgelöst hat, und das
   * DELETE liefe unangemeldet gegen RLS.
   *
   * Gewartet wird auch auf Löschungen, die schon **laufen** — etwa weil der
   * Timer sie Millisekunden vorher selbst gestartet hat. Genau dort säße sonst
   * dasselbe Loch nur um einen Wimpernschlag verschoben. Das Warten ist
   * begrenzt: jeder Commit hat seinen eigenen Watchdog.
   */
  flush: () => Promise<void>;
}

// Timer und Laufmarker gehören nicht in den Store: sie lösen kein Rendern aus,
// und ein `setTimeout`-Handle im State würde bei jedem Abonnenten als Änderung
// durchschlagen.
const timers = new Map<string, ReturnType<typeof setTimeout>>();
// Id → Promise des laufenden Commits. Eine `Map` statt eines `Set`, damit
// `commit` einem zweiten Aufrufer das **laufende** Promise zurückgeben kann,
// statt nur „läuft schon" zu melden — daran hängt, dass `flush()` auch auf
// bereits gestartete Löschungen wartet.
const running = new Map<string, Promise<void>>();

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
 * `running` schützt vor Doppelausführung und macht das Warten teilbar: Ein
 * zweiter Aufruf bekommt das Promise des laufenden Commits zurück statt sofort
 * umzukehren. `flush()` wartet damit auch auf eine Löschung, die der Timer
 * gerade selbst gestartet hat — sonst könnte `useSignOut` die Session
 * entfernen, während der authentifizierte DELETE noch fliegt.
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
 *
 * **Der Watchdog** deckt den dritten Ausgang ab, den ein `try`/`catch` nicht
 * kennt: `run` settelt nie (siehe `COMMIT_TIMEOUT_MS`). Nach `entry.timeoutMs`
 * gibt `commit` den Eintrag frei und loggt — die Mutation wird dabei
 * ausdrücklich **nicht** abgebrochen, sie darf ruhig noch ankommen; wir hören
 * nur auf, auf sie zu warten. Das Item ist damit wieder sichtbar, und wenn die
 * Löschung doch noch durchgeht, räumt der nächste Refetch es weg — sichtbar
 * und selbstheilend statt unsichtbar bis zum App-Neustart.
 */
function commit(id: string): Promise<void> {
  const inFlight = running.get(id);
  if (inFlight) return inFlight;

  const entry = usePendingDeleteStore.getState().entries.find((e) => e.id === id);
  if (!entry) return Promise.resolve();

  clearTimer(id);
  // `running.set` steht nach dem Start, aber vor dem ersten `await` in
  // `runCommit` — ein nebenläufiger `commit` kann frühestens im nächsten Tick
  // kommen und findet den Eintrag dann vor.
  const work = runCommit(id, entry).finally(() => {
    running.delete(id);
    remove(id);
  });
  running.set(id, work);
  return work;
}

/** Der eigentliche Lauf; `commit` kümmert sich um Buchführung und Freigabe. */
async function runCommit(id: string, entry: PendingDelete): Promise<void> {
  // Der `catch` hängt an `run` selbst, nicht am `race`: Lehnt die Mutation ab,
  // nachdem der Watchdog gewonnen hat, nimmt das `race` ihre Ablehnung nicht
  // mehr entgegen — aus dem Fehler würde ein unhandled rejection statt eines
  // Logs. `Promise.resolve().then` fängt zusätzlich ein synchrones `throw` aus
  // `run` ein, das sonst an `commit` vorbeiliefe.
  const settled = Promise.resolve()
    .then(() => entry.run())
    .catch((error: unknown) => {
      console.error("[pendingDeletes] commit failed", { id, error });
    });

  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  await Promise.race([
    settled,
    new Promise<void>((resolve) => {
      watchdog = setTimeout(() => {
        timedOut = true;
        resolve();
      }, entry.timeoutMs);
    }),
  ]);
  // Im Erfolgsfall bleibt der Timer sonst als offenes Handle stehen.
  if (watchdog !== undefined) clearTimeout(watchdog);

  if (timedOut) {
    console.error("[pendingDeletes] commit timed out", { id, timeoutMs: entry.timeoutMs });
  }
}

export const usePendingDeleteStore = create<PendingDeleteState>((set, get) => ({
  entries: [],

  schedule: (kind, target, run, delayMs = UNDO_WINDOW_MS, timeoutMs = COMMIT_TIMEOUT_MS) => {
    sequence += 1;
    const id = `pending-delete-${sequence}`;
    set((state) => ({ entries: [...state.entries, { id, kind, target, run, timeoutMs }] }));
    timers.set(
      id,
      setTimeout(() => {
        void commit(id);
      }, delayMs),
    );
    return id;
  },

  // Läuft die Löschung schon, kommt „Rückgängig" zu spät: `run` hat bereits
  // `dismiss(toastId)` gerufen, aber React hat das Entfernen noch nicht
  // gerendert — ein Tap in genau diesem Frame landet noch hier. Ohne den Guard
  // verschwände der Eintrag, das Item blitzte zurück in die Liste, und die
  // Löschung liefe trotzdem durch. Der Rückgabewert sagt dem Aufrufer, ob es
  // gegriffen hat, damit er den Fall später melden kann.
  undo: (id) => {
    if (running.has(id)) return false;
    clearTimer(id);
    remove(id);
    return true;
  },

  flush: async () => {
    await Promise.all(
      get().entries.map((entry) =>
        // `commit` lehnt nie ab — der Fehler ist innen gefangen, der Watchdog
        // begrenzt die Wartezeit. Der `catch` steht trotzdem: Ein Abmelden darf
        // niemals daran scheitern, dass eine Löschung sich verschluckt.
        commit(entry.id).catch((error: unknown) => {
          console.error("[pendingDeletes] flush failed", { id: entry.id, error });
        }),
      ),
    );
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
