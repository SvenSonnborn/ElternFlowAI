// Bringt Zutatentexte und Begriffslisten auf eine gemeinsame Form.
//
// Die Reihenfolge ist die Pointe: Umlautfaltung (ae/oe/ue/ss) läuft VOR dem
// NFD-Strippen. Umgekehrt würde "Nüsse" über die Zerlegung zu "nusse" statt
// "nuesse" — und wer "Nuesse" schreibt, träfe nicht mehr. Deutsche
// Umlautfaltung ist ae/oe/ue, nicht das Entfernen des Diakritikums; das
// Strippen danach fängt nur noch Lehnwörter wie "Crème fraîche".

const UMLAUTS: readonly (readonly [RegExp, string])[] = [
  [/ä/g, "ae"],
  [/ö/g, "oe"],
  [/ü/g, "ue"],
  [/ß/g, "ss"],
];

export function fold(input: string): string {
  let out = input.toLowerCase();
  for (const [pattern, replacement] of UMLAUTS) {
    out = out.replace(pattern, replacement);
  }

  return out
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
