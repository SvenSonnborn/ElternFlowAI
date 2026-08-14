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
  // NFC zuerst: die Umlaut-Regexe unten treffen nur vorkomponierte Zeichen.
  // Kommt "ü" zerlegt herein (u + combining diaeresis — macOS-Dateisysteme und
  // manche APIs liefern NFD), liefe es an ihnen vorbei und der NFD-Strip
  // darunter machte "nusse" statt "nuesse" daraus.
  let out = input.normalize("NFC").toLowerCase();
  for (const [pattern, replacement] of UMLAUTS) {
    out = out.replace(pattern, replacement);
  }

  return out
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
