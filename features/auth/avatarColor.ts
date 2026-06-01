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
