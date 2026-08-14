// Stabile Allergie-KEYS — niemals lokalisierte Labels. Persistiert in
// `children.allergies[]` und `parents.allergies[]`, gerendert über
// `onb.s4.allergies.<key>`, damit ein Sprachwechsel die Labels neu rendert,
// ohne gespeicherte Daten anzufassen.
//
// Seit dem Allergen-Filter (ADR-014) ist das Vokabular auf die 14
// EU-Pflichtallergene erweitert und lebt in `features/meals/allergens/keys.ts`,
// zusammen mit den Begriffslisten, die es auf Zutaten abbilden. Diese Datei
// bleibt als Import-Pfad bestehen, den Onboarding und Kinderprofil kennen.

export {
  ALLERGEN_KEYS as ALLERGY_KEYS,
  type AllergenKey as AllergyKey,
} from "@/features/meals/allergens";
