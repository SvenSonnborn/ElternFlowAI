import type { IconName } from "@/app-sections/shared";
import type { Theme } from "@/design-system/themes";

import { palette } from "@/design-system";

const SLUG_TO_HEX: Record<string, string> = {
  schule: palette.event.schule,
  arzt: palette.event.arzt,
  sport: palette.event.sport,
  training: palette.event.sport,
  ha: palette.event.ha,
  hausaufgaben: palette.event.ha,
  family: palette.event.family,
  meal: palette.event.meal,
};

const SLUG_TO_ICON: Record<string, IconName> = {
  schule: "school",
  arzt: "doctor",
  sport: "ball",
  training: "ball",
  ha: "book-open",
  hausaufgaben: "book-open",
  family: "users",
  meal: "utensils",
};

const DB_ICON_TO_ICON: Record<string, IconName> = {
  school: "school",
  stethoscope: "doctor",
  activity: "ball",
  users: "users",
  utensils: "utensils",
  "book-open": "book-open",
  calendar: "calendar",
};

export function eventColorFor(slug: string, roleFallback: string, theme: Theme): string {
  const hex = SLUG_TO_HEX[slug];
  if (hex) return hex;
  const themed = (theme as unknown as Record<string, string | undefined>)[roleFallback];
  return themed ?? theme.primary;
}

export function eventIconFor(slug: string, dbIcon: string): IconName {
  return SLUG_TO_ICON[slug] ?? DB_ICON_TO_ICON[dbIcon] ?? "calendar";
}

export const FALLBACK_TYPE_LABEL: Record<string, { de: string; en: string }> = {
  schule: { de: "Schule", en: "School" },
  arzt: { de: "Arzt", en: "Doctor" },
  sport: { de: "Sport", en: "Sport" },
  training: { de: "Training", en: "Training" },
  ha: { de: "Hausaufgaben", en: "Tasks" },
  hausaufgaben: { de: "Hausaufgaben", en: "Tasks" },
  family: { de: "Familie", en: "Family" },
  meal: { de: "Essen", en: "Meal" },
};
