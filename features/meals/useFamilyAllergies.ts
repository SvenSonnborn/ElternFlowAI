import { useMemo } from "react";

import { useCurrentParent, useFamilyChildren, useFamilyParents } from "@/features/auth";

import { familyAllergyKind, mergeAllergies, type FamilyAllergyState } from "./allergens";

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
 *
 * Wann der Zustand `known`, `loading` oder `unknown` ist, regelt
 * `familyAllergyKind`. Die Identität des Ergebnisses wechselt nur, wenn sich
 * `kind` oder `keys` ändern; `useRecipeJudge` hängt seinen `useCallback` daran.
 */
export function useFamilyAllergies(): FamilyAllergyState {
  const parent = useCurrentParent();
  const familyId = parent.data?.family_id;

  const children = useFamilyChildren(familyId);
  const parents = useFamilyParents(familyId);

  const keys = useMemo(
    () => mergeAllergies([...(children.data ?? []), ...(parents.data ?? [])]),
    [children.data, parents.data],
  );

  const kind = familyAllergyKind([parent, children, parents]);

  return useMemo(() => (kind === "known" ? { kind, keys } : { kind }), [kind, keys]);
}
