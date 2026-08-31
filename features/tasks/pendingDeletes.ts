import { useMemo } from "react";

import { usePendingDeletes } from "@/features/shared";

import type { TaskWithType } from "./types";

/** Was eine offene Aufgaben-Löschung im geteilten Store hinterlegt. */
export interface PendingTaskDelete {
  taskId: string;
}

/**
 * Filtert die offenen Löschungen aus einer Aufgabenliste.
 *
 * Gibt im Normalfall — nichts offen — die Eingabe **unverändert** zurück, statt
 * eine Kopie. Das spart im weitaus häufigsten Fall einen Durchlauf und eine
 * Allokation; für die Referenzstabilität von `useFamilyTasks.data` tut es
 * nichts, denn der Aufruf steht innerhalb desselben `useMemo`, und das
 * zugrundeliegende Datenladen baut ohnehin bei jedem Lauf das neue Array.
 */
export function withoutPendingTaskDeletes(
  tasks: TaskWithType[],
  pendingIds: ReadonlySet<string>,
): TaskWithType[] {
  if (pendingIds.size === 0) return tasks;
  return tasks.filter((row) => !pendingIds.has(row.id));
}

/**
 * Die Ids der Aufgaben, die gerade im Undo-Fenster stehen.
 *
 * Hier steht der **einzige** Cast dieses Features — Begründung wie bei
 * `features/calendar/pendingDeletes.ts`: `kind: "task"` ist der Diskriminator,
 * der ihn trägt (Decision 2 der Spec).
 */
export function usePendingTaskIds(): ReadonlySet<string> {
  const entries = usePendingDeletes("task");
  return useMemo(
    () => new Set(entries.map((entry) => (entry.target as PendingTaskDelete).taskId)),
    [entries],
  );
}
