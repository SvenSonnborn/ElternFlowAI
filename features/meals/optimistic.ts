import type { QueryClient } from "@tanstack/react-query";

import { parseISO } from "date-fns";

import type { MealParent, PlanMealVars } from "./mutations";
import type { MealPlanEntryWithRecipe, MealSlot, RecipeRow } from "./types";

import { mealKeys } from "./queries";
import { toDateKey, weekStartFor } from "./week";

/** Präfix der vorläufigen Id einer optimistisch eingefügten Zeile. */
export const OPTIMISTIC_ID_PREFIX = "optimistic:";

/**
 * Ob die Zeile nur im Cache existiert. Aufrufer dürfen eine solche Id nie an
 * den Server schicken (Ersetzen/Löschen wäre ein Schuss ins Leere).
 */
export function isOptimisticEntry(entry: { id: string }): boolean {
  return entry.id.startsWith(OPTIMISTIC_ID_PREFIX);
}

/**
 * Der Eintrag, den der Einplan-Ablauf auf einem Platz als Belegung behandelt,
 * oder `null`.
 *
 * Zwei Zeilen im Cache zählen nicht. Eine im Undo-Fenster (`pendingIds`): Der
 * Platz sieht leer aus, also verhält er sich so. Und eine optimistische: Ihre
 * vorläufige Id ist keine `uuid`, ein Ersetzen darauf endete bei PostgREST in
 * `22P02` statt in einem Compare-and-Swap-Fehlschuss — und weil `onError` den
 * Snapshot mit derselben Zeile wiederherstellt, jedes Mal wieder. Ohne
 * Belegung plant der Ablauf per INSERT ein; ist die echte Zeile inzwischen
 * geschrieben, trifft er die Eindeutigkeit, und `MealSlotOccupiedError`
 * bringt sie samt echter Id für den Ersetzen-Dialog mit.
 */
export function slotOccupant(
  entries: readonly MealPlanEntryWithRecipe[] | undefined,
  pendingIds: ReadonlySet<string>,
  date: string,
  slot: MealSlot,
): MealPlanEntryWithRecipe | null {
  const entry = entries?.find(
    (e) => e.date === date && e.meal_slot === slot && !pendingIds.has(e.id),
  );
  return entry && !isOptimisticEntry(entry) ? entry : null;
}

/**
 * Die vorläufige Zeile für `usePlanMeal`. `id` und `created_at` sind erfunden;
 * `onSuccess` ersetzt die Zeile durch die vom Server zurückgegebene, der
 * Refetch nach `onSettled` bestätigt sie.
 */
export function optimisticEntry(
  vars: PlanMealVars,
  parent: MealParent,
  now: Date,
): MealPlanEntryWithRecipe {
  return {
    id: `${OPTIMISTIC_ID_PREFIX}${vars.date}:${vars.slot}`,
    family_id: parent.family_id,
    created_by: parent.id,
    created_at: now.toISOString(),
    date: vars.date,
    meal_slot: vars.slot,
    recipe_id: vars.recipe.id,
    notes: null,
    servings_override: null,
    recipe: vars.recipe,
  };
}

/**
 * Setzt `entry` auf seinen Platz. Ein vorhandener Eintrag desselben Platzes
 * fällt weg: Die Datenbank erlaubt je Platz genau einen, zwei Zeilen im Cache
 * würden `groupByDay` einen beliebigen davon wählen lassen.
 */
export function applyPlan(
  entries: MealPlanEntryWithRecipe[],
  entry: MealPlanEntryWithRecipe,
): MealPlanEntryWithRecipe[] {
  return [
    ...entries.filter((e) => !(e.date === entry.date && e.meal_slot === entry.meal_slot)),
    entry,
  ];
}

/** Tauscht das Rezept eines Eintrags; die Eingabe bleibt unverändert. */
export function applyReplace(
  entries: MealPlanEntryWithRecipe[],
  entryId: string,
  recipe: RecipeRow,
): MealPlanEntryWithRecipe[] {
  return entries.map((e) => (e.id === entryId ? { ...e, recipe_id: recipe.id, recipe } : e));
}

/** Entfernt einen Eintrag; die Eingabe bleibt unverändert. */
export function applyRemove(
  entries: MealPlanEntryWithRecipe[],
  entryId: string,
): MealPlanEntryWithRecipe[] {
  return entries.filter((e) => e.id !== entryId);
}

/** Der Stand einer Wochen-Query vor dem Patch: Key plus Daten (oder `undefined`). */
export interface MealWeekSnapshot {
  key: readonly unknown[];
  entries: MealPlanEntryWithRecipe[] | undefined;
}

/**
 * Patcht nur die Woche, in der `date` liegt. Der Key wird wie in
 * `useMealPlans` gebildet (Montag der Woche); eine nicht geladene Woche bleibt
 * unberührt statt mit einem Teilstand angelegt zu werden. `cancelQueries`
 * läuft vorher, damit ein laufender Refetch den Patch nicht überschreibt.
 */
export async function patchMealWeek(
  qc: QueryClient,
  date: string,
  updater: (entries: MealPlanEntryWithRecipe[]) => MealPlanEntryWithRecipe[],
): Promise<MealWeekSnapshot> {
  const key = mealKeys.plan(toDateKey(weekStartFor(parseISO(date))));
  await qc.cancelQueries({ queryKey: key });
  const entries = qc.getQueryData<MealPlanEntryWithRecipe[]>(key);
  if (entries) qc.setQueryData<MealPlanEntryWithRecipe[]>(key, updater(entries));
  return { key, entries };
}

/**
 * Stellt den Stand vor dem Patch wieder her — inhaltlich gleich; React Query
 * teilt Struktur, die Array-Referenz kann deshalb eine neue sein.
 */
export function restoreMealWeek(qc: QueryClient, snapshot: MealWeekSnapshot | undefined): void {
  if (!snapshot || !snapshot.entries) return;
  qc.setQueryData(snapshot.key, snapshot.entries);
}
