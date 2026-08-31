import { useMemo } from "react";

import { usePendingDeletes } from "@/features/shared";

/** Was eine offene Aufgaben-Löschung im geteilten Store hinterlegt. */
export interface PendingTaskDelete {
  taskId: string;
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
