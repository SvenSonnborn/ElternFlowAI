export type StrengthLabel = "weak" | "fair" | "good" | "strong";

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: StrengthLabel;
  acceptable: boolean;
}

export function passwordStrength(input: string): PasswordStrength {
  if (input.length === 0) return { score: 0, label: "weak", acceptable: false };

  let score = 0;
  if (input.length >= 6) score += 1;
  if (input.length >= 8) score += 1;
  if (/\d/.test(input)) score += 1;
  if (/[A-Z]/.test(input) && /[^a-zA-Z0-9]/.test(input)) score += 1;

  const clamped = Math.min(4, Math.max(1, score)) as 1 | 2 | 3 | 4;
  const label: StrengthLabel =
    clamped === 1 ? "weak" : clamped === 2 ? "fair" : clamped === 3 ? "good" : "strong";

  return { score: clamped, label, acceptable: clamped >= 3 };
}
