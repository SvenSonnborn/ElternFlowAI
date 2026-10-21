import { useMemo } from "react";

import type { PendingDelete } from "@/features/shared";

import { usePendingDeletes } from "@/features/shared";

import type { MealPlanEntryWithRecipe, MealSlot } from "./types";

/** Was eine offene Essensplan-Löschung im geteilten Store hinterlegt. */
export interface PendingMealDelete {
  entryId: string;
  date: string;
  slot: MealSlot;
}

/**
 * Filtert vorgemerkte Löschungen aus den Einträgen. Ohne offene Löschung
 * kommt die Eingabe unverändert zurück (keine Kopie im Normalfall).
 */
export function withoutPendingMealDeletes(
  entries: MealPlanEntryWithRecipe[],
  pendingIds: ReadonlySet<string>,
): MealPlanEntryWithRecipe[] {
  if (pendingIds.size === 0) return entries;
  return entries.filter((entry) => !pendingIds.has(entry.id));
}

/**
 * Die Ids der Einträge im Undo-Fenster. Der einzige Cast dieses Features:
 * `kind: "meal"` ist der Diskriminator, der ihn trägt.
 */
export function usePendingMealIds(): ReadonlySet<string> {
  const entries = usePendingDeletes("meal");
  return useMemo(
    () => new Set(entries.map((entry) => (entry.target as PendingMealDelete).entryId)),
    [entries],
  );
}

/**
 * Die offene Löschung für einen Platz, falls es eine gibt. Wer auf einen
 * Platz plant, dessen Löschung noch im Undo-Fenster steht, schließt sie zuerst
 * ab (`commit`), sonst nennte der Ersetzen-Dialog das gerade gelöschte Rezept.
 */
export function findPendingMealDelete(
  entries: PendingDelete[],
  date: string,
  slot: MealSlot,
): PendingDelete | undefined {
  return entries.find((entry) => {
    if (entry.kind !== "meal") return false;
    const target = entry.target as PendingMealDelete;
    return target.date === date && target.slot === slot;
  });
}
