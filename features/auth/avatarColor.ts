export const AVATAR_COLORS = [
  "#7DB6A8", // mint
  "#E8A56A", // orange
  "#A78BFA", // violet
  "#F47AA8", // pink
  "#5BB0E0", // blue
  "#C4B45D", // ochre
] as const;

export function deriveShort(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) return "??";
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "??";
  if (words.length === 1) {
    const w = words[0];
    if (w.length === 1) return (w + w).toUpperCase();
    return w.slice(0, 2).toUpperCase();
  }
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Longest `short` the avatar chip renders without crowding. */
export const SHORT_MAX_LENGTH = 3;

/**
 * Turns whatever the user typed into the avatar chip's `short` into a value the
 * NOT NULL column will accept: trimmed, uppercased, at most three characters.
 *
 * An emptied field is not an error — it means "go back to the default", so it
 * falls through to `deriveShort(name)` rather than blocking the save.
 */
export function normalizeShort(input: string, name: string): string {
  const cleaned = input.trim().toUpperCase().slice(0, SHORT_MAX_LENGTH);
  return cleaned.length > 0 ? cleaned : deriveShort(name);
}
