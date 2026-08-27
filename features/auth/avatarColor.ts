export const AVATAR_COLORS = [
  "#7DB6A8", // mint
  "#E8A56A", // orange
  "#A78BFA", // violet
  "#F47AA8", // pink
  "#5BB0E0", // blue
  "#C4B45D", // ochre
] as const;

/**
 * Splits by code point instead of UTF-16 unit.
 *
 * `.slice()` and `[0]` count units, so anything outside the BMP — an emoji, say
 * — gets cut in half and leaves a lone surrogate behind. That is not just an
 * ugly glyph: it is invalid UTF-8, and Postgres rejects it outright on the way
 * into `parents.short`.
 *
 * Grapheme clusters (ZWJ sequences, flags) still split here. `Intl.Segmenter`
 * would be the complete answer, but Hermes does not carry it dependably and an
 * initials field does not warrant that bet.
 */
function codePoints(value: string): string[] {
  return Array.from(value);
}

export function deriveShort(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) return "??";
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "??";
  if (words.length === 1) {
    const cp = codePoints(words[0]);
    if (cp.length === 1) return (words[0] + words[0]).toUpperCase();
    return cp.slice(0, 2).join("").toUpperCase();
  }
  return (codePoints(words[0])[0] + codePoints(words[1])[0]).toUpperCase();
}

/** Longest `short` the avatar chip renders without crowding. */
export const SHORT_MAX_LENGTH = 3;

/** Truncates to `SHORT_MAX_LENGTH` code points — see `codePoints`. */
export function capShort(input: string): string {
  return codePoints(input).slice(0, SHORT_MAX_LENGTH).join("");
}

/**
 * Turns whatever the user typed into the avatar chip's `short` into a value the
 * NOT NULL column will accept: trimmed, uppercased, at most three characters.
 *
 * An emptied field is not an error — it means "go back to the default", so it
 * falls through to `deriveShort(name)` rather than blocking the save.
 */
export function normalizeShort(input: string, name: string): string {
  const cleaned = capShort(input.trim().toUpperCase());
  return cleaned.length > 0 ? cleaned : deriveShort(name);
}
