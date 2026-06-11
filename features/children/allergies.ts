// Stable allergy KEYS — never localized labels. These are persisted in
// `children.allergies[]` and rendered through i18n (`onb.s4.allergies.<key>`),
// so switching the app language re-renders the labels without touching stored
// data. See docs/decision-log.md / docs/TODO.md (Allergie-Locale-Coupling).

export type AllergyKey = "peanuts" | "milk" | "eggs" | "gluten" | "soy" | "nuts";

export const ALLERGY_KEYS: readonly AllergyKey[] = [
  "peanuts",
  "milk",
  "eggs",
  "gluten",
  "soy",
  "nuts",
] as const;
