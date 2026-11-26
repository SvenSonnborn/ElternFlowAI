import type { Ingredient } from "../types";
import type { AllergenKey } from "./keys";

import { fold } from "./fold";
import { FOLDED_SPECS, type FoldedSpec } from "./terms";

export interface TermMatch {
  readonly key: AllergenKey;
  /** Die auslösende Zutat im Original — für a11y-Text und Fehlersuche. */
  readonly evidence: string;
}

// Angehängt oder mit Space: "glutenfrei" wie "gluten free".
//
// Der Vergleich läuft gegen das *vollständige* Folgewort, nicht gegen dessen
// Anfang: ein `startsWith("frei")` hielt "Eier, Freilandhaltung" für eine
// Negation und verschluckte den Ei-Treffer. Die Endungsgruppe fängt die
// deutschen Beugungen ("glutenfreie", "-freier", "-freies").
const NEGATION_SUFFIX_RE = /^(frei|free|los|ersatz|alternative)(e|es|er|en|em)?$/;

// Als vorangehendes Wort: "ohne Ei", "vegane Sahne".
const NEGATION_PREFIXES = [
  "ohne",
  "without",
  "vegan",
  "vegane",
  "veganer",
  "veganes",
  "pflanzlich",
  "pflanzliche",
  "pflanzlicher",
] as const;

function indicesOf(haystack: string, needle: string): number[] {
  const out: number[] = [];
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    out.push(idx);
    idx = haystack.indexOf(needle, idx + 1);
  }
  return out;
}

function isWordBoundary(haystack: string, start: number, end: number): boolean {
  const before = start === 0 ? " " : haystack[start - 1];
  const after = end >= haystack.length ? " " : haystack[end];
  return before === " " && after === " ";
}

/** Liegt das Vorkommen vollständig innerhalb eines Ausschlussbegriffs? */
function isExcluded(
  haystack: string,
  start: number,
  end: number,
  excludes: readonly string[],
): boolean {
  return excludes.some((ex) =>
    indicesOf(haystack, ex).some((exStart) => exStart <= start && end <= exStart + ex.length),
  );
}

/**
 * Der Guard wirkt pro Vorkommen, nicht pro Key — das ist der Unterschied, an
 * dem "laktosefreie Milch" hängt: `laktose` wird negiert, `milch` bleibt
 * stehen, der Key trifft. Laktosefrei heißt gespaltener Milchzucker, nicht
 * entferntes Milcheiweiß. Die einzige Ausnahme steht in `scanSegment`: ein
 * verneinter Selbstbegriff ("glutenfreie Nudeln") räumt den Key im Teilstück ab.
 */
function isNegated(haystack: string, start: number, end: number): boolean {
  const after = haystack.slice(end);
  const attached = after.startsWith(" ") ? after.slice(1) : after;
  const nextWord = attached.split(" ", 1)[0] ?? "";
  if (NEGATION_SUFFIX_RE.test(nextWord)) return true;

  const before = haystack.slice(0, start).trimEnd();
  const lastWord = before.slice(before.lastIndexOf(" ") + 1);
  return (NEGATION_PREFIXES as readonly string[]).includes(lastWord);
}

// Wahl- und Bezugswörter trennen wie "oder": was nach "mit", "wahlweise" oder
// "statt" folgt, bezeichnet eine andere Zutat als der Teil davor. Nie aufnehmen:
// Wörter, die Negationspräfix oder -suffix sind ("alternative", "ersatz") — ein
// Trennwort darf keine Negation sein (Spec §5A).
const SEGMENT_WORDS = new Set([
  "oder",
  "or",
  "und",
  "and",
  "bzw",
  "mit",
  "with",
  "wahlweise",
  "alternativ",
  "alternatively",
  "ersatzweise",
  "optional",
  "optionally",
  "statt",
  "anstatt",
  "anstelle",
  "instead",
  "ggf",
  "evtl",
  "eventuell",
  "gegebenenfalls",
]);

/**
 * Zerlegt den Text an `/`, `&` und `+` (vor `fold()`, das diese Zeichen zu
 * Leerzeichen macht) und danach an den ganzen Wörtern aus `SEGMENT_WORDS`
 * (oder/und/bzw, mit, wahlweise, statt, ggf …). Komma und Klammern trennen
 * bewusst nicht: "Nudeln, glutenfrei" ist eine Aussage.
 */
function segments(text: string): string[] {
  const out: string[] = [];
  for (const part of text.split(/[/&+]/)) {
    let current: string[] = [];
    for (const word of fold(part).split(" ")) {
      if (SEGMENT_WORDS.has(word)) {
        out.push(current.join(" "));
        current = [];
      } else {
        current.push(word);
      }
    }
    out.push(current.join(" "));
  }
  return out.filter(Boolean);
}

