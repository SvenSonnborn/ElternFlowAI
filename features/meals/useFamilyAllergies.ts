import { useMemo } from "react";

import { useCurrentParent, useFamilyChildren, useFamilyParents } from "@/features/auth";

import { mergeAllergies, type AllergenKey } from "./allergens";

interface UseFamilyAllergiesResult {
  keys: AllergenKey[];
  isLoading: boolean;
  error: unknown;
}

/**
 * Die Allergien der ganzen Familie — Kinder **und** Eltern.
 *
 * `patterns/meals.md` sagt "any family member", und `parents.allergies`
 * existiert im Schema. Kein eigener `useCurrentFamily`: `useCurrentParent`
 * liefert die `family_id` bereits, ein zusätzlicher Hook hätte keinen zweiten
 * Aufrufer.
 *
 * Liegt unter `features/meals/`, weil Meals der einzige Verbraucher ist; zieht
 * um, sobald ein zweiter dazukommt. Die eigentliche Zusammenführung steht in
 * `allergens/members.ts` — dort ist sie ohne React-Renderer testbar.
 */
export function useFamilyAllergies(): UseFamilyAllergiesResult {
  const parent = useCurrentParent();
  const familyId = parent.data?.family_id;

  const children = useFamilyChildren(familyId);
  const parents = useFamilyParents(familyId);

  const keys = useMemo(
    () => mergeAllergies([...(children.data ?? []), ...(parents.data ?? [])]),
    [children.data, parents.data],
  );

  return {
    keys,
    isLoading: parent.isLoading || children.isLoading || parents.isLoading,
    error: parent.error ?? children.error ?? parents.error,
  };
}
