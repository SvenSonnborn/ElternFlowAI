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
