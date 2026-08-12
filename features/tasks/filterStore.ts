import { useMemo } from "react";
import { create } from "zustand";

import type { DueFilter, StatusFilter, TaskFilter } from "./filter";

import { DEFAULT_TASK_FILTER } from "./filter";

interface TaskFilterState extends TaskFilter {
  setStatus: (status: StatusFilter) => void;
  setDue: (due: DueFilter) => void;
  /** Eine `child_id`, `CHILD_ALL` oder `CHILD_NONE`. */
  setChild: (childId: string) => void;
  reset: () => void;
}

/**
 * Der aktive Filter des Aufgaben-Screens. Bewusst ohne `persist`-Middleware:
 * der Filter soll den Tab-Wechsel überleben, aber nicht den App-Neustart — ein
 * vor einer Woche gesetzter Kind-Filter würde sonst eine unvollständige Liste
 * zeigen, ohne dass erkennbar wäre, warum. Gleiches Muster wie `themeStore`.
 */
export const useTaskFilterStore = create<TaskFilterState>((set) => ({
  ...DEFAULT_TASK_FILTER,
  setStatus: (status) => set({ status }),
  setDue: (due) => set({ due }),
  setChild: (childId) => set({ childId }),
  reset: () => set({ ...DEFAULT_TASK_FILTER }),
}));

/**
 * Die drei Dimensionen als ein Objekt.
 *
 * Drei Einzel-Selektoren statt eines Objekt-Selektors: `useSyncExternalStore`
 * verlangt einen referenzstabilen Snapshot, und `(s) => ({ status, due, childId })`
 * gäbe bei jedem Render ein neues Objekt zurück — das endet in einer
 * Render-Schleife statt in einem Filter.
 */
export function useTaskFilter(): TaskFilter {
  const status = useTaskFilterStore((s) => s.status);
  const due = useTaskFilterStore((s) => s.due);
  const childId = useTaskFilterStore((s) => s.childId);

  return useMemo(() => ({ status, due, childId }), [status, due, childId]);
}
