import type { Ingredient } from "../types";
import type { AllergenKey } from "./keys";

import { fold } from "./fold";
import { FOLDED_SPECS } from "./terms";

export interface TermMatch {
  readonly key: AllergenKey;
  /** Die auslösende Zutat im Original — für a11y-Text und Fehlersuche. */
  readonly evidence: string;
}

// Angehängt oder mit Space: "glutenfrei" wie "gluten free".
const NEGATION_SUFFIXES = ["frei", "free", "los", "ersatz", "alternative"] as const;

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
 * entferntes Milcheiweiß.
 */
function isNegated(haystack: string, start: number, end: number): boolean {
  const after = haystack.slice(end);
  const attached = after.startsWith(" ") ? after.slice(1) : after;
  if (NEGATION_SUFFIXES.some((suffix) => attached.startsWith(suffix))) return true;

  const before = haystack.slice(0, start).trimEnd();
  const lastWord = before.slice(before.lastIndexOf(" ") + 1);
  return (NEGATION_PREFIXES as readonly string[]).includes(lastWord);
}

/** Die Keys, die ein einzelner Text auslöst. Exportiert, weil die Tests darauf zielen. */
export function scanText(text: string): AllergenKey[] {
  const haystack = fold(text);
  if (!haystack) return [];

  const hits: AllergenKey[] = [];

  for (const spec of FOLDED_SPECS) {
    const matched = spec.terms.some((term) =>
      indicesOf(haystack, term.text).some((start) => {
        const end = start + term.text.length;
        if (term.mode === "word" && !isWordBoundary(haystack, start, end)) return false;
        if (isExcluded(haystack, start, end, spec.exclude)) return false;
        return !isNegated(haystack, start, end);
      }),
    );
    if (matched) hits.push(spec.key);
  }

  return hits;
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
    const evidence = ingredient.name.de?.trim() || ingredient.name.en?.trim() || "";

    for (const variant of [ingredient.name.de, ingredient.name.en]) {
      if (!variant) continue;
      for (const key of scanText(variant)) {
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ key, evidence });
      }
    }
  }

  return out;
}