/** Trifft der Key in diesem Teilstück? Regel und `revoked`: siehe `scanText`. */
function scanSegment(haystack: string, spec: FoldedSpec, revoked: boolean): boolean {
  const occurrences = (self: boolean | null) =>
    spec.terms
      .filter((term) => self === null || term.self === self)
      .flatMap((term) =>
        indicesOf(haystack, term.text)
          .map((start) => ({ start, end: start + term.text.length }))
          .filter(({ start, end }) => {
            if (term.mode === "word" && !isWordBoundary(haystack, start, end)) return false;
            return !isExcluded(haystack, start, end, spec.exclude);
          }),
      );

  // Ein Selbstbegriff, der in einem längeren steckt ("soy" in "soya"), zählt nicht
  // eigens: sein Folgewort wäre der Wortrest "a", und "soya-free" bliebe `soy`.
  const allSelfs = occurrences(true);
  const selfs = allSelfs.filter(
    (v) =>
      !allSelfs.some(
        (w) => w.start <= v.start && v.end <= w.end && w.end - w.start > v.end - v.start,
      ),
  );
  const negated = (v: { start: number; end: number }) => isNegated(haystack, v.start, v.end);
  const atWordStart = (v: { start: number }) => v.start === 0 || haystack[v.start - 1] === " ";
  if (!revoked && selfs.some((v) => negated(v) && atWordStart(v)) && selfs.every(negated))
    return false;

  return occurrences(null).some((v) => !negated(v));
}

/**
 * Die Keys, die ein einzelner Text auslöst. Exportiert, weil die Tests darauf zielen.
 *
 * Der Text wird in Teilstücke zerlegt (`segments`: `/ & +` und die Wörter aus
 * `SEGMENT_WORDS`), jedes einzeln bewertet, die Treffer vereinigt: "Weizennudeln
 * oder glutenfreie Nudeln" und "Spaghetti, wahlweise glutenfrei" melden Gluten,
 * weil die Verneinung der Alternative den anderen Teil nicht entlastet. Im
 * Zweifel bleibt der Treffer (Spec).
 *
 * Im Teilstück fällt ein Key weg, wenn (1) ein verneinter Selbstbegriff
 * (`Term.self`) am Wortanfang steht und (2) kein Selbstbegriff-Vorkommen
 * unverneint ist. Zu (1): "haselnussfreie Mandelschokolade" darf `nuss` in der
 * Mitte von "haselnuss" nicht als Selbstbegriff räumen lassen, sonst verlöre sie
 * den Treffer auf `mandel` (ebenso "thunfischfreie Lachspasta" den auf `lachs`).
 * Zu (2): jede Stelle zählt, auch mitten im Wort — "Vollmilch, milchfrei" bleibt
 * `milk`, weil `milch` in "vollmilch" unverneint steht. Enthält der Text irgendwo
 * das ganze Wort "nicht" oder "not", räumt kein Teilstück ab: "Nudeln, nicht
 * glutenfrei" ist keine Entwarnung, und "Nudeln, glutenfrei oder nicht" auch nicht,
 * obwohl `oder` das "nicht" in ein eigenes Teilstück trennt.
 *
 * Bekannte Grenze: "gluten- und laktosefreie Nudeln" zerfällt an `und` in
 * "gluten" und "laktosefreie nudeln"; `gluten` ohne Negation trifft. Das ist die
 * sichere Richtung (False Positive).
 */
export function scanText(text: string): AllergenKey[] {
  const parts = segments(text);
  const revoked = fold(text)
    .split(" ")
    .some((word) => word === "nicht" || word === "not");
  return FOLDED_SPECS.filter((spec) => parts.some((part) => scanSegment(part, spec, revoked))).map(
    (spec) => spec.key,
  );
}

/**
 * Beide Sprachvarianten werden gescannt: ein Rezept aus dem Crawler kann
 * englische Zutatennamen führen, und `localize()` fällt sprachübergreifend
 * zurück — der Klassifizierer muss das auch tun.
 */
export function scanIngredients(ingredients: readonly Ingredient[]): TermMatch[] {
  const seen = new Set<AllergenKey>();
  const out: TermMatch[] = [];

  for (const ingredient of ingredients) {
    for (const variant of [ingredient.name.de, ingredient.name.en]) {
      const evidence = variant?.trim();
      if (!evidence) continue;

      for (const key of scanText(evidence)) {
        if (seen.has(key)) continue;
        seen.add(key);
        // Die Variante, die den Treffer AUSGELÖST hat — nicht pauschal die
        // deutsche. Trifft nur der englische Name, benennt ein deutscher
        // `evidence`-Wert eine Zutat, die gar nichts ausgelöst hat, und die
        // Fehlersuche zeigt auf die falsche Stelle.
        out.push({ key, evidence });
      }
    }
  }

  return out;
}
